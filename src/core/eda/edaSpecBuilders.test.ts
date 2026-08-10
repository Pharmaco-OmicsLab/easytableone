import { describe, expect, it } from "vitest";
import { buildCorrelationSpec, buildMissingnessSpec } from "./edaSpecBuilders";

describe("edaSpecBuilders", () => {
  it("buildMissingnessSpec returns the bar chart spec with input values", () => {
    const spec = buildMissingnessSpec([
      { name: "age", displayLabel: "Age", missingCount: 2, missingPct: 20 },
    ]) as any;

    expect(spec.mark).toBe("bar");
    expect(spec.data.values).toEqual([
      { name: "age", displayLabel: "Age", missingCount: 2, missingPct: 20 },
    ]);
  });

  it("buildCorrelationSpec returns a layered matrix and marks flagged pairs", () => {
    const spec = buildCorrelationSpec(
      [{ colA: "age", displayA: "Age", colB: "weight", displayB: "Weight", r: 0.8, rho: 0.75 }],
      [{ colA: "age", displayA: "Age", colB: "weight", displayB: "Weight", pearsonR: 0.8, spearmanRho: 0.75 }],
      ["age", "weight"],
      null,
    ) as any;

    expect(spec.layer[0].mark).toBe("rect");
    expect(spec.layer[1].transform[0].filter).toBe("datum.flagged");
    expect(spec.data.values[0].flagged).toBe(true);
  });
});
