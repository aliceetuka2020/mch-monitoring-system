import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from analyze_anc_completeness import (
    FIELDS,
    HISTORY_COLUMNS,
    REQUIRED_COLUMNS,
    NoStudyDataError,
    analyze,
    exact_mcnemar_p_value,
    load_observations,
    main,
)


def make_row(code="SYNTH-R1", baseline="1", followup="1"):
    row = {
        "record_code": code,
        "baseline_date": "2026-01-01",
        "followup_date": "2026-02-01",
    }
    for field in FIELDS:
        row[f"baseline_{field}"] = baseline
        row[f"followup_{field}"] = followup
    row.update(
        {
            "baseline_history_accessible": "0",
            "followup_history_accessible": "1",
        }
    )
    return row


def write_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=REQUIRED_COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


class AncCompletenessTests(unittest.TestCase):
    def test_empty_template_returns_no_study_data_without_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "empty.csv"
            write_csv(path, [])
            with self.assertRaisesRegex(NoStudyDataError, "NO_STUDY_DATA"):
                load_observations(path)
            output = io.StringIO()
            with redirect_stdout(output):
                exit_code = main(["--input", str(path)])
        result = json.loads(output.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertEqual(result["status"], "NO_STUDY_DATA")
        self.assertNotIn("p_value", result)

    def test_reports_candidate_field_and_pooled_completion(self):
        row = make_row(baseline="1", followup="0")
        result = analyze([row])
        self.assertEqual(result["record_count"], 1)
        self.assertEqual(result["field_completion"]["weight"]["baseline"]["rate"], 1.0)
        self.assertEqual(result["field_completion"]["weight"]["followup"]["rate"], 0.0)
        self.assertEqual(result["pooled_field_completion"]["baseline"]["eligible"], len(FIELDS))

    def test_computes_paired_checklist_and_history_exact_tests(self):
        first = make_row("SYNTH-R1", baseline="1", followup="0")
        second = make_row("SYNTH-R2", baseline="0", followup="1")
        second["baseline_history_accessible"] = "1"
        second["followup_history_accessible"] = "0"
        result = analyze([first, second])
        checklist = result["paired_checklist_completeness"]
        self.assertEqual(checklist["baseline_only"], 1)
        self.assertEqual(checklist["followup_only"], 1)
        self.assertEqual(checklist["p_value"], 1.0)
        history = result["paired_history_accessibility"]
        self.assertEqual(history["baseline_only"], 1)
        self.assertEqual(history["followup_only"], 1)
        self.assertEqual(history["p_value"], 1.0)
        self.assertFalse(history["significant_at_alpha"])

    def test_excludes_not_applicable_fields_from_period_denominators(self):
        row = make_row()
        row["baseline_foetal_assessment"] = "NA"
        row["followup_foetal_assessment"] = "NA"
        result = analyze([row])
        metric = result["field_completion"]["foetal_assessment"]
        self.assertEqual(metric["baseline"]["eligible"], 0)
        self.assertIsNone(metric["baseline"]["rate"])
        self.assertEqual(result["paired_checklist_completeness"]["paired_records"], 1)

    def test_exact_mcnemar_boundaries_and_alpha_comparison(self):
        self.assertEqual(exact_mcnemar_p_value(0, 0), 1.0)
        self.assertEqual(exact_mcnemar_p_value(3, 0), 0.25)
        self.assertEqual(exact_mcnemar_p_value(10, 0), 0.001953125)
        result = analyze([make_row(baseline="0", followup="1") for _ in range(10)])
        self.assertTrue(result["paired_checklist_completeness"]["significant_at_alpha"])

    def test_rejects_invalid_status_and_duplicate_record_codes(self):
        invalid = make_row()
        invalid["baseline_weight"] = "yes"
        duplicate = make_row()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "invalid.csv"
            write_csv(path, [invalid])
            with self.assertRaisesRegex(ValueError, "baseline_weight must be 0, 1, or NA"):
                load_observations(path)
            write_csv(path, [duplicate, duplicate])
            with self.assertRaisesRegex(ValueError, "duplicate record_code"):
                load_observations(path)

    def test_rejects_nonchronological_observation_dates(self):
        row = make_row()
        row["followup_date"] = row["baseline_date"]
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "dates.csv"
            write_csv(path, [row])
            with self.assertRaisesRegex(ValueError, "followup_date must be after"):
                load_observations(path)


if __name__ == "__main__":
    unittest.main(verbosity=2)
