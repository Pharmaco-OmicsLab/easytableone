import { test, expect } from "@playwright/test";
import * as path from "node:path";
import {
  dismissWelcome,
  openApp,
  proceedFromSchema,
  resolveAmbiguousTypes,
  skipDictionary,
  uploadDataset,
} from "./helpers/workflow";

test("small-category advisory appears in Data checks without blocking Proceed", async ({ page }) => {
  test.setTimeout(180_000);
  await openApp(page);
  await dismissWelcome(page);
  const probeFixture = path.resolve(process.cwd(), "tests/fixtures/hf_guardrail_probe.csv");
  await uploadDataset(page, probeFixture);
  await skipDictionary(page);
  await resolveAmbiguousTypes(page);
  await proceedFromSchema(page);

  await expect(page.getByText("Small Category", { exact: true })).toBeVisible();
  await expect(page.getByText(/level 'C' has n = 3/)).toBeVisible();
  // The probe contains a separate high-missingness review finding. Acknowledge that
  // review item so this assertion isolates whether the small-category advisory gates Proceed.
  const reviewAcknowledgment = page.getByRole("checkbox", { name: "I acknowledge this issue" });
  if (await reviewAcknowledgment.count()) await reviewAcknowledgment.first().check();
  await expect(page.getByTestId("qa-proceed")).toBeEnabled();
});
