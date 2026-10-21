# HT-07 / H07 — Growth-record tracking and comparison

## Status

This folder provides a protocol, a blank paired-observation template, an analysis script, and software validation tests. No worker observations or real child records are included. The hypothesis is **not tested with study data**.

## Task and collection procedure

Use study-created synthetic child profiles only. Do not use actual patient records or include names, dates of birth, patient identifiers, or clinical measurements copied from real records. Each pseudonymous assessor completes one matched task using the same synthetic profile twice:

1. Retrieve and compare the profile's historical and current measurements using the prespecified manual/reference workflow.
2. Retrieve and compare those same measurements using the application.

The task should require the assessor to identify the historical and current measurement dates and values for the measures in a frozen checklist, then state whether the profile shows a change. The study team should define the correct answer key before testing. Do not alter the synthetic profile or answer key between modes.

Use a counterbalanced or randomized mode order (`MANUAL_FIRST` or `SYSTEM_FIRST`) to reduce order and learning effects. Use the same instructions, task limit, environment, and checklist in each mode. Record task success only when all prespecified task actions and the comparison answer are correct. Record the number of required checklist items correctly retrieved and compared in each mode. Record elapsed seconds from task start until correct completion or the common time limit; a task that reaches the limit without completion is unsuccessful and its recorded time is the limit. A trained observer should use the same timing and scoring rules across modes.

Enter one row per assessor, with a unique pseudonymous `assessor_code`, and use the same `scenario_code` for the paired manual/system attempts. To avoid unmodeled clustering, each assessor contributes only one paired task. Keep any participation records separately; this CSV should not contain names, staff IDs, patient identifiers, actual child data, or free-text clinical information.

Before collection, freeze the task checklist, answer key, task limit, synthetic profiles, scoring rubric, and application version. Record deviations and exclusions in approved study notes; do not silently discard incomplete pairs.

## Measures and analysis

- Task success: report successful tasks / assessors by mode and Wilson 95% confidence intervals.
- Completeness: per assessor, correctly retrieved and compared checklist items divided by the fixed required-item count. Report the mean participant-level proportion by mode with a percentile-bootstrap 95% confidence interval.
- Time: report mean observed task seconds by mode with percentile-bootstrap 95% confidence intervals. Failed attempts are included at the common time limit as specified above.
- Paired effects: report system-minus-manual differences in task-success percentage points, mean completeness percentage points, and mean elapsed seconds, each with a paired-observation percentile-bootstrap 95% confidence interval. Resample assessor pairs together, not manual and system rows independently. The bootstrap uses a deterministic seed for reproducibility; intervals are approximate and should be interpreted cautiously for small samples.
- Paired task-success comparison: use the two-sided exact McNemar/binomial test on discordant assessor pairs with alpha = 0.05. Report the discordance counts. With no discordances, p = 1. This test is not an adjustment for order effects and does not establish clinical benefit.
- The time and completeness intervals are descriptive uncertainty intervals; no additional p-values are calculated for those measures. Interpret all effects in the context of the task design, order, participant experience, and small-sample limitations. Do not label the hypothesis accepted or rejected from statistical significance alone.
- An empty template returns `NO_STUDY_DATA` and no performance metrics. Invalid values, duplicate assessor codes, and inconsistent paired inputs must produce explicit errors.

## Software validation

Run the focused validation test:

```text
python evaluation\HT-07-H07\test_analyze_growth_comparison.py
```

All observations inside the test cases are synthetic software fixtures. They are not user-study observations or findings.

## Analyze approved observations

After the protocol, scoring key, and study data are approved, pass the completed template explicitly:

```text
python evaluation\HT-07-H07\analyze_growth_comparison.py --input path\to\approved-growth-comparison.csv
```
