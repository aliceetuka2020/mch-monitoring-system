# HT-12 / H012 — Overall healthcare service-delivery quality

## Status and scope

This folder contains a configurable indicator plan, a blank long-format observation template, an analysis script, and software validation tests. No service-quality observations or approved evaluation instrument were supplied. H012 is **not tested with study data**. The included indicator rows are examples to replace or formally approve before collection; they are not clinical standards or an adopted instrument.

This evaluation can measure operational service-delivery indicators during a software pilot. A short pilot cannot establish improved maternal/child health, clinical quality, or patient outcomes.

## Instrument, design, and collection

- Before data collection, approve the evaluation instrument and freeze each indicator's operational definition, measurement source, denominator, unit, expected direction, time window, scoring rule, and missing-data/exclusion rule. Record the operational definition, source, denominator, bounds, and direction in `indicator-plan-template.csv`, then retain the dated approved plan. The bundled rows are illustrative only.
- Use the same task definitions, record eligibility rules, follow-up observation window, satisfaction instrument, and data capture conditions at baseline and post-implementation. Document version changes and deviations.
- Declare one design for the analysis: `paired` when the same participants, facilities, or other sampling units are measured at both timepoints; `independent` when distinct units form the baseline and post groups. Use the same unit consistently across all indicators. Do not label repeated observations as independent.
- Use a unique pseudonymous `participant_code` for each unit. In paired design, preserve that code across timepoints. In independent design, do not reuse a code across timepoints. Keep any re-identification key separately under approved access controls.
- Enter one numeric observation for every planned indicator and eligible unit at each required timepoint. The analyzer requires complete, balanced observations; it will not silently impute or exclude missing rows. Do not put names, patient identifiers, free text, or row-level clinical data in the CSV.
- Encode binary indicators as 0/1 and ordinal items as integer ratings within the approved plan's minimum/maximum. Continuous indicators may be decimal values. Define whether a binary denominator is eligible records, tasks, or other units before collection; enter one 0/1 value per sampling unit, not a group percentage.
- Document likely confounders and context separately (for example staffing, workload, case mix, training, concurrent policy changes, seasonality, and implementation period). This simple analyzer does not adjust for confounders or clustering; do not present its tests as causal estimates.

## Measures and analysis

- The null/alternative are H0: no baseline-to-post difference in the predefined service-quality indicators; H1: at least one indicator differs. Analyses are two-sided at alpha = 0.05. The hypothesis concerns measured indicators, not clinical outcomes.
- Produce a separate baseline/post summary and contrast for each predeclared indicator. Continuous values report means and medians; ordinal and binary values report means/proportions and medians as applicable. The direction is `post - baseline`; use the plan's expected direction to interpret improvement versus deterioration.
- Paired continuous indicators use Shapiro-Wilk on within-unit differences when at least three nonconstant differences exist. Select a paired t-test if the screen p-value is at least alpha; otherwise use a two-sided Wilcoxon signed-rank test. Paired ordinal indicators use a two-sided exact sign test; paired binary indicators use a two-sided exact McNemar test based on discordant pairs.
- Independent continuous indicators use Shapiro-Wilk screens in both groups when each has at least three nonconstant observations. Select Welch's two-sample t-test only if both screen p-values are at least alpha; otherwise use a two-sided Mann-Whitney U test. Independent ordinal indicators use Mann-Whitney U; independent binary indicators use a two-sided Fisher exact test.
- Normality screens do not prove assumptions. Inspect distributions, outliers, independence, measurement validity, and (for the Wilcoxon signed-rank interpretation) symmetry of paired differences. These unadjusted tests do not address confounding or facility/participant clustering.
- Adjust per-indicator p-values with Holm's family-wise correction across all analyzable planned indicators. Report raw and adjusted values, sample sizes, effect direction, and the test used. Do not infer that every indicator changed because one did; do not claim overall improvement without a prespecified decision rule and consideration of practical importance.
- A non-significant result does not establish equivalence or prove no effect. Do not accept/reject H0 based only on statistical significance. Report protocol deviations, missingness, and confounders alongside any real study analysis.
- A header-only observation CSV returns `NO_STUDY_DATA` and no inferential statistics. Wrong schema, out-of-range values, duplicate or incomplete unit/indicator/timepoint observations, and design/code reuse inconsistencies fail explicitly.

## Software validation

Run the focused synthetic-fixture validation:

```text
python evaluation\HT-12-H012\test_analyze_service_quality.py
```

These tests verify software behavior only. They are not study data and do not test the H012 hypothesis.

## Analyze approved observations

Install the isolated statistical dependency if needed:

```text
python -m pip install -r evaluation\HT-12-H012\requirements.txt
```

After the plan and instrument are approved, populate a separate copy of the template and analyze it with the design fixed in advance:

```text
python evaluation\HT-12-H012\analyze_service_quality.py --plan evaluation\HT-12-H012\indicator-plan-template.csv --input path\to\approved-service-quality-observations.csv --design paired
```

Use `--design independent` only for distinct baseline and post samples. Replace the example plan with the approved, locked indicator specification before conducting a study analysis.
