# Independent R `tableone` cross-validation

This Phase 51 R4 harness compares EasyTableOne with R's `tableone::CreateTableOne` on the synthetic edge-case fixture, Heart Failure, and the fixed 20,000-row Diabetes subsample. Bp and Cp repeat Heart Failure and the same Diabetes subsample with user-selected Welch, 2×2 Fisher, and ANOVA tests. It is an independent ecosystem check; no app code is changed.

Prerequisites: Node dependencies installed, R 4.6.0, and R packages `tableone` 0.13.2 and `jsonlite`. Install the R packages with `install.packages(c("tableone","jsonlite"))`. Set `RSCRIPT` to the full `Rscript.exe` path if it is not on `PATH`. `packageVersion("tableone")` and `R.version.string` are printed and saved by the R stage. Export runs the repository's Pyodide engine and writes transient inputs under `validation/r/work/`.

Run `pnpm validation:r`. It exports all five tiers (A, B, C, Bp, Cp), executes the no-correction chi-square self-test, computes R outputs, and compares them. Bp and Cp use user-selected test overrides to exercise Welch t, 2x2 Fisher, and ANOVA. The exporter can be run alone with `ETO_EXPORT_FOR_R=1 node scripts/crossval/export-eto-results.mjs`.

## Harmonization

| Aspect | EasyTableOne | R setting |
|---|---|---|
| Normal continuous, 2 groups | Welch t (`equal_var=FALSE`) | `argsNormal=list(var.equal=FALSE)` |
| Normal continuous, ≥3 groups | Ordinary one-way ANOVA | `argsNormal=list(var.equal=TRUE)` |
| Non-normal, 2 groups | SciPy `mannwhitneyu`, `use_continuity=TRUE`, requested `method="auto"`; actual auto method is exact if either group n≤8 and no pooled ties, otherwise asymptotic | `wilcox.test(correct=TRUE, exact=...)`, matching actual SciPy method per variable |
| Non-normal, ≥3 groups | Kruskal–Wallis | `kruskal.test` |
| Categorical chi-square | No Yates correction | `argsApprox=list(correct=FALSE)` |
| Fisher 2×2 | Exact | `fisher.test` default |
| Fisher r×c | Seeded Monte Carlo, 9,999 resamples | `argsExact=list(simulate.p.value=TRUE,B=9999)`, seed 20260229 |
| Exact variables | Minimum expected count <5 | Exported variable list passed as `exact` |
| Quantiles | NumPy default linear interpolation | `quantile(type=7)`, the same linear interpolation definition |
| SMD | Absolute; max pairwise for multi-group | `ExtractSmd`; compare absolute values for 2-group tiers. Multi-group is D2 unless definitions coincide. |

Summary, SMD, and deterministic P-value tolerance is fixed at **1e-4**. Monte Carlo P values use **3·sqrt(p(1−p)/9999) + 1e-4** and count as compared under category H. Never widen tolerances. Categorize disagreements with a reason or report genuine discrepancies.

Outputs: tracked `r_tableone_comparison.csv`, `r_tableone_summary.json`, `r_tableone_summary.md` (Supplementary Tables S3b/S4), and `r_versions.txt`. The completed author run used R 4.6.0 / tableone 0.13.2 and recorded 1,831 records (1,759 agree, 0 disagree, 72 not comparable); exact and Monte Carlo maximum absolute differences are reported separately in the summary. Inspect every `agrees=false` row.

## Supplementary Table S4 category definitions

| Code | Definition | How to use in R4 |
|---|---|---|
| A | Same test, different label: both tools ran the same test but print it under a different name. | Labels are never compared, only numbers. So no record should get A. |
| B | Different test family because of sparse cells: expected count < 5, so EasyTableOne ran Fisher where the other tool ran chi-square. | Must be 0. R is told which variables use Fisher (`exact = c(...)`). Any B record is a setup bug. The comparator fails and names the variable. |
| C | Mann–Whitney U (with continuity correction) vs Kruskal–Wallis. | Must be 0. R runs `wilcox.test` for 2 groups with the same continuity and exact settings. Any C record is a setup bug. The comparator fails and names the variable. |
| D | Standardised difference undefined because a group has n < 2. EasyTableOne drops it; the other tool may return a finite value. | Same rule as S4. |
| D2 | Different multi-group SMD definition (R reports the mean of pairwise SMDs). | New for R4, as the round doc says. |
| E | A statistic that one or both tools do not output. | Same rule as S4. |
| F | A test result that one or both tools do not output. | Same rule as S4. |
| G | EasyTableOne declined to test (a group has no valid observations) but the other tool returned a result. | Same rule as S4. |
| H | Monte Carlo P value, compared under the Monte Carlo tolerance. | New for R4. Counts as compared, not as not comparable. |
