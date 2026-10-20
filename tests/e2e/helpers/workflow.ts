import { expect, test, type Page } from "@playwright/test";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const HF_CSV = path.join(__dirname, "../../../public/samples/heart_failure_clinical_records_dataset.csv");
export const HF_DICTIONARY = path.join(__dirname, "../../../public/samples/heart_failure_dictionary.csv");

// Shared e2e workflow steps. They follow the combined ImportStage:
// file -> study settings -> sheet/header -> dictionary -> schema -> QA -> plan -> statistics -> export.
// ImportStage.tsx is the source of truth when this flow changes.

/**
 * Navigate to the app root and wait for the Pyodide engine. "./" (not "/") keeps the
 * configured baseURL path, so it works for both the dev server ("/") and the production
 * preview ("/easytableone/").
 */
export async function openApp(page: Page) {
  await page.goto("./");
  await waitForEngine(page);
}

export async function waitForEngine(page: Page) {
  await expect(page.getByText("Analysis engine ready", { exact: true })).toBeVisible({ timeout: 120_000 });
}

export async function dismissWelcome(page: Page) {
  await page.getByTestId("welcome-get-started").click();
  await expect(page.getByRole("dialog", { name: /welcome/i })).toBeHidden();
}

/** Upload the data file and confirm study settings and header row. */
export async function uploadDataset(page: Page, filePath: string = HF_CSV, networkMode: "online" | "offline" = "online") {
  const importStartedAt = Date.now();
  await page.locator("#fileInput").setInputFiles(filePath);
  await expect(page.getByTestId("import-section-file")).toHaveAttribute("data-state", "done", { timeout: 120_000 });
  console.log(`[import-timing] ${test.info().project.name} ${networkMode} ${Date.now() - importStartedAt}`);

  await page.getByTestId("study-settings-continue").click();
  await expect(page.getByTestId("import-section-header")).toHaveAttribute("data-state", "active");
  await page.getByTestId("header-row-confirm").click();

  await expect(page.getByTestId("import-section-dictionary")).toHaveAttribute("data-state", "active");
}

export async function skipDictionary(page: Page) {
  await page.getByTestId("dictionary-skip").click();
}

/**
 * Upload a separate CSV dictionary and import it. In DictionaryStage the bottom button keeps
 * data-testid="dictionary-skip" but reads "Import dictionary" once a sheet is selected.
 */
export async function importDictionary(page: Page, dictionaryPath: string = HF_DICTIONARY) {
  await page.getByLabel("Upload separate dictionary file").setInputFiles(dictionaryPath);
  await expect(page.getByText(/loaded\.\s*1 sheet found/)).toBeVisible();
  await page.getByTestId("dictionary-skip").click();
}

export async function resolveAmbiguousTypes(page: Page) {
  const ambiguousSelects = page.locator('[data-testid="schema-type-select"][data-ambiguous="true"]');
  while (await ambiguousSelects.count()) {
    // Resolving a column removes its ambiguous selector, so always re-query the first remaining one.
    await ambiguousSelects.first().selectOption("categorical_nominal");
  }
}

export async function proceedFromSchema(page: Page) {
  await page.getByTestId("schema-proceed").click();
}

export async function proceedFromQa(page: Page) {
  await page.getByTestId("qa-proceed").click();
}

export async function chooseGrouping(page: Page, column: string) {
  await page.locator("#grouping-select").selectOption(column);
}

/** Click "Run statistics" and wait until the statistical review is ready to continue. */
export async function runStats(page: Page) {
  await page.getByTestId("plan-run-statistics").click();
  await expect(page.getByTestId("stats-continue-format-export")).toBeVisible({ timeout: 60_000 });
}

export async function continueToFormatExport(page: Page) {
  await page.getByTestId("stats-continue-format-export").click();
}
