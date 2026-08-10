import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "vitest";
import { pyodideClient } from "../src/workers/pyodide.client";
import { defaultModelingSetup, type LogisticModelKind } from "../src/core/modeling/types";
import type { DataFrame, Schema } from "../src/core/types";

function makeFixture(n: number, p: number, separated = false): { data: DataFrame; schema: Schema } {
  const columns = ["outcome", ...Array.from({ length: p }, (_, i) => `x${i + 1}`)];
  const rows: Array<Array<number>> = [];
  for (let i = 0; i < n; i++) {
    const base = (i % 17) / 17;
    const linear = Math.sin(i * 0.17) + Math.cos(i * 0.07);
    const outcome = separated ? (i % 5 === 0 ? 1 : 0) : (linear + base > 0.6 ? 1 : 0);
    const row = [outcome];
    for (let j = 0; j < p; j++) {
      if (separated && j === 0) {
        row.push(outcome);
      } else if (j > 0 && j % 11 === 0) {
        row.push(row[j] + ((i % 3) - 1) * 0.002);
      } else {
        row.push(Math.sin((i + 1) * (j + 1) * 0.013) + (i % (j + 3)) / (j + 3));
      }
    }
    rows.push(row);
  }

  return {
    data: {
      columns: columns.map((name) => ({ originalName: name, name })),
      rows,
      meta: {
        sourceFile: "phase18-runtime-benchmark.csv",
        parseWarnings: [],
        locale: { decimalSeparator: ".", thousandSeparator: "," },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: "utf-8",
        missingSentinels: [],
      },
    },
    schema: {
      columns: [
        { name: "outcome", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok", levels: [{ code: 0, label: "No" }, { code: 1, label: "Yes" }] },
        ...columns.slice(1).map((name) => ({ name, inferredType: "continuous" as const, confirmedType: "continuous" as const, cardinalityTier: "ok" as const })),
      ],
    },
  };
}

describe("Phase 18 runtime benchmark", () => {
  it("records Pyodide wall-clock timings for runtime-estimate calibration", async () => {
    await pyodideClient.isReady();
    const matrix: Array<{ model: LogisticModelKind; n: number; p: number; b: number; separated?: boolean }> = [
      { model: "plain", n: 100, p: 5, b: 0 },
      { model: "ridge", n: 500, p: 15, b: 20 },
      { model: "lasso", n: 500, p: 15, b: 20 },
      { model: "elasticnet", n: 500, p: 15, b: 20 },
      { model: "firth", n: 100, p: 5, b: 20 },
      { model: "firth", n: 500, p: 15, b: 20 },
      { model: "firth", n: 500, p: 35, b: 20 },
      { model: "firth", n: 500, p: 35, b: 20, separated: true },
    ];

    const results = [];
    for (const item of matrix) {
      const fixture = makeFixture(item.n, item.p, item.separated);
      const setup = {
        ...defaultModelingSetup(fixture.schema, "outcome", 20260229, fixture.data),
        outcome: "outcome",
        predictors: fixture.schema.columns.slice(1).map((column) => column.name),
        model: item.model,
        validationB: item.b,
        ciBootstrapB: item.b,
        fastMode: true,
      };
      const started = performance.now();
      const raw = await pyodideClient.call("run_logistic_model", [
        JSON.stringify(fixture.data),
        JSON.stringify(fixture.schema),
        JSON.stringify(setup),
      ]);
      const seconds = (performance.now() - started) / 1000;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      results.push({
        model: item.model,
        n: item.n,
        p: item.p,
        bootstrapB: item.b,
        separated: item.separated ? "yes" : "no",
        seconds: Number(seconds.toFixed(2)),
        status: parsed.error ? `error: ${String(parsed.error).slice(0, 80)}` : "ok",
        bEffective: parsed.validation?.b_effective ?? null,
      });
    }

    const outPath = path.resolve(process.cwd(), "_materials/phase18_r4_runtime_benchmarks.json");
    fs.writeFileSync(outPath, `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`);
    console.table(results);
  }, 900_000);
});
