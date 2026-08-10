import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "./store";
import type { DataFrame, Schema } from "./core/types";
import type { EDAResults } from "./core/eda/types";
import type { ModelingResults, ModelingSetup } from "./core/modeling/types";

const schema: Schema = {
  columns: [{ name: "a", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" }],
};

const data: DataFrame = {
  columns: [{ name: "a", originalName: "a" }],
  rows: [[1]],
  meta: {
    sourceFile: "test.csv",
    parseWarnings: [],
    locale: { decimalSeparator: ".", thousandSeparator: "," },
    detectedHeaderRow: 0,
    confirmedHeaderRow: 0,
    encoding: "utf-8",
    missingSentinels: [],
  },
};

const edaResults: EDAResults = {
  missingness: { perVariable: [], indicatorCorrelations: [], heatmapPng: null },
  correlations: { pairs: [], flagged: [], nContinuous: 0, variableOrder: [] },
  bivariate: null,
  schemaFingerprint: "old",
  generatedAt: "2026-06-27T00:00:00.000Z",
};

const modelingSetup: ModelingSetup = {
  outcome: "old_outcome",
  predictors: ["old_predictor"],
  referenceLevels: {},
  imputation: { policy: "complete_case", m: 20 },
  goal: "adjust",
  seed: 42,
  model: "ridge",
  lambdaRule: "lambda_1se",
  validationB: 200,
  ciBootstrapB: 200,
  fastMode: true,
};

const modelingResults: ModelingResults = {
  schemaFingerprint: "old",
  setup: modelingSetup,
  logistic: null,
  ml: null,
  generatedAt: "2026-06-27T00:00:00.000Z",
};

const plan = {
  rulesetVersion: "1.0",
  appVersion: "1.0",
  groupingVariable: "group",
  includedVariables: ["a"],
  variableConfig: {},
  showSMD: true,
  showPValue: true,
  multipleTestingCorrection: "none",
  randomSeed: 42,
  auditLog: [],
} as any;

beforeEach(() => {
  useStore.setState({
    data: null,
    schema: null,
    plan: null,
    edaResults: null,
    modelingSetup: null,
    modelingResults: null,
  });
});

describe("store EDA cache invalidation", () => {
  it("clears EDA results when schema changes", () => {
    useStore.setState({ edaResults });
    useStore.getState().setSchema(schema);
    expect(useStore.getState().edaResults).toBeNull();
  });

  it("clears EDA results when data changes", () => {
    useStore.setState({ edaResults });
    useStore.getState().setData(data);
    expect(useStore.getState().edaResults).toBeNull();
  });

  it("preserves EDA and modeling results when data is fingerprint-equal", () => {
    useStore.setState({ data, schema, edaResults, modelingSetup, modelingResults });
    useStore.getState().setData({ ...data, rows: [[1]] });
    expect(useStore.getState().edaResults).toBe(edaResults);
    expect(useStore.getState().modelingSetup).toBe(modelingSetup);
    expect(useStore.getState().modelingResults).toBe(modelingResults);
  });

  it("clears EDA and modeling results when data values change", () => {
    useStore.setState({ data, schema, edaResults, modelingSetup, modelingResults });
    useStore.getState().setData({ ...data, rows: [[2]] });
    expect(useStore.getState().edaResults).toBeNull();
    expect(useStore.getState().modelingSetup).toBeNull();
    expect(useStore.getState().modelingResults).toBeNull();
  });

  it("preserves results for display-label-only schema edits", () => {
    useStore.setState({ data, schema, edaResults, modelingSetup, modelingResults });
    useStore.getState().updateSchemaColumn("a", { displayLabel: "Age" });
    expect(useStore.getState().schema?.columns[0].displayLabel).toBe("Age");
    expect(useStore.getState().edaResults).toBe(edaResults);
    expect(useStore.getState().modelingSetup).toBe(modelingSetup);
    expect(useStore.getState().modelingResults).toBe(modelingResults);
  });

  it("clears results when a modeling-relevant schema field changes", () => {
    useStore.setState({ data, schema, edaResults, modelingSetup, modelingResults });
    useStore.getState().updateSchemaColumn("a", { confirmedType: "binary" });
    expect(useStore.getState().edaResults).toBeNull();
    expect(useStore.getState().modelingSetup).toBeNull();
    expect(useStore.getState().modelingResults).toBeNull();
  });
});

describe("store modeling setup invalidation", () => {
  it("clears stale modeling setup when schema changes", () => {
    useStore.setState({ modelingSetup });
    useStore.getState().setSchema(schema);
    expect(useStore.getState().modelingSetup).toBeNull();
  });

  it("clears stale modeling setup when data changes", () => {
    useStore.setState({ modelingSetup });
    useStore.getState().setData(data);
    expect(useStore.getState().modelingSetup).toBeNull();
  });

  it("preserves modeling results when an equivalent setup is re-committed", () => {
    useStore.setState({ modelingSetup, modelingResults });
    useStore.getState().setModelingSetup({ ...modelingSetup, predictors: [...modelingSetup.predictors] });
    expect(useStore.getState().modelingResults).toBe(modelingResults);
  });

  it("clears modeling results when setup changes", () => {
    useStore.setState({ modelingSetup, modelingResults });
    useStore.getState().setModelingSetup({ ...modelingSetup, model: "firth" });
    expect(useStore.getState().modelingResults).toBeNull();
  });

  it("preserves modeling results when an equivalent plan is re-committed", () => {
    useStore.setState({ plan, modelingResults });
    useStore.getState().setPlan({ ...plan, includedVariables: ["a"] });
    expect(useStore.getState().modelingResults).toBe(modelingResults);
  });

  it("clears modeling results when a modeling-relevant plan field changes", () => {
    useStore.setState({ plan, modelingResults });
    useStore.getState().setPlan({ ...plan, randomSeed: 99 });
    expect(useStore.getState().modelingResults).toBeNull();
  });

  it("preserves results across simulated navigation recommits", () => {
    useStore.setState({ data, schema, plan, modelingSetup, modelingResults, edaResults });
    useStore.getState().setPlan({ ...plan });
    useStore.getState().setModelingSetup({ ...modelingSetup });
    expect(useStore.getState().modelingResults).toBe(modelingResults);
    expect(useStore.getState().edaResults).toBe(edaResults);
  });
});

describe("store explanation depth", () => {
  it("defaults to concise and can switch to deep", () => {
    useStore.setState({ explanationDepth: "concise" });
    expect(useStore.getState().explanationDepth).toBe("concise");
    useStore.getState().setExplanationDepth("deep");
    expect(useStore.getState().explanationDepth).toBe("deep");
  });
});

describe("store global modal state", () => {
  it("defaults FAQ, About, and Welcome modals closed and exposes setters", () => {
    useStore.setState({ faqOpen: false, aboutOpen: false, welcomeOpen: false });
    expect(useStore.getState().faqOpen).toBe(false);
    expect(useStore.getState().aboutOpen).toBe(false);
    expect(useStore.getState().welcomeOpen).toBe(false);

    useStore.getState().setFaqOpen(true);
    useStore.getState().setAboutOpen(true);
    useStore.getState().setWelcomeOpen(true);

    expect(useStore.getState().faqOpen).toBe(true);
    expect(useStore.getState().aboutOpen).toBe(true);
    expect(useStore.getState().welcomeOpen).toBe(true);
  });
});
