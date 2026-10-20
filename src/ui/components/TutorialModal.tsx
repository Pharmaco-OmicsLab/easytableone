import { useCallback, useRef } from "react";
import { useStore } from "../../store";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { GLOSSARY } from "./glossary";
import {
  SMD_CAVEAT,
  SMD_USE_WHEN,
  SMD_USUALLY_NOT_NEEDED,
  SMD_WHEN_TO_USE_HEADLINE,
} from "../../content/smdGuidance";

interface TutorialModalProps {
  onOpenSettings?: () => void;
}

const codeClass = "rounded bg-gray-100 px-1 text-xs";
const listClass = "list-disc space-y-1 pl-5";
const h4Class = "mt-4 font-semibold text-gray-900";
const summaryClass =
  "cursor-pointer select-none bg-gray-50 px-5 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-100";
const bodyClass = "space-y-4 px-5 py-4 text-sm text-gray-700";
const sampleDataSheetImage = `${import.meta.env.BASE_URL}samples/samplecsv.jpg`;
const sampleDictionaryImage = `${import.meta.env.BASE_URL}samples/sampledict.jpg`;

function TutorialFigure({
  src,
  alt,
  caption,
}: {
  src: string;
  alt: string;
  caption: string;
}) {
  return (
    <figure className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <img src={src} alt={alt} className="w-full border-b border-gray-200 object-contain" loading="lazy" />
      <figcaption className="bg-gray-50 px-4 py-2 text-xs text-gray-600">{caption}</figcaption>
    </figure>
  );
}

function StepDetails({
  title,
  open = false,
  children,
}: {
  title: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="rounded-lg border border-gray-200">
      <summary className={`${summaryClass} ${open ? "rounded-t-lg" : "rounded-lg"}`}>{title}</summary>
      <div className={bodyClass}>{children}</div>
    </details>
  );
}

export default function TutorialModal({ onOpenSettings }: TutorialModalProps) {
  const { tutorialOpen, setTutorialOpen } = useStore();
  const modalRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setTutorialOpen(false), [setTutorialOpen]);
  useFocusTrap(modalRef, tutorialOpen, close);

  if (!tutorialOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 overflow-y-auto py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tutorial-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div ref={modalRef} tabIndex={-1} className="max-h-[80vh] overflow-auto bg-white rounded-2xl shadow-xl w-full max-w-4xl mx-4 p-8 relative">
        <button
          onClick={close}
          className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          aria-label="Close tutorial"
          id="tutorial-close-button"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <h2 id="tutorial-modal-title" className="text-2xl font-bold text-gray-900 mb-2">
          How to use EasyTableOne
        </h2>
        <p className="text-gray-600">
          EasyTableOne generates a publication-ready Table 1 from your dataset — entirely in your browser. Follow the 7 steps below.
        </p>

        <div className="mt-6 space-y-3">
          <StepDetails title="Step 1 — Import data" open>
            <p>Step 1 has four sub-steps that appear one at a time, collapsing when done.</p>
            <h4 className={h4Class}>File</h4>
            <p>
              Drag and drop a CSV or XLSX file onto the upload area, or click it to open a file picker. Only <code className={codeClass}>.csv</code> and{" "}
              <code className={codeClass}>.xlsx</code> files are accepted.
            </p>
            <p>
              <strong>Buttons on the upload card (before a file is loaded):</strong>
            </p>
            <ul className={listClass}>
              <li>
                <strong>View input format guide</strong> — opens this tutorial.
              </li>
              <li>
                <strong>Try with sample data</strong> — loads a built-in sample dataset so you can explore the full workflow without your own file. The app advances to the Sheet &
                Header sub-step automatically.
              </li>
              <li>
                <strong>Download sample workbook</strong> — saves the sample XLSX to your computer so you can inspect its structure or use it as a template.
              </li>
            </ul>
            <a
              href={`${import.meta.env.BASE_URL}samples/easytableone_sample.xlsx`}
              download
              id="tutorial-download-sample"
              className="inline-flex items-center rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <svg className="mr-2 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download sample workbook
            </a>
            <p>
              <strong>After a file loads successfully</strong>, the upload area turns green and shows the filename and row/column count. You can drag a new file onto it at any time
              to replace it, or click <strong>Choose a different file</strong>.
            </p>
            <p>
              <strong>File requirements:</strong>
            </p>
            <ul className={listClass}>
              <li>One row per participant / observation.</li>
              <li>First row (or the row you specify in sub-step 1b) contains column names.</li>
              <li>One column per variable.</li>
              <li>
                Missing values should be left blank or marked with a consistent sentinel (e.g. <code className={codeClass}>NA</code>,{" "}
                <code className={codeClass}>N/A</code>, <code className={codeClass}>999</code>). Blanks are preferred.
              </li>
            </ul>
            <p>
              <strong>Privacy:</strong> all parsing, computation, and export happen locally in your browser. The app never transmits your data anywhere.
            </p>
            <TutorialFigure
              src={sampleDataSheetImage}
              alt="Sample EasyTableOne data sheet with one participant per row and clinical variables in columns"
              caption="Sample data sheet: headers are in the first row, each participant is one row, and each measurement or category is a separate column."
            />
            <h4 className={h4Class}>Study settings</h4>
            <p>Appears after a file loads. Two choices:</p>
            <p>
              <strong>Study population</strong> — determines which sanity-bound ranges the app uses in Data Checks (Step 3):
            </p>
            <ul className={listClass}>
              <li>
                <strong>Adult (≥ 18 years):</strong> use for adult cohorts, or mixed pediatric/adult studies (e.g. ages 0–80). Applies broad adult human plausibility ranges.
              </li>
              <li>
                <strong>Pediatric (0–17 years):</strong> use for studies of children or adolescents. Applies pediatric reference ranges.
              </li>
              <li>
                <strong>Other / Non-human:</strong> use for animal studies, cell cultures, lab data, or anything that isn't a human clinical dataset. Plausibility sanity-bound checks
                are disabled entirely.
              </li>
            </ul>
            <p>
              <strong>Measurement units</strong> — tells the app how to interpret numeric measurements for sanity checking:
            </p>
            <ul className={listClass}>
              <li>
                <strong>Metric (SI):</strong> kg, cm, mmol/L, umol/L, etc.
              </li>
              <li>
                <strong>Imperial (US customary):</strong> lbs, inches, mg/dL, etc.
              </li>
            </ul>
            <p>Choose the unit system your dataset actually uses, not your preferred display format.</p>
            <p>
              Click <strong>Continue to sheet & header</strong> to proceed.
            </p>
            <h4 className={h4Class}>Sheet & header row</h4>
            <p>
              <em>(XLSX only — CSV skips the sheet picker and goes straight to the header row.)</em>
            </p>
            <p>
              <strong>Sheet selector (XLSX with multiple sheets):</strong> card tiles show each sheet's name and dimensions. Sheets the app suspects are dictionaries are labeled
              "Dictionary?" and are grayed out. Click a tile to select it as the data sheet.
            </p>
            <p>
              <strong>Header row:</strong> enter the row number that contains your column names. Default is 1. The live preview table updates immediately — use it to confirm that
              column headers and data rows look right. Most files use row 1; only change it if your sheet has title text, blank rows, or merged cells above the actual headers.
            </p>
            <p>A "Likely grouping candidates" note at the bottom of the preview flags columns with 2–5 distinct values — these are usually the grouping variable (treatment arm, disease status, etc.).</p>
            <p>
              Click <strong>Confirm header row</strong> to proceed.
            </p>
            <h4 className={h4Class}>Data dictionary (optional)</h4>
            <p>
              <span className="text-gray-500">recommended, not required</span>
            </p>
            <p>
              A data dictionary maps raw column names and numeric codes to human-readable labels. For example, if your dataset stores sex as <code className={codeClass}>1</code> and{" "}
              <code className={codeClass}>2</code>, the dictionary tells the app those mean "Male" and "Female."
            </p>
            <p>
              <strong>Auto-detect:</strong> if the app finds a dictionary sheet in your workbook with a high match score, it shows a detection banner with a preview table. Three choices:
            </p>
            <ul className={listClass}>
              <li>
                <strong>Use this dictionary</strong> — applies the labels, units, and category codes from the detected sheet. Click to confirm and move to Variable Types.
              </li>
              <li>
                <strong>Skip — no dictionary</strong> — proceeds without any dictionary. Column names stay as raw headers.
              </li>
              <li>
                <strong>Use a different dictionary</strong> — dismisses the auto-detection and opens the manual selection flow.
              </li>
            </ul>
            <p>
              <strong>Manual selection flow:</strong>
            </p>
            <ul className={listClass}>
              <li>
                <strong>Upload separate dictionary file</strong> — upload a standalone XLSX or CSV codebook. For multi-sheet uploads, a sheet-picker appears.
              </li>
              <li>
                <strong>Select Dictionary Sheet dropdown</strong> — if your current XLSX has other sheets, they appear here alongside any uploaded file's sheets. Sheets marked "(Suggested)"
                are ones the app thinks look like a dictionary.
              </li>
              <li>
                A <strong>match count</strong> below the dropdown tells you how many of your data columns were found in the selected dictionary. A zero-match warning means the wrong file
                may be selected — it will not be applied.
              </li>
              <li>
                <strong>Dictionary preview table</strong> shows the first several rows of the selected sheet so you can confirm it looks right before importing.
              </li>
            </ul>
            <p>
              Click <strong>Import dictionary</strong> to apply it, or <strong>Skip — continue to variable types</strong> to proceed without one.
            </p>
            <p>
              <strong>Dictionary formats supported:</strong>
            </p>
            <TutorialFigure
              src={sampleDictionaryImage}
              alt="Sample EasyTableOne dictionary sheet mapping raw variables and coded values to readable labels"
              caption="Sample dictionary sheet: use variable names from the data sheet, then add labels, units, and coded-value labels where needed."
            />
            <ul className={listClass}>
              <li>
                <em>Wide format:</em> columns are <code className={codeClass}>variable</code>, <code className={codeClass}>label</code>, <code className={codeClass}>units</code> — one row
                per variable.
              </li>
              <li>
                <em>Long format:</em> columns are <code className={codeClass}>variable</code>, <code className={codeClass}>code</code>, <code className={codeClass}>label</code> — one row
                per coded value. Used when categories are stored as numbers (e.g. <code className={codeClass}>1=Male</code>, <code className={codeClass}>2=Female</code>).
              </li>
            </ul>
            <p>The sheet name "Dictionary" is recognized automatically; other sheet names are detected by content.</p>
            <h4 className={h4Class}>Common data problems</h4>
            <ul className={listClass}>
              <li>Multiple header rows: choose the real column-name row in Sheet & Header.</li>
              <li>Coded categories: use a Data Dictionary to turn codes into labels.</li>
              <li>Missing values: blanks are preferred; consistent sentinels such as NA are recognized.</li>
              <li>Units mixed in cells: split units into a dictionary or units column.</li>
              <li>One row per participant: required for Table 1 calculations.</li>
              <li>Duplicate IDs: flagged later in Data checks so you can review them.</li>
            </ul>
          </StepDetails>

          <StepDetails title="Step 2 — Variable types">
            <p>The app has inferred a type for each column. Review and correct them here. Every variable is one row in the table.</p>
            <h4 className={h4Class}>Table columns</h4>
            <ul className={listClass}>
              <li>
                <strong>Raw column</strong> — the original column name from your file. This never changes and stays as the internal key.
              </li>
              <li>
                <strong>Display label</strong> — the name that appears in the published table. Edit it to be reader-friendly (e.g. "Gestational age, weeks" instead of{" "}
                <code className={codeClass}>ga_wk</code>). Leave blank to use the raw column name.
              </li>
              <li>
                <strong>Units</strong> — an optional annotation shown in the table (e.g. <code className={codeClass}>mg/dL</code>, <code className={codeClass}>years</code>). Does not
                affect calculations.
              </li>
              <li>
                <strong>Type</strong> — what statistical treatment this variable gets. The choices and their consequences:
              </li>
            </ul>
            <ul className={listClass}>
              <li>
                <strong>Numeric</strong> — continuous measurements (age, weight, lab values). Reported as mean ± SD or median [IQR] depending on whether normality is met.
              </li>
              <li>
                <strong>Yes/No category (binary)</strong> — exactly two levels (yes/no, male/female). Reported as n (%).
              </li>
              <li>
                <strong>Category (no order)</strong> — three or more nominal levels (blood type, race, country). Reported as n (%).
              </li>
              <li>
                <strong>Ordered category (ordinal)</strong> — categories with a meaningful clinical rank (NYHA class, pain scale). Reported in the order you set.
              </li>
              <li>
                <strong>Identifier</strong> — patient or record IDs. Automatically excluded from Table 1.
              </li>
              <li>
                <strong>Unsupported</strong> — free text, mixed formats, or other non-analyzable columns. Automatically excluded.
              </li>
              <li>
                <strong>Needs review (Ambiguous Numeric)</strong> — the app could not determine whether the column is numeric or categorically encoded. You must resolve these before you
                can proceed.
              </li>
            </ul>
            <h4 className={h4Class}>Bulk actions</h4>
            <ul className={listClass}>
              <li>
                <strong>Set all to Binary / Numeric / Category</strong> — applies that type to every column currently flagged as Ambiguous Numeric. Useful when many columns have the same
                encoding issue. A confirmation prompt appears before the change is applied.
              </li>
              <li>
                <strong>Revert Bulk Action</strong> (amber button, appears after a bulk change) — undoes the last bulk assignment and restores the previous types.
              </li>
              <li>
                <strong>Reset to Default</strong> (red button) — reverts all your manual type edits in this step back to the app's original inferred types.
              </li>
            </ul>
            <h4 className={h4Class}>Decision explainers</h4>
            <p>Four blue expandable panels ("Why these inferred variable types?", "Why these reference levels?", "Why confirm ordinal order?", "Why exclude these variables?") explain the app's reasoning. Click to expand.</p>
            <p>
              <strong>Column resize:</strong> drag the right edge of any column header to widen or narrow it.
            </p>
            <p>
              Click <strong>Proceed</strong> when all Ambiguous Numeric columns are resolved. The button is disabled until then.
            </p>
          </StepDetails>

          <StepDetails title="Step 3 — Data checks">
            <p>The app checks your dataset for quality issues. Three tiers:</p>
            <ul className={listClass}>
              <li>
                <strong>Blocking</strong> (red) — must be resolved before you can proceed. Examples: a column where every value is identical; a dictionary compliance violation.
              </li>
              <li>
                <strong>Review</strong> (amber) — significant enough that you must explicitly acknowledge the issue. Examples: very small group sizes; high missingness (≥ 20%) in key variables.
              </li>
              <li>
                <strong>Advisory</strong> (blue/gray) — informational notices. They are logged but do not block you.
              </li>
            </ul>
            <h4 className={h4Class}>Data Quality Gate Panel</h4>
            <p>For each finding, read the title and description. Then:</p>
            <ul className={listClass}>
              <li>
                <strong>Advisory:</strong> click <strong>Dismiss</strong> to record that you've seen it.
              </li>
              <li>
                <strong>Review:</strong> tick the "I acknowledge this issue" checkbox after reading it.
              </li>
              <li>
                <strong>Blocking:</strong> follow the remedy text to fix it. The Proceed button stays disabled until blocking issues are resolved.
              </li>
            </ul>
            <p>
              The <strong>"I acknowledge these issues and want to proceed"</strong> amber button (appears when all review items are checked but Proceed isn't yet clicked) bulk-acknowledges
              remaining review findings at once.
            </p>
            <h4 className={h4Class}>Polish Advisor</h4>
            <p>Suggests cosmetic improvements, such as variables that would benefit from a display label. Each suggestion can be dismissed individually. These do not affect calculations.</p>
            <h4 className={h4Class}>EDA panel</h4>
            <p>
              Click <strong>Run EDA</strong> to generate missingness summaries, histograms, and inter-variable correlation heatmaps. Entirely optional for a basic Table 1, but useful for
              understanding the data before finalizing. Results can be exported in Step 7.
            </p>
            <h4 className={h4Class}>QA/QC Details (collapsible)</h4>
            <p>Displays per-column statistics: missing value count and percentage, cardinality (number of distinct values), outliers detected by the IQR method, and any column-level flags.</p>
            <h4 className={h4Class}>Dictionary compliance violations</h4>
            <p>For each affected column, choose:</p>
            <ul className={listClass}>
              <li>
                <strong>Treat as missing for this column</strong> — marks the undeclared values as blank in Table 1 calculations.
              </li>
              <li>
                <strong>Add as new level(s)</strong> — promotes the undeclared values to proper dictionary levels. Enter a display label for each value in the text fields before clicking.
              </li>
              <li>
                <strong>Cancel & Re-upload Data</strong> — sends you back to Step 1 to fix the source file or dictionary.
              </li>
            </ul>
            <p>The Proceed button stays disabled until every violation is resolved.</p>
            <h4 className={h4Class}>Outlier handling</h4>
            <ul className={listClass}>
              <li>
                <strong>Keep</strong> — leave the value as-is in all calculations.
              </li>
              <li>
                <strong>Exclude</strong> — omit this row's value from Table 1 calculations. The raw data row is not deleted.
              </li>
              <li>
                <strong>Winsorize</strong> — cap the value at the 1st / 99th percentile boundary instead of removing it.
              </li>
            </ul>
            <h4 className={h4Class}>Proceed button states</h4>
            <ul className={listClass}>
              <li>Grayed out with red text: blocking issues must be resolved first.</li>
              <li>
                Amber <strong>"I acknowledge these issues and want to proceed"</strong>: click to acknowledge all review findings at once.
              </li>
              <li>
                Blue <strong>Proceed</strong>: all issues are resolved or acknowledged. Click to move to Analysis Plan.
              </li>
            </ul>
            <p>Table 1 summarizes values that are actually recorded — it does not fill in missing values. If you want complete-case or multiple-imputation analysis, enable Modeling (Step 6).</p>
          </StepDetails>

          <StepDetails title="Step 4 — Analysis plan">
            <p>Set up what the table compares and which variables appear in it.</p>
            <h4 className={h4Class}>Grouping variable</h4>
            <p>
              The column that defines your comparison groups (e.g. Treatment vs. Control, Case vs. Control). Only binary and categorical variables appear in this dropdown. When you pick one,
              it is automatically removed from the variable list below (since you can't compare groups using the variable that defines the groups).
            </p>
            <p>The <strong>Table Column Order Preview</strong> (blue box below the dropdown) shows the groups and their sample sizes in the current sort order.</p>
            <h4 className={h4Class}>Sort table columns by</h4>
            <ul className={listClass}>
              <li>
                <strong>Default</strong> — dictionary order if available; otherwise value order.
              </li>
              <li>
                <strong>Frequency (desc)</strong> — most-common group appears first.
              </li>
              <li>
                <strong>Value (asc)</strong> — ascending numeric or alphabetical order.
              </li>
              <li>
                <strong>Custom</strong> — type one group label per line in the text area to set an exact order. Group labels must match exactly what is in the data (case-sensitive).
              </li>
            </ul>
            <h4 className={h4Class}>Choose Variables</h4>
            <ul className={listClass}>
              <li>Tick or untick each variable to include or exclude it from Table 1.</li>
              <li>
                <strong>Select all</strong> / <strong>Clear all</strong> — bulk include or exclude all eligible variables.
              </li>
            </ul>
            <h4 className={h4Class}>Table Rows Order</h4>
            <ul className={listClass}>
              <li>Shows the current included variables in the order they will appear as rows in Table 1.</li>
              <li>
                <strong>Drag</strong> a row to reorder it.
              </li>
              <li>
                <strong>⤴</strong> (move to top), <strong>↑</strong> (move up), <strong>↓</strong> (move down) buttons at the right of each row.
              </li>
            </ul>
            <h4 className={h4Class}>Displayed level (binary variables)</h4>
            <p>
              A small dropdown next to each binary variable in the row-order panel. Chooses which of the two levels is summarized as n (%) in the table. For example, for Smoker (Yes/No),
              choosing "Yes" reports the count and percentage of smokers; choosing "No" reports non-smokers. The default is automatically set to the less-frequent level (usually the event
              of interest). Click <strong>Reset</strong> next to the dropdown to revert to the default.
            </p>
            <h4 className={h4Class}>Show SMD and P-value</h4>
            <p>
              <strong>Show SMD</strong> checkbox. {SMD_WHEN_TO_USE_HEADLINE}
            </p>
            <p className="font-semibold mt-2">Use SMD when:</p>
            <ul className={listClass}>
              {SMD_USE_WHEN.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
            <p className="font-semibold mt-2">Usually not needed when:</p>
            <ul className={listClass}>
              {SMD_USUALLY_NOT_NEEDED.map((item, idx) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-gray-500 italic">
              {SMD_CAVEAT}
            </p>
            <p>
              <strong>Show P-value</strong> checkbox — the P-value from the appropriate statistical test for each row. On by default. Some journals discourage P-values in Table 1 for
              randomized trials (because they test the null hypothesis of equal distributions, not the treatment effect).
            </p>
            <h4 className={h4Class}>Multiple Testing Correction</h4>
            <ul className={listClass}>
              <li>
                <strong>No correction</strong> — report raw P-values. Acceptable for a descriptive Table 1.
              </li>
              <li>
                <strong>Bonferroni</strong> — divides the threshold by the number of tests. Very conservative; best for confirmatory analyses with few hypotheses.
              </li>
              <li>
                <strong>Holm</strong> — step-down method, less conservative than Bonferroni while still controlling the familywise error rate.
              </li>
              <li>
                <strong>Benjamini–Hochberg</strong> — controls false discovery rate rather than familywise error. Better suited for exploratory analyses with many variables.
              </li>
            </ul>
            <p>An advisory appears if the selected correction materially changes the significance of your results.</p>
            <p>
              Click <strong>Run Statistics</strong> to compute Table 1. The button is disabled if: no grouping variable is chosen; no variables are selected; or blocking plan findings are
              present. Computation runs locally in your browser — large datasets can take several seconds. Click <strong>Back</strong> (or the sidebar) while computing to cancel.
            </p>
          </StepDetails>

          <StepDetails title="Step 5 — Statistical review">
            <p>The computed Table 1 is shown here with per-variable test explanations.</p>
            <h4 className={h4Class}>Test decision badges</h4>
            <ul className={listClass}>
              <li>
                <em>Continuous variables:</em> Welch's t-test (two groups, normal) / ANOVA (three+ groups, normal) / Mann-Whitney U (two groups, non-normal) / Kruskal-Wallis (three+ groups,
                non-normal). Normality is assessed by Shapiro-Wilk for small samples; by skewness and kurtosis for large samples.
              </li>
              <li>
                <em>Categorical/binary variables:</em> Chi-square (expected cell counts ≥ 5) / Fisher's exact (some expected cell counts &lt; 5).
              </li>
            </ul>
            <p>The rationale text below each badge explains the specific reason the test was chosen for that variable.</p>
            <h4 className={h4Class}>Multiple testing correction advisory</h4>
            <p>If you selected a correction in Step 4 and it changes significance conclusions, a banner at the top of the page flags this.</p>
            <h4 className={h4Class}>Diagnostics panel</h4>
            <p>Shows per-variable test statistics (test statistic, degrees of freedom, exact P-value). Useful if you need to report these in your methods section.</p>
            <h4 className={h4Class}>Explanation depth toggle</h4>
            <p>
              <strong>Explanation depth toggle</strong> (top bar, "Brief" / "Detailed") — controls how much statistical rationale is shown throughout the app. "Detailed" adds full
              plain-language explanations to each decision.
            </p>
            <h4 className={h4Class}>Enable modeling</h4>
            <p>
              To run logistic regression or machine learning classifiers, click <strong>"6. Modeling (optional)"</strong> in the left sidebar, which shows "Enable modeling" in dashed style
              until you click it. You can also do this after reviewing the table.
            </p>
          </StepDetails>

          <StepDetails title="Step 6 — Modeling (optional)">
            <p>
              Enables logistic regression and machine learning on your dataset. Click <strong>"6. Modeling (optional)"</strong> in the sidebar to enter this step. It is entirely optional
              and does not affect Table 1.
            </p>
            <h4 className={h4Class}>Logistic Regression tab</h4>
            <p>
              <strong>Outcome variable</strong> — select the binary variable you want to predict (e.g. disease status, treatment response).
            </p>
            <p>
              <strong>Predictor variables</strong> — choose which variables to include as predictors. Any variable type works.
            </p>
            <p>
              <strong>Method:</strong>
            </p>
            <ul className={listClass}>
              <li>
                <strong>Plain</strong> — standard logistic regression. Best for adequately sized samples.
              </li>
              <li>
                <strong>Firth</strong> — penalized logistic regression. Recommended when you have small samples, rare outcomes, or complete separation (a predictor perfectly predicts the
                outcome). The app may suggest Firth automatically.
              </li>
              <li>
                <strong>LASSO</strong> — L1 regularization; performs automatic variable selection.
              </li>
              <li>
                <strong>Ridge</strong> — L2 regularization; shrinks coefficients, keeps all variables.
              </li>
              <li>
                <strong>Elastic-net</strong> — mix of LASSO and Ridge.
              </li>
            </ul>
            <p>
              <strong>Imputation</strong> — how to handle missing predictor values:
            </p>
            <ul className={listClass}>
              <li>
                <strong>No imputation (complete cases only)</strong> — only rows where all selected predictors are observed are used. Simplest, but loses data.
              </li>
              <li>
                <strong>Mean / Median / Mode (single fill)</strong> — fills each gap with the column's mean, median, or most-common value. Fast but underestimates uncertainty because it
                treats filled values as known.
              </li>
              <li>
                <strong>Constant</strong> — fills with a fixed value you specify. Enter the value in the text field that appears.
              </li>
              <li>
                <strong>kNN (k-nearest neighbors)</strong> — fills gaps using the average of the k most similar observed rows. Accurate, slower than simple fill.
              </li>
              <li>
                <strong>Random Forest</strong> — fills gaps using a random forest model. Accurate; not recommended for very large datasets (slow). A warning appears for datasets over the
                large-N threshold.
              </li>
              <li>
                <strong>MICE (multiple imputation by chained equations)</strong> — runs multiple complete datasets, fits the model on each, and pools results using Rubin's Rules. The
                statistically principled standard for missing data. Slowest option. The number of imputed datasets (m) can be set in the setup field.
              </li>
            </ul>
            <p>
              <strong>Outcome-aware imputation</strong> (kNN / RF / MICE only) — when checked, includes the outcome variable as a helper feature when imputing predictor gaps. This improves
              imputation accuracy because the outcome carries information about the predictors. Uncheck if you are concerned about circular leakage (the app notes the tradeoff when you
              uncheck it). Not available for simple-fill methods because they use column-level statistics, not row-level similarity.
            </p>
            <p>
              <strong>Bootstrap CIs</strong> checkbox — computes 95% confidence intervals via bootstrap resampling instead of asymptotic (Wald) intervals. More accurate for small samples or
              non-standard distributions, but substantially slower.
            </p>
            <p>
              <strong>Fast validation</strong> checkbox — when checked, runs 200 resamples and uses single imputation to keep the app responsive. When unchecked (Thorough validation), runs 1000 resamples and replicates the full imputation loop per resample to propagate all uncertainty (takes substantially longer).
            </p>
            <p>
              <strong>Validation CI method</strong> dropdown — controls how internal-validation performance confidence intervals (AUC, calibration, Brier score) are computed:
            </p>
            <ul className={listClass}>
              <li>
                <strong>Out-of-bag (OOB):</strong> uses held-out samples from each resample, recentering the width around corrected estimates. Unbiased and recommended.
              </li>
              <li>
                <strong>Nested bootstrap:</strong> runs a double bootstrap loop (outer training, inner optimism) to propagate all uncertainty. Extremely slow.
              </li>
              <li>
                <strong>Full-sample:</strong> uses optimism resamples on the full training dataset. Legacy method, not recommended because it understates uncertainty.
              </li>
            </ul>
            <p>
              Click <strong>Run logistic regression</strong>. A runtime estimate is shown before running.
            </p>
            <p>Results show: odds ratios, 95% CIs, P-values, and AIC. For MICE, Rubin-pooled estimates are reported.</p>
            <h4 className={h4Class}>Machine Learning tab</h4>
            <p>
              Runs a cross-validated benchmark of classifiers (logistic, random forest, gradient boosting, and others). Outcome and predictor selection work the same as above. Imputation is
              applied fold-locally (train set only) to prevent data leakage.
            </p>
            <p>Results show: AUC, accuracy, calibration plots, and feature importance rankings for each classifier.</p>
          </StepDetails>

          <StepDetails title="Step 7 — Format and export">
            <h4 className={h4Class}>Journal style</h4>
            <p>
              <strong>Journal selector</strong> — choose a target journal to apply its specific formatting rules (decimal places, P-value formatting, column header styles, footnote style).
              "EasyTableOne Default" produces a generic publication-ready format.
            </p>
            <p>
              <strong>Journal override panel</strong> — fine-tune individual formatting choices without switching journals (e.g. override P-value decimal places, SMD display). Each override is
              labeled so you can track what you changed.
            </p>
            <h4 className={h4Class}>Live preview</h4>
            <p>A formatted HTML preview of Table 1 is shown before you download anything. Use it to check alignment, labels, and overall appearance.</p>
            <h4 className={h4Class}>Export buttons</h4>
            <p>Each button triggers an immediate download in your browser:</p>
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold">Export</th>
                  <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left font-semibold">What it contains</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Download Table (DOCX)", "Word document with the formatted Table 1. Most common journal submission format."],
                  ["Download Table (XLSX)", "Excel spreadsheet version of the table."],
                  ["Download Table (CSV)", "Plain comma-separated values."],
                  ["Download Table (LaTeX)", "LaTeX tabular code for direct inclusion in a manuscript."],
                  ["Download Table (PDF)", "Direct PDF output."],
                  ["Download Data Quality Report (DOCX / PDF)", "Documents all data-check findings, your acknowledgements, outlier decisions, and compliance resolutions — useful for a methods audit trail."],
                  ["Download EDA Report", "Exploratory data analysis outputs (if you ran EDA in Step 3): missingness summaries, histograms, correlation heatmaps."],
                  ["Download Modeling Report (DOCX)", "Logistic regression / ML results with ORs, CIs, forest plots, and calibration curves (if Modeling was run in Step 6)."],
                  ["Download Methods Summary (DOCX)", "A plain-language methods paragraph describing the statistical approach used — ready to paste into your manuscript."],
                  ["Download Education Report (DOCX)", "Full statistical decision rationale for each variable, written in plain language. Useful for learning or transparent reporting."],
                  ["Download Unified Report (HTML)", "A single self-contained HTML file with all sections: Table 1, EDA, modeling, data quality, and methods."],
                  ["Download ZIP (all files)", "All of the above in one archive."],
                  ["Reproducibility JSON", "Machine-readable record of every choice made in the analysis, with timestamps. Includes a SHA-256 hash of your input file if the hash setting is enabled. Supports independent reproduction of your results."],
                  ["Analysis History", "A timestamped audit log of all user actions (type changes, outlier decisions, acknowledgements, etc.)."],
                  ["Diagnostics CSV", "Per-variable test statistics in a flat table (test name, statistic, df, P-value)."],
                ].map(([name, description]) => (
                  <tr key={name}>
                    <td className="border border-gray-200 px-3 py-2">
                      <strong>{name}</strong>
                    </td>
                    <td className="border border-gray-200 px-3 py-2">{description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </StepDetails>

          <StepDetails title="Global controls">
            <h4 className={h4Class}>Sidebar navigation</h4>
            <p>
              Shows all 7 steps. The active step is highlighted with <code className={codeClass}>&gt;</code>. Completed steps show <code className={codeClass}>*</code> and are clickable — you
              can return to any completed step at any time to make changes and re-run from there. Future steps are grayed out and show a tooltip explaining what prerequisite is needed.
            </p>
            <p>
              <strong>"6. Modeling (optional)"</strong> appears with a dashed border and "Enable modeling" sub-label after Statistical Review is complete. Clicking it enables the modeling
              stage and navigates to it.
            </p>
            <h4 className={h4Class}>Top bar</h4>
            <ul className={listClass}>
              <li>
                <strong>Tutorial</strong> button — opens this tutorial at any time from anywhere in the app.
              </li>
              <li>
                <strong>About</strong> button — opens the About page with app description, method references, and version information.
              </li>
              <li>
                <strong>Save</strong> button — downloads a JSON snapshot of your current analysis state for local recordkeeping. <em>Session restore is on the roadmap but not yet implemented
                — this file is for archiving, not re-loading.</em>
              </li>
              <li>
                <strong>Explanation depth toggle</strong> (Brief / Detailed) — switches between concise summaries and full statistical rationale throughout the app.
              </li>
            </ul>
            <p>On mobile, a hamburger menu (☰) at the top-left opens a slide-out drawer with the same navigation.</p>
            <div className="sr-only">
              <h4>Glossary</h4>
              <dl>
                {Object.entries(GLOSSARY).map(([term, definition]) => (
                  <div key={term}>
                    <dt>{term}</dt>
                    <dd>{definition}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <h4 className={h4Class}>Settings</h4>
            <ul className={listClass}>
              <li>
                <strong>Include input data hash in reproducibility JSON</strong> — when on, a SHA-256 fingerprint of your input file is embedded in the reproducibility JSON. Off by default
                because the hash is a data fingerprint. Turn it on only if you need to verify that the input file is identical across re-runs.
              </li>
            </ul>
            {onOpenSettings && (
              <button
                type="button"
                onClick={() => {
                  close();
                  onOpenSettings();
                }}
                className="rounded border border-sky-200 bg-white px-3 py-1.5 text-sm font-medium text-sky-900 hover:bg-sky-50"
              >
                Open Settings
              </button>
            )}
            <h4 className={h4Class}>Analysis engine status</h4>
            <p>Shown below the "EasyTableOne" title in the sidebar (or drawer):</p>
            <ul className={listClass}>
              <li>
                <strong>Green dot — "Analysis engine ready"</strong> — the statistical engine (Pyodide) has finished loading and all computations can proceed.
              </li>
              <li>
                <strong>Yellow dot — "Starting analysis engine..."</strong> — loading, usually takes under 5 seconds on first open. Steps that require computation (Run Statistics, Run EDA,
                Run logistic regression) will wait for this automatically.
              </li>
            </ul>
          </StepDetails>
        </div>
      </div>
    </div>
  );
}
