// Phase 51 R1 Step 5 (D105d): network-guard and offline end-to-end test on the PRODUCTION build.
//
//  * Online pass:  run the whole workflow and every export while logging every request the
//                  browser context makes (page AND dedicated-worker requests). Every request must
//                  stay on the app origin (or be data:/blob:), the Pyodide wheels must appear in
//                  the log (self-check that worker requests are visible), and no CSP violation may
//                  be reported.
//  * Offline pass: new context, wait for "Analysis engine ready", go offline, repeat the whole
//                  workflow and every export. Zero failed requests, zero CSP violations.
//
// Browser-agnostic: only Playwright APIs, no Chromium-only calls (Round 2 adds Firefox/WebKit).
// Run with `pnpm test:e2e:locality` (project prod-chromium: builds and serves `vite preview`).
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { test, expect, type Browser, type BrowserContext, type Download, type Page } from "@playwright/test";
import conditionalFixmes from "./conditional-fixmes.json" with { type: "json" };
import {
  chooseGrouping,
  dismissWelcome,
  importDictionary,
  proceedFromQa,
  proceedFromSchema,
  resolveAmbiguousTypes,
  runStats,
  uploadDataset,
  waitForEngine,
} from "./helpers/workflow";

// Keep the locality smoke model small enough to complete in Firefox as well as Chromium.
const MODELING_PREDICTORS = ["age"];
const WEBKIT_OFFLINE_FIXME_REASON = conditionalFixmes["prod-webkit"][
  "offline pass: after engine ready the whole workflow and all exports work without a network"
];

// ---------------------------------------------------------------------------------------------
// Aggregate-only walk (same rule as tests/aggregateOnly.test.ts, Step 1).
// ---------------------------------------------------------------------------------------------
const MAX_ARRAY_LENGTH = 100;
/**
 * Arrays with length >= MAX_ARRAY_LENGTH that may appear in an exported record.
 * Key: JSON path with array indices collapsed to "[]"; value: one-line reason.
 * Keep identical to tests/aggregateOnly.test.ts. More than 5 entries: stop and report.
 */
const ARRAY_LENGTH_ALLOWLIST: Record<string, string> = {};

function walkLongArrays(value: unknown, jsonPath = "$", found: Array<{ path: string; length: number }> = []) {
  if (Array.isArray(value)) {
    if (value.length >= MAX_ARRAY_LENGTH) found.push({ path: jsonPath, length: value.length });
    for (const item of value) walkLongArrays(item, `${jsonPath}[]`, found);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      walkLongArrays(item, `${jsonPath}.${key}`, found);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------------------------
// Instrumentation
// ---------------------------------------------------------------------------------------------
interface Instrumented {
  context: BrowserContext;
  page: Page;
  browserName: string;
  origin: string;
  requests: Array<{ url: string; type: string }>;
  failed: Array<{ url: string; error: string | null }>;
  dialogs: string[];
  cspConsole: string[];
  consoleErrors: string[];
  pageErrors: string[];
  offlineStarted: boolean;
  offlineRequests: Array<{ url: string; type: string }>;
  offlineFailed: Array<{ url: string; type: string; error: string | null }>;
  offlineConsoleErrors: string[];
  offlinePageErrors: string[];
}

async function newInstrumentedPage(browser: Browser, baseURL: string): Promise<Instrumented> {
  const context = await browser.newContext({ baseURL, acceptDownloads: true });
  const requests: Instrumented["requests"] = [];
  const offlineRequests: Instrumented["offlineRequests"] = [];
  const offlineFailed: Instrumented["offlineFailed"] = [];
  const offlineConsoleErrors: string[] = [];
  const offlinePageErrors: string[] = [];
  let offlineStarted = false;
  // Context-level listener: also receives requests made by dedicated workers (where Pyodide
  // downloads its wheels). The .whl self-check in the online pass proves it on every run.
  context.on("request", (request) => {
    const record = { url: request.url(), type: request.resourceType() };
    requests.push(record);
    if (offlineStarted) offlineRequests.push(record);
  });
  context.on("requestfailed", (request) => {
    if (offlineStarted) offlineFailed.push({ url: request.url(), type: request.resourceType(), error: request.failure()?.errorText ?? null });
  });
  await context.addInitScript(() => {
    const w = window as unknown as { __cspViolations: unknown[] };
    w.__cspViolations = [];
    window.addEventListener(
      "securitypolicyviolation",
      (event) => {
        w.__cspViolations.push({
          blockedURI: event.blockedURI,
          violatedDirective: event.violatedDirective,
          effectiveDirective: event.effectiveDirective,
          sourceFile: event.sourceFile,
          lineNumber: event.lineNumber,
        });
      },
      true,
    );
  });
  const page = await context.newPage();
  const dialogs: string[] = [];
  const cspConsole: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  // alert() is how the export handlers report failures; treat any dialog as a failure.
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  // Violations inside the dedicated worker never reach window.__cspViolations; the browser
  // reports them in the console instead.
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") {
      consoleErrors.push(text);
      if (offlineStarted) offlineConsoleErrors.push(text);
    }
    if (/content security policy|refused to (connect|load|execute|create|evaluate|frame)/i.test(text)) {
      cspConsole.push(text);
    }
  });
  page.on("pageerror", (error) => {
    const text = error.stack ?? error.message;
    pageErrors.push(text);
    if (offlineStarted) offlinePageErrors.push(text);
  });
  return {
    context, page, browserName: browser.browserType().name(), origin: new URL(baseURL).origin,
    requests, failed: [], dialogs, cspConsole, consoleErrors, pageErrors,
    get offlineStarted() { return offlineStarted; },
    set offlineStarted(value: boolean) { offlineStarted = value; },
    offlineRequests, offlineFailed, offlineConsoleErrors, offlinePageErrors,
  };
}

async function closeInstrumentedContext(run: Instrumented) {
  try {
    await run.context.close();
  } catch (error) {
    // Firefox can raise this Playwright teardown error while removing a context. Ignore only that
    // cleanup exception so any original assertion failure remains visible.
    if (run.browserName === "firefox" && /_maybeDontRestoreTabs/.test(String(error))) {
      console.warn(`Ignoring Firefox context teardown error: ${String(error)}`);
      return;
    }
    throw error;
  }
}

async function readCspViolations(page: Page): Promise<unknown[]> {
  return page.evaluate(() => (window as unknown as { __cspViolations?: unknown[] }).__cspViolations ?? []);
}

function summarizeRequests(requests: Array<{ url: string; type: string }>) {
  const byType: Record<string, number> = {};
  for (const r of requests) byType[r.type] = (byType[r.type] ?? 0) + 1;
  return `${requests.length} requests: ${JSON.stringify(byType)}`;
}

// ---------------------------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------------------------
async function runAnalysisWorkflow(page: Page, networkMode: "online" | "offline") {
  await dismissWelcome(page);
  await uploadDataset(page, undefined, networkMode);
  await importDictionary(page);
  await resolveAmbiguousTypes(page);
  await proceedFromSchema(page);

  // Stage 5 (Data checks): the EDA panel is expanded by default.
  await page.getByRole("button", { name: "Generate EDA", exact: true }).click();
  await expect(page.getByRole("button", { name: "Regenerate EDA", exact: true })).toBeVisible({ timeout: 180_000 });
  // HF has no missing values, so the missingness chart is not rendered ("No missing values" message).
  // The correlation chart is rendered by Vega: an <svg> inside it proves Vega runs under the CSP.
  await expect(page.getByTestId("correlation-chart").locator("svg").first()).toBeVisible({ timeout: 30_000 });
  await proceedFromQa(page);

  await chooseGrouping(page, "DEATH_EVENT");
  await page.locator("#mtc-select").selectOption("holm");
  await runStats(page);
}

async function runModeling(page: Page) {
  // Opt-in rail entry "6. Modeling (optional)" enables modeling and opens stage 8.
  await page.getByRole("button", { name: /6\. Modeling/ }).first().click();
  await expect(page.getByRole("heading", { name: "Modeling", exact: true })).toBeVisible();

  // Outcome (first select inside the "Outcome" label; the "Event to model" select comes after it).
  await page.locator("label", { hasText: "Outcome" }).first().locator("select").first().selectOption("DEATH_EVENT");

  // Predictors: clear the selection, then tick only the five requested ones.
  // The app (re)computes default predictors after the outcome changes; let that settle first so a
  // late default selection cannot flip our clicks (seen in the offline pass).
  const toggle = page.getByText("Candidate predictors", { exact: true }).locator("xpath=following-sibling::button");
  await expect(toggle).toBeVisible();
  await page.waitForTimeout(1000);
  if ((await toggle.textContent())?.trim() === "Select all") await toggle.click();
  await toggle.click();
  await page.waitForTimeout(500);
  for (const name of MODELING_PREDICTORS) {
    // The predictor list is the first element with span[title=<column>]; the subgroup list repeats the pattern.
    const box = page.locator(`label:has(> span[title="${name}"]) > input[type="checkbox"]`).first();
    await expect(async () => {
      if (!(await box.isChecked())) await box.click();
      await expect(box).toBeChecked({ timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  }

  await page.getByRole("button", { name: "Ridge", exact: true }).click();
  await page.getByLabel("Fast validation").setChecked(true);

  const run = page.getByRole("button", { name: "Run logistic regression" });
  await expect(run).toBeEnabled();
  await run.click();
  // While running the button is relabelled "Running..."; wait for it to return to the idle label.
  await expect(page.getByRole("button", { name: "Running..." })).toBeVisible({ timeout: 30_000 }).catch(() => undefined);
  await expect(page.getByRole("button", { name: "Run logistic regression" })).toBeVisible({ timeout: 300_000 });
  await expect(page.getByRole("button", { name: "Run logistic regression" })).toBeEnabled();

  await page.getByRole("button", { name: "Continue to Format and export" }).click();
}

interface Captured {
  testId: string;
  filename: string;
  bytes: Buffer;
}

async function clickAndCollect(page: Page, testId: string, expectedDownloads = 1): Promise<Captured[]> {
  const downloads: Download[] = [];
  const onDownload = (download: Download) => downloads.push(download);
  page.on("download", onDownload);
  try {
    await page.getByTestId(testId).click();
    if (testId === "download-modeling-report-docx") {
      await expect.poll(async () => downloads.length > 0 || (await page.getByRole("status").allTextContents()).some((text) => text.includes("Failed to export modeling report DOCX.")), {
        timeout: 30_000,
        message: "neither a modeling report DOCX download nor an export failure toast appeared",
      }).toBe(true);
      if (downloads.length === 0) throw new Error(`Modeling report export toast: ${(await page.getByRole("status").allTextContents()).join(" | ")}`);
    }
    await expect
      .poll(() => downloads.length, { timeout: 300_000, message: `no download from ${testId}` })
      .toBeGreaterThanOrEqual(expectedDownloads);
  } finally {
    page.off("download", onDownload);
  }
  const captured: Captured[] = [];
  for (const download of downloads) {
    expect(await download.failure(), `download failed for ${testId}`).toBeNull();
    const filePath = await download.path();
    expect(filePath, `download path for ${testId}`).toBeTruthy();
    captured.push({ testId, filename: download.suggestedFilename(), bytes: await readFile(filePath!) });
  }
  return captured;
}

/** Every export button that produces a file. Print / Save-PDF buttons open a print window and are exercised manually. */
const EXPORTS: Array<{ testId: string; downloads?: number; filename: RegExp }> = [
  { testId: "download-docx", filename: /\.docx$/ },
  { testId: "download-csv", filename: /\.csv$/ },
  { testId: "download-xlsx", filename: /\.xlsx$/ },
  { testId: "download-latex", filename: /\.(tex|latex)$/ },
  { testId: "download-report-html", filename: /\.html$/ },
  { testId: "download-report-source", filename: /\.zip$/ },
  { testId: "download-repro-json", filename: /^reproducibility\.json$/ },
  { testId: "download-diagnostics-csv", filename: /^diagnostics\.csv$/ },
  { testId: "download-diagnostics-json", filename: /^diagnostics\.json$/ },
  { testId: "download-analysis-history", filename: /\.py$/ },
  { testId: "download-data-quality-report", filename: /\.md$/ },
  { testId: "download-data-quality-docx", filename: /\.docx$/ },
  { testId: "download-eda-report", filename: /^eda_report\.html$/ },
  { testId: "download-eda-summary", filename: /\.md$/ },
  { testId: "download-results-summary", filename: /\.md$/ },
  { testId: "download-methods-summary", filename: /\.md$/ },
  { testId: "download-methods-summary-docx", filename: /\.docx$/ },
  { testId: "download-education-md", filename: /\.md$/ },
  { testId: "download-education-docx", filename: /\.docx$/ },
  { testId: "download-modeling-report-md", filename: /\.md$/ },
  { testId: "download-modeling-report-docx", filename: /\.docx$/ },
  { testId: "download-modeling-data", filename: /\.zip$/ },
];

async function runAllExports(page: Page): Promise<Captured[]> {
  const nejm = page.getByRole("radio", { name: /NEJM|New England/ });
  await expect(nejm).toBeVisible();
  await nejm.check();

  // Exercise the heaviest DOCX path: supplementary plots + EDA + modeling appendices.
  await page.getByLabel(/Diagnostic plots as supplementary figures/).setChecked(true);
  await page.getByLabel(/EDA report appendix/).setChecked(true);
  await page.getByLabel(/Modeling report appendix/).setChecked(true);

  const all: Captured[] = [];
  for (const item of EXPORTS) {
    const captured = await clickAndCollect(page, item.testId, item.downloads ?? 1);
    for (const file of captured) {
      expect(file.bytes.length, `${item.testId}: ${file.filename} is empty`).toBeGreaterThan(0);
      expect(file.filename, `${item.testId}: unexpected filename`).toMatch(item.filename);
    }
    all.push(...captured);
  }
  // The figure ZIP is only offered when diagnostic figures exist.
  if ((await page.getByTestId("download-figures-zip").count()) > 0) {
    const captured = await clickAndCollect(page, "download-figures-zip");
    for (const file of captured) expect(file.bytes.length, `figures zip is empty`).toBeGreaterThan(0);
    all.push(...captured);
  }
  const downloadAll = await clickAndCollect(page, "download-all");
  expect(downloadAll).toHaveLength(1);
  expect(downloadAll[0].filename).toMatch(/^EasyTableOne_.+\.zip$/);
  const bundle = await JSZip.loadAsync(downloadAll[0].bytes);
  const bundledNames = Object.keys(bundle.files).filter((name) => !bundle.files[name].dir).sort();
  expect(bundledNames).toContain("MANIFEST.txt");
  expect(bundledNames).toContain("data_quality_report_print.html");
  const manifest = await bundle.file("MANIFEST.txt")!.async("string");
  expect(manifest).toContain("EasyTableOne");
  expect(manifest).not.toContain("Failed:");
  const filesSection = manifest.split("Files:\n")[1]?.split("\n\n")[0] ?? "";
  const manifestFiles = filesSection.split("\n").filter((line) => line.startsWith("- "));
  expect(bundledNames.length - 1, "manifest file count matches Download All entries").toBe(manifestFiles.length);
  const normalizeName = (name: string) => name
    .replace(/^EasyTableOne_NEJM_\d+\./, "EasyTableOne_NEJM_TIMESTAMP.")
    .replace(/^figures_NEJM_\d+\./, "figures_NEJM_TIMESTAMP.")
    .replace(/^modeling_data_\d+\./, "modeling_data_TIMESTAMP.")
    .replace(/^easytableone_report_NEJM_\d{4}-\d{2}-\d{2}T[^.]+\.html$/, "easytableone_report_NEJM_TIMESTAMP.html")
    .replace(/^easytableone_report_source_\d{4}-\d{2}-\d{2}T[^.]+\.zip$/, "easytableone_report_source_TIMESTAMP.zip");
  const expectedNames = [...all.map((file) => normalizeName(file.filename)), "data_quality_report_print.html"].sort();
  const normalizedBundledNames = bundledNames.filter((name) => name !== "MANIFEST.txt").map(normalizeName).sort();
  expect(normalizedBundledNames, "Download All contains the same exports as the individual buttons").toEqual(expectedNames);
  all.push({ ...downloadAll[0], testId: "download-all" });
  return all;
}

function assertExportContents(files: Captured[]) {
  const text = (name: RegExp) => {
    const file = files.find((f) => name.test(f.filename));
    expect(file, `missing export ${name}`).toBeTruthy();
    return file!.bytes.toString("utf8");
  };

  // Step 1: aggregate-only JSON records.
  for (const name of [/^reproducibility\.json$/, /^diagnostics\.json$/]) {
    const json = text(name);
    expect(json, `${name} must not contain plotData`).not.toContain("plotData");
    const offenders = walkLongArrays(JSON.parse(json)).filter((hit) => !(hit.path in ARRAY_LENGTH_ALLOWLIST));
    expect(offenders, `${name} has arrays of >= ${MAX_ARRAY_LENGTH} entries`).toEqual([]);
  }

  // Step 2: the EDA report is static.
  expect(text(/^eda_report\.html$/).toLowerCase()).not.toContain("<script");
}

// ---------------------------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------------------------
test.describe("Phase 51 data locality (production build)", () => {
  test.describe.configure({ mode: "serial" });

  test("online pass: every request stays on the app origin; no CSP violations", async ({ browser, baseURL }, testInfo) => {
    test.setTimeout(900_000);
    expect(baseURL, "baseURL must be configured").toBeTruthy();
    const run = await newInstrumentedPage(browser, baseURL!);
    try {
      await run.page.goto("./");
      await waitForEngine(run.page);
      await runAnalysisWorkflow(run.page, "online");
      await runModeling(run.page);
      await expectExportStage(run.page);
      const files = await runAllExports(run.page);

      const summary = summarizeRequests(run.requests);
      console.log(`[data-locality online] ${summary}; ${files.length} files downloaded`);
      await testInfo.attach("online-request-summary", { body: summary, contentType: "text/plain" });
      await testInfo.attach("online-request-log", {
        body: run.requests.map((r) => `${r.type}\t${r.url}`).join("\n"),
        contentType: "text/plain",
      });

      const external = run.requests.filter(
        (r) => !(r.url.startsWith(`${run.origin}/`) || r.url.startsWith("data:") || r.url.startsWith("blob:")),
      );
      expect(external, "requests to origins other than the app").toEqual([]);
      // Self-check: the guard is blind unless worker-originated requests (Pyodide wheels) were logged.
      expect(
        run.requests.some((r) => /\.whl(\?|#|$)/.test(r.url)),
        "no .whl request was logged: worker requests are not being captured",
      ).toBe(true);

      expect(await readCspViolations(run.page), "securitypolicyviolation events").toEqual([]);
      expect(run.cspConsole, "CSP console errors (incl. worker)").toEqual([]);
      expect(run.dialogs, "alert() dialogs raised by export handlers").toEqual([]);
      assertExportContents(files);
    } finally {
      await closeInstrumentedContext(run);
    }
  });

  test("offline pass: after engine ready the whole workflow and all exports work without a network", async ({ browser, baseURL, browserName }, testInfo) => {
    test.fixme(
      browserName === "webkit",
      WEBKIT_OFFLINE_FIXME_REASON,
    );
    test.setTimeout(900_000);
    expect(baseURL, "baseURL must be configured").toBeTruthy();
    const run = await newInstrumentedPage(browser, baseURL!); // new context => cold HTTP cache
    try {
      await run.page.goto("./");
      await waitForEngine(run.page);

      await run.context.setOffline(true);
      run.offlineStarted = true;
      const requestsBeforeOffline = run.requests.length;

      await runAnalysisWorkflow(run.page, "offline");
      await runModeling(run.page);
      await expectExportStage(run.page);
      const files = await runAllExports(run.page);

      const offlineRequests = run.requests.slice(requestsBeforeOffline);
      const summary = summarizeRequests(offlineRequests);
      console.log(`[data-locality offline] ${summary} after going offline; ${files.length} files downloaded`);
      await testInfo.attach("offline-request-summary", { body: summary, contentType: "text/plain" });
      expect(run.offlineFailed, "requestfailed events while offline").toEqual([]);
      expect(await readCspViolations(run.page), "securitypolicyviolation events").toEqual([]);
      expect(run.cspConsole, "CSP console errors (incl. worker)").toEqual([]);
      expect(run.dialogs, "alert() dialogs raised by export handlers").toEqual([]);
      assertExportContents(files);
    } finally {
      await testInfo.attach("offline-diagnostics", {
        body: JSON.stringify({
          requests: run.offlineRequests,
          requestfailed: run.offlineFailed,
          consoleErrors: run.offlineConsoleErrors,
          pageErrors: run.offlinePageErrors,
          cspViolations: await readCspViolations(run.page).catch((error) => [`could not read CSP violations: ${String(error)}`]),
        }, null, 2),
        contentType: "application/json",
      });
      await closeInstrumentedContext(run);
    }
  });
});

/** runModeling() ends by clicking "Continue to Format and export"; confirm the export stage is showing. */
async function expectExportStage(page: Page) {
  await expect(page.getByRole("heading", { name: "Format & Export" })).toBeVisible();
}
