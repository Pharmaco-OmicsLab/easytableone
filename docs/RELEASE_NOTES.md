# EasyTableOne v3.19.2

This is the tagged release cited in the SoftwareX revision.

- Redesigned interface. A left-hand step rail guides the seven steps, and the Format and export step shows journal style, live preview, overrides and downloads together. The journal override panel now adapts to its width, so its settings stay readable on smaller screens.
- Download All collects every export (manuscript table in DOCX, XLSX, CSV and LaTeX, reproducibility record, analysis script, data-quality and methods reports, figures) in one ZIP file with a manifest.
- Data checks point out categories with fewer than 10 observations in a table variable (added in v3.19.1).
- Tests at this release. 1,097 unit, integration and Pyodide tests in 128 files, plus end-to-end tests of the production build in Chromium 147, Firefox 148 and WebKit 26.4 (Playwright 1.59.1), offline in Chromium and Firefox. The interactive check used Google Chrome 155 on Windows 11.
- Validation re-run on this release. Python `tableone` 814 of 814 comparable statistics agreed (53 not comparable, maximum absolute difference 0.0005). R `tableone` 1,759 of 1,759 agreed (72 not comparable).

### Known issue

- The audit log in the reproducibility record is not cleared when a second dataset is imported in the same browser tab, so entries from the earlier dataset (for example its dictionary import) are carried into the later record. Statistics are not affected. Reload the page before analysing another dataset. A fix is planned for v3.19.3.

## Previous release: v3.19.1

- New advisory in Data checks: categories with fewer than 10 observations in a table variable are pointed out.

## Previous release: v3.19.0

This release prepares EasyTableOne for the SoftwareX revision.

## Privacy and offline use

- Exported JSON records no longer contain per-observation values. Reproducibility and diagnostics exports retain aggregate results while omitting plot data that could reveal individual records.
- The EDA report works without loading chart libraries from a third-party CDN, and the production build excludes unused Pyodide console pages.
- Content Security Policy and browser checks cover data locality and offline behavior.

## Reliability and documentation

- Uploads are limited to 100,000 data rows because analysis runs in the browser's memory.
- CI checks the public mirror, runs the unit, scientific-Python, and browser test suites, and records a generated test inventory.
- Added benchmark tooling for runtime and memory measurements on representative datasets.
- Journal formatting rules now include source provenance and review dates. Developer documentation describes the architecture, exports, validation, and journal rules.
- Updated JAMA and Lancet formatting to clarify missing data, percentage precision, P-value precision, and table headings.

## Statistical validation

- EasyTableOne was independently cross-validated against R `tableone` using five clinical and synthetic tiers. Of 1,831 records, 1,759 agreed, 0 disagreed, and 72 were classified as not comparable under documented rules. The validation files are in [`validation/r/`](../validation/r/).
- The Python `tableone` golden validation remains at 814 comparable records, 53 not-comparable records, and a maximum absolute difference of 0.0005.

## Citation

The tagged release is [EasyTableOne v3.19.2](https://github.com/Pharmaco-OmicsLab/EasyTableOne/releases/tag/v3.19.2).
