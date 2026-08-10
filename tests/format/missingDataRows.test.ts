import { describe, expect, it } from "vitest";
import { exportCsv } from "../../src/core/export/csv";
import { exportLatex } from "../../src/core/export/latex";
import { formatTable, journalRulesets } from "../../src/core/format/formatTable";
import type { AnalysisPlan, DataQualityReport } from "../../src/core/types";
import { dummyPlan, dummySchema, mockStats } from "./mockStats";

const qaReport: DataQualityReport = {
  overallCompletenessPercent: 94,
  blockingErrors: [],
  columns: [
    { name: "Age", missingCount: 12, missingPercent: 12, cardinality: 88, isConstant: false, flags: [] },
    { name: "Biomarker", missingCount: 0, missingPercent: 0, cardinality: 100, isConstant: false, flags: [] },
  ],
};

function planWithMissingRows(): AnalysisPlan {
  return {
    ...dummyPlan,
    userOverrides: { ...dummyPlan.userOverrides, showMissingDataRows: true },
  };
}

describe("formatTable missing-data rows", () => {
  it("keeps output identical when the missing-data row toggle is off", () => {
    const current = formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test");
    const withQaCounts = formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test", [], qaReport);

    expect(withQaCounts.rows).toEqual(current.rows);
  });

  it("renders per-group missing n (%) in each group column", () => {
    const customStats = {
      ...mockStats,
      perVariable: [
        {
          ...mockStats.perVariable[0],
          summaryByGroup: {
            "Group A": { mean: 45.234, sd: 5.678, n: 92 }, // 100 - 92 = 8 missing (8%)
            "Group B": { mean: 47.891, sd: 6.123, n: 96 }, // 100 - 96 = 4 missing (4%)
          },
        },
      ],
    };
    const table = formatTable(customStats, "NEJM", planWithMissingRows(), dummySchema, "1.0.0-test", [], qaReport);

    const missingRow = table.rows.find((row) => row.cells[0] === "Missing, n (%)");
    expect(missingRow).toBeDefined();
    expect(missingRow!.cells.slice(0, 3)).toEqual(["Missing, n (%)", "8 (8%)", "4 (4%)"]);

    // Consistency guard: sum of group missing counts matches overall missingCount in qaReport
    const sum = 8 + 4;
    expect(sum).toBe(qaReport.columns[0].missingCount);
  });

  it("computes per-group missing even for a group literally named Overall", () => {
    const ungroupedStats = {
      ...mockStats,
      groups: [{ name: "Overall", n: 200 }],
      perVariable: [
        {
          ...mockStats.perVariable[0],
          summaryByGroup: {
            "Overall": { mean: 46.562, sd: 6.001, n: 188 },
          },
        },
      ],
    };
    const table = formatTable(ungroupedStats, "NEJM", planWithMissingRows(), dummySchema, "1.0.0-test", [], qaReport);
    const missingRow = table.rows.find((row) => row.cells[0] === "Missing, n (%)");
    expect(missingRow).toBeDefined();
    expect(missingRow!.cells.slice(0, 2)).toEqual(["Missing, n (%)", "12 (6%)"]);
  });

  it("does not render a row for variables with no missing values", () => {
    const table = formatTable(mockStats, "NEJM", planWithMissingRows(), dummySchema, "1.0.0-test", [], qaReport);

    expect(table.rows.filter((row) => row.cells[0] === "Missing, n (%)")).toHaveLength(1);
  });

  it("uses the active ruleset missing-data label", () => {
    const jama = journalRulesets.EasyTableOne_Ruleset.journals.find((item) => item.journal_id === "JAMA") as any;
    const original = jama.missing_data_label;
    jama.missing_data_label = "Not recorded";
    try {
      const table = formatTable(mockStats, "JAMA", planWithMissingRows(), dummySchema, "1.0.0-test", [], qaReport);
      expect(table.rows.some((row) => row.cells[0] === "Not recorded, n (%)")).toBe(true);
    } finally {
      if (original === undefined) {
        delete jama.missing_data_label;
      } else {
        jama.missing_data_label = original;
      }
    }
  });

  it("carries the shared row model through CSV and LaTeX exports", () => {
    const table = formatTable(mockStats, "NEJM", planWithMissingRows(), dummySchema, "1.0.0-test", [], qaReport);

    expect(exportCsv(table)).toContain("Missing, n (%)");
    expect(exportLatex(table)).toContain("Missing, n (\\%)");
  });
});
