# Manual browser test checklist

Use this script on **Safari on macOS** and **Microsoft Edge on Windows** before claiming those browsers are supported. Playwright WebKit is an engine test; it is not a test of the Safari application. Record the browser version, OS version, date, and tester for each run. Use the production build or published site and note its URL or commit in Notes.

1. Open EasyTableOne in a fresh browser session. Wait for **Analysis engine ready**, then choose **Get started**.
2. Upload `public/samples/heart_failure_clinical_records_dataset.csv`. Confirm the study settings and header row. Upload `public/samples/heart_failure_dictionary.csv` as the separate dictionary, then resolve any ambiguous column types and continue through schema review.
3. In Data checks, generate EDA and confirm the correlation chart appears. Continue to the plan, set grouping to `DEATH_EVENT`, choose Holm multiple-testing correction, run statistics, and reach **Format & Export**. Check the table and diagnostic plots for visible errors.
4. Start a second fresh browser session. Once **Analysis engine ready** appears, disconnect the device from the network. Repeat the import, EDA, and statistics workflow from steps 2–3, then run modeling from step 5 and download exports from step 6. Confirm all analysis and exports finish offline; record any failed operation or browser console CSP violation.
5. Open **Modeling (optional)**. Set outcome to `DEATH_EVENT`; select `age`, `ejection_fraction`, `serum_creatinine`, `serum_sodium`, and `sex` as predictors. Run ridge logistic regression with Fast validation and return to Format & Export. Record whether the model completed and its report is available.
6. Select the NEJM journal ruleset. Download every available export: results DOCX/CSV/XLSX/LaTeX, unified HTML and source ZIP, reproducibility JSON, both diagnostics files, analysis history Python, data-quality Markdown and DOCX, EDA HTML and summary, results and methods summaries, education files, modeling report and data ZIP, and figures ZIP if offered. Confirm downloads finish and files are nonempty.
7. Open the results DOCX in Microsoft Word, XLSX in Microsoft Excel, and LaTeX file in a LaTeX editor or compiler. Confirm the table opens, headings and columns are legible, and no format or repair warning appears. Record the application versions in Notes.

Mark each outcome **Pass**, **Fail**, or **Not run**. Put the first failing step and enough detail to reproduce it in Notes. Attach sample output or a browser log to the release record if a failure occurs.

| Browser | Version | OS | Date | Tester | Full workflow | Modeling | DOCX/XLSX/LaTeX opens correctly in Word/Excel | Offline after engine ready | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Safari (macOS) | | | | | | | | | |
| Edge (Windows) | | | | | | | | | |
