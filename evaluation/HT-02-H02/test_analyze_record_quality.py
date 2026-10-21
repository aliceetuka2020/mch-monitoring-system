import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from analyze_record_quality import (
    NoStudyDataError,
    analyze,
    exact_mcnemar_p_value,
    load_study_data,
    main,
    wilson_interval,
)


FIELD_COLUMNS = [
    "reference_record_code",
    "field_name",
    "reference_value",
    "system_value",
]
RECORD_COLUMNS = ["reference_record_code", "system_record_code"]


def write_csv(path, columns, rows):
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)


class RecordQualityAnalysisTests(unittest.TestCase):
    def test_header_only_templates_produce_no_study_data(self):
        with tempfile.TemporaryDirectory() as directory:
            fields_path = Path(directory) / "fields.csv"
            records_path = Path(directory) / "records.csv"
            write_csv(fields_path, FIELD_COLUMNS, [])
            write_csv(records_path, RECORD_COLUMNS, [])

            with self.assertRaisesRegex(NoStudyDataError, "NO_STUDY_DATA"):
                load_study_data(fields_path, records_path)

    def test_cli_marks_empty_templates_no_study_data_without_results(self):
        with tempfile.TemporaryDirectory() as directory:
            fields_path = Path(directory) / "fields.csv"
            records_path = Path(directory) / "records.csv"
            write_csv(fields_path, FIELD_COLUMNS, [])
            write_csv(records_path, RECORD_COLUMNS, [])
            output = io.StringIO()

            with redirect_stdout(output):
                exit_code = main(
                    ["--fields", str(fields_path), "--records", str(records_path)]
                )

        result = json.loads(output.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertEqual(result["status"], "NO_STUDY_DATA")
        self.assertNotIn("accuracy", result)

    def test_calculates_normalized_accuracy_completeness_and_paired_presence(self):
        fields = [
            {
                "reference_record_code": "SYNTH-R1",
                "field_name": "vaccine",
                "reference_value": " Penta 1 ",
                "system_value": "penta 1",
            },
            {
                "reference_record_code": "SYNTH-R2",
                "field_name": "vaccine",
                "reference_value": "BCG",
                "system_value": "",
            },
            {
                "reference_record_code": "SYNTH-R3",
                "field_name": "guardian",
                "reference_value": "",
                "system_value": "Synthetic Guardian",
            },
        ]
        records = [
            {"reference_record_code": "SYNTH-R1", "system_record_code": "SYNTH-S1"},
            {"reference_record_code": "SYNTH-R2", "system_record_code": "SYNTH-S2"},
            {"reference_record_code": "SYNTH-R3", "system_record_code": "SYNTH-S3"},
        ]

        result = analyze(fields, records)

        self.assertEqual(result["accuracy"]["correct"], 1)
        self.assertEqual(result["accuracy"]["eligible_reference_values"], 2)
        self.assertEqual(result["accuracy"]["rate"], 0.5)
        self.assertAlmostEqual(result["accuracy"]["wilson_95_ci"][0], 0.09453, places=4)
        self.assertAlmostEqual(result["accuracy"]["wilson_95_ci"][1], 0.90547, places=4)
        self.assertEqual(result["completeness"]["present"], 1)
        self.assertEqual(result["completeness"]["missing"], 1)
        self.assertEqual(
            result["paired_completeness_test"]["reference_present_system_missing"], 1
        )
        self.assertEqual(
            result["paired_completeness_test"]["reference_missing_system_present"], 1
        )
        self.assertEqual(result["paired_completeness_test"]["p_value"], 1.0)
        self.assertEqual(
            result["per_field"]["vaccine"]["accuracy"]["eligible_reference_values"], 2
        )

    def test_calculates_two_sided_exact_mcnemar_and_wilson_boundaries(self):
        self.assertEqual(exact_mcnemar_p_value(3, 0), 0.25)
        self.assertEqual(exact_mcnemar_p_value(0, 0), 1.0)
        self.assertIsNone(wilson_interval(0, 0))

    def test_counts_linked_duplicate_extras_and_unmatched_system_records(self):
        fields = [
            {
                "reference_record_code": "SYNTH-R1",
                "field_name": "record_type",
                "reference_value": "A",
                "system_value": "A",
            },
        ]
        records = [
            {"reference_record_code": "SYNTH-R1", "system_record_code": "SYNTH-S1"},
            {"reference_record_code": "SYNTH-R1", "system_record_code": "SYNTH-S2"},
            {"reference_record_code": "", "system_record_code": "SYNTH-ORPHAN"},
        ]

        result = analyze(fields, records)

        self.assertEqual(result["duplicates"]["linked_system_records"], 2)
        self.assertEqual(result["duplicates"]["duplicate_extras"], 1)
        self.assertEqual(result["duplicates"]["rate"], 0.5)
        self.assertEqual(result["duplicates"]["unmatched_orphan_system_records"], 1)

    def test_rejects_duplicate_record_field_pairs(self):
        fields = [
            {
                "reference_record_code": "SYNTH-R1",
                "field_name": "age",
                "reference_value": "1",
                "system_value": "1",
            },
        ]
        with tempfile.TemporaryDirectory() as directory:
            fields_path = Path(directory) / "fields.csv"
            records_path = Path(directory) / "records.csv"
            write_csv(fields_path, FIELD_COLUMNS, fields + fields)
            write_csv(
                records_path,
                RECORD_COLUMNS,
                [{"reference_record_code": "SYNTH-R1", "system_record_code": "SYNTH-S1"}],
            )

            with self.assertRaisesRegex(ValueError, "duplicate record-field pair"):
                load_study_data(fields_path, records_path)

    def test_rejects_duplicate_system_record_codes(self):
        fields = [
            {
                "reference_record_code": "SYNTH-R1",
                "field_name": "age",
                "reference_value": "1",
                "system_value": "1",
            },
        ]
        duplicate_records = [
            {"reference_record_code": "SYNTH-R1", "system_record_code": "SYNTH-S1"},
            {"reference_record_code": "SYNTH-R1", "system_record_code": "SYNTH-S1"},
        ]
        with tempfile.TemporaryDirectory() as directory:
            fields_path = Path(directory) / "fields.csv"
            records_path = Path(directory) / "records.csv"
            write_csv(fields_path, FIELD_COLUMNS, fields)
            write_csv(records_path, RECORD_COLUMNS, duplicate_records)

            with self.assertRaisesRegex(ValueError, "duplicate system_record_code"):
                load_study_data(fields_path, records_path)


if __name__ == "__main__":
    unittest.main()
