import { describe, expect, it } from "vitest";
import type { AnalysisPlan, Schema, StatisticalResults } from "../../src/core/types";
import { chooseDefaultBinaryDisplayLevel, formatTable } from "../../src/core/format/formatTable";

const stats: StatisticalResults = {
  perVariable: [
    {
      variable: "response",
      summaryByGroup: {
        A: { counts: { No: 8, Yes: 2 }, percentages: { No: 80, Yes: 20 }, n: 10 },
        B: { counts: { No: 5, Yes: 5 }, percentages: { No: 50, Yes: 50 }, n: 10 },
      },
      overallSummary: { counts: { No: 13, Yes: 7 }, percentages: { No: 65, Yes: 35 }, n: 20 },
      test: { name: "Fisher's exact", statistic: null, pValue: 0.2 },
      notes: [],
    },
    {
      variable: "status",
      summaryByGroup: {
        A: { counts: { Low: 4, High: 6 }, percentages: { Low: 40, High: 60 }, n: 10 },
        B: { counts: { Low: 3, High: 7 }, percentages: { Low: 30, High: 70 }, n: 10 },
      },
      overallSummary: { counts: { Low: 7, High: 13 }, percentages: { Low: 35, High: 65 }, n: 20 },
      test: { name: "Chi-square", statistic: 1, pValue: 0.5 },
      notes: [],
    },
  ],
  groups: [{ name: "A", n: 10 }, { name: "B", n: 10 }],
  totalN: 20,
  computeMetadata: { libVersions: {}, seed: 42 },
};

const schema: Schema = {
  columns: [
    {
      name: "response",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [{ code: "No", label: "No" }, { code: "Yes", label: "Yes" }],
    },
    {
      name: "status",
      inferredType: "categorical_nominal",
      confirmedType: "categorical_nominal",
      cardinalityTier: "ok",
      levels: [{ code: "Low", label: "Low" }, { code: "High", label: "High" }, { code: "Unknown", label: "Unknown" }],
    },
  ],
};

const plan: AnalysisPlan = {
  rulesetVersion: "1.1",
  appVersion: "1.0",
  researchPopulation: "adult",
  unitSystem: "metric",
  groupingVariable: "group",
  includedVariables: ["response", "status"],
  variableConfig: {
    response: { label: "response", treatAs: "binary", missingness: "drop_row" },
    status: { label: "status", treatAs: "categorical_nominal", missingness: "drop_row" },
  },
  showSMD: false,
  showPValue: true,
  multipleTestingCorrection: "none",
  auditLog: [],
};

describe("binary display levels and planned zero-count rows", () => {
  it("keeps the default binary display rule testable", () => {
    expect(chooseDefaultBinaryDisplayLevel({ No: 13, Yes: 7 }, schema.columns[0])).toBe("Yes");
  });

  it("negative-label regex skips negative labels for pairs", () => {
    // "No disease/Disease"
    const col1: Schema["columns"][number] = {
      name: "disease",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [{ code: "No disease", label: "No disease" }, { code: "Disease", label: "Disease" }],
    };
    expect(chooseDefaultBinaryDisplayLevel({ "No disease": 10, "Disease": 5 }, col1)).toBe("Disease");

    // "Absent/Present"
    const col2: Schema["columns"][number] = {
      name: "condition",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [{ code: "Absent", label: "Absent" }, { code: "Present", label: "Present" }],
    };
    expect(chooseDefaultBinaryDisplayLevel({ "Absent": 10, "Present": 5 }, col2)).toBe("Present");

    // "Alive/Dead"
    const col3: Schema["columns"][number] = {
      name: "mortality",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [{ code: "Alive", label: "Alive" }, { code: "Dead", label: "Dead" }],
    };
    expect(chooseDefaultBinaryDisplayLevel({ "Alive": 10, "Dead": 5 }, col3)).toBe("Dead");

    // "None/Any"
    const col4: Schema["columns"][number] = {
      name: "symptoms",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [{ code: "None", label: "None" }, { code: "Any", label: "Any" }],
    };
    expect(chooseDefaultBinaryDisplayLevel({ "None": 10, "Any": 5 }, col4)).toBe("Any");

    // "Yes/No"
    const col5: Schema["columns"][number] = {
      name: "y_n",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [{ code: "Yes", label: "Yes" }, { code: "No", label: "No" }],
    };
    expect(chooseDefaultBinaryDisplayLevel({ "Yes": 10, "No": 5 }, col5)).toBe("Yes");

    // numeric 0/1
    const col6: Schema["columns"][number] = {
      name: "num_bin",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [{ code: 0, label: "0" }, { code: 1, label: "1" }],
    };
    expect(chooseDefaultBinaryDisplayLevel({ "0": 10, "1": 5 }, col6)).toBe("1");
  });

  it("both-negative-labels degenerate case falls back to first level without throwing", () => {
    const colDegenerate: Schema["columns"][number] = {
      name: "deg",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [{ code: "none", label: "None" }, { code: "absent", label: "Absent" }],
    };
    expect(chooseDefaultBinaryDisplayLevel({ "none": 10, "absent": 5 }, colDegenerate)).toBe("none");
  });

  it("explicit displayLevel on schema column takes precedence", () => {
    const colOverride: Schema["columns"][number] = {
      name: "disease",
      inferredType: "binary",
      confirmedType: "binary",
      cardinalityTier: "ok",
      levels: [{ code: "No disease", label: "No disease" }, { code: "Disease", label: "Disease" }],
      displayLevel: "No disease",
    };
    expect(chooseDefaultBinaryDisplayLevel({ "No disease": 10, "Disease": 5 }, colOverride)).toBe("No disease");
  });

  it("honors per-variable binary display-level overrides", () => {
    const table = formatTable(
      stats,
      "NEJM",
      { ...plan, variableConfig: { ...plan.variableConfig, response: { ...plan.variableConfig.response, displayLevel: "No" } } },
      schema,
      "1.0-test",
    );

    const row = table.rows.find((item) => item.cells[0].startsWith("response"));
    expect(row?.cells[0]).toContain("(No)");
    expect(row?.cells.slice(1, 3)).toEqual(["8 (80%)", "5 (50%)"]);
  });

  it("renders planned zero-count levels when explicitly enabled", () => {
    const table = formatTable(
      stats,
      "NEJM",
      { ...plan, userOverrides: { showPlannedZeroCountLevels: true } },
      schema,
      "1.0-test",
    );

    const unknownRow = table.rows.find((item) => item.cells[0] === "Unknown");
    expect(unknownRow?.cells.slice(1, 3)).toEqual(["0 (0%)", "0 (0%)"]);
  });

  it("orders ordinal bracket ranges naturally when no declared order exists", () => {
    const table = formatTable(
      {
        ...stats,
        perVariable: [{
          variable: "age",
          summaryByGroup: {
            A: { counts: { "[70-80)": 9, "[0-10)": 1, "[90-100)": 2, "[10-20)": 3 }, percentages: { "[70-80)": 60, "[0-10)": 7, "[90-100)": 13, "[10-20)": 20 }, n: 15 },
            B: { counts: { "[70-80)": 4, "[0-10)": 1, "[90-100)": 1, "[10-20)": 2 }, percentages: { "[70-80)": 50, "[0-10)": 13, "[90-100)": 13, "[10-20)": 25 }, n: 8 },
          },
          overallSummary: { counts: { "[70-80)": 13, "[0-10)": 2, "[90-100)": 3, "[10-20)": 5 }, percentages: {}, n: 23 },
          test: { name: "Chi-square", statistic: 1, pValue: 0.5 },
          notes: [],
        }],
      },
      "NEJM",
      plan,
      { columns: [{ name: "age", inferredType: "categorical_nominal", confirmedType: "categorical_ordinal", cardinalityTier: "ok" }] },
      "1.0-test",
    );

    expect(table.rows.filter((row) => row.isSubgroup).map((row) => row.cells[0])).toEqual(["[0-10)", "[10-20)", "[70-80)", "[90-100)"]);
  });

  it("orders ordinal weight bins with greater-than thresholds last by numeric value", () => {
    const table = formatTable(
      {
        ...stats,
        perVariable: [{
          variable: "weight",
          summaryByGroup: {
            A: { counts: { ">200": 1, "[0-25)": 4, "[175-200)": 2, "[150-175)": 3 }, percentages: {}, n: 10 },
            B: { counts: { ">200": 1, "[0-25)": 2, "[175-200)": 2, "[150-175)": 1 }, percentages: {}, n: 6 },
          },
          overallSummary: { counts: { ">200": 2, "[0-25)": 6, "[175-200)": 4, "[150-175)": 4 }, percentages: {}, n: 16 },
          test: { name: "Chi-square", statistic: 1, pValue: 0.5 },
          notes: [],
        }],
      },
      "NEJM",
      plan,
      { columns: [{ name: "weight", inferredType: "categorical_nominal", confirmedType: "categorical_ordinal", cardinalityTier: "ok" }] },
      "1.0-test",
    );

    expect(table.rows.filter((row) => row.isSubgroup).map((row) => row.cells[0])).toEqual(["[0-25)", "[150-175)", "[175-200)", ">200"]);
  });

  it("uses declared ordinal coding before natural numeric order", () => {
    const table = formatTable(
      {
        ...stats,
        perVariable: [{
          variable: "severity",
          summaryByGroup: {
            A: { counts: { "1": 5, "2": 3, "3": 2 }, percentages: {}, n: 10 },
            B: { counts: { "1": 1, "2": 2, "3": 3 }, percentages: {}, n: 6 },
          },
          overallSummary: { counts: { "1": 6, "2": 5, "3": 5 }, percentages: {}, n: 16 },
          test: { name: "Chi-square", statistic: 1, pValue: 0.5 },
          notes: [],
        }],
      },
      "NEJM",
      { ...plan, userOverrides: { showPlannedZeroCountLevels: true } },
      { columns: [{
        name: "severity",
        inferredType: "categorical_ordinal",
        confirmedType: "categorical_ordinal",
        cardinalityTier: "ok",
        levels: [{ code: "3", label: "3", order: 0 }, { code: "1", label: "1", order: 1 }, { code: "2", label: "2", order: 2 }],
      }] },
      "1.0-test",
    );

    expect(table.rows.filter((row) => row.isSubgroup).map((row) => row.cells[0])).toEqual(["3", "1", "2"]);
  });

  it("leaves nominal frequency ordering unchanged and moves only tail labels", () => {
    const table = formatTable(stats, "NEJM", { ...plan, userOverrides: { showPlannedZeroCountLevels: true } }, schema, "1.0-test");
    expect(table.rows.filter((row) => row.isSubgroup).map((row) => row.cells[0])).toEqual(["Low", "High", "Unknown"]);
  });

  it("locale-sorts ordinal labels without numbers", () => {
    const table = formatTable(
      {
        ...stats,
        perVariable: [{
          variable: "severity",
          summaryByGroup: {
            A: { counts: { Severe: 5, Mild: 1, Moderate: 3 }, percentages: {}, n: 9 },
            B: { counts: { Severe: 2, Mild: 1, Moderate: 1 }, percentages: {}, n: 4 },
          },
          overallSummary: { counts: { Severe: 7, Mild: 2, Moderate: 4 }, percentages: {}, n: 13 },
          test: { name: "Chi-square", statistic: 1, pValue: 0.5 },
          notes: [],
        }],
      },
      "NEJM",
      plan,
      { columns: [{ name: "severity", inferredType: "categorical_nominal", confirmedType: "categorical_ordinal", cardinalityTier: "ok" }] },
      "1.0-test",
    );

    expect(table.rows.filter((row) => row.isSubgroup).map((row) => row.cells[0])).toEqual(["Mild", "Moderate", "Severe"]);
  });
});
