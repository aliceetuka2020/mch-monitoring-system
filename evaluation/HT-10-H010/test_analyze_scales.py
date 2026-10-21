import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from analyze_scales import EXPECTED_FIELDS, NoStudyDataError, analyze, load_observations, main


def synthetic_rows(count=12, reverse=False):
    rows = []
    for index in range(count):
        peou = 1 + (index % 5)
        intention = 6 - peou if reverse else peou
        rows.append(
            {
                "participant_code": f"SYNTH-P{index + 1:02d}",
                "peou_item_1": peou,
                "peou_item_2": peou,
                "peou_item_3": peou,
                "peou_item_4": peou,
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


class ScaleAnalysisTests(unittest.TestCase):
    def test_header_only_template_reports_no_study_data(self):
        template = Path(__file__).with_name("questionnaire-responses-template.csv")
        with self.assertRaisesRegex(NoStudyDataError, "NO_STUDY_DATA"):
            load_observations(template)

    def test_cli_does_not_emit_statistics_for_empty_template(self):
        template = Path(__file__).with_name("questionnaire-responses-template.csv")
        output = io.StringIO()
        with redirect_stdout(output):
            exit_code = main(["--input", str(template)])
        result = json.loads(output.getvalue())
        self.assertEqual(exit_code, 2)
        self.assertEqual(result["status"], "NO_STUDY_DATA")
        self.assertNotIn("coefficient", result)

    def test_computes_perceived_ease_and_intention_scores_and_pearson(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "synthetic.csv"
            write_csv(source, synthetic_rows())
            rows = load_observations(source)
        self.assertEqual(rows[0]["peou_score"], 1.0)
        self.assertEqual(rows[0]["intention_score"], 1.0)
        result = analyze(rows, method="pearson")
        self.assertEqual(result["method"], "Pearson product-moment")
        self.assertAlmostEqual(result["coefficient"], 1.0)
        self.assertGreaterEqual(result["confidence_interval_95"][0], -1.0)
        self.assertLessEqual(result["confidence_interval_95"][1], 1.0)

    def test_spearman_analysis_has_reproducible_bootstrap_interval(self):
        rows = [
            {
                "participant_code": f"SYNTH-P{index + 1:02d}",
                "peou_score": float(x),
                "intention_score": float(y),
            }
            for index, (x, y) in enumerate(
                [(1, 2), (2, 1), (3, 4), (4, 3), (5, 5), (2, 3), (4, 5), (1, 1)]
            )
        ]
        first = analyze(rows, method="spearman")
        second = analyze(rows, method="spearman")
        self.assertEqual(first["method"], "Spearman rank")
        self.assertEqual(first["confidence_interval_95"], second["confidence_interval_95"])
        self.assertEqual(len(first["confidence_interval_95"]), 2)

    def test_auto_selects_spearman_when_marginal_normality_screen_fails(self):
        rows = [
            {
                "participant_code": f"SYNTH-P{index + 1:02d}",
                "peou_score": float(value),
                "intention_score": float(value),
            }
            for index, value in enumerate([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 5])
        ]
        result = analyze(rows)
        self.assertEqual(result["method"], "Spearman rank")
        self.assertTrue(
            result["normality_screen"]["peou_p_value"] < 0.05
            or result["normality_screen"]["intention_p_value"] < 0.05
        )

    def test_rejects_wrong_columns_duplicate_codes_and_invalid_likert_values(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "responses.csv"
            rows = synthetic_rows(2)
            write_csv(source, rows, fields=["participant_code", "wrong_item"])
            with self.assertRaisesRegex(ValueError, "CSV columns must be exactly"):
                load_observations(source)

            write_csv(source, [rows[0], rows[0]])
            with self.assertRaisesRegex(ValueError, "duplicate participant_code"):
                load_observations(source)

            invalid = dict(rows[0], peou_item_2=6)
            write_csv(source, [invalid])
            with self.assertRaisesRegex(ValueError, "peou_item_2 must be an integer"):
                load_observations(source)

    def test_rejects_constant_scale_scores(self):
        rows = [
            {"participant_code": f"SYNTH-P{index}", "peou_score": 3.0, "intention_score": float(index)}
            for index in range(1, 4)
        ]
        with self.assertRaisesRegex(ValueError, "zero variance"):
            analyze(rows, method="pearson")


if __name__ == "__main__":
    unittest.main()
