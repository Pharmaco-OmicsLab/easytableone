# Golden Cross-Validation Harness

This suite validates EasyTableOne Table-1 outputs against the vendored Python `tableone` package. Descriptive statistics and most inferential values use numeric tolerance `1e-4`; two-group non-normal continuous P values use the documented tolerance `1e-3` because EasyTableOne uses Mann-Whitney U while `tableone` uses Kruskal-Wallis.

Run it with:

```bash
pnpm test:golden
```

In this repository, prefer the direct binary while iterating:

```bash
node_modules/.bin/vitest run tests/golden/
```

## Artifacts

By default, `tests/golden/cross_validation.test.ts` runs every comparison and assertion without writing files. This keeps full-suite verification from modifying committed validation deliverables.

When preparing the manuscript validation package, generate the report deliberately with:

```bash
pnpm validation:report
```

With `ETO_WRITE_VALIDATION_REPORT=1`, the harness writes transient machine-readable outputs:

- `_materials/validation/tableone_comparison.csv`
- `_materials/validation/tableone_comparison_summary.json`

`_materials/validation/` is gitignored. The committed citable deliverable is:

- `_materials/validation_report/EasyTableOne_tableone_validation.docx`

The CSV is one row per compared statistic with:

`dataset`, `datasetSource`, `nRows`, `variable`, `variableType`, `groupLevel`, `statistic`, `easytableone`, `tableone`, `absoluteDifference`, `tolerance`, `agrees`, `note`.

The summary JSON records the runtime-detected `tableone` version when available, Pyodide version, tolerance, per-dataset counts, total compared statistics, total agreement count, maximum absolute difference, and skipped tiers.

## Dataset Tiers

Tier A, synthetic edge cases, runs in CI. It covers deterministic generated rows with a constant column, an all-missing column, a single-row group, and an n = 2 versus n = 2 contrast.

Tier B, Heart Failure Clinical Records, runs in CI from `public/samples/heart_failure_clinical_records_dataset.csv`. It is grouped by `DEATH_EVENT`, excludes `time`, treats six continuous variables as non-normal, and treats five binary variables as categorical. Source: UCI Machine Learning Repository, https://doi.org/10.24432/C5Z89R, CC BY 4.0.

Tier C, Diabetes 130-US Hospitals, runs only when the cleaned source file is present at:

`public/samples/diabetes130_clean.csv`

Regenerate it with `public/samples/prepare_diabetes130.py` from UCI dataset 296:

https://archive.ics.uci.edu/dataset/296/diabetes+130-us+hospitals+for+years+1999-2008

When absent, the tier is skipped with an explicit message in `tableone_comparison_summary.json`. The intended tier is a deterministic simple-random subsample with seed `20260229`, n = 20,000, grouped by `readmitted` (`NO`, `<30`, `>30`).

## Provenance Exclusion

`_materials/samples/CKD_NHANES_2021_2023.csv` is a repackaged NHANES extract of unverified provenance (it uses a `participant_id` column rather than NHANES's `SEQN`). It is retained as an internal test fixture only. It must not be added to the citable tier of this harness, and must not be cited in any manuscript or supplement. If a real NHANES tier is wanted, rebuild it from the CDC NCHS source files.

MIMIC-IV is not a citable tier here because it requires credentialed PhysioNet access, so reviewers cannot reproduce it from public files alone.
