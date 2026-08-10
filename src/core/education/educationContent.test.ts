import { describe, expect, it } from "vitest";
import { dummyPlan, dummySchema, mockStats } from "../../../tests/format/mockStats";
import { getAllStageOverviews, getDecision, getStageDecisionIds, STAGE_ORDER, TABLE1_MISSING_DATA_SIGNPOST } from "./educationContent";
import type { EducationContext } from "./educationTypes";

const round9DecisionIds = [
  "schema.type-inference",
  "schema.reference-level",
  "schema.ordinal-order",
  "schema.exclusions",
  "qa.gates",
  "qa.sanity-bounds",
  "qa.eda-correlation",
  "qa.eda-vif",
  "qa.eda-mcar",
  "qa.eda-mosaic",
  "plan.grouping-variable",
  "plan.group-order",
  "plan.variable-order",
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

describe("education content registry", () => {
  it("has an overview for every stage", () => {
    const overviews = getAllStageOverviews();
    expect(Object.keys(overviews)).toHaveLength(9);
    for (const stage of STAGE_ORDER) {
      expect(overviews[stage].purpose).not.toHaveLength(0);
      expect(overviews[stage].whatToDo).not.toHaveLength(0);
      expect(overviews[stage].whyItMatters).not.toHaveLength(0);
    }
  });

  it("returns non-empty concise and deep bodies for seeded decisions", () => {
    const context = { stats: mockStats, schema: dummySchema, plan: dummyPlan };
    const ids = STAGE_ORDER.flatMap((stage) => getStageDecisionIds(stage, context));

    for (const id of ids) {
      const concise = getDecision(id, "concise", context).concise;
      const deep = getDecision(id, "deep", context).concise;
      expect(concise.what).not.toHaveLength(0);
      expect(concise.why).not.toHaveLength(0);
      expect(concise.alternatives).not.toHaveLength(0);
      expect(deep.what).not.toHaveLength(0);
      expect(deep.why).not.toHaveLength(0);
      expect(deep.alternatives).not.toHaveLength(0);
    }
  });

  it("uses result data for variable test explanations", () => {
    const decision = getDecision("stats.test-selection.Age", "concise", { stats: mockStats, schema: dummySchema, plan: dummyPlan });
    expect(decision.label).toContain("Age");
    expect(decision.concise.what).toContain("Welch");
  });

  it("replaces all Round 9 placeholders with concise and deep explanations", () => {
    for (const id of round9DecisionIds) {
      const concise = getDecision(id, "concise", round9Context).concise;
      const deep = getDecision(id, "deep", round9Context).concise;
      for (const body of [concise, deep]) {
        expect(body.what).not.toMatch(/coming soon/i);
        expect(body.why).not.toMatch(/coming soon/i);
        expect(body.alternatives).not.toMatch(/coming soon/i);
      }
      expect(deep).not.toEqual(concise);
    }
  });

  it("uses current schema and plan choices in Round 9 decision text", () => {
    expect(getDecision("schema.type-inference", "concise", round9Context).concise.what).toContain("Age -> continuous");
    expect(getDecision("schema.reference-level", "concise", round9Context).concise.what).toContain("Treatment group: Control");
    expect(getDecision("schema.exclusions", "concise", round9Context).concise.what).toContain("116 unique values");
    expect(getDecision("plan.grouping-variable", "concise", round9Context).concise.what).toContain("Treatment group is the grouping variable");
    expect(getDecision("plan.variable-order", "concise", round9Context).concise.what).toContain("Age");
  });

  it("degrades gracefully for missing decisions", () => {
    const decision = getDecision("unknown.decision", "deep");
    expect(decision.concise.what).toContain("coming soon");
  });

  it("centralizes the Table 1 missing-data signpost in the education registry", () => {
    const decision = getDecision("qa.table1-missing-data", "concise", round9Context);
    expect(decision.concise.what).toBe(TABLE1_MISSING_DATA_SIGNPOST);
    expect(decision.concise.what).toContain("available-case per variable");
    expect(decision.concise.what).toContain("Modeling step");
  });
});
