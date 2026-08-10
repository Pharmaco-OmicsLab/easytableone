import { beforeAll, describe, expect, it } from "vitest";
import { pyodideClient } from "../src/workers/pyodide.client";
import type { DataFrame, PlotTheme, Schema } from "../src/core/types";
import { journalRulesets } from "../src/core/format/formatTable";

const theme = journalRulesets.EasyTableOne_Ruleset.journals[0].plot_theme as PlotTheme;

function makeDataFrame(columns: string[], rows: (string | number | null)[][]): DataFrame {
  return {
    columns: columns.map((name) => ({ name, originalName: name })),
    rows,
    meta: {
      sourceFile: "eda-test.csv",
      parseWarnings: [],
      locale: { decimalSeparator: ".", thousandSeparator: "," },
      detectedHeaderRow: 0,
      confirmedHeaderRow: 0,
      encoding: "utf-8",
      missingSentinels: [],
    },
  };
}

function makeSchema(columns: Array<[string, Schema["columns"][number]["confirmedType"], string?]>): Schema {
  return {
    columns: columns.map(([name, confirmedType, displayLabel]) => ({
      name,
      inferredType: confirmedType,
      confirmedType,
      displayLabel,
      cardinalityTier: "ok",
    })),
  };
}

describe("easytable_eda.py", () => {
  beforeAll(async () => {
    await pyodideClient.isReady();
  }, 60000);

  it("computes missingness, lower-triangle correlations, and optional bivariate plots", async () => {
    const data = makeDataFrame(["group", "a", "b", "c", "cat"], [
      ["G1", 1, 2, 10, "x"],
      ["G1", 2, 4, null, "y"],
      ["G2", 3, 6, 30, null],
      ["G2", null, null, null, "z"],
      ["G2", 5, 10, null, "x"],
    ]);
    const schema = makeSchema([
      ["group", "binary", "Group"],
      ["a", "continuous", "A"],
      ["b", "continuous", "B"],
      ["c", "continuous", "C"],
      ["cat", "categorical_nominal", "Category"],
    ]);

    const noGroup = await pyodideClient.computeEDA(data, schema, theme, null);
    expect(noGroup.missingness.perVariable.length).toBe(5);
    expect(noGroup.missingness.perVariable.map((item) => item.missingPct)).toEqual(
      [...noGroup.missingness.perVariable.map((item) => item.missingPct)].sort((a, b) => b - a),
    );
    expect(noGroup.missingness.heatmapPng).toMatch(/^[A-Za-z0-9+/=\s]+$/);
    expect(noGroup.correlations.pairs.length).toBeGreaterThan(0);
    expect(noGroup.correlations.pairs.every((pair) => pair.colA !== pair.colB)).toBe(true);
    for (const pair of noGroup.correlations.pairs) {
      expect(noGroup.correlations.variableOrder.indexOf(pair.colA)).toBeGreaterThan(
        noGroup.correlations.variableOrder.indexOf(pair.colB),
      );
    }
    expect(noGroup.correlations.flagged.every(
      (pair) => Math.abs(pair.pearsonR) > 0.7 || Math.abs(pair.spearmanRho) > 0.7,
    )).toBe(true);
    expect(noGroup.mosaic?.pairs.length).toBeGreaterThan(0);
    expect(noGroup.mosaic?.pairs.every((pair) => pair.png.length > 100)).toBe(true);
    expect(noGroup.bivariate).toBeNull();

    const withGroup = await pyodideClient.computeEDA(data, schema, theme, "group");
    expect(withGroup.bivariate?.plots.length).toBeGreaterThan(0);
    expect(withGroup.bivariate?.plots.every((plot) => plot.png.length > 100)).toBe(true);
  }, 60000);

  it("omits the heatmap when fewer than three variables have missingness", async () => {
    const data = makeDataFrame(["a", "b", "c"], [
      [1, 2, 3],
      [null, 4, 5],
      [3, 6, 7],
    ]);
    const schema = makeSchema([
      ["a", "continuous"],
      ["b", "continuous"],
      ["c", "continuous"],
    ]);
    const result = await pyodideClient.computeEDA(data, schema, theme, null);
    expect(result.missingness.heatmapPng).toBeNull();
  }, 60000);

  it("reports Little's MCAR with fixed parity reference values", async () => {
    const data = makeDataFrame(["a", "b", "c"], [
      [1, 2, 10],
      [2, 4, null],
      [3, 6, 30],
      [null, null, null],
      [5, 10, null],
    ]);
    const schema = makeSchema([
      ["a", "continuous"],
      ["b", "continuous"],
      ["c", "continuous"],
    ]);

    const result = await pyodideClient.computeEDA(data, schema, theme, null);

    expect(result.missingness.mcar?.statistic).toBeCloseTo(1.613, 2);
    expect(result.missingness.mcar?.df).toBe(2);
    expect(result.missingness.mcar?.pValue).toBe(0.446);
    expect(result.missingness.mcar?.nPatterns).toBe(2);
    expect(result.missingness.mcar?.note).toContain("not completely at random");
    expect(result.missingness.mcar?.verdict).toBe("consistent_with_mcar");
    expect(result.missingness.mcar?.approximationNote).toContain("closed-form approximation");
  }, 60000);

  it("does not analyze schema-excluded columns", async () => {
    const data = makeDataFrame(["group", "active", "excluded"], [
      ["G1", 1, 10],
      ["G2", 2, null],
      ["G1", 3, 30],
    ]);
    const schema: Schema = {
      columns: [
        { name: "group", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
        { name: "active", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "excluded", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok", exclusionReason: "Manually excluded" },
      ],
    };

    const result = await pyodideClient.computeEDA(data, schema, theme, "group");
    expect(result.missingness.perVariable.map((item) => item.name)).not.toContain("excluded");
    expect(result.correlations.variableOrder).not.toContain("excluded");
    expect(result.vif?.map((row) => row.variable)).not.toContain("excluded");
    expect(result.bivariate?.plots.map((plot) => plot.variable)).not.toContain("excluded");
  }, 60000);

  it("fits long bivariate boxplot tick labels without overlap", async () => {
    const data = makeDataFrame(["prognosis", "spo2"], [
      ["Probable severe disease", 92],
      ["Probable severe disease", 94],
      ["Probable non-severe disease", 98],
      ["Probable non-severe disease", 99],
    ]);

    await pyodideClient.call("run_python", [`eda_box_debug_data = ${JSON.stringify(JSON.stringify(data))}`]);
    await pyodideClient.call("run_python", [`eda_box_debug_theme = ${JSON.stringify(JSON.stringify(theme))}`]);
    const raw = await pyodideClient.call("run_python", [`
import json
json.dumps(_debug_eda_boxplot_layout(eda_box_debug_data, "prognosis", "spo2", eda_box_debug_theme))
    `]);
    const debug = JSON.parse(raw);

    expect(debug.figsize[0]).toBeGreaterThan(3);
    expect(debug.overlap).toBe(false);
  }, 60000);

  it("places high-cardinality stacked-bar legends beside the axes without colliding with the xlabel", async () => {
    const rows: (string | number | null)[][] = [];
    for (let index = 0; index < 22; index += 1) {
      rows.push([
        index % 2 === 0 ? "Probable severe disease" : "Probable non-severe disease",
        `category-${index % 11}`,
      ]);
    }
    const data = makeDataFrame(["prognosis", "spo2_category"], rows);

    await pyodideClient.call("run_python", [`eda_stack_debug_data = ${JSON.stringify(JSON.stringify(data))}`]);
    await pyodideClient.call("run_python", [`eda_stack_debug_theme = ${JSON.stringify(JSON.stringify(theme))}`]);
    const raw = await pyodideClient.call("run_python", [`
import json
json.dumps(_debug_eda_stacked_bar_layout(eda_stack_debug_data, "prognosis", "spo2_category", eda_stack_debug_theme))
    `]);
    const debug = JSON.parse(raw);

    expect(debug.legend_loc).toBe(6);
    expect(debug.legend_x_label_overlap).toBe(false);
    expect(debug.figsize[0]).toBeGreaterThanOrEqual(3.3);
  }, 60000);

  it("resolves dictionary labels in bivariate boxplot ticks and stacked-bar legends", async () => {
    const data = makeDataFrame(["prognosis", "spo2", "status"], [
      [1, 92, 0],
      [1, 94, 1],
      [2, 98, 0],
      [2, 99, 1],
    ]);
    const groupColumn = {
      name: "prognosis",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [
        { code: "1.0", label: "Probable severe disease" },
        { code: 2, label: "Probable non-severe disease" },
      ],
    };
    const statusColumn = {
      name: "status",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [
        { code: 0, label: "No oxygen support" },
        { code: "1.0", label: "Oxygen support" },
      ],
    };

    await pyodideClient.call("run_python", [`eda_label_debug_data = ${JSON.stringify(JSON.stringify(data))}`]);
    await pyodideClient.call("run_python", [`eda_label_debug_theme = ${JSON.stringify(JSON.stringify(theme))}`]);
    await pyodideClient.call("run_python", [`eda_label_debug_group = ${JSON.stringify(JSON.stringify(groupColumn))}`]);
    await pyodideClient.call("run_python", [`eda_label_debug_status = ${JSON.stringify(JSON.stringify(statusColumn))}`]);
    const raw = await pyodideClient.call("run_python", [`
import json
box = _debug_eda_boxplot_layout(eda_label_debug_data, "prognosis", "spo2", eda_label_debug_theme, eda_label_debug_group)
stacked = _debug_eda_stacked_bar_layout(eda_label_debug_data, "prognosis", "status", eda_label_debug_theme, eda_label_debug_status)
json.dumps({"box_ticks": box["tick_labels"], "legend_labels": stacked["legend_labels"]})
    `]);
    const debug = JSON.parse(raw);

    expect(debug.box_ticks).toEqual(["Probable severe disease", "Probable non-severe disease"]);
    expect(debug.legend_labels).toEqual(["No oxygen support", "Oxygen support"]);
  }, 60000);

  it("falls back to raw bivariate chart codes when no dictionary is present", async () => {
    const data = makeDataFrame(["prognosis", "spo2", "status"], [
      ["1.0", 92, "0.0"],
      ["2.0", 98, "1.0"],
    ]);

    await pyodideClient.call("run_python", [`eda_fallback_debug_data = ${JSON.stringify(JSON.stringify(data))}`]);
    await pyodideClient.call("run_python", [`eda_fallback_debug_theme = ${JSON.stringify(JSON.stringify(theme))}`]);
    const raw = await pyodideClient.call("run_python", [`
import json
box = _debug_eda_boxplot_layout(eda_fallback_debug_data, "prognosis", "spo2", eda_fallback_debug_theme)
stacked = _debug_eda_stacked_bar_layout(eda_fallback_debug_data, "prognosis", "status", eda_fallback_debug_theme)
json.dumps({"box_ticks": box["tick_labels"], "legend_labels": stacked["legend_labels"]})
    `]);
    const debug = JSON.parse(raw);

    expect(debug.box_ticks).toEqual(["1", "2"]);
    expect(debug.legend_labels).toEqual(["0", "1"]);
  }, 60000);

  it("flags known-collinear continuous variables with VIF", async () => {
    const data = makeDataFrame(["x1", "x2", "x3", "cat1", "cat2"], [
      [1, 2, 5, "A", "Y"],
      [2, 4, 4, "A", "N"],
      [3, 6, 3, "B", "Y"],
      [4, 8, 2, "B", "N"],
      [5, 10, 1, "B", "Y"],
      [6, 12, 0, "A", "N"],
    ]);
    const schema = makeSchema([
      ["x1", "continuous", "X1"],
      ["x2", "continuous", "X2"],
      ["x3", "continuous", "X3"],
      ["cat1", "categorical_nominal", "Cat 1"],
      ["cat2", "binary", "Cat 2"],
    ]);

    const result = await pyodideClient.computeEDA(data, schema, theme, null);
    expect(result.vif?.some((row) => row.variable === "x1" && row.severity === "high")).toBe(true);
    expect(result.mosaic?.pairs[0]?.png).toMatch(/^[A-Za-z0-9+/=\s]+$/);
  }, 60000);

  it("computes centered VIF correctly: low VIF for independent large-mean columns, high VIF for collinear columns", async () => {
    // Test case A: Independent large-mean columns
    const rowsA: (number | string | null)[][] = [];
    for (let i = 0; i < 200; i++) {
      const x1 = 100.0 + Math.sin(i);
      const x2 = 100.0 + Math.cos(i);
      rowsA.push([x1, x2]);
    }
    const dataA = makeDataFrame(["x1", "x2"], rowsA);
    const schemaA = makeSchema([
      ["x1", "continuous"],
      ["x2", "continuous"],
    ]);
    const resultA = await pyodideClient.computeEDA(dataA, schemaA, theme, null);
    const vifX1_A = resultA.vif?.find(r => r.variable === "x1");
    const vifX2_A = resultA.vif?.find(r => r.variable === "x2");
    expect(vifX1_A).toBeDefined();
    expect(vifX2_A).toBeDefined();
    expect(vifX1_A!.vif).toBeLessThan(2);
    expect(vifX2_A!.vif).toBeLessThan(2);
    expect(vifX1_A!.severity).toBe("ok");
    expect(vifX2_A!.severity).toBe("ok");

    // Test case B: Collinear columns
    const rowsB: (number | string | null)[][] = [];
    for (let i = 0; i < 200; i++) {
      const x1 = 100.0 + Math.sin(i);
      const x3 = x1 + 0.001 * Math.sin(i * 2);
      rowsB.push([x1, x3]);
    }
    const dataB = makeDataFrame(["x1", "x3"], rowsB);
    const schemaB = makeSchema([
      ["x1", "continuous"],
      ["x3", "continuous"],
    ]);
    const resultB = await pyodideClient.computeEDA(dataB, schemaB, theme, null);
    const vifX1_B = resultB.vif?.find(r => r.variable === "x1");
    const vifX3_B = resultB.vif?.find(r => r.variable === "x3");
    expect(vifX1_B).toBeDefined();
    expect(vifX3_B).toBeDefined();
    expect(vifX1_B!.vif).toBeGreaterThan(10);
    expect(vifX3_B!.vif).toBeGreaterThan(10);
    expect(vifX1_B!.severity).toBe("high");
    expect(vifX3_B!.severity).toBe("high");
  }, 60000);

  it("keeps the synthetic 35K x 19 EDA path under 15 seconds", async () => {
    const columns = ["group", ...Array.from({ length: 5 }, (_, index) => `x${index + 1}`), ...Array.from({ length: 5 }, (_, index) => `b${index + 1}`), ...Array.from({ length: 8 }, (_, index) => `id${index + 1}`)];
    const rows = Array.from({ length: 35000 }, (_, rowIndex) => {
      const group = rowIndex % 2 === 0 ? "A" : "B";
      const continuous = Array.from({ length: 5 }, (_, colIndex) => (rowIndex % 97) + colIndex * 3);
      const binary = Array.from({ length: 5 }, (_, colIndex) => ((rowIndex + colIndex) % 3 === 0 ? "yes" : "no"));
      const ids = Array.from({ length: 8 }, (_, colIndex) => `id-${colIndex}-${rowIndex}`);
      return [group, ...continuous, ...binary, ...ids];
    });
    const schema = makeSchema([
      ["group", "binary"],
      ...Array.from({ length: 5 }, (_, index) => [`x${index + 1}`, "continuous"] as const),
      ...Array.from({ length: 5 }, (_, index) => [`b${index + 1}`, "binary"] as const),
      ...Array.from({ length: 8 }, (_, index) => [`id${index + 1}`, "id_like"] as const),
    ]);

    const start = performance.now();
    const result = await pyodideClient.computeEDA(makeDataFrame(columns, rows), schema, theme, "group");
    const elapsedSeconds = (performance.now() - start) / 1000;
    console.info(`D44 EDA synthetic 35K x 19 elapsed: ${elapsedSeconds.toFixed(2)}s`);
    expect(result.correlations.pairs.length).toBeGreaterThan(0);
    expect(elapsedSeconds).toBeLessThanOrEqual(15);
  }, 30000);
});
