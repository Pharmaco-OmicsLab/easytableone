# EasyTableOne — User Tutorial

_Source of truth for the Tutorial modal content. Codex reads this file when implementing the modal; do not restructure it without also updating the modal._

---

## What EasyTableOne does

EasyTableOne generates a publication-ready "Table 1: Baseline Characteristics" from a CSV or XLSX clinical dataset — entirely in your browser. No data is uploaded to any server.

The workflow has **7 steps**, shown in the left sidebar. Completed steps are marked with `*`; the active step is marked with `>`. Future steps are grayed out until their prerequisites are met.

---

## Step 1 — Import data

Step 1 has four sub-steps that appear one at a time, collapsing when done.

### 1a. File

Drag and drop a CSV or XLSX file onto the upload area, or click it to open a file picker. Only `.csv` and `.xlsx` files are accepted.

**Buttons on the upload card (before a file is loaded):**

- **View input format guide** — opens this tutorial.
- **Try with sample data** — loads a built-in sample dataset so you can explore the full workflow without your own file. The app advances to the Sheet & Header sub-step automatically.
- **Download sample workbook** — saves the sample XLSX to your computer so you can inspect its structure or use it as a template.

**After a file loads successfully**, the upload area turns green and shows the filename and row/column count. You can drag a new file onto it at any time to replace it, or click **Choose a different file**.

**File requirements:**
- One row per participant / observation.
- First row (or the row you specify in sub-step 1b) contains column names.
- One column per variable.
- Missing values should be left blank or marked with a consistent sentinel (e.g. `NA`, `N/A`, `999`). Blanks are preferred.

**Privacy:** all parsing, computation, and export happen locally in your browser. The app never transmits your data anywhere.

![Sample data sheet: headers in the first row, one participant per row, and one measurement or category per column.](/samples/samplecsv.jpg)

_Sample data sheet: headers are in the first row, each participant is one row, and each measurement or category is a separate column._

### 1b. Study settings

Appears after a file loads. Two choices:

**Study population** — determines which sanity-bound ranges the app uses in Data Checks (Step 3):
- **Adult (≥ 18 years):** use for adult cohorts, or mixed pediatric/adult studies (e.g. ages 0–80). Applies broad adult human plausibility ranges.
- **Pediatric (0–17 years):** use for studies of children or adolescents. Applies pediatric reference ranges.
- **Other / Non-human:** use for animal studies, cell cultures, lab data, or anything that isn't a human clinical dataset. Plausibility sanity-bound checks are disabled entirely.

**Measurement units** — tells the app how to interpret numeric measurements for sanity checking:
- **Metric (SI):** kg, cm, mmol/L, umol/L, etc.
- **Imperial (US customary):** lbs, inches, mg/dL, etc.

Choose the unit system your dataset actually uses, not your preferred display format.

Click **Continue to sheet & header** to proceed.

### 1c. Sheet & header row

_(XLSX only — CSV skips the sheet picker and goes straight to the header row.)_

**Sheet selector (XLSX with multiple sheets):** card tiles show each sheet's name and dimensions. Sheets the app suspects are dictionaries are labeled "Dictionary?" and are grayed out. Click a tile to select it as the data sheet.

**Header row:** enter the row number that contains your column names. Default is 1. The live preview table updates immediately — use it to confirm that column headers and data rows look right. Most files use row 1; only change it if your sheet has title text, blank rows, or merged cells above the actual headers.

A "Likely grouping candidates" note at the bottom of the preview flags columns with 2–5 distinct values — these are usually the grouping variable (treatment arm, disease status, etc.).

Click **Confirm header row** to proceed.

### 1d. Data dictionary _(optional)_

A data dictionary maps raw column names and numeric codes to human-readable labels. For example, if your dataset stores sex as `1` and `2`, the dictionary tells the app those mean "Male" and "Female."

**Auto-detect:** if the app finds a dictionary sheet in your workbook with a high match score, it shows a detection banner with a preview table. Three choices:
- **Use this dictionary** — applies the labels, units, and category codes from the detected sheet. Click to confirm and move to Variable Types.
- **Skip — no dictionary** — proceeds without any dictionary. Column names stay as raw headers.
- **Use a different dictionary** — dismisses the auto-detection and opens the manual selection flow.

**Manual selection flow:**
- **Upload separate dictionary file** — upload a standalone XLSX or CSV codebook. For multi-sheet uploads, a sheet-picker appears.
- **Select Dictionary Sheet dropdown** — if your current XLSX has other sheets, they appear here alongside any uploaded file's sheets. Sheets marked "(Suggested)" are ones the app thinks look like a dictionary.
- A **match count** below the dropdown tells you how many of your data columns were found in the selected dictionary. A zero-match warning means the wrong file may be selected — it will not be applied.
- **Dictionary preview table** shows the first several rows of the selected sheet so you can confirm it looks right before importing.

Click **Import dictionary** to apply it, or **Skip — continue to variable types** to proceed without one.

**Dictionary formats supported:**

![Sample dictionary sheet mapping raw variable names and coded values to reader-friendly labels.](/samples/sampledict.jpg)

_Sample dictionary sheet: use variable names from the data sheet, then add labels, units, and coded-value labels where needed._

- _Wide format:_ columns are `variable`, `label`, `units` — one row per variable.
- _Long format:_ columns are `variable`, `code`, `label` — one row per coded value. Used when categories are stored as numbers (e.g. `1=Male`, `2=Female`).

The sheet name "Dictionary" is recognized automatically; other sheet names are detected by content.

---

## Step 2 — Variable types

The app has inferred a type for each column. Review and correct them here. Every variable is one row in the table.

**Table columns:**

- **Raw column** — the original column name from your file. This never changes and stays as the internal key.
- **Display label** — the name that appears in the published table. Edit it to be reader-friendly (e.g. "Gestational age, weeks" instead of `ga_wk`). Leave blank to use the raw column name.
- **Units** — an optional annotation shown in the table (e.g. `mg/dL`, `years`). Does not affect calculations.
- **Type** — what statistical treatment this variable gets. The choices and their consequences:
  - **Numeric** — continuous measurements (age, weight, lab values). Reported as mean ± SD or median [IQR] depending on whether normality is met.
  - **Yes/No category (binary)** — exactly two levels (yes/no, male/female). Reported as n (%).
  - **Category (no order)** — three or more nominal levels (blood type, race, country). Reported as n (%).
  - **Ordered category (ordinal)** — categories with a meaningful clinical rank (NYHA class, pain scale). Reported in the order you set.
  - **Identifier** — patient or record IDs. Automatically excluded from Table 1.
  - **Unsupported** — free text, mixed formats, or other non-analyzable columns. Automatically excluded.
  - **Needs review (Ambiguous Numeric)** — the app could not determine whether the column is numeric or categorically encoded. You must resolve these before you can proceed.

- **Levels / Ordinality** (categorical and binary variables only):
  - **Mark as ordinal** checkbox — tick to treat a categorical variable as ordered and enable level reordering.
  - **↑ / ↓ arrows** — move a level up or down in the display order (ordinal variables only).

- **Status** — a signal about whether the inferred type is reliable:
  - **OK** — no issue.
  - **Check** (yellow) — worth reviewing. For example, a numeric column with very few distinct values might actually be categorically encoded.
  - **High** (red) — likely a problem that needs your attention.
  - Below the status badge, a short message explains what triggered it.
  - **"Don't include in table"** (red button) — removes this variable from Table 1. Your source data is unchanged; it can be re-included at any time.
  - **Restore** (blue button) — re-includes a previously excluded variable.

**Bulk actions toolbar** (gray bar above the table):

- **Set all to Binary / Numeric / Category** — applies that type to every column currently flagged as Ambiguous Numeric. Useful when many columns have the same encoding issue. A confirmation prompt appears before the change is applied.
- **Revert Bulk Action** (amber button, appears after a bulk change) — undoes the last bulk assignment and restores the previous types.
- **Reset to Default** (red button) — reverts all your manual type edits in this step back to the app's original inferred types.

**Decision explainers:** four blue expandable panels ("Why these inferred variable types?", "Why these reference levels?", "Why confirm ordinal order?", "Why exclude these variables?") explain the app's reasoning. Click to expand.

**Column resize:** drag the right edge of any column header to widen or narrow it.

Click **Proceed** when all Ambiguous Numeric columns are resolved. The button is disabled until then.

---

## Step 3 — Data checks

The app checks your dataset for quality issues. Three tiers:

- **Blocking** (red) — must be resolved before you can proceed. Examples: a column where every value is identical; a dictionary compliance violation.
- **Review** (amber) — significant enough that you must explicitly acknowledge the issue. Examples: very small group sizes; high missingness (≥ 20%) in key variables.
- **Advisory** (blue/gray) — informational notices. They are logged but do not block you.

**Data Quality Gate Panel** (top section):

For each finding, read the title and description. Then:
- **Advisory:** click **Dismiss** to record that you've seen it.
- **Review:** tick the "I acknowledge this issue" checkbox after reading it.
- **Blocking:** follow the remedy text to fix it. The Proceed button stays disabled until blocking issues are resolved.

The **"I acknowledge these issues and want to proceed"** amber button (appears when all review items are checked but Proceed isn't yet clicked) bulk-acknowledges remaining review findings at once.

**Polish Advisor Panel:** suggests cosmetic improvements, such as variables that would benefit from a display label. Each suggestion can be dismissed individually. These do not affect calculations.

**EDA (Exploratory Data Analysis) panel:** click **Run EDA** to generate missingness summaries, histograms, and inter-variable correlation heatmaps. Entirely optional for a basic Table 1, but useful for understanding the data before finalizing. Results can be exported in Step 7.

**QA/QC Details** (collapsible section at the bottom — expand with ▼):

Displays per-column statistics: missing value count and percentage, cardinality (number of distinct values), outliers detected by the IQR method, and any column-level flags.

**Outlier handling** (for each outlier row):
- **Keep** — leave the value as-is in all calculations.
- **Exclude** — omit this row's value from Table 1 calculations. The raw data row is not deleted.
- **Winsorize** — cap the value at the 1st / 99th percentile boundary instead of removing it.

**Dictionary compliance violations** (shown in QA/QC Details if a dictionary was imported and the data contains values not declared in it):

For each affected column, choose:
- **Treat as missing for this column** — marks the undeclared values as blank in Table 1 calculations.
- **Add as new level(s)** — promotes the undeclared values to proper dictionary levels. Enter a display label for each value in the text fields before clicking.
- **Cancel & Re-upload Data** — sends you back to Step 1 to fix the source file or dictionary.

The Proceed button stays disabled until every violation is resolved.

**Proceed button states:**
- Grayed out with red text: blocking issues must be resolved first.
- Amber **"I acknowledge these issues and want to proceed"**: click to acknowledge all review findings at once.
- Blue **Proceed**: all issues are resolved or acknowledged. Click to move to Analysis Plan.

Table 1 summarizes values that are actually recorded — it does not fill in missing values. If you want complete-case or multiple-imputation analysis, enable Modeling (Step 6).

---

## Step 4 — Analysis plan

Set up what the table compares and which variables appear in it.

**Grouping variable** — the column that defines your comparison groups (e.g. Treatment vs. Control, Case vs. Control). Only binary and categorical variables appear in this dropdown. When you pick one, it is automatically removed from the variable list below (since you can't compare groups using the variable that defines the groups).

The **Table Column Order Preview** (blue box below the dropdown) shows the groups and their sample sizes in the current sort order.

**Sort table columns by** — controls the left-to-right order of group columns in Table 1:
- **Default** — dictionary order if available; otherwise value order.
- **Frequency (desc)** — most-common group appears first.
- **Value (asc)** — ascending numeric or alphabetical order.
- **Custom** — type one group label per line in the text area to set an exact order. Group labels must match exactly what is in the data (case-sensitive).

**Choose Variables** (left panel, scrollable list):
- Tick or untick each variable to include or exclude it from Table 1.
- **Select all** / **Clear all** — bulk include or exclude all eligible variables.

**Table Rows Order** (right panel):
- Shows the current included variables in the order they will appear as rows in Table 1.
- **Drag** a row to reorder it.
- **⤴** (move to top), **↑** (move up), **↓** (move down) buttons at the right of each row.

**Displayed level** (binary variables only): a small dropdown next to each binary variable in the row-order panel. Chooses which of the two levels is summarized as n (%) in the table. For example, for Smoker (Yes/No), choosing "Yes" reports the count and percentage of smokers; choosing "No" reports non-smokers. The default is automatically set to the less-frequent level (usually the event of interest). Click **Reset** next to the dropdown to revert to the default.

**Show SMD** checkbox — standardized mean difference, a balance metric used in randomized trial reporting (CONSORT). On by default. Uncheck if your journal prefers p-values only, or if you are reporting an observational study where SMD is not conventional.

**Show p-value** checkbox — the p-value from the appropriate statistical test for each row. On by default. Some journals discourage p-values in Table 1 for randomized trials (because they test the null hypothesis of equal distributions, not the treatment effect).

**Multiple Testing Correction** dropdown — adjusts p-values when many variables are tested simultaneously:
- **No correction** — report raw p-values. Acceptable for a descriptive Table 1.
- **Bonferroni** — divides the threshold by the number of tests. Very conservative; best for confirmatory analyses with few hypotheses.
- **Holm** — step-down method, less conservative than Bonferroni while still controlling the familywise error rate.
- **Benjamini–Hochberg** — controls false discovery rate rather than familywise error. Better suited for exploratory analyses with many variables.

An advisory appears if the selected correction materially changes the significance of your results.

Click **Run Statistics** to compute Table 1. The button is disabled if: no grouping variable is chosen; no variables are selected; or blocking plan findings are present. Computation runs locally in your browser — large datasets can take several seconds. Click **Back** (or the sidebar) while computing to cancel.

---

## Step 5 — Statistical review

The computed Table 1 is shown here with per-variable test explanations.

**Test decision badges** — each variable row shows a badge explaining which statistical test was used and why:
- _Continuous variables:_ Welch's t-test (two groups, normal) / ANOVA (three+ groups, normal) / Mann-Whitney U (two groups, non-normal) / Kruskal-Wallis (three+ groups, non-normal). Normality is assessed by Shapiro-Wilk for small samples; by skewness and kurtosis for large samples.
- _Categorical/binary variables:_ Chi-square (expected cell counts ≥ 5) / Fisher's exact (some expected cell counts < 5).

The rationale text below each badge explains the specific reason the test was chosen for that variable.

**Multiple testing correction advisory** — if you selected a correction in Step 4 and it changes significance conclusions, a banner at the top of the page flags this.

**Diagnostics panel** — shows per-variable test statistics (test statistic, degrees of freedom, exact p-value). Useful if you need to report these in your methods section.

**Explanation depth toggle** (top bar, "Brief" / "Detailed") — controls how much statistical rationale is shown throughout the app. "Detailed" adds full plain-language explanations to each decision.

**Enable modeling** — to run logistic regression or machine learning classifiers, click **"6. Modeling (optional)"** in the left sidebar, which shows "Enable modeling" in dashed style until you click it. You can also do this after reviewing the table.

---

## Step 6 — Modeling _(optional)_

Enables logistic regression and machine learning on your dataset. Click **"6. Modeling (optional)"** in the sidebar to enter this step. It is entirely optional and does not affect Table 1.

### Logistic Regression tab

**Outcome variable** — select the binary variable you want to predict (e.g. disease status, treatment response).

**Predictor variables** — choose which variables to include as predictors. Any variable type works.

**Method:**
- **Plain** — standard logistic regression. Best for adequately sized samples.
- **Firth** — penalized logistic regression. Recommended when you have small samples, rare outcomes, or complete separation (a predictor perfectly predicts the outcome). The app may suggest Firth automatically.
- **LASSO** — L1 regularization; performs automatic variable selection.
- **Ridge** — L2 regularization; shrinks coefficients, keeps all variables.
- **Elastic-net** — mix of LASSO and Ridge.

**Imputation** — how to handle missing predictor values:
- **No imputation (complete cases only)** — only rows where all selected predictors are observed are used. Simplest, but loses data.
- **Mean / Median / Mode (single fill)** — fills each gap with the column's mean, median, or most-common value. Fast but underestimates uncertainty because it treats filled values as known.
- **Constant** — fills with a fixed value you specify. Enter the value in the text field that appears.
- **kNN (k-nearest neighbors)** — fills gaps using the average of the k most similar observed rows. Accurate, slower than simple fill.
- **Random Forest** — fills gaps using a random forest model. Accurate; not recommended for very large datasets (slow). A warning appears for datasets over the large-N threshold.
- **MICE (multiple imputation by chained equations)** — runs multiple complete datasets, fits the model on each, and pools results using Rubin's Rules. The statistically principled standard for missing data. Slowest option. The number of imputed datasets (m) can be set in the setup field.

**Outcome-aware imputation** (kNN / RF / MICE only) — when checked, includes the outcome variable as a helper feature when imputing predictor gaps. This improves imputation accuracy because the outcome carries information about the predictors. Uncheck if you are concerned about circular leakage (the app notes the tradeoff when you uncheck it). Not available for simple-fill methods because they use column-level statistics, not row-level similarity.

**Bootstrap CIs** checkbox — computes 95% confidence intervals via bootstrap resampling instead of asymptotic (Wald) intervals. More accurate for small samples or non-standard distributions, but substantially slower.

**Fast validation** checkbox — when checked, runs 200 resamples and uses single imputation to keep the app responsive. When unchecked (Thorough validation), runs 1000 resamples and replicates the full imputation loop per resample to propagate all uncertainty (takes substantially longer).

**Validation CI method** dropdown — controls how internal-validation performance confidence intervals (AUC, calibration, Brier score) are computed:
- **Out-of-bag (OOB):** uses held-out samples from each resample, recentering the width around corrected estimates. Unbiased and recommended.
- **Nested bootstrap:** runs a double bootstrap loop (outer training, inner optimism) to propagate all uncertainty. Extremely slow.
- **Full-sample:** uses optimism resamples on the full training dataset. Legacy method, not recommended because it understates uncertainty.

Click **Run logistic regression**. A runtime estimate is shown before running.

Results show: odds ratios, 95% CIs, p-values, and AIC. For MICE, Rubin-pooled estimates are reported.

### Machine Learning tab

Runs a cross-validated benchmark of classifiers (logistic, random forest, gradient boosting, and others). Outcome and predictor selection work the same as above. Imputation is applied fold-locally (train set only) to prevent data leakage.

Results show: AUC, accuracy, calibration plots, and feature importance rankings for each classifier.

---

## Step 7 — Format and export

### Journal style

**Journal selector** — choose a target journal to apply its specific formatting rules (decimal places, p-value formatting, column header styles, footnote style). "EasyTableOne Default" produces a generic publication-ready format.

**Journal override panel** — fine-tune individual formatting choices without switching journals (e.g. override p-value decimal places, SMD display). Each override is labeled so you can track what you changed.

### Live preview

A formatted HTML preview of Table 1 is shown before you download anything. Use it to check alignment, labels, and overall appearance.

### Export buttons

Each button triggers an immediate download in your browser:

| Export | What it contains |
|--------|-----------------|
| **Download Table (DOCX)** | Word document with the formatted Table 1. Most common journal submission format. |
| **Download Table (XLSX)** | Excel spreadsheet version of the table. |
| **Download Table (CSV)** | Plain comma-separated values. |
| **Download Table (LaTeX)** | LaTeX `tabular` code for direct inclusion in a manuscript. |
| **Download Table (PDF)** | Direct PDF output. |
| **Download Data Quality Report (DOCX / PDF)** | Documents all data-check findings, your acknowledgements, outlier decisions, and compliance resolutions — useful for a methods audit trail. |
| **Download EDA Report** | Exploratory data analysis outputs (if you ran EDA in Step 3): missingness summaries, histograms, correlation heatmaps. |
| **Download Modeling Report (DOCX)** | Logistic regression / ML results with ORs, CIs, forest plots, and calibration curves (if Modeling was run in Step 6). |
| **Download Methods Summary (DOCX)** | A plain-language methods paragraph describing the statistical approach used — ready to paste into your manuscript. |
| **Download Education Report (DOCX)** | Full statistical decision rationale for each variable, written in plain language. Useful for learning or transparent reporting. |
| **Download Unified Report (HTML)** | A single self-contained HTML file with all sections: Table 1, EDA, modeling, data quality, and methods. |
| **Download ZIP (all files)** | All of the above in one archive. |
| **Reproducibility JSON** | Machine-readable record of every choice made in the analysis, with timestamps. Includes a SHA-256 hash of your input file if the hash setting is enabled. Supports independent reproduction of your results. |
| **Analysis History** | A timestamped audit log of all user actions (type changes, outlier decisions, acknowledgements, etc.). |
| **Diagnostics CSV** | Per-variable test statistics in a flat table (test name, statistic, df, p-value). |

---

## Global controls

### Sidebar navigation

Shows all 7 steps. The active step is highlighted with `>`. Completed steps show `*` and are clickable — you can return to any completed step at any time to make changes and re-run from there. Future steps are grayed out and show a tooltip explaining what prerequisite is needed.

**"6. Modeling (optional)"** appears with a dashed border and "Enable modeling" sub-label after Statistical Review is complete. Clicking it enables the modeling stage and navigates to it.

### Top bar

- **Tutorial** button — opens this tutorial at any time from anywhere in the app.
- **About** button — opens the About page with app description, method references, and version information.
- **Save** button — downloads a JSON snapshot of your current analysis state for local recordkeeping. _Session restore is on the roadmap but not yet implemented — this file is for archiving, not re-loading._
- **Explanation depth toggle** (Brief / Detailed) — switches between concise summaries and full statistical rationale throughout the app.

On mobile, a hamburger menu (☰) at the top-left opens a slide-out drawer with the same navigation.

### Settings _(gear icon at the bottom of the sidebar)_

- **Include input data hash in reproducibility JSON** — when on, a SHA-256 fingerprint of your input file is embedded in the reproducibility JSON. Off by default because the hash is a data fingerprint. Turn it on only if you need to verify that the input file is identical across re-runs.

### Analysis engine status

Shown below the "EasyTableOne" title in the sidebar (or drawer):
- **Green dot — "Analysis engine ready"** — the statistical engine (Pyodide) has finished loading and all computations can proceed.
- **Yellow dot — "Starting analysis engine..."** — loading, usually takes under 5 seconds on first open. Steps that require computation (Run Statistics, Run EDA, Run logistic regression) will wait for this automatically.
