import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from analyze_immunization_flags import (
    REQUIRED_COLUMNS,
    NoStudyDataError,
    analyze,
    exact_mcnemar_p_value,
    load_observations,
    main,
)


FIXTURE_PATH = Path(__file__).with_name("synthetic-validation-fixture.csv")


class ImmunizationFlagAnalysisTests(unittest.TestCase):
    def test_synthetic_fixture_has_verified_confusion_counts_and_metrics(self):
        rows = load_observations(FIXTURE_PATH)
        result = analyze(rows)
        self.assertEqual(
            result["confusion_matrix"],
            {"true_positive": 1, "false_negative": 1, "false_positive": 1, "true_negative": 1},
        )
        self.assertEqual(result["sensitivity"]["rate"], 0.5)
        self.assertEqual(result["specificity"]["rate"], 0.5)
        self.assertEqual(result["precision"]["rate"], 0.5)
        self.assertEqual(result["missed_flags"], 1)
        self.assertEqual(result["incorrect_flags"], 1)
        self.assertEqual(result["paired_flag_test"]["p_value"], 1.0)
        self.assertIsNone(result["study_conclusion"])

    def test_empty_template_returns_no_study_data_without_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty.csv"
            with path.open("w", encoding="utf-8", newline="") as output:
                csv.DictWriter(output, fieldnames=REQUIRED_COLUMNS).writeheader()
            with self.assertRaisesRegex(NoStudyDataError, "NO_STUDY_DATA"):
                load_observations(path)
            stdout = io.StringIO()
            with redirect_stdout(stdout):
                exit_code = main(["--input", str(path)])
        result = json.loads(stdout.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertEqual(result["status"], "NO_STUDY_DATA")
        self.assertNotIn("sensitivity", result)

    def test_zero_denominators_are_reported_as_unavailable(self):
        row = {
            "evaluation_code": "SYNTH-E01",
            "child_code": "SYNTH-C01",
            "vaccine_name": "BCG",
            "dose": "Birth",
            "as_of_date": "2026-01-01",
            "schedule_rule_version": "SYNTHETIC-ONLY",
            "reference_due_or_overdue": 0,
            "system_due_or_overdue": 0,
        }
        result = analyze([row])
        self.assertIsNone(result["sensitivity"]["rate"])
        self.assertEqual(result["specificity"]["rate"], 1.0)
        self.assertIsNone(result["precision"]["rate"])

    def test_exact_mcnemar_handles_no_discordance_and_known_values(self):
        self.assertEqual(exact_mcnemar_p_value(0, 0), 1.0)
        self.assertEqual(exact_mcnemar_p_value(3, 0), 0.25)
        self.assertEqual(exact_mcnemar_p_value(5, 0), 0.0625)
        self.assertEqual(exact_mcnemar_p_value(6, 0), 0.03125)

    def test_rejects_duplicate_child_codes_invalid_flags_and_mixed_dates(self):
        with FIXTURE_PATH.open(encoding="utf-8", newline="") as source:
            rows = list(csv.DictReader(source))
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "input.csv"
            duplicate = [dict(rows[0]), dict(rows[1])]
            duplicate[1]["child_code"] = duplicate[0]["child_code"]
            self._write(path, duplicate)
            with self.assertRaisesRegex(ValueError, "duplicate child_code"):
                load_observations(path)

            invalid = [dict(rows[0])]
            invalid[0]["system_due_or_overdue"] = "unknown"
            self._write(path, invalid)
            with self.assertRaisesRegex(ValueError, "system_due_or_overdue must be 0 or 1"):
                load_observations(path)

            mixed_dates = [dict(rows[0]), dict(rows[1])]
            mixed_dates[1]["as_of_date"] = "2026-01-02"
            self._write(path, mixed_dates)
            with self.assertRaisesRegex(ValueError, "same as_of_date"):
                load_observations(path)

    @staticmethod
    def _write(path, rows):
        with path.open("w", encoding="utf-8", newline="") as output:
            writer = csv.DictWriter(output, fieldnames=REQUIRED_COLUMNS)
            writer.writeheader()
            writer.writerows(rows)


if __name__ == "__main__":
    unittest.main(verbosity=2)
