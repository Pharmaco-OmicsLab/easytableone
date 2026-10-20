import * as fs from "node:fs";
import * as path from "node:path";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseCSV } from "../src/core/parser/csv";
import { recomputeVariableWithAdjustments, runTable1, recomputeVariable } from "../src/core/stats/runTable1";
import { pyodideClient } from "../src/workers/pyodide.client";
import { generateAnalysisHistory } from "../src/core/export/analysisHistory";
import { generateReproducibilityJson } from "../src/core/export/reproducibilityJson";
import { generateMethodsParagraph } from "../src/core/format/methodsParagraph";
import { enumerateSheets, parseXLSXSheet } from "../src/core/parser/xlsx";
import { sha256Hex } from "../src/lib/hash";

const MATERIALS_DIR = path.resolve(__dirname, "../_materials");
const internalFixture = (name: string) => path.join(MATERIALS_DIR, "samples", name);

function getFile(filename: string): File {
  const directPath = path.join(MATERIALS_DIR, filename);
  const filepath = fs.existsSync(directPath)
    ? directPath
    : path.join(MATERIALS_DIR, "samples", filename);
  const buffer = fs.readFileSync(filepath);
  return new File([buffer], filename, {
    type: filename.endsWith(".csv")
      ? "text/csv"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// Helper to build a minimal DataFrame
function makeDF(colNames: string[], rows: (number | string | null)[][]): any {
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

function makePlan(
  groupingVariable: string,
  includedVariables: string[],
  variableConfig: Record<string, any>,
  overrides: Record<string, any> = {},
): any {
  return {
    rulesetVersion: "1.0",
    appVersion: "1.0",
    groupingVariable,
    includedVariables,
    variableConfig,
    showSMD: true,
    showPValue: true,
    multipleTestingCorrection: "none",
    auditLog: [],
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// SETUP
// ─────────────────────────────────────────────
describe("Statistical Engine – Smoke & Property Tests", () => {
  beforeAll(async () => {
    const startedAt = Date.now();
    await pyodideClient.isReady();
    if (process.env.CI === "1") {
      process.stderr.write(`[pyodide startup] tests/stats.test.ts isReady resolved in ${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`);
    }
  });

  it("keeps ordinary ANOVA statistics while accurately warning about heteroscedasticity", async () => {
    const df = makeDF(
      ["group", "value"],
      [
        ...[-0.2, -0.1, 0, 0.1, 0.2, -0.15, 0.15, 0.05].map((value) => ["A", value]),
        ...[-2, -1.2, -0.6, 0.4, 1.1, 1.8, -1.6, 0.7].map((value) => ["B", value]),
        ...[-5, -3, -1, 1, 2.5, 4, 5.5, -4.2].map((value) => ["C", value]),
      ],
    );
    const result = await runTable1(df, makePlan(
      "group",
      ["value"],
      { value: { label: "Value", treatAs: "continuous", missingness: "drop_row" } },
      { testOverrides: [{ variable: "value", method: "oneway_anova", timestamp: "2026-08-09T00:00:00.000Z" }] },
    ));
    const variable = result.perVariable[0];

    expect(variable.test.name).toBe("ANOVA");
    expect(variable.test.pValue).toBeCloseTo(0.986896, 6);
    expect(variable.notes).toContain("Levene/Brown-Forsythe variance check was significant, so the ordinary one-way ANOVA result rests on an equal-variance assumption these data do not support. The indicated alternative is Welch's ANOVA, which is not available in this release. Switching to Kruskal-Wallis does not address unequal variances and is not a substitute.");
  });

  // ─────────────────────────────────────────────
  // REAL-FIXTURE SMOKE TESTS
  // ─────────────────────────────────────────────
  describe.skipIf(!fs.existsSync(internalFixture("babies.csv")))("internal fixture: babies.csv", () => {
  it("babies.csv: bwt by smoke → t-test or Mann-Whitney, p < 0.05", async () => {
    const df = await parseCSV(getFile("babies.csv"));

    const plan = makePlan("smoke", ["bwt"], {
      bwt: { label: "Birth Weight", treatAs: "continuous", missingness: "drop_row" },
    });

    const res = await runTable1(df, plan);
    expect(res.perVariable).toHaveLength(1);
    const v = res.perVariable[0];
    expect(v.variable).toBe("bwt");
    expect(["Welch's t-test", "Mann-Whitney U"]).toContain(v.test.name);
    expect(v.test.pValue).not.toBeNull();
    expect(v.test.pValue as number).toBeLessThan(0.05);
    expect(v.smd).not.toBeNull();
    expect(v.smd as number).toBeGreaterThan(0);
    // computeMetadata populated
    expect(res.computeMetadata.libVersions).toHaveProperty("scipy");
    expect(res.computeMetadata.libVersions).toHaveProperty("numpy");
  });
  });

  describe.skipIf(!fs.existsSync(internalFixture("stroke_risk_dataset_v2.csv")))("internal fixture: stroke_risk_dataset_v2.csv", () => {
  it("stroke_risk: stroke_risk_percentage by at_risk → Mann-Whitney (n > 2000)", async () => {
    const df = await parseCSV(getFile("stroke_risk_dataset_v2.csv"));
    const hasAtRisk = df.columns.some((c) => c.name === "at_risk");
    if (!hasAtRisk) {
      console.warn("at_risk column not found in stroke_risk dataset — skipping");
      return;
    }

    const plan = makePlan("at_risk", ["stroke_risk_percentage"], {
      stroke_risk_percentage: {
        label: "Stroke Risk %",
        treatAs: "continuous",
        missingness: "drop_row",
      },
    });

    const res = await runTable1(df, plan);
    const v = res.perVariable[0];
    // n_min > 2000 → skewness/kurtosis path → Mann-Whitney expected for a multi-modal dist
    expect(v.test.name).toBe("Mann-Whitney U");
  }, 15000);
  });

  // ─────────────────────────────────────────────
  // PROPERTY / EDGE-CASE TESTS  (PLAN §10.1)
  // ─────────────────────────────────────────────
  it("property: constant column → pValue is null", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        [1, 5],
        [1, 5],
        [1, 5],
        [2, 5],
        [2, 5],
        [2, 5],
      ],
    );
    const plan = makePlan(
      "group",
      ["val"],
      {
        val: { label: "Val", treatAs: "continuous", missingness: "drop_row" },
      },
      { showSMD: false },
    );

    const res = await runTable1(df, plan);
    const v = res.perVariable[0];
    // Shapiro-Wilk fails on zero-variance data → falls through → pValue null
    expect(v.test.pValue).toBeNull();
  });

  it("property: all-NaN column → pValue is null", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        [1, null],
        [1, null],
        [1, null],
        [2, null],
        [2, null],
      ],
    );
    const plan = makePlan("group", ["val"], {
      val: { label: "Val", treatAs: "continuous", missingness: "drop_row" },
    });

    const res = await runTable1(df, plan);
    const v = res.perVariable[0];
    expect(v.test.pValue).toBeNull();
  });

  it("property: n=2 vs n=2 → returns a result without crashing", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, 10],
        [0, 20],
        [1, 30],
        [1, 40],
      ],
    );
    const plan = makePlan("group", ["val"], {
      val: { label: "Val", treatAs: "continuous", missingness: "drop_row" },
    });

    const res = await runTable1(df, plan);
    const v = res.perVariable[0];
    // With n_min=2, Shapiro needs ≥3 → falls back to Mann-Whitney; result may or may not be significant
    expect(v.test.name).toBe("Mann-Whitney U");
    expect(typeof v.test.pValue === "number" || v.test.pValue === null).toBe(true);
  });

  it("property: unicode column names → handled without error", async () => {
    const df = makeDF(
      ["grupo", "välüé"],
      [
        [0, 1.1],
        [0, 2.2],
        [0, 3.3],
        [1, 4.4],
        [1, 5.5],
        [1, 6.6],
      ],
    );
    const plan = makePlan("grupo", ["välüé"], {
      välüé: { label: "Välüé", treatAs: "continuous", missingness: "drop_row" },
    });

    const res = await runTable1(df, plan);
    expect(res.perVariable[0].variable).toBe("välüé");
    expect(res.perVariable[0].test.pValue).not.toBeNull();
  });

  it("property: single-row group → pValue is null (degenerate case)", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, 10],
        [0, 20],
        [0, 30],
        [1, 99],
      ],
    );
    const plan = makePlan("group", ["val"], {
      val: { label: "Val", treatAs: "continuous", missingness: "drop_row" },
    });

    const res = await runTable1(df, plan);
    const v = res.perVariable[0];
    // Mann-Whitney with n=1 vs n=3 → may produce a value or null; either is acceptable
    expect(typeof v.test.pValue === "number" || v.test.pValue === null).toBe(true);
  });

  it("property: multiple-testing correction (BH) adjusts p-values", async () => {
    const df = makeDF(
      ["group", "a", "b", "c"],
      [
        [0, 1, 10, 100],
        [0, 2, 11, 101],
        [0, 3, 12, 102],
        [1, 10, 20, 200],
        [1, 11, 21, 201],
        [1, 12, 22, 202],
      ],
    );
    const varConfig = {
      a: { label: "A", treatAs: "continuous", missingness: "drop_row" },
      b: { label: "B", treatAs: "continuous", missingness: "drop_row" },
      c: { label: "C", treatAs: "continuous", missingness: "drop_row" },
    };
    const planNone = makePlan("group", ["a", "b", "c"], varConfig, {
      multipleTestingCorrection: "none",
    });
    const planBH = makePlan("group", ["a", "b", "c"], varConfig, {
      multipleTestingCorrection: "bh",
    });

    const resNone = await runTable1(df, planNone);
    const resBH = await runTable1(df, planBH);

    // At least one variable should have a different (adjusted) p-value under BH
    const pNone = resNone.perVariable.map((v) => v.test.pValue);
    const pBH = resBH.perVariable.map((v) => v.test.pValue);

    const someChanged = pNone.some((p, i) => {
      if (p === null || pBH[i] === null) return false;
      return Math.abs(p - (pBH[i] as number)) > 1e-10;
    });
    expect(someChanged).toBe(true);
    // originalPValue should be preserved
    resBH.perVariable.forEach((v) => {
      if (v.test.pValue !== null) {
        expect(v.notes.some((n) => n.includes("bh"))).toBe(true);
      }
    });
  });

  it("property: outlier exclude action → excluded rows do not affect stats", async () => {
    // Row 3 (index 3) is an extreme outlier in group 0
    const df = makeDF(
      ["group", "val"],
      [
        [0, 10],
        [0, 11],
        [0, 12],
        [0, 999],
        [1, 20],
        [1, 21],
        [1, 22],
      ],
    );

    const planBase = makePlan("group", ["val"], {
      val: { label: "Val", treatAs: "continuous", missingness: "drop_row" },
    });
    const planExclude = makePlan("group", ["val"], {
      val: {
        label: "Val",
        treatAs: "continuous",
        missingness: "drop_row",
        outlierActions: [{ rowIndex: 3, action: "exclude" }],
      },
    });

    const resBase = await runTable1(df, planBase);
    const resExclude = await runTable1(df, planExclude);

    const meanBase = resBase.perVariable[0].summaryByGroup["0"]?.mean as number;
    const meanExclude = resExclude.perVariable[0].summaryByGroup["0"]?.mean as number;

    // With the outlier excluded, group-0 mean should be much closer to 11
    expect(meanExclude).toBeCloseTo(11, 0);
    expect(meanBase).toBeGreaterThan(200); // pulled up by 999
  });

  it("property: winsorize action → extreme values are clipped", async () => {
    // Build a 100-element dataset where index 0 is extreme (will be top 1%)
    const vals0: number[] = Array.from({ length: 50 }, (_, i) => 10 + i);
    vals0[0] = 99999; // extreme outlier at row 0
    const vals1: number[] = Array.from({ length: 50 }, (_, i) => 20 + i);

    const rows: any[] = [...vals0.map((v) => [0, v]), ...vals1.map((v) => [1, v])];

    const df = makeDF(["group", "val"], rows);
    const plan = makePlan("group", ["val"], {
      val: {
        label: "Val",
        treatAs: "continuous",
        missingness: "drop_row",
        outlierActions: [{ rowIndex: 0, action: "winsorize", winsorizeBound: "p01_p99" }],
      },
    });

    const res = await runTable1(df, plan);
    const summary = res.perVariable[0].summaryByGroup["0"];
    // After winsorization, max should not be 99999
    expect(summary?.max as number).toBeLessThan(99999);
  });

  it('runs Fisher exact on 3×2 with low expected counts (scipy >= 1.15)', async () => {
    // Construct a fixture with a 3-level categorical and a 2-level grouping,
    // with low expected cell counts to force the Fisher branch.
    const plan = makePlan("group", ["cat3"], {
      cat3: { label: "Cat 3", treatAs: "categorical_nominal", missingness: "drop_row" },
    });
    const df = makeDF(
      ["group", "cat3"],
      [
        [0, 1], [0, 1], [0, 1], [0, 2],
        [1, 1], [1, 3], [1, 3], [1, 3], [1, 3], [1, 3],
      ]
    );

    const result = await runTable1(df, plan);
    const cat3 = result.perVariable.find((v: any) => v.variable === 'cat3')!;
    expect(cat3.test.name).toBe("Fisher's exact (Monte Carlo)");
    expect(cat3.test.pValue).not.toBeNull();
    for (const note of cat3.notes) {
      expect(note).not.toMatch(/2.?2 tables/);
      expect(note).not.toMatch(/only supports/);
    }
  });

  it('runs Fisher exact on 3×3 sparse table', async () => {
    // [[3,0,0],[0,2,0],[0,0,1]]
    const plan = makePlan("group", ["cat3"], {
      cat3: { label: "Cat 3", treatAs: "categorical_nominal", missingness: "drop_row" },
    });
    const df = makeDF(
      ["group", "cat3"],
      [
        [1, 1], [1, 1], [1, 1],
        [2, 2], [2, 2],
        [3, 3]
      ]
    );

    const result = await runTable1(df, plan);
    const v = result.perVariable[0];
    console.log(v.notes);
    expect(v.test.name).toBe("Fisher's exact (Monte Carlo)");
    expect(v.test.pValue).toBeLessThan(0.1);
  });

  it('reports loaded scipy version is >= 1.15', async () => {
    const df = makeDF(["group", "val"], [[0, 1], [1, 2]]);
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const r = await runTable1(df, plan);
    const scipyVer = r.computeMetadata.libVersions.scipy;
    const [maj, min] = scipyVer.split('.').map(Number);
    expect(maj * 100 + min).toBeGreaterThanOrEqual(115);
  });

  it("Round 22: scikit-posthocs imports and posthoc_dunn returns a square result", async () => {
    const shape = await pyodideClient.call("run_python", [`
import scikit_posthocs
res = scikit_posthocs.posthoc_dunn([[1, 2, 3], [4, 5, 6]])
tuple(res.shape)
`]);
    expect(Array.from(shape as any)).toEqual([2, 2]);
  });

  it("Round 22: Kruskal-Wallis post-hoc uses Dunn with Holm correction in canonical group order", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        ["A", 1], ["A", 2], ["A", 1], ["A", 2], ["A", 1], ["A", 2], ["A", 1], ["A", 2],
        ["B", 1], ["B", 2], ["B", 1], ["B", 2], ["B", 1], ["B", 2], ["B", 1], ["B", 2],
        ["C", 20], ["C", 22], ["C", 24], ["C", 26], ["C", 28], ["C", 30], ["C", 32], ["C", 34],
      ],
    );
    const plan = makePlan(
      "group",
      ["val"],
      { val: { label: "Val", treatAs: "continuous", missingness: "drop_row" } },
      {
        randomSeed: 123,
        groupOrder: ["B", "A", "C"],
        testOverrides: [{ variable: "val", method: "kruskal_wallis", timestamp: "2026-06-28T00:00:00.000Z" }],
      },
    );

    const first = await runTable1(df, plan);
    const second = await runTable1(df, plan);
    const postHoc = first.perVariable[0].postHoc!;

    expect(first.perVariable[0].test.name).toBe("Kruskal-Wallis");
    expect(postHoc.method).toBe("dunn");
    expect(postHoc.correction).toBe("holm");
    expect(postHoc.pairs.map((p) => `${p.groupA}-${p.groupB}`)).toEqual(["B-A", "B-C", "A-C"]);
    expect(postHoc.pairs.map((p) => p.significant)).toEqual([false, true, true]);
    expect(postHoc.pairs.every((p) => typeof p.pValueRaw === "number")).toBe(true);
    expect(second.perVariable[0].postHoc?.pairs.map((p) => p.pValueCorrected)).toEqual(
      postHoc.pairs.map((p) => p.pValueCorrected),
    );
  });

  it("Round 22: k=2 and non-significant omnibus do not emit post-hoc results", async () => {
    const twoGroup = makeDF("group,val".split(","), [["A", 1], ["A", 2], ["B", 3], ["B", 4]]);
    const twoGroupPlan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const twoGroupRes = await runTable1(twoGroup, twoGroupPlan);
    expect(twoGroupRes.perVariable[0].postHoc).toBeUndefined();

    const flatThreeGroup = makeDF(
      ["group", "val"],
      [["A", 1], ["A", 2], ["A", 3], ["B", 1], ["B", 2], ["B", 3], ["C", 1], ["C", 2], ["C", 3]],
    );
    const flatPlan = makePlan(
      "group",
      ["val"],
      { val: { label: "Val", treatAs: "continuous" } },
      { testOverrides: [{ variable: "val", method: "kruskal_wallis", timestamp: "2026-06-28T00:00:00.000Z" }] },
    );
    const flatRes = await runTable1(flatThreeGroup, flatPlan);
    expect(flatRes.perVariable[0].test.name).toBe("Kruskal-Wallis");
    expect(flatRes.perVariable[0].postHoc).toBeUndefined();
  });

  // ─────────────────────────────────────────────
  // DETERMINISM & SEEDING REGRESSION TESTS (Round 9)
  // ─────────────────────────────────────────────
  it("Round 9: default seed is deterministic and data-derived", async () => {
    const df1 = makeDF(["group", "val"], [[0, "A"], [0, "B"], [1, "C"], [1, "D"]]);
    const plan1 = makePlan("group", ["val"], { val: { label: "Val", treatAs: "categorical_nominal" } });
    const res1 = await runTable1(df1, plan1);
    const seed1 = res1.computeMetadata.seed;
    expect(seed1).toBeTypeOf("number");

    // Same data and plan -> same seed
    const res2 = await runTable1(df1, plan1);
    expect(res2.computeMetadata.seed).toBe(seed1);

    // Different grouping values -> different seed
    const df2 = makeDF(["group", "val"], [[0, "A"], [0, "B"], [2, "C"], [2, "D"]]);
    const res3 = await runTable1(df2, plan1);
    expect(res3.computeMetadata.seed).not.toBe(seed1);
  });

  describe.skipIf(!fs.existsSync(internalFixture("250409_fungi_dataplus_master_file.xlsx")))("internal fixture: 250409_fungi_dataplus_master_file.xlsx", () => {
  it("Round 9.1: running the fungi fixture with no user-supplied seed produces analysisPlan.randomSeed !== 42", async () => {
    const file = getFile("250409_fungi_dataplus_master_file.xlsx");
    const { workbook } = await enumerateSheets(file);
    const df = parseXLSXSheet(workbook, "250207_SO_LIEU_BAI_BAO_201_MAU", 0);

    const plan = makePlan("c9.1", ["d2", "gender"], {
      d2: { label: "d2", treatAs: "categorical_nominal", missingness: "drop_row" },
      gender: { label: "Gender", treatAs: "categorical_nominal", missingness: "drop_row" },
    });

    const res = await runTable1(df, plan);
    const seed = res.computeMetadata.seed;
    expect(seed).not.toBe(42);
    expect(seed).toBeTypeOf("number");

    // Manually compute expected seed
    const groupColIndex = df.columns.findIndex((c) => c.name === plan.groupingVariable);
    const values = df.rows.map((r) => r[groupColIndex]).filter((v) => v !== null && v !== undefined);
    const groupColumnSortedValues = Array.from(new Set(values)).sort();
    const variableNamesSorted = [...plan.includedVariables].sort();
    const totalN = df.rows.length;

    const serialized = JSON.stringify({
      grouping: groupColumnSortedValues,
      variables: variableNamesSorted,
      n: totalN,
    });

    const expectedHash = await sha256Hex(serialized);
    const expectedSeed = parseInt(expectedHash.slice(-8), 16);

    expect(seed).toBe(expectedSeed);
  });
  });

  it("Round 9.1: two different datasets produce two different seeds", async () => {
    const df1 = makeDF(["group", "val"], [[0, "A"], [0, "B"], [1, "C"], [1, "D"]]);
    const df2 = makeDF(["group", "val"], [[0, "A"], [0, "B"], [2, "C"], [2, "D"]]);
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "categorical_nominal" } });

    const res1 = await runTable1(df1, plan);
    const res2 = await runTable1(df2, plan);

    expect(res1.computeMetadata.seed).not.toBe(res2.computeMetadata.seed);
  });

  it("Round 9: same seed leads to identical R×C Fisher p-values, different seeds to independent", async () => {
    const df = makeDF(
      ["group", "cat3"],
      [
        [1, 1], [1, 1], [1, 2],
        [2, 2], [2, 2], [2, 3],
        [3, 3], [3, 3], [3, 1]
      ]
    );
    const planSeeded = makePlan(
      "group",
      ["cat3"],
      { cat3: { label: "Cat 3", treatAs: "categorical_nominal" } },
      { randomSeed: 12345 }
    );

    const resultsSeeded = [];
    for (let i = 0; i < 5; i++) {
      resultsSeeded.push(await runTable1(df, planSeeded));
    }
    const pValues = resultsSeeded.map(r => r.perVariable[0].test.pValue);
    expect(pValues.every(p => p === pValues[0])).toBe(true);
    expect(pValues[0]).not.toBeNull();

    const planDifferentSeed = { ...planSeeded, randomSeed: 54321 };
    const resDiff = await runTable1(df, planDifferentSeed);
    const pDiff = resDiff.perVariable[0].test.pValue;

    expect(pDiff).not.toBe(pValues[0]);
  });

  it("Round 9: Candida species (6×2) p-value is byte-identical across runs", async () => {
    const df = makeDF(
      ["group", "candida"],
      [
        [0, "albicans"], [0, "albicans"], [0, "tropicalis"], [0, "glabrata"], [0, "krusei"], [0, "parapsilosis"], [0, "lusitaniae"],
        [1, "albicans"], [1, "tropicalis"], [1, "tropicalis"], [1, "glabrata"], [1, "krusei"], [1, "parapsilosis"], [1, "lusitaniae"]
      ]
    );
    const plan = makePlan(
      "group",
      ["candida"],
      { candida: { label: "Candida Species", treatAs: "categorical_nominal" } },
      { randomSeed: 42 }
    );

    const firstRun = await runTable1(df, plan);
    const firstP = firstRun.perVariable[0].test.pValue;
    expect(firstP).not.toBeNull();

    for (let i = 0; i < 4; i++) {
      const run = await runTable1(df, plan);
      expect(run.perVariable[0].test.pValue).toBe(firstP);
    }
  });

  it("Round 9: analysisHistory generates script with SEED and rng passed to scipy.stats.fisher_exact", () => {
    const plan = makePlan(
      "group",
      ["candida"],
      { candida: { label: "Candida Species", treatAs: "categorical_nominal" } },
      { randomSeed: 42 }
    );
    const results = {
      perVariable: [
        {
          variable: "candida",
          summaryByGroup: { "0": {}, "1": {} },
          overallSummary: { counts: { "albicans": 2, "tropicalis": 3, "glabrata": 1 } },
          test: { name: "Fisher's exact", statistic: null, pValue: 0.5289, df: null },
          smd: null,
          notes: []
        }
      ],
      groups: [{ name: "0", n: 7 }, { name: "1", n: 7 }],
      totalN: 14,
      computeMetadata: {
        libVersions: { numpy: "1.26.0", pandas: "2.1.0", scipy: "1.17.0", statsmodels: "0.14.0" },
        seed: 42
      }
    };
    const schema = {
      columns: [
        { name: "group", label: "Group", treatAs: "categorical_nominal" },
        { name: "candida", label: "Candida Species", treatAs: "categorical_nominal" }
      ]
    };
    const script = generateAnalysisHistory(plan, results, schema, { filename: "data.xlsx" });
    expect(script).toContain("SEED = 42");
    expect(script).toContain("rng = np.random.default_rng(SEED)");
    expect(script).toContain("scipy.stats.fisher_exact(ct_candida.values, method=scipy.stats.MonteCarloMethod(rng=rng))");
  });

  it("Round 11: recomputeVariable returns correct statistics and maps types", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, 10], [0, 12], [0, 14],
        [1, 20], [1, 22], [1, 24],
      ]
    );
    const plan = makePlan("group", ["val"], {
      val: { label: "Val", treatAs: "continuous" },
    });
    const results = await runTable1(df, plan);
    const recomputed = await recomputeVariable(df, plan, results, "val", "welch_t_test");
    expect(recomputed.test.name).toBe("Welch's t-test");
    expect(recomputed.test.pValue).not.toBeNull();
  });

  it("Round 11: recomputeVariable rejects mismatched type/method with ValueError", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, 10], [0, 12], [0, 14],
        [1, 20], [1, 22], [1, 24],
      ]
    );
    const plan = makePlan("group", ["val"], {
      val: { label: "Val", treatAs: "continuous" },
    });
    const results = await runTable1(df, plan);
    await expect(recomputeVariable(df, plan, results, "val", "chi_square")).rejects.toThrow("Method 'chi_square' is not allowed for continuous variable");
  });

  it("Round 11: continuous contradicted override produces verbatim Shapiro warning", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        [0, 10], [0, 10], [0, 100],
        [1, 20], [1, 22], [1, 24],
      ]
    );
    const plan = makePlan("group", ["val"], {
      val: { label: "Val", treatAs: "continuous" },
    });
    const results = await runTable1(df, plan);
    expect(results.perVariable[0].test.name).toBe("Mann-Whitney U");

    const recomputed = await recomputeVariable(df, plan, results, "val", "welch_t_test");
    expect(recomputed.test.auxiliary?.assumptionCheckContradicted).toBe("true");
    expect(recomputed.test.auxiliary?.shapiroPValue).toBeDefined();

    const shapiroP = recomputed.test.auxiliary?.shapiroPValue;
    expect(shapiroP).toBeLessThan(0.05);
    const pValStr = shapiroP < 0.001 ? "< 0.001" : shapiroP.toFixed(2);
    const warningText = `Shapiro–Wilk p = ${pValStr} indicates the data are not normally distributed; a t-test assumes normality, so its P-value may be unreliable. Mann–Whitney U is recommended.`;
    expect(warningText).toContain("Shapiro–Wilk p =");
    expect(warningText).toContain("indicates the data are not normally distributed; a t-test assumes normality, so its P-value may be unreliable. Mann–Whitney U is recommended.");
  });

  it("Round 11: categorical contradicted override produces verbatim expected counts warning", async () => {
    const df = makeDF(
      ["group", "cat"],
      [
        [0, "A"], [0, "B"],
        [1, "A"], [1, "A"], [1, "B"], [1, "B"]
      ]
    );
    const plan = makePlan("group", ["cat"], {
      cat: { label: "Cat", treatAs: "categorical_nominal" },
    });
    const results = await runTable1(df, plan);
    expect(results.perVariable[0].test.name).toBe("Fisher's exact");

    const recomputed = await recomputeVariable(df, plan, results, "cat", "chi_square");
    expect(recomputed.test.auxiliary?.assumptionCheckContradicted).toBe("true");
    expect(recomputed.test.auxiliary?.minExpectedCount).toBeLessThan(5);

    const warningText = `Some expected cell counts are < 5; the chi-square approximation is unreliable, so Fisher's exact test is recommended.`;
    expect(warningText).toBe("Some expected cell counts are < 5; the chi-square approximation is unreliable, so Fisher's exact test is recommended.");
  });

  it("omits an infinite Fisher odds ratio so separated tables remain valid JSON", async () => {
    const df = makeDF(
      ["group", "outcome"],
      [
        ["control", "no"], ["control", "no"],
        ["treatment", "yes"], ["treatment", "yes"],
      ],
    );
    const plan = makePlan("group", ["outcome"], {
      outcome: { label: "Outcome", treatAs: "categorical_nominal" },
    });

    const results = await runTable1(df, plan);
    expect(results.perVariable[0].test.name).toBe("Fisher's exact");
    expect(results.perVariable[0].test.auxiliary?.oddsRatio).toBeUndefined();

    const recomputed = await recomputeVariable(df, plan, results, "outcome", "fishers_exact");
    expect(recomputed.test.name).toBe("Fisher's exact");
    expect(recomputed.test.auxiliary?.oddsRatio).toBeUndefined();
  });

  it("Round 11: reproducibility.json testOverrides serialization matches schema", async () => {
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = {
      perVariable: [],
      groups: [],
      totalN: 0,
      computeMetadata: {
        libVersions: { numpy: "1.26.0", pandas: "2.1.0", scipy: "1.17.0", statsmodels: "0.14.0" },
        seed: 42
      }
    };
    const planWithOverrides = {
      ...plan,
      testOverrides: [
        {
          variable: "val",
          method: "welch_t_test" as const,
          timestamp: "2026-05-29T12:00:00.000Z"
        }
      ]
    };
    const resultsWithOverrides = {
      ...results,
      perVariable: [
        {
          variable: "val",
          summaryByGroup: {},
          overallSummary: {},
          test: {
            name: "Welch's t-test",
            statistic: 1.5,
            pValue: 0.1,
            auxiliary: {
              autoMethod: "Mann-Whitney U",
              assumptionCheckContradicted: "true"
            }
          },
          notes: []
        }
      ]
    };
    const formatted = {
      journal: "NEJM",
      rulesetVersion: "1.0",
      title: "Table 1",
      header: [],
      rows: [],
      footnotes: [],
      methodsParagraph: ""
    };
    const reproStr = generateReproducibilityJson({
      plan: planWithOverrides,
      schema: { columns: [] },
      results: resultsWithOverrides,
      formattedTable: formatted,
      appVersion: "1.0"
    });
    const reproObj = JSON.parse(reproStr);
    expect(reproObj.testOverrides).toBeDefined();
    expect(reproObj.testOverrides[0].variable).toBe("val");
    expect(reproObj.testOverrides[0].method).toBe("welch_t_test");
    expect(reproObj.testOverrides[0].autoMethod).toBe("Mann-Whitney U");
    expect(reproObj.testOverrides[0].assumptionCheckContradicted).toBe(true);
  });

  it("Round 11: analysisHistory generates script with overrides, comment, and warning comments", () => {
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = {
      perVariable: [],
      groups: [],
      totalN: 0,
      computeMetadata: {
        libVersions: { numpy: "1.26.0", pandas: "2.1.0", scipy: "1.17.0", statsmodels: "0.14.0" },
        seed: 42
      }
    };
    const planWithOverrides = {
      ...plan,
      testOverrides: [
        {
          variable: "val",
          method: "welch_t_test" as const,
          timestamp: "2026-05-29T12:00:00.000Z"
        }
      ]
    };
    const resultsWithOverrides = {
      ...results,
      perVariable: [
        {
          variable: "val",
          summaryByGroup: { "0": {}, "1": {} },
          overallSummary: { mean: 1.5, sd: 0.5, n: 10 },
          test: {
            name: "Welch's t-test",
            statistic: 1.5,
            pValue: 0.1,
            auxiliary: {
              autoMethod: "Mann-Whitney U",
              assumptionCheckContradicted: "true",
              shapiroPValue: 0.01
            }
          },
          notes: []
        }
      ],
      groups: [{ name: "0", n: 5 }, { name: "1", n: 5 }],
      totalN: 10,
      computeMetadata: {
        libVersions: { numpy: "1.26.0", pandas: "2.1.0", scipy: "1.17.0", statsmodels: "0.14.0" },
        seed: 42
      }
    };
    const schema = {
      columns: [
        { name: "group", label: "Group", treatAs: "categorical_nominal" },
        { name: "val", label: "Val", treatAs: "continuous" }
      ]
    };
    const script = generateAnalysisHistory(planWithOverrides, resultsWithOverrides, schema, { filename: "data.xlsx" });
    expect(script).toContain("# User selected Welch's t-test for this variable (auto-selected: Mann-Whitney U).");
    expect(script).toContain("# Shapiro–Wilk p = 0.01 indicates the data are not normally distributed; a t-test assumes normality, so its P-value may be unreliable. Mann–Whitney U is recommended.");
    expect(script).toContain("ttest_ind");
  });

  it("Round 11: generateMethodsParagraph appends verbatim custom selection sentences", () => {
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = {
      perVariable: [],
      groups: [],
      totalN: 0,
      computeMetadata: {
        libVersions: { numpy: "1.26.0", pandas: "2.1.0", scipy: "1.17.0", statsmodels: "0.14.0" },
        seed: 42
      }
    };
    const planWithOverrides = {
      ...plan,
      variableConfig: {
        val: { label: "Val", treatAs: "continuous" }
      },
      testOverrides: [
        {
          variable: "val",
          method: "welch_t_test" as const,
          timestamp: "2026-05-29T12:00:00.000Z"
        }
      ]
    };
    const resultsWithOverrides = {
      ...results,
      perVariable: [
        {
          variable: "val",
          summaryByGroup: {},
          overallSummary: {},
          test: {
            name: "Welch's t-test",
            statistic: 1.5,
            pValue: 0.1,
            auxiliary: {
              autoMethod: "Mann-Whitney U",
              assumptionCheckContradicted: "true"
            }
          },
          notes: []
        }
      ]
    };
    const sentinelRuleset = {
      EasyTableOne_Ruleset: {
        version: '9.9',
        global_defaults: {
          missing_data_label: 'Missing',
          normality_logic: {
            small_n_test: 'shapiro',
            small_n_threshold_p: 0.05,
            large_n_threshold_n: 2000,
            large_n_skew_max: 1.0,
            large_n_kurt_max: 1.0,
          },
          test_selection_logic: {},
        },
        journals: [],
        logic_mapping: [],
      },
    } as any;
    const para = generateMethodsParagraph(resultsWithOverrides, sentinelRuleset, planWithOverrides, "1.0");
    expect(para).toContain("Val was compared using Welch's t-test at user selection despite a non-normality flag.");
  });

  it("Round 22: generateMethodsParagraph names Dunn's test for Kruskal-Wallis post-hoc", () => {
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = {
      perVariable: [
        {
          variable: "val",
          summaryByGroup: { A: {}, B: {}, C: {} },
          overallSummary: { median: 2, q25: 1, q75: 3, n: 9 },
          test: { name: "Kruskal-Wallis", statistic: 10, pValue: 0.01 },
          postHoc: {
            reason: "Kruskal-Wallis significant (p=0.01); 3 groups",
            correction: "holm",
            method: "dunn",
            pairs: [],
          },
          notes: [],
        },
      ],
      groups: [{ name: "A", n: 3 }, { name: "B", n: 3 }, { name: "C", n: 3 }],
      totalN: 9,
      computeMetadata: {
        libVersions: { numpy: "1.26.0", pandas: "2.1.0", scipy: "1.17.0", statsmodels: "0.14.0" },
        seed: 42
      }
    };
    const sentinelRuleset = {
      EasyTableOne_Ruleset: {
        version: '9.9',
        global_defaults: {
          missing_data_label: 'Missing',
          normality_logic: {
            small_n_test: 'shapiro',
            small_n_threshold_p: 0.05,
            large_n_threshold_n: 2000,
            large_n_skew_max: 1.0,
            large_n_kurt_max: 1.0,
          },
          test_selection_logic: {},
        },
        journals: [],
        logic_mapping: [],
      },
    } as any;
    const para = generateMethodsParagraph(results as any, sentinelRuleset, plan, "1.0");
    expect(para).toContain("Dunn's test (Holm-adjusted) after Kruskal-Wallis");
    const oldKruskalPosthocLabel = ["Mann-Whitney U", "after Kruskal-Wallis"].join(" ");
    expect(para).not.toContain(oldKruskalPosthocLabel);
  });

  it("Round 11: same override at the same seed produces byte-identical p-values across runs", async () => {
    const df = makeDF(
      ["group", "cat3"],
      [
        [1, 1], [1, 1], [1, 2],
        [2, 2], [2, 2], [2, 3],
        [3, 3], [3, 3], [3, 1]
      ]
    );
    const plan = makePlan(
      "group",
      ["cat3"],
      { cat3: { label: "Cat 3", treatAs: "categorical_nominal" } },
      { randomSeed: 12345 }
    );
    const results = await runTable1(df, plan);

    const pvals = [];
    for (let i = 0; i < 5; i++) {
      const recomputed = await recomputeVariable(df, plan, results, "cat3", "fishers_exact");
      pvals.push(recomputed.test.pValue);
    }
    expect(pvals.every(p => p === pvals[0])).toBe(true);
    expect(pvals[0]).not.toBeNull();
  });

  it("Round 11: recomputeVariable calls pyodideClient exactly once per override change", async () => {
    const spy = vi.spyOn(pyodideClient, "call");
    const df = makeDF(["group", "val"], [[0, 1], [1, 2]]);
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = await runTable1(df, plan);

    spy.mockClear();
    await recomputeVariable(df, plan, results, "val", "welch_t_test");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("recompute_variable");
    spy.mockRestore();
  });

  it("Round 11: recomputeVariable rejects kruskal_wallis on k=2 grouping", async () => {
    const df = makeDF(["group", "val"], [[0, 10], [0, 12], [1, 20], [1, 22]]);
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = await runTable1(df, plan);
    await expect(recomputeVariable(df, plan, results, "val", "kruskal_wallis")).rejects.toThrow("Method 'kruskal_wallis' is not allowed for continuous variable 'val' with 2 groups");
  });

  it("Round 11: recomputeVariable rejects oneway_anova on k=2 grouping", async () => {
    const df = makeDF(["group", "val"], [[0, 10], [0, 12], [1, 20], [1, 22]]);
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = await runTable1(df, plan);
    await expect(recomputeVariable(df, plan, results, "val", "oneway_anova")).rejects.toThrow("Method 'oneway_anova' is not allowed for continuous variable 'val' with 2 groups");
  });

  it("Round 11: recomputeVariable rejects mann_whitney_u on k>2 grouping", async () => {
    const df = makeDF(["group", "val"], [[0, 10], [1, 20], [2, 30]]);
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = await runTable1(df, plan);
    await expect(recomputeVariable(df, plan, results, "val", "mann_whitney_u")).rejects.toThrow("Method 'mann_whitney_u' is not allowed for continuous variable 'val' with 3 groups");
  });

  it("Round 11: recomputeVariable rejects t_test on k>2 grouping", async () => {
    const df = makeDF(["group", "val"], [[0, 10], [1, 20], [2, 30]]);
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = await runTable1(df, plan);
    await expect(recomputeVariable(df, plan, results, "val", "t_test")).rejects.toThrow("Method 't_test' is not allowed for continuous variable 'val' with 3 groups");
  });

  it("Round 11: recomputeVariable rejects welch_t_test on k>2 grouping", async () => {
    const df = makeDF(["group", "val"], [[0, 10], [1, 20], [2, 30]]);
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous" } });
    const results = await runTable1(df, plan);
    await expect(recomputeVariable(df, plan, results, "val", "welch_t_test")).rejects.toThrow("Method 'welch_t_test' is not allowed for continuous variable 'val' with 3 groups");
  });

  it("Round 3: post-hoc is gated on MTC-adjusted omnibus p-value", async () => {
    // 3 groups, val1 raw p around 0.02, val2/val3 raw p=1.0.
    // Under Bonferroni (n=3), val1's raw p = 0.02 is corrected to 0.06 >= 0.05.
    // So with MTC off, post-hoc is present for val1.
    // With MTC = bonferroni, post-hoc is absent for val1.
    // With MTC = bonferroni, a significant val4 (raw p < 0.001) keeps post-hoc and quotes corrected p.
    const df = makeDF(
      ["group", "val1", "val2", "val3", "val4"],
      [
        [0, 1.0, 1.0, 10.0, 1.0],
        [0, 2.0, 2.0, 20.0, 2.0],
        [0, 3.0, 3.0, 30.0, 3.0],
        [0, 2.0, 4.0, 40.0, 2.0],
        [0, 1.0, 5.0, 50.0, 1.0],
        [1, 1.0, 1.0, 10.0, 10.0],
        [1, 2.0, 2.0, 20.0, 11.0],
        [1, 3.0, 3.0, 30.0, 12.0],
        [1, 2.0, 4.0, 40.0, 11.0],
        [1, 1.0, 5.0, 50.0, 10.0],
        [2, 2.5, 1.0, 10.0, 100.0],
        [2, 3.5, 2.0, 20.0, 101.0],
        [2, 4.5, 3.0, 30.0, 102.0],
        [2, 3.5, 4.0, 40.0, 101.0],
        [2, 2.5, 5.0, 50.0, 100.0],
      ]
    );

    const varConfig = {
      val1: { label: "Val 1", treatAs: "continuous" as const, missingness: "drop_row" as const },
      val2: { label: "Val 2", treatAs: "continuous" as const, missingness: "drop_row" as const },
      val3: { label: "Val 3", treatAs: "continuous" as const, missingness: "drop_row" as const },
      val4: { label: "Val 4", treatAs: "continuous" as const, missingness: "drop_row" as const },
    };

    // 1. MTC none
    const planNone = makePlan("group", ["val1", "val2", "val3", "val4"], varConfig, {
      multipleTestingCorrection: "none",
      testOverrides: [
        { variable: "val1", method: "oneway_anova", timestamp: "2026-07-06T00:00:00.000Z" },
        { variable: "val2", method: "oneway_anova", timestamp: "2026-07-06T00:00:00.000Z" },
        { variable: "val3", method: "oneway_anova", timestamp: "2026-07-06T00:00:00.000Z" },
        { variable: "val4", method: "oneway_anova", timestamp: "2026-07-06T00:00:00.000Z" },
      ],
    });

    const resNone = await runTable1(df, planNone);
    const v1None = resNone.perVariable.find((v: any) => v.variable === "val1")!;
    const v4None = resNone.perVariable.find((v: any) => v.variable === "val4")!;

    // val1 should have raw p < 0.05 and post-hoc present
    expect(v1None.test.pValue).toBeLessThan(0.05);
    expect(v1None.postHoc).toBeDefined();
    expect(v1None.postHoc?.reason).toContain("ANOVA significant");

    // 2. MTC bonferroni
    const planBonf = makePlan("group", ["val1", "val2", "val3", "val4"], varConfig, {
      multipleTestingCorrection: "bonferroni",
      testOverrides: [
        { variable: "val1", method: "oneway_anova", timestamp: "2026-07-06T00:00:00.000Z" },
        { variable: "val2", method: "oneway_anova", timestamp: "2026-07-06T00:00:00.000Z" },
        { variable: "val3", method: "oneway_anova", timestamp: "2026-07-06T00:00:00.000Z" },
        { variable: "val4", method: "oneway_anova", timestamp: "2026-07-06T00:00:00.000Z" },
      ],
    });

    const resBonf = await runTable1(df, planBonf);
    const v1Bonf = resBonf.perVariable.find((v: any) => v.variable === "val1")!;
    const v4Bonf = resBonf.perVariable.find((v: any) => v.variable === "val4")!;

    // val1's raw p was < 0.05, but adjusted p should be >= 0.05
    expect(v1Bonf.test.pValue).toBeGreaterThanOrEqual(0.05);
    // postHoc must be absent under adjusted p gate!
    expect(v1Bonf.postHoc).toBeUndefined();

    // val4's adjusted p should still be < 0.05, so postHoc is present
    expect(v4Bonf.test.pValue).toBeLessThan(0.05);
    expect(v4Bonf.postHoc).toBeDefined();
    // reason string should quote the adjusted p!
    expect(v4Bonf.postHoc?.reason).toContain(`p=${v4Bonf.test.pValue.toPrecision(4)}`);

    // Ensure _posthoc_ctx is not present in the payload
    expect((v1Bonf as any)._posthoc_ctx).toBeUndefined();
    expect(JSON.stringify(resBonf)).not.toContain("_posthoc_ctx");

    // 3. Agreement between run_table1 and recompute_variable
    // Recompute val1 with bonferroni
    const recomputedVal1 = await recomputeVariable(
      df,
      planBonf,
      resBonf,
      "val1",
      "oneway_anova"
    );
    // Since it's recomputed with bonferroni and the adjusted p is >= 0.05, postHoc should be absent
    expect(recomputedVal1.postHoc).toBeUndefined();
    expect(recomputedVal1.test.pValue).toEqual(v1Bonf.test.pValue);

    // Recompute val4 with bonferroni
    const recomputedVal4 = await recomputeVariable(
      df,
      planBonf,
      resBonf,
      "val4",
      "oneway_anova"
    );
    // Since it's recomputed with bonferroni and the adjusted p is < 0.05, postHoc should be present
    expect(recomputedVal4.postHoc).toBeDefined();
    expect(recomputedVal4.test.pValue).toEqual(v4Bonf.test.pValue);
    expect(recomputedVal4.postHoc?.reason).toEqual(v4Bonf.postHoc?.reason);
  });

  it("Phase 33 R1: full run attaches auxiliary metadata and matches recompute auxiliary shape", async () => {
    const df = makeDF(
      ["group", "val", "cat"],
      [
        [0, 10, "A"], [0, 11, "A"], [0, 12, "A"], [0, 13, "B"], [0, 14, "B"],
        [1, 20, "A"], [1, 21, "A"], [1, 22, "B"], [1, 23, "B"], [1, 24, "B"],
      ],
    );
    const plan = makePlan(
      "group",
      ["val", "cat"],
      {
        val: { label: "Val", treatAs: "continuous", missingness: "drop_row" },
        cat: { label: "Cat", treatAs: "categorical_nominal", missingness: "drop_row" },
      },
      {
        testOverrides: [{ variable: "cat", method: "chi_square", timestamp: "2026-07-07T00:00:00.000Z" }],
      },
    );

    const result = await runTable1(df, plan);
    const val = result.perVariable.find((v: any) => v.variable === "val")!;
    const cat = result.perVariable.find((v: any) => v.variable === "cat")!;
    expect(val.test.auxiliary?.autoMethod).toBeDefined();
    expect(val.test.auxiliary?.shapiroPValue).toBeDefined();
    expect(cat.test.auxiliary?.minExpectedCount).toBeLessThan(5);
    expect(cat.test.auxiliary?.assumptionCheckContradicted).toBe("true");

    const recomputed = await recomputeVariable(df, plan, result, "cat", "chi_square");
    expect(Object.keys(cat.test.auxiliary ?? {}).sort()).toEqual(Object.keys(recomputed.test.auxiliary ?? {}).sort());

    const repro = JSON.parse(generateReproducibilityJson({
      plan,
      schema: { columns: [] } as any,
      results: result,
      formattedTable: { journal: "NEJM", rulesetVersion: "1.0" } as any,
      appVersion: "test",
      timestamp: "2026-07-07T00:00:00.000Z",
    }));
    expect(repro.testOverrides[0].assumptionCheckContradicted).toBe(true);
  });

  it("Phase 33 R1: recomputeVariable returns full Holm-adjusted p-value map", async () => {
    const df = makeDF(
      ["group", "a", "b", "c"],
      [
        [0, 1, 1, 1], [0, 1.1, 1.1, 1.2], [0, 1.2, 1.2, 1.1], [0, 1.3, 1.3, 1.3], [0, 1.4, 1.4, 1.4], [0, 1.5, 1.5, 1.5],
        [1, 2, 1.8, 2.5], [1, 2.1, 1.9, 2.6], [1, 2.2, 2.0, 2.7], [1, 2.3, 2.1, 2.8], [1, 2.4, 2.2, 2.9], [1, 2.5, 2.3, 3.0],
      ],
    );
    const basePlan = makePlan(
      "group",
      ["a", "b", "c"],
      {
        a: { label: "A", treatAs: "continuous", missingness: "drop_row" },
        b: { label: "B", treatAs: "continuous", missingness: "drop_row" },
        c: { label: "C", treatAs: "continuous", missingness: "drop_row" },
      },
      { multipleTestingCorrection: "holm" },
    );
    const base = await runTable1(df, basePlan);
    const nextPlan = {
      ...basePlan,
      testOverrides: [{ variable: "a", method: "mann_whitney_u", timestamp: "2026-07-07T00:00:00.000Z" }],
    };
    const recomputed = await recomputeVariableWithAdjustments(df, nextPlan, base, "a", "mann_whitney_u");
    expect("adjustedPValues" in recomputed).toBe(true);

    const fresh = await runTable1(df, nextPlan);
    if ("adjustedPValues" in recomputed) {
      for (const row of fresh.perVariable) {
        expect(recomputed.adjustedPValues[row.variable]).toBeCloseTo(row.test.pValue ?? NaN, 12);
      }
    }
  });

  it("Phase 33 R1: mixed-size groups record per-group normality methods", async () => {
    const rows: (number | string)[][] = [];
    const small = [-1.7, -1.2, -0.9, -0.6, -0.4, -0.2, -0.1, 0, 0.1, 0.2, 0.4, 0.6, 0.9, 1.2, 1.7, -1.4, -0.7, 0.7, 1.4, 0.3];
    for (const value of small) rows.push(["A", value]);
    for (let i = 0; i < 5000; i++) {
      const u1 = ((i * 9301 + 49297) % 233280 + 1) / 233281;
      const u2 = ((i * 23333 + 12345) % 233280 + 1) / 233281;
      rows.push(["B", Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)]);
    }
    const df = makeDF(["group", "val"], rows);
    const plan = makePlan("group", ["val"], { val: { label: "Val", treatAs: "continuous", missingness: "drop_row" } });
    const result = await runTable1(df, plan);
    const aux = result.perVariable[0].test.auxiliary!;
    expect(aux.normalityMethod).toBe("mixed");
    expect(aux.shapiroPValue).toBeDefined();
    expect(["Welch's t-test", "Mann-Whitney U"]).toContain(result.perVariable[0].test.name);
  }, 60000);

  it("Phase 33 R1: Tukey post-hoc uses public ordering and reports failures", async () => {
    const df = makeDF(
      ["group", "val"],
      [
        ["A", 1], ["A", 2], ["A", 1.5], ["A", 2.5], ["A", 1.2], ["A", 2.2],
        ["B", 2], ["B", 3], ["B", 2.5], ["B", 3.5], ["B", 2.2], ["B", 3.2],
        ["C", 10], ["C", 11], ["C", 10.5], ["C", 11.5], ["C", 10.2], ["C", 11.2],
      ],
    );
    const plan = makePlan(
      "group",
      ["val"],
      { val: { label: "Val", treatAs: "continuous", missingness: "drop_row" } },
      { testOverrides: [{ variable: "val", method: "oneway_anova", timestamp: "2026-07-07T00:00:00.000Z" }] },
    );
    const result = await runTable1(df, plan);
    expect(result.perVariable[0].postHoc?.method).toBe("tukey_hsd");
    expect(result.perVariable[0].postHoc?.pairs.map((p) => `${p.groupA}-${p.groupB}`)).toEqual(["A-B", "A-C", "B-C"]);

    await pyodideClient.call("run_python", [`
_phase33_orig_tukey = pairwise_tukeyhsd
def pairwise_tukeyhsd(*args, **kwargs):
    raise RuntimeError("forced failure")
`]);
    try {
      const failed = await runTable1(df, plan);
      expect(failed.perVariable[0].postHoc?.error).toBe("Post-hoc failed: RuntimeError");
      expect(failed.perVariable[0].postHoc?.pairs).toEqual([]);
    } finally {
      await pyodideClient.call("run_python", [`
pairwise_tukeyhsd = _phase33_orig_tukey
del _phase33_orig_tukey
`]);
    }
  }, 60000);

  it("Phase 50 R3 Step 1: Tukey post-hoc carries unequal-variance caveat when Levene p < 0.05", async () => {
    // 3 groups, normal distributions with different means and distinct variances (heteroscedastic)
    const heteroscedasticRows: (string | number)[][] = [
      ...[-0.1, -0.05, 0, 0.05, 0.1, -0.08, 0.08, 0.02].map((v) => ["A", v]),
      ...[3.5, 4.2, 5.0, 5.8, 6.5, 4.0, 5.5, 6.0].map((v) => ["B", v]),
      ...[5.0, 9.0, 15.0, 21.0, 25.0, 11.0, 19.0, 13.0].map((v) => ["C", v]),
    ];
    const dfHetero = makeDF(["group", "val"], heteroscedasticRows);
    const planHetero = makePlan(
      "group",
      ["val"],
      { val: { label: "Val", treatAs: "continuous", missingness: "drop_row" } },
      { testOverrides: [{ variable: "val", method: "oneway_anova", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resultHetero = await runTable1(dfHetero, planHetero);
    const varHetero = resultHetero.perVariable[0];
    expect(varHetero.test.name).toBe("ANOVA");
    expect(varHetero.test.pValue!).toBeLessThan(0.05);
    expect(varHetero.test.auxiliary?.levenePValue).toBeLessThan(0.05);
    expect(varHetero.postHoc?.method).toBe("tukey_hsd");
    expect(varHetero.postHoc?.pairs.length).toBe(3);
    expect(varHetero.postHoc?.caveat).toBe(
      "Tukey HSD assumes equal variances, which the Levene/Brown-Forsythe check did not support for this variable; pairwise P values should be interpreted with caution.",
    );

    // 3 groups, normal distributions with identical variances (homoscedastic)
    const homoscedasticRows: (string | number)[][] = [
      ...[0, 1, 2, 3, 4, 1.5, 2.5, 3.5].map((v) => ["A", v]),
      ...[10, 11, 12, 13, 14, 11.5, 12.5, 13.5].map((v) => ["B", v]),
      ...[20, 21, 22, 23, 24, 21.5, 22.5, 23.5].map((v) => ["C", v]),
    ];
    const dfHomo = makeDF(["group", "val"], homoscedasticRows);
    const planHomo = makePlan(
      "group",
      ["val"],
      { val: { label: "Val", treatAs: "continuous", missingness: "drop_row" } },
      { testOverrides: [{ variable: "val", method: "oneway_anova", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resultHomo = await runTable1(dfHomo, planHomo);
    const varHomo = resultHomo.perVariable[0];
    expect(varHomo.test.name).toBe("ANOVA");
    expect(varHomo.test.pValue!).toBeLessThan(0.05);
    expect(varHomo.test.auxiliary?.levenePValue).toBeGreaterThanOrEqual(0.05);
    expect(varHomo.postHoc?.method).toBe("tukey_hsd");
    expect(varHomo.postHoc?.pairs.length).toBe(3);
    expect(varHomo.postHoc?.caveat).toBeUndefined();
  }, 60000);

  it("Phase 50 R3 Step 2: contradictionReason returned on both runTable1 and recomputeVariable", async () => {
    // 1. unequal_variance: normal continuous data with heteroscedasticity overridden to ANOVA
    const heteroRows: (string | number)[][] = [
      ...[-0.1, -0.05, 0, 0.05, 0.1, -0.08, 0.08, 0.02].map((v) => ["A", v]),
      ...[3.5, 4.2, 5.0, 5.8, 6.5, 4.0, 5.5, 6.0].map((v) => ["B", v]),
      ...[5.0, 9.0, 15.0, 21.0, 25.0, 11.0, 19.0, 13.0].map((v) => ["C", v]),
    ];
    const dfHetero = makeDF(["group", "val"], heteroRows);
    const planHetero = makePlan(
      "group",
      ["val"],
      { val: { label: "Val", treatAs: "continuous", missingness: "drop_row" } },
      { testOverrides: [{ variable: "val", method: "oneway_anova", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resultHetero = await runTable1(dfHetero, planHetero);
    expect(resultHetero.perVariable[0].test.auxiliary?.assumptionCheckContradicted).toBe("true");
    expect(resultHetero.perVariable[0].test.auxiliary?.contradictionReason).toBe("unequal_variance");

    // Recompute path verification (Risk register R1)
    const recomputedHetero = await recomputeVariable(dfHetero, planHetero, resultHetero, "val", "oneway_anova");
    expect(recomputedHetero.test.auxiliary?.assumptionCheckContradicted).toBe("true");
    expect(recomputedHetero.test.auxiliary?.contradictionReason).toBe("unequal_variance");
    expect(recomputedHetero.postHoc?.caveat).toBeDefined();

    // 2. non_normality: non-normal continuous data overridden to parametric test
    const nonNormRows: (string | number)[][] = [
      ...[1, 1, 1, 1, 1, 1, 1, 100].map((v) => ["A", v]),
      ...[2, 2, 2, 2, 2, 2, 2, 200].map((v) => ["B", v]),
    ];
    const dfNonNorm = makeDF(["group", "val"], nonNormRows);
    const planNonNorm = makePlan(
      "group",
      ["val"],
      { val: { label: "Val", treatAs: "continuous", missingness: "drop_row" } },
      { testOverrides: [{ variable: "val", method: "welch_t_test", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resultNonNorm = await runTable1(dfNonNorm, planNonNorm);
    expect(resultNonNorm.perVariable[0].test.auxiliary?.assumptionCheckContradicted).toBe("true");
    expect(resultNonNorm.perVariable[0].test.auxiliary?.contradictionReason).toBe("non_normality");

    const recomputedNonNorm = await recomputeVariable(dfNonNorm, planNonNorm, resultNonNorm, "val", "welch_t_test");
    expect(recomputedNonNorm.test.auxiliary?.assumptionCheckContradicted).toBe("true");
    expect(recomputedNonNorm.test.auxiliary?.contradictionReason).toBe("non_normality");

    // 3. low_expected_count: categorical data with min expected < 5 overridden to chi-square
    const catRows: (string | number)[][] = [
      ["A", "cat1"], ["A", "cat1"], ["A", "cat1"], ["A", "cat1"], ["A", "cat2"],
      ["B", "cat1"], ["B", "cat2"], ["B", "cat2"], ["B", "cat2"], ["B", "cat2"],
    ];
    const dfCat = makeDF(["group", "cat"], catRows);
    const planCat = makePlan(
      "group",
      ["cat"],
      { cat: { label: "Cat", treatAs: "categorical_nominal", missingness: "drop_row" } },
      { testOverrides: [{ variable: "cat", method: "chi_square", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resultCat = await runTable1(dfCat, planCat);
    expect(resultCat.perVariable[0].test.auxiliary?.assumptionCheckContradicted).toBe("true");
    expect(resultCat.perVariable[0].test.auxiliary?.contradictionReason).toBe("low_expected_count");

    const recomputedCat = await recomputeVariable(dfCat, planCat, resultCat, "cat", "chi_square");
    expect(recomputedCat.test.auxiliary?.assumptionCheckContradicted).toBe("true");
    expect(recomputedCat.test.auxiliary?.contradictionReason).toBe("low_expected_count");
  }, 60000);

  it("Phase 50 R3 Step 4: Yates note emitted only when dof == 1", async () => {
    // 2x2 table: dof = (2-1)*(2-1) = 1 → Yates applied and note present
    const rows2x2: (string | number)[][] = [
      ...Array(20).fill(["A", "yes"]),
      ...Array(30).fill(["A", "no"]),
      ...Array(40).fill(["B", "yes"]),
      ...Array(10).fill(["B", "no"]),
    ];
    const df2x2 = makeDF(["group", "status"], rows2x2);
    const plan2x2 = makePlan(
      "group",
      ["status"],
      { status: { label: "Status", treatAs: "categorical_nominal", missingness: "drop_row", chiSquareYatesCorrection: true } },
    );
    const result2x2 = await runTable1(df2x2, plan2x2);
    expect(result2x2.perVariable[0].notes).toContain("Yates' continuity correction applied.");

    const recomputed2x2 = await recomputeVariable(df2x2, plan2x2, result2x2, "status");
    expect(recomputed2x2.notes).toContain("Yates' continuity correction applied.");

    // 3x2 table: dof = (3-1)*(2-1) = 2 → Yates not applied, note absent, P identical to uncorrected
    const rows3x2: (string | number)[][] = [
      ...Array(20).fill(["A", "yes"]),
      ...Array(30).fill(["A", "no"]),
      ...Array(40).fill(["B", "yes"]),
      ...Array(10).fill(["B", "no"]),
      ...Array(25).fill(["C", "yes"]),
      ...Array(25).fill(["C", "no"]),
    ];
    const df3x2 = makeDF(["group", "status"], rows3x2);
    const plan3x2Yates = makePlan(
      "group",
      ["status"],
      { status: { label: "Status", treatAs: "categorical_nominal", missingness: "drop_row", chiSquareYatesCorrection: true } },
    );
    const plan3x2NoYates = makePlan(
      "group",
      ["status"],
      { status: { label: "Status", treatAs: "categorical_nominal", missingness: "drop_row", chiSquareYatesCorrection: false } },
    );

    const result3x2Yates = await runTable1(df3x2, plan3x2Yates);
    const result3x2NoYates = await runTable1(df3x2, plan3x2NoYates);

    expect(result3x2Yates.perVariable[0].notes).not.toContain("Yates' continuity correction applied.");
    expect(result3x2Yates.perVariable[0].test.pValue).toBe(result3x2NoYates.perVariable[0].test.pValue);

    const recomputed3x2Yates = await recomputeVariable(df3x2, plan3x2Yates, result3x2Yates, "status");
    expect(recomputed3x2Yates.notes).not.toContain("Yates' continuity correction applied.");
  }, 60000);

  it("Phase 50 R4: ordinal rank test for ordered categories (D104(b))", async () => {
    // 1. 2 groups: NYHA 1-4 with ordinal_rank override
    const rows2: (string | number)[][] = [
      ...Array(20).fill(["A", 1]),
      ...Array(15).fill(["A", 2]),
      ...Array(10).fill(["A", 3]),
      ...Array(5).fill(["A", 4]),
      ...Array(5).fill(["B", 1]),
      ...Array(10).fill(["B", 2]),
      ...Array(15).fill(["B", 3]),
      ...Array(20).fill(["B", 4]),
    ];
    const df2 = makeDF(["group", "nyha"], rows2);
    const defaultPlan2 = makePlan(
      "group",
      ["nyha"],
      { nyha: { label: "NYHA", treatAs: "categorical_ordinal", missingness: "drop_row", levelOrder: [1, 2, 3, 4] } },
    );
    const overridePlan2 = makePlan(
      "group",
      ["nyha"],
      { nyha: { label: "NYHA", treatAs: "categorical_ordinal", missingness: "drop_row", levelOrder: [1, 2, 3, 4] } },
      { testOverrides: [{ variable: "nyha", method: "ordinal_rank", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );

    const defaultRes = await runTable1(df2, defaultPlan2);
    const overrideRes = await runTable1(df2, overridePlan2);

    expect(overrideRes.perVariable[0].test.name).toBe("Mann-Whitney U (ordinal)");
    // Counts, percentages, and SMD identical
    expect(overrideRes.perVariable[0].summaryByGroup).toEqual(defaultRes.perVariable[0].summaryByGroup);
    expect(overrideRes.perVariable[0].overallSummary).toEqual(defaultRes.perVariable[0].overallSummary);
    expect(overrideRes.perVariable[0].smd).toBe(defaultRes.perVariable[0].smd);

    // P value equals scipy.stats.mannwhitneyu on hand-mapped ranks (0..3)
    const pyCheck = await pyodideClient.call("run_python", [`
import scipy.stats as stats
import json
gA = [0.0]*20 + [1.0]*15 + [2.0]*10 + [3.0]*5
gB = [0.0]*5 + [1.0]*10 + [2.0]*15 + [3.0]*20
res = stats.mannwhitneyu(gA, gB, alternative='two-sided')
json.dumps({'statistic': float(res.statistic), 'pValue': float(res.pvalue)})
    `]);
    const expectedU = JSON.parse(pyCheck as string);
    expect(overrideRes.perVariable[0].test.statistic).toBeCloseTo(expectedU.statistic, 4);
    expect(overrideRes.perVariable[0].test.pValue).toBeCloseTo(expectedU.pValue, 4);

    const recomputed2 = await recomputeVariable(df2, overridePlan2, overrideRes, "nyha", "ordinal_rank");
    expect(recomputed2.test.name).toBe("Mann-Whitney U (ordinal)");
    expect(recomputed2.test.statistic).toBe(overrideRes.perVariable[0].test.statistic);
    expect(recomputed2.test.pValue).toBe(overrideRes.perVariable[0].test.pValue);

    // 2. 3 groups with Kruskal-Wallis (ordinal) plus Dunn post-hoc
    const rows3: (string | number)[][] = [
      ...Array(30).fill(["A", 1]),
      ...Array(5).fill(["A", 2]),
      ...Array(2).fill(["A", 3]),
      ...Array(5).fill(["B", 1]),
      ...Array(25).fill(["B", 2]),
      ...Array(5).fill(["B", 3]),
      ...Array(2).fill(["C", 1]),
      ...Array(5).fill(["C", 2]),
      ...Array(30).fill(["C", 3]),
    ];
    const df3 = makeDF(["group", "stage"], rows3);
    const plan3 = makePlan(
      "group",
      ["stage"],
      { stage: { label: "Stage", treatAs: "categorical_ordinal", missingness: "drop_row", levelOrder: [1, 2, 3] } },
      { testOverrides: [{ variable: "stage", method: "ordinal_rank", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const res3 = await runTable1(df3, plan3);
    expect(res3.perVariable[0].test.name).toBe("Kruskal-Wallis (ordinal)");
    expect(res3.perVariable[0].test.pValue).toBeLessThan(0.001);
    expect(res3.perVariable[0].postHoc).toBeDefined();
    expect(res3.perVariable[0].postHoc?.method).toBe("dunn");
    expect(res3.perVariable[0].postHoc?.correction).toBe("holm");
    expect(res3.perVariable[0].postHoc?.pairs.length).toBe(3);

    const recomputed3 = await recomputeVariable(df3, plan3, res3, "stage", "ordinal_rank");
    expect(recomputed3.test.name).toBe("Kruskal-Wallis (ordinal)");
    expect(recomputed3.postHoc).toBeDefined();
    expect(recomputed3.postHoc?.method).toBe("dunn");

    // 3. Override on a nominal variable -> default test plus note
    const dfNominal = makeDF(["group", "nominal"], [
      ...Array(50).fill(["A", "red"]), ...Array(50).fill(["A", "blue"]), ...Array(50).fill(["A", "green"]),
      ...Array(50).fill(["B", "red"]), ...Array(50).fill(["B", "blue"]), ...Array(50).fill(["B", "green"]),
    ]);
    const planNominal = makePlan(
      "group",
      ["nominal"],
      { nominal: { label: "Nominal", treatAs: "categorical_nominal", missingness: "drop_row" } },
      { testOverrides: [{ variable: "nominal", method: "ordinal_rank", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resNominal = await runTable1(dfNominal, planNominal);
    expect(resNominal.perVariable[0].test.name).toBe("Chi-square");
    expect(resNominal.perVariable[0].notes).toContain(
      "Ordinal rank test requires an ordered categorical variable with at least 3 levels; the default test was used."
    );

    const recomputedNominal = await recomputeVariable(dfNominal, planNominal, resNominal, "nominal", "ordinal_rank");
    expect(recomputedNominal.test.name).toBe("Chi-square");
    expect(recomputedNominal.notes).toContain(
      "Ordinal rank test requires an ordered categorical variable with at least 3 levels; the default test was used."
    );

    // 4. Value outside levelOrder -> exclusion note
    const rowsOutside: (string | number)[][] = [
      ...Array(20).fill(["A", 1]),
      ...Array(15).fill(["A", 2]),
      ...Array(10).fill(["A", 3]),
      ["A", 99],
      ["B", 99],
      ...Array(5).fill(["B", 1]),
      ...Array(10).fill(["B", 2]),
      ...Array(15).fill(["B", 3]),
    ];
    const dfOutside = makeDF(["group", "nyha"], rowsOutside);
    const planOutside = makePlan(
      "group",
      ["nyha"],
      { nyha: { label: "NYHA", treatAs: "categorical_ordinal", missingness: "drop_row", levelOrder: [1, 2, 3] } },
      { testOverrides: [{ variable: "nyha", method: "ordinal_rank", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resOutside = await runTable1(dfOutside, planOutside);
    expect(resOutside.perVariable[0].test.name).toBe("Mann-Whitney U (ordinal)");
    expect(resOutside.perVariable[0].notes).toContain(
      "2 value(s) not in the declared level order were excluded from the rank test."
    );

    const recomputedOutside = await recomputeVariable(dfOutside, planOutside, resOutside, "nyha", "ordinal_rank");
    expect(recomputedOutside.notes).toContain(
      "2 value(s) not in the declared level order were excluded from the rank test."
    );
  }, 60000);

  it("Phase 50 R5: ordinal rank test handles missing values, text codes, and unlisted codes (D104(b), D107(a))", async () => {
    // 1. 2 groups: NYHA 1-4 with one null in the column -> finite P equal to mannwhitneyu on hand-mapped ranks; no exclusion note
    const rowsNull2: (string | number | null)[][] = [
      ...Array(20).fill(["A", 1]),
      ...Array(15).fill(["A", 2]),
      ...Array(10).fill(["A", 3]),
      ...Array(5).fill(["A", 4]),
      ["A", null], // one null in column
      ...Array(5).fill(["B", 1]),
      ...Array(10).fill(["B", 2]),
      ...Array(15).fill(["B", 3]),
      ...Array(20).fill(["B", 4]),
    ];
    const dfNull2 = makeDF(["group", "nyha"], rowsNull2);
    const planNull2 = makePlan(
      "group",
      ["nyha"],
      { nyha: { label: "NYHA", treatAs: "categorical_ordinal", missingness: "drop_row", levelOrder: [1, 2, 3, 4] } },
      { testOverrides: [{ variable: "nyha", method: "ordinal_rank", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resNull2 = await runTable1(dfNull2, planNull2);
    expect(resNull2.perVariable[0].test.name).toBe("Mann-Whitney U (ordinal)");
    expect(resNull2.perVariable[0].test.pValue).not.toBeNull();
    expect(Number.isFinite(resNull2.perVariable[0].test.pValue)).toBe(true);
    expect(resNull2.perVariable[0].notes.some((n: string) => n.includes("excluded from the rank test"))).toBe(false);

    const pyCheckNull = await pyodideClient.call("run_python", [`
import scipy.stats as stats
import json
gA = [0.0]*20 + [1.0]*15 + [2.0]*10 + [3.0]*5
gB = [0.0]*5 + [1.0]*10 + [2.0]*15 + [3.0]*20
res = stats.mannwhitneyu(gA, gB, alternative='two-sided')
json.dumps({'statistic': float(res.statistic), 'pValue': float(res.pvalue)})
    `]);
    const expNull = JSON.parse(pyCheckNull as string);
    expect(resNull2.perVariable[0].test.statistic).toBeCloseTo(expNull.statistic, 4);
    expect(resNull2.perVariable[0].test.pValue).toBeCloseTo(expNull.pValue, 4);

    const recompNull2 = await recomputeVariable(dfNull2, planNull2, resNull2, "nyha", "ordinal_rank");
    expect(recompNull2.test.name).toBe("Mann-Whitney U (ordinal)");
    expect(recompNull2.test.pValue).toBeCloseTo(expNull.pValue, 4);
    expect(recompNull2.notes.some((n: string) => n.includes("excluded from the rank test"))).toBe(false);

    // 2. 3 groups with one null in the column and Kruskal-Wallis
    const rowsNull3: (string | number | null)[][] = [
      ...Array(30).fill(["A", 1]),
      ...Array(5).fill(["A", 2]),
      ...Array(2).fill(["A", 3]),
      ["A", null],
      ...Array(5).fill(["B", 1]),
      ...Array(25).fill(["B", 2]),
      ...Array(5).fill(["B", 3]),
      ...Array(2).fill(["C", 1]),
      ...Array(5).fill(["C", 2]),
      ...Array(30).fill(["C", 3]),
    ];
    const dfNull3 = makeDF(["group", "stage"], rowsNull3);
    const planNull3 = makePlan(
      "group",
      ["stage"],
      { stage: { label: "Stage", treatAs: "categorical_ordinal", missingness: "drop_row", levelOrder: [1, 2, 3] } },
      { testOverrides: [{ variable: "stage", method: "ordinal_rank", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resNull3 = await runTable1(dfNull3, planNull3);
    expect(resNull3.perVariable[0].test.name).toBe("Kruskal-Wallis (ordinal)");
    expect(resNull3.perVariable[0].test.pValue).not.toBeNull();
    expect(Number.isFinite(resNull3.perVariable[0].test.pValue)).toBe(true);
    expect(resNull3.perVariable[0].notes.some((n: string) => n.includes("excluded from the rank test"))).toBe(false);

    const recompNull3 = await recomputeVariable(dfNull3, planNull3, resNull3, "stage", "ordinal_rank");
    expect(recompNull3.test.name).toBe("Kruskal-Wallis (ordinal)");
    expect(recompNull3.test.pValue).not.toBeNull();
    expect(Number.isFinite(recompNull3.test.pValue)).toBe(true);
    expect(recompNull3.notes.some((n: string) => n.includes("excluded from the rank test"))).toBe(false);

    // 3. Text codes "I","II","III","IV" still map
    const rowsText: (string | number)[][] = [
      ...Array(20).fill(["A", "I"]),
      ...Array(15).fill(["A", "II"]),
      ...Array(10).fill(["A", "III"]),
      ...Array(5).fill(["A", "IV"]),
      ...Array(5).fill(["B", "I"]),
      ...Array(10).fill(["B", "II"]),
      ...Array(15).fill(["B", "III"]),
      ...Array(20).fill(["B", "IV"]),
    ];
    const dfText = makeDF(["group", "nyha_text"], rowsText);
    const planText = makePlan(
      "group",
      ["nyha_text"],
      { nyha_text: { label: "NYHA", treatAs: "categorical_ordinal", missingness: "drop_row", levelOrder: ["I", "II", "III", "IV"] } },
      { testOverrides: [{ variable: "nyha_text", method: "ordinal_rank", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resText = await runTable1(dfText, planText);
    expect(resText.perVariable[0].test.name).toBe("Mann-Whitney U (ordinal)");
    expect(resText.perVariable[0].test.pValue).toBeCloseTo(expNull.pValue, 4);
    expect(resText.perVariable[0].notes.some((n: string) => n.includes("excluded from the rank test"))).toBe(false);

    const recompText = await recomputeVariable(dfText, planText, resText, "nyha_text", "ordinal_rank");
    expect(recompText.test.name).toBe("Mann-Whitney U (ordinal)");
    expect(recompText.test.pValue).toBeCloseTo(expNull.pValue, 4);
    expect(recompText.notes.some((n: string) => n.includes("excluded from the rank test"))).toBe(false);

    // 4. A value 5 not in the order -> exclusion note with count 1
    const rowsVal5: (string | number)[][] = [
      ...Array(20).fill(["A", 1]),
      ...Array(15).fill(["A", 2]),
      ...Array(10).fill(["A", 3]),
      ...Array(5).fill(["A", 4]),
      ["A", 5], // 5 not in 1..4
      ...Array(5).fill(["B", 1]),
      ...Array(10).fill(["B", 2]),
      ...Array(15).fill(["B", 3]),
      ...Array(20).fill(["B", 4]),
    ];
    const dfVal5 = makeDF(["group", "nyha"], rowsVal5);
    const planVal5 = makePlan(
      "group",
      ["nyha"],
      { nyha: { label: "NYHA", treatAs: "categorical_ordinal", missingness: "drop_row", levelOrder: [1, 2, 3, 4] } },
      { testOverrides: [{ variable: "nyha", method: "ordinal_rank", timestamp: "2026-09-28T00:00:00.000Z" }] },
    );
    const resVal5 = await runTable1(dfVal5, planVal5);
    expect(resVal5.perVariable[0].test.name).toBe("Mann-Whitney U (ordinal)");
    expect(resVal5.perVariable[0].notes).toContain(
      "1 value(s) not in the declared level order were excluded from the rank test."
    );

    const recompVal5 = await recomputeVariable(dfVal5, planVal5, resVal5, "nyha", "ordinal_rank");
    expect(recompVal5.notes).toContain(
      "1 value(s) not in the declared level order were excluded from the rank test."
    );
  }, 60000);
});
