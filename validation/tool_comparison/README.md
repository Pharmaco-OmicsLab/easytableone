# Hands-on tool comparison (Table 2 and Supplementary Table S8 of the SoftwareX paper)

Each tool in Table 2 was run on the same two input files, and every score records the behaviour observed. Scoring rules and the observation behind each score are in Supplementary Table S8 of the paper.

## Workbook scores and Table 2

The workbooks record the tester's provisional score for each observation. Table 2 and Supplementary Table S8c apply the scoring rules of Supplementary Table S8b to those observations, so a few scores differ from the workbooks: post-hoc (C5) is ✓ for compareGroups and the TernTables R package, because pairwise testing is available through a documented option (`show.p.mul = TRUE`, `post_hoc = TRUE`); reproducibility (C6) is (✓) for the programmatic tools, because the user's own script counts as runnable code; and multiple strata (C7) is ✓ for compareGroups after the 15 October retest, and ✕ for the TernTables R package and Python tableone, whose round-1 errors (recorded as ERROR) show that a second grouping variable is not accepted. The observations themselves are unchanged.

## Input files

| File | SHA-256 | What it is |
| --- | --- | --- |
| `hf_comparison.csv` | `6682deb2a0ba3d75e34e4276f70fb398acc4329a6cba782cc194864837f7b0f4` | Heart Failure Clinical Records (`public/samples/`, UCI, CC BY 4.0) plus `ef_group` (three ejection-fraction groups, for the post-hoc criterion) |
| `hf_guardrail_probe.csv` | `dc959a1d47aa1ea4a0831585a7b7ae04dded3d314ef79417aa604b68fd6e322b` | `hf_comparison.csv` plus two probe columns: `serum_sodium_35pct_missing` (105 of 299 values removed, seed 20260929) and `rare_category` (level C, n = 3). The probe columns carry no real information. |

Both files are rebuilt byte for byte by `python make_comparison_datasets.py` (standard library only), run from this folder.

## Round 1 — 3 October 2026 (`round1_2026-10-03/`)

All tools at their versions on that date, on macOS 26.6.2 (16 GB RAM), Google Chrome 153.0.8010.53, R 4.5.0 (RStudio 2025.05.0) and Python 3.13.3: TernTables web application 1.7.2.9004 and R package 1.7.2, compareGroups 4.10.4, gtsummary 2.6.1, R tableone 0.13.2, Python tableone 0.9.6.

- `tool_comparison_results.xlsx` — scores, observations, tool versions and test environment.
- `scripts/` — the R and Python code that was run (each reads the CSVs from the working directory).
- `screenshots/` — one or more per tool and criterion. Images are reduced to at most 1600 px wide.

The round-1 EasyTableOne rows (version 3.18.0) are superseded by the retest and their screenshots are not included.

## Retest — 15 October 2026 (`retest_2026-10-15/`)

Same tester and computer. Re-run: compareGroups multiple strata (C7), gtsummary post-hoc with a user function (C5), and every EasyTableOne criterion on the released v3.19.0 (deployed commit `b836577`, ruleset 1.7), including the effort count E1 (16 actions; the action-by-action list is in the `E1_actions` sheet).

- `tool_comparison_retest_results.xlsx` — Setup, Results and E1_actions sheets.
- `scripts/` — `compareGroups_C7_r2.R`, `gtsummary_C5_r2.R`.
- `screenshots/` — named `<tool>_<criterion>_r2.png`.

The authors re-checked the EasyTableOne guardrail (C4) and data-locality (C1) observations on v3.19.1 (16 October) and v3.19.2 (20 October); the small-category advisory recorded in Supplementary Table S8c first appears in v3.19.1. The statistics were identical across these versions.

## Counting rule for effort (E1)

One action per click (including every click inside the operating-system file dialog), selection, checkbox or typed entry, from the import step with no file chosen to the table with P values on screen; scrolling, waiting, reading and exporting are not counted. Programmatic tools are counted as non-blank, non-comment lines of code, excluding installation. The same rule was applied to every graphical interface.
