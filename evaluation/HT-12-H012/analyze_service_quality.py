#!/usr/bin/env python3
"""Analyze predeclared service-quality indicators using the specified study design."""

import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path


PLAN_FIELDS = {
    "indicator_code",
    "label",
    "operational_definition",
    "measurement_source",
    "denominator",
    "indicator_type",
    "unit",
    "expected_direction",
    "minimum",
    "maximum",
}
OBSERVATION_FIELDS = {"participant_code", "timepoint", "indicator_code", "value"}
ALPHA = 0.05
TIMEPOINTS = {"baseline", "post"}


class NoStudyDataError(ValueError):
    """Raised when the observation file contains only its header."""


def _read_csv(path, expected_fields, description):
    with Path(path).open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or set(reader.fieldnames) != expected_fields:
            raise ValueError(
                f"{description} columns must be exactly: "
                + ", ".join(sorted(expected_fields))
            )
        return list(reader)


def _optional_bound(value, field, line_number):
    value = (value or "").strip()
    if not value:
        return None
    try:
        number = float(value)
    except ValueError as error:
        raise ValueError(f"Plan line {line_number}: {field} must be numeric or blank.") from error
    if not math.isfinite(number):
        raise ValueError(f"Plan line {line_number}: {field} must be finite.")
    return number


def load_plan(csv_path):
    rows = _read_csv(csv_path, PLAN_FIELDS, "Plan")
    plan = {}
    for line_number, row in enumerate(rows, start=2):
        code = (row.get("indicator_code") or "").strip()
        label = (row.get("label") or "").strip()
        operational_definition = (row.get("operational_definition") or "").strip()
        measurement_source = (row.get("measurement_source") or "").strip()
        denominator = (row.get("denominator") or "").strip()
        indicator_type = (row.get("indicator_type") or "").strip().lower()
        unit = (row.get("unit") or "").strip()
        direction = (row.get("expected_direction") or "").strip().lower()
        if not all((code, label, operational_definition, measurement_source, denominator, unit)):
            raise ValueError(
                f"Plan line {line_number}: indicator_code, label, operational_definition, "
                "measurement_source, denominator, and unit are required."
            )
        if code in plan:
            raise ValueError(f"Plan line {line_number}: duplicate indicator_code {code!r}.")
        if indicator_type not in {"continuous", "ordinal", "binary"}:
            raise ValueError(
                f"Plan line {line_number}: indicator_type must be continuous, ordinal, or binary."
            )
        if direction not in {"higher", "lower", "neutral"}:
            raise ValueError(
                f"Plan line {line_number}: expected_direction must be higher, lower, or neutral."
            )
        minimum = _optional_bound(row.get("minimum"), "minimum", line_number)
        maximum = _optional_bound(row.get("maximum"), "maximum", line_number)
        if indicator_type == "binary" and (minimum != 0 or maximum != 1):
            raise ValueError(
                f"Plan line {line_number}: binary indicators must declare minimum=0 and maximum=1."
            )
        if indicator_type == "ordinal":
            if minimum is None or maximum is None or minimum >= maximum:
                raise ValueError(
                    f"Plan line {line_number}: ordinal indicators require minimum < maximum."
                )
            if minimum.is_integer() is False or maximum.is_integer() is False:
                raise ValueError(
                    f"Plan line {line_number}: ordinal bounds must be integers."
                )
        if minimum is not None and maximum is not None and minimum >= maximum:
            raise ValueError(f"Plan line {line_number}: minimum must be less than maximum.")
        plan[code] = {
            "indicator_code": code,
            "label": label,
            "operational_definition": operational_definition,
            "measurement_source": measurement_source,
            "denominator": denominator,
            "indicator_type": indicator_type,
            "unit": unit,
            "expected_direction": direction,
            "minimum": minimum,
            "maximum": maximum,
        }
    if not plan:
        raise ValueError("Indicator plan must contain at least one indicator.")
    return plan


def load_observations(csv_path, plan, design):
    if design not in {"paired", "independent"}:
        raise ValueError("design must be paired or independent")
    rows = _read_csv(csv_path, OBSERVATION_FIELDS, "Observation")
    observations = []
    seen = set()
    participants_by_timepoint = defaultdict(set)
    participants_by_indicator_timepoint = defaultdict(set)

    for line_number, row in enumerate(rows, start=2):
        participant = (row.get("participant_code") or "").strip()
        timepoint = (row.get("timepoint") or "").strip().lower()
        indicator = (row.get("indicator_code") or "").strip()
        if not participant or not indicator:
            raise ValueError(
                f"Line {line_number}: participant_code and indicator_code are required."
            )
        if timepoint not in TIMEPOINTS:
            raise ValueError(f"Line {line_number}: timepoint must be baseline or post.")
        if indicator not in plan:
            raise ValueError(
                f"Line {line_number}: indicator_code {indicator!r} is absent from the locked plan."
            )
        key = (participant, timepoint, indicator)
        if key in seen:
            raise ValueError(
                f"Line {line_number}: duplicate unit/timepoint/indicator observation {key!r}."
            )
        raw_value = (row.get("value") or "").strip()
        try:
            value = float(raw_value)
        except ValueError as error:
            raise ValueError(f"Line {line_number}: value must be numeric.") from error
        specification = plan[indicator]
        if not math.isfinite(value):
            raise ValueError(f"Line {line_number}: value must be finite.")
        minimum, maximum = specification["minimum"], specification["maximum"]
        if minimum is not None and value < minimum or maximum is not None and value > maximum:
            raise ValueError(
                f"Line {line_number}: value is outside the plan bounds for {indicator!r}."
            )
        if specification["indicator_type"] == "binary" and value not in {0, 1}:
            raise ValueError(f"Line {line_number}: binary indicator values must be 0 or 1.")
        if specification["indicator_type"] == "ordinal" and not value.is_integer():
            raise ValueError(f"Line {line_number}: ordinal indicator values must be integers.")
        seen.add(key)
        participants_by_timepoint[timepoint].add(participant)
        participants_by_indicator_timepoint[(indicator, timepoint)].add(participant)
        observations.append(
            {
                "participant_code": participant,
                "timepoint": timepoint,
                "indicator_code": indicator,
                "value": value,
            }
        )

    if not observations:
        raise NoStudyDataError("NO_STUDY_DATA: CSV contains headers but no observations.")
    if participants_by_timepoint.keys() != TIMEPOINTS:
        raise ValueError("Observations must include both baseline and post timepoints.")
    if design == "paired" and participants_by_timepoint["baseline"] != participants_by_timepoint["post"]:
        raise ValueError("Paired design requires the same participant_code set at both timepoints.")
    if design == "independent" and participants_by_timepoint["baseline"] & participants_by_timepoint["post"]:
        raise ValueError("Independent design must not reuse participant_code across timepoints.")

    for indicator in plan:
        indicator_sets = {
            timepoint: participants_by_indicator_timepoint[(indicator, timepoint)]
            for timepoint in TIMEPOINTS
        }
        if not indicator_sets["baseline"] or not indicator_sets["post"]:
            raise ValueError(
                f"Indicator {indicator!r} must have observations at both timepoints."
            )
        if indicator_sets != {
            timepoint: participants_by_timepoint[timepoint]
            for timepoint in TIMEPOINTS
        }:
            raise ValueError(
                f"Indicator {indicator!r} must have a complete observation for every unit at both timepoints."
            )
    return observations


def _summary(values):
    from scipy import stats

    return {
        "n": len(values),
        "mean": float(sum(values) / len(values)),
        "median": float(stats.scoreatpercentile(values, 50)),
    }


def _normality_screen(values):
    from scipy import stats

    if len(values) < 3 or len(set(values)) < 2:
        return None
    test = stats.shapiro(values)
    return {"method": "Shapiro-Wilk screen", "statistic": float(test.statistic), "p_value": float(test.pvalue)}


def _paired_test(specification, baseline, post):
    from scipy import stats

    differences = [after - before for before, after in zip(baseline, post)]
    count = len(differences)
    if count < 2:
        return None, None, None, "At least two paired units are required for an inferential test."
    kind = specification["indicator_type"]
    if kind == "binary":
        before_yes = sum(value == 1 for value in baseline)
        after_yes = sum(value == 1 for value in post)
        post_only = sum(before == 0 and after == 1 for before, after in zip(baseline, post))
        baseline_only = sum(before == 1 and after == 0 for before, after in zip(baseline, post))
        discordant = post_only + baseline_only
        p_value = float(stats.binomtest(post_only, discordant, 0.5).pvalue) if discordant else 1.0
        return "Exact McNemar test (two-sided)", float(post_only), p_value, None
    if kind == "ordinal":
        nonzero = [value for value in differences if value != 0]
        positive = sum(value > 0 for value in nonzero)
        p_value = float(stats.binomtest(positive, len(nonzero), 0.5).pvalue) if nonzero else 1.0
        return "Exact sign test (two-sided)", float(positive), p_value, None

    screen = _normality_screen(differences)
    if screen is not None and screen["p_value"] >= ALPHA:
        test = stats.ttest_rel(post, baseline, alternative="two-sided")
        return "Paired t-test (two-sided)", float(test.statistic), float(test.pvalue), screen
    if all(value == 0 for value in differences):
        return "Wilcoxon signed-rank test (two-sided)", 0.0, 1.0, screen
    test = stats.wilcoxon(differences, alternative="two-sided", zero_method="wilcox", method="auto")
    return "Wilcoxon signed-rank test (two-sided)", float(test.statistic), float(test.pvalue), screen


def _independent_test(specification, baseline, post):
    from scipy import stats

    if len(baseline) < 2 or len(post) < 2:
        return None, None, None, None
    kind = specification["indicator_type"]
    if kind == "binary":
        before_yes = sum(value == 1 for value in baseline)
        after_yes = sum(value == 1 for value in post)
        table = [[before_yes, len(baseline) - before_yes], [after_yes, len(post) - after_yes]]
        test = stats.fisher_exact(table, alternative="two-sided")
        return "Fisher exact test (two-sided)", float(test.statistic), float(test.pvalue), None
    if kind == "ordinal":
        test = stats.mannwhitneyu(post, baseline, alternative="two-sided", method="auto")
        return "Mann-Whitney U test (two-sided)", float(test.statistic), float(test.pvalue), None

    baseline_screen = _normality_screen(baseline)
    post_screen = _normality_screen(post)
    screen = {
        "method": "Shapiro-Wilk screens by timepoint",
        "baseline_p_value": baseline_screen["p_value"] if baseline_screen else None,
        "post_p_value": post_screen["p_value"] if post_screen else None,
        "interpretation": "screens only; a non-significant result does not prove normality",
    }
    if baseline_screen and post_screen and all(
        screen[key] >= ALPHA for key in ("baseline_p_value", "post_p_value")
    ):
        test = stats.ttest_ind(post, baseline, equal_var=False, alternative="two-sided")
        return "Welch independent-samples t-test (two-sided)", float(test.statistic), float(test.pvalue), screen
    test = stats.mannwhitneyu(post, baseline, alternative="two-sided", method="auto")
    return "Mann-Whitney U test (two-sided)", float(test.statistic), float(test.pvalue), screen


def _holm_adjust(results):
    tested = sorted(
        (result for result in results if result["p_value_two_sided"] is not None),
        key=lambda result: result["p_value_two_sided"],
    )
    total = len(tested)
    adjusted = 0.0
    for index, result in enumerate(tested):
        adjusted = max(adjusted, min(1.0, (total - index) * result["p_value_two_sided"]))
        result["p_value_holm_adjusted"] = adjusted
    for result in results:
        if result["p_value_two_sided"] is None:
            result["p_value_holm_adjusted"] = None


def analyze(observations, plan, design):
    from scipy import stats

    if design not in {"paired", "independent"}:
        raise ValueError("design must be paired or independent")
    by_indicator = defaultdict(lambda: defaultdict(dict))
    for row in observations:
        by_indicator[row["indicator_code"]][row["timepoint"]][row["participant_code"]] = row["value"]

    results = []
    for code, specification in plan.items():
        groups = by_indicator[code]
        baseline_values = list(groups["baseline"].values())
        post_values = list(groups["post"].values())
        if design == "paired":
            common = sorted(set(groups["baseline"]) & set(groups["post"]))
            baseline_values = [groups["baseline"][participant] for participant in common]
            post_values = [groups["post"][participant] for participant in common]
            test, statistic, p_value, screen = _paired_test(specification, baseline_values, post_values)
        else:
            test, statistic, p_value, screen = _independent_test(specification, baseline_values, post_values)

        mean_difference = float(sum(post_values) / len(post_values) - sum(baseline_values) / len(baseline_values))
        median_difference = float(
            stats.scoreatpercentile(post_values, 50) - stats.scoreatpercentile(baseline_values, 50)
        )
        direction = specification["expected_direction"]
        if direction == "higher":
            if mean_difference > 0:
                change_interpretation = "Increase matches the prespecified improvement direction."
            elif mean_difference < 0:
                change_interpretation = "Decrease opposes the prespecified improvement direction."
            else:
                change_interpretation = "No mean change was observed."
        elif direction == "lower":
            if mean_difference < 0:
                change_interpretation = "Decrease matches the prespecified improvement direction."
            elif mean_difference > 0:
                change_interpretation = "Increase opposes the prespecified improvement direction."
            else:
                change_interpretation = "No mean change was observed."
        else:
            change_interpretation = "No improvement direction specified."

        results.append(
            {
                "indicator_code": code,
                "label": specification["label"],
                "operational_definition": specification["operational_definition"],
                "measurement_source": specification["measurement_source"],
                "denominator": specification["denominator"],
                "indicator_type": specification["indicator_type"],
                "unit": specification["unit"],
                "expected_direction": direction,
                "baseline": _summary(baseline_values),
                "post": _summary(post_values),
                "mean_difference_post_minus_baseline": mean_difference,
                "median_difference_post_minus_baseline": median_difference,
                "change_interpretation": change_interpretation,
                "test": test,
                "statistic": statistic,
                "p_value_two_sided": p_value,
                "normality_screen": screen,
                "inference_note": (
                    (
                        "Descriptive only; at least two paired units are required."
                        if design == "paired"
                        else "Descriptive only; at least two independent units per timepoint are required."
                    )
                    if p_value is None
                    else None
                ),
            }
        )
    _holm_adjust(results)
    return {
        "status": "ANALYZED",
        "design": design,
        "alpha": ALPHA,
        "planned_indicators": len(plan),
        "observations": len(observations),
        "hypothesis": {
            "null": "No baseline-to-post difference in the predefined service-quality indicators.",
            "alternative": "At least one predefined service-quality indicator differs.",
        },
        "multiple_testing": "Holm family-wise adjustment across analyzable planned indicators.",
        "causal_interpretation": "Unadjusted pre/post differences do not establish causation or clinical outcome improvement.",
        "results": results,
        "study_conclusion": None,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--plan", required=True, help="Approved indicator plan CSV.")
    parser.add_argument("--input", required=True, help="Approved service-quality observations CSV.")
    parser.add_argument("--design", choices=("paired", "independent"), required=True)
    args = parser.parse_args(argv)
    try:
        plan = load_plan(args.plan)
        observations = load_observations(args.input, plan, args.design)
        print(json.dumps(analyze(observations, plan, args.design), indent=2))
        return 0
    except NoStudyDataError as error:
        print(json.dumps({"status": "NO_STUDY_DATA", "message": str(error)}, indent=2))
        return 2
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "INVALID_INPUT", "message": str(error)}, indent=2))
        return 1


if __name__ == "__main__":
    sys.exit(main())
