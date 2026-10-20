# Data Locality and Network Privacy Model

EasyTableOne enforces data locality: all computation happens in the user's browser, no data leaves the device during analysis, and exported results contain aggregate statistics only. This document describes the model, how it is tested, and what it does and does not guarantee.

---

## What Runs Where

The app is a **client-side single-page application (SPA)** with no server component beyond static file serving.

- **Static files** (`dist/`): HTML, CSS, JavaScript bundles, and WebAssembly modules, served from the origin (e.g., `https://easyverse.app/easytableone/`). The browser caches these locally.
- **Main thread** (`index.html` and bundled JS): Runs the React UI, state management, and export logic. Fetches only same-origin assets.
- **Web Worker** (`pyodide.worker-*.js`): Runs Python via Pyodide (WebAssembly). Loads Python wheels and extra wheels from `/public/pyodide-314.0.0a1/` and `/extra-wheels/` (same origin) during startup. All computational statistics, data transformations, and plotting happen here.
- **Same-origin data**: User's CSV/XLSX file, images embedded in exports (as data URIs), and browser cache.

No data flows to a remote server during analysis, import, or export.

---

## What Is Fetched and When

All assets are fetched **before "Analysis engine ready"** appears, during the startup wait shown to the user.

### At page load:

- `index.html` (HTTP), which includes a `<meta http-equiv="Content-Security-Policy">` tag.
- Bundled JavaScript (~500 KB gzipped): React, state management, export builders, UI components.
- Bundled CSS (~100 KB gzipped).
- Web Worker script: `pyodide.worker-*.js` (CSP header is applied to the worker's response).

### During worker startup (seconds 0–5):

- **Pyodide base**: `pyodide.asm.wasm` (~4.5 MB), `pyodide.asm.js` (~2 MB), and related modules.
- **Python wheels** (loaded into the Pyodide environment):
  - Core: `numpy`, `pandas`, `scipy`, `statsmodels`, `matplotlib` (~50 MB total, Git LFS tracked).
  - Statistics add-ons: `scikit-posthocs`, `seaborn` (~1 MB).
  - Modeling (if enabled): `scikit-learn`, `joblib`, `threadpoolctl` (~15 MB); `firthlogist`, `tabulate` (~100 KB).

Once "Analysis engine ready" is shown, all required packages are loaded. The app works offline from this point.

### At export:

- Plot images are embedded in DOCX/HTML as `<img src="data:image/png;base64,…">` (data URIs, no network).
- No remote stylesheets, fonts, or scripts are fetched.

---

## Content-Security-Policy

A CSP is enforced in two places:

### 1. Meta tag in `dist/index.html` (for the document):

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:;
connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';
font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'
```

### 2. HTTP response header (from server and `vite preview`):

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:;
connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline';
font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'self'
```

### Key directives:

- **`connect-src 'self'`**: The Web Worker can only make HTTP requests to the same origin. This is the primary guard against data exfiltration. No third-party hosts are permitted.
- **`script-src 'self' 'wasm-unsafe-eval'`**: Scripts must be same-origin; WebAssembly evaluation is permitted (required by Pyodide). Unsafe-eval applies to code evaluation (not data serialization) and does not affect the connect-src restriction.
- **`worker-src 'self' blob:`**: Workers must be same-origin or blob-created (for in-memory workers if used).
- **`img-src 'self' data: blob:`**: Images must be same-origin, data URIs, or blob URLs. No external image sources.

The meta tag does not cover the dedicated Web Worker; the HTTP header ensures the worker receives the policy from its script response.

---

## Export Inventory

| Export Format | Contains Aggregate Statistics | Contains Per-Observation Values | Contains Images Derived From Data |
|---|---|---|---|
| **Reproducibility JSON** | Yes | No | No |
| **Diagnostics JSON** | Yes | No | No |
| **Analysis History Python** | Yes | No | No |
| **Data Quality Report** (DOCX) | Yes | No (counts only, not raw values) | Yes — histograms, bar charts (show distributions, not individual points) |
| **EDA Report** (HTML) | Yes | No | Yes — bar charts, heatmaps, bivariate plots (show distributions) |
| **EDA Summary** (Markdown) | Yes | No | No |
| **Unified Report** (HTML) | Yes | No (aggregate table cells only) | Yes — plots from statistical summaries; bivariate plots embedded as PNG (show distributions) |
| **Unified Report Source** (HTML) | Yes | No | No (HTML markup only) |
| **Methods Summary** (DOCX, Markdown) | Yes | No | No |
| **Education Report** (DOCX, Markdown) | Yes | No | Yes — illustrative plots |
| **Modeling Report** (DOCX, Markdown) | Yes | No (no per-row weights, predictions, or residuals) | Yes — ROC curve, calibration plots, decision curves (grid aggregates only) |
| **Modeling Data ZIP** | No | Yes (fitted probabilities, out-of-fold predictions per observation) | No |
| **Results Table** (DOCX, XLSX, CSV, LaTeX) | Yes | No | No |

### Notes on images in DOCX and HTML exports:

The reproducibility JSON also keeps `outlierActions[].rowIndex` (D105(a′)). It records which source row a user's outlier decision applies to so `analysis_history.py` can reproduce that decision against the original file. The row index contains no patient value and reveals no patient data without that source file.

- **Histograms, bar charts, heatmaps**: Show category frequencies or aggregated densities. Do not reveal individual data points.
- **QQ plots** (in DOCX data-quality reports): Show the distribution of residuals or values against theoretical quantiles. For a continuous variable with *n* observations, a QQ plot displays *n* points, which can reveal the distribution shape but not the raw values (axis labels are standardized quantiles and empirical quantiles, not raw data).
- **Scatter plots with strip/jitter** (bivariate and mosaic): Show individual observations as points or strips to convey sample size and distribution. Axis values can be read as data values if they are numerical. To avoid this, the app does not embed strip plots or scatter plots with raw axes in any export; correlation matrices and missingness patterns are shown as heatmaps or text.
- **Modeling plots** (ROC, calibration, decision curves): Display aggregated thresholds, bins, or probabilities derived from statistical models, not raw patient values.

**DOCX and HTML images are PNG renderings embedded as data URIs.** No external image sources are fetched.

---

## Testing and Reproduction

### How It Is Tested

**Phase 51 Round 1 (D105)** includes an end-to-end test (`pnpm test:e2e:locality`) that runs on the production build (`vite preview`). The test:

1. Loads the app and waits for "Analysis engine ready".
2. Uploads a CSV dataset and runs a complete analysis, including every export format (DOCX, XLSX, CSV, LaTeX, HTML reports, Markdown reports, JSON records, Python script, data quality, EDA, modeling, and figures ZIP if present).
3. **Online**: Asserts that every HTTP request targets the origin, `data:` URIs, or `blob:` URIs. No request to another domain is permitted.
4. **Offline**: Repeats the full workflow after setting `context.setOffline(true)`. Asserts that no failed requests occur and every export completes.
5. **CSP violations**: Monitors `securitypolicyviolation` events; the test fails if any are logged.
6. **Export integrity**: Verifies that JSON records contain no `plotData` and no array longer than 100 entries outside an explicit allowlist (decision-curve grids, etc.).

The test is run three times in succession to verify stability. Request counts and CSP events are recorded in the session log.

The WebKit-engine offline pass cannot be automated because Playwright's WebKit build cannot simulate a disconnected network. Release v3.19.2 was not tested in Safari or Edge; use BROWSER_TEST_CHECKLIST to verify those browsers manually before claiming support.

### How to Reproduce

```bash
# On your computer with the project checked out:
pnpm build
pnpm test:e2e:locality
```

The test starts a preview server on port 4173, uploads the Heart Failure clinical dataset, and runs every export. On success, the summary shows request counts and CSP events (should be zero violations).

---

## What It Does Not Guarantee

1. **Server access logs**: The server records IP addresses and requested filenames (e.g., `GET /easytableone/pyodide.asm.wasm`) like any website. This is not data exfiltration (the server cannot read user data), but the IP and time-of-access are logged on the server.

2. **Exported files are the user's responsibility**: Once downloaded, an exported file (DOCX, JSON, Python script, ZIP) is no longer under the app's control. The user must manage it according to their institutional data-handling policies.

3. **Not regulatory compliance**: Data locality is a technical property of the app's design and is verified by this test. It is not a substitute for institutional IRB approval, informed consent, or HIPAA/GDPR compliance, which depend on deployment context, data governance, and legal agreements.

4. **Browser storage and device**: Browser cache, service worker cache, and JavaScript session storage may retain data on the user's device. Clearing browser data (Settings → Clear browsing data) removes these.

5. **No guarantee of confidentiality in transit**: HTTPS encrypts data in transit, but the deployment organization is responsible for TLS certificate management and server security.

---

**Implemented by**: Phase 51 Round 1 (D105); Implements SoftwareX Reviewer 2 Comments 1, 14, 15.  
**Verified**: `pnpm test:e2e:locality` passes online and offline; `pnpm build` scan passes; all computed statistics reproduce exactly (814 comparable / 53 not-comparable / max diff 0.0005).
