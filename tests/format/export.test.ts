import * as fs from "node:fs/promises";
import * as path from "node:path";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { exportDocx } from "../../src/core/export/docx";
import { exportLatex } from "../../src/core/export/latex";
import { exportCsv } from "../../src/core/export/csv";
import { generateReproducibilityJson } from "../../src/core/export/reproducibilityJson";
import { generateDataQualityReport } from "../../src/core/export/dataQualityReport";
import { formatTable } from "../../src/core/format/formatTable";
import { mockStats, dummyPlan, dummySchema } from "./mockStats";
import { AnalysisPlanSchema, SchemaSchema } from "../../src/core/types";
import type { StatisticalResults } from "../../src/core/types";
import journalRulesets from "../../src/core/format/journal_rulesets.json";

describe("Exporters", () => {
  it("keeps small-category findings in data-quality exports and aggregate JSON warnings", () => {
    const record = {
      finding: {
        checkId: "smallCategoryLevel_rare_category",
        tier: "advisory" as const,
        category: "quality" as const,
        variable: "rare_category",
        title: "Small Category",
        detail: "Variable 'Rare category': level 'C' has n = 3, fewer than 10 observations. Percentages for this level are unstable and the level may make the table sparse.",
        remedy: "Consider combining this level with a related one in your source data, or report it with care. This is advisory; the analysis is unchanged.",
      },
      response: "acknowledged" as const,
      timestamp: "2026-10-16T00:00:00Z",
    };
    const report = generateDataQualityReport([record], dummySchema, dummyPlan, "3.19.1", "2026-10-16T00:00:00Z");
    expect(report).toContain("level 'C' has n = 3");
    const json = generateReproducibilityJson({
      plan: dummyPlan,
      schema: dummySchema,
      results: mockStats,
      formattedTable: formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "3.19.1", [record]),
      appVersion: "3.19.1",
      dataQualityWarnings: [record],
    });
    expect(JSON.parse(json).dataQualityWarnings[0].detail).toContain("level 'C' has n = 3");
    expect(JSON.parse(json).dataQualityWarnings[0].sampleValues).toBeUndefined();
  });

  it("docx: opens cleanly and contains expected elements", async () => {
    const formatted = formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test");
    const blob = await exportDocx(formatted, { appVersion: "1.0.0-test" });
    const arrayBuffer = await blob.arrayBuffer();
    
    // Unzip the docx to inspect document.xml
    const zip = await JSZip.loadAsync(arrayBuffer);
    const documentXmlNode = zip.file("word/document.xml");
    expect(documentXmlNode).toBeDefined();
    
    const documentXml = await documentXmlNode!.async("string");
    
    // Key style elements: bold on header row (<w:b/> or <w:b w:val="true"/>)
    expect(documentXml).toMatch(/<w:b(?:[^>]*)?\/>/);
    
    // Indent on subgroups (we used "    " for indent in the text run)
    expect(documentXml).toContain("Mild");

    // P-value column formatting (NEJM uses <0.001 instead of <.001)
    expect(documentXml).toContain("0.001");

    const coreXml = await zip.file('docProps/core.xml')!.async('string');
    expect(coreXml).toContain('EasyTableOne');
    // Description carries ruleset version
    const appXml = await zip.file('docProps/app.xml')?.async('string') ?? '';
    // Note: docx package may put description in core.xml under dc:description
    // Follow the current shared ruleset version (Rule 1a), not a stale fixture literal.
    expect(coreXml + appXml).toContain(`ruleset v${journalRulesets.EasyTableOne_Ruleset.version}`);
  });

  it("latex: parses cleanly and has booktabs", () => {
    const formatted = formatTable(mockStats, "LANCET", dummyPlan, dummySchema, "1.0.0-test");
    const latex = exportLatex(formatted);

    expect(latex).toContain("\\begin{table}");
    expect(latex).toContain("\\toprule");
    expect(latex).toContain("\\midrule");
    expect(latex).toContain("\\bottomrule");
    expect(latex).toContain("\\begin{threeparttable}");
  });

  it("csv: contains header and rows correctly separated", () => {
    const formatted = formatTable(mockStats, "GENERIC", dummyPlan, dummySchema, "1.0.0-test");
    const csv = exportCsv(formatted);

    expect(csv).toContain("Characteristic,Group A (N=100),Group B (N=100),SMD,P-value");
    // Indent is dropped in CSV
    expect(csv).toContain("Mild");
  });

  it("reproducibilityJson: has all fields and no row-level data", () => {
    const dummyPlan = {
      rulesetVersion: "1.1",
      appVersion: "1.0",
      groupingVariable: "group",
      includedVariables: ["Age"],
      variableConfig: {},
      showSMD: true,
      showPValue: true,
      multipleTestingCorrection: "none" as const,
      randomSeed: 42,
      auditLog: [{ timestamp: "2026-04-30T00:00:00Z", action: "test", details: { msg: "info" } }],
    };
    const dummySchema = { columns: [] };

    const jsonStr = generateReproducibilityJson({
      plan: dummyPlan,
      schema: dummySchema,
      results: mockStats,
      formattedTable: formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test"),
      appVersion: "1.0"
    });

    const parsed = JSON.parse(jsonStr);
    expect(parsed.appVersion).toBe("1.0");
    expect(parsed.rulesetVersion).toBeDefined();
    expect(parsed.libraryVersions.scipy).toBe("1.0");
    expect(parsed.analysisPlan.auditLog).toHaveLength(1);
    expect(parsed.generatedAt).toBeDefined();
    expect(parsed.inputDataHash).toBeUndefined();

    // Ensure NO row-level data
    expect((parsed as any).rows).toBeUndefined();
    expect((parsed as any).columns).toBeUndefined();
  });

  it("reproducibility JSON omits inputDataHash by default (privacy guardrail)", () => {
    const dummyPlan = { rulesetVersion: "1.1", appVersion: "1.0", groupingVariable: "group", includedVariables: ["Age"], variableConfig: {}, showSMD: true, showPValue: true, multipleTestingCorrection: "none" as const, randomSeed: 42, auditLog: [] };
    const dummySchema = { columns: [] };
    const jsonStr = generateReproducibilityJson({
      plan: dummyPlan,
      schema: dummySchema,
      results: mockStats,
      formattedTable: formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test"),
      appVersion: "1.0"
    });
    expect(JSON.parse(jsonStr)).not.toHaveProperty("inputDataHash");
  });

  it("reproducibility JSON includes inputDataHash only when explicitly provided", () => {
    const dummyPlan = { rulesetVersion: "1.1", appVersion: "1.0", groupingVariable: "group", includedVariables: ["Age"], variableConfig: {}, showSMD: true, showPValue: true, multipleTestingCorrection: "none" as const, randomSeed: 42, auditLog: [] };
    const dummySchema = { columns: [] };
    const jsonStr = generateReproducibilityJson({
      plan: dummyPlan,
      schema: dummySchema,
      results: mockStats,
      formattedTable: formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test"),
      appVersion: "1.0",
      inputDataHash: "abc123"
    });
    expect(JSON.parse(jsonStr).inputDataHash).toBe("abc123");
  });

  it("reproducibility JSON serializes userOverrides correctly", () => {
    const dummyPlan = {
      rulesetVersion: "1.1",
      appVersion: "1.0",
      groupingVariable: "group",
      includedVariables: ["Age"],
      variableConfig: {},
      showSMD: true,
      showPValue: true,
      multipleTestingCorrection: "none" as const,
      randomSeed: 42,
      auditLog: [],
      userOverrides: {
        numberFormat: {
          thousandSeparator: false,
          decimalPlaces: 3,
        },
        iqrDelimiter: "-",
      },
    };
    const dummySchema = { columns: [] };

    const jsonStr = generateReproducibilityJson({
      plan: dummyPlan,
      schema: dummySchema,
      results: mockStats,
      formattedTable: formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test"),
      appVersion: "1.0",
      timestamp: "2026-05-29T10:00:00Z"
    });

    const parsed = JSON.parse(jsonStr);
    expect(parsed.userOverrides).toBeDefined();
    expect(parsed.userOverrides).toHaveLength(3);
    expect(parsed.userOverrides).toContainEqual({
      field: "numberFormat.thousandSeparator",
      rulesetDefault: true,
      overrideValue: false,
      timestamp: "2026-05-29T10:00:00Z"
    });
    expect(parsed.userOverrides).toContainEqual({
      field: "numberFormat.decimalPlaces",
      rulesetDefault: 1,
      overrideValue: 3,
      timestamp: "2026-05-29T10:00:00Z"
    });
    expect(parsed.userOverrides).toContainEqual({
      field: "iqrDelimiter",
      rulesetDefault: " to ",
      overrideValue: "-",
      timestamp: "2026-05-29T10:00:00Z"
    });
  });

  it("labels BH-adjusted P-values in the header and attaches the footnote marker there", () => {
    const bhPlan = { ...dummyPlan, multipleTestingCorrection: "bh" as const };
    const bhStats = {
      ...mockStats,
      perVariable: mockStats.perVariable.map((variable) => ({
        ...variable,
        notes: [...(variable.notes ?? []), "P-value adjusted via bh"],
      })),
    };

    const formatted = formatTable(bhStats, "GENERIC", bhPlan, dummySchema, "1.0.0-test");

    expect(formatted.header).toContain("P-value (BH-adjusted)");
    const bhFootnotes = formatted.footnotes.filter((footnote) => footnote.text === "P-value adjusted via bh");
    expect(bhFootnotes).toHaveLength(1);
    expect(formatted.headerFootnoteRefs?.["P-value (BH-adjusted)"]).toEqual([bhFootnotes[0].marker]);
    expect(formatted.rows.every((row) => !row.footnoteRefs.includes(bhFootnotes[0].marker))).toBe(true);
  });

  it.each([
    ["holm", "P-value (Holm-adjusted)", "P-value adjusted via holm"],
    ["bonferroni", "P-value (Bonferroni-adjusted)", "P-value adjusted via bonferroni"],
  ] as const)("labels %s-adjusted P-values from the shared mapping", (correction, header, footnote) => {
    const formatted = formatTable(mockStats, "GENERIC", { ...dummyPlan, multipleTestingCorrection: correction }, dummySchema, "1.0.0-test");
    expect(formatted.header).toContain(header);
    expect(formatted.headerFootnoteRefs?.[header]).toHaveLength(1);
    expect(formatted.footnotes).toContainEqual({ marker: formatted.headerFootnoteRefs?.[header]?.[0], text: footnote });
  });

  it("hides P-value header, cells, and P-value footnotes when hidePValueColumn is active", () => {
    const hiddenPlan = { ...dummyPlan, userOverrides: { hidePValueColumn: true } };
    const statsWithNote = {
      ...mockStats,
      perVariable: mockStats.perVariable.map((variable) => ({
        ...variable,
        notes: [...(variable.notes ?? []), "P-value adjusted via bh"],
      })),
    };

    const formatted = formatTable(statsWithNote, "GENERIC", hiddenPlan, dummySchema, "1.0.0-test");

    expect(formatted.header).not.toContain("P-value");
    expect(formatted.header.some((header) => header.includes("adjusted"))).toBe(false);
    expect(formatted.headerFootnoteRefs).toBeUndefined();
    expect(formatted.rows.every((row) => row.cells.length === formatted.header.length)).toBe(true);
    expect(formatted.footnotes.map((footnote) => footnote.text).join("\n")).not.toMatch(/P-value|BH-adjusted/i);
  });

  it("keeps default P-value output byte-identical when hidePValueColumn is absent or false", () => {
    const defaultFormatted = formatTable(mockStats, "GENERIC", dummyPlan, dummySchema, "1.0.0-test");
    const falseFormatted = formatTable(
      mockStats,
      "GENERIC",
      { ...dummyPlan, userOverrides: { hidePValueColumn: false } },
      dummySchema,
      "1.0.0-test",
    );

    expect(formatTable(mockStats, "GENERIC", { ...dummyPlan }, dummySchema, "1.0.0-test")).toEqual(defaultFormatted);
    expect(falseFormatted.header).toContain("P-value");
    expect(falseFormatted.headerFootnoteRefs).toBeUndefined();
    expect(falseFormatted.rows).toEqual(defaultFormatted.rows);
  });

  it("reproducibility JSON records hidePValueColumn while retaining computed P values", () => {
    const plan = {
      ...dummyPlan,
      studyDesign: "randomized_trial" as const,
      userOverrides: { hidePValueColumn: true },
    };
    const jsonStr = generateReproducibilityJson({
      plan,
      schema: dummySchema,
      results: mockStats,
      formattedTable: formatTable(mockStats, "NEJM", plan, dummySchema, "1.0.0-test"),
      appVersion: "1.0",
      timestamp: "2026-07-28T00:00:00.000Z",
    });
    const parsed = JSON.parse(jsonStr);

    expect(parsed.userOverrides).toContainEqual({
      field: "userOverrides.hidePValueColumn",
      rulesetDefault: false,
      overrideValue: true,
      timestamp: "2026-07-28T00:00:00.000Z",
    });
    expect(parsed.analysisPlan.auditLog).toContainEqual({
      timestamp: "2026-07-28T00:00:00.000Z",
      action: "Study design declared",
      details: { studyDesign: "randomized_trial" },
    });
    expect(parsed.analysisPlan.auditLog).toContainEqual({
      timestamp: "2026-07-28T00:00:00.000Z",
      action: "P-value column display override",
      details: { "userOverrides.hidePValueColumn": true },
    });
    expect(parsed.results.perVariable.some((v: any) => v.test.pValue !== null)).toBe(true);
  });

  it("formats continuous rows with row-level decimal precision", () => {
    const precisionStats: StatisticalResults = {
      ...mockStats,
      perVariable: [
        {
          variable: "Serum creatinine",
          summaryByGroup: {
            "Group A": { median: 1.0, q25: 0.9, q75: 1.2, n: 10 },
            "Group B": { median: 1.3, q25: 1.1, q75: 1.9, n: 10 },
          },
          overallSummary: { median: 1.15, q25: 0.9, q75: 1.5, n: 20 },
          test: { name: "Mann-Whitney U", statistic: 10, pValue: 0.2 },
          notes: [],
        },
        {
          variable: "Serum sodium",
          summaryByGroup: {
            "Group A": { median: 137, q25: 135.5, q75: 140, n: 10 },
            "Group B": { median: 135.5, q25: 133, q75: 138.3, n: 10 },
          },
          overallSummary: { median: 136, q25: 134, q75: 139, n: 20 },
          test: { name: "Mann-Whitney U", statistic: 10, pValue: 0.2 },
          notes: [],
        },
        {
          variable: "Age",
          summaryByGroup: {
            "Group A": { median: 60, q25: 50, q75: 65, n: 10 },
            "Group B": { median: 65, q25: 55, q75: 75, n: 10 },
          },
          overallSummary: { median: 62, q25: 52, q75: 70, n: 20 },
          test: { name: "Mann-Whitney U", statistic: 10, pValue: 0.2 },
          notes: [],
        },
        {
          variable: "Platelet count",
          summaryByGroup: {
            "Group A": { median: 263000, q25: 219500, q75: 302000, n: 10 },
            "Group B": { median: 258500, q25: 197500, q75: 311000, n: 10 },
          },
          overallSummary: { median: 260000, q25: 200000, q75: 305000, n: 20 },
          test: { name: "Mann-Whitney U", statistic: 10, pValue: 0.2 },
          notes: [],
        },
        {
          variable: "Mean marker",
          summaryByGroup: {
            "Group A": { mean: 38, sd: 11.5, n: 10 },
            "Group B": { mean: 40, sd: 12, n: 10 },
          },
          overallSummary: { mean: 39, sd: 12, n: 20 },
          test: { name: "Welch's t-test", statistic: 10, pValue: 0.2 },
          notes: [],
        },
      ],
    };

    const formatted = formatTable(precisionStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test");

    expect(formatted.rows.find((r) => r.cells[0].startsWith("Serum creatinine"))?.cells).toContain("1.0 (0.9 to 1.2)");
    expect(formatted.rows.find((r) => r.cells[0].startsWith("Serum sodium"))?.cells).toContain("137.0 (135.5 to 140.0)");
    expect(formatted.rows.find((r) => r.cells[0].startsWith("Serum sodium"))?.cells).toContain("135.5 (133.0 to 138.3)");
    expect(formatted.rows.find((r) => r.cells[0].startsWith("Age"))?.cells).toContain("60 (50 to 65)");
    expect(formatted.rows.find((r) => r.cells[0].startsWith("Platelet count"))?.cells).toContain("263,000 (219,500 to 302,000)");
    expect(formatted.rows.find((r) => r.cells[0].startsWith("Mean marker"))?.cells).toContain("38.0 (11.5)");
  });

  it("honors precision overrides and decimal separators after row precision resolution", () => {
    const stats: StatisticalResults = {
      ...mockStats,
      perVariable: [
        {
          variable: "Age",
          summaryByGroup: {
            "Group A": { median: 60, q25: 50, q75: 65, n: 10 },
            "Group B": { median: 65, q25: 55, q75: 75, n: 10 },
          },
          overallSummary: { median: 62, q25: 52, q75: 70, n: 20 },
          test: { name: "Mann-Whitney U", statistic: 10, pValue: 0.2 },
          notes: [],
        },
        {
          variable: "Sodium",
          summaryByGroup: {
            "Group A": { median: 137, q25: 135.5, q75: 140, n: 10 },
            "Group B": { median: 135.5, q25: 133, q75: 138.3, n: 10 },
          },
          overallSummary: { median: 136, q25: 134, q75: 139, n: 20 },
          test: { name: "Mann-Whitney U", statistic: 10, pValue: 0.2 },
          notes: [],
        },
      ],
    };

    const forced = formatTable(
      stats,
      "NEJM",
      { ...dummyPlan, userOverrides: { numberFormat: { suppressTrailingZeros: false } } },
      dummySchema,
      "1.0.0-test",
    );
    const lancet = formatTable(stats, "LANCET", dummyPlan, dummySchema, "1.0.0-test");

    expect(forced.rows.find((r) => r.cells[0].startsWith("Age"))?.cells).toContain("60.0 (50.0 to 65.0)");
    expect(lancet.rows.find((r) => r.cells[0].startsWith("Sodium"))?.cells).toContain("137·0 (135·5–140·0)");
  });

  it("Negative test: no hardcoded journal IDs", async () => {
    // Grep test for hardcoded strings
    const formatDir = path.resolve(__dirname, "../../src/core/format");
    const exportDir = path.resolve(__dirname, "../../src/core/export");
    
    async function searchDir(dir: string) {
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (file.endsWith(".ts") || file.endsWith(".tsx")) {
          const content = await fs.readFile(path.join(dir, file), "utf-8");
          // It's allowed to have journal strings in the JSON, but not hardcoded in logic
          if (file !== "journal_rulesets.json") {
             // We shouldn't find exact journal literals like "NEJM" or "JAMA" inside code logic
             // except maybe if it's reading the ruleset, but logic should be dynamic.
             expect(content).not.toMatch(/"NEJM"/);
             expect(content).not.toMatch(/"JAMA"/);
             expect(content).not.toMatch(/"LANCET"/);
          }
        }
      }
    }
    
    await searchDir(formatDir);
    await searchDir(exportDir);
  });
});

