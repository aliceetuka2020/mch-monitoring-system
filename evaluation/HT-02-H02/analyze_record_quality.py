#!/usr/bin/env python3
"""Analyze verified-reference field quality and linked system-record duplicates."""

import argparse
import csv
import json
import math
import sys
from collections import Counter, defaultdict
from pathlib import Path


FIELD_COLUMNS = {
    "reference_record_code",
    "field_name",
    "reference_value",
    "system_value",
}
RECORD_COLUMNS = {"reference_record_code", "system_record_code"}
ALPHA = 0.05


class NoStudyDataError(ValueError):
    """Raised when one or both study input files contain no observations."""


def read_csv(path, required_columns, label):
    rows = []
    with Path(path).open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or set(reader.fieldnames) != required_columns:
            raise ValueError(
                f"{label} CSV columns must be exactly: "
                + ", ".join(sorted(required_columns))
            )
        for line_number, row in enumerate(reader, start=2):
            if None in row:
                raise ValueError(f"{label} CSV line {line_number}: too many columns.")
            rows.append(row)
    return rows


def load_study_data(fields_path, records_path):
    field_rows = read_csv(fields_path, FIELD_COLUMNS, "Field comparison")
    record_rows = read_csv(records_path, RECORD_COLUMNS, "System records")
    if not field_rows or not record_rows:
        raise NoStudyDataError(
            "NO_STUDY_DATA: both input CSV files must contain observation rows."
        )

    seen_fields = set()
    field_keys = set()
    for line_number, row in enumerate(field_rows, start=2):
        reference_code = (row.get("reference_record_code") or "").strip()
        field_name = (row.get("field_name") or "").strip()
        if not reference_code or not field_name:
            raise ValueError(
                f"Field comparison CSV line {line_number}: "
                "reference_record_code and field_name are required."
            )
        key = (reference_code, field_name)
        if key in seen_fields:
            raise ValueError(
                f"Field comparison CSV line {line_number}: duplicate record-field pair."
            )
        seen_fields.add(key)
        field_keys.add(reference_code)
        reference_value = (row.get("reference_value") or "").strip()
        system_value = (row.get("system_value") or "").strip()
        row["reference_record_code"] = reference_code
        row["field_name"] = field_name
        row["reference_value"] = reference_value
        row["system_value"] = system_value

    system_codes = set()
    for line_number, row in enumerate(record_rows, start=2):
        system_code = (row.get("system_record_code") or "").strip()
        if not system_code:
            raise ValueError(
                f"System records CSV line {line_number}: system_record_code is required."
            )
        if system_code in system_codes:
            raise ValueError(
                f"System records CSV line {line_number}: duplicate system_record_code."
            )
        system_codes.add(system_code)
        row["system_record_code"] = system_code
        row["reference_record_code"] = (
            (row.get("reference_record_code") or "").strip()
        )

    records_with_reference = {
        row["reference_record_code"]
        for row in record_rows
        if row["reference_record_code"]
    }
    missing_records = field_keys - records_with_reference
    if missing_records:
        raise ValueError(
            "Every reference record in the field comparison must appear in the "
            "system-record review, even when no system record matched it; missing: "
            + ", ".join(sorted(missing_records))
        )
    return field_rows, record_rows


def wilson_interval(successes, total, z=1.959963984540054):
    if total == 0:
        return None
    proportion = successes / total
    denominator = 1 + z * z / total
    center = (proportion + z * z / (2 * total)) / denominator
    margin = (
        z
        * math.sqrt(
            proportion * (1 - proportion) / total
            + z * z / (4 * total * total)
        )
        / denominator
    )
    return [max(0.0, center - margin), min(1.0, center + margin)]


def exact_mcnemar_p_value(reference_present_system_missing, reference_missing_system_present):
    left = reference_present_system_missing
    right = reference_missing_system_present
    discordant = left + right
    if discordant == 0:
        return 1.0
    smaller_tail = min(left, right)
    probability = sum(math.comb(discordant, index) for index in range(smaller_tail + 1))
    return min(1.0, 2 * probability / (2**discordant))


def analyze(field_rows, record_rows):
    fields = defaultdict(
        lambda: {
            "eligible": 0,
            "accurate": 0,
            "system_present": 0,
            "reference_missing_system_present": 0,
            "reference_present_system_missing": 0,
        }
    )
    for row in field_rows:
        reference_value = (row.get("reference_value") or "").strip()
        system_value = (row.get("system_value") or "").strip()
        if not reference_value:
            if system_value:
                fields[row["field_name"]]["reference_missing_system_present"] += 1
            continue

        measure = fields[row["field_name"]]
        measure["eligible"] += 1
        if system_value:
            measure["system_present"] += 1
            if reference_value.casefold() == system_value.casefold():
                measure["accurate"] += 1
        else:
            measure["reference_present_system_missing"] += 1

    per_field = {}
    totals = Counter()
    for field_name, measure in sorted(fields.items()):
        totals.update(measure)
        eligible = measure["eligible"]
        per_field[field_name] = {
            "accuracy": {
                "correct": measure["accurate"],
                "eligible_reference_values": eligible,
                "rate": measure["accurate"] / eligible if eligible else None,
                "wilson_95_ci": wilson_interval(measure["accurate"], eligible),
            },
            "completeness": {
                "present": measure["system_present"],
                "eligible_reference_values": eligible,
                "missing": eligible - measure["system_present"],
                "rate": measure["system_present"] / eligible if eligible else None,
            },
            "paired_presence": {
                "reference_present_system_missing": measure[
                    "reference_present_system_missing"
                ],
                "reference_missing_system_present": measure[
                    "reference_missing_system_present"
                ],
            },
        }

    eligible = totals["eligible"]
    system_present = totals["system_present"]
    discordant_reference_missing = totals["reference_missing_system_present"]
    discordant_system_missing = totals["reference_present_system_missing"]
    linked_counts = Counter(
        row["reference_record_code"]
        for row in record_rows
        if row["reference_record_code"]
    )
    linked_records = sum(linked_counts.values())
    duplicate_extras = sum(max(count - 1, 0) for count in linked_counts.values())
    orphan_records = sum(not row["reference_record_code"] for row in record_rows)

    return {
        "status": "ANALYZED",
        "alpha": ALPHA,
        "study_observation_rows": {
            "field_comparisons": len(field_rows),
            "system_records": len(record_rows),
        },
        "accuracy": {
            "correct": totals["accurate"],
            "eligible_reference_values": eligible,
            "rate": totals["accurate"] / eligible if eligible else None,
            "wilson_95_ci": wilson_interval(totals["accurate"], eligible),
            "interpretation": "descriptive; confidence interval is not cluster-adjusted",
        },
        "completeness": {
            "present": system_present,
            "eligible_reference_values": eligible,
            "missing": eligible - system_present,
            "rate": system_present / eligible if eligible else None,
        },
        "paired_completeness_test": {
            "method": "two-sided exact McNemar/binomial test on paired presence",
            "reference_present_system_missing": discordant_system_missing,
            "reference_missing_system_present": discordant_reference_missing,
            "p_value": exact_mcnemar_p_value(
                discordant_system_missing, discordant_reference_missing
            ),
            "alpha": ALPHA,
            "note": "tests presence discordance, not value accuracy; repeated fields within a record may be dependent",
        },
        "per_field": per_field,
        "duplicates": {
            "linked_system_records": linked_records,
            "duplicate_extras": duplicate_extras,
            "rate": duplicate_extras / linked_records if linked_records else None,
            "wilson_95_ci": wilson_interval(duplicate_extras, linked_records),
            "unmatched_orphan_system_records": orphan_records,
            "definition": "additional linked system records per linked system record",
        },
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fields", required=True, help="Field comparison CSV path.")
    parser.add_argument("--records", required=True, help="System-record review CSV path.")
    args = parser.parse_args(argv)
    try:
        field_rows, record_rows = load_study_data(args.fields, args.records)
        print(json.dumps(analyze(field_rows, record_rows), indent=2, allow_nan=False))
    except NoStudyDataError as error:
        print(json.dumps({"status": "NO_STUDY_DATA", "message": str(error)}, indent=2))
        return 2
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "INVALID_INPUT", "message": str(error)}, indent=2))
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
