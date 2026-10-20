import { describe, expect, it } from "vitest";
import { buildContinuousLabel, formatTable } from "../../src/core/format/formatTable";
import { exportDocx } from "../../src/core/export/docx";
import { exportXlsx } from "../../src/core/export/xlsx";
import { exportCsv } from "../../src/core/export/csv";
import { exportLatex } from "../../src/core/export/latex";
import { generateAnalysisHistory } from "../../src/core/export/analysisHistory";
import type { Schema, StatisticalResults, AnalysisPlan } from "../../src/core/types";
import JSZip from "jszip";

describe("buildContinuousLabel (D104(c))", () => {
  const nejmTemplate = "{label} ({unit}), {summary}";
  const jamaTemplate = "{label}, {summary}, {unit}";

  it("returns legacy string when unit is empty or whitespace for both templates", () => {
    expect(buildContinuousLabel("Creatinine", "median (IQR)", undefined, nejmTemplate)).toBe("Creatinine, median (IQR)");
    expect(buildContinuousLabel("Creatinine", "median (IQR)", null, nejmTemplate)).toBe("Creatinine, median (IQR)");
    expect(buildContinuousLabel("Creatinine", "median (IQR)", "", nejmTemplate)).toBe("Creatinine, median (IQR)");
    expect(buildContinuousLabel("Creatinine", "median (IQR)", "   ", nejmTemplate)).toBe("Creatinine, median (IQR)");

    expect(buildContinuousLabel("Creatinine", "median (IQR)", undefined, jamaTemplate)).toBe("Creatinine, median (IQR)");
    expect(buildContinuousLabel("Creatinine", "median (IQR)", null, jamaTemplate)).toBe("Creatinine, median (IQR)");
    expect(buildContinuousLabel("Creatinine", "median (IQR)", "", jamaTemplate)).toBe("Creatinine, median (IQR)");
    expect(buildContinuousLabel("Creatinine", "median (IQR)", "   ", jamaTemplate)).toBe("Creatinine, median (IQR)");
  });

  it("formats with unit according to template", () => {
    expect(buildContinuousLabel("Creatinine", "median (IQR)", "mg/dL", nejmTemplate)).toBe("Creatinine (mg/dL), median (IQR)");
    expect(buildContinuousLabel("Creatinine", "median (IQR)", "mg/dL", jamaTemplate)).toBe("Creatinine, median (IQR), mg/dL");
  });

  it("renders a unit containing {label} literally without injection", () => {
    expect(buildContinuousLabel("Creatinine", "median (IQR)", "{label}", nejmTemplate)).toBe("Creatinine ({label}), median (IQR)");
    expect(buildContinuousLabel("Creatinine", "median (IQR)", "{summary}", nejmTemplate)).toBe("Creatinine ({summary}), median (IQR)");
  });
});

describe("formatTable continuous row labels with units (D104(c))", () => {
  const schema: Schema = {
    columns: [
      {
        name: "group",
        inferredType: "binary",
        confirmedType: "binary",
        cardinalityTier: "ok",
        levels: [{ code: 0, label: "Control" }, { code: 1, label: "Treated" }],
      },
      {
        name: "serum_creatinine",
        inferredType: "continuous",
        confirmedType: "continuous",
        cardinalityTier: "ok",
        displayLabel: "Serum creatinine",
        units: "mg/dL",
      },
      {
        name: "age",
        inferredType: "continuous",
        confirmedType: "continuous",
        cardinalityTier: "ok",
        displayLabel: "Age",
      },
      {
        name: "sex",
        inferredType: "binary",
        confirmedType: "binary",
        cardinalityTier: "ok",
        displayLabel: "Sex",
        units: "category_units_ignored",
      },
    ],
  };

  const results: StatisticalResults = {
    perVariable: [
      {
        variable: "serum_creatinine",
        summaryByGroup: {
          "0": { mean: 1.1, sd: 0.3, median: 1.0, q25: 0.9, q75: 1.3, n: 50 },
          "1": { mean: 1.4, sd: 0.4, median: 1.3, q25: 1.1, q75: 1.6, n: 50 },
        },
        overallSummary: { mean: 1.25, sd: 0.35, median: 1.15, q25: 1.0, q75: 1.45, n: 100 },
        test: { name: "Mann-Whitney U", statistic: 800, pValue: 0.002 },
        smd: 0.35,
        notes: [],
      },
      {
        variable: "age",
        summaryByGroup: {
          "0": { mean: 60.1, sd: 8.2, n: 50 },
          "1": { mean: 62.4, sd: 7.9, n: 50 },
        },
        overallSummary: { mean: 61.25, sd: 8.1, n: 100 },
        test: { name: "Welch's t-test", statistic: 1.4, pValue: 0.16 },
        smd: 0.12,
        notes: [],
      },
      {
        variable: "sex",
        summaryByGroup: {
          "0": { counts: { "0": 20, "1": 30 }, percentages: { "0": 40, "1": 60 }, n: 50 },
          "1": { counts: { "0": 25, "1": 25 }, percentages: { "0": 50, "1": 50 }, n: 50 },
        },
        overallSummary: { counts: { "0": 45, "1": 55 }, percentages: { "0": 45, "1": 55 }, n: 100 },
        test: { name: "Chi-square", statistic: 1.0, pValue: 0.31 },
        smd: 0.1,
        notes: [],
      },
    ],
    groups: [{ name: "0", n: 50 }, { name: "1", n: 50 }],
    totalN: 100,
    computeMetadata: { libVersions: {}, seed: 42 },
  };

  const plan: AnalysisPlan = {
    rulesetVersion: "1.5",
    appVersion: "1.0",
    researchPopulation: "adult",
    studyDesign: "unspecified",
    unitSystem: "metric",
    groupingVariable: "group",
    includedVariables: ["serum_creatinine", "age", "sex"],
    variableConfig: {
      serum_creatinine: { label: "Serum creatinine", treatAs: "continuous", missingness: "drop_row", units: "mg/dL" },
      age: { label: "Age", treatAs: "continuous", missingness: "drop_row" },
      sex: { label: "Sex", treatAs: "binary", missingness: "drop_row", units: "category_units_ignored" },
    },
    showSMD: true,
    showPValue: true,
    multipleTestingCorrection: "none",
    randomSeed: 42,
    auditLog: [],
  };

  it("NEJM: renders parenthetical units on continuous rows", () => {
    const formatted = formatTable(results, "NEJM", plan, schema, "1.0.0-test");
    const creatRow = formatted.rows.find((r) => r.cells[0]?.startsWith("Serum creatinine"));
    expect(creatRow?.cells[0]).toBe("Serum creatinine (mg/dL), Median (IQR)");

    // Column without units remains unchanged
    const ageRow = formatted.rows.find((r) => r.cells[0]?.startsWith("Age"));
    expect(ageRow?.cells[0]).toBe("Age, Mean (SD)");

    // Categorical column with units ignores units
    const sexRow = formatted.rows.find((r) => r.cells[0]?.startsWith("Sex"));
    expect(sexRow?.cells[0]).toBe("Sex, n (%)");
  });

  it("JAMA: renders units at end on continuous rows", () => {
    const formatted = formatTable(results, "JAMA", plan, schema, "1.0.0-test");
    const creatRow = formatted.rows.find((r) => r.cells[0]?.startsWith("Serum creatinine"));
    expect(creatRow?.cells[0]).toBe("Serum creatinine, Median (IQR), mg/dL");

    const ageRow = formatted.rows.find((r) => r.cells[0]?.startsWith("Age"));
    expect(ageRow?.cells[0]).toBe("Age, Mean (SD)");
  });

  it("LANCET: renders lowercase median (IQR) with parenthetical units", () => {
    const formatted = formatTable(results, "LANCET", plan, schema, "1.0.0-test");
    const creatRow = formatted.rows.find((r) => r.cells[0]?.startsWith("Serum creatinine"));
    expect(creatRow?.cells[0]).toBe("Serum creatinine (mg/dL), median (IQR)");
  });

  it("Export parity: DOCX, XLSX, CSV, LaTeX and analysis_history all match", async () => {
    const formattedNejm = formatTable(results, "NEJM", plan, schema, "1.0.0-test");
    const targetLabel = "Serum creatinine (mg/dL), Median (IQR)";

    // CSV
    const csv = exportCsv(formattedNejm);
    expect(csv).toContain(targetLabel);

    // LaTeX
    const latex = exportLatex(formattedNejm);
    expect(latex).toContain(targetLabel);

    // XLSX
    const xlsxBlob = exportXlsx(formattedNejm);
    expect(xlsxBlob.size).toBeGreaterThan(0);

    // DOCX
    const docxBlob = await exportDocx(formattedNejm, { appVersion: "1.0.0-test" });
    const arrayBuffer = await docxBlob.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXml = await zip.file("word/document.xml")!.async("string");
    expect(documentXml).toContain("Serum creatinine (mg/dL)");

    // analysis_history.py parity (D104(c), D86)
    // NEJM: with units (Serum creatinine) and without units (Age)
    const pyNejm = generateAnalysisHistory(plan, results, schema, { filename: "test.csv" }, new Date().toISOString(), [], "NEJM");
    const creatLineNejm = pyNejm.split("\n").find((l) => l.startsWith("# === Serum creatinine"))!;
    const ageLineNejm = pyNejm.split("\n").find((l) => l.startsWith("# === Age"))!;
    const creatRowNejm = formattedNejm.rows.find((r) => r.cells[0]?.startsWith("Serum creatinine"))!;
    const ageRowNejm = formattedNejm.rows.find((r) => r.cells[0]?.startsWith("Age"))!;
    expect(creatLineNejm).toBe(`# === ${creatRowNejm.cells[0]} ===`);
    expect(ageLineNejm).toBe(`# === ${ageRowNejm.cells[0]} ===`);

    // JAMA: with units (Serum creatinine) and without units (Age)
    const formattedJama = formatTable(results, "JAMA", plan, schema, "1.0.0-test");
    const pyJama = generateAnalysisHistory(plan, results, schema, { filename: "test.csv" }, new Date().toISOString(), [], "JAMA");
    const creatLineJama = pyJama.split("\n").find((l) => l.startsWith("# === Serum creatinine"))!;
    const ageLineJama = pyJama.split("\n").find((l) => l.startsWith("# === Age"))!;
    const creatRowJama = formattedJama.rows.find((r) => r.cells[0]?.startsWith("Serum creatinine"))!;
    const ageRowJama = formattedJama.rows.find((r) => r.cells[0]?.startsWith("Age"))!;
    expect(creatLineJama).toBe(`# === ${creatRowJama.cells[0]} ===`);
    expect(ageLineJama).toBe(`# === ${ageRowJama.cells[0]} ===`);
  });
});
