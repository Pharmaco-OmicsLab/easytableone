import { describe, expect, it } from "vitest";
import type { SchemaColumn } from "../types";
import { deriveSchemaReviewSignal } from "./reviewSignal";

function col(overrides: Partial<SchemaColumn>): SchemaColumn {
  return {
    name: "x",
    inferredType: "categorical_nominal",
    confirmedType: "categorical_nominal",
    cardinalityTier: "ok",
    distinctCount: 0,
    isWholeNumberNumeric: false,
    ...overrides,
  };
}

describe("deriveSchemaReviewSignal", () => {
  it("reappears for 9-distinct whole-Numeric categories after a type round trip", () => {
    const base = col({ name: "ENVHOXY", distinctCount: 9, isWholeNumberNumeric: true });

    const categorySignal = deriveSchemaReviewSignal(base);
    expect(categorySignal.level).toBe("warn");
    expect(categorySignal.message).toContain("Numeric");
    expect(categorySignal.message).not.toContain("Continuous");
    expect(categorySignal.message).not.toContain("SpO2");

    expect(deriveSchemaReviewSignal({ ...base, confirmedType: "continuous" }).level).toBe("ok");
    expect(deriveSchemaReviewSignal({ ...base, confirmedType: "categorical_nominal" }).level).toBe("warn");
  });

  it("warns with a reason for 12-distinct categoricals", () => {
    const signal = deriveSchemaReviewSignal(col({ name: "PFMRSNOTH", distinctCount: 12 }));

    expect(signal.level).toBe("warn");
    expect(signal.message).toContain("high cardinality");
  });

  it("does not warn for 3-distinct coded categories", () => {
    expect(deriveSchemaReviewSignal(col({ distinctCount: 3, isWholeNumberNumeric: true })).level).toBe("ok");
  });

  it("short-circuits excluded columns", () => {
    expect(
      deriveSchemaReviewSignal(col({ distinctCount: 42, cardinalityTier: "flag", exclusionReason: "Manually excluded" })),
    ).toEqual({ level: "ok" });
  });
});
