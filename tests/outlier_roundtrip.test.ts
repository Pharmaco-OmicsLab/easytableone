import { beforeAll, describe, expect, it } from "vitest";
import { detectOutliers } from "../src/core/qa/outliers";
import { runTable1 } from "../src/core/stats/runTable1";
import { pyodideClient } from "../src/workers/pyodide.client";

// ── Helper to build a minimal DataFrame ──────────────────────────────────────
function makeDF(colNames: string[], rows: (number | null)[][]): any {
  return {
    columns: colNames.map((n) => ({ name: n, originalName: n })),
    rows,
    meta: {
      sourceFile: "test",
      parseWarnings: [],
      locale: { decimalSeparator: ".", thousandSeparator: "," },
      detectedHeaderRow: 0,
      confirmedHeaderRow: 0,
      encoding: "utf-8",
      missingSentinels: [],
    },
  };
}

describe("Outlier detection ↔ winsorize round-trip", () => {
  beforeAll(async () => {
    await pyodideClient.isReady();
  }, 60000);

  // ─── Unit: detectOutliers returns empty arrays (not null) when no outliers ───
  it("outlier-free column returns { rowIndices: [], values: [] }, not null", () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, 10],
        [0, 11],
        [0, 12],
        [0, 10],
        [0, 11],
        [1, 20],
        [1, 21],
        [1, 22],
        [1, 20],
        [1, 21],
      ],
    );
    const result = detectOutliers(df, "val", "iqr");
    // No outliers → result object with empty arrays
    expect(result).not.toBeNull();
    expect(result?.rowIndices).toHaveLength(0);
    expect(result?.values).toHaveLength(0);
    expect(result?.method).toBe("iqr");
  });

  it("column with fewer than 4 numeric values returns null", () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, 1],
        [1, 2],
        [1, 3],
      ],
    );
    const result = detectOutliers(df, "val", "iqr");
    expect(result).toBeNull();
  });

  it("column with extreme outliers detects them", () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, 10],
        [0, 11],
        [0, 12],
        [0, 10],
        [0, 11],
        [0, 999],
      ],
    );
    const result = detectOutliers(df, "val", "iqr");
    expect(result).not.toBeNull();
    expect(result?.rowIndices).toContain(5);
    expect(result?.values).toContain(999);
  });

  // ─── Round-trip: winsorize clamps the extreme value ──────────────────────
  it("after winsorize, group max does not exceed original 99th percentile (±tolerance)", async () => {
    // 50 values for group 0: N(10, 1) with one extreme outlier at row 0
    const n = 50;
    const vals0: number[] = Array.from({ length: n }, (_, i) => 10 + (i % 3));
    vals0[0] = 9999; // extreme outlier

    const vals1: number[] = Array.from({ length: n }, (_, i) => 20 + (i % 3));
    const rows: [number, number][] = [
      ...vals0.map<[number, number]>((v) => [0, v]),
      ...vals1.map<[number, number]>((v) => [1, v]),
    ];

    const df = makeDF(["group", "val"], rows);

    // Detect so we know row 0 is flagged
    const detected = detectOutliers(df, "val", "iqr");
    expect(detected?.rowIndices).toContain(0);

    // Compute the 99th percentile of the original column (excluding nothing)
    const allVals = rows.map((r) => r[1]).sort((a, b) => a - b);
    const p99idx = Math.floor(allVals.length * 0.99);
    const p99 = allVals[p99idx];

    // Run with winsorize action — rowIndex is informational (column-wide cap)
    const plan: any = {
      rulesetVersion: "1.0",
      appVersion: "1.0",
      groupingVariable: "group",
      includedVariables: ["val"],
      variableConfig: {
        val: {
          label: "Val",
          treatAs: "continuous",
          missingness: "drop_row",
          outlierActions: [{ rowIndex: 0, action: "winsorize", winsorizeBound: "p01_p99" }],
        },
      },
      showSMD: false,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      auditLog: [],
    };

    const res = await runTable1(df, plan);
    const summary = res.perVariable[0].summaryByGroup["0"];
    const maxAfterWinsorize = summary?.max as number;

    // After winsorize, max of group 0 must be ≤ original p99 (with floating tolerance)
    expect(maxAfterWinsorize).toBeLessThanOrEqual(p99 * 1.01);
    expect(maxAfterWinsorize).toBeLessThan(9999);
  });

  // ─── Round-trip: exclude removes the row value ────────────────────────────
  it("after exclude, group 0 mean excludes row 0's extreme value", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, 10],
        [0, 11],
        [0, 12],
        [0, 9999],
        [1, 20],
        [1, 21],
        [1, 22],
      ],
    );

    const plan: any = {
      rulesetVersion: "1.0",
      appVersion: "1.0",
      groupingVariable: "group",
      includedVariables: ["val"],
      variableConfig: {
        val: {
          label: "Val",
          treatAs: "continuous",
          missingness: "drop_row",
          outlierActions: [{ rowIndex: 3, action: "exclude" }],
        },
      },
      showSMD: false,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      auditLog: [],
    };

    const res = await runTable1(df, plan);
    const mean = res.perVariable[0].summaryByGroup["0"]?.mean as number;
    // Without 9999, group 0 mean should be exactly (10+11+12)/3 = 11
    expect(mean).toBeCloseTo(11, 1);
  });

  // ─── String column flagged as continuous produces a user-friendly note ───
  it("string column configured as continuous produces a graceful note, no exception", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, null],
        [0, null],
        [1, null],
        [1, null],
      ],
    );
    // Inject string values directly into the rows
    const dfStrings: any = {
      ...df,
      rows: [
        [0, "yes"],
        [0, "no"],
        [1, "maybe"],
        [1, "yes"],
      ],
    };

    const plan: any = {
      rulesetVersion: "1.0",
      appVersion: "1.0",
      groupingVariable: "group",
      includedVariables: ["val"],
      variableConfig: {
        val: { label: "Val", treatAs: "continuous", missingness: "drop_row" },
      },
      showSMD: false,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      auditLog: [],
    };

    const res = await runTable1(dfStrings, plan);
    const v = res.perVariable[0];
    // Should not throw; test should be None; note should explain
    expect(v.test.pValue).toBeNull();
    expect(v.notes.some((n) => n.includes("non-numeric"))).toBe(true);
  });
});
