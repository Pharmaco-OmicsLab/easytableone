import type { StatisticalResults } from "../../src/core/types";

export const mockStats: StatisticalResults = {
  perVariable: [
    {
      variable: "Age",
      summaryByGroup: {
        "Group A": { mean: 45.234, sd: 5.678, n: 100 },
        "Group B": { mean: 47.891, sd: 6.123, n: 100 },
      },
      overallSummary: { mean: 46.562, sd: 6.001, n: 200 },
      test: {
        name: "Welch's t-test",
        statistic: -3.2,
        pValue: 0.0015,
      },
      smd: 0.45,
      notes: [],
    },
    {
      variable: "Biomarker",
      summaryByGroup: {
        "Group A": { mean: 12.8, sd: 2.1, median: 12.5, q25: 10.1, q75: 15.6, n: 100 },
        "Group B": { mean: 14.5, sd: 2.5, median: 14.2, q25: 11.5, q75: 18.9, n: 100 },
      },
      overallSummary: { mean: 13.6, sd: 2.3, median: 13.3, q25: 10.8, q75: 17.2, n: 200 },
      test: {
        name: "Mann-Whitney U",
        statistic: 4000,
        pValue: 0.00001, // highly significant to test "<0.001" etc
      },
      smd: 0.32,
      notes: [],
    },
    {
      variable: "Gender",
      summaryByGroup: {
        "Group A": { counts: { "Female": 60, "Male": 40 }, percentages: { "Female": 60, "Male": 40 }, n: 100 },
        "Group B": { counts: { "Female": 45, "Male": 55 }, percentages: { "Female": 45, "Male": 55 }, n: 100 },
      },
      overallSummary: { counts: { "Female": 105, "Male": 95 }, percentages: { "Female": 52.5, "Male": 47.5 }, n: 200 },
      test: {
        name: "Chi-square",
        statistic: 4.5,
        pValue: 0.033,
      },
      smd: 0.15,
      notes: [],
    },
    {
      variable: "Condition",
      summaryByGroup: {
        "Group A": { counts: { "Mild": 50, "Moderate": 30, "Severe": 20 }, percentages: { "Mild": 50, "Moderate": 30, "Severe": 20 }, n: 100 },
        "Group B": { counts: { "Mild": 40, "Moderate": 40, "Severe": 20 }, percentages: { "Mild": 40, "Moderate": 40, "Severe": 20 }, n: 100 },
      },
      overallSummary: { counts: { "Mild": 90, "Moderate": 70, "Severe": 40 }, percentages: { "Mild": 45, "Moderate": 35, "Severe": 20 }, n: 200 },
      test: {
        name: "Chi-square",
        statistic: 2.1,
        pValue: 0.349,
      },
      smd: 0.08,
      notes: ["Minimum expected count < 5"],
    }
  ],
  groups: [
    { name: "Group A", n: 100 },
    { name: "Group B", n: 100 },
  ],
  totalN: 200,
  computeMetadata: {
    libVersions: { scipy: "1.0", numpy: "1.0", pandas: "1.0", statsmodels: "1.0" },
    seed: 42,
  },
};

export const dummyPlan: import("../../src/core/types").AnalysisPlan = {
  rulesetVersion: "1.1",
  appVersion: "1.0",
  researchPopulation: "adult",
  studyDesign: "unspecified",
  unitSystem: "metric",
  groupingVariable: "group",
  includedVariables: ["Age"],
  variableConfig: {},
  showSMD: true,
  showPValue: true,
  multipleTestingCorrection: "none",
  randomSeed: 42,
  auditLog: [],
};

export const dummySchema: import("../../src/core/types").Schema = {
  columns: [
    { name: "Gender", confirmedType: "binary", inferredType: "binary", cardinalityTier: "ok", levels: [{code: "Female", label: "Females"}, {code: "Male", label: "Males"}] },
    { name: "Condition", confirmedType: "categorical_nominal", inferredType: "categorical_nominal", cardinalityTier: "ok" }
  ]
};
