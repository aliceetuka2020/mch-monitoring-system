#!/usr/bin/env python3
"""Analyze association between perceived-ease and intention scale scores."""

import argparse
import csv
import json
import math
import random
import sys
from pathlib import Path


PEOU_ITEMS = (
    "peou_item_1",
    "peou_item_2",
    "peou_item_3",
    "peou_item_4",
)
INTENTION_ITEMS = (
    "intention_item_1",
    "intention_item_2",
    "intention_item_3",
)
EXPECTED_FIELDS = {"participant_code", *PEOU_ITEMS, *INTENTION_ITEMS}
ALPHA = 0.05
LIKERT_MIN = 1
LIKERT_MAX = 5
BOOTSTRAP_RESAMPLES = 5000
BOOTSTRAP_SEED = 20261016


class NoStudyDataError(ValueError):
    """Raised when a valid header-only template has no questionnaire responses."""


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
            for item in (*PEOU_ITEMS, *INTENTION_ITEMS):
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

            peou_score = sum(scores[item] for item in PEOU_ITEMS) / len(PEOU_ITEMS)
            intention_score = sum(scores[item] for item in INTENTION_ITEMS) / len(INTENTION_ITEMS)
            if not math.isfinite(peou_score) or not math.isfinite(intention_score):
                raise ValueError(f"Line {line_number}: scale scores must be finite.")
            rows.append(
                {
                    "participant_code": participant,
                    "peou_score": peou_score,
                    "intention_score": intention_score,
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


def _spearman_bootstrap_interval(x_values, y_values, resamples=BOOTSTRAP_RESAMPLES, seed=BOOTSTRAP_SEED):
    from scipy import stats

    rng = random.Random(seed)
    sample_size = len(x_values)
    estimates = []
    for _ in range(resamples):
        indexes = [rng.randrange(sample_size) for _ in range(sample_size)]
        x_sample = [x_values[index] for index in indexes]
        y_sample = [y_values[index] for index in indexes]
        if len(set(x_sample)) < 2 or len(set(y_sample)) < 2:
            continue
        estimates.append(float(stats.spearmanr(x_sample, y_sample).statistic))
    if len(estimates) < resamples * 0.5:
        return None, len(estimates)
    estimates.sort()
    return [_percentile(estimates, 0.025), _percentile(estimates, 0.975)], len(estimates)


def analyze(rows, method="auto"):
    from scipy import stats

    if method not in {"auto", "pearson", "spearman"}:
        raise ValueError("method must be auto, pearson, or spearman")
    if len(rows) < 2:
        raise ValueError("at least two participants are required to calculate correlation")

    x_values = [row["peou_score"] for row in rows]
    y_values = [row["intention_score"] for row in rows]
    if len(set(x_values)) < 2 or len(set(y_values)) < 2:
        raise ValueError("correlation is undefined when either scale has zero variance")

    normality = None
    selected_method = method
    selection_reason = "Explicitly selected by the caller."
    if method == "auto":
        if len(rows) >= 3:
            peou_test = stats.shapiro(x_values)
            intention_test = stats.shapiro(y_values)
            normality = {
                "method": "Shapiro-Wilk screen on each composite score",
                "peou_p_value": float(peou_test.pvalue),
                "intention_p_value": float(intention_test.pvalue),
                "interpretation": "marginal screen only; does not establish bivariate normality",
            }
            if peou_test.pvalue >= ALPHA and intention_test.pvalue >= ALPHA:
                selected_method = "pearson"
                selection_reason = (
                    "Both marginal Shapiro-Wilk screens were at least alpha; assess scatterplot, "
                    "linearity, outliers, independence, and bivariate-normality plausibility before interpretation."
                )
            else:
                selected_method = "spearman"
                selection_reason = (
                    "At least one marginal Shapiro-Wilk screen was below alpha; selected rank correlation."
                )
        else:
            selected_method = "spearman"
            selection_reason = "Fewer than three participants; normality was not screened."

    if selected_method == "pearson":
        correlation = stats.pearsonr(x_values, y_values)
        coefficient = float(correlation.statistic)
        p_value = float(correlation.pvalue)
        confidence_interval = [float(value) for value in correlation.confidence_interval(0.95)]
        ci_method = "Fisher-z 95% confidence interval"
    else:
        correlation = stats.spearmanr(x_values, y_values)
        coefficient = float(correlation.statistic)
        p_value = float(correlation.pvalue)
        confidence_interval, successful_resamples = _spearman_bootstrap_interval(
            x_values, y_values
        )
        ci_method = "paired-participant percentile bootstrap 95% confidence interval"

    if confidence_interval is None:
        raise ValueError(
            f"could not calculate a stable Spearman bootstrap interval ({successful_resamples} usable resamples)"
        )
    return {
        "status": "ANALYZED",
        "participants": len(rows),
        "peou_items": list(PEOU_ITEMS),
        "intention_items": list(INTENTION_ITEMS),
        "scale_score": "arithmetic mean of all completed, consistently keyed items",
        "method": "Pearson product-moment" if selected_method == "pearson" else "Spearman rank",
        "method_selection_reason": selection_reason,
        "normality_screen": normality,
        "coefficient": coefficient,
        "p_value_two_sided": p_value,
        "alpha": ALPHA,
        "confidence_interval_95": confidence_interval,
        "confidence_interval_method": ci_method,
        "statistical_decision": (
            "Evidence against zero association at alpha=0.05 under the selected method's assumptions."
            if p_value < ALPHA
            else "Do not reject zero association at alpha=0.05; this does not establish no association."
        ),
        "interpretation_note": "Association does not establish causation or validate the scale.",
        "study_conclusion": None,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--method", choices=("auto", "pearson", "spearman"), default="auto")
    args = parser.parse_args(argv)
    try:
        observations = load_observations(args.input)
        print(json.dumps(analyze(observations, method=args.method), indent=2, allow_nan=False))
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
                    "message": "Install evaluation/HT-10-H010/requirements.txt before analysis.",
                },
                indent=2,
            )
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
