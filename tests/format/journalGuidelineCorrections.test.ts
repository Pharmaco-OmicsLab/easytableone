import { describe, expect, it } from "vitest";
import { generateAnalysisHistory } from "../../src/core/export/analysisHistory";
import { generateDiagnosticsCsv } from "../../src/core/format/diagnosticsCsv";
import { formatPValue, formatTable, journalRulesets } from "../../src/core/format/formatTable";
import { JournalRulesetSchema } from "../../src/core/types";
import { dummyPlan, dummySchema, mockStats } from "./mockStats";

describe("Phase 51 R3 journal guideline corrections", () => {
  it("formats Lancet p values to two significant figures around the low threshold", () => {
    const lancet = journalRulesets.EasyTableOne_Ruleset.journals.find((journal) => journal.journal_id === "LANCET")!;
    const format = lancet.p_value_formatting;
    const values: Array<[number, string]> = [
      [0.00001, "<0·0001"],
      [0.0001, "0·00010"],
      [0.0015, "0·0015"],
      [0.033, "0·033"],
      [0.349, "0·35"],
      [0.45, "0·45"],
      [0.5, "0·50"],
      [0.996, "1·0"],
      [1, "1·0"],
    ];
    for (const [value, expected] of values) expect(formatPValue(value, format)).toBe(expected);
  });

  it("validates that every journal threshold is positive and catches midline-decimal zero", () => {
    const source = structuredClone(journalRulesets);
    const parsed = JournalRulesetSchema.parse(source);
    for (const journal of parsed.EasyTableOne_Ruleset.journals) {
      const separator = journal.p_value_formatting.decimal_separator ?? ".";
      const numeric = Number(journal.p_value_formatting.threshold_low.slice(1).replace(/[·,]/g, ".").replace(separator, "."));
      expect(numeric).toBeGreaterThan(0);
    }

    const broken = structuredClone(source);
    const lancet = broken.EasyTableOne_Ruleset.journals.find((journal) => journal.journal_id === "LANCET")!;
    lancet.p_value_formatting.threshold_low = "<0·0000";
    expect(JournalRulesetSchema.safeParse(broken).success).toBe(false);
  });

  it("requires dated provenance for each journal and permits null source fields only for GENERIC", () => {
    const parsed = JournalRulesetSchema.parse(structuredClone(journalRulesets));
    for (const journal of parsed.EasyTableOne_Ruleset.journals) {
      expect(journal.provenance.source_title).toBeTruthy();
      expect(journal.provenance.notes).toBeTruthy();
      expect(journal.provenance.last_reviewed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (journal.provenance.retrieved_on !== null) {
        expect(journal.provenance.retrieved_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(journal.provenance.last_reviewed_on >= journal.provenance.retrieved_on).toBe(true);
      }
      if (journal.journal_id !== "GENERIC") expect(journal.provenance.source_url).toMatch(/^https:\/\//);
    }
    const invalid = structuredClone(journalRulesets);
    invalid.EasyTableOne_Ruleset.journals.find((journal) => journal.journal_id === "NEJM")!.provenance.source_url = null;
    expect(JournalRulesetSchema.safeParse(invalid).success).toBe(false);
  });

  it("uses JAMA's whole-number rule at N=99 but retains one decimal at N=100", () => {
    const stats = structuredClone(mockStats);
    const gender = stats.perVariable.find((variable) => variable.variable === "Gender")!;
    gender.summaryByGroup["Group A"] = {
      counts: { Female: 33, Male: 66 }, percentages: { Female: 33.3333, Male: 66.6667 }, n: 99,
    };
    gender.summaryByGroup["Group B"] = {
      counts: { Female: 33, Male: 67 }, percentages: { Female: 33, Male: 67 }, n: 100,
    };
    stats.groups = [{ name: "Group A", n: 99 }, { name: "Group B", n: 100 }];
    const table = formatTable(stats, "JAMA", dummyPlan, dummySchema, "1.0.0-test");
    const row = table.rows.find((candidate) => candidate.cells[0].startsWith("Gender,"))!;
    expect(row.cells[0]).toContain("No. (%)");
    expect(row.cells.slice(1, 3)).toEqual(["33 (33%)", "33 (33.0%)"]);
    expect(table.methodsParagraph).toContain("summarized as No. (%)");
  });

  it("uses the JAMA label and journal P formatting in diagnostics CSV", () => {
    const csv = generateDiagnosticsCsv(mockStats, dummySchema, "group", "JAMA");
    expect(csv).toContain("No. (%)");
    expect(csv).toContain(".03");
    const lancetCsv = generateDiagnosticsCsv(mockStats, dummySchema, "group", "LANCET");
    expect(lancetCsv).toContain("<0·0001");
  });

  it("generates analysis history with the selected journal p-value formatter", () => {
    const script = generateAnalysisHistory(
      { ...dummyPlan, groupingVariable: "group" }, mockStats, dummySchema,
      { filename: "example.csv" }, "2026-10-11T00:00:00.000Z", undefined, "LANCET",
    );
    expect(script).toContain("def _eto_format_p_value(p):");
    expect(script).toContain("p={_eto_format_p_value(p_Biomarker)}");
    expect(script).toContain("EasyTableOne p=<0·0001");
  });

  it("records JAMA's categorical summary label in analysis history", () => {
    const script = generateAnalysisHistory(
      { ...dummyPlan, groupingVariable: "group" }, mockStats, dummySchema,
      { filename: "example.csv" }, "2026-10-11T00:00:00.000Z", undefined, "JAMA",
    );
    expect(script).toContain("# Summary reported as: No. (%)");
  });
});
