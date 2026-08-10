import { describe, expect, it } from "vitest";
import type { DataQualityReport } from "../types";
import { IMPUTATION_SUGGESTION_DISCLAIMER, getImputationSuggestion } from "./imputationAdvice";

function report(missingPercent: number): DataQualityReport {
  return {
    columns: [
      { name: "outcome", missingCount: 0, missingPercent: 0, cardinality: 2, isConstant: false, flags: [] },
      { name: "age", missingCount: 1, missingPercent, cardinality: 10, isConstant: false, flags: [] },
      { name: "unused", missingCount: 50, missingPercent: 50, cardinality: 10, isConstant: false, flags: [] },
    ],
    overallCompletenessPercent: 90,
    blockingErrors: [],
  };
}

describe("getImputationSuggestion", () => {
  it("returns null when missingness data is unavailable or unmatched", () => {
    expect(getImputationSuggestion(["age"], null)).toBeNull();
    expect(getImputationSuggestion(["missing"], report(10))).toBeNull();
  });

  it("covers the missingness bands", () => {
    expect(getImputationSuggestion(["outcome", "age"], report(0))?.recommendedPolicy).toBe("complete_case");
    expect(getImputationSuggestion(["outcome", "age"], report(4.9))?.headline).toBe("Very little missing data");
    expect(getImputationSuggestion(["outcome", "age"], report(12))?.headline).toBe("Moderate missing data");
    expect(getImputationSuggestion(["outcome", "age"], report(25))?.headline).toBe("Substantial missing data");
  });

  it("always includes the advisory disclaimer when returning a suggestion", () => {
    const suggestion = getImputationSuggestion(["age"], report(12));
    expect(suggestion?.disclaimer).toBe(IMPUTATION_SUGGESTION_DISCLAIMER);
    expect(suggestion?.disclaimer).toMatch(/not guaranteed/i);
  });
});
