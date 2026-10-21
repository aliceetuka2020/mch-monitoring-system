#!/usr/bin/env python3
"""Analyze paired, pseudonymous ANC completeness observations."""

import argparse
import csv
import json
import math
from pathlib import Path


FIELDS = (
    "visit_date",
    "gestational_age",
    "weight",
    "blood_pressure",
    "symptoms",
    "clinical_notes",
    "laboratory_info",
    "foetal_assessment",
    "medications_supplements",
    "health_education",
    "next_visit",
)
PERIODS = ("baseline", "followup")
FIELD_COLUMNS = tuple(
    f"{period}_{field}" for field in FIELDS for period in PERIODS
)
DATE_COLUMNS = ("baseline_date", "followup_date")
HISTORY_COLUMNS = ("baseline_history_accessible", "followup_history_accessible")
REQUIRED_COLUMNS = (
    "record_code",
    *DATE_COLUMNS,
    *FIELD_COLUMNS,
    *HISTORY_COLUMNS,
)


class NoStudyDataError(ValueError):
    """Raised when a valid template contains no observations."""


def exact_mcnemar_p_value(baseline_only, followup_only):
    """Return a two-sided exact binomial p-value for paired discordances."""
    discordant = baseline_only + followup_only
    if discordant == 0:
        return 1.0
    lower_tail = sum(math.comb(discordant, k) for k in range(min(baseline_only, followup_only) + 1))
    return min(1.0, 2 * lower_tail / (2**discordant))


def _validate_date(value, column, row_number):
    try:
        parsed = __import__("datetime").date.fromisoformat(value)
    except ValueError as error:
        raise ValueError(
            f"row {row_number}: {column} must be an ISO date (YYYY-MM-DD)"
        ) from error
    return parsed


def _validate_binary(value, column, row_number):
    if value not in {"0", "1"}:
        raise ValueError(f"row {row_number}: {column} must be 0 or 1")
    return int(value)


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
        raise NoStudyDataError("NO_STUDY_DATA: no ANC observations were supplied")

    seen_codes = set()
    for row_number, row in enumerate(rows, start=2):
        code = row["record_code"].strip()
        if not code:
            raise ValueError(f"row {row_number}: record_code is required")
        if code in seen_codes:
            raise ValueError(f"row {row_number}: duplicate record_code {code!r}")
        seen_codes.add(code)
        row["record_code"] = code

        baseline_date = _validate_date(row["baseline_date"], "baseline_date", row_number)
        followup_date = _validate_date(row["followup_date"], "followup_date", row_number)
        if followup_date <= baseline_date:
            raise ValueError(f"row {row_number}: followup_date must be after baseline_date")

        for field in FIELDS:
            for period in PERIODS:
                column = f"{period}_{field}"
                value = row[column].strip().upper()
                if value not in {"0", "1", "NA"}:
                    raise ValueError(f"row {row_number}: {column} must be 0, 1, or NA")
                row[column] = value

        for column in HISTORY_COLUMNS:
            row[column] = str(_validate_binary(row[column].strip(), column, row_number))

    return rows


def _paired_binary(rows, baseline_column, followup_column):
    baseline_only = sum(
        row[baseline_column] == "1" and row[followup_column] == "0" for row in rows
    )
    followup_only = sum(
        row[baseline_column] == "0" and row[followup_column] == "1" for row in rows
    )
    return {
        "paired_records": len(rows),
        "baseline_only": baseline_only,
        "followup_only": followup_only,
        "p_value": exact_mcnemar_p_value(baseline_only, followup_only),
    }


def analyze(rows, alpha=0.05):
    if not rows:
        raise NoStudyDataError("NO_STUDY_DATA: no ANC observations were supplied")

    fields = {}
    pooled = {}
    for field in FIELDS:
        fields[field] = {}
        for period in PERIODS:
            values = [row[f"{period}_{field}"] for row in rows]
            eligible = [value for value in values if value != "NA"]
            completed = sum(value == "1" for value in eligible)
            fields[field][period] = {
                "completed": completed,
                "eligible": len(eligible),
                "rate": completed / len(eligible) if eligible else None,
            }

    for period in PERIODS:
        completed = sum(
            row[f"{period}_{field}"] == "1"
            for row in rows
            for field in FIELDS
            if row[f"{period}_{field}"] != "NA"
        )
        eligible = sum(
            row[f"{period}_{field}"] != "NA" for row in rows for field in FIELDS
        )
        pooled[period] = {
            "completed": completed,
            "eligible": eligible,
            "rate": completed / eligible if eligible else None,
        }

    complete_pairs = []
    for row in rows:
        common_fields = [
            field
            for field in FIELDS
            if row[f"baseline_{field}"] != "NA"
            and row[f"followup_{field}"] != "NA"
        ]
        if common_fields:
            complete_pairs.append(
                {
                    "baseline_complete": all(
                        row[f"baseline_{field}"] == "1" for field in common_fields
                    ),
                    "followup_complete": all(
                        row[f"followup_{field}"] == "1" for field in common_fields
                    ),
                }
            )

    baseline_only = sum(
        pair["baseline_complete"] and not pair["followup_complete"]
        for pair in complete_pairs
    )
    followup_only = sum(
        not pair["baseline_complete"] and pair["followup_complete"]
        for pair in complete_pairs
    )
    checklist_completeness = {
        "paired_records": len(complete_pairs),
        "baseline_complete": sum(pair["baseline_complete"] for pair in complete_pairs),
        "followup_complete": sum(pair["followup_complete"] for pair in complete_pairs),
        "baseline_only": baseline_only,
        "followup_only": followup_only,
        "p_value": exact_mcnemar_p_value(baseline_only, followup_only),
    }

    history = _paired_binary(
        rows, "baseline_history_accessible", "followup_history_accessible"
    )
    for outcome in (checklist_completeness, history):
        outcome["significant_at_alpha"] = outcome["p_value"] < alpha

    return {
        "status": "ANALYZED",
        "study_data_present": True,
        "alpha": alpha,
        "record_count": len(rows),
        "field_completion": fields,
        "pooled_field_completion": pooled,
        "paired_checklist_completeness": checklist_completeness,
        "paired_history_accessibility": history,
        "interpretation_note": (
            "Observational paired differences do not establish causality or clinical benefit."
        ),
    }


def main(argv=None):
    default_input = Path(__file__).with_name("anc-completeness-template.csv")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=default_input)
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
