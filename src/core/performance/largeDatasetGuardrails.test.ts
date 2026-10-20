import { describe, expect, it } from "vitest";
import { LARGE_N_CONFIRM_THRESHOLD, LARGE_N_NOTICE_THRESHOLD, MAX_DATA_ROWS, describeLargeNAdvisory, describeLargeNConfirm, describeLargeNNotice, describeRowLimitExceeded } from "./largeDatasetGuardrails";

describe("large dataset guardrail copy", () => {
  it("formats the notice and confirm thresholds", () => {
    expect(LARGE_N_NOTICE_THRESHOLD).toBe(50_000);
    expect(LARGE_N_CONFIRM_THRESHOLD).toBe(150_000);
    expect(describeLargeNNotice(50_001)).toContain("50,001 rows");
    expect(describeLargeNNotice(50_001)).toContain("may take longer to compute");
    expect(describeLargeNNotice(50_001)).not.toContain("150,000");
    expect(describeLargeNConfirm(150_001)).toContain("150,001 rows");
    expect(describeLargeNConfirm(150_001)).toContain("150,000-row threshold");
  });

  it("describes the hard data-row limit", () => {
    expect(MAX_DATA_ROWS).toBe(100_000);
    const message = describeRowLimitExceeded(100_001);
    expect(message).toContain("100,001 data rows");
    expect(message).toContain("100,000-row limit");
    expect(message).toContain("browser's memory");
    expect(message).toContain("random subsample");
    expect(message).toContain("one period or site");
  });

  it("branches the advisory by fast mode", () => {
    expect(describeLargeNAdvisory(60_000, true)).toContain("Fast validation is already on");
    expect(describeLargeNAdvisory(60_000, false)).toContain("thorough validation");
    expect(describeLargeNAdvisory(60_000, true)).toContain("does not bound SVM");
  });
});
