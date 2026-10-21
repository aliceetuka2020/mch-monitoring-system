# HT-10 / H010 — Perceived ease of use and intention to use

## Status

This folder contains a header-only response template, an analysis script, and software validation tests. No participant responses are present. The hypothesis is **not tested with study data**; no association estimate, p-value, confidence interval, or conclusion is available.

## Instrument and data collection

- Before recruitment, select and approve a validated instrument appropriate to the application and study population. Freeze the exact perceived-ease-of-use (PEOU) and behavioral-intention (BI) item wording, language/translation, response anchors, reverse-scoring rules, and scoring instructions. The item codes below are placeholders only and are not questionnaire wording or a validated scale.
- The supplied CSV contains four PEOU response columns and three BI response columns as a reusable schema. If the approved instrument has a different number of items, update the template and required item list together before any data are collected; never change scales after inspecting results.
- Use one row per consenting participant and a pseudonymous `participant_code`. Store any re-identification key separately with approved access controls. Do not include names, contact information, staff IDs, patient details, free-text responses, or direct identifiers.
- Code each item from 1 to 5 only if the approved instrument uses that response range and the same direction. Reverse-score prespecified items before analysis. The analysis script assumes all submitted item values have already been coded so that larger values consistently indicate greater ease/intention. It rejects missing or out-of-range responses rather than silently imputing or excluding them.
- Collect responses using approved consent, privacy, and study procedures. Document recruitment, language, survey administration, exclusions, and instrument version separately from this data file.

## Measures and analysis

- Compute PEOU and BI scale scores as the arithmetic mean of their respective completed, consistently keyed items. Equal item weighting and complete cases are assumed.
- Estimate the association between participant-level PEOU and BI composite scores. Each participant contributes one independent pair.
- Use two-sided alpha = 0.05. `auto` mode uses Shapiro–Wilk as a screening rule on both composite-score distributions when at least three participants are present. It selects Pearson only when both screens have p >= alpha; otherwise it selects Spearman. With fewer than three participants, `auto` selects Spearman and reports that normality was not assessed. This is an operational screen, not proof of Pearson's assumptions.
- Before interpreting Pearson, inspect the composite-score scatterplot for approximate linearity and influential outliers and assess independence and bivariate-normality plausibility. Shapiro–Wilk on marginal scores alone cannot establish these conditions. If Pearson assumptions are not credible, use Spearman or seek statistical advice.
- Pearson mode reports the correlation coefficient and two-sided p-value with a Fisher-z 95% confidence interval. Spearman mode reports the rank correlation and two-sided p-value with a deterministic paired-participant bootstrap percentile 95% confidence interval. These intervals have small-sample and distributional limitations; the Spearman bootstrap is an approximate interval.
- Report the coefficient type, sample size, scale score definitions, p-value, confidence interval, method-selection basis, and alpha. A correlation is not causation; significance does not establish practical importance or validate the instrument. Do not label the hypothesis accepted/rejected solely by p-value.
- Constant composite scores make correlation undefined and must return an explicit validation error. An empty CSV returns `NO_STUDY_DATA` without statistics. Duplicate participants, missing values, invalid Likert scores, or a mismatched item schema must fail explicitly.

## Software validation

Run the focused validation test:

```text
python evaluation\HT-10-H010\test_analyze_scales.py
```

All participant rows in the tests are explicitly synthetic software fixtures. They are not study observations.

## Analyze approved responses

Install the isolated dependency if needed:

```text
python -m pip install -r evaluation\HT-10-H010\requirements.txt
```

Analyze a populated file after the instrument and data are approved:

```text
python evaluation\HT-10-H010\analyze_scales.py --input path\to\approved-questionnaire-responses.csv --method auto
```

Use `--method pearson` or `--method spearman` only when the selected method is supported by the prespecified analysis plan and diagnostics.
