import { describe, expect, it } from "vitest";
import type { EDAResults } from "../eda/types";
import { generateEDAReportHtml, generateEDAReportMarkdown, generateEdaSummaryMarkdown } from "./edaReport";

const mockEda: EDAResults = {
  missingness: {
    perVariable: [
      { name: "age", displayLabel: "Age", missingCount: 2, missingPct: 20 },
      { name: "weight", displayLabel: "Weight", missingCount: 0, missingPct: 0 },
    ],
    indicatorCorrelations: [{ colA: "age", displayA: "Age", colB: "weight", displayB: "Weight", correlation: 0.6123 }],
    heatmapPng: "heatmapb64",
  },
  correlations: {
    pairs: [{ colA: "age", displayA: "Age", colB: "weight", displayB: "Weight", r: 0.8123, rho: 0.7456 }],
    flagged: [{ colA: "age", displayA: "Age", colB: "weight", displayB: "Weight", pearsonR: 0.8123, spearmanRho: 0.7456 }],
    nContinuous: 2,
    variableOrder: ["age", "weight"],
  },
  bivariate: {
    groupingVariable: "group",
    groupingDisplayLabel: "Treatment",
    plots: [{ variable: "age", displayLabel: "Age", plotType: "boxplot", png: "plotb64" }],
  },
  schemaFingerprint: "fp",
  generatedAt: "2026-06-27T00:00:00.000Z",
};

describe("edaReport", () => {
  it("generates a self-contained HTML report with PNG charts, no scripts and print CSS", () => {
    const html = generateEDAReportHtml(mockEda, null, "test", "2026-06-27T00:00:00.000Z", "corrchartb64", "missingchartb64");

    expect(html).not.toContain("<script");
    expect(html).not.toContain("cdn.jsdelivr");
    expect(html).not.toContain("unpkg");
    expect(html).not.toContain("vega-embed");
    expect(html).not.toContain("vegaEmbed");
    expect(html).not.toContain("missingness-spec");
    expect(html).not.toContain("correlation-spec");
    expect(html).toContain('<img src="data:image/png;base64,missingchartb64" alt="Missingness by variable (bar chart)" />');
    expect(html).toContain('<img src="data:image/png;base64,corrchartb64" alt="Correlation matrix of continuous variables" />');
    // Two new chart images plus the pre-existing heatmap and one bivariate plot.
    expect(html.match(/src="data:image\/png;base64,/g)).toHaveLength(4);
    expect(html).not.toMatch(/src="https?:/i);
    expect(html).toContain("@media print");
    expect(html).toContain("To save as PDF");
    expect(html).not.toContain("seaborn");
    expect(html).not.toContain("easytable_eda");
  });

  it("omits chart images, still without scripts, when no chart PNGs are supplied", () => {
    const html = generateEDAReportHtml(mockEda);

    expect(html).not.toContain("<script");
    expect(html.match(/src="data:image\/png;base64,/g)).toHaveLength(2);
  });

  it("generates summary markdown with labels, correlations, and grouping variable", () => {
    const md = generateEdaSummaryMarkdown(mockEda);

    expect(md).toContain("EDA Summary");
    expect(md).toContain("Age");
    expect(md).toContain("Pearson r = 0.812");
    expect(md).toContain("Treatment");
    expect(md).not.toMatch(/\b(null|undefined)\b/);
  });

  it("states when no highly correlated pairs were detected", () => {
    const md = generateEdaSummaryMarkdown({
      ...mockEda,
      correlations: { ...mockEda.correlations, flagged: [] },
    });

    expect(md).toContain("No highly correlated pairs were detected.");
    expect(md).not.toMatch(/\b(null|undefined)\b/);
  });

  it("summarizes long schema fingerprints in reader-facing markdown", () => {
    const longFingerprint = Array.from({ length: 30 }, (_, index) => `var${index}:continuous:`).join("|");
    const md = generateEDAReportMarkdown({ ...mockEda, schemaFingerprint: longFingerprint });

    expect(md).toContain("Schema fingerprint: `30 variables; digest ");
    expect(md).not.toContain(longFingerprint);
  });
});
