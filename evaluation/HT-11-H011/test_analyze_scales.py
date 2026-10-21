import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from analyze_scales import EXPECTED_FIELDS, NoStudyDataError, analyze, load_observations, main


def synthetic_rows(count=12):
    rows = []
    for index in range(count):
        usefulness = 1 + index % 5
        intention = 1 + ((index * 2) % 5)
        rows.append(
            {
                "participant_code": f"SYNTH-P{index + 1:02d}",
                "pu_item_1": usefulness,
                "pu_item_2": usefulness,
                "pu_item_3": usefulness,
                "pu_item_4": usefulness,
                "intention_item_1": intention,
                "intention_item_2": intention,
                "intention_item_3": intention,
            }
        )
    return rows


def write_csv(path, rows, fields=None):
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(
            output,
            fieldnames=fields or sorted(EXPECTED_FIELDS),
            extrasaction="ignore",
        )
        writer.writeheader()
        writer.writerows(rows)


class UsefulnessIntentionAnalysisTests(unittest.TestCase):
    def test_header_only_template_reports_no_study_data_without_metrics(self):
        template = Path(__file__).with_name("questionnaire-responses-template.csv")
        with self.assertRaisesRegex(NoStudyDataError, "NO_STUDY_DATA"):
            load_observations(template)
        output = io.StringIO()
        with redirect_stdout(output):
            exit_code = main(["--input", str(template)])
        result = json.loads(output.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertEqual(result["status"], "NO_STUDY_DATA")
        self.assertNotIn("coefficient", result)

    def test_builds_usefulness_and_intention_composites(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "synthetic.csv"
            write_csv(source, synthetic_rows(3))
            rows = load_observations(source)
        self.assertEqual(rows[0]["pu_score"], 1.0)
        self.assertEqual(rows[0]["intention_score"], 1.0)

    def test_pearson_produces_coefficient_p_value_and_fisher_interval(self):
        rows = [
            {
                "participant_code": f"SYNTH-P{value}",
                "pu_score": float(value),
                "intention_score": float(value),
            }
            for value in range(1, 9)
        ]
        result = analyze(rows, method="pearson")
        self.assertEqual(result["method"], "Pearson product-moment")
        self.assertAlmostEqual(result["coefficient"], 1.0)
        self.assertEqual(len(result["confidence_interval_95"]), 2)
        self.assertLessEqual(result["confidence_interval_95"][0], result["confidence_interval_95"][1])

    def test_spearman_bootstrap_interval_is_deterministic(self):
        rows = [
            {"participant_code": f"SYNTH-P{i}", "pu_score": x, "intention_score": y}
            for i, (x, y) in enumerate([(1, 2), (2, 1), (3, 4), (4, 3), (5, 5), (2, 3), (4, 5), (1, 1)], 1)
        ]
        first = analyze(rows, method="spearman")
        second = analyze(rows, method="spearman")
        self.assertEqual(first["method"], "Spearman rank")
        self.assertEqual(first["confidence_interval_95"], second["confidence_interval_95"])

    def test_auto_selects_spearman_when_normality_screen_fails(self):
        values = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5]
        rows = [
            {"participant_code": f"SYNTH-P{i}", "pu_score": float(value), "intention_score": float(value)}
            for i, value in enumerate(values, 1)
        ]
        result = analyze(rows)
        self.assertEqual(result["method"], "Spearman rank")
        self.assertTrue(
            result["normality_screen"]["usefulness_p_value"] < 0.05
            or result["normality_screen"]["intention_p_value"] < 0.05
        )

    def test_optional_regression_runs_only_when_requested(self):
        rows = [
            {
                "participant_code": f"SYNTH-P{i}",
                "pu_score": float(i),
                "intention_score": float(i) * 0.5 + (0.1 if i % 2 else -0.1),
            }
            for i in range(1, 9)
        ]
        without_regression = analyze(rows, method="pearson")
        with_regression = analyze(rows, method="pearson", regression=True)
        self.assertNotIn("optional_regression", without_regression)
        self.assertAlmostEqual(with_regression["optional_regression"]["slope"], 0.5, places=1)
        self.assertEqual(len(with_regression["optional_regression"]["slope_confidence_interval_95"]), 2)

    def test_rejects_invalid_schema_duplicate_participant_and_likert_value(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "responses.csv"
            rows = synthetic_rows(2)
            write_csv(source, rows, fields=["participant_code", "incorrect_item"])
            with self.assertRaisesRegex(ValueError, "CSV columns must be exactly"):
                load_observations(source)

            write_csv(source, [rows[0], rows[0]])
            with self.assertRaisesRegex(ValueError, "duplicate participant_code"):
                load_observations(source)

            invalid = dict(rows[0], pu_item_2=0)
            write_csv(source, [invalid])
            with self.assertRaisesRegex(ValueError, "pu_item_2 must be an integer"):
                load_observations(source)

    def test_rejects_constant_scale_scores(self):
        rows = [
            {"participant_code": f"SYNTH-P{i}", "pu_score": 3.0, "intention_score": float(i)}
            for i in range(1, 5)
        ]
        with self.assertRaisesRegex(ValueError, "zero variance"):
            analyze(rows, method="pearson")


if __name__ == "__main__":
    unittest.main()
