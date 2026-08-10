import { describe, expect, it } from "vitest";
import type { RecomputeVariableResult, StatisticalResults } from "../types";
import { applyRecomputeResult } from "./applyRecomputeResult";

const baseResults: StatisticalResults = {
  perVariable: [
    {
      variable: "a",
      summaryByGroup: {},
      overallSummary: { n: 10 },
      test: { name: "Welch's t-test", statistic: 1, pValue: 0.01, originalPValue: 0.01 },
      notes: ["P-value adjusted via holm"],
    },
    {
      variable: "b",
      summaryByGroup: {},
      overallSummary: { n: 10 },
      test: { name: "Welch's t-test", statistic: 2, pValue: 0.04, originalPValue: 0.02 },
      notes: ["P-value adjusted via holm"],
    },
    {
      variable: "c",
      summaryByGroup: {},
      overallSummary: { n: 10 },
      test: { name: "None", statistic: null, pValue: null },
      notes: [],
    },
  ],
  groups: [{ name: "0", n: 10 }, { name: "1", n: 10 }],
  totalN: 20,
  computeMetadata: { libVersions: {}, seed: 42 },
};

describe("applyRecomputeResult", () => {
  it("applies engine-computed adjusted p-values to all non-target rows and skips nulls", () => {
    const recomputed: RecomputeVariableResult = {
      result: {
        ...baseResults.perVariable[0],
        test: { ...baseResults.perVariable[0].test, pValue: 0.03, originalPValue: 0.015 },
      },
      adjustedPValues: {
        a: 0.03,
        b: 0.05,
        c: null,
      },
    };

    const next = applyRecomputeResult(baseResults, recomputed);

    expect(next.perVariable.find((v) => v.variable === "a")?.test.pValue).toBe(0.03);
    const b = next.perVariable.find((v) => v.variable === "b")!;
    expect(b.test.originalPValue).toBe(0.02);
    expect(b.test.pValue).toBe(0.05);
    expect(b.notes).toEqual(["P-value adjusted via holm"]);
    expect(next.perVariable.find((v) => v.variable === "c")?.test.pValue).toBeNull();
  });
});
