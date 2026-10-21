# HT-04 / H04 — ANC completeness and visit-history continuity

## Status

This folder contains a candidate ANC checklist, an empty paired-observation template, and a validation/analysis script. No participant observations are supplied. The hypothesis is therefore **not tested with data**, and no study rates, p-values, or conclusions are reported.

## Checklist and data collection

The candidate checklist follows fields in the application's `AncRecord` model and ANC patient-record view:

1. Visit date
2. Gestational age
3. Weight
4. Blood pressure
5. Symptoms
6. Clinical notes
7. Laboratory information
8. Foetal assessment
9. Medications and supplements
10. Health education
11. Next visit

These are candidate evaluation fields, not a claim that every field is clinically mandatory at every encounter. Before collecting data, a qualified ANC reviewer must approve which fields are required, define when each may be not applicable, and freeze that checklist for both periods. Do not compare results if the checklist changes between periods.

Use one row per pseudonymous pregnancy/record with comparable baseline and follow-up observations. Enter `1` when the field is complete, `0` when incomplete, and `NA` only when the approved checklist deems it not applicable. Use `1`/`0` for whether the patient's prior ANC visit history was accessible at each observation. Record the observation dates as ISO `YYYY-MM-DD`, with follow-up after baseline. Keep any re-identification key separately under approved access controls. Never enter names, phone numbers, patient IDs, free-text clinical values, or other direct identifiers in this template.

Document sampling, data sources, exclusions, reviewer decisions, and any workflow changes in approved study records. The template records an observed history-accessibility outcome; it does not establish why history was or was not accessible.

## Measures and analysis

- For each candidate field and period, report completed / applicable observations and the completion proportion. `NA` values are excluded from that field's denominator.
- Also report pooled field-level completion by period. This is descriptive across field-observations and may not be interpreted as a patient-level estimate.
- For the paired record-level checklist measure, compare complete versus incomplete status across baseline and follow-up using only checklist fields marked applicable in both periods for that record. A record is complete when all such common fields are marked complete. Records without common applicable fields are excluded from this paired measure.
- Compare paired history accessibility (accessible/inaccessible) at baseline and follow-up separately.
- For both paired binary outcomes, use the two-sided exact McNemar/binomial test on discordant pairs, with alpha = 0.05. Report the two discordant counts and p-value. With no discordant pairs, p = 1.
- Report a statistically significant difference only as evidence of a paired change, not proof of causality or clinical benefit. Do not state that a hypothesis is accepted or rejected based on a p-value alone. The observational before/after design may be affected by time, case mix, and other workflow changes.
- If the template has headers but no observations, return `NO_STUDY_DATA` without calculating study metrics. Invalid entries and duplicate record codes are errors; do not silently discard them.

## Software validation

Run the focused validation test:

```text
python evaluation\HT-04-H04\test_analyze_anc_completeness.py
```

Test fixtures use explicitly synthetic values and validate the script only. They are not study observations and must not be reported as study findings.

## Analyze approved observations

After reviewer approval and collection, pass the completed file explicitly:

```text
python evaluation\HT-04-H04\analyze_anc_completeness.py --input path\to\approved-anc-completeness.csv
```
