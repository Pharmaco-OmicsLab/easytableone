# EasyTableOne

A client-side web application that generates publication-ready "Table 1" baseline
characteristics tables for clinical research. All parsing and computation run inside the
user's browser through [Pyodide](https://pyodide.org) — a WebAssembly build of CPython — so
no data are transmitted off the device, nothing is installed, and no account is required.

Hosted instance: <https://easyverse.app/easytableone/>

Licence: MIT (see `LICENSE`).

---

## Quick start

```bash
pnpm install
pnpm dev
```

Requires Node.js ≥ 20 and pnpm. To run the built application, any current browser with
WebAssembly support (Chrome, Edge, Firefox, Safari) is sufficient; there is no server
component.

### Commands

| Command | Purpose |
| --- | --- |
| `pnpm install` | Install dependencies |
| `pnpm dev` | Start the development server |
| `pnpm build` | Production build |
| `pnpm test` | Vitest test suite |
| `pnpm verify` | Full verification: types, lint, tests, production build |
| `pnpm test:golden` | Cross-validation harness against the Python `tableone` package |
| `pnpm test:e2e` | Playwright DOCX-export smoke test (on a clean checkout, install a browser first with `npx playwright install`) |
| `pnpm validation:report` | Regenerate the validation artefacts (see below) |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm lint` | Biome linter and formatter |

---

## Workflow

Two phases, seven steps: import CSV or XLSX → infer schema → optional data-dictionary
import → data quality control → statistics → journal formatting → export. Each stage
exchanges a strongly typed intermediate object, so every stage is independently testable
and one intermediate representation drives all export formats.

---

## Statistical engine

The engine calls validated library functions (SciPy, statsmodels, pandas, scikit-learn)
rather than reimplementing them. The surrounding data-preparation and orchestration code is
the application's own and is covered by the test suite.

### Automated test selection

| Variable type | Two groups | Three or more groups | Post-hoc |
| --- | --- | --- | --- |
| Continuous, normal <sup>a</sup> | Welch's or Student's *t* test | One-way ANOVA | Tukey HSD |
| Continuous, non-normal | Mann–Whitney U | Kruskal–Wallis | Dunn's test (Holm) |
| Categorical | χ² or Fisher's exact <sup>b,c</sup> | χ² or Fisher's exact <sup>b</sup> | Pairwise χ² or Fisher (corrected) |

<sup>a</sup> Normality: Shapiro–Wilk (n ≤ 2000) or a skewness/kurtosis rule (n > 2000),
assessed **within each group**, not on the pooled distribution. A variable is treated as
non-normal if any group fails.
<sup>b</sup> Fisher's exact test is selected automatically when the minimum expected cell
count falls below 5. For tables larger than 2 × 2 the P value is a seeded Monte-Carlo
estimate (9999 resamples), not an exact computation, and is labelled as such in the output
and in the reproducibility record.
<sup>c</sup> χ² tests are computed **without** Yates' continuity correction by default,
since it is known to be conservative for 2 × 2 tables. When it is enabled the fact is
recorded in the exported methods text and in the reproducibility record.

### Normality assessment

Above 2000 observations per group the criterion switches from Shapiro–Wilk to a
moment-based rule (|skewness| < 1 and |excess kurtosis| < 1), because the power of the
Shapiro–Wilk test grows with sample size to the point where it flags departures too small
to affect the validity of a parametric comparison. The per-group Shapiro–Wilk P value and
the criterion actually applied are recorded for every variable. If a parametric test is
requested for a variable the criterion has classified as non-normal, a contradiction
warning is raised.

### Standardised mean differences

Computed for every variable, using a multivariate extension for categorical variables, and
displayable alongside or instead of P values. This follows practice in the propensity-score
literature, where a sample-size-independent measure of imbalance is preferred to a
significance test.

### Three or more groups

A significant omnibus test triggers post-hoc pairwise testing. The engine additionally
applies a median-centred Levene (Brown–Forsythe) test of homogeneity of variance and reports
it alongside the omnibus P value; when variances differ, the ordinary one-way ANOVA is
flagged as resting on an assumption the data do not support.

### Multiplicity

Independent of group count, a user-selected correction (Bonferroni, Holm, or
Benjamini–Hochberg FDR) can be applied across the table. A soft advisory is raised from two
tested variables and a prominent one from ten. Raw P values remain the default, as is
conventional for a descriptive baseline table, and the choice is recorded in the audit log.

---

## Guardrails and thresholds

The engine supervises the analysis rather than executing silently. Findings are graded as
*advisory*, or as *review* items that must be acknowledged before the analysis proceeds.
Nothing is excluded automatically: the user decides, and the decision and its stated reason
enter the audit log.

| Condition | Threshold | Tier |
| --- | --- | --- |
| Missing data | ≥ 20% of observations missing | Advisory |
| Missing data | ≥ 30% of observations missing | Review — must be acknowledged or resolved |
| Multiplicity | ≥ 2 variables tested | Soft advisory |
| Multiplicity | ≥ 10 variables tested | Prominent advisory |
| Sparse contingency cells | Minimum expected count < 5 | Automatic switch to Fisher's exact |
| Cochran advisory | > 20% of expected counts < 5 | Advisory |
| Dataset size | > 50,000 rows | Informational notice at import |
| Dataset size | > 150,000 rows | Explicit acknowledgement required before modelling |
| Constant / near-constant columns | Single level, or a category of size 1 | Flagged at the data-quality step |
| Identifier-like columns | Detected heuristically | Excluded from the table |

No fixed row cap is imposed, because the practical limit depends on the machine, the browser
and the width of the dataset. Every validation step carries an inline "About this step"
explanation in the interface.

---

## Optional modelling module

An opt-in module fits regression and machine-learning models to a binary outcome. It is
deliberately secondary to, and separate from, the descriptive workflow.

### Model-regime detection

Unpenalised maximum likelihood is disabled when the fit is not identifiable — predictors
outnumber observations, the design matrix is rank-deficient, or complete or quasi-complete
separation is detected. Penalised or Firth models are recommended when the
events-per-variable ratio is low, with the reasoning shown to the user.

### Hyperparameters

| Model | Configuration |
| --- | --- |
| Random Forest | 200 trees, unrestricted depth, minimum leaf size 1 |
| Naïve Bayes | Gaussian estimator with default variance smoothing for continuous-only designs; mixed Gaussian/Bernoulli estimator when the design matrix contains one-hot indicators |
| Support-vector classification | Radial basis kernel, C = 1, γ = "scale", Platt-scaled probabilities |
| Penalised logistic | Penalty selected over scikit-learn's ten-point log-spaced grid by inner stratified cross-validation (up to 5 folds, bounded by the smaller class count); one-standard-error rule by default, minimum-deviance rule available |
| Firth logistic | Used automatically when separation is detected |

### Validation

| Aspect | Thorough setting (default) | Fast setting |
| --- | --- | --- |
| Logistic validation | Harrell's optimism-corrected bootstrap, 1000 resamples, out-of-bag percentile intervals | 200 resamples |
| Penalty re-selection | Inside every bootstrap resample | Single selection |
| ML comparison | Repeated stratified 5-fold CV, 10 repeats | 3 repeats |

Reported metrics: ROC-AUC, calibration slope and intercept, Brier score, decision-curve
(net-benefit) analysis, and subgroup/fairness metrics. Reporting is aligned to TRIPOD+AI.

### Missing predictors

Complete-case analysis, or mean/median/mode, constant, k-nearest-neighbour, Random Forest or
MICE imputation. Every imputer is re-fitted **inside** each resample to avoid leakage.
kNN imputation uses 5 neighbours on standardised training-fold data; MICE uses 20
imputations with 10 iterations each. All seeds, fold assignments and fitted hyperparameters
are recorded in the reproducibility record.

---

## Journal formatting rulesets

Formatting is governed by a single versioned JSON source (`journal_rulesets.json`) rather
than being hard-coded per output format. Rulesets encode the house styles of the New England
Journal of Medicine, JAMA, The Lancet and Nature Medicine, plus a generic default,
controlling decimal precision, P value formatting, variable ordering and grouping, and
spacing. Selecting a journal reformats the same underlying results immediately in a live
preview. The ruleset version is embedded in every export.

To add a journal, add an entry to `journal_rulesets.json`; no application code needs to
change.

---

## Exports and reproducibility

| Artefact | Formats |
| --- | --- |
| Manuscript table | DOCX, XLSX, CSV, LaTeX |
| Technical, diagnostic and teaching reports | HTML, Markdown |
| Reproducibility record | JSON application state |
| Reproducibility script | Standalone `analysis_history.py` |

The JSON record captures application, ruleset and library versions, the analysis plan with
its audit log, the inferred schema and the aggregate results. It contains no protected
health information by default; an optional input-file hash is available but disabled.

The exported Python script imports pandas, SciPy and statsmodels directly, has no dependency
on EasyTableOne, and regenerates the analysis from the source file. Because it calls the
same functions the application called, it reproduces the computation with the identical
engine rather than a transcription into another language.

---

## Validation

The cross-validation harness runs EasyTableOne and the Python `tableone` package on
identical inputs inside the same in-browser runtime and compares every summary statistic,
standardised difference and P value as an unrounded numeric value.

```bash
pnpm test:golden        # run the comparisons and assertions
pnpm validation:report  # regenerate the machine-readable artefacts
```

Latest run (EasyTableOne 3.18.0 against tableone 0.9.6):

| Dataset | Records | Variables | Compared | Agreeing | Not comparable |
| --- | --- | --- | --- | --- | --- |
| Synthetic edge cases | 5 | 7 | 102 | 102 | 22 |
| Heart Failure Clinical Records | 299 | 11 | 172 | 172 | 11 |
| Diabetes 130-US Hospitals (seeded subsample) | 20,000 | 18 | 540 | 540 | 20 |
| **Total** | | | **814** | **814** | **53** |

Maximum absolute difference 0.0005. The 53 non-comparable records are adjudicated and
itemised in the supplementary material of the accompanying paper. See
`tests/golden/README.md` for the dataset tiers and how to regenerate the Diabetes tier.

---

## Citation

If you use EasyTableOne in published work, please cite the accompanying software paper and
the archived release. Both will be listed here on publication.

---

## Related tools

EasyTableOne is part of the EasyVerse collection of web tools for biomedical research:

- [EasyFigAssembler](https://easyverse.app/easyfig/) — figure-panel assembly
- [EasyPubPlot](https://pharmaco-omicslab.shinyapps.io/EasyPubPlot) — publication-ready plotting
- [EasyLipidVis](https://pharmaco-omicslab.shinyapps.io/EasyLipidVis/) — lipidomics visualisation

EasyPubPlot and EasyLipidVis are hosted Shiny applications; the client-side privacy model
described above applies specifically to EasyTableOne.
