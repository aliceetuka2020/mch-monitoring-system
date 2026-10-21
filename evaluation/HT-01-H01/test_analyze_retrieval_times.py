import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from analyze_retrieval_times import (
    NoStudyDataError,
    analyze,
    load_observations,
    main,
)


FIELDS = [
    "participant_code",
    "task_code",
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
        for task, offset in (("TASK-A", -1), ("TASK-B", 1)):
            system_seconds = 10 + index + offset
            rows.append(
                {
                    "participant_code": participant,
                    "task_code": task,
                    "manual_seconds": system_seconds + difference,
                    "system_seconds": system_seconds,
                    "sequence_order": "manual_first" if index % 2 else "system_first",
                }
            )
    return rows


class RetrievalTimeAnalysisTests(unittest.TestCase):
    def test_header_only_template_is_reported_as_no_study_data(self):
        template = Path(__file__).with_name("retrieval-times-template.csv")

        with self.assertRaisesRegex(NoStudyDataError, "NO_STUDY_DATA"):
            load_observations(template)

    def test_cli_does_not_claim_a_hypothesis_result_for_empty_template(self):
        template = Path(__file__).with_name("retrieval-times-template.csv")
        output = io.StringIO()

        with redirect_stdout(output):
            exit_code = main(["--input", str(template)])

        self.assertEqual(exit_code, 2)
        self.assertEqual(json.loads(output.getvalue())["status"], "NO_STUDY_DATA")

    def test_aggregates_tasks_by_participant_and_selects_paired_t_test(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "synthetic-fixture.csv"
            write_csv(source, synthetic_fixture(range(1, 9)))

            result = analyze(load_observations(source))

        self.assertEqual(result["status"], "ANALYZED")
        self.assertEqual(result["observation_rows"], 16)
        self.assertEqual(result["participants"], 8)
        self.assertEqual(result["tasks_per_participant"], 2)
        self.assertEqual(result["test"], "Paired t-test (two-sided)")
        self.assertAlmostEqual(result["mean_paired_difference_seconds"], 4.5)
        self.assertGreaterEqual(result["normality_screen"]["p_value"], 0.05)

    def test_uses_wilcoxon_when_paired_differences_fail_normality_screen(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "synthetic-fixture.csv"
            write_csv(source, synthetic_fixture([1, 1, 1, 1, 1, 1, 1, 20]))

            result = analyze(load_observations(source))

        self.assertEqual(result["test"], "Wilcoxon signed-rank (two-sided)")
        self.assertLess(result["normality_screen"]["p_value"], 0.05)
        self.assertIsInstance(result["p_value"], float)

    def test_rejects_duplicate_participant_task_rows(self):
        duplicate = synthetic_fixture([2])[0]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "duplicate.csv"
            write_csv(source, [duplicate, duplicate])

            with self.assertRaisesRegex(ValueError, "duplicate participant-task pair"):
                load_observations(source)

    def test_rejects_unmatched_task_sets_between_participants(self):
        rows = synthetic_fixture([2, 3])
        rows = [row for row in rows if not (row["participant_code"] == "SYNTH-P02" and row["task_code"] == "TASK-B")]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "unmatched-tasks.csv"
            write_csv(source, rows)

            with self.assertRaisesRegex(ValueError, "same task-code set"):
                load_observations(source)


if __name__ == "__main__":
    unittest.main()
