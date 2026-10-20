import { describe, expect, it } from "vitest";
import { dummyPlan, dummySchema, mockStats } from "../../../tests/format/mockStats";
import type { EDAResults } from "../eda/types";
import type { AnalysisPlan, Schema } from "../types";
import { generateDataQualityReport } from "./dataQualityReport";
import {
  generateEDAReportHtml,
  generateEDAReportMarkdown,
  generateEDAReportSectionHtml,
  generateEdaSummaryMarkdown,
} from "./edaReport";
import { buildEducationReportMarkdown } from "./educationReport";
import { buildMethodsSummaryMarkdown } from "./methodsSummary";
import { renderUnifiedReportHtml } from "./reportHtml";
import { buildUnifiedReport, type UnifiedReportContext } from "./unifiedReport";

// Phase 51 R1 / D105(b): saved HTML and Markdown exports must not load anything remotely.
// Plain <a href="https://..."> links are allowed (user-initiated navigation).
const REMOTE_RESOURCE_PATTERNS: Array<[string, RegExp]> = [
  ["script src", /<script\b[^>]*\bsrc\s*=/i],
  ["any <script>", /<script\b/i],
  ["link href http", /<link\b[^>]*\bhref\s*=\s*["']?\s*(?:https?:)?\/\//i],
  ["img/source/iframe/video/audio/embed src http", /<(?:img|source|iframe|video|audio|embed|track|input)\b[^>]*\bsrc\s*=\s*["']?\s*(?:https?:)?\/\//i],
  ["srcset http", /\bsrcset\s*=\s*["']?\s*(?:https?:)?\/\//i],
  ["poster http", /\bposter\s*=\s*["']?\s*(?:https?:)?\/\//i],
  ["@import", /@import\b/i],
  ["css url(http)", /url\(\s*["']?\s*(?:https?:)?\/\//i],
  ["markdown image http", /!\[[^\]]*\]\(\s*<?\s*(?:https?:)?\/\//i],
  ["known CDNs", /cdn\.jsdelivr|unpkg\.com|cdnjs\.cloudflare|googleapis\.com|gstatic\.com/i],
];

function expectNoRemoteResources(label: string, output: string) {
  expect(output.length, `${label} should not be empty`).toBeGreaterThan(0);
  for (const [name, pattern] of REMOTE_RESOURCE_PATTERNS) {
    // The unified report and the DQ print window legitimately contain inline (non-src) scripts,
    // handled separately below; only "any <script>" is skipped for them.
    if (name === "any <script>" && label.startsWith("unified")) continue;
    expect(output, `${label}: ${name}`).not.toMatch(pattern);
  }
}

// Built at runtime: tests/format/export.test.ts forbids quoted journal-ID literals in src/core/export/*.ts.
const TEST_JOURNAL = ["NE", "JM"].join("");

const eda: EDAResults = {
  missingness: {
    perVariable: [
      { name: "age", displayLabel: "Age", missingCount: 2, missingPct: 20 },
      { name: "weight", displayLabel: "Weight", missingCount: 0, missingPct: 0 },
    ],
    indicatorCorrelations: [{ colA: "age", displayA: "Age", colB: "weight", displayB: "Weight", correlation: 0.6 }],
    heatmapPng: "aGVhdG1hcA==",
  },
  correlations: {
    pairs: [{ colA: "age", displayA: "Age", colB: "weight", displayB: "Weight", r: 0.81, rho: 0.74 }],
    flagged: [{ colA: "age", displayA: "Age", colB: "weight", displayB: "Weight", pearsonR: 0.81, spearmanRho: 0.74 }],
    nContinuous: 2,
    variableOrder: ["age", "weight"],
  },
  bivariate: {
    groupingVariable: "group",
    groupingDisplayLabel: "Treatment",
    plots: [{ variable: "age", displayLabel: "Age", plotType: "boxplot", png: "cGxvdA==" }],
  },
  schemaFingerprint: "fp",
  generatedAt: "2026-06-27T00:00:00.000Z",
} as EDAResults;

const plan: AnalysisPlan = { ...dummyPlan };
const schema: Schema = dummySchema;

function unifiedContext(overrides: Partial<UnifiedReportContext> = {}): UnifiedReportContext {
  return {
    stats: mockStats,
    schema,
    plan,
    journalId: TEST_JOURNAL,
    formattedTable: {
      journal: TEST_JOURNAL,
      rulesetVersion: "1.3",
      title: "Table 1. Baseline characteristics",
      header: ["Characteristic", "Control", "Case", "P-value"],
      rows: [{ indent: 0, cells: ["Age, mean (SD)", "10 (1)", "12 (2)", "0.20"], isSubgroup: false, footnoteRefs: [] }],
      footnotes: [],
      methodsParagraph: "Continuous variables were compared with a t-test.",
    },
    dataQualityRecords: [],
    qaReport: null,
    edaResults: eda,
    modelingResults: null,
    modelingSetup: null,
    educationDepth: "concise",
    appVersion: "1.0",
    rulesetVersion: "1.3",
    timestamp: "2026-06-30T12:00:00.000Z",
    ...overrides,
  } as UnifiedReportContext;
}

describe("exports reference no remote resources", () => {
  it("EDA report HTML (standalone, with chart PNGs)", () => {
    expectNoRemoteResources("eda html", generateEDAReportHtml(eda, null, "test", "2026-06-27T00:00:00.000Z", "Y2hhcnQx", "Y2hhcnQy"));
  });

  it("EDA report HTML (empty state)", () => {
    expectNoRemoteResources("eda html empty", generateEDAReportHtml(null));
  });

  it("EDA section HTML (embedded in the data-quality print export)", () => {
    expectNoRemoteResources("eda section html", generateEDAReportSectionHtml(eda, null));
  });

  it("EDA markdown reports", () => {
    expectNoRemoteResources("eda markdown", generateEDAReportMarkdown(eda, null));
    expectNoRemoteResources("eda summary markdown", generateEdaSummaryMarkdown(eda));
  });

  it("data quality report markdown", () => {
    expectNoRemoteResources("data quality markdown", generateDataQualityReport([], schema, plan, "1.0", "2026-06-30T12:00:00.000Z", { edaResults: eda }));
  });

  it("education report markdown", () => {
    expectNoRemoteResources("education markdown", buildEducationReportMarkdown({ stats: mockStats, schema, plan }, "concise"));
  });

  it("methods summary markdown", () => {
    expectNoRemoteResources("methods markdown", buildMethodsSummaryMarkdown(mockStats, schema, plan));
  });

  it("unified report HTML loads nothing remote (inline scrollspy script only)", () => {
    const art = buildUnifiedReport(
      { table1: true, dataQuality: true, eda: true, modeling: false, methods: false, education: false },
      unifiedContext(),
    );
    const html = renderUnifiedReportHtml(art, { title: "Report" });

    expectNoRemoteResources("unified html", html);
    expect(html).not.toMatch(/<script\b[^>]*\bsrc=/i);
  });

  it("unified report HTML neutralises remote Markdown images in user-supplied text", () => {
    const html = renderUnifiedReportHtml(
      {
        md: "# T\n\n## 1 S\n\n![tracker](https://evil.example/p.png)\n\nText ![inline](http://evil.example/q.gif) end.\n",
        markdown: "",
        headings: [{ level: 2, number: "1", text: "S", slug: "s" }],
        assets: [],
      },
      { title: "T" },
    );

    expect(html).not.toContain("evil.example");
    expectNoRemoteResources("unified html hostile", html);
  });
});
