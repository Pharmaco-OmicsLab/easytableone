import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parseCSV } from "../src/core/parser/csv";
import { inferSchema } from "../src/core/schema/inference";
import { runTable1 } from "../src/core/stats/runTable1";
import { pyodideClient } from "../src/workers/pyodide.client";

// Historical Node/jsdom timing check; the browser benchmark in tests/bench supersedes it.
const INTERNAL_STROKE_CSV = path.resolve(__dirname, "../_materials/samples/stroke_risk_dataset_v2.csv");

describe.skipIf(!process.env.PERF_TEST || !fs.existsSync(INTERNAL_STROKE_CSV))(
  "Performance Benchmark (D27; internal fixture: stroke_risk_dataset_v2.csv)", () => {
  beforeAll(async () => {
    // Warmup pyodide
    await pyodideClient.isReady();
  });

  it("runs full pipeline on stroke_risk_dataset_v2.csv within 30s", async () => {
    const start = performance.now();

    // 1. Data Ingestion
    const buffer = fs.readFileSync(INTERNAL_STROKE_CSV);
    const file = new File([buffer], "stroke_risk_dataset_v2.csv", { type: "text/csv" });
    const df = await parseCSV(file);

    // 2. Schema Inference
    const schemaColumns = inferSchema(df);

    // 3. Stats Engine
    const plan = {
      rulesetVersion: "1.0",
      appVersion: "1.0",
      groupingVariable: "stroke",
      includedVariables: schemaColumns
        .map((c) => c.name)
        .filter((n) => n !== "stroke" && n !== "id"),
      variableConfig: {},
      showSMD: true,
      showPValue: true,
      multipleTestingCorrection: "none" as const,
      randomSeed: 42,
      auditLog: [],
    };

    // Auto-fill plan configs based on inferred schema
    for (const c of schemaColumns) {
      (plan.variableConfig as any)[c.name] = {
        label: c.name,
        treatAs: c.confirmedType,
        missingness: "drop_row" as const,
      };
    }

    const res = await runTable1(df, plan as any);

    const end = performance.now();
    const durationMs = end - start;

    console.log(
      `Pipeline completed in ${durationMs.toFixed(0)} ms. Processed ${df.rows.length} rows.`,
    );
    expect(res.perVariable.length).toBeGreaterThan(0);
    expect(durationMs).toBeLessThanOrEqual(30000);
  }, 35000); // 35s timeout to allow some leeway above 30s assertion
});
// Historical Node/jsdom performance check. The real-browser benchmark in tests/bench/
// supersedes it for reviewer-facing runtime and memory measurements.
