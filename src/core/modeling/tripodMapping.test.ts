import { describe, expect, it } from "vitest";
import { TRIPOD_AI_MAPPING, TRIPOD_AI_REPORTING_HEADER } from "./tripodMapping";

describe("TRIPOD+AI reporting mapping", () => {
  it("keeps the overclaim guardrail in the shared header", () => {
    expect(TRIPOD_AI_REPORTING_HEADER).toContain("does not by itself make a study TRIPOD+AI compliant");
  });

  it("marks item 23a supported once performance intervals land", () => {
    const row = TRIPOD_AI_MAPPING.find((candidate) => candidate.item === "23a");
    expect(row).toBeDefined();
    expect(row?.status).toBe("supported");
    expect(row?.detail).toContain("logistic validation");
    expect(row?.detail).toContain("intervals across CV repetitions");
    expect(row?.detail).toMatch(/subgroup/i);
  });

  it("marks item 12e supported once decision-curve analysis lands", () => {
    const row = TRIPOD_AI_MAPPING.find((candidate) => candidate.item === "12e");
    expect(row).toBeDefined();
    expect(row?.status).toBe("supported");
    expect(row?.detail).toMatch(/decision-curve|net benefit/i);
  });

  it("marks item 14 supported once opt-in subgroup performance lands without a verdict claim", () => {
    const row = TRIPOD_AI_MAPPING.find((candidate) => candidate.item === "14");
    expect(row).toBeDefined();
    expect(row?.status).toBe("supported");
    expect(row?.detail).toContain("opt-in per-subgroup");
    expect(row?.detail).toContain("no fairness verdict");
    expect(row?.detail).toContain("no auto-mitigation");
  });

  it("requires every supported item to explain what the app emits", () => {
    const supported = TRIPOD_AI_MAPPING.filter((row) => row.status === "supported");
    expect(supported.length).toBeGreaterThan(0);
    for (const row of supported) {
      expect(row.detail.trim().length).toBeGreaterThan(20);
    }
  });

  it("supported items appear in TRIPOD+AI numeric order", () => {
    const supportedItems = TRIPOD_AI_MAPPING.filter((r) => r.status === "supported").map((r) => r.item);
    expect(supportedItems).toEqual([
      "11", "12a", "12b", "12c", "12e", "12g", "13", "14", "15", "18f", "20b", "21", "22", "23a",
    ]);
  });
});
