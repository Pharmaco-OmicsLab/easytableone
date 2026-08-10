import { describe, expect, it } from "vitest";
import type { UnifiedReportContext, UnifiedReportSections } from "./unifiedReport";
import { buildUnifiedReport } from "./unifiedReport";

const testJournalId = ["N", "E", "J", "M"].join("");

const sections: UnifiedReportSections = {
  table1: true,
  dataQuality: true,
  eda: true,
  modeling: true,
  methods: true,
  education: false,
};

function context(overrides: Partial<UnifiedReportContext> = {}): UnifiedReportContext {
  return {
    stats: {
      perVariable: [
        {
          variable: "age",
          summaryByGroup: { control: { mean: 10, sd: 1, n: 2 }, case: { mean: 12, sd: 2, n: 2 } },
          overallSummary: { mean: 11, sd: 1.5, n: 4 },
          test: { name: "Student t-test", statistic: 1, pValue: 0.2 },
          notes: [],
        },
      ],
      groups: [{ name: "control", n: 2 }, { name: "case", n: 2 }],
      totalN: 4,
      computeMetadata: { libVersions: { scipy: "1.16.0", pandas: "2.3.0" }, seed: 42 },
    } as any,
    schema: {
      columns: [
        { name: "group", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
        { name: "age", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok", displayLabel: "Age" },
      ],
    } as any,
    plan: {
      rulesetVersion: "1.3",
      appVersion: "1.0",
      groupingVariable: "group",
      includedVariables: ["age"],
      variableConfig: {},
      showSMD: false,
      showPValue: true,
      multipleTestingCorrection: "none",
      auditLog: [],
    } as any,
    journalId: testJournalId,
    formattedTable: {
      journal: testJournalId,
      rulesetVersion: "1.3",
      title: "Table 1. Baseline characteristics",
      header: ["Characteristic", "Control", "Case", "P-value"],
      rows: [{ indent: 0, cells: ["Age, mean (SD)", "10 (1)", "12 (2)", "0.20"], isSubgroup: false, footnoteRefs: [] }],
      footnotes: [],
      methodsParagraph: "Continuous variables were compared with a t-test.",
    },
    dataQualityRecords: [],
    qaReport: {
      overallCompletenessPercent: 100,
      blockingErrors: [],
      columns: [{ name: "age", missingCount: 0, missingPercent: 0, cardinality: 4, isConstant: false, flags: [] }],
    } as any,
    edaResults: {
      missingness: {
        perVariable: [{ name: "age", displayLabel: "Age", missingCount: 0, missingPct: 0 }],
        indicatorCorrelations: [],
        heatmapPng: "aGVhdG1hcA==",
      },
      correlations: { pairs: [], flagged: [], nContinuous: 1, variableOrder: ["age"] },
      bivariate: null,
      schemaFingerprint: "age:continuous:",
      generatedAt: "2026-06-30T00:00:00.000Z",
    } as any,
    modelingResults: null,
    modelingSetup: null,
    educationDepth: "concise",
    appVersion: "1.0",
    rulesetVersion: "1.3",
    timestamp: "2026-06-30T12:00:00.000Z",
    ...overrides,
  };
}

describe("buildUnifiedReport", () => {
  it("assembles selected sections in canonical order with contiguous numbering", () => {
    const art = buildUnifiedReport({ ...sections, modeling: false, methods: false }, context());

    expect(art.headings.map((heading) => `${heading.number} ${heading.text}`)).toEqual([
      "1 Data Quality Report",
      "1.1 Summary",
      "1.2 Findings",
      "1.3 QA/QC Details",
      "1.3.1 Blocking issues (0)",
      "1.3.2 Review issues (0)",
      "1.3.3 Advisory — data-quality notes (0)",
      "1.3.4 Advisory — improve your output (0)",
      "2 Exploratory Data Analysis",
      "2.1 Missingness",
      "2.2 Correlations",
      "2.3 Multicollinearity",
      "2.4 Categorical associations",
      "2.5 Bivariate plots",
      "2.6 EDA figures",
      "3 Formal Table 1",
      "3.1 Statistical methods",
      "4 Reproducibility & environment",
    ]);
    expect(art.markdown).toContain("## 3 Formal Table 1");
    expect(art.assets).toEqual([{ id: "eda-missingness", caption: "Missingness heatmap", base64Png: "aGVhdG1hcA==" }]);
  });

  it("omits modeling when results are absent and remains deterministic for a fixed timestamp", () => {
    const first = buildUnifiedReport(sections, context());
    const second = buildUnifiedReport(sections, context());

    expect(first.md).toBe(second.md);
    expect(first.assets).toEqual(second.assets);
    expect(first.markdown).not.toContain("Modeling Report");
  });

  it("keeps the provenance footer metadata-only", () => {
    const art = buildUnifiedReport(sections, context());

    expect(art.md).toContain("EasyTableOne version: 1.0");
    expect(art.md).toContain(`Selected journal: ${testJournalId}`);
    expect(art.md).toContain("scipy 1.16.0");
    expect(art.md).not.toContain("inputDataHash");
  });

  it("adds modeling benchmark figure references and assets to the modeling section", () => {
    const art = buildUnifiedReport(sections, context({
      modelingResults: {
        schemaFingerprint: "fp",
        generatedAt: "2026-06-30T12:00:00.000Z",
        setup: {
          outcome: "group",
          predictors: ["age"],
          referenceLevels: {},
          imputation: { policy: "complete_case", m: 20 },
          goal: "adjust",
          seed: 42,
          model: "ridge",
          lambdaRule: "lambda_1se",
          validationB: 200,
          ciBootstrapB: 200,
          fastMode: true,
        },
        logistic: null,
        ml: {
          folds: { nSplits: 5, nRepeats: 3, seed: 42 },
          warnings: [],
          comparison: [
            {
              model: "RandomForest",
              auc: { mean: 0.7, sd: 0.02 },
              sens: { mean: 0.6, sd: 0.03 },
              spec: { mean: 0.8, sd: 0.04 },
              balacc: { mean: 0.7, sd: 0.02 },
            },
          ],
          models: [
            {
              name: "RandomForest",
              metrics: {
                auc: { mean: 0.7, sd: 0.02 },
                sens: { mean: 0.6, sd: 0.03 },
                spec: { mean: 0.8, sd: 0.04 },
                balacc: { mean: 0.7, sd: 0.02 },
              },
              roc: { grid: [0, 1], mean: [0, 1], sd: [0, 0] },
              varImportance: [{ name: "Age", score: 12 }],
              calibration: {
                slope: 0.9,
                intercept: 0.1,
                curve: [{ predicted: 0.2, observed: 0.25, n: 10 }],
                brier: 0.12,
              },
              confusion: { tp: 8, fp: 2, fn: 1, tn: 9 },
            },
          ],
        },
      } as any,
      modelingFigures: [
        { id: "modeling-roc", caption: "Mean ROC with SD band (repeated cross-validation)", base64Png: "cm9j" },
        { id: "modeling-RandomForest-calibration", caption: "RandomForest: calibration curve", base64Png: "Y2Fs" },
      ],
    }));

    expect(art.md).toContain("Benchmark figures");
    expect(art.md).toContain("TRIPOD+AI reporting checklist");
    expect(art.md).toContain("does not by itself make a study TRIPOD+AI compliant");
    expect(art.md).toContain("asset:modeling-roc");
    expect(art.md).toContain("asset:modeling-RandomForest-calibration");
    expect(art.assets).toEqual(expect.arrayContaining([
      { id: "modeling-roc", caption: "Mean ROC with SD band (repeated cross-validation)", base64Png: "cm9j" },
      { id: "modeling-RandomForest-calibration", caption: "RandomForest: calibration curve", base64Png: "Y2Fs" },
    ]));
  });
});
