#!/usr/bin/env python3
"""Analyze post-pilot perceived usefulness and intention scale scores."""

import argparse
import csv
import json
import math
import random
import sys
from pathlib import Path


PU_ITEMS = ("pu_item_1", "pu_item_2", "pu_item_3", "pu_item_4")
INTENTION_ITEMS = ("intention_item_1", "intention_item_2", "intention_item_3")
EXPECTED_FIELDS = {"participant_code", *PU_ITEMS, *INTENTION_ITEMS}
ALPHA = 0.05
LIKERT_MIN = 1
LIKERT_MAX = 5
BOOTSTRAP_RESAMPLES = 5000
BOOTSTRAP_SEED = 20261016


class NoStudyDataError(ValueError):
    """Raised when a valid header-only template contains no responses."""


def load_observations(csv_path):
    rows = []
    seen = set()
    with Path(csv_path).open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or set(reader.fieldnames) != EXPECTED_FIELDS:
            raise ValueError(
                "CSV columns must be exactly: " + ", ".join(sorted(EXPECTED_FIELDS))
            )
        for line_number, row in enumerate(reader, start=2):
            participant = (row.get("participant_code") or "").strip()
            if not participant:
                raise ValueError(f"Line {line_number}: participant_code is required.")
            if participant in seen:
                raise ValueError(f"Line {line_number}: duplicate participant_code {participant!r}.")
            seen.add(participant)

            scores = {}
            for item in (*PU_ITEMS, *INTENTION_ITEMS):
                value = (row.get(item) or "").strip()
                try:
                    score = int(value)
                except (TypeError, ValueError) as error:
                    raise ValueError(
                        f"Line {line_number}: {item} must be an integer from {LIKERT_MIN} to {LIKERT_MAX}."
                    ) from error
                if str(score) != value or not LIKERT_MIN <= score <= LIKERT_MAX:
                    raise ValueError(
                        f"Line {line_number}: {item} must be an integer from {LIKERT_MIN} to {LIKERT_MAX}."
                    )
                scores[item] = score

            rows.append(
                {
                    "participant_code": participant,
                    "pu_score": sum(scores[item] for item in PU_ITEMS) / len(PU_ITEMS),
                    "intention_score": sum(scores[item] for item in INTENTION_ITEMS)
                    / len(INTENTION_ITEMS),
                }
            )

    if not rows:
        raise NoStudyDataError("NO_STUDY_DATA: CSV contains headers but no responses.")
    return rows


def _percentile(sorted_values, probability):
    position = (len(sorted_values) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    fraction = position - lower
    return sorted_values[lower] + fraction * (sorted_values[upper] - sorted_values[lower])


def _spearman_bootstrap_interval(pu_scores, intention_scores):
    from scipy import stats

    rng = random.Random(BOOTSTRAP_SEED)
    size = len(pu_scores)
    coefficients = []
    for _ in range(BOOTSTRAP_RESAMPLES):
        indexes = [rng.randrange(size) for _ in range(size)]
        pu_sample = [pu_scores[index] for index in indexes]
        intention_sample = [intention_scores[index] for index in indexes]
        if len(set(pu_sample)) < 2 or len(set(intention_sample)) < 2:
            continue
        coefficients.append(float(stats.spearmanr(pu_sample, intention_sample).statistic))
    if len(coefficients) < BOOTSTRAP_RESAMPLES * 0.5:
        raise ValueError("too few non-constant bootstrap samples for a stable Spearman interval")
    coefficients.sort()
    return [
        _percentile(coefficients, 0.025),
        _percentile(coefficients, 0.975),
    ]


def _optional_regression(pu_scores, intention_scores):
    from scipy import stats

    if len(pu_scores) < 3:
        raise ValueError("optional regression requires at least three participants")
    model = stats.linregress(pu_scores, intention_scores)
    degrees_of_freedom = len(pu_scores) - 2
    critical_value = float(stats.t.ppf(1 - ALPHA / 2, degrees_of_freedom))
    margin = critical_value * float(model.stderr)
    return {
        "model": "unadjusted ordinary least squares: intention composite ~ usefulness composite",
        "participants": len(pu_scores),
        "intercept": float(model.intercept),
        "slope": float(model.slope),
        "r_squared": float(model.rvalue**2),
        "slope_p_value_two_sided": float(model.pvalue),
        "slope_confidence_interval_95": [
            float(model.slope - margin),
            float(model.slope + margin),
        ],
        "alpha": ALPHA,
        "diagnostics_note": (
            "Inspect linearity, residual normality, homoscedasticity, influential observations, "
            "and independence before interpreting."
        ),
    }


def analyze(rows, method="auto", regression=False):
    from scipy import stats

    if method not in {"auto", "pearson", "spearman"}:
        raise ValueError("method must be auto, pearson, or spearman")
    if len(rows) < 2:
        raise ValueError("at least two participants are required to calculate correlation")

    pu_scores = [row["pu_score"] for row in rows]
    intention_scores = [row["intention_score"] for row in rows]
    if len(set(pu_scores)) < 2 or len(set(intention_scores)) < 2:
        raise ValueError("correlation is undefined when either scale has zero variance")

    selected_method = method
    normality_screen = None
    selection_reason = "Explicitly selected by the caller."
    if method == "auto":
        if len(rows) >= 3:
            pu_normality = stats.shapiro(pu_scores)
            intention_normality = stats.shapiro(intention_scores)
            normality_screen = {
                "method": "Shapiro-Wilk screen on each composite score",
                "usefulness_p_value": float(pu_normality.pvalue),
                "intention_p_value": float(intention_normality.pvalue),
                "interpretation": "marginal screens only; they do not establish bivariate normality",
            }
            if pu_normality.pvalue >= ALPHA and intention_normality.pvalue >= ALPHA:
                selected_method = "pearson"
                selection_reason = (
                    "Both marginal screens were at least alpha; inspect linearity, outliers, "
                    "independence, and bivariate-normality plausibility."
                )
            else:
                selected_method = "spearman"
                selection_reason = "At least one marginal screen was below alpha."
        else:
            selected_method = "spearman"
            selection_reason = "Fewer than three participants; normality was not screened."

    if selected_method == "pearson":
        correlation = stats.pearsonr(pu_scores, intention_scores)
        coefficient = float(correlation.statistic)
        p_value = float(correlation.pvalue)
        confidence_interval = [
            float(value) for value in correlation.confidence_interval(1 - ALPHA)
        ]
        interval_method = "Fisher-z 95% confidence interval"
    else:
        correlation = stats.spearmanr(pu_scores, intention_scores)
        coefficient = float(correlation.statistic)
        p_value = float(correlation.pvalue)
        confidence_interval = _spearman_bootstrap_interval(pu_scores, intention_scores)
        interval_method = "paired-participant percentile bootstrap 95% confidence interval"

    result = {
        "status": "ANALYZED",
        "participants": len(rows),
        "usefulness_items": list(PU_ITEMS),
        "intention_items": list(INTENTION_ITEMS),
        "scale_score": "arithmetic mean of complete, consistently keyed items",
        "method": "Pearson product-moment" if selected_method == "pearson" else "Spearman rank",
        "method_selection_reason": selection_reason,
        "normality_screen": normality_screen,
        "coefficient": coefficient,
        "p_value_two_sided": p_value,
        "alpha": ALPHA,
        "confidence_interval_95": confidence_interval,
        "confidence_interval_method": interval_method,
        "statistical_decision": (
            "Evidence against zero association at alpha=0.05 under the selected method's assumptions."
            if p_value < ALPHA
            else "Do not reject zero association at alpha=0.05; this does not establish no association."
        ),
        "interpretation_note": "Association does not establish causation or validate the instrument.",
        "study_conclusion": None,
    }
    if regression:
        result["optional_regression"] = _optional_regression(pu_scores, intention_scores)
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--method", choices=("auto", "pearson", "spearman"), default="auto")
    parser.add_argument(
        "--regression",
        action="store_true",
        help="Run the optional unadjusted linear regression when it was prespecified.",
    )
    args = parser.parse_args(argv)
    try:
        observations = load_observations(args.input)
        print(
            json.dumps(
                analyze(observations, method=args.method, regression=args.regression),
                indent=2,
                allow_nan=False,
            )
        )
    except NoStudyDataError as error:
        print(json.dumps({"status": "NO_STUDY_DATA", "message": str(error)}, indent=2))
        return 2
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "INVALID_INPUT", "message": str(error)}, indent=2))
        return 2
    except ImportError:
        print(
            json.dumps(
                {
                    "status": "MISSING_DEPENDENCY",
                    "message": "Install evaluation/HT-11-H011/requirements.txt before analysis.",
                },
                indent=2,
            )
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
