# Author benchmark (EasyTableOne 3.19.0 release candidate)

Machine: Lenovo Slim laptop, AMD Ryzen 7 8845HS, 16 cores, 64 GB RAM, Windows 11 (win32 10.0.26200).
Browsers: Chromium 147.0.7727.15 and Firefox 148.0.2 (Playwright builds). Production build (`vite preview`), harness `tests/bench/benchmark.spec.ts`.
App code (`src/`) is identical across all runs below (unchanged since commit `b4aeb4c`).

## Consolidated results (median, min–max, n = completed measurements)

| Dataset | Rows × variables | Engine start (cold) | Baseline table, import → DOCX | Ridge model, fast validation | Ridge model, thorough validation | Peak WebAssembly memory |
|---|---|---|---|---|---|---|
| Heart Failure | 299 × 12 | 19.3 s (14.4–20.4), n = 10 | 1.1 s (0.9–1.8), n = 10 | 78 s (66–80), n = 6 | 529 s (512–545), n = 2 | 225 MB |
| Diabetes subsample | 20,000 × 19 | 19.3 s (13.3–20.4), n = 7 | 30 s (21–34), n = 7 | 634 s, n = 1 | did not finish within the 30 min harness limit, n = 1 | 389 MB |
| Diabetes, full | 69,973 × 19 | 14.3 s (13.3–14.3), n = 5 | 69 s (68–70), n = 5 | not measured | not measured | 796 MB |
| Synthetic (resampled) | 150,000 × 19 | — | Rejected by the 100,000-row upload limit | — | — | — |

Firefox 148 (same machine): engine start 51 s; Diabetes 20k table 145 s (144–147, n = 5); Diabetes 70k table 501 s (499–538, n = 3; one repetition exceeded the 20 min statistics limit). Firefox is 4–7× slower than Chromium for the statistics step on these datasets. Warm reload (cached assets) takes about as long as a cold load (14–21 s), so start-up is dominated by initializing the Python runtime, not by download (≈58 MB transferred on first load).

## Provenance of each file

- `2026-10-11_chromium_LenovoSlim_run1.json`: first full run. Heart Failure (all stages) and the Diabetes 20k/70k baseline-table stages are valid. Every Diabetes modeling stage failed because of a harness selector bug (`getByLabel('Event to model')` matched two elements), and every synthetic import failed because of a 5 s harness wait. These failures are harness defects, not app results.
- `2026-10-11_firefox_LenovoSlim.json`: Firefox run with the same harness. Baseline-table stages are valid; modeling failed for the same harness reason; Heart Failure rows are missing because a second worker overwrote the report (fixed).
- `2026-10-11_chromium_LenovoSlim.json`: later runs with the fixed harness (selector, size-aware waits, report merging, and the "Select all"/"Clear all" toggle). Contains Heart Failure ×5 (all stages), Diabetes 20k repetition 1 (table, fast model; thorough model timed out at 30 min), and Synthetic 150k repetition 1 (import timed out at 15 min). The Diabetes 20k repetition 2 row ("page closed") is a leftover from an interrupted run and is not a result.
- `2026-10-09_chromium_LenovoSlim.json`: environment smoke only.
- `2026-10-14_chromium_LenovoSlim.json`: environment smoke only (Heart Failure, one repetition, status ok), run after the Phase 52 redesign to confirm the harness still drives the new interface. Not used in the manuscript tables.
- `summary.md` is generated and shows only the latest file per browser; use this README for the consolidated numbers.

## Large-file outcome (D110)

The 150,000-row file imported in about 7 seconds, but running statistics continued for more than 10 minutes and then exhausted the browser tab's memory. EasyTableOne therefore rejects uploads above 100,000 data rows (D110); no automatic truncation or sampling is performed. The 69,973-row Diabetes demonstration remains below the limit.
