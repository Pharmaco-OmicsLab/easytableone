import { describe, expect, it } from "vitest";
import * as t from "./index";

// ─── Minimal valid StatisticalResults for reuse ───────────────────────────────
function makeMinimalResult(testOverrides: Record<string, unknown> = {}): unknown {
  return {
    perVariable: [
      {
        variable: "age",
        summaryByGroup: { "0": { mean: 40 }, "1": { mean: 45 } },
        overallSummary: { mean: 42 },
        test: {
          name: "Welch's t-test",
          statistic: 3.14,
          pValue: 0.002,
          ...testOverrides,
        },
        smd: 0.45,
        notes: [],
      },
    ],
    groups: [
      { name: "0", n: 100 },
      { name: "1", n: 120 },
    ],
    totalN: 220,
    computeMetadata: {
      libVersions: { scipy: "1.14", numpy: "2.0" },
      seed: 42,
    },
  };
}

describe("Type Contracts", () => {
  it("should validate DataFrame", () => {
    const data = {
      columns: [{ originalName: "A", name: "A" }],
      rows: [[1]],
      meta: {
        sourceFile: "test.csv",
        parseWarnings: [],
        locale: { decimalSeparator: ".", thousandSeparator: "," },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: "utf-8",
        missingSentinels: ["NA"],
      },
    };
    expect(t.DataFrameSchema.parse(data)).toEqual(data);
  });

  it("should validate SchemaColumn", () => {
    const col = {
      name: "smoke",
      inferredType: "numeric_encoded_categorical_ambiguous",
      confirmedType: "numeric_encoded_categorical_ambiguous",
      cardinalityTier: "warn",
      exclusionReason: "Too ambiguous",
    };
    expect(t.SchemaColumnSchema.parse(col)).toEqual(col);
  });

  // ─── StatisticalResults round-trips ──────────────────────────────────────────
  it("round-trip: StatisticalResults with originalPValue", () => {
    const result = makeMinimalResult({ pValue: 0.03, originalPValue: 0.001 });
    const parsed = t.StatisticalResultsSchema.parse(result);
    expect(parsed.perVariable[0].test.originalPValue).toBe(0.001);
  });

  it("round-trip: StatisticalResults with auxiliary.oddsRatio", () => {
    const result = makeMinimalResult({
      name: "Fisher's exact",
      statistic: null,
      pValue: 0.04,
      auxiliary: { oddsRatio: 4.5 },
    });
    const parsed = t.StatisticalResultsSchema.parse(result);
    expect((parsed.perVariable[0].test.auxiliary as any)?.oddsRatio).toBe(4.5);
  });

  it("negative: unknown top-level field on StatisticalResults is rejected (.strict())", () => {
    const result = { ...(makeMinimalResult() as any), surpriseField: "oops" };
    expect(() => t.StatisticalResultsSchema.parse(result)).toThrow();
  });

  it("round-trip: AnalysisPlan with groupOrder", () => {
    const plan = {
      rulesetVersion: "1.0",
      appVersion: "1.0",
      groupingVariable: "arm",
      includedVariables: ["age"],
      variableConfig: {
        age: { label: "Age", treatAs: "continuous", missingness: "drop_row" },
      },
      showSMD: true,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      groupOrder: ["A", "B"],
      auditLog: [],
    };
    const parsed = t.AnalysisPlanSchema.parse(plan);
    expect(parsed.groupOrder).toEqual(["A", "B"]);
    expect(parsed.studyDesign).toBe("unspecified");
  });

  it("round-trip: AnalysisPlan studyDesign enum values", () => {
    for (const studyDesign of ["unspecified", "randomized_trial", "observational", "other"]) {
      const parsed = t.AnalysisPlanSchema.parse({
        rulesetVersion: "1.0",
        appVersion: "1.0",
        groupingVariable: "arm",
        includedVariables: ["age"],
        variableConfig: {
          age: { label: "Age", treatAs: "continuous", missingness: "drop_row" },
        },
        showSMD: true,
        showPValue: true,
        multipleTestingCorrection: "none",
        randomSeed: 42,
        auditLog: [],
        studyDesign,
      });
      expect(parsed.studyDesign).toBe(studyDesign);
    }
  });

  it("negative: unknown studyDesign is rejected", () => {
    expect(() => t.AnalysisPlanSchema.parse({
      rulesetVersion: "1.0",
      appVersion: "1.0",
      groupingVariable: "arm",
      includedVariables: ["age"],
      variableConfig: {
        age: { label: "Age", treatAs: "continuous", missingness: "drop_row" },
      },
      showSMD: true,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      auditLog: [],
      studyDesign: "parallel_group_trial",
    })).toThrow();
  });

  it("round-trip: variableConfig with chiSquareYatesCorrection: true", () => {
    const plan = {
      rulesetVersion: "1.0",
      appVersion: "1.0",
      groupingVariable: "arm",
      includedVariables: ["sex"],
      variableConfig: {
        sex: {
          label: "Sex",
          treatAs: "binary",
          missingness: "drop_row",
          chiSquareYatesCorrection: true,
        },
      },
      showSMD: true,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      auditLog: [],
    };
    const parsed = t.AnalysisPlanSchema.parse(plan);
    expect(parsed.variableConfig.sex.chiSquareYatesCorrection).toBe(true);
  });

  it("round-trip: StatisticalResults with null statistic/pValue", () => {
    const result = makeMinimalResult({ statistic: null, pValue: null });
    const parsed = t.StatisticalResultsSchema.parse(result);
    expect(parsed.perVariable[0].test.statistic).toBeNull();
    expect(parsed.perVariable[0].test.pValue).toBeNull();
  });

  it('AuditEntry rejects nested object in details (privacy guardrail)', () => {
    const bad = {
      timestamp: '2026-04-30T00:00:00Z',
      action: 'schema_override',
      details: { rawRow: { col1: 'sensitive', col2: 42 } },  // nested
    };
    expect(() => t.AuditEntrySchema.parse(bad)).toThrow();
  });

  it('AuditEntry accepts flat details', () => {
    const ok = {
      timestamp: '2026-04-30T00:00:00Z',
      action: 'schema_override',
      details: { column: 'age', oldType: 'continuous', newType: 'binary' },
    };
    expect(t.AuditEntrySchema.parse(ok)).toEqual(ok);
  });
});
