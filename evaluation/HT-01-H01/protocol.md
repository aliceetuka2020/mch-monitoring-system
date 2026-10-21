# HT-01 / H01 — Manual versus system retrieval time

## Status

This folder contains a study protocol, an empty data-collection template, and an analysis script. No participant observations have been collected here, so no hypothesis test, p-value, confidence interval, effect estimate, or study conclusion is reported.

## Data collection

- Recruit and identify participants only through the approved study process. Store no names, contact details, patient identifiers, or other direct identifiers in this CSV; use an approved, separately stored participant code.
- Give each participant the same predefined retrieval tasks in both workflows. Use the same task code for each paired manual and system measurement.
- Record one row for each participant-task pair. Time both retrievals in seconds using the same start and stop rules. Record whether manual or system retrieval was performed first in `sequence_order`.
- Counterbalance or randomize workflow order across participants where the study protocol allows it. Keep task wording, record content, equipment, and instructions consistent between workflows.
- Do not use live patient records unless the study has explicit approval and the records are appropriately de-identified. Prefer synthetic records for task scenarios.
- Preserve original measurements. Document exclusions and protocol deviations separately in approved study records, not by silently deleting or editing CSV rows.

## CSV fields and validation

`retrieval-times-template.csv` is header-only and contains no observations.

| Field | Meaning |
| --- | --- |
| `participant_code` | Study-approved pseudonymous participant code |
| `task_code` | Stable code for the same retrieval task in both workflows |
| `manual_seconds` | Positive finite elapsed time for manual retrieval |
| `system_seconds` | Positive finite elapsed time for system retrieval |
| `sequence_order` | `manual_first` or `system_first` |

Each participant-task pair must occur once. Every participant must have the same task-code set. The analysis first averages each workflow's measurements across tasks within each participant, then performs a paired analysis across participants; this avoids treating repeated tasks by one participant as independent observations.

## Analysis plan

- Two-sided alpha: `0.05`.
- Paired difference: participant's mean manual time minus mean system time. A positive difference means the system was faster on average.
- With at least three participants, use Shapiro-Wilk on participant-level paired differences as a normality screen. If its p-value is at least alpha and the differences are not constant, use a paired t-test. Otherwise use a two-sided Wilcoxon signed-rank test.
- The Shapiro-Wilk decision is an operational screening rule, not proof of normality. The paired t-test also assumes independent participants and no influential outliers. Wilcoxon signed-rank assumes suitably symmetric paired differences for a location interpretation; if that assumption is implausible, consult a statistician rather than treating the fallback as automatically valid.
- With fewer than three participants, do not claim the normality screen is satisfied; use Wilcoxon when there are at least two usable participants. With fewer than two participants, report descriptive values only and no inferential test.
- The script reports the chosen method, sample size, Shapiro-Wilk result when assessed, paired difference summaries, statistic, p-value, and alpha. A p-value below alpha is evidence against the null under the stated assumptions; it does not prove the alternative or establish clinical importance.
- If the input has no observation rows, the script exits with a `NO_STUDY_DATA` message and does not calculate test statistics.

## Run

Install the isolated evaluation dependency from this folder:

```text
python -m pip install -r requirements.txt
```

Analyze a populated, approved study CSV (the template remains unchanged):

```text
python analyze_retrieval_times.py --input path\to\approved-study-data.csv
```

Run software validation only:

```text
python test_analyze_retrieval_times.py
```

The tests use explicitly synthetic fixtures to validate parsing and method selection. Their output is not study data and must not be included in research findings.
