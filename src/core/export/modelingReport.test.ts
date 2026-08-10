import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { ModelingResults } from "../modeling/types";
import { buildModelingReportMarkdown, exportModelingReportDocx } from "./modelingReport";

const modelingResults: ModelingResults = {
  schemaFingerprint: "fp",
  generatedAt: "2026-06-29T00:00:00.000Z",
  setup: {
    outcome: "outcome",
    predictors: ["age", "marker"],
    referenceLevels: {},
    imputation: { policy: "complete_case", m: 20 },
    goal: "adjust",
    seed: 42,
    model: "ridge",
    lambdaRule: "lambda_1se",
    validationB: 200,
    ciBootstrapB: 200,
    fastMode: true,
    subgroupVars: ["sex"],
  },
  logistic: {
    model: "ridge",
    lambda: 0.12,
    selected: ["age", "marker"],
    equation: "logit(p) = -1 + 0.2*age",
    diagnostics: {},
    regime: {
      n: 80,
      events: 20,
      nonevents: 60,
      p: 6,
      epv: 3.33,
      pGeN: false,
      recommendedModels: ["ridge"],
      plainMleAllowed: false,
      rationale: "EPV was limited, so ridge was recommended over plain MLE.",
    },
    univariate: [{ label: "Age", or: 1.2, ciLow: 1.01, ciHigh: 1.5, p: 0.03 }],
    adjusted: [{ label: "Age", or: 1.1, ciLow: 0.98, ciHigh: 1.3, p: 0.08 }],
    validation: {
      aucApparent: 0.82,
      aucOptimism: 0.04,
      aucCorrected: 0.78,
      aucCorrectedCi: [0.71, 0.84],
      calibrationSlope: 0.9,
      calibrationSlopeCi: [0.7, 1.1],
      calibrationIntercept: 0.02,
      calibrationInterceptCi: [-0.1, 0.14],
      brier: 0.16,
      brierCi: [0.12, 0.2],
      ciMethod: "bootstrap_oob",
      ciLevel: 0.95,
      rocCurve: [],
      calibrationCurve: [],
    },
    decisionCurve: {
      basis: "apparent",
      prevalence: 0.25,
      points: [
        { threshold: 0.1, netBenefit: 0.18, netBenefitTreatAll: 0.167 },
        { threshold: 0.2, netBenefit: 0.12, netBenefitTreatAll: 0.063 },
      ],
    },
    subgroups: [
      {
        variable: "sex",
        basis: "apparent",
        levels: [
          { level: "F", n: 40, events: 10, auc: 0.82, calibrationSlope: 0.95, brier: 0.14 },
          { level: "M", n: 38, events: 9, auc: 0.73, calibrationSlope: 0.81, brier: 0.18 },
          { level: "Unknown", n: 2, events: 1, auc: null, calibrationSlope: null, brier: null, reason: "insufficient_events" },
        ],
      },
    ],
  },
  ml: {
    folds: { nSplits: 5, nRepeats: 3, seed: 42 },
    warnings: ["Reduced CV folds because the minority class was small."],
    classificationThreshold: 0.5,
    comparison: [
      {
        model: "Random Forest",
        auc: { mean: 0.9, sd: 0.05, ciLow: 0.84, ciHigh: 0.96, ciBasis: "logit" },
        sens: { mean: 0.8, sd: 0.1, ciLow: 0.7, ciHigh: 0.9 },
        spec: { mean: 0.85, sd: 0.08, ciLow: 0.78, ciHigh: 0.92 },
        balacc: { mean: 0.825, sd: 0.06, ciLow: 0.77, ciHigh: 0.88 },
      },
    ],
    models: [
      {
        name: "Random Forest",
        metrics: {
          auc: { mean: 0.9, sd: 0.05, ciLow: 0.84, ciHigh: 0.96 },
          sens: { mean: 0.8, sd: 0.1, ciLow: 0.7, ciHigh: 0.9 },
          spec: { mean: 0.85, sd: 0.08, ciLow: 0.78, ciHigh: 0.92 },
          balacc: { mean: 0.825, sd: 0.06, ciLow: 0.77, ciHigh: 0.88 },
        },
        roc: { grid: [0, 1], mean: [0, 1], sd: [0, 0] },
        varImportance: [{ name: "marker", score: 100 }],
        calibration: { slope: 0.9, intercept: 0.01, brier: 0.12, curve: [] },
        confusion: { tp: 4, fp: 1, fn: 2, tn: 8 },
        classificationThreshold: 0.5,
        decisionCurve: {
          basis: "pooled_repeated_cv",
          prevalence: 0.4,
          points: [
            { threshold: 0.1, netBenefit: 0.31, netBenefitTreatAll: 0.333 },
            { threshold: 0.2, netBenefit: 0.24, netBenefitTreatAll: 0.25 },
          ],
        },
        subgroups: [
          {
            variable: "sex",
            basis: "pooled_repeated_cv",
            levels: [
              { level: "F", n: 40, events: 10, auc: 0.84, calibrationSlope: 0.9, brier: 0.13 },
              { level: "M", n: 38, events: 9, auc: 0.76, calibrationSlope: 0.82, brier: 0.17 },
            ],
          },
        ],
      },
    ],
  },
};

describe("modeling report export", () => {
  it("renders all report sections and shared method rationales in markdown deterministically", () => {
    const first = buildModelingReportMarkdown(modelingResults);
    const second = buildModelingReportMarkdown(modelingResults);

    expect(first).toBe(second);
    expect(first).toContain("## Steps taken");
    expect(first).toContain("## Chosen models and methods");
    expect(first).toContain("## Warnings raised and override status");
    expect(first).toContain("## Results");
    expect(first).toContain("## Methods paragraph");
    expect(first).toContain("EPV was limited, so ridge was recommended over plain MLE.");
    expect(first).toContain("Permutation importance");
    expect(first).toContain("100-point false-positive-rate grid");
    expect(first).toContain("lambda_1se");
    expect(first).toContain("Reduced CV folds");
    expect(first).toContain("No class-imbalance resampling");
    expect(first).toContain("classification threshold of 0.50");
    expect(first).toContain("training folds only");
    expect(first).toContain("no information from held-out patients");
    expect(first).toContain("optimism-corrected bootstrap");
    expect(first).toContain("original scale");
    expect(first).toContain("reference level");
    expect(first).toContain("WebAssembly");
    expect(first).toContain("not exported as portable fitted objects");
    expect(first).toContain("TRIPOD+AI reporting checklist");
    expect(first).toContain("does not by itself make a study TRIPOD+AI compliant");
    expect(first).toContain("95% CI 0.710 to 0.840");
    expect(first).toContain("AUC 95% interval across CV repetitions");
    expect(first).toContain("0.840 to 0.960");
    expect(first).toContain("+/- SD describes per-repeat spread");
    expect(first).toContain("logit scale (Fisher z for MCC) and back-transformed");
    expect(first).toContain("not a confidence interval for performance on new patients");
    expect(first).toContain("Performance intervals");
    expect(first).toContain("Clinical utility (decision-curve analysis)");
    expect(first).toContain("Decision-curve analysis (net benefit)");
    expect(first).toContain("basis: apparent");
    expect(first).toContain("basis: pooled_repeated_cv");
    expect(first).toContain("threshold range 0.10-0.20");
    expect(first).toContain("Performance by subgroup (fairness)");
    expect(first).toContain("does not itself adjudicate fairness or mitigate disparities");
    expect(first).toContain("Largest AUC difference across sex: 0.090");
    expect(first).toContain("Too few events to estimate reliably");
  });

  it("builds a valid docx with modeling headings", async () => {
    const onePixelPng = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
    const blob = await exportModelingReportDocx(modelingResults, null, "1.0", [
      { id: "modeling-logistic-decision-curve", caption: "Logistic regression: decision curve (net benefit)", base64Png: onePixelPng },
    ]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const documentXml = await zip.file("word/document.xml")!.async("string");

    expect(documentXml).toContain("Modeling Report");
    expect(documentXml).toContain("Chosen models and methods");
    expect(documentXml).toContain("Machine-learning comparison");
    expect(documentXml).toContain("Clinical utility");
    expect(documentXml).toContain("decision-curve");
    expect(documentXml).toContain("Benchmark figures");
    expect(documentXml).toContain("Logistic regression");
    expect(zip.file("word/media/image1.png")).toBeDefined();
    expect(documentXml).toContain("95% CI");
    expect(documentXml).toContain("95% interval across CV repetitions");
    expect(documentXml).toContain("logit scale (Fisher z for MCC) and back-transformed");
    expect(documentXml).toContain("Performance by subgroup");
    expect(documentXml).toContain("Too few events to estimate reliably");
  });

  it("exports displayLabel, displayEquation, and not estimable CIs in markdown", () => {
    const customResults: ModelingResults = {
      ...modelingResults,
      logistic: {
        ...modelingResults.logistic!,
        univariate: [{ label: "sex=2.0", displayLabel: "Sex: Male (vs Female)", or: 1.2, ciLow: null, ciHigh: null, p: 0.03 }],
        adjusted: [{ label: "sex=2.0", displayLabel: "Sex: Male (vs Female)", or: 1.1, ciLow: null, ciHigh: null, p: 0.08 }],
        equation: "logit(p) = -1 + 0.2*(sex=2.0)",
        displayEquation: "ln(odds) = -1 + 0.2*(Sex: Male (vs Female))",
      },
    };

    const markdown = buildModelingReportMarkdown(customResults);
    expect(markdown).toContain("Sex: Male (vs Female)");
    expect(markdown).not.toContain("sex=2.0");
    expect(markdown).toContain("ln(odds) = -1 + 0.2*(Sex: Male (vs Female))");
    expect(markdown).not.toContain("logit(p) = -1 + 0.2*(sex=2.0)");
    expect(markdown).toContain("not estimable");
  });

  it("exports unstable validation metrics as not reportable with the reason", () => {
    const customResults: ModelingResults = {
      ...modelingResults,
      logistic: modelingResults.logistic && {
        ...modelingResults.logistic,
        validation: modelingResults.logistic.validation && {
          ...modelingResults.logistic.validation,
          calibrationSlope: null,
          calibrationSlopeCi: null,
          unstableMetrics: ["calibration_slope"],
          unstableReason: "One or more validation metrics could not be reliably estimated - this is typically caused by separation.",
        },
      },
    };

    const markdown = buildModelingReportMarkdown(customResults);

    expect(markdown).toContain("calibration slope not reportable");
    expect(markdown).toContain("Not reportable: calibration_slope");
    expect(markdown).toContain("typically caused by separation");
    expect(markdown).toContain("AUC 0.780");
  });
});
