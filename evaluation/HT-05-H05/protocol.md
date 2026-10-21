# HT-05 / H05 — Identification of children due or overdue for immunization

## Status

This folder contains a blank data-collection template, an analysis script, and a tiny synthetic fixture for software validation. The synthetic fixture is not an independently verified clinical reference dataset and is not study data. No study observations were supplied; therefore, study performance and the hypothesis remain **not tested**.

## Reference verification and collection

The evaluation unit is one prespecified scheduled vaccine dose per sampled child at a fixed `as_of_date`. Include at most one row per child so paired classification tests are not inflated by multiple dose observations from the same child. Select the dose using a prespecified sampling rule; do not choose doses after seeing system results.

Before collection, an authorized clinical reviewer must verify the schedule version, target population, due-date/grace-period rule, and what counts as a valid prior dose against the applicable national/clinical guidance. A second reviewer should independently check the reference classification or disagreements should follow a documented adjudication procedure. Record the approved schedule/rule version with the study materials. The reference flag must be assigned independently of the system flag; the system flag must be transcribed from the evaluated application output at the same as-of date.

For both flags, `1` means the dose is due or overdue and has not been recorded as given under the approved rule; `0` means it is not due/overdue (including already given, if that is the approved target classification). The application currently distinguishes `Given`, `Due`, and `Overdue`; prespecify how these map to this binary target and use the same rule for reference and system output.

Use a pseudonymous `child_code`, not a name, patient ID, phone number, or other direct identifier. Keep any re-identification key separately under approved access controls. The blank template contains no observations. The synthetic fixture uses only unmistakable synthetic labels and must never be merged into study data.

## Measures and analysis

Treat the independently assigned reference flag as the classification target and the application flag as the test result. Report the confusion counts:

- True positive (TP): reference due/overdue and system flagged.
- False negative (FN): reference due/overdue and system did not flag (missed flag).
- False positive (FP): reference not due/overdue and system flagged (incorrect flag).
- True negative (TN): reference not due/overdue and system did not flag.

Calculate sensitivity `TP/(TP+FN)`, specificity `TN/(TN+FP)`, and precision/positive predictive value `TP/(TP+FP)`. Report each as unavailable (`null`) when its denominator is zero. Also report counts and missed/incorrect flags explicitly. Do not interpret precision as population prevalence or claim performance outside the sampled population.

As a secondary paired comparison, use a two-sided exact McNemar/binomial test on false negatives versus false positives, alpha = 0.05. This tests marginal symmetry of paired binary flags, not whether the classifier is clinically acceptable. It is appropriate only when each child contributes one independent paired evaluation unit and reference adjudication is independent of the application result. With no discordant pairs, p = 1. Do not use a significant p-value as a substitute for sensitivity/specificity or a clinical conclusion.

Inputs must have unique pseudonymous child/evaluation codes, binary `0`/`1` flags, and a single prespecified as-of date and schedule/rule version. Invalid input must fail explicitly. An empty template returns `NO_STUDY_DATA` with no performance measures or inferential statistics.

## Software validation

Run only the focused validation test:

```text
python evaluation\HT-05-H05\test_analyze_immunization_flags.py
```

Tests use the separate `synthetic-validation-fixture.csv` and assert its known confusion counts and metrics. Those values are fabricated solely as software test fixtures, not observations, reference-standard validation, or study results.

## Analyze approved study observations

After clinical schedule verification, reference adjudication, and data approval, pass the completed study file:

```text
python evaluation\HT-05-H05\analyze_immunization_flags.py --input path\to\approved-immunization-flags.csv
```
