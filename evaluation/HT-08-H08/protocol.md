# HT-08 / H08 — Routine report preparation time: manual vs system

## Status

This folder contains the study protocol, a blank data-collection template, an analysis script, a pinned-range dependency declaration, and focused software tests. No participant timing observations are included. The hypothesis is **not tested with study data**.

## Paired report task and collection

- Freeze the report specification, source dataset/version, date range, filters, required output fields, and report acceptance checklist before timing begins. Manual and system workflows must produce equivalent reports from the same source data and report specification.
- Prefer a study-approved synthetic or de-identified dataset. Do not put names, contact details, patient identifiers, row-level clinical values, or exported report contents into this timing CSV.
- Give each participant the same report tasks under both workflows. Use the same `report_code` for one matched task and record the same `dataset_code` for the source data used in both modes. Dataset codes identify a controlled dataset/version; no dataset content goes in the CSV.
- Record elapsed seconds from the same defined start point (task instructions released) to the same end point (report saved and checked against the frozen acceptance checklist). Use consistent equipment, instructions, report requirements, and time-limit rules.
- Record whether manual or system preparation occurred first. Counterbalance or randomize order across participants, and document the allocation procedure. Keep the report specification and dataset unchanged between paired workflows.
- Include only completed, valid report attempts, or apply a prespecified common time-limit/censoring rule consistently to both modes. Document interruptions, exclusions, and protocol deviations in approved study notes; do not silently discard rows.
- Enter one row per participant/report pair. Each participant must complete the same report-code set; every report code must map to the same dataset code for every participant. The analysis averages multiple report tasks within each participant before group-level paired inference, so repeated reports do not count as independent participants.
- Use unique pseudonymous participant codes. Store any code key separately under study-approved access controls.

## Measures and analysis

- Alpha is 0.05, two-sided.
- Paired difference is participant mean manual preparation time minus participant mean system preparation time. A positive difference indicates the system workflow took less time on average.
- Report the number of participants, report tasks per participant, observation rows, workflow mean times, mean and median paired differences, standard deviation of paired differences, and exact test method/statistic/p-value.
- With at least three participants and non-constant differences, use Shapiro–Wilk on participant-level paired differences as a normality screen. If the screen p-value is at least alpha, select a paired t-test; otherwise select a two-sided Wilcoxon signed-rank test. The screen is not proof of normality.
- With constant paired differences or fewer than three participants, do not infer normality; select the two-sided Wilcoxon signed-rank test if at least two participants have observations. With fewer than two participants, report descriptive values only.
- The paired t-test assumes independent participants and approximately normally distributed paired differences, with no influential outliers. Inspect a difference plot as well as the Shapiro–Wilk screen. Wilcoxon signed-rank assumes suitably symmetric paired differences for a location interpretation; if that assumption is implausible, seek statistical advice instead of treating the fallback as automatically valid.
- The order variable helps identify/counterbalance order but does not adjust the test for learning, fatigue, or carryover effects. Report order allocation and deviations alongside study results.
- A non-significant result is not evidence of equivalence. Do not label the hypothesis accepted/rejected solely from a p-value, and distinguish statistical evidence from practical importance.
- If the CSV has headers but no observations, return `NO_STUDY_DATA` and calculate no study statistics. Invalid times, duplicate participant/report pairs, inconsistent report tasks, or inconsistent dataset mappings must fail explicitly.

## Software validation

Run the focused validation test:

```text
python evaluation\HT-08-H08\test_analyze_report_times.py
```

The test cases use synthetic values only to validate parsing, aggregation, and statistical method selection. They are not user-study observations.

## Analyze approved study observations

Install the isolated statistical dependency if needed:

```text
python -m pip install -r evaluation\HT-08-H08\requirements.txt
```

Analyze a populated, approved study CSV (leave the template unchanged):

```text
python evaluation\HT-08-H08\analyze_report_times.py --input path\to\approved-report-times.csv
```
