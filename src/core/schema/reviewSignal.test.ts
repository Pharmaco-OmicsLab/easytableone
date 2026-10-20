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

  it("flags high-cardinality categories but not confirmed measurements or identifiers (D98)", () => {
    expect(deriveSchemaReviewSignal(col({ confirmedType: "continuous", distinctCount: 31 }))).toEqual({ level: "ok" });
    expect(deriveSchemaReviewSignal(col({ confirmedType: "id_like", distinctCount: 40 }))).toEqual({ level: "ok" });

    const category = deriveSchemaReviewSignal(col({ distinctCount: 25 }));
    expect(category.level).toBe("flag");
    expect(category.message).toContain('switch the type to "Numeric"');
    expect(deriveSchemaReviewSignal(col({ confirmedType: "numeric_encoded_categorical_ambiguous", distinctCount: 25 })).level).toBe("flag");
    expect(deriveSchemaReviewSignal(col({ confirmedType: "binary", distinctCount: 15 })).level).toBe("warn");
  });

  it("continues to flag unsupported and date types with their existing remedy (D98)", () => {
    for (const confirmedType of ["unsupported", "date"] as const) {
      expect(deriveSchemaReviewSignal(col({ confirmedType, distinctCount: 0 }))).toEqual({
        level: "flag",
        message: "This column type is not used in Table 1. Exclude it or recode it before analysis.",
      });
    }
  });

  it("short-circuits excluded columns", () => {
    expect(
      deriveSchemaReviewSignal(col({ distinctCount: 42, cardinalityTier: "flag", exclusionReason: "Manually excluded" })),
    ).toEqual({ level: "ok" });
  });

  it("warns for ordered clinical scales with whole-number codes (D104(a))", () => {
    // NYHA_class 1-4 -> fires
    const nyha = deriveSchemaReviewSignal(col({ name: "NYHA_class", distinctCount: 4, isWholeNumberNumeric: true }));
    expect(nyha.level).toBe("warn");
    expect(nyha.message).toContain("Looks like an ordered clinical scale (4 whole-number codes)");
    expect(nyha.message).toContain("Ordered category (ordinal)");

    // ASA 1-5 -> fires
    const asa = deriveSchemaReviewSignal(col({ name: "ASA", distinctCount: 5, isWholeNumberNumeric: true }));
    expect(asa.level).toBe("warn");
    expect(asa.message).toContain("Looks like an ordered clinical scale (5 whole-number codes)");

    // giai_doan 1-4 -> fires
    const giaiDoan = deriveSchemaReviewSignal(col({ name: "giai_doan", distinctCount: 4, isWholeNumberNumeric: true }));
    expect(giaiDoan.level).toBe("warn");
    expect(giaiDoan.message).toContain("Looks like an ordered clinical scale (4 whole-number codes)");

    // ethnicity 1-5 -> does not fire ordinal scale warn (existing measurement message fires)
    const eth = deriveSchemaReviewSignal(col({ name: "ethnicity", distinctCount: 5, isWholeNumberNumeric: true }));
    expect(eth.level).toBe("warn");
    expect(eth.message).toContain("confirm this is a category, not a measurement");
    expect(eth.message).not.toContain("ordered clinical scale");

    // NYHA already categorical_ordinal -> does not fire ordinal scale warn
    const nyhaOrdinal = deriveSchemaReviewSignal(col({ name: "NYHA_class", confirmedType: "categorical_ordinal", distinctCount: 4, isWholeNumberNumeric: true }));
    expect(nyhaOrdinal.level).toBe("ok");

    // glasgow_coma_score with 13 levels -> does not fire (distinctCount > 10, hits high cardinality)
    const gcs = deriveSchemaReviewSignal(col({ name: "glasgow_coma_score", distinctCount: 13, isWholeNumberNumeric: true }));
    expect(gcs.level).toBe("warn");
    expect(gcs.message).toContain("high cardinality");
    expect(gcs.message).not.toContain("ordered clinical scale");
  });
});
