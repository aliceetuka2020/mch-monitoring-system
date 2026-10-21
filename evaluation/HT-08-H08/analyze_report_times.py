#!/usr/bin/env python3
"""Analyze paired manual/system report preparation times by participant."""

import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path


EXPECTED_FIELDS = {
    "participant_code",
    "report_code",
    "dataset_code",
    "manual_seconds",
    "system_seconds",
    "sequence_order",
}
ALPHA = 0.05


class NoStudyDataError(ValueError):
    """Raised when a valid template contains no paired report observations."""


def load_observations(csv_path):
    observations = []
    seen_pairs = set()
    reports_by_participant = defaultdict(set)
    datasets_by_report = defaultdict(set)

    with Path(csv_path).open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or set(reader.fieldnames) != EXPECTED_FIELDS:
            raise ValueError(
                "CSV columns must be exactly: " + ", ".join(sorted(EXPECTED_FIELDS))
            )

        for line_number, row in enumerate(reader, start=2):
            participant = (row.get("participant_code") or "").strip()
            report = (row.get("report_code") or "").strip()
            dataset = (row.get("dataset_code") or "").strip()
            order = (row.get("sequence_order") or "").strip().lower()
            if not participant or not report or not dataset:
                raise ValueError(
                    f"Line {line_number}: participant_code, report_code, and dataset_code are required."
                )
            if order not in {"manual_first", "system_first"}:
                raise ValueError(
                    f"Line {line_number}: sequence_order must be manual_first or system_first."
                )

            pair = (participant, report)
            if pair in seen_pairs:
                raise ValueError(
                    f"Line {line_number}: duplicate participant-report pair {participant}/{report}."
                )

            try:
                manual_seconds = float(row["manual_seconds"])
                system_seconds = float(row["system_seconds"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Line {line_number}: preparation times must be numeric.") from error
            if not all(
                math.isfinite(value) and value > 0
                for value in (manual_seconds, system_seconds)
            ):
                raise ValueError(
                    f"Line {line_number}: preparation times must be positive finite numbers."
                )

            seen_pairs.add(pair)
            reports_by_participant[participant].add(report)
            datasets_by_report[report].add(dataset)
            observations.append(
                {
                    "participant_code": participant,
                    "report_code": report,
                    "dataset_code": dataset,
                    "manual_seconds": manual_seconds,
                    "system_seconds": system_seconds,
                    "sequence_order": order,
                }
            )

    if not observations:
        raise NoStudyDataError("NO_STUDY_DATA: CSV contains headers but no observations.")

    expected_reports = next(iter(reports_by_participant.values()))
    inconsistent = [
        participant
        for participant, reports in reports_by_participant.items()
        if reports != expected_reports
    ]
    if inconsistent:
        raise ValueError(
            "Every participant must have the same report-code set; inconsistent participant(s): "
            + ", ".join(sorted(inconsistent))
        )

    inconsistent_datasets = [
        report for report, datasets in datasets_by_report.items() if len(datasets) != 1
    ]
    if inconsistent_datasets:
        raise ValueError(
            "Each report_code must use the same dataset_code for all participants: "
            + ", ".join(sorted(inconsistent_datasets))
        )

    return observations


def participant_means(observations):
    grouped = defaultdict(lambda: {"manual": [], "system": []})
    for row in observations:
        values = grouped[row["participant_code"]]
        values["manual"].append(row["manual_seconds"])
        values["system"].append(row["system_seconds"])

    return [
        (
            sum(values["manual"]) / len(values["manual"]),
            sum(values["system"]) / len(values["system"]),
        )
        for values in grouped.values()
    ]


def analyze(observations):
    from scipy import stats

    pairs = participant_means(observations)
    manual_means = [manual for manual, _ in pairs]
    system_means = [system for _, system in pairs]
    differences = [
        manual - system for manual, system in zip(manual_means, system_means)
    ]
    count = len(differences)
    result = {
        "status": "ANALYZED",
        "alpha": ALPHA,
        "observation_rows": len(observations),
        "participants": count,
        "reports_per_participant": len(
            {
                row["report_code"]
                for row in observations
                if row["participant_code"] == observations[0]["participant_code"]
            }
        ),
        "dataset_codes": sorted({row["dataset_code"] for row in observations}),
        "paired_difference_definition": (
            "participant mean manual preparation seconds minus participant mean system preparation seconds"
        ),
        "positive_difference_means": "system report preparation was faster",
        "mean_manual_seconds": sum(manual_means) / count,
        "mean_system_seconds": sum(system_means) / count,
        "mean_paired_difference_seconds": sum(differences) / count,
        "median_paired_difference_seconds": float(stats.scoreatpercentile(differences, 50)),
        "paired_difference_standard_deviation_seconds": (
            float(stats.tstd(differences)) if count > 1 else None
        ),
        "normality_screen": None,
        "test": None,
        "statistic": None,
        "p_value": None,
        "statistical_decision": "Not tested: at least two independent participants are required.",
    }

    if count < 2:
        result["status"] = "DESCRIPTIVE_ONLY"
        return result

    normality_p = None
    if count >= 3 and len(set(differences)) > 1:
        shapiro = stats.shapiro(differences)
        normality_p = float(shapiro.pvalue)
        result["normality_screen"] = {
            "method": "Shapiro-Wilk on participant-level paired differences",
            "statistic": float(shapiro.statistic),
            "p_value": normality_p,
            "interpretation": "screen only; a non-significant result does not prove normality",
        }
    elif count >= 3:
        result["normality_screen"] = {
            "method": "Shapiro-Wilk not used",
            "p_value": None,
            "interpretation": "constant paired differences; use Wilcoxon fallback",
        }
    else:
        result["normality_screen"] = {
            "method": "Not assessed",
            "p_value": None,
            "interpretation": "fewer than three participants",
        }

    use_paired_t = (
        count >= 3
        and len(set(differences)) > 1
        and normality_p is not None
        and normality_p >= ALPHA
    )
    if use_paired_t:
        test = stats.ttest_rel(manual_means, system_means, alternative="two-sided")
        result["test"] = "Paired t-test (two-sided)"
        result["statistic"] = float(test.statistic)
        result["p_value"] = float(test.pvalue)
    else:
        result["test"] = "Wilcoxon signed-rank (two-sided)"
        if all(difference == 0 for difference in differences):
            statistic, p_value = 0.0, 1.0
        else:
            test = stats.wilcoxon(
                differences,
                alternative="two-sided",
                zero_method="wilcox",
                method="auto",
            )
            statistic, p_value = float(test.statistic), float(test.pvalue)
        result["statistic"] = statistic
        result["p_value"] = p_value

    result["statistical_decision"] = (
        "Reject the null at alpha=0.05 under the stated test assumptions."
        if result["p_value"] < ALPHA
        else "Do not reject the null at alpha=0.05; this does not establish equivalence."
    )
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--input",
        required=True,
        help="Path to a populated, approved CSV using the supplied template columns.",
    )
    args = parser.parse_args(argv)

    try:
        observations = load_observations(args.input)
        print(json.dumps(analyze(observations), indent=2, allow_nan=False))
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
                    "message": "Install evaluation/HT-08-H08/requirements.txt before analysis.",
                },
                indent=2,
            )
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
