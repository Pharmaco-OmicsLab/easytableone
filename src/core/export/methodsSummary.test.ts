import { describe, expect, it } from "vitest";
import { dummyPlan, dummySchema, mockStats } from "../../../tests/format/mockStats";
import { buildMethodsSummaryDocxChildren, buildMethodsSummaryMarkdown, buildMethodsSummaryRows, exportMethodsSummaryDocx } from "./methodsSummary";

describe("methodsSummary export", () => {
  it("builds per-variable rows from existing results without recomputing tests", () => {
    const rows = buildMethodsSummaryRows(mockStats, dummySchema, {
      ...dummyPlan,
      testOverrides: [{ variable: "Gender", method: "fishers_exact", timestamp: "2026-06-29T00:00:00.000Z" }],
    });

    expect(rows.find((row) => row.variable === "Age")?.summaryFormat).toBe("mean (SD)");
    expect(rows.find((row) => row.variable === "Biomarker")?.summaryFormat).toBe("median (IQR)");
    expect(rows.find((row) => row.variable === "Gender")?.selectionReason).toContain("User override");
  });

  it("exports a markdown table", () => {
    const markdown = buildMethodsSummaryMarkdown(mockStats, dummySchema, dummyPlan);
    expect(markdown).toContain("# Per-variable Methods Summary");
    expect(markdown).toContain("| Variable | Summary format | Statistical test | Selection reason |");
    expect(markdown).toContain("| Age | mean (SD) | Welch's t-test |");
  });

  it("builds DOCX children and standalone DOCX from the same rows", async () => {
    const children = buildMethodsSummaryDocxChildren(mockStats, dummySchema, dummyPlan);
    expect(children.length).toBe(2);

    const blob = await exportMethodsSummaryDocx(mockStats, dummySchema, dummyPlan, "1.0-test");
    expect(blob.size).toBeGreaterThan(1000);
  });
});
