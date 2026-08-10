# EasyTableOne — Frequently Asked Questions

_Source of truth for the FAQ modal content. Codex reads this file when implementing the FAQ modal; do not restructure the format without also updating the modal. Content reflects the live app as of PLAN v2.90 (Phase 25 R1)._

---

## How to read this file (format contract for Codex)

- The FAQ is a **large modal** (`faqOpen` store flag, sibling to `tutorialOpen`/`aboutOpen`), opened by a **"FAQ"** button in the top bar beside **Tutorial**. Two-pane layout: left = search box + category nav; right = scrollable Q&A grouped by the `##` categories below.
- Each question is a `###` heading. Directly under it:
  - **Short:** one plain-language answer, always shown (this is the visible summary).
  - **More detail:** _(optional)_ the technical expansion. Render as an expandable `<details>` block ("More detail"). If a question has no **More detail**, render only the Short answer.
- **Search** filters over the combined Short + More detail + question text (client-side substring, case-insensitive). Category chips filter by `##` section.
- Every factual claim here is grounded in the codebase. Do not paraphrase in a way that changes a number, version, method name, or guarantee.
- **Open item:** the citation answer in §7 contains a red placeholder (`[CITATION PLACEHOLDER — TO BE FINALIZED]`). Preserve it verbatim and render it in red so it stays visible as a reminder until the real citation string is supplied. Do not ship a fabricated citation.

---

## 1. Basics & getting started

### What is EasyTableOne and what does it do?

**Short:** EasyTableOne turns a CSV or XLSX clinical dataset into a publication-ready "Table 1: Baseline Characteristics" — the summary table of participant characteristics by group that opens most clinical papers. It runs the whole pipeline (read the file, infer variable types, run quality checks, compute statistics, format to a journal's style, and export) entirely in your browser.

**More detail:** Beyond Table 1 it also offers optional Exploratory Data Analysis (missingness, histograms, correlation heatmaps) and an optional Modeling step (logistic regression and a cross-validated machine-learning benchmark). None of the optional steps change Table 1.

### What is a "Table 1" and why do I need one?

**Short:** In clinical and epidemiological papers, "Table 1" is the baseline table: it describes your study population (age, sex, comorbidities, labs, etc.), usually split into comparison groups (e.g. treatment vs. control), with an appropriate summary statistic and often a significance test per row. Reviewers expect it to establish who was studied and whether the groups were comparable at baseline.

### Who is this tool for?

**Short:** Clinical researchers, epidemiologists, trainees, and students who need a correctly-computed, correctly-formatted baseline table without writing R or Stata code. It assumes you understand your data; it does not require you to know how to program.

### Do I need an account or to install anything?

**Short:** No. There is nothing to install and no account, login, or sign-up. You open it in a web browser and start working.

**More detail:** The app is a static client-side web application — there is no server-side account system, no sign-in wall, and no software to download or configure.

### Does it work offline?

**Short:** After the page and its analysis engine have loaded once, the core Table 1 workflow runs locally and does not need an ongoing internet connection. You do need a connection for the initial load of the page and the statistics engine.

**More detail:** The statistics engine (Pyodide) and its libraries are fetched when you first open the app. Once loaded into the tab, computation happens in-browser. Reloading the tab re-fetches these assets, so a stable connection for the first load of each session is the practical requirement.

### Which browsers and devices are supported?

**Short:** Use a current desktop version of Chrome, Edge, Firefox, or Safari. The app is responsive and has a mobile drawer menu, but a large dataset and the in-browser statistics engine are far more comfortable on a desktop or laptop.

**More detail:** The engine relies on WebAssembly and Web Workers, which all current major browsers support. Very old browsers, or aggressively locked-down environments that block WebAssembly, will not run the statistics engine.

### What file formats can I upload?

**Short:** CSV (`.csv`) and Excel (`.xlsx`). One row per participant, one column per variable, with column names in the header row (row 1 by default).

**More detail:** For XLSX you can pick which sheet is the data sheet and which row holds the headers. A second sheet can serve as a data dictionary (see the dictionary questions). Older `.xls`, Google Sheets links, and other formats are not accepted — export to CSV or XLSX first.

### How is this different from doing Table 1 in R, SPSS, or Stata?

**Short:** Same statistics, no code. EasyTableOne automates the test-selection and formatting decisions you would otherwise script by hand, and its output is cross-checked against an established statistics package. It is meant for standard baseline tables, not for arbitrary custom analyses that a full stats environment can do.

**More detail:** The numeric engine is real Python scientific computing (NumPy, pandas, SciPy, statsmodels, scikit-learn) compiled to WebAssembly, and the Table 1 output is validated against the Python `tableone` package to 4 decimal places in the test suite. What you give up versus R/Stata is open-ended flexibility (custom models, survival analysis, complex survey designs) — see "What is this tool NOT designed for?".

### Is there a limit on dataset size?

**Short:** There is no hard cap, but because everything runs in your browser, very large files get slow and memory-hungry. At 50,000 rows the app shows an informational notice; at 150,000 rows it asks you to confirm before running the heaviest steps.

**More detail:** The thresholds are 50,000 rows (informational notice) and 150,000 rows (an explicit confirm checkbox gating the Run action, not a hard block). Performance also depends on the number of variables and on your device's memory. For multi-hundred-thousand-row datasets, consider sampling or pre-aggregating before upload.

---

## 2. Privacy & data security

### Is my data uploaded anywhere?

**Short:** No. All parsing, computation, and export happen locally in your browser. Your dataset is never transmitted to any server — there is no backend that receives it.

**More detail:** The statistics engine runs inside your browser tab via WebAssembly. Files you drop in are read into browser memory and processed there; exports are generated in-browser and downloaded directly. Nothing about your rows leaves the machine.

### Is it safe to use with confidential or patient data?

**Short:** Because the data never leaves your browser, EasyTableOne avoids the main exposure of cloud tools — transmitting data to a third party. That said, only you and your institution can judge what your governance rules and data-use agreements permit. The app cannot and does not make you compliant with any specific regulation on its own.

**More detail:** Practical considerations remain your responsibility: the machine you run it on, who can see your screen, where you save the exported files, and whether your local device meets your institution's security requirements. This is a description of how the app handles data, not legal or compliance advice.

### What happens to my data when I close or refresh the tab?

**Short:** It is gone from memory. The app holds your dataset and analysis in the tab's memory only; closing or refreshing the tab clears it. There is no automatic cloud save.

**More detail:** The **Save** button downloads a JSON snapshot of your analysis choices for your own recordkeeping/archiving, but session restore (re-loading that snapshot to resume) is on the roadmap and not yet implemented. Treat a refresh as a reset.

### Does the app store anything in my browser?

**Short:** It may keep small, non-sensitive interface preferences locally (such as whether you've seen the welcome screen), but it does not persist your dataset. Your data lives in memory only for the current session.

**More detail:** Any local persistence is limited to lightweight app state, never participant-level data. If you want a record of your analysis choices, use the Save button to export the JSON snapshot.

### What is the "input data hash" setting — is it a privacy risk?

**Short:** It is off by default. When on, the app embeds a SHA-256 fingerprint of your input file into the Reproducibility JSON so you can later verify the exact same file was used. A hash is a one-way fingerprint, not your data — but it is derived from your file, which is why it is opt-in.

**More detail:** The hash lets a collaborator confirm that a re-run used a byte-identical input. It does not let anyone reconstruct your data. Leave it off unless you specifically need input-identity verification, since the JSON is a file you may share.

### Do you use analytics, cookies, or tracking?

**Short:** No. The app does not use analytics, tracking code, or advertising cookies. It's a static client-side tool with no data backend collecting your activity.

### Can I use it on an air-gapped or firewalled hospital machine?

**Short:** Yes in principle, as long as the initial page and engine assets can load. Once loaded, the workflow does not need network access. A fully air-gapped machine needs the app and its engine served locally.

**More detail:** The blocker on locked-down networks is usually the first-load fetch of the WebAssembly engine and library wheels, or a policy that blocks WebAssembly outright. If those load, the analysis itself needs no further connectivity.

### Does using EasyTableOne make me HIPAA / GDPR / IRB compliant?

**Short:** No tool can grant that by itself. What EasyTableOne does is keep processing local so your data is not sent to a third party, which removes one common compliance concern. Whether your overall use meets HIPAA, GDPR, your IRB protocol, or a data-use agreement depends on your data, your institution, and how you handle the files — that judgment is yours, and this is not legal advice.

**More detail:** The relevant, verifiable fact is architectural: there is no server that receives your dataset. Everything else (device security, storage of exports, de-identification, permitted uses) sits outside the app and with you and your compliance office.

---

## 3. How it works & technical infrastructure

### How does the app run statistics with no server?

**Short:** It runs a full Python scientific-computing stack inside your browser using Pyodide — CPython compiled to WebAssembly. The same libraries you'd use in a Jupyter notebook (NumPy, pandas, SciPy, statsmodels, scikit-learn) execute locally in the tab, so no server is needed to crunch numbers.

**More detail:** The Python engine runs in a Web Worker (a background thread) so heavy computation does not freeze the interface. The main page hands the worker your data and the analysis plan; the worker returns computed statistics and rendered figures.

### What is Pyodide, and why is the first load slow?

**Short:** Pyodide is a build of Python that runs in the browser via WebAssembly. The first time you open the app it downloads and initializes Python plus the scientific libraries, which is why the analysis-engine indicator sits at yellow ("Starting analysis engine…") for a few seconds before turning green.

**More detail:** The app uses Pyodide **314.0.0a1**. After the engine is warm, subsequent computations are fast; the one-time cost is the initial download and initialization of the runtime and library wheels.

### Which statistical libraries and versions do you use?

**Short:** The numeric engine is standard, well-established Python scientific software: NumPy, pandas, SciPy, and statsmodels for statistics; scikit-learn for machine learning; matplotlib and seaborn for figures. Firth regression uses the `firthlogist` package.

**More detail:** Pinned versions in this build: Pyodide 314.0.0a1; NumPy 2.4.3; pandas 3.0.2; SciPy 1.17.0; statsmodels 0.14.6; scikit-learn 1.8.0; matplotlib 3.10.8; patsy 1.0.2; and, loaded as additional wheels, seaborn 0.13.2, firthlogist 0.5.0, scikit-posthocs 0.14.0, and tabulate 0.10.0. The test suite additionally installs the Python `tableone` package to cross-validate Table 1 output.

### How are the charts and figures generated?

**Short:** Figures (histograms, Q–Q plots, correlation heatmaps, box/bar charts, and modeling diagnostics) are rendered by matplotlib and seaborn inside the Python engine, then embedded as images in the app and in exports. They are real statistical plots produced by the same engine that computes the numbers.

**More detail:** Because rendering happens in the Web Worker, generating many figures on a large dataset takes a moment; the app caches rendered figures within a session and re-renders only when the underlying selections, journal, or font scaling change.

### How are Word, Excel, and PDF files created in the browser?

**Short:** All exports are assembled locally in your browser and downloaded directly — no server round-trip. Word (`.docx`), Excel (`.xlsx`), CSV, LaTeX, PDF, HTML, and JSON outputs are all generated client-side.

**More detail:** Table content, figures, and report text are packaged into the requested format in-browser, so exporting works with the same privacy guarantee as the rest of the app: nothing is uploaded.

### Why does the "analysis engine" indicator start yellow?

**Short:** Yellow ("Starting analysis engine…") means Pyodide is still loading; green ("Analysis engine ready") means it's finished and computations can run. Actions that need computation (Run Statistics, Run EDA, Run logistic regression) automatically wait for green, so you don't have to.

### Does a big computation freeze my browser?

**Short:** No — heavy work runs in a background Web Worker, so the interface stays responsive. Very large datasets still take longer to compute, but the page won't lock up while they do.

**More detail:** You can cancel a long computation by clicking Back or navigating in the sidebar while it runs.

### What happens if I lose internet mid-analysis?

**Short:** If the engine has already loaded, an in-progress analysis keeps working, because computation is local. You'd only notice a problem if the tab needs to re-fetch an engine asset it hasn't loaded yet.

**More detail:** The risk window is the initial load. Once the engine and libraries are in the tab, losing connectivity doesn't interrupt computing or exporting.

### How do I check which version I'm running?

**Short:** Open the **About** button in the top bar — it shows the app description, method references, and version information.

---

## 4. Statistical methods

### How does the app decide which statistical test to use?

**Short:** It picks the test from the variable's type, the number of groups, and — for continuous variables — whether the data look normally distributed. Continuous normal: Welch's t-test (2 groups) or ANOVA (>2). Continuous non-normal: Mann–Whitney U (2 groups) or Kruskal–Wallis (>2). Categorical: chi-square, or Fisher's exact when an expected cell count is below 5.

**More detail:** The default two-group continuous test is **Welch's t-test** (unequal-variance, `equal_var=False`), which is more robust than the classic equal-variance Student's t-test; you may see "t-test" in some journal-facing labels, but the computation is Welch's. Each variable's row in Statistical Review shows a badge naming the test and the reason it was chosen. You can override the test for a variable in the plan.

### How is normality assessed?

**Short:** For smaller samples the app uses the Shapiro–Wilk test; for large samples it switches to shape-based criteria (skewness and kurtosis), because significance tests flag trivial departures from normality when n is very large.

**More detail:** Concretely: Shapiro–Wilk with a P-value threshold of 0.05 for smaller samples; for n above roughly 2,000, the app treats a variable as approximately normal when both |skewness| and excess kurtosis are under 1.0. This logic lives in the journal ruleset's `normality_logic` block, not hardcoded in scattered places.

### When does it report mean ± SD versus median [IQR]?

**Short:** Continuous variables judged approximately normal are summarized as mean ± SD; those judged non-normal (skewed) are summarized as median [IQR]. The normality decision above drives this automatically, and the matching test (parametric vs. rank-based) is chosen to be consistent.

### Chi-square versus Fisher's exact — how is that decided?

**Short:** The app uses the chi-square test for categorical variables by default, and switches to Fisher's exact test when any expected cell count falls below 5 (the standard rule for when chi-square's approximation becomes unreliable).

### What is SMD and when should I show it?

**Short:** SMD (standardized mean difference) measures the size of the between-group difference in units of standard deviation, independent of sample size. It's the balance metric favored in randomized-trial reporting (CONSORT). It's on by default; turn it off if your journal wants P-values only, or for observational designs where SMD isn't conventional.

### Should I include P-values in Table 1?

**Short:** It depends on your study type. For randomized trials, many journals discourage P-values in the baseline table, because a significant baseline difference in a properly randomized trial is by definition due to chance — SMD is preferred. For observational studies, P-values are more commonly reported. The checkbox is on by default; use your judgment.

### Which multiple-testing correction should I choose?

**Short:** For a purely descriptive Table 1, "No correction" is defensible. If you want to adjust for testing many variables: Bonferroni is simplest and most conservative; Holm is a less conservative step-down alternative that still controls the familywise error rate; Benjamini–Hochberg controls the false discovery rate and suits exploratory tables with many variables.

**More detail:** The app shows an advisory when the correction you pick actually changes which rows are flagged significant, so you can see the impact of the choice rather than guessing.

### How are percentages calculated — do they count missing?

**Short:** Percentages for categorical variables are computed over the observed (non-missing) values, and missingness is reported separately rather than being folded silently into the denominator. Table 1 summarizes what was actually recorded; it does not invent values for blanks.

### How does Table 1 handle missing data?

**Short:** It uses available-case analysis: each statistic is computed from the values that are present, and missing counts are surfaced in the data checks. Table 1 does not impute. If you want complete-case or multiple-imputation handling, that lives in the optional Modeling step.

### Can I override the test used for a variable?

**Short:** Yes. The automatic choice is a sensible default, but the analysis plan lets you set a test override for a variable when you have a specific reason. Overrides are recorded so your choices are transparent and reproducible.

### How are outliers detected, and what do keep/exclude/winsorize do?

**Short:** Outliers are flagged by the IQR method (values far outside the interquartile range). For each flagged value you choose: **Keep** (leave it in all calculations), **Exclude** (drop that value from Table 1 calculations without deleting the source row), or **Winsorize** (cap it at the 1st/99th-percentile boundary instead of removing it).

**More detail:** All three are non-destructive to your source data — they change how the value is treated in the computed table, and your decision is logged in the analysis history and reproducibility record.

### How are ordinal variables summarized and tested?

**Short:** Ordinal (ordered categorical) variables are reported as n (%) per level in the order you set, and you control that order in the Variable Types and Analysis Plan steps. Marking a variable ordinal enables the level-reordering arrows.

---

## 5. Missing data, imputation & modeling

### What's the difference between Table 1 and the Modeling step?

**Short:** Table 1 (Steps 1–7) is descriptive: it summarizes and compares baseline characteristics. Modeling (Step 6, optional) is inferential/predictive: it fits logistic regression or a machine-learning benchmark to predict an outcome from predictors. Modeling never changes your Table 1.

### Do I have to use Modeling?

**Short:** No. Modeling is entirely optional and opt-in — you enable it by clicking "6. Modeling (optional)" in the sidebar. You can produce a complete, publication-ready Table 1 without ever touching it.

### What imputation methods are supported?

**Short:** In Modeling you can handle missing predictor values with: no imputation (complete cases only); single-fill by mean, median, mode, or a constant you specify; kNN (nearest-neighbor) fill; random-forest fill; or MICE (multiple imputation by chained equations), which is the statistically principled standard. Table 1 itself does not impute.

**More detail:** Single-fill methods are fast but treat filled values as if they were known, which understates uncertainty. Among the single-fill options, median fill is usually safer than mean for skewed measurements, because the mean is pulled by outliers. kNN and random forest use row-level similarity and are more accurate but slower (random forest carries a large-N warning). MICE creates multiple completed datasets, fits the model on each, and pools the results with Rubin's rules, propagating imputation uncertainty into the standard errors.

### Complete-case versus imputation — which should I use?

**Short:** If missingness is minimal and plausibly random, complete-case analysis is simple and transparent. If you're discarding a meaningful fraction of rows, or missingness may be informative, a principled imputation (MICE) usually gives less biased estimates with honest uncertainty. The app offers a dataset-aware suggestion but is explicit that it's a heuristic, not a guarantee.

**More detail:** The app's inline guidance describes the tradeoffs of each policy in plain language, including the over-confidence problem with single-fill methods and the combined-uncertainty logic behind MICE/Rubin. The final choice is a methodological one you should be able to defend.

### What is MICE / Rubin's rules?

**Short:** MICE (multiple imputation by chained equations) fills missing values several times to create multiple complete datasets, fits your model on each, and combines the results using Rubin's rules — which pool the estimates and, crucially, add the between-imputation variability into the standard errors so the uncertainty from missing data isn't hidden.

**More detail:** You can set the number of imputed datasets (m) in the setup. MICE is the slowest option because it fits the model repeatedly. For penalized models, pooled inference behaves differently from plain/Firth fits — the app's rationale text notes when pooling applies.

### What is Firth regression and when do I need it?

**Short:** Firth's penalized logistic regression stays stable when ordinary logistic regression breaks down — small samples, rare outcomes, or complete/quasi-separation (a predictor that perfectly, or nearly perfectly, predicts the outcome). The app detects these situations and may recommend Firth automatically.

**More detail:** Firth uses the `firthlogist` package. When a plain logistic fit fails to converge or shows separation, the app routes to Firth handling and tells you it did so, rather than returning an unstable or non-converged result.

### What is "outcome-aware imputation" — isn't that circular?

**Short:** "Outcome-aware" means the outcome column is used as a *helper* when filling missing predictor values (for the multivariate methods kNN, RF, and MICE). It is never added to your model as a predictor, so it isn't circular. Whether it helps depends on the method: it is **on by default for MICE**, which adds proper randomness, and **off by default for kNN and random forest**, which fill each gap with one fixed guess — using the outcome there can overstate effects (odds ratios pushed *away* from "no effect"). You can override either way.

**More detail:** Think of two regimes. (1) For **statistics / regression** — where you interpret odds ratios and confidence intervals — using the outcome to fill predictor gaps *reduces* bias toward "no effect," so MICE does it by default. (2) For the **cross-validated machine-learning benchmark** — where you estimate out-of-sample predictive performance — the outcome is **never** used to impute: each fold is imputed fold-locally on predictors only (fit on the training rows, applied to the held-out rows), because using a row's own outcome to fill its predictors would leak the target and inflate the reported performance. Simple single-value fills (mean/median/mode/constant) don't offer the toggle because they use one column's statistics, not row-level similarity.

### Logistic Regression tab versus Machine Learning tab — what's the difference?

**Short:** The Logistic Regression tab fits an interpretable model and reports odds ratios, 95% CIs, P-values, and AIC — good for explaining associations. The Machine Learning tab runs a cross-validated benchmark of several classifiers and reports predictive performance (AUC, accuracy), calibration, and feature importance — good for gauging predictive value.

### How does Modeling handle class imbalance and classification thresholds?

**Short:** EasyTableOne does not oversample, undersample, or use SMOTE to balance the outcome. It keeps your rows as they are, uses stratified cross-validation for the machine-learning benchmark, and reports balanced accuracy alongside sensitivity and specificity so a rare outcome is not hidden by high overall accuracy.

**More detail:** Sensitivity, specificity, balanced accuracy, and confusion matrices are read at the reported probability threshold of 0.50. AUC and ROC curves are threshold-free: they summarize ranking across all possible cut-points. If you need a different operating threshold for a clinical decision rule, report that as a study choice outside the current benchmark.

### How is data leakage prevented in the ML benchmark?

**Short:** Imputation and preprocessing in the ML benchmark are done fold-locally — fit on each training fold only and then applied to the held-out fold — so information from the test fold never leaks into training. This keeps the reported performance honest.

**More detail:** Fold imputers/scalers are fit on the training rows of each cross-validation fold, and the outcome is excluded from the ML fold imputer (predictor-only), distinct from the outcome-aware option available on the logistic tab. Continuous-feature scaling used by ML models is also fit on the training fold only and then applied to the held-out fold.

### How are confidence intervals computed (Wald versus bootstrap)?

**Short:** Odds-ratio CIs use Wald/profile/Rubin or bootstrap methods depending on the fitted model. Performance uncertainty is reported separately: logistic validation scalars use out-of-bag, nested, or full-sample bootstrap confidence intervals, and machine-learning metrics use a 95% interval across CV repetitions. The ML `+/- SD` value is per-repeat spread, not a confidence interval.

**More detail:** Logistic odds-ratio intervals come from the method available for the model: Wald for plain logistic regression, profile likelihood for Firth, Rubin pooling for MICE when applicable, or bootstrap percentile intervals for penalized models. Logistic performance intervals for AUC, calibration slope/intercept, and Brier score are 95% confidence intervals computed via one of three user-selected methods: (a) out-of-bag (OOB) percentile intervals constructed from held-out resamples and pivotally recentered around corrected point estimates; (b) nested optimism-corrected bootstrap using a double bootstrap loop to propagate all uncertainty; or (c) legacy full-sample bootstrap percentile intervals from optimism resamples. If validation falls back to apparent-only, no performance CI is shown. ML performance intervals are 95% intervals across CV repetitions calculated from repeated cross-validation repeat-level metric means (Student-t, df = repeats - 1) on the logit scale (Fisher z for MCC) and back-transformed, so they stay within the metric's range; an interval is omitted when a repeat reaches that range's boundary. The displayed `+/- SD` remains a dispersion measure showing per-repeat spread. They reflect run-to-run variability of repeated cross-validation on this dataset, not confidence intervals for performance on new patients.

### What's the difference between Fast and Thorough validation?

**Short:** Fast validation uses 200 resamples, single imputation for MICE, and statistical shortcuts (pins penalty strength, uses 2 inner CV folds, runs 3 repeats instead of 10, and searches a smaller hyperparameter grid) to remain responsive. Thorough validation (unchecked) runs 1000 resamples, re-runs the full imputation inside every resample, and performs the full tuning without shortcuts.

**More detail:** Fast validation keeps the app responsive by making several trade-offs: it reuses a single penalty strength across resamples, checks models against fewer internal splits (2 folds), repeats cross-validation 3 times instead of 10, and searches a smaller hyperparameter grid. For MICE, only a single pooled imputation is validated. This is fast but hides imputation and model selection uncertainty. Thorough validation (when unchecked) repeatedly runs the entire imputation process inside each of the 1000 bootstrap resamples, re-selects the penalty, and runs the full cross-validation (10 repeats, larger hyperparameter grids). Odds ratios are identical either way. Validation results (AUC, calibration, and intervals) are estimates from resampling, so Fast and Thorough can differ slightly; Thorough uses more resamples and gives more stable numbers.

### Which validation CI method should I use?

**Short:** Out-of-bag (OOB) is the recommended default method because it is computationally efficient and unbiased. Nested bootstrap is the most rigorous but extremely slow. Full-sample bootstrap is a legacy method that is not recommended because it underestimates uncertainty.

**More detail:** Out-of-bag (OOB) validation uses the held-out samples from each bootstrap resample to construct the performance confidence interval, pivotally recentering the OOB width around the corrected point estimates. Nested bootstrap runs a double bootstrap loop (outer bootstrap for model training, inner bootstrap for optimism estimation) to propagate all sources of model selection and validation uncertainty. Full-sample bootstrap (legacy) computes percentile intervals directly from optimism-corrected samples across the full training dataset; it is not recommended because it ignores the uncertainty of the optimism correction itself, leading to overly narrow confidence intervals.

### What is a decision curve / net benefit, and how do I read it?

**Short:** A decision curve asks: at each risk threshold where you would act, does using the model give more useful true positives after subtracting the harm of false positives than treating everyone or treating no one? Higher net benefit is better at the threshold you care about.

**More detail:** The threshold probability is your treat/don't-treat trade-off: a 20% threshold means you would act when predicted risk is at least 20%. Net benefit weighs true positives against false positives using that threshold, then plots the model against two reference lines: "treat all" and "treat none." If the model's line is above both references near your chosen threshold, model-guided action is useful in that range. The logistic decision-curve coordinates are labeled apparent, matching the app's ROC/calibration curve-coordinate caveat; ML decision curves use pooled repeated-CV held-out predictions and are labeled out-of-sample.

---

## 6. Input data & dictionaries

### How should I structure my input file?

**Short:** One row per participant/observation, one column per variable, and column names in the header row (row 1 by default; for XLSX you can point the app at a different header row). Keep it a plain rectangular table — avoid merged cells, title banners above the headers, or multiple tables on one sheet.

### How should I code missing values?

**Short:** Leave missing cells blank — that's the preferred and least ambiguous option. If you must use a sentinel, use a single consistent one (e.g. `NA`, `N/A`); the app can recognize common ones, but blanks are safest. Avoid numeric sentinels like `999` for missing, since the app may read them as real values.

**More detail:** Excel error tokens such as `#REF!` and `#VALUE!` are coerced to missing and surfaced by a data-quality check so you can see they occurred rather than having them silently distort a column.

### What is a data dictionary and do I need one?

**Short:** A data dictionary maps raw column names and numeric codes to human-readable labels — e.g. telling the app that sex coded `1`/`2` means "Male"/"Female," or that `ga_wk` should display as "Gestational age, weeks." It's optional: without one, raw headers and codes are used as-is. With one, your table reads cleanly and categorical codes become proper labels.

### Wide versus long dictionary format — what's the difference?

**Short:** Wide format has one row per variable with columns like `variable`, `label`, `units`. Long format has one row per coded value with columns like `variable`, `code`, `label` — used when categories are stored as numbers (e.g. `1=Male`, `2=Female`). The app supports both.

### My codes (1/2) show up instead of labels — how do I fix that?

**Short:** Supply a long-format dictionary that maps each code to a label for that variable (e.g. `sex, 1, Male` / `sex, 2, Female`). The app then displays the labels in Table 1 instead of the raw numbers. You can also fix a single variable's level labels during the dictionary-compliance step if codes appear that the dictionary didn't declare.

### Can I upload a separate dictionary file?

**Short:** Yes. In the optional Data Dictionary sub-step, choose "Use a different dictionary" (or the manual flow) and upload a standalone XLSX or CSV codebook. A match count tells you how many of your data columns were found in it, and a zero-match warning means the wrong file is probably selected — it won't be applied.

### What if my headers aren't in row 1?

**Short:** For XLSX, set the header row number in the Sheet & Header sub-step; the live preview updates immediately so you can confirm the headers and data rows look right. Change it only if your sheet has title text, blank rows, or merged cells above the real headers.

### How do I choose the grouping variable?

**Short:** In the Analysis Plan step, pick the column that defines your comparison groups (e.g. treatment vs. control, case vs. control) from the grouping dropdown. Only binary and categorical variables appear there. Once chosen, that variable is removed from the row list, since you can't compare groups using the variable that defines them.

**More detail:** The Sheet & Header preview flags "likely grouping candidates" (columns with 2–5 distinct values) to help you spot the grouping variable early.

### Why was a column mis-typed (e.g. a numeric column read as a category)?

**Short:** Type inference uses cues like the number of distinct values, so a numeric column with only a few distinct whole numbers can be read as categorical (and vice versa). The Variable Types step is where you review and correct this — columns the app is unsure about are flagged "Check" or "Needs review," and you set the correct type before proceeding.

**More detail:** Whole-number numeric columns with very few distinct values are treated cautiously by design (they're often coded categories), which is why some genuinely continuous-but-low-cardinality measures get flagged for your confirmation rather than assumed.

---

## 7. Reliability, validation & limitations

### How accurate and reliable are the results?

**Short:** The statistics are computed by standard, widely-used Python libraries (SciPy, statsmodels, scikit-learn), and the Table 1 output is automatically cross-checked against the established Python `tableone` package to 4 decimal places in the test suite. The arithmetic is trustworthy for the analyses the tool is designed for — but you remain responsible for whether the chosen tests and design suit your study.

**More detail:** "Reliable" here means the numbers match a reference implementation and the engine is real scientific-computing software, not a reimplementation. It does not mean the tool can judge whether your study design, groupings, or variable choices are appropriate — that's the researcher's job.

### Has the output been validated against R / SAS / Stata?

**Short:** The automated validation is against the Python `tableone` package (a peer-reviewed, widely-cited Table 1 tool), matched to 4 decimal places on a real dataset (an NHANES subset) plus a set of synthetic edge cases. It has not been formally certified against R, SAS, or Stata, though the underlying methods (Welch's t-test, Mann–Whitney U, chi-square, Fisher's exact, etc.) are the same standard procedures those packages implement.

**More detail:** The edge cases in the harness include deliberately hard inputs — constant columns, all-missing columns, single-row groups, tiny n-vs-n groups — to check the engine degrades gracefully rather than producing wrong numbers silently.

### What does the "golden test" guarantee?

**Short:** The golden (cross-validation) test is an automated check that runs the real engine and asserts its computed statistics and P-values match the reference `tableone` package to 4 decimal places. It guards against regressions: if a code change alters a computed number, the test fails. It's a correctness guardrail on the arithmetic, not a statement about your specific dataset.

### What is this tool NOT designed for?

**Short:** It's built for cross-sectional baseline tables and basic association/prediction modeling. It is not designed for survival/time-to-event analysis, longitudinal/repeated-measures models, complex survey weighting, matched or clustered designs, meta-analysis, or bespoke custom modeling. For those, use a full statistical environment.

**More detail:** It's also not a data-cleaning suite: it flags quality issues and lets you make per-value decisions, but it won't restructure a messy file for you. Bring a tidy, rectangular dataset.

### Can I use these results in a published paper?

**Short:** Yes — producing publication-ready tables and reports is the point. As with any analysis tool, you're responsible for checking that the outputs are correct for your data and appropriate for your study, and for reporting your methods. The Reproducibility JSON and Methods Summary exist to support transparent reporting.

### Does EasyTableOne follow TRIPOD+AI reporting guidelines?

**Short:** EasyTableOne's modeling outputs are built to support TRIPOD+AI (2024) reporting for regression and machine-learning prediction models. It reports the analysis items — model type and rationale, missing-data handling, internal validation, discrimination and calibration, subgroup performance where you opt in, the software and package versions, and more — and shows a TRIPOD+AI mapping in the Modeling step and in the report. It does **not** make your study compliant on its own: items like study registration, ethics approval, data sources, and interpretation are yours to report.

**More detail:** The in-app "TRIPOD+AI reporting" panel and report checklist name what EasyTableOne emits and what remains author-owned. The app emits the logistic equation, model rationale, missing-data and imputation handling, repeated stratified cross-validation, bootstrap validation, no-leakage statements, class-imbalance handling, the classification threshold for sensitivity/specificity, logistic performance confidence intervals where resampling supports them, ML intervals across CV repetitions, decision-curve/net-benefit analysis for clinical utility, opt-in subgroup discrimination and calibration on validation-appropriate predictions, baseline characteristics, package versions, and the Pyodide/WebAssembly in-browser runtime. The logistic model is fully specified by the exported equation and reproducibility JSON; the ML benchmark models are evaluated in-session and are not exported as portable fitted objects. Choosing relevant subgroups and interpreting any differences remains the author's responsibility.

### Can EasyTableOne check my model for fairness across subgroups?

**Short:** It can report subgroup performance, but it does not certify that a model is fair. If you choose subgroup characteristics in Modeling, EasyTableOne reports AUC, calibration slope, and Brier score within each level using the same held-out or validation-appropriate predictions.

**More detail:** This is opt-in: no subgroup analysis runs unless you select categorical subgroup variables such as sex, age band, or site. Small subgroups are shown as unreportable when there are too few events or non-events to estimate metrics reliably, rather than printing unstable numbers. The output supports TRIPOD+AI item 14 reporting, but subgroup choice, interpretation, fairness judgement, and any mitigation remain author-owned.

### What is the Reproducibility JSON and how does it help?

**Short:** It's a machine-readable record of every choice made in your analysis (types, groupings, tests, outlier and imputation decisions, journal formatting) with timestamps, so your results can be independently reproduced or audited. Optionally it can include a SHA-256 hash of your input file to verify the same data was used.

**More detail:** Together with the Analysis History (a timestamped log of user actions) and the Methods Summary (a plain-language methods paragraph), it forms an audit trail from raw file to final table.

### How should I cite EasyTableOne or its methods?

**Short:** Suggested citation: **<span style="color: red;">[CITATION PLACEHOLDER — TO BE FINALIZED]</span>**. In the meantime, cite the underlying statistical methods and, where relevant, the `tableone` reference the engine is validated against; the Methods Summary export gives you a ready paragraph to adapt, and the **About** page carries the current method references.

### Is this a medical device or for clinical decision-making?

**Short:** No. EasyTableOne is a research and statistical-reporting tool for summarizing study data. It is not a medical device and is not intended to guide diagnosis or treatment decisions for individual patients.

### What are the known limitations?

**Short:** Performance is bounded by your browser and device on very large datasets; the scope is baseline tables plus basic modeling, not advanced designs; the tool automates sensible defaults but can't judge whether your study design is sound; and session restore isn't implemented yet, so a refresh resets your work (use Save to archive your choices).

---

## 8. Exports & journal formatting

### What export formats are available?

**Short:** For the table itself: Word (DOCX), Excel (XLSX), CSV, LaTeX, and PDF. Plus supporting outputs: Data Quality Report, EDA Report, Modeling Report, Methods Summary, Education Report, a single self-contained Unified Report (HTML), a Reproducibility JSON, an Analysis History log, a Diagnostics CSV — and a ZIP containing everything.

**More detail:** Every export is generated locally in your browser and downloaded directly; some reports only appear if you ran the relevant step (EDA in Step 3, Modeling in Step 6).

### What does the journal selector change?

**Short:** Choosing a target journal applies that journal's formatting conventions — decimal precision, P-value formatting, thousands separators, header and footnote styles, and table title wording. It changes presentation, not the underlying statistics.

**More detail:** Built-in styles are New England Journal of Medicine, JAMA, The Lancet, Nature Medicine, and a Standard/Generic format. Formatting rules are driven entirely by the journal ruleset file, so styles are consistent and centrally defined rather than hardcoded per export.

### My target journal isn't listed — what do I do?

**Short:** Use "Standard/Generic Format" for a clean, publication-ready default, then use the journal override panel to fine-tune specific choices (decimal places, P-value format, SMD display, etc.) to match your target journal's instructions. Each override is labeled so you can track what you changed.

### Can I fine-tune formatting without switching journals?

**Short:** Yes — the journal override panel lets you adjust individual formatting options on top of any selected journal, without changing journals. Overrides are recorded so your formatting choices stay transparent and reproducible.

### What's in the Data Quality, Methods, and Education reports?

**Short:** The Data Quality Report documents all data-check findings, your acknowledgements, outlier decisions, and dictionary-compliance resolutions (an audit trail for methods). The Methods Summary is a plain-language paragraph describing the statistical approach, ready to paste into a manuscript. The Education Report gives the full plain-language rationale for each variable's test choice — useful for learning or transparent reporting.

### What is the Unified Report, and can I get everything in one ZIP?

**Short:** The Unified Report is a single self-contained HTML file bundling every section you generated — Table 1, EDA, modeling, data quality, and methods — with figures embedded, so it opens anywhere with no dependencies. The "Download ZIP (all files)" option packages all individual exports together in one archive.

### Why does my export look slightly different from the live preview?

**Short:** The preview is an HTML rendering; each export format (Word, PDF, LaTeX, Excel) has its own layout engine, so spacing, fonts, and pagination can differ even though the numbers and formatting rules are identical. Check the final file in its target application before submitting.

---

## 9. Troubleshooting

### The analysis engine won't start / is stuck on yellow.

**Short:** The yellow indicator means Pyodide is still loading. Give it a few seconds on first open. If it never turns green, your connection may have failed to fetch the engine, or your browser/network may be blocking WebAssembly — try a reload, a current desktop browser, or a less restricted network.

**More detail:** Corporate proxies that block WebAssembly or the engine's asset downloads are the most common cause of a permanently-yellow engine. Steps that need computation wait for green automatically, so you don't need to click repeatedly.

### My file won't upload or shows "unsupported format."

**Short:** Only `.csv` and `.xlsx` are accepted. Convert `.xls`, Google Sheets, or other formats to CSV or XLSX first. Also make sure the file is a plain data table (one header row, one row per record), not a formatted report with banners or multiple tables.

### The app froze or slowed on a large file.

**Short:** Very large datasets strain the in-browser engine. Above 50,000 rows you'll see a notice, and above 150,000 rows a confirmation gate — heed them. If it's sluggish, close other tabs, use a machine with more memory, or sample/pre-aggregate the data before uploading.

### A variable I need is missing from the grouping dropdown.

**Short:** The grouping dropdown only lists binary and categorical variables, since groups must be defined by categories. If your intended grouping variable isn't there, it's probably typed as numeric or identifier — go back to Variable Types and set it to a categorical/binary type.

### I can't get past a "blocking" data-check error.

**Short:** Blocking (red) findings must be fixed before you can proceed — for example a column where every value is identical, or a dictionary-compliance violation. Read the remedy text on the finding; it tells you exactly what to resolve (fix the source data, or, for compliance violations, choose treat-as-missing or add-as-new-level). The Proceed button re-enables once blockers are cleared.

### My logistic or Firth run failed with an error.

**Short:** Modeling failures usually come from the data geometry — a predictor that perfectly separates the outcome, columns that are constant after dropping missing rows, near-duplicate (collinear) predictors, or wildly different scales. The app diagnoses these and gives a specific cause and remedy rather than a raw solver error; follow that message (often: drop/combine a predictor, or use Firth's penalized logistic regression).

**More detail:** When plain logistic regression is unstable or won't converge, the app can route the fit through Firth automatically and tells you it did. If you still get an error, simplify the predictor set as the message suggests.

### The numbers or Ns look wrong.

**Short:** The most common cause is missing data or an unexpected variable type. Table 1 uses available cases, so a variable's N reflects only non-missing values; check the QA/QC Details for missingness and cardinality, and confirm the variable's type and any outlier/exclusion decisions in the earlier steps.

### I have Excel error tokens (`#REF!`, `#VALUE!`) in my data.

**Short:** The app converts these to missing and raises a data-quality check so you're aware of them. Ideally, fix the formulas in the source spreadsheet and re-upload, so those cells hold real values rather than being dropped as missing.

### Can I save and resume a session later?

**Short:** Not yet fully. The **Save** button downloads a JSON snapshot of your analysis choices for archiving, but re-loading it to resume a session is on the roadmap and not implemented. For now, keep your source file and, if needed, the Reproducibility JSON to re-run.

### How do I report a bug or request a feature?

**Short:** Open the **About** button in the top bar — the contact/reporting channel is listed there.

---
