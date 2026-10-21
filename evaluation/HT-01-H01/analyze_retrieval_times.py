#!/usr/bin/env python3
"""Analyze paired manual/system retrieval times aggregated by participant."""

import argparse
import csv
import json
import math
import sys
from collections import defaultdict
from pathlib import Path


EXPECTED_FIELDS = {
    "participant_code",
    "task_code",
    "manual_seconds",
    "system_seconds",
    "sequence_order",
}
ALPHA = 0.05


class NoStudyDataError(ValueError):
    """Raised when a valid template contains no observations."""


def load_observations(csv_path):
    observations = []
    seen_pairs = set()
    tasks_by_participant = defaultdict(set)

    with Path(csv_path).open("r", encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        if reader.fieldnames is None or set(reader.fieldnames) != EXPECTED_FIELDS:
            raise ValueError(
                "CSV columns must be exactly: "
                + ", ".join(sorted(EXPECTED_FIELDS))
            )

        for line_number, row in enumerate(reader, start=2):
            participant = (row.get("participant_code") or "").strip()
            task = (row.get("task_code") or "").strip()
            order = (row.get("sequence_order") or "").strip().lower()
            if not participant or not task:
                raise ValueError(f"Line {line_number}: participant_code and task_code are required.")
            if order not in {"manual_first", "system_first"}:
                raise ValueError(
                    f"Line {line_number}: sequence_order must be manual_first or system_first."
                )

            pair = (participant, task)
            if pair in seen_pairs:
                raise ValueError(
                    f"Line {line_number}: duplicate participant-task pair {participant}/{task}."
                )

            try:
                manual_seconds = float(row["manual_seconds"])
                system_seconds = float(row["system_seconds"])
            except (TypeError, ValueError) as error:
                raise ValueError(f"Line {line_number}: retrieval times must be numeric.") from error

            if not all(
                math.isfinite(value) and value > 0
                for value in (manual_seconds, system_seconds)
            ):
                raise ValueError(
                    f"Line {line_number}: retrieval times must be positive finite numbers."
                )

            seen_pairs.add(pair)
            tasks_by_participant[participant].add(task)
            observations.append(
                {
                    "participant_code": participant,
                    "task_code": task,
                    "manual_seconds": manual_seconds,
                    "system_seconds": system_seconds,
                    "sequence_order": order,
                }
            )

    if not observations:
        raise NoStudyDataError("NO_STUDY_DATA: CSV contains headers but no observations.")

    expected_tasks = next(iter(tasks_by_participant.values()))
    inconsistent = [
        participant
        for participant, tasks in tasks_by_participant.items()
        if tasks != expected_tasks
    ]
    if inconsistent:
        raise ValueError(
            "Every participant must have the same task-code set; inconsistent participant(s): "
            + ", ".join(sorted(inconsistent))
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
        "tasks_per_participant": len(
            {row["task_code"] for row in observations if row["participant_code"] == observations[0]["participant_code"]}
        ),
        "paired_difference_definition": "participant mean manual seconds minus participant mean system seconds",
        "positive_difference_means": "system retrieval was faster",
        "mean_manual_seconds": sum(manual_means) / count,
        "mean_system_seconds": sum(system_means) / count,
        "mean_paired_difference_seconds": sum(differences) / count,
        "median_paired_difference_seconds": float(stats.scoreatpercentile(differences, 50)),
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
    except ImportError as error:
        print(
            json.dumps(
                {
                    "status": "MISSING_DEPENDENCY",
                    "message": "Install evaluation/HT-01-H01/requirements.txt before analysis.",
                },
                indent=2,
            )
        )
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
