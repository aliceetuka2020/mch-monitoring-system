# HT-11 / H011 — Perceived usefulness and intention to use

## Status

This folder contains a header-only post-pilot questionnaire template, analysis script, and software validation tests. No participant responses are included. The hypothesis is **not tested with study data**; no association, p-value, confidence interval, regression estimate, or conclusion is available.

## Instrument and collection

- Before recruitment, choose and approve a validated instrument appropriate to the application and study population. Freeze the exact perceived usefulness (PU) and behavioral intention (BI) wording, language/translation, response anchors, reverse-scoring rules, and scoring instructions. The item codes below are schema placeholders, not validated question wording.
- The template includes four PU items and three BI items. If the approved instrument differs, revise the template and script's required item list together before collecting responses. Do not alter items/scoring after inspecting results.
- Use one row per consenting pilot participant with a pseudonymous `participant_code`; keep any re-identification key separately under approved access controls. Do not put names, contact details, patient information, free-text answers, or direct identifiers in the CSV.
- The analyzer assumes a 1–5 Likert scale. Use it only if that is the approved response range. Reverse-score prespecified items before entry so higher values consistently mean more perceived usefulness or stronger intention. The analyzer requires complete item responses and will not silently impute or drop missing answers.
- Administer the questionnaire after a defined structured pilot exposure, using the same instructions and timing for all participants. Record pilot version, exposure/task completion, language, administration conditions, and protocol deviations separately in approved study records.

## Measures and analysis

- Calculate PU and BI composites as the arithmetic mean of their corresponding completely answered, consistently keyed items. Equal item weighting and complete-case scoring are assumed.
- Estimate the association between participant-level PU and BI composite scores. Each participant contributes one independent pair.
- Use two-sided alpha = 0.05. In `auto` mode, apply Shapiro–Wilk screens to both composite score distributions when at least three participants are available. Select Pearson only when both marginal screen p-values are at least alpha; otherwise select Spearman. For fewer than three participants, auto mode selects Spearman without a normality screen. This is a conservative operational selection rule, not proof of Pearson assumptions.
- Pearson output includes coefficient, two-sided p-value, and Fisher-z 95% confidence interval. Spearman output includes rank coefficient, two-sided p-value, and deterministic paired-participant percentile-bootstrap 95% confidence interval. The bootstrap interval is approximate and has small-sample limitations.
- Before interpreting Pearson, inspect the PU-vs-BI scatterplot for linearity and influential observations and assess independence and bivariate-normality plausibility. Marginal Shapiro–Wilk screens do not establish these assumptions.
- Optional regression is disabled by default. Use `--regression` only if a simple unadjusted linear regression of BI composite on PU composite was prespecified and the sample and residual assumptions are adequate. It reports slope, intercept, R-squared, slope p-value, and slope 95% CI. Inspect linearity, residuals, influential observations, and homoscedasticity; do not treat correlation screening as regression diagnostics. Do not select or add covariates after looking at results.
- Association does not establish causation. Statistical significance does not prove practical importance or validate a questionnaire. A non-significant result does not establish absence of association. Do not label the hypothesis accepted or rejected based only on a p-value.
- An empty CSV returns `NO_STUDY_DATA` without statistics. Duplicate participants, missing/out-of-range item scores, mismatched columns, or constant composite scores must produce explicit errors.

## Software validation

Run the focused validation test:

```text
python evaluation\HT-11-H011\test_analyze_scales.py
```

All response rows used in the tests are explicitly synthetic software fixtures, not study responses.

## Analyze approved responses

Install the isolated dependency if needed:

```text
python -m pip install -r evaluation\HT-11-H011\requirements.txt
```

Analyze an approved, populated response file:

```text
python evaluation\HT-11-H011\analyze_scales.py --input path\to\approved-questionnaire-responses.csv --method auto
```

If planned in advance, add `--regression` for the optional unadjusted linear model. Select `--method pearson` or `--method spearman` only when justified by the prespecified analysis plan and diagnostics.
