import { test, expect } from "@playwright/test";
import { stat } from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This smoke path follows the combined ImportStage: file → study settings →
// sheet/header → dictionary → schema → QA → plan → statistics → export.
// ImportStage.tsx is the source of truth when this flow changes.
test("End-to-end smoke test for DOCX export", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await expect(page.getByText("Analysis engine ready", { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("welcome-get-started").click();
  await expect(page.getByRole("dialog", { name: /welcome/i })).toBeHidden();

  await page.locator("#fileInput").setInputFiles(
    path.join(__dirname, "../../public/samples/heart_failure_clinical_records_dataset.csv"),
  );
  await expect(page.getByTestId("import-section-file")).toHaveAttribute("data-state", "done");

  await page.getByTestId("study-settings-continue").click();
  await expect(page.getByTestId("import-section-header")).toHaveAttribute("data-state", "active");
  await page.getByTestId("header-row-confirm").click();

  await expect(page.getByTestId("import-section-dictionary")).toHaveAttribute("data-state", "active");
  await page.getByTestId("dictionary-skip").click();

  const ambiguousSelects = page.locator('[data-testid="schema-type-select"][data-ambiguous="true"]');
  while (await ambiguousSelects.count()) {
    // Resolving a column removes its ambiguous selector, so always re-query the first remaining one.
    await ambiguousSelects.first().selectOption("categorical_nominal");
  }
  await page.getByTestId("schema-proceed").click();

  await page.getByTestId("qa-proceed").click();
  await page.locator("#grouping-select").selectOption("DEATH_EVENT");
  await page.getByTestId("plan-run-statistics").click();

  await expect(page.getByTestId("stats-continue-format-export")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("stats-continue-format-export").click();

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-docx").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/EasyTableOne_.*\.docx/);

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  expect((await stat(downloadPath!)).size).toBeGreaterThan(0);
});
