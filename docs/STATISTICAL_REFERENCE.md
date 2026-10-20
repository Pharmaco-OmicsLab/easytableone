This document records the statistical rules and guardrails implemented by EasyTableOne.
It describes release v3.42, including the Phase 51 Round 4 R cross-validation results.

# Statistical reference

## Test selection

| Data and design | Selection |
|---|---|
| Continuous, two groups | Welch t test if normality is not rejected; Mann–Whitney otherwise. |
| Continuous, more than two groups | ANOVA or Kruskal–Wallis under the corresponding normality rule. |
| Categorical | Chi-square when expected counts support it; Fisher exact for sparse cells. R×C Monte Carlo Fisher uses SciPy's seeded `MonteCarloMethod`. |
| Ordered categorical with 3+ levels | Rank test is available under the configured plan. |

Normality uses Shapiro–Wilk within each group's own sample through n = 2000 (`src/workers/python/easytable_stats.py:182`); above that it uses the configured skewness/kurtosis rule. Welch is the default two-group parametric comparison. For three or more groups, Levene's test with median centering is the Brown–Forsythe variance diagnostic (`src/workers/python/easytable_stats.py:761`). Post-hoc methods are Tukey HSD after ANOVA, Dunn with Holm after Kruskal–Wallis, and Holm-adjusted pairwise chi-square/Fisher for categorical results (`src/workers/python/easytable_stats.py:216`, `src/workers/python/easytable_stats.py:325`). Multiplicity options are none, Bonferroni, Holm–Bonferroni, and Benjamini–Hochberg (`src/core/format/multipleTestingLabels.ts:5`). The baseline-testing advisory is separate because baseline p values are not generally recommended for randomized trials (`src/core/stats/baselineTestingAdvice.ts:1`).

Continuous SMD is the absolute mean difference divided by the pooled SD (`src/workers/python/easytable_stats.py:35`). Binary categorical SMD uses the pooled-SD formulation; multicategory SMD uses the multivariate covariance-distance formulation (`src/workers/python/easytable_stats.py:47`). The table reports the maximum pairwise SMD when there are more than two groups (`src/workers/python/easytable_stats.py:792`).

For categorical comparisons, Fisher's exact test is selected when the minimum expected count is below 5; a 2×2 table uses exact Fisher, while an R×C table uses seeded Monte Carlo Fisher (`src/workers/python/easytable_stats.py:652`, `src/workers/python/easytable_stats.py:694`, `src/workers/python/easytable_stats.py:698`). The app supplies a NumPy `Generator` initialized from the configured statistical seed (`src/workers/python/easytable_stats.py:429`) and relies on SciPy's `MonteCarloMethod` default of 9,999 resamples ([SciPy API reference](https://docs.scipy.org/doc/scipy/reference/generated/scipy.stats.MonteCarloMethod.html)). The Cochran-style advisory is emitted when more than 20% of expected counts are below 5 in a table with more than four cells (`src/workers/python/easytable_stats.py:386`).

## Validation

Phase 51 R4 cross-validates the Tier A/B/C and forced-test Bp/Cp exports against R `tableone`. The author run used R 4.6.0 and tableone 0.13.2. Of 1,831 records, 1,759 agreed, 0 disagreed, and 72 were not comparable (D2 40, E 29, F 3); the six category H Monte Carlo P values are included among the compared records. The maximum absolute difference was 3.2e-10 for exact values and 0.0036 for Monte Carlo P values. Deterministic values use an absolute tolerance of 1e-4; seeded 9,999-resample Monte Carlo Fisher P values use `3·sqrt(p(1−p)/9999) + 1e-4`. Detailed records and the S3b/S4 summary are in `validation/r/`.

## Guardrails

| Guardrail | Behavior | Implementation reference |
|---|---|---|
| Missingness | 20% advisory and 30% review thresholds. | `src/core/qa/checkRegistry.ts:328` |
| Small sample | Flags variable sample sizes below 30. | `src/core/qa/checkRegistry.ts:432` |
| Small group | Flags group counts below 10. | `src/core/qa/checkRegistry.ts:501` |
| Constant columns | Identifies constant variables. | `src/core/qa/checkRegistry.ts:219` |
| Excel errors | Counts spreadsheet error cells. | `src/core/qa/checkRegistry.ts:252` |
| Identifier-like fields | Excludes likely identifiers by default. | `src/core/schema/inference.ts:74` |
| High cardinality | Excludes categorical columns with more than 20 levels by default. | `src/core/schema/inference.ts:133` |
| Normality | Shapiro–Wilk through n=2,000; skew/kurtosis above. | `src/workers/python/easytable_stats.py:171` |
| Sparse cells | Fisher exact below expected-count threshold; R×C uses seeded Monte Carlo. | `src/workers/python/easytable_stats.py:691` |
| Cochran condition | Notes when >20% of expected counts are below 5. | `src/workers/python/easytable_stats.py:386` |
| Empty groups | Empty groups are handled without running a group comparison. | `src/workers/python/easytable_stats.py:731` |
| Large dataset | 50,000 and 150,000 row guardrails. | `src/core/performance/largeDatasetGuardrails.ts:1` |
| Events per variable | Plain logistic is allowed only when EPV ≥10 and other identification checks pass. | `src/workers/python/easytable_modeling.py:290` |
| p ≥ n | Disables plain maximum-likelihood logistic regression. | `src/workers/python/easytable_modeling.py:291` |
| Rank deficiency | Detects rank-deficient model matrices. | `src/workers/python/easytable_modeling.py:466` |
| Separation | Detected separation prevents plain maximum-likelihood logistic regression. | `src/workers/python/easytable_modeling.py:326` |

## Modeling

Models include plain, ridge, lasso, elastic-net and Firth logistic regression, plus Random Forest, Naïve Bayes and support-vector classification. Logistic tuning uses a ten-value C grid, stratified inner folds bounded by the smaller class, log-loss scoring, and the one-standard-error rule by default (`src/workers/python/easytable_modeling.py:675`, `src/workers/python/easytable_modeling.py:704`). In the fast setting the penalty is selected once on the full data and held fixed across bootstrap resamples: `_bootstrap_engine` sets `fixed_c` from the point estimate (`src/workers/python/easytable_modeling.py:1430`) and passes it to every bootstrap fit (`src/workers/python/easytable_modeling.py:1444`). In the thorough setting `fixed_c` is `None`, so the penalty is re-selected inside every resample. The method label `bootstrap_optimism_fixed_lambda` is assembled at `src/workers/python/easytable_modeling.py:1484` and `src/workers/python/easytable_modeling.py:1486`; result rows label those intervals `bootstrap_percentile_fixed_lambda` at `src/workers/python/easytable_modeling.py:1518`. Fast mode is the default (`src/core/modeling/types.ts:358`). Logistic optimism bootstrap uses B=200 in fast mode and B=1,000 in thorough mode (`src/ui/components/ModelingSetupHeader.tsx:338`) with out-of-bag intervals (`src/workers/python/easytable_modeling.py:1456`). ML uses repeated stratified five-fold validation: 3 repeats in fast mode and 10 in thorough mode (`src/workers/python/easytable_modeling.py:2122`).

Resampling refits preprocessing on each training sample (`src/workers/python/easytable_modeling.py:1114`). Dummy-coding level sets are enumerated once on full data by `_ml_level_sets` (`src/workers/python/easytable_modeling.py:969`); fast logistic validation fixes its selected penalty as described above. Reports include calibration slope/intercept, Brier score, ROC-AUC, and decision curves evaluated on a 100-point threshold grid (`src/workers/python/easytable_modeling.py:2175`).
