import { describe, expect, it } from "vitest";
import { LARGE_N_CONFIRM_THRESHOLD, LARGE_N_NOTICE_THRESHOLD, describeLargeNAdvisory, describeLargeNConfirm, describeLargeNNotice } from "./largeDatasetGuardrails";

describe("large dataset guardrail copy", () => {
  it("formats the notice and confirm thresholds", () => {
    expect(LARGE_N_NOTICE_THRESHOLD).toBe(50_000);
    expect(LARGE_N_CONFIRM_THRESHOLD).toBe(150_000);
    expect(describeLargeNNotice(50_001)).toContain("50,001 rows");
    expect(describeLargeNNotice(50_001)).toContain("50,000 and 150,000 rows");
    expect(describeLargeNConfirm(150_001)).toContain("150,001 rows");
    expect(describeLargeNConfirm(150_001)).toContain("150,000-row threshold");
  });

  it("branches the advisory by fast mode", () => {
    expect(describeLargeNAdvisory(60_000, true)).toContain("Fast validation is already on");
    expect(describeLargeNAdvisory(60_000, false)).toContain("thorough validation");
    expect(describeLargeNAdvisory(60_000, true)).toContain("does not bound SVM");
  });
});
