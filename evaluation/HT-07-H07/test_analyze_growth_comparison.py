import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from analyze_growth_comparison import (
    REQUIRED_COLUMNS,
    NoStudyDataError,
    analyze,
    exact_mcnemar_p_value,
    load_observations,
    main,
)


def synthetic_row(code, manual_success, system_success, manual_complete, system_complete, manual_time, system_time):
    return {
        "assessor_code": code,
        "scenario_code": "SYNTH-PROFILE",
        "mode_order": "MANUAL_FIRST",
        "manual_success": int(manual_success),
        "system_success": int(system_success),
        "required_item_count": 4,
        "manual_complete_items": int(manual_complete),
        "system_complete_items": int(system_complete),
        "manual_time_seconds": float(manual_time),
        "system_time_seconds": float(system_time),
    }


class GrowthComparisonTests(unittest.TestCase):
    def test_empty_template_reports_no_study_data_without_statistics(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty.csv"
            self._write(path, [])
            with self.assertRaisesRegex(NoStudyDataError, "NO_STUDY_DATA"):
                load_observations(path)
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = main(["--input", str(path)])
        result = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertEqual(result["status"], "NO_STUDY_DATA")
        self.assertNotIn("task_success", result)

    def test_paired_success_completeness_time_and_confidence_intervals(self):
        rows = [
            synthetic_row("SYNTH-A1", 0, 1, 2, 4, 80, 45),
            synthetic_row("SYNTH-A2", 1, 1, 4, 4, 65, 50),
            synthetic_row("SYNTH-A3", 1, 0, 3, 2, 55, 90),
            synthetic_row("SYNTH-A4", 0, 1, 1, 3, 100, 70),
        ]
        result = analyze(rows)
        self.assertEqual(result["task_success"]["manual"]["successes"], 2)
        self.assertEqual(result["task_success"]["system"]["successes"], 3)
        self.assertEqual(result["task_success"]["paired_exact_mcnemar"]["manual_failure_system_success"], 2)
        self.assertEqual(result["task_success"]["paired_exact_mcnemar"]["manual_success_system_failure"], 1)
        self.assertAlmostEqual(
            result["completeness"]["paired_system_minus_manual_percentage_points"]["estimate"],
            18.75,
        )
        self.assertAlmostEqual(
            result["elapsed_time_seconds"]["paired_system_minus_manual_seconds"]["estimate"],
            -11.25,
        )
        for ci in (
            result["task_success"]["manual"]["wilson_95_ci"],
            result["completeness"]["paired_system_minus_manual_percentage_points"]["bootstrap_95_ci"],
            result["elapsed_time_seconds"]["paired_system_minus_manual_seconds"]["bootstrap_95_ci"],
        ):
            self.assertEqual(len(ci), 2)
            self.assertLessEqual(ci[0], ci[1])
        self.assertIsNone(result["study_conclusion"])

    def test_exact_mcnemar_edges_and_wilson_interval(self):
        self.assertEqual(exact_mcnemar_p_value(0, 0), 1.0)
        self.assertEqual(exact_mcnemar_p_value(3, 0), 0.25)
        with self.assertRaisesRegex(ValueError, "mode_order must be"):
            self._load([synthetic_row("SYNTH-A", 0, 0, 1, 1, 2, 2)], order="unknown")

    def test_rejects_duplicate_assessors_invalid_counts_and_invalid_seconds(self):
        row = synthetic_row("SYNTH-A", 1, 1, 3, 4, 10, 8)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "data.csv"
            self._write(path, [row, row])
            with self.assertRaisesRegex(ValueError, "duplicate assessor_code"):
                load_observations(path)

            invalid_count = dict(row, system_complete_items="5")
            self._write(path, [invalid_count])
            with self.assertRaisesRegex(ValueError, "cannot exceed required_item_count"):
                load_observations(path)

            invalid_time = dict(row, manual_time_seconds="-1")
            self._write(path, [invalid_time])
            with self.assertRaisesRegex(ValueError, "finite number >= 0"):
                load_observations(path)

    def test_bootstrap_confidence_intervals_are_reproducible(self):
        row = synthetic_row("SYNTH-A1", 1, 1, 4, 3, 20, 15)
        first = analyze([row])
        second = analyze([row])
        self.assertEqual(
            first["elapsed_time_seconds"]["paired_system_minus_manual_seconds"]["bootstrap_95_ci"],
            second["elapsed_time_seconds"]["paired_system_minus_manual_seconds"]["bootstrap_95_ci"],
        )

    @staticmethod
    def _write(path, rows):
        with path.open("w", encoding="utf-8", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=REQUIRED_COLUMNS)
            writer.writeheader()
            writer.writerows(rows)

    @classmethod
    def _load(cls, rows, order):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "data.csv"
            cls._write(path, [dict(rows[0], mode_order=order)])
            return load_observations(path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
