# Supplementary Table S3b — R tableone cross-validation

R version: R version 4.6.0 (2026-04-24 ucrt); tableone version: 0.13.2. Deterministic tolerance: 1e-4. Monte Carlo P tolerance: 3·sqrt(p(1−p)/9999) + 1e-4. Overall maximum absolute difference: exact values 3.2e-10; Monte Carlo P values 0.0036. Bp and Cp use explicit user-selected test overrides.

| Tier | Records | Agree | Disagree | Not comparable | Exact max abs diff | Monte Carlo P max abs diff | Test selection |
|---|---:|---:|---:|---:|---:|---:|---|
| A | 181 | 145 | 0 | 36 | 3.6e-14 | 0.0036 | Automatic test selection |
| B | 205 | 205 | 0 | 0 | 3.2e-10 | — | Automatic test selection |
| C | 620 | 602 | 0 | 18 | 7.5e-14 | 0.0036 | Automatic test selection |
| Bp | 205 | 205 | 0 | 0 | 3.2e-10 | — | User-selected test overrides |
| Cp | 620 | 602 | 0 | 18 | 5.0e-14 | 0.0036 | User-selected test overrides |

## Categories (Supplementary Table S4)

| Code | Definition | R4 use | Count |
|---|---|---|---:|
| A | Same test, different label: both tools ran the same test but print it under a different name. | Labels are never compared, only numbers. No record should get A. | 0 |
| B | Different test family because of sparse cells: expected count < 5, so EasyTableOne ran Fisher where the other tool ran chi-square. | Must be 0. R is told which variables use Fisher (exact = c(...)). Any B record is a setup bug. | 0 |
| C | Mann–Whitney U (with continuity correction) vs Kruskal–Wallis. | Must be 0. R runs wilcox.test for 2 groups with the same continuity and exact settings. Any C record is a setup bug. | 0 |
| D | Standardised difference undefined because a group has n < 2. EasyTableOne drops it; the other tool may return a finite value. | Same rule as S4. | 0 |
| D2 | Different multi-group SMD definition (R reports the mean of pairwise SMDs). | New for R4; mark not comparable unless the definitions coincide. | 40 |
| E | A statistic that one or both tools do not output. | Same rule as S4. | 29 |
| F | A test result that one or both tools do not output. | Same rule as S4. | 3 |
| G | EasyTableOne declined to test (a group has no valid observations) but the other tool returned a result. | Same rule as S4. | 0 |
| H | Monte Carlo P value, compared under the Monte Carlo tolerance. | New for R4. Counts as compared, not as not comparable. | 6 |

Any category B or C is a setup error and aborts comparison, naming the affected variable.
