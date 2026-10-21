#!/usr/bin/env python3
"""Analyze paired synthetic-profile growth-record retrieval tasks."""

import argparse
import csv
import json
import math
import random
from pathlib import Path


REQUIRED_COLUMNS = (
    "assessor_code",
    "scenario_code",
    "mode_order",
    "manual_success",
    "system_success",
    "required_item_count",
    "manual_complete_items",
    "system_complete_items",
    "manual_time_seconds",
    "system_time_seconds",
)
BOOTSTRAP_RESAMPLES = 4000
BOOTSTRAP_SEED = 20261016
WILSON_Z_95 = 1.959963984540054
ALPHA = 0.05


class NoStudyDataError(ValueError):
    """Raised when a valid template contains no paired task observations."""


def _parse_int(value, column, row_number, minimum):
    try:
        parsed = int(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"row {row_number}: {column} must be an integer") from error
    if str(parsed) != value.strip() or parsed < minimum:
        raise ValueError(f"row {row_number}: {column} must be an integer >= {minimum}")
    return parsed


def _parse_seconds(value, column, row_number):
    try:
        parsed = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"row {row_number}: {column} must be a finite number >= 0") from error
    if not math.isfinite(parsed) or parsed < 0:
        raise ValueError(f"row {row_number}: {column} must be a finite number >= 0")
    return parsed


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
        raise NoStudyDataError("NO_STUDY_DATA: no paired task observations were supplied")

    seen_assessors = set()
    for row_number, row in enumerate(rows, start=2):
        for column in ("assessor_code", "scenario_code"):
            row[column] = row[column].strip()
            if not row[column]:
                raise ValueError(f"row {row_number}: {column} is required")
        if row["assessor_code"] in seen_assessors:
            raise ValueError(
                f"row {row_number}: duplicate assessor_code {row['assessor_code']!r}"
            )
        seen_assessors.add(row["assessor_code"])

        row["mode_order"] = row["mode_order"].strip()
        if row["mode_order"] not in {"MANUAL_FIRST", "SYSTEM_FIRST"}:
            raise ValueError(f"row {row_number}: mode_order must be MANUAL_FIRST or SYSTEM_FIRST")
        for column in ("manual_success", "system_success"):
            value = row[column].strip()
            if value not in {"0", "1"}:
                raise ValueError(f"row {row_number}: {column} must be 0 or 1")
            row[column] = int(value)

        row["required_item_count"] = _parse_int(
            row["required_item_count"], "required_item_count", row_number, 1
        )
        for column in ("manual_complete_items", "system_complete_items"):
            row[column] = _parse_int(row[column], column, row_number, 0)
            if row[column] > row["required_item_count"]:
                raise ValueError(
                    f"row {row_number}: {column} cannot exceed required_item_count"
                )
        for column in ("manual_time_seconds", "system_time_seconds"):
            row[column] = _parse_seconds(row[column], column, row_number)

    return rows


def wilson_interval(successes, total):
    if total == 0:
        return None
    proportion = successes / total
    z_squared = WILSON_Z_95**2
    denominator = 1 + z_squared / total
    center = (proportion + z_squared / (2 * total)) / denominator
    margin = (
        WILSON_Z_95
        * math.sqrt(proportion * (1 - proportion) / total + z_squared / (4 * total**2))
        / denominator
    )
    return [max(0.0, center - margin), min(1.0, center + margin)]


def exact_mcnemar_p_value(manual_only, system_only):
    discordant = manual_only + system_only
    if discordant == 0:
        return 1.0
    lower_tail = sum(
        math.comb(discordant, k) for k in range(min(manual_only, system_only) + 1)
    )
    return min(1.0, 2 * lower_tail / (2**discordant))


def _percentile(sorted_values, probability):
    position = (len(sorted_values) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return sorted_values[lower]
    fraction = position - lower
    return sorted_values[lower] + fraction * (sorted_values[upper] - sorted_values[lower])


def bootstrap_mean_interval(values, seed=BOOTSTRAP_SEED, resamples=BOOTSTRAP_RESAMPLES):
    if not values:
        return None
    rng = random.Random(seed)
    sample_size = len(values)
    estimates = []
    for _ in range(resamples):
        estimates.append(
            sum(values[rng.randrange(sample_size)] for _ in range(sample_size)) / sample_size
        )
    estimates.sort()
    return [_percentile(estimates, 0.025), _percentile(estimates, 0.975)]


def _rate_summary(successes, total):
    return {
        "successes": successes,
        "total": total,
        "rate": successes / total if total else None,
        "wilson_95_ci": wilson_interval(successes, total),
    }


def analyze(rows):
    if not rows:
        raise NoStudyDataError("NO_STUDY_DATA: no paired task observations were supplied")

    count = len(rows)
    manual_successes = sum(row["manual_success"] for row in rows)
    system_successes = sum(row["system_success"] for row in rows)
    manual_only = sum(row["manual_success"] == 1 and row["system_success"] == 0 for row in rows)
    system_only = sum(row["manual_success"] == 0 and row["system_success"] == 1 for row in rows)

    manual_completeness = [
        row["manual_complete_items"] / row["required_item_count"] for row in rows
    ]
    system_completeness = [
        row["system_complete_items"] / row["required_item_count"] for row in rows
    ]
    completeness_differences = [
        system - manual for system, manual in zip(system_completeness, manual_completeness)
    ]
    time_differences = [
        row["system_time_seconds"] - row["manual_time_seconds"] for row in rows
    ]
    success_differences = [
        row["system_success"] - row["manual_success"] for row in rows
    ]

    manual_mean_completeness = sum(manual_completeness) / count
    system_mean_completeness = sum(system_completeness) / count
    manual_mean_time = sum(row["manual_time_seconds"] for row in rows) / count
    system_mean_time = sum(row["system_time_seconds"] for row in rows) / count
    p_value = exact_mcnemar_p_value(manual_only, system_only)

    return {
        "status": "ANALYZED",
        "study_data_present": True,
        "assessor_pairs": count,
        "alpha": ALPHA,
        "task_success": {
            "manual": _rate_summary(manual_successes, count),
            "system": _rate_summary(system_successes, count),
            "paired_system_minus_manual_percentage_points": {
                "estimate": sum(success_differences) / count * 100,
                "bootstrap_95_ci": [
                    value * 100
                    for value in bootstrap_mean_interval(success_differences, seed=BOOTSTRAP_SEED + 1)
                ],
            },
            "paired_exact_mcnemar": {
                "manual_success_system_failure": manual_only,
                "manual_failure_system_success": system_only,
                "p_value": p_value,
                "significant_at_alpha": p_value < ALPHA,
            },
        },
        "completeness": {
            "unit": "mean participant-level proportion of required items correctly retrieved and compared",
            "manual_mean": manual_mean_completeness,
            "manual_bootstrap_95_ci": bootstrap_mean_interval(
                manual_completeness, seed=BOOTSTRAP_SEED + 2
            ),
            "system_mean": system_mean_completeness,
            "system_bootstrap_95_ci": bootstrap_mean_interval(
                system_completeness, seed=BOOTSTRAP_SEED + 3
            ),
            "paired_system_minus_manual_percentage_points": {
                "estimate": sum(completeness_differences) / count * 100,
                "bootstrap_95_ci": [
                    value * 100
                    for value in bootstrap_mean_interval(completeness_differences, seed=BOOTSTRAP_SEED + 4)
                ],
            },
        },
        "elapsed_time_seconds": {
            "manual_mean": manual_mean_time,
            "manual_bootstrap_95_ci": bootstrap_mean_interval(
                [row["manual_time_seconds"] for row in rows], seed=BOOTSTRAP_SEED + 5
            ),
            "system_mean": system_mean_time,
            "system_bootstrap_95_ci": bootstrap_mean_interval(
                [row["system_time_seconds"] for row in rows], seed=BOOTSTRAP_SEED + 6
            ),
            "paired_system_minus_manual_seconds": {
                "estimate": sum(time_differences) / count,
                "bootstrap_95_ci": bootstrap_mean_interval(
                    time_differences, seed=BOOTSTRAP_SEED + 7
                ),
            },
        },
        "interpretation_note": (
            "Evidence concerns this synthetic-profile task only; the observational task comparison "
            "does not establish clinical benefit or generalize to real patient care."
        ),
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
