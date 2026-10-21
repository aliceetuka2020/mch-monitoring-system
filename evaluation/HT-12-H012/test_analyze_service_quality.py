import csv
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

from analyze_service_quality import (
    NoStudyDataError,
    analyze,
    load_observations,
    load_plan,
    main,
)


PLAN_FIELDS = [
    "indicator_code",
    "label",
    "operational_definition",
    "measurement_source",
    "denominator",
    "indicator_type",
    "unit",
    "expected_direction",
    "minimum",
    "maximum",
]
OBSERVATION_FIELDS = ["participant_code", "timepoint", "indicator_code", "value"]


def write_csv(path, fields, rows):
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def synthetic_plan():
    return {
        "task_time": {
            "indicator_code": "task_time",
            "label": "Task time",
            "operational_definition": "Elapsed seconds for a standardized task",
            "measurement_source": "Timestamped task log",
            "denominator": "One task per unit per timepoint",
            "indicator_type": "continuous",
            "unit": "seconds",
            "expected_direction": "lower",
            "minimum": None,
            "maximum": None,
        },
        "follow_up": {
            "indicator_code": "follow_up",
            "label": "Correctly flagged",
            "operational_definition": "Eligible follow-up correctly identified for action",
            "measurement_source": "Approved follow-up audit",
            "denominator": "One eligible follow-up per unit per timepoint",
            "indicator_type": "binary",
            "unit": "proportion",
            "expected_direction": "higher",
            "minimum": 0.0,
            "maximum": 1.0,
        },
        "satisfaction": {
            "indicator_code": "satisfaction",
            "label": "Satisfaction",
            "operational_definition": "Approved instrument score",
            "measurement_source": "Approved questionnaire",
            "denominator": "One respondent per unit per timepoint",
            "indicator_type": "ordinal",
            "unit": "1-5 rating",
            "expected_direction": "higher",
            "minimum": 1.0,
            "maximum": 5.0,
        },
    }


def paired_rows():
    rows = []
    differences = [-4, -3, -2, -1, 1, 2, 3, 4]
    for index, difference in enumerate(differences, start=1):
        participant = f"SYNTH-P{index:02d}"
        rows.extend(
            [
                {"participant_code": participant, "timepoint": "baseline", "indicator_code": "task_time", "value": 20 + index},
                {"participant_code": participant, "timepoint": "post", "indicator_code": "task_time", "value": 20 + index + difference},
                {"participant_code": participant, "timepoint": "baseline", "indicator_code": "follow_up", "value": index % 2},
                {"participant_code": participant, "timepoint": "post", "indicator_code": "follow_up", "value": (index + 1) % 2},
                {"participant_code": participant, "timepoint": "baseline", "indicator_code": "satisfaction", "value": 2},
                {"participant_code": participant, "timepoint": "post", "indicator_code": "satisfaction", "value": 4},
            ]
        )
    return rows


class ServiceQualityAnalysisTests(unittest.TestCase):
    def test_plan_records_the_prespecified_definition_source_and_denominator(self):
        plan = load_plan(Path(__file__).with_name("indicator-plan-template.csv"))
        self.assertTrue(plan["task_time"]["operational_definition"])
        self.assertTrue(plan["task_time"]["measurement_source"])
        self.assertTrue(plan["task_time"]["denominator"])
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "incomplete-plan.csv"
            rows = [
                {
                    "indicator_code": "task_time",
                    "label": "Task time",
                    "operational_definition": "",
                    "measurement_source": "Timestamped task log",
                    "denominator": "One task per unit",
                    "indicator_type": "continuous",
                    "unit": "seconds",
                    "expected_direction": "lower",
                    "minimum": "",
                    "maximum": "",
                }
            ]
            write_csv(source, PLAN_FIELDS, rows)
            with self.assertRaisesRegex(ValueError, "operational_definition"):
                load_plan(source)

    def test_header_only_template_reports_no_study_data_without_statistics(self):
        plan_path = Path(__file__).with_name("indicator-plan-template.csv")
        observations_path = Path(__file__).with_name("service-quality-observations-template.csv")
        plan = load_plan(plan_path)
        with self.assertRaisesRegex(NoStudyDataError, "NO_STUDY_DATA"):
            load_observations(observations_path, plan, "paired")
        output = io.StringIO()
        with redirect_stdout(output):
            exit_code = main(
                [
                    "--plan",
                    str(plan_path),
                    "--input",
                    str(observations_path),
                    "--design",
                    "paired",
                ]
            )
        self.assertEqual(exit_code, 2)
        result = json.loads(output.getvalue())
        self.assertEqual(result["status"], "NO_STUDY_DATA")
        self.assertNotIn("results", result)

    def test_paired_design_selects_paired_t_test_and_exact_binary_and_ordinal_tests(self):
        plan = synthetic_plan()
        result = analyze(paired_rows(), plan, "paired")
        by_code = {row["indicator_code"]: row for row in result["results"]}
        self.assertEqual(result["design"], "paired")
        self.assertEqual(by_code["task_time"]["test"], "Paired t-test (two-sided)")
        self.assertAlmostEqual(by_code["task_time"]["mean_difference_post_minus_baseline"], 0.0)
        self.assertEqual(by_code["follow_up"]["test"], "Exact McNemar test (two-sided)")
        self.assertEqual(by_code["satisfaction"]["test"], "Exact sign test (two-sided)")
        self.assertEqual(by_code["satisfaction"]["p_value_two_sided"], 2 / 256)
        self.assertIsNotNone(by_code["task_time"]["p_value_holm_adjusted"])

    def test_paired_continuous_falls_back_to_wilcoxon_for_skewed_differences(self):
        plan = {"task_time": synthetic_plan()["task_time"]}
        rows = []
        for index, difference in enumerate([1, 1, 1, 1, 1, 1, 1, 20], start=1):
            participant = f"SYNTH-P{index:02d}"
            rows.extend(
                [
                    {"participant_code": participant, "timepoint": "baseline", "indicator_code": "task_time", "value": 30},
                    {"participant_code": participant, "timepoint": "post", "indicator_code": "task_time", "value": 30 + difference},
                ]
            )
        summary = analyze(rows, plan, "paired")["results"][0]
        self.assertEqual(summary["test"], "Wilcoxon signed-rank test (two-sided)")
        self.assertLess(summary["normality_screen"]["p_value"], 0.05)

    def test_independent_design_selects_fisher_and_mann_whitney(self):
        plan = {
            "follow_up": synthetic_plan()["follow_up"],
            "satisfaction": synthetic_plan()["satisfaction"],
        }
        rows = []
        for timepoint, codes in (("baseline", [0, 0, 0, 1, 1]), ("post", [1, 1, 1, 1, 0])):
            for index, value in enumerate(codes, start=1):
                participant = f"SYNTH-{timepoint}-{index}"
                rows.extend(
                    [
                        {"participant_code": participant, "timepoint": timepoint, "indicator_code": "follow_up", "value": value},
                        {
                            "participant_code": participant,
                            "timepoint": timepoint,
                            "indicator_code": "satisfaction",
                            "value": index if timepoint == "baseline" else min(index + 1, 5),
                        },
                    ]
                )
        by_code = {
            row["indicator_code"]: row
            for row in analyze(rows, plan, "independent")["results"]
        }
        self.assertEqual(by_code["follow_up"]["test"], "Fisher exact test (two-sided)")
        self.assertEqual(by_code["satisfaction"]["test"], "Mann-Whitney U test (two-sided)")

    def test_independent_continuous_uses_welch_test_when_both_screens_pass(self):
        plan = {"task_time": synthetic_plan()["task_time"]}
        baseline = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19]
        post = [20, 21, 22, 23, 24, 25, 26, 27, 28, 29]
        rows = [
            {
                "participant_code": f"SYNTH-{timepoint}-{index}",
                "timepoint": timepoint,
                "indicator_code": "task_time",
                "value": value,
            }
            for timepoint, values in (("baseline", baseline), ("post", post))
            for index, value in enumerate(values, start=1)
        ]
        summary = analyze(rows, plan, "independent")["results"][0]
        self.assertEqual(summary["test"], "Welch independent-samples t-test (two-sided)")
        self.assertEqual(summary["mean_difference_post_minus_baseline"], 10.0)

    def test_independent_single_unit_groups_are_descriptive_only(self):
        plan = {"follow_up": synthetic_plan()["follow_up"]}
        rows = [
            {"participant_code": "SYNTH-B01", "timepoint": "baseline", "indicator_code": "follow_up", "value": 0},
            {"participant_code": "SYNTH-P01", "timepoint": "post", "indicator_code": "follow_up", "value": 1},
        ]
        summary = analyze(rows, plan, "independent")["results"][0]
        self.assertIsNone(summary["p_value_two_sided"])
        self.assertIsNone(summary["test"])
        self.assertIn("at least two independent units", summary["inference_note"])

    def test_interprets_observed_change_against_expected_direction(self):
        plan = {"task_time": synthetic_plan()["task_time"]}
        plan["task_time"]["expected_direction"] = "higher"
        rows = [
            {"participant_code": "SYNTH-P01", "timepoint": "baseline", "indicator_code": "task_time", "value": 10},
            {"participant_code": "SYNTH-P01", "timepoint": "post", "indicator_code": "task_time", "value": 12},
            {"participant_code": "SYNTH-P02", "timepoint": "baseline", "indicator_code": "task_time", "value": 11},
            {"participant_code": "SYNTH-P02", "timepoint": "post", "indicator_code": "task_time", "value": 10},
        ]
        summary = analyze(rows, plan, "paired")["results"][0]
        self.assertEqual(
            summary["change_interpretation"],
            "Increase matches the prespecified improvement direction.",
        )

        plan["task_time"]["expected_direction"] = "lower"
        summary = analyze(rows, plan, "paired")["results"][0]
        self.assertEqual(
            summary["change_interpretation"],
            "Increase opposes the prespecified improvement direction.",
        )

        rows[-1]["value"] = 9
        summary = analyze(rows, plan, "paired")["results"][0]
        self.assertEqual(summary["change_interpretation"], "No mean change was observed.")

    def test_holm_adjustment_is_monotone_and_capped(self):
        from analyze_service_quality import _holm_adjust

        results = [
            {"p_value_two_sided": 0.01},
            {"p_value_two_sided": 0.04},
            {"p_value_two_sided": 0.5},
        ]
        _holm_adjust(results)
        adjusted = [row["p_value_holm_adjusted"] for row in results]
        self.assertEqual(adjusted, [0.03, 0.08, 0.5])

    def test_rejects_invalid_design_and_duplicate_or_out_of_plan_observations(self):
        plan = {"task_time": synthetic_plan()["task_time"]}
        with self.assertRaisesRegex(ValueError, "design must be paired or independent"):
            load_observations("not-used.csv", plan, "crossover")
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "observations.csv"
            valid_pair = [
                {"participant_code": "SYNTH-P01", "timepoint": "baseline", "indicator_code": "task_time", "value": 10},
                {"participant_code": "SYNTH-P01", "timepoint": "post", "indicator_code": "task_time", "value": 9},
            ]
            write_csv(source, OBSERVATION_FIELDS, valid_pair + [valid_pair[0]])
            with self.assertRaisesRegex(ValueError, "duplicate unit/timepoint/indicator"):
                load_observations(source, plan, "paired")
            write_csv(
                source,
                OBSERVATION_FIELDS,
                [
                    dict(row, indicator_code="unplanned")
                    for row in valid_pair
                ],
            )
            with self.assertRaisesRegex(ValueError, "absent from the locked plan"):
                load_observations(source, plan, "paired")

    def test_rejects_reused_participant_in_independent_design_and_binary_nonbinary(self):
        plan = {"follow_up": synthetic_plan()["follow_up"]}
        rows = [
            {"participant_code": "SYNTH-P01", "timepoint": "baseline", "indicator_code": "follow_up", "value": 1},
            {"participant_code": "SYNTH-P01", "timepoint": "post", "indicator_code": "follow_up", "value": 0},
        ]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "observations.csv"
            write_csv(source, OBSERVATION_FIELDS, rows)
            with self.assertRaisesRegex(ValueError, "must not reuse participant_code"):
                load_observations(source, plan, "independent")
            invalid = [dict(row, value=2) for row in rows]
            write_csv(
                source,
                OBSERVATION_FIELDS,
                [
                    {"participant_code": "SYNTH-B01", "timepoint": "baseline", "indicator_code": "follow_up", "value": 2},
                    {"participant_code": "SYNTH-P01", "timepoint": "post", "indicator_code": "follow_up", "value": 0},
                ],
            )
            with self.assertRaisesRegex(ValueError, "outside the plan bounds"):
                load_observations(source, plan, "independent")

    def test_rejects_incomplete_paired_observations(self):
        plan = {"task_time": synthetic_plan()["task_time"]}
        rows = [
            {"participant_code": "SYNTH-P01", "timepoint": "baseline", "indicator_code": "task_time", "value": 12},
            {"participant_code": "SYNTH-P02", "timepoint": "baseline", "indicator_code": "task_time", "value": 13},
            {"participant_code": "SYNTH-P01", "timepoint": "post", "indicator_code": "task_time", "value": 10},
        ]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "incomplete.csv"
            write_csv(source, OBSERVATION_FIELDS, rows)
            with self.assertRaisesRegex(ValueError, "same participant_code set"):
                load_observations(source, plan, "paired")


if __name__ == "__main__":
    unittest.main()
