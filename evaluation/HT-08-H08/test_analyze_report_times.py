import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from analyze_report_times import NoStudyDataError, analyze, load_observations, main


FIELDS = [
    "participant_code",
    "report_code",
    "dataset_code",
    "manual_seconds",
    "system_seconds",
    "sequence_order",
]


def write_csv(path, rows):
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def synthetic_fixture(participant_differences):
    rows = []
    for index, difference in enumerate(participant_differences, start=1):
        participant = f"SYNTH-P{index:02d}"
        for report, offset in (("REPORT-A", -1), ("REPORT-B", 1)):
            system_seconds = 10 + index + offset
            rows.append(
                {
                    "participant_code": participant,
                    "report_code": report,
                    "dataset_code": f"SYNTH-DATA-{report}",
                    "manual_seconds": system_seconds + difference,
                    "system_seconds": system_seconds,
                    "sequence_order": "manual_first" if index % 2 else "system_first",
                }
            )
    return rows


class ReportPreparationAnalysisTests(unittest.TestCase):
    def test_header_only_template_is_reported_as_no_study_data(self):
        template = Path(__file__).with_name("report-times-template.csv")
        with self.assertRaisesRegex(NoStudyDataError, "NO_STUDY_DATA"):
            load_observations(template)

    def test_cli_does_not_report_test_statistics_for_empty_template(self):
        template = Path(__file__).with_name("report-times-template.csv")
        output = io.StringIO()
        with redirect_stdout(output):
            exit_code = main(["--input", str(template)])
        self.assertEqual(exit_code, 2)
        self.assertEqual(json.loads(output.getvalue())["status"], "NO_STUDY_DATA")

    def test_aggregates_matched_report_tasks_and_selects_paired_t_test(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "synthetic-fixture.csv"
            write_csv(source, synthetic_fixture(range(1, 9)))
            result = analyze(load_observations(source))
        self.assertEqual(result["status"], "ANALYZED")
        self.assertEqual(result["observation_rows"], 16)
        self.assertEqual(result["participants"], 8)
        self.assertEqual(result["reports_per_participant"], 2)
        self.assertEqual(result["test"], "Paired t-test (two-sided)")
        self.assertAlmostEqual(result["mean_paired_difference_seconds"], 4.5)
        self.assertGreaterEqual(result["normality_screen"]["p_value"], 0.05)
        self.assertEqual(
            result["positive_difference_means"], "system report preparation was faster"
        )

    def test_uses_wilcoxon_when_differences_fail_normality_screen(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "synthetic-fixture.csv"
            write_csv(source, synthetic_fixture([1, 1, 1, 1, 1, 1, 1, 20]))
            result = analyze(load_observations(source))
        self.assertEqual(result["test"], "Wilcoxon signed-rank (two-sided)")
        self.assertLess(result["normality_screen"]["p_value"], 0.05)
        self.assertIsInstance(result["p_value"], float)

    def test_rejects_duplicate_participant_report_rows(self):
        duplicate = synthetic_fixture([2])[0]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "duplicate.csv"
            write_csv(source, [duplicate, duplicate])
            with self.assertRaisesRegex(ValueError, "duplicate participant-report pair"):
                load_observations(source)

    def test_rejects_unmatched_report_sets_between_participants(self):
        rows = synthetic_fixture([2, 3])
        rows = [
            row
            for row in rows
            if not (row["participant_code"] == "SYNTH-P02" and row["report_code"] == "REPORT-B")
        ]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "unmatched-reports.csv"
            write_csv(source, rows)
            with self.assertRaisesRegex(ValueError, "same report-code set"):
                load_observations(source)

    def test_rejects_mismatched_dataset_for_same_report_code(self):
        rows = synthetic_fixture([2, 3])
        rows[2]["dataset_code"] = "SYNTH-WRONG-DATASET"
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "mismatched-dataset.csv"
            write_csv(source, rows)
            with self.assertRaisesRegex(ValueError, "same dataset_code"):
                load_observations(source)


if __name__ == "__main__":
    unittest.main()
