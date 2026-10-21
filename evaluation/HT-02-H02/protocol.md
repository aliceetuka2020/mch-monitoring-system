# HT-02 / H02 — Record accuracy, completeness, and duplicates

## Status

This folder contains data-collection templates, a validation/analysis script, and software-only tests. No verified reference data or system-record observations are included. Therefore, there are no study accuracy rates, completeness rates, duplicate rates, inferential results, or conclusions.

## Study preparation and privacy

- Define the record population, sampling frame, fields, allowable values, and review period before collection. Use the same in-scope records and field definitions for the reference and system extracts.
- Establish the reference independently from the system records and verify it against the approved source. Record the source, extraction date, adjudication rules, and exclusions in approved study documentation.
- Use an authorized reviewer to map each record to a pseudonymous `reference_record_code`. Keep any re-identification key separate with access controls; do not place names, phone numbers, patient IDs, or direct identifiers in either CSV.
- Include one field-comparison row for each in-scope reference-record/field pair. Blank `reference_value` means the field is not applicable or was not captured in the reference and will be excluded from accuracy and completeness denominators; document any such exclusions.
- Use blank `system_value` to represent an empty/missing system value. A non-empty value is treated as present. Values are compared after trimming surrounding whitespace and case-folding; do not apply clinical equivalence or fuzzy matching without a prespecified field-specific adjudication rule.
- In `system-records-template.csv`, include one row per system record in the defined study population. Link records to the canonical reference code when verified. Leave that code blank for an unmatched/orphan system record. Each `system_record_code` must be unique and pseudonymous.
- A duplicate is an additional system record linked to the same canonical reference record. Duplicate rate is reported as extra linked system records divided by all linked system records. Unmatched/orphan records are counted separately and are not classified as duplicates by this metric.
- Resolve uncertain matches and disagreements using the study's prespecified adjudication process; preserve provenance and document exclusions instead of silently altering collected values.

## Measures and statistical analysis

- Field accuracy: exact normalized matches divided by rows with a non-empty reference value, reported by field and overall with numerator/denominator and Wilson 95% confidence intervals. This is descriptive; rows/fields from the same record may be correlated, so these intervals must not be interpreted as cluster-adjusted inference.
- Field completeness: non-empty system values divided by non-empty reference values, reported by field and overall with numerator/denominator. Also report missing-system counts.
- Paired completeness comparison: for each eligible record-field pair, compare whether the reference and system values are present. Use a two-sided exact McNemar/binomial test on discordant pairs (reference-present/system-missing versus reference-missing/system-present), alpha 0.05. Report discordant counts; if there are no discordances, p=1. A significant result indicates a difference in completeness, not which workflow is clinically preferable.
- The completeness comparison only includes record-field pairs supplied in the comparison CSV. It tests presence, not accuracy of values. Avoid treating multiple fields from one record as independent when making population-level claims; use a cluster-aware method/statistician when that dependence affects inference.
- Duplicate rate: report linked-system-record count, extra duplicate count, duplicate rate, unmatched/orphan system-record count, and Wilson 95% confidence interval. No paired duplicate test is performed because this template does not establish a matched duplicate outcome in a comparison workflow.
- Use alpha = 0.05. Statistical significance is not proof of practical or clinical importance. Do not claim an accepted hypothesis from descriptive results or a p-value alone.
- If either required CSV has headers but no data rows, return `NO_STUDY_DATA`; do not calculate study metrics. Invalid or inconsistent inputs must produce explicit validation errors, not silently dropped rows.

## Software validation

Run the focused validation tests:

```text
python evaluation\HT-02-H02\test_analyze_record_quality.py
```

The test fixtures are explicitly synthetic and validate parser, metric, duplicate, and no-data behavior only. They are not study observations and must not be cited as study findings.

## Analyze approved collected data

Keep the templates unchanged and pass completed, approved files explicitly:

```text
python evaluation\HT-02-H02\analyze_record_quality.py --fields path\to\approved-field-comparison.csv --records path\to\approved-system-records.csv
```
