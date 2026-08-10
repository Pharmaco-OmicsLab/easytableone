import { describe, expect, it } from "vitest";
import { dummyPlan, dummySchema, mockStats } from "../../../tests/format/mockStats";
import type { EducationContext } from "../education/educationTypes";
import { buildEducationReportDocxChildren, buildEducationReportMarkdown, exportEducationReportDocx } from "./educationReport";

const round9Labels = [
  "Type inference",
  "Reference level",
  "Ordinal order",
  "Variable type exclusions",
  "QA gates",
  "Sanity bounds",
  "Correlation screen",
  "VIF screen",
  "MCAR screen",
  "Mosaic plots",
  "Grouping variable",
  "Group order",
  "Variable order",
];

const round9Context: EducationContext = {
  stats: mockStats,
  schema: {
    columns: [
      { name: "group", confirmedType: "binary", inferredType: "binary", cardinalityTier: "ok" as const, displayLabel: "Treatment group", referenceLevel: "Control", levels: [{ code: "Control", label: "Control" }, { code: "Drug", label: "Drug" }] },
      { name: "Age", confirmedType: "continuous", inferredType: "continuous", cardinalityTier: "ok" as const, displayLabel: "Age" },
      { name: "Severity", confirmedType: "categorical_ordinal", inferredType: "categorical_nominal", cardinalityTier: "ok" as const, levels: [{ code: "mild", label: "Mild", order: 0 }, { code: "severe", label: "Severe", order: 1 }] },
      { name: "SiteCode", confirmedType: "unsupported", inferredType: "unsupported", cardinalityTier: "flag" as const, exclusionReason: "116 unique values exceeds the 20-level threshold" },
    ],
  },
  plan: {
    ...dummyPlan,
    groupingVariable: "group",
    includedVariables: ["Age", "Severity"],
    groupOrder: ["Control", "Drug"],
  },
};

describe("education report export", () => {
  it("includes all stage overviews and data-driven decisions", () => {
    const markdown = buildEducationReportMarkdown({ stats: mockStats, schema: dummySchema, plan: dummyPlan }, "concise");
    expect(markdown).toContain("## Upload Dataset");
    expect(markdown).toContain("## Format and export");
    expect(markdown).toContain("#### Test selection: Age");
    expect(markdown).toContain("Welch");
  });

  it("honors concise versus detailed depth", () => {
    const context = { stats: mockStats, schema: dummySchema, plan: dummyPlan };
    const concise = buildEducationReportMarkdown(context, "concise");
    const deep = buildEducationReportMarkdown(context, "deep");
    expect(deep).not.toEqual(concise);
    expect(deep.length).toBeGreaterThan(concise.length);
  });

  it("exports the completed Round 9 decision explainers without placeholders", () => {
    const concise = buildEducationReportMarkdown(round9Context, "concise");
    const deep = buildEducationReportMarkdown(round9Context, "deep");

    for (const label of round9Labels) {
      expect(concise).toContain(`#### ${label}`);
      const section = concise.split(`#### ${label}`)[1].split("\n#### ")[0];
      expect(section).not.toMatch(/coming soon/i);
    }
    expect(deep).not.toEqual(concise);
    expect(deep).toContain("Experimental: R parity validation was not available in this environment.");
  });

  it("builds DOCX children and standalone DOCX", async () => {
    const children = buildEducationReportDocxChildren({ stats: mockStats, schema: dummySchema, plan: dummyPlan }, "deep");
    expect(children.length).toBeGreaterThan(9);

    const blob = await exportEducationReportDocx({ stats: mockStats, schema: dummySchema, plan: dummyPlan }, "concise", "1.0-test");
    expect(blob.size).toBeGreaterThan(1000);
  });
});
