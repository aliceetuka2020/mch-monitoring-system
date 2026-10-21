#!/usr/bin/env python3
"""Compare paired system immunization flags with an independent reference."""

import argparse
import csv
import json
import math
from pathlib import Path


REQUIRED_COLUMNS = (
    "evaluation_code",
    "child_code",
    "vaccine_name",
    "dose",
    "as_of_date",
    "schedule_rule_version",
    "reference_due_or_overdue",
    "system_due_or_overdue",
)


class NoStudyDataError(ValueError):
    """Raised when a valid template contains no evaluation observations."""


def exact_mcnemar_p_value(reference_positive_only, system_positive_only):
    """Return the two-sided exact binomial p-value for paired flag discordance."""
    discordant = reference_positive_only + system_positive_only
    if discordant == 0:
        return 1.0
    lower_tail = sum(
        math.comb(discordant, k)
        for k in range(min(reference_positive_only, system_positive_only) + 1)
    )
    return min(1.0, 2 * lower_tail / (2**discordant))


def load_observations(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None:
            raise ValueError("input CSV must contain a header row")
        missing = [column for column in REQUIRED_COLUMNS if column not in reader.fieldnames]
        if missing:
            raise ValueError(f"input CSV is missing columns: {', '.join(missing)}")
        rows = list(reader)

    if not rows:
        raise NoStudyDataError("NO_STUDY_DATA: no immunization observations were supplied")

    seen_evaluations = set()
    seen_children = set()
    for row_number, row in enumerate(rows, start=2):
        for column in ("evaluation_code", "child_code", "vaccine_name", "dose", "schedule_rule_version"):
            row[column] = row[column].strip()
            if not row[column]:
                raise ValueError(f"row {row_number}: {column} is required")

        if row["evaluation_code"] in seen_evaluations:
            raise ValueError(
                f"row {row_number}: duplicate evaluation_code {row['evaluation_code']!r}"
            )
        seen_evaluations.add(row["evaluation_code"])
        if row["child_code"] in seen_children:
            raise ValueError(f"row {row_number}: duplicate child_code {row['child_code']!r}")
        seen_children.add(row["child_code"])

        try:
            parsed_date = __import__("datetime").date.fromisoformat(row["as_of_date"].strip())
        except ValueError as error:
            raise ValueError(
                f"row {row_number}: as_of_date must be an ISO date (YYYY-MM-DD)"
            ) from error
        row["as_of_date"] = parsed_date.isoformat()

        for column in ("reference_due_or_overdue", "system_due_or_overdue"):
            value = row[column].strip()
            if value not in {"0", "1"}:
                raise ValueError(f"row {row_number}: {column} must be 0 or 1")
            row[column] = int(value)

    as_of_dates = {row["as_of_date"] for row in rows}
    rule_versions = {row["schedule_rule_version"] for row in rows}
    if len(as_of_dates) != 1:
        raise ValueError("all observations must use the same as_of_date")
    if len(rule_versions) != 1:
        raise ValueError("all observations must use the same schedule_rule_version")

    return rows


def analyze(rows, alpha=0.05):
    if not rows:
        raise NoStudyDataError("NO_STUDY_DATA: no immunization observations were supplied")

    tp = sum(row["reference_due_or_overdue"] == 1 and row["system_due_or_overdue"] == 1 for row in rows)
    fn = sum(row["reference_due_or_overdue"] == 1 and row["system_due_or_overdue"] == 0 for row in rows)
    fp = sum(row["reference_due_or_overdue"] == 0 and row["system_due_or_overdue"] == 1 for row in rows)
    tn = sum(row["reference_due_or_overdue"] == 0 and row["system_due_or_overdue"] == 0 for row in rows)

    def ratio(numerator, denominator):
        return numerator / denominator if denominator else None

    p_value = exact_mcnemar_p_value(fn, fp)
    return {
        "status": "ANALYZED",
        "observation_count": len(rows),
        "as_of_date": rows[0]["as_of_date"],
        "schedule_rule_version": rows[0]["schedule_rule_version"],
        "alpha": alpha,
        "confusion_matrix": {
            "true_positive": tp,
            "false_negative": fn,
            "false_positive": fp,
            "true_negative": tn,
        },
        "sensitivity": {"numerator": tp, "denominator": tp + fn, "rate": ratio(tp, tp + fn)},
        "specificity": {"numerator": tn, "denominator": tn + fp, "rate": ratio(tn, tn + fp)},
        "precision": {"numerator": tp, "denominator": tp + fp, "rate": ratio(tp, tp + fp)},
        "missed_flags": fn,
        "incorrect_flags": fp,
        "paired_flag_test": {
            "method": "two-sided exact McNemar/binomial",
            "reference_positive_system_negative": fn,
            "reference_negative_system_positive": fp,
            "p_value": p_value,
            "significant_at_alpha": p_value < alpha,
            "interpretation": "Tests marginal symmetry of paired flags; it is not a clinical acceptability test.",
        },
        "study_conclusion": None,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        result = analyze(load_observations(args.input))
    except NoStudyDataError as error:
        print(json.dumps({"status": "NO_STUDY_DATA", "message": str(error)}))
        return 2
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
