// Phase 51 R1 Step 1 (D105a): exported JSON records contain aggregate statistics only.
//
// Two layers:
//  1. Pure-unit synthetic fixture (no Pyodide): toAggregateResults + generateReproducibilityJson.
//  2. Heart Failure (n = 299) through the real Pyodide path: runTable1 and fitLogisticModel
//     (ridge, fast mode, 5 predictors), then the same array-length walk on both exports.
//
// NOTE: this file runs in the "unit" Vitest project unless it is added to
// scripts/vitest-projects.json (pyodide.include). Every Pyodide-backed step therefore carries
// its own explicit timeout.
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { toAggregateResults } from "../src/core/export/aggregateOnly";
import { generateReproducibilityJson } from "../src/core/export/reproducibilityJson";
import { defaultModelingSetup, type ModelingResults } from "../src/core/modeling/types";
import { parseCSV } from "../src/core/parser/csv";
import { inferSchema } from "../src/core/schema/inference";
import { runTable1 } from "../src/core/stats/runTable1";
import type { DataFrame, FormattedTable, Schema, StatisticalResults } from "../src/core/types";
import { pyodideClient } from "../src/workers/pyodide.client";

const MAX_ARRAY_LENGTH = 100;
const HF_CSV = path.resolve(__dirname, "../public/samples/heart_failure_clinical_records_dataset.csv");
const SIZE_LIMIT_BYTES = 100_000;

/**
 * Allowlist of arrays with length >= MAX_ARRAY_LENGTH that may legitimately appear in an
 * exported record. Key: JSON path with array indices collapsed to "[]". Value: one-line reason.
 * Rule (Phase 51 R1 R2): more than 5 entries means stop and report, do not extend.
 *
 * Currently empty: the decision-curve threshold grid has 99 points (< 100) and no other
 * array in the HF records reaches 100 entries.
 */
const ARRAY_LENGTH_ALLOWLIST: Record<string, string> = {};

function walkLongArrays(value: unknown, jsonPath = "$", found: Array<{ path: string; length: number }> = []) {
  if (Array.isArray(value)) {
    if (value.length >= MAX_ARRAY_LENGTH) found.push({ path: jsonPath, length: value.length });
    for (const item of value) walkLongArrays(item, `${jsonPath}[]`, found);
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      walkLongArrays(item, `${jsonPath}.${key}`, found);
    }
  }
  return found;
}

function expectAggregateOnly(jsonText: string) {
  expect(jsonText).not.toContain("plotData");
  const offenders = walkLongArrays(JSON.parse(jsonText)).filter((hit) => !(hit.path in ARRAY_LENGTH_ALLOWLIST));
  expect(offenders).toEqual([]);
}

function plotDataFor(n: number) {
  return {
    type: "continuous",
    raw: Array.from({ length: n }, (_, i) => ({ val: 40 + i * 0.37, group: i % 2 === 0 ? "0" : "1" })),
    qq: {
      points: Array.from({ length: n }, (_, i) => ({ theoretical: i / n - 0.5, sample: 40 + i * 0.37, group: "0" })),
      lines: [{ x: -3, y: 1, group: "0" }, { x: 3, y: 2, group: "0" }],
    },
  };
}

function syntheticResults(n: number): StatisticalResults {
  return {
    perVariable: ["age", "serum_sodium"].map((variable) => ({
      variable,
      summaryByGroup: { "0": { mean: 1, sd: 2, n: 100 }, "1": { mean: 2, sd: 3, n: 50 } },
      overallSummary: { mean: 1.3, sd: 2.4, n },
      test: { name: "Welch t-test", statistic: 1.2, pValue: 0.3 },
      notes: [],
      plotData: plotDataFor(n),
    })),
    groups: [{ name: "0", n: 100 }, { name: "1", n: 50 }],
    totalN: n,
    computeMetadata: { libVersions: { numpy: "x" }, seed: 42 },
  } as StatisticalResults;
}

const stubTable: FormattedTable = {
  journal: "NEJM",
  rulesetVersion: "test",
  title: "Table 1",
  header: [],
  rows: [],
  footnotes: [],
  methodsParagraph: "",
} as FormattedTable;

describe("Phase 51 R1 Step 1 - aggregate-only (synthetic, no Pyodide)", () => {
  it("toAggregateResults removes plotData and does not mutate the input", () => {
    const results = syntheticResults(150);
    const aggregate = toAggregateResults(results);
    expect(aggregate.perVariable).toHaveLength(2);
    for (const v of aggregate.perVariable) expect("plotData" in v).toBe(false);
    // In-app results keep plotData (Rules of Engagement 3).
    for (const v of results.perVariable) expect((v.plotData as any).raw).toHaveLength(150);
    // Aggregates are preserved.
    expect(aggregate.perVariable[0].overallSummary).toEqual(results.perVariable[0].overallSummary);
    expect(aggregate.perVariable[0].test).toEqual(results.perVariable[0].test);
    expect(aggregate.totalN).toBe(150);
    expect(aggregate.computeMetadata).toEqual(results.computeMetadata);
  });

  it("the unfiltered synthetic fixture trips the walker (guard is not vacuous)", () => {
    const offenders = walkLongArrays(JSON.parse(JSON.stringify(syntheticResults(150))));
    expect(offenders.length).toBeGreaterThan(0);
  });

  it("generateReproducibilityJson output is aggregate-only and states so", () => {
    const text = generateReproducibilityJson({
      plan: { groupingVariable: "DEATH_EVENT", auditLog: [] } as any,
      schema: { columns: [] },
      results: syntheticResults(150),
      formattedTable: stubTable,
      appVersion: "test",
      timestamp: "2026-10-01T00:00:00.000Z",
    });
    expectAggregateOnly(text);
    const parsed = JSON.parse(text);
    expect(parsed.aggregateOnlyNotice).toContain("aggregate statistics only");
    expect(parsed.results.perVariable[0].overallSummary.n).toBe(150);
  });
});

describe("Phase 51 R1 Step 1 - aggregate-only (Heart Failure, n = 299, Pyodide)", () => {
  let data: DataFrame;
  let schema: Schema;
  let stats: StatisticalResults;

  const continuous = ["age", "creatinine_phosphokinase", "ejection_fraction", "platelets", "serum_creatinine", "serum_sodium"];
  const categorical = ["anaemia", "diabetes", "high_blood_pressure", "sex", "smoking"];

  beforeAll(async () => {
    const buffer = fs.readFileSync(HF_CSV);
    data = await parseCSV(new File([buffer], "heart_failure_clinical_records_dataset.csv", { type: "text/csv" }));
    schema = { columns: inferSchema(data) };
    const variables = [...continuous, ...categorical];
    const plan: any = {
      rulesetVersion: "1.0",
      appVersion: "test",
      groupingVariable: "DEATH_EVENT",
      includedVariables: variables,
      variableConfig: Object.fromEntries(
        variables.map((name) => [
          name,
          {
            label: name,
            treatAs: continuous.includes(name) ? "continuous" : "categorical_nominal",
            missingness: "drop_row",
          },
        ]),
      ),
      showSMD: true,
      showPValue: true,
      multipleTestingCorrection: "holm",
      randomSeed: 42,
      auditLog: [],
    };
    stats = await runTable1(data, plan);
  }, 180_000);

  it("precondition: the engine still returns per-observation plotData in memory (299 rows)", () => {
    expect(data.rows).toHaveLength(299);
    const age = stats.perVariable.find((v) => v.variable === "age");
    expect((age?.plotData as any)?.raw).toHaveLength(299);
    expect((age?.plotData as any)?.qq?.points).toHaveLength(299);
  }, 120_000);

  it("reproducibility.json (statistics only) is aggregate-only and under 100 kB", () => {
    const text = generateReproducibilityJson({
      plan: { groupingVariable: "DEATH_EVENT", includedVariables: [], variableConfig: {}, auditLog: [] } as any,
      schema,
      results: stats,
      formattedTable: stubTable,
      appVersion: "test",
      timestamp: "2026-10-01T00:00:00.000Z",
    });
    expectAggregateOnly(text);
    const bytes = Buffer.byteLength(text, "utf8");
    console.log(`[aggregateOnly] HF reproducibility.json (no modeling): ${bytes} bytes`);
    expect(bytes).toBeLessThan(SIZE_LIMIT_BYTES);
  }, 120_000);

  it("diagnostics.json payload (toAggregateResults(...).perVariable) is aggregate-only", () => {
    // Mirrors handleDownloadDiagnostics, which serializes toAggregateResults(stats).perVariable
    // after label resolution (label resolution only rewrites summary count keys).
    const text = JSON.stringify(toAggregateResults(stats).perVariable, null, 2);
    expectAggregateOnly(text);
    expect(Buffer.byteLength(text, "utf8")).toBeLessThan(SIZE_LIMIT_BYTES);
  }, 120_000);

  it("reproducibility.json with a ridge fast-mode modeling block is aggregate-only and under 100 kB", async () => {
    const setup = {
      ...defaultModelingSetup(schema, "DEATH_EVENT", 42, data),
      outcome: "DEATH_EVENT",
      predictors: ["age", "ejection_fraction", "serum_creatinine", "serum_sodium", "sex"],
      model: "ridge" as const,
      validationB: 10,
      ciBootstrapB: 10,
      fastMode: true,
    };
    const logistic = await pyodideClient.fitLogisticModel(data, schema, setup);
    const modelingResults: ModelingResults = {
      schemaFingerprint: "fp",
      setup,
      logistic,
      ml: null,
      generatedAt: "2026-10-01T00:00:00.000Z",
    };
    const text = generateReproducibilityJson({
      plan: { groupingVariable: "DEATH_EVENT", includedVariables: [], variableConfig: {}, auditLog: [] } as any,
      schema,
      results: stats,
      formattedTable: stubTable,
      appVersion: "test",
      timestamp: "2026-10-01T00:00:00.000Z",
      modelingResults,
    });
    const parsed = JSON.parse(text);
    expect(parsed.modeling).toBeDefined();
    expect(parsed.modeling.decisionCurve?.points).toHaveLength(99); // grid over thresholds, not patients
    expectAggregateOnly(text);
    const bytes = Buffer.byteLength(text, "utf8");
    console.log(`[aggregateOnly] HF reproducibility.json (ridge modeling): ${bytes} bytes`);
    expect(bytes).toBeLessThan(SIZE_LIMIT_BYTES);
  }, 180_000);
});
