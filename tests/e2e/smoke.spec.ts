import { test, expect } from "@playwright/test";
import { stat } from "node:fs/promises";
import {
  chooseGrouping,
  continueToFormatExport,
  dismissWelcome,
  openApp,
  proceedFromQa,
  proceedFromSchema,
  resolveAmbiguousTypes,
  runStats,
  skipDictionary,
  uploadDataset,
} from "./helpers/workflow";

// This smoke path follows the combined ImportStage: file → study settings →
// sheet/header → dictionary → schema → QA → plan → statistics → export.
// ImportStage.tsx is the source of truth when this flow changes.
// The reusable steps live in ./helpers/workflow.ts (shared with data-locality.spec.ts).
test("End-to-end smoke test for DOCX export", async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openApp(page);
  await dismissWelcome(page);

  await uploadDataset(page);
  await skipDictionary(page);

  await resolveAmbiguousTypes(page);
  await proceedFromSchema(page);

  await proceedFromQa(page);
  await chooseGrouping(page, "DEATH_EVENT");
  await runStats(page);
  await continueToFormatExport(page);

  await page.getByText("Override individual settings", { exact: false }).click();
  const overridePanel = page.getByTestId("journal-override-panel");
  await expect(overridePanel).toBeVisible();
  await expect.poll(() => overridePanel.evaluate((panel) => panel.getBoundingClientRect().width)).toBeGreaterThan(640);
  const threshold = page.getByLabel("P-value Threshold");
  await expect.poll(() => threshold.evaluate((input) => input.scrollWidth <= input.clientWidth)).toBe(true);

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#download-docx").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/EasyTableOne_.*\.docx/);

  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  expect((await stat(downloadPath!)).size).toBeGreaterThan(0);
});
