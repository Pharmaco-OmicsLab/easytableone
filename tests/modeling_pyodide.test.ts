import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { pyodideClient } from "../src/workers/pyodide.client";
import { defaultModelingSetup, isEligibleModelingOutcome } from "../src/core/modeling/types";
import type { DataFrame, Schema } from "../src/core/types";
import { parseCSV } from "../src/core/parser/csv";
import { inferSchema } from "../src/core/schema/inference";

const MATERIALS_DIR = path.resolve(__dirname, "../_materials");
const INTERNAL_BABIES = path.join(MATERIALS_DIR, "samples", "babies.csv");

function getFile(filename: string): File {
  const directPath = path.join(MATERIALS_DIR, filename);
  const filepath = fs.existsSync(directPath)
    ? directPath
    : path.join(MATERIALS_DIR, "samples", filename);
  const buffer = fs.readFileSync(filepath);
  return new File([buffer], filename, { type: "text/csv" });
}

function proxyToPlain(value: any): any {
  if (value?.toJs) return proxyToPlain(value.toJs());
  if (value instanceof Map) return Object.fromEntries(Array.from(value.entries()).map(([key, item]) => [key, proxyToPlain(item)]));
  if (Array.isArray(value)) return value.map((item) => proxyToPlain(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, proxyToPlain(item)]));
  return value;
}

const schema: Schema = {
  columns: [
    { name: "outcome", inferredType: "binary", confirmedType: "binary", levels: [{ code: 0, label: "No" }, { code: 1, label: "Yes" }], cardinalityTier: "ok" },
    { name: "age", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
    { name: "marker", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
    { name: "sex", inferredType: "binary", confirmedType: "binary", levels: [{ code: "F", label: "Female" }, { code: "M", label: "Male" }], cardinalityTier: "ok" },
  ],
};

const data: DataFrame = {
  columns: schema.columns.map((c) => ({ originalName: c.name, name: c.name })),
  rows: [
    [0, 34, 1.1, "F"],
    [0, 45, 1.3, "M"],
    [0, 40, 1.2, "F"],
    [0, 37, 1.5, "M"],
    [1, 68, 3.2, "M"],
    [1, 72, 3.5, "F"],
    [1, 63, 2.8, "M"],
    [1, 59, 2.7, "F"],
    [0, 51, 1.9, "F"],
    [1, 66, 3.1, "M"],
    [0, 47, 1.8, "M"],
    [1, 70, 3.4, "F"],
  ],
  meta: {
    sourceFile: "modeling-fixture.csv",
    parseWarnings: [],
    locale: { decimalSeparator: ".", thousandSeparator: "," },
    detectedHeaderRow: 0,
    confirmedHeaderRow: 0,
    encoding: "utf-8",
    missingSentinels: [],
  },
};

const noisyData: DataFrame = {
  ...data,
  rows: [
    [0, 34, 1.1, "F"],
    [1, 45, 1.3, "M"],
    [0, 40, 1.7, "F"],
    [0, 37, 1.5, "M"],
    [1, 68, 3.2, "M"],
    [0, 72, 2.5, "F"],
    [1, 63, 2.8, "M"],
    [1, 59, 2.1, "F"],
    [0, 51, 1.9, "F"],
    [1, 66, 3.1, "M"],
    [0, 47, 2.8, "M"],
    [1, 70, 3.4, "F"],
    [0, 52, 2.2, "F"],
    [1, 58, 2.4, "M"],
    [0, 61, 2.6, "F"],
    [1, 55, 2.0, "M"],
  ],
};

const endometrialCsv = `NV,PI,EH,HG
0,13,1.64,0
0,16,2.26,0
0,8,3.14,0
0,34,2.68,0
0,20,1.28,0
0,5,2.31,0
0,17,1.8,0
0,10,1.68,0
0,26,1.56,0
0,17,2.31,0
0,8,2.01,0
0,7,1.89,0
0,20,3.15,0
0,10,1.23,0
0,18,1.27,0
0,16,1.76,0
0,18,2,0
0,8,2.64,1
0,29,0.88,1
0,12,1.27,1
0,20,1.37,1
1,38,0.97,1
1,22,1.14,1
1,7,0.88,1
1,25,0.91,1
1,15,0.58,1
0,7,0.97,1
0,28,1.5,0
0,11,1.33,0
0,19,2.37,0
0,10,1.82,0
0,10,3.13,0
0,18,1.31,0
0,14,1.92,0
0,21,1.64,0
0,11,2.01,0
0,17,1.88,0
0,25,1.93,0
0,16,2.11,0
0,19,1.29,0
0,15,1.72,0
0,33,0.75,0
0,24,1.92,0
0,48,1.84,1
0,12,1.11,1
0,19,1.61,1
0,2,1.18,1
1,22,1.44,1
1,40,1.18,1
1,5,0.93,1
1,0,1.17,1
0,21,1.19,1
0,15,1.06,1
0,29,2.02,0
0,15,2.29,0
0,12,2.33,0
0,3,2.9,0
0,20,1.7,0
0,23,1.41,0
0,12,2.25,0
0,22,1.54,0
0,42,1.97,0
0,15,1.75,0
0,13,2.16,0
0,14,2.57,0
0,19,1.37,0
0,12,3.61,0
0,13,2.04,0
0,10,2.17,0
0,12,1.69,1
1,49,0.27,1
0,6,1.84,1
0,5,1.3,1
0,17,0.96,1
1,11,1.01,1
1,21,0.98,1
0,5,0.35,1
1,19,1.02,1
0,33,0.85,1`;

function parseEndometrial(): { data: DataFrame; schema: Schema } {
  const rows = endometrialCsv.split("\n").slice(1).map((line) => line.split(",").map(Number));
  const columns = ["NV", "PI", "EH", "HG"];
  return {
    data: {
      columns: columns.map((name) => ({ originalName: name, name })),
      rows,
      meta: { sourceFile: "endometrial.csv", parseWarnings: [], locale: { decimalSeparator: ".", thousandSeparator: "," }, detectedHeaderRow: 0, confirmedHeaderRow: 0, encoding: "utf-8", missingSentinels: [] },
    },
    schema: {
      columns: [
        { name: "NV", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "PI", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "EH", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "HG", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
      ],
    },
  };
}

function withColumnName(source: DataFrame, from: string, to: string): DataFrame {
  return {
    ...source,
    columns: source.columns.map((c) => c.name === from ? { ...c, name: to, originalName: to } : c),
  };
}

async function runRaw(setup: ReturnType<typeof defaultModelingSetup>, dataOverride: DataFrame = data, schemaOverride: Schema = schema) {
  const raw = await pyodideClient.call("run_logistic_model", [
    JSON.stringify(dataOverride),
    JSON.stringify(schemaOverride),
    JSON.stringify(setup),
  ]);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function runMlRaw(setup: ReturnType<typeof defaultModelingSetup>, dataOverride: DataFrame = data, schemaOverride: Schema = schema) {
  const raw = await pyodideClient.call("run_ml_benchmark", [
    JSON.stringify(dataOverride),
    JSON.stringify(schemaOverride),
    JSON.stringify(setup),
  ]);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function exportModelingRaw(setup: ReturnType<typeof defaultModelingSetup>, dataOverride: DataFrame = data, schemaOverride: Schema = schema) {
  const raw = await pyodideClient.call("export_modeling_data", [
    JSON.stringify(dataOverride),
    JSON.stringify(schemaOverride),
    JSON.stringify(setup),
  ]);
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function loadBabiesFixture(): Promise<{ data: DataFrame; schema: Schema }> {
  const parsed = await parseCSV(getFile("babies.csv"));
  return { data: parsed, schema: { columns: inferSchema(parsed) } };
}

describe("Phase 7 modeling Pyodide integration", () => {
  it("loads sklearn and firthlogist wheels", async () => {
    await pyodideClient.isReady();
    // Documents the Phase 7 bundle delta: sklearn + joblib + threadpoolctl add roughly
    // 10-11 MB and bring the self-hosted Pyodide directory near 74 MB.
    const result = await pyodideClient.call("run_python", [`
import sklearn
from sklearn.linear_model import LogisticRegression
import firthlogist
model = firthlogist.FirthLogisticRegression(max_iter=10)
{"sklearn": sklearn.__version__, "firth_constructible": model is not None, "logreg": LogisticRegression is not None}
`]);
    const converted = result?.toJs ? result.toJs() : result;
    const plain = converted instanceof Map ? Object.fromEntries(converted) : converted;
    expect(plain.sklearn).toBe("1.8.0");
    expect(plain.firth_constructible).toBe(true);
    expect(plain.logreg).toBe(true);
  }, 120_000);

  it("loads and runs sklearn IterativeImputer for MICE", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
from sklearn.experimental import enable_iterative_imputer
from sklearn.impute import IterativeImputer
import numpy as np
arr = np.array([[1.0, 2.0], [2.0, np.nan], [3.0, 6.0], [4.0, 8.0]])
filled = IterativeImputer(random_state=42, sample_posterior=True, max_iter=5).fit_transform(arr)
{"shape": filled.shape, "finite": bool(np.isfinite(filled).all())}
`]);
    const converted = result?.toJs ? result.toJs() : result;
    const plain = converted instanceof Map ? Object.fromEntries(converted) : converted;
    expect(plain.shape).toEqual([4, 2]);
    expect(plain.finite).toBe(true);
  }, 120_000);

  it("diagnoses degenerate design matrices with actionable messages", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import numpy as np
import pandas as pd
healthy = _diagnose_design(pd.DataFrame({"age": [30, 40, 50, 60], "marker": [1.2, 1.8, 2.1, 2.7]}), pd.Series([0, 0, 1, 1]))
constant = _diagnose_design(pd.DataFrame({"all_missing_after_drop": [1, 1, 1, 1], "age": [30, 40, 50, 60]}), pd.Series([0, 0, 1, 1]))
nonfinite = _diagnose_design(pd.DataFrame({"bad": [1, np.nan, 3, 4], "age": [30, 40, 50, 60]}), pd.Series([0, 0, 1, 1]))
collinear = _diagnose_design(pd.DataFrame({"x1": [1, 2, 3, 4], "x2": [1, 2, 3, 4]}), pd.Series([0, 0, 1, 1]))
labeled_schema = {
  "CLISEPSSIS": {"displayLabel": "Sepsis", "levels": [{"code": 1, "label": "Yes"}]},
  "PFMRSNOTH": {"displayLabel": "Other clinical sign", "levels": [{"code": "Oedema", "label": "Oedema"}]},
  "raw_no_label": {"levels": [{"code": 2, "label": ""}]},
}
labeled = _diagnose_design(
  pd.DataFrame({"CLISEPSSIS=1": [1, 0, 1, 0], "PFMRSNOTH=Oedema": [1, 0, 1, 0]}),
  pd.Series([0, 0, 1, 1]),
  labeled_schema,
)
constant_labeled = _diagnose_design(
  pd.DataFrame({"CLISEPSSIS=1": [1, 1, 1, 1]}),
  pd.Series([0, 0, 1, 1]),
  labeled_schema,
)
fallback = _diagnose_design(
  pd.DataFrame({"raw_no_label=3": [1, 0, 1, 0], "raw_no_label=4": [1, 0, 1, 0]}),
  pd.Series([0, 0, 1, 1]),
  labeled_schema,
)
{"healthy": healthy, "constant": constant, "nonfinite": nonfinite, "collinear": collinear, "labeled": labeled, "constant_labeled": constant_labeled, "fallback": fallback}
`]);
    const converted = result?.toJs ? result.toJs() : result;
    const plain = converted instanceof Map ? Object.fromEntries(converted) : converted;
    expect(plain.healthy == null).toBe(true);
    expect(plain.constant).toContain("all_missing_after_drop");
    expect(plain.constant).toContain("MICE");
    expect(plain.nonfinite).toContain("non-finite");
    expect(plain.nonfinite).toContain("bad");
    expect(plain.collinear).toContain("redundant");
    expect(plain.collinear).toMatch(/x1|x2/);
    expect(plain.labeled).toContain("Other clinical sign");
    expect(plain.labeled).toContain("Oedema");
    expect(plain.labeled).toContain("'PFMRSNOTH=Oedema'");
    expect(plain.constant_labeled).toContain("Sepsis");
    expect(plain.constant_labeled).toContain("Yes");
    expect(plain.constant_labeled).toContain("'CLISEPSSIS=1'");
    expect(plain.fallback).toContain("raw_no_label");
    expect(plain.fallback).toContain("'raw_no_label=4'");
    expect(plain.fallback).not.toContain("None");
  }, 120_000);

  it("detects regime and returns finite logistic ORs", async () => {
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 42),
      outcome: "outcome",
      predictors: ["age", "marker", "sex"],
      model: "ridge" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };
    const result = await pyodideClient.fitLogisticModel(data, schema, setup);
    expect(result.regime.n).toBe(12);
    expect(result.adjusted.length).toBeGreaterThan(0);
    expect(result.adjusted.every((row) => row.or === null || Number.isFinite(row.or))).toBe(true);
    expect(result.equation).toMatch(/ln\(p\/\(1-p\)\)/);
    expect(result.validation?.aucCorrected).not.toBeNull();
    expect(result.decisionCurve?.basis).toBe("apparent");
    expect(result.decisionCurve?.points).toHaveLength(99);
    expect(result.decisionCurve?.points[0].threshold).toBeCloseTo(0.01, 9);
  }, 120_000);

  it("resolves logistic outcome event and reference levels through the outcome dictionary", async () => {
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 42, data),
      outcome: "outcome",
      predictors: ["age", "marker"],
      model: "ridge" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };

    const result = await runRaw(setup);

    expect(result.outcome_event_level).toBe("Yes");
    expect(result.outcome_reference_level).toBe("No");
    expect(result.diagnostics.outcome_event_level).toBe("Yes");
    expect(result.diagnostics.outcome_reference_level).toBe("No");
  }, 120_000);

  it("honors explicit outcomePositiveLevel for a majority-class event", async () => {
    await pyodideClient.isReady();
    const majoritySchema: Schema = {
      columns: [
        {
          name: "disease",
          inferredType: "binary",
          confirmedType: "binary",
          levels: [{ code: "Yes", label: "Yes" }, { code: "No", label: "No" }],
          referenceLevel: "Yes",
          cardinalityTier: "ok",
        },
        { name: "marker", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ],
    };
    const majorityData: DataFrame = {
      columns: majoritySchema.columns.map((c) => ({ originalName: c.name, name: c.name })),
      rows: [
        ["Yes", 1], ["Yes", 1], ["Yes", 1], ["Yes", 0],
        ["Yes", 0], ["Yes", 1], ["Yes", 0], ["Yes", 1],
        ["No", 0], ["No", 0], ["No", 1], ["No", 0],
      ],
      meta: data.meta,
    };
    const inferredSetup = {
      ...defaultModelingSetup(majoritySchema, "disease", 42, majorityData),
      outcome: "disease",
      predictors: ["marker"],
      model: "plain" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };
    const explicitSetup = { ...inferredSetup, outcomePositiveLevel: "Yes" };

    const inferred = await runRaw(inferredSetup, majorityData, majoritySchema);
    const explicit = await runRaw(explicitSetup, majorityData, majoritySchema);

    expect(inferred.outcome_event_level).toBe("No");
    expect(inferred.outcome_reference_level).toBe("Yes");
    expect(explicit.outcome_event_level).toBe("Yes");
    expect(explicit.outcome_reference_level).toBe("No");
    expect(explicit.univariate[0].or).toBeCloseTo(1 / inferred.univariate[0].or, 8);
    expect(explicit.adjusted[0].or).toBeCloseTo(1 / inferred.adjusted[0].or, 8);
  }, 120_000);

  it("keeps raw logistic outcome event and reference levels when no dictionary is present", async () => {
    const noDictionarySchema: Schema = {
      columns: schema.columns.map((column) => column.name === "outcome" ? { ...column, levels: undefined } : column),
    };
    const setup = {
      ...defaultModelingSetup(noDictionarySchema, "outcome", 42, data),
      outcome: "outcome",
      predictors: ["age", "marker"],
      model: "ridge" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };

    const result = await runRaw(setup, data, noDictionarySchema);

    expect(result.outcome_event_level).toBe("1");
    expect(result.outcome_reference_level).toBe("0");
  }, 120_000);

  it("labels real bootstrap inference and omits penalized Wald p-values", async () => {
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 7, noisyData),
      outcome: "outcome",
      predictors: ["age", "marker"],
      model: "ridge" as const,
      validationB: 12,
      ciBootstrapB: 12,
      fastMode: true,
    };
    const result = await pyodideClient.fitLogisticModel(noisyData, schema, setup);

    expect(result.validation?.method).toMatch(/bootstrap_optimism|apparent_only/);
    expect(result.validation?.bEffective).toBeGreaterThanOrEqual(0);
    expect(result.adjusted.every((row) => row.p === null)).toBe(true);
    expect(result.adjusted.every((row) => row.ciMethod === "bootstrap_percentile_fixed_lambda" || row.ciMethod === "bootstrap_percentile" || row.ciMethod === "none")).toBe(true);
    expect(result.imputationMethod).toBe("complete_case");
  }, 120_000);

  it("returns logistic validation CIs from successful optimism bootstrap and null CIs for apparent-only validation", async () => {
    const bootstrapSetup = {
      ...defaultModelingSetup(schema, "outcome", 13, noisyData),
      outcome: "outcome",
      predictors: ["age", "marker"],
      model: "ridge" as const,
      validationB: 40,
      ciBootstrapB: 0,
      fastMode: true,
    };
    const bootstrap = await pyodideClient.fitLogisticModel(noisyData, schema, bootstrapSetup);

    expect(bootstrap.validation?.ciMethod).toBe("bootstrap_oob");
    expect(bootstrap.validation?.ciLevel).toBe(0.95);
    expect(bootstrap.validation?.aucCorrectedCi).toHaveLength(2);
    expect(bootstrap.validation?.aucCorrectedCi?.[0]).toBeLessThanOrEqual(bootstrap.validation?.aucCorrected ?? Number.NEGATIVE_INFINITY);
    expect(bootstrap.validation?.aucCorrectedCi?.[1]).toBeGreaterThanOrEqual(bootstrap.validation?.aucCorrected ?? Number.POSITIVE_INFINITY);

    const fullSampleSetup = {
      ...bootstrapSetup,
      validationCiMethod: "full_sample" as const,
    };
    const fullSampleRes = await pyodideClient.fitLogisticModel(noisyData, schema, fullSampleSetup);
    expect(fullSampleRes.validation?.ciMethod).toBe("bootstrap_full_sample");
    expect(fullSampleRes.validation?.aucCorrectedCi).toHaveLength(2);

    const nestedSetup = {
      ...bootstrapSetup,
      validationB: 12,
      validationCiMethod: "nested" as const,
    };
    const nestedRes = await pyodideClient.fitLogisticModel(noisyData, schema, nestedSetup);
    expect(nestedRes.validation?.ciMethod).toBe("bootstrap_nested");
    expect(nestedRes.validation?.aucCorrectedCi).toHaveLength(2);

    const apparent = await pyodideClient.fitLogisticModel(noisyData, schema, { ...bootstrapSetup, validationB: 0 });
    expect(apparent.validation?.method).toBe("apparent_only");
    expect(apparent.validation?.ciMethod).toBe("none");
    expect(apparent.validation?.aucCorrectedCi).toBeNull();
    expect(apparent.validation?.brierCi).toBeNull();
  }, 180_000);

  it("routes separated univariate odds ratios through Firth and keeps clean predictors plain", async () => {
    const separatedSchema: Schema = {
      columns: [
        { name: "outcome", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
        { name: "separates", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ],
    };
    const separatedData: DataFrame = {
      columns: separatedSchema.columns.map((column) => ({ originalName: column.name, name: column.name })),
      rows: Array.from({ length: 40 }, (_, index) => {
        const x = index < 20 ? -1 - index / 100 : 1 + index / 100;
        return [x > 0 ? 1 : 0, x];
      }),
      meta: data.meta,
    };
    const separatedSetup = {
      ...defaultModelingSetup(separatedSchema, "outcome", 42, separatedData),
      outcome: "outcome",
      predictors: ["separates"],
      model: "plain" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };
    const separated = await pyodideClient.fitLogisticModel(separatedData, separatedSchema, separatedSetup);
    const separatedRow = separated.univariate.find((row) => row.label === "separates");
    expect(separatedRow?.method).toBe("firth");
    expect(separatedRow?.or).not.toBeNull();
    expect(Number.isFinite(separatedRow?.or)).toBe(true);
    expect(separatedRow?.ciLow).not.toBeNull();
    expect(separatedRow?.ciHigh).not.toBeNull();
    expect(Number.isFinite(separatedRow?.ciLow)).toBe(true);
    expect(Number.isFinite(separatedRow?.ciHigh)).toBe(true);

    const cleanSetup = {
      ...defaultModelingSetup(schema, "outcome", 42, noisyData),
      outcome: "outcome",
      predictors: ["age"],
      model: "plain" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };
    const clean = await pyodideClient.fitLogisticModel(noisyData, schema, cleanSetup);
    expect(clean.univariate[0]?.method).toBe("plain");
  }, 180_000);

  it("restricts separation value scans to dummy columns while preserving true separation diagnostics", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd

tied_continuous = _separation_from_arrays(
    pd.DataFrame({"age": [40, 40, 50, 50, 60, 60, 70, 70]}),
    pd.Series([0, 0, 0, 1, 1, 0, 1, 1]),
)
threshold_continuous = _separation_from_arrays(
    pd.DataFrame({"marker": [1, 2, 3, 4, 5, 6, 7, 8]}),
    pd.Series([0, 0, 0, 0, 1, 1, 1, 1]),
)
dummy_level = _separation_from_arrays(
    pd.DataFrame({"site=B": [1, 1, 0, 0, 0, 0]}),
    pd.Series([1, 1, 0, 0, 1, 0]),
)
{"tied_continuous": tied_continuous, "threshold_continuous": threshold_continuous, "dummy_level": dummy_level}
`]);
    const plain = proxyToPlain(result);
    expect(plain.tied_continuous.separated).toBe(false);
    expect(plain.tied_continuous.quasi).toBe(false);
    expect(plain.tied_continuous.detection).toBe("dummy_level_scan_plus_fit_diagnostics");
    expect(plain.threshold_continuous.separated || plain.threshold_continuous.quasi).toBe(true);
    expect(plain.dummy_level.separated).toBe(true);
    expect(plain.dummy_level.culprits).toEqual(["site=B"]);
  }, 120_000);

  it("keeps small-scale predictors with large raw coefficients out of quasi-separation", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import numpy as np
import pandas as pd

np.random.seed(123)
x = np.random.normal(0, 0.001, 240)
p = 1 / (1 + np.exp(-(1000 * x)))
y = np.random.binomial(1, p)
sep = _separation_from_arrays(pd.DataFrame({"tiny_scale": x}), pd.Series(y))
fit = sm.Logit(pd.Series(y), sm.add_constant(pd.DataFrame({"tiny_scale": x}), has_constant="add")).fit(disp=False, maxiter=100)
{"sep": sep, "raw_beta": float(fit.params["tiny_scale"]), "std_beta": float(fit.params["tiny_scale"] * np.std(x))}
`]);
    const plain = proxyToPlain(result);
    expect(Math.abs(plain.raw_beta)).toBeGreaterThan(20);
    expect(Math.abs(plain.std_beta)).toBeLessThan(20);
    expect(plain.sep.separated).toBe(false);
    expect(plain.sep.quasi).toBe(false);
  }, 120_000);

  it("labels OR rows without SE or CI as having no CI method", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`{
  "none": _or_row("t", 1.0),
  "wald": _or_row("t", 1.0, se=0.5),
}`]);
    const plain = proxyToPlain(result);
    expect(plain.none.ci_method).toBe("none");
    expect(plain.none.ci_low == null).toBe(true);
    expect(plain.none.ci_high == null).toBe(true);
    expect(plain.wald.ci_method).toBe("wald");
    expect(plain.wald.ci_low).not.toBeNull();
    expect(plain.wald.ci_high).not.toBeNull();
  }, 120_000);

  it("suppresses implausible validation calibration scalars with a disclosed reason", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd
import numpy as np

point = {
    "y": pd.Series([0, 0, 1, 1]),
    "probs": np.asarray([0.1, 0.3, 0.7, 0.9], dtype=float),
    "unmatched": [],
}
df = pd.DataFrame({"outcome": [0, 0, 1, 1], "x": [0, 1, 2, 3]})
schema = {"outcome": {"confirmedType": "binary"}, "x": {"confirmedType": "continuous"}}
setup = {"outcome": "outcome", "predictors": ["x"], "validationB": 2, "validationCiMethod": "full_sample"}
original_bootstrap_engine = _bootstrap_engine
try:
    def fake_bootstrap_engine(df_arg, schema_arg, setup_arg, point_arg, b):
        return {
            "method": "bootstrap_optimism",
            "b_effective": 2,
            "optimism": {"auc": 0.0, "calibration_slope": 210000000000.0, "calibration_intercept": 0.0, "brier": 0.0},
            "performance_ci": {
                "auc": [0.7, 1.0],
                "calibration_slope": [-210000000000.0, -1800000000.0],
                "calibration_intercept": [-0.2, 0.2],
                "brier": [0.01, 0.2],
            },
        }
    _bootstrap_engine = fake_bootstrap_engine
    result = _validate_lr_core(df, schema, setup, point)
finally:
    _bootstrap_engine = original_bootstrap_engine
_dump(result)
`]);
    const plain = typeof result === "string" ? JSON.parse(result) : proxyToPlain(result);
    expect(plain.calibration_slope).toBeNull();
    expect(plain.calibration_slope_ci).toBeNull();
    expect(plain.unstable_metrics).toContain("calibration_slope");
    expect(plain.unstable_reason).toContain("separation");
    expect(plain.auc_corrected).not.toBeNull();
    expect(plain.auc_corrected_ci).toHaveLength(2);
  }, 120_000);

  it("runs MICE point imputation with an explicit method label", async () => {
    const missingData: DataFrame = {
      ...noisyData,
      rows: noisyData.rows.map((row, index) => index % 4 === 0 ? [row[0], null, row[2], row[3]] : row),
    };
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 11, missingData),
      outcome: "outcome",
      predictors: ["age", "marker"],
      model: "ridge" as const,
      imputation: { policy: "mice" as const, m: 2 },
      validationB: 0,
      ciBootstrapB: 0,
      fastMode: true,
    };
    const result = await pyodideClient.fitLogisticModel(missingData, schema, setup);

    expect(result.imputationMethod).toBe("mice_iterativeimputer_numeric_mode_categorical_m2");
    expect(result.adjusted.length).toBeGreaterThan(0);
    expect(result.adjusted.every((row) => row.ciMethod === "none")).toBe(true);
  }, 120_000);

  it("matches Rubin pooling against a hand-computed variance case", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd
pooled = _pool_rubin(
    pd.DataFrame({"x": [0.2, 0.5, 0.8], "z": [1.0, 1.2, 1.1]}),
    pd.DataFrame({"x": [0.1, 0.2, 0.3], "z": [0.4, 0.4, 0.4]}),
    3,
)
{
  "coef": pooled["coef"].to_dict(),
  "se": pooled["se"].to_dict(),
  "df": pooled["df"].to_dict(),
  "ci": {term: [float(row["low"]), float(row["high"])] for term, row in pooled["ci"].iterrows()},
  "pvals": pooled["pvals"].to_dict(),
}
`]);
    const plain = proxyToPlain(result);
    const coef = plain.coef;
    const se = plain.se;
    const df = plain.df;
    const ci = plain.ci;

    const xQbar = (0.2 + 0.5 + 0.8) / 3;
    const xUbar = (0.1 ** 2 + 0.2 ** 2 + 0.3 ** 2) / 3;
    const xB = ((0.2 - xQbar) ** 2 + (0.5 - xQbar) ** 2 + (0.8 - xQbar) ** 2) / 2;
    const xTotal = xUbar + (1 + 1 / 3) * xB;
    const xDf = (3 - 1) * (1 + xUbar / ((1 + 1 / 3) * xB)) ** 2;

    expect(coef.x).toBeCloseTo(xQbar, 9);
    expect(se.x).toBeCloseTo(Math.sqrt(xTotal), 9);
    expect(df.x).toBeCloseTo(xDf, 9);
    expect(ci.x[0]).toBeLessThan(coef.x);
    expect(ci.x[1]).toBeGreaterThan(coef.x);
  }, 120_000);

  describe.skipIf(!fs.existsSync(INTERNAL_BABIES))("internal fixture: babies.csv (modeling imputation)", () => {
  it("runs simple imputation policies on babies.csv without dropping predictor-missing rows", async () => {
    const fixture = await loadBabiesFixture();
    const outcomeIndex = fixture.data.columns.findIndex((column) => column.name === "smoke");
    const outcomeObserved = fixture.data.rows.filter((row) => row[outcomeIndex] !== null && row[outcomeIndex] !== "").length;

    for (const policy of ["mean", "median", "mode", "constant"] as const) {
      const setup = {
        ...defaultModelingSetup(fixture.schema, "smoke", 17, fixture.data),
        outcome: "smoke",
        predictors: ["gestation", "age", "height", "weight", "parity"],
        model: "ridge" as const,
        imputation: { policy, m: 20, constantNumeric: -1, constantLabel: "Unknown" },
        validationB: 0,
        ciBootstrapB: 0,
        fastMode: true,
      };
      const result = await pyodideClient.fitLogisticModel(fixture.data, fixture.schema, setup);
      expect(result.regime.n).toBe(outcomeObserved);
      expect(result.imputationMethod).toBe(`simple_${policy}_numeric_mode_categorical`);
      expect(result.adjusted.length).toBeGreaterThan(0);
    }
  }, 240_000);

  it("runs kNN and RF imputation on babies.csv without dropping predictor-missing rows", async () => {
    const fixture = await loadBabiesFixture();
    const outcomeIndex = fixture.data.columns.findIndex((column) => column.name === "smoke");
    const gestationIndex = fixture.data.columns.findIndex((column) => column.name === "gestation");
    const ageIndex = fixture.data.columns.findIndex((column) => column.name === "age");
    const weightIndex = fixture.data.columns.findIndex((column) => column.name === "weight");
    const missingData: DataFrame = {
      ...fixture.data,
      rows: fixture.data.rows.map((row, index) => {
        const next = [...row];
        if (index % 7 === 0) next[gestationIndex] = null;
        if (index % 11 === 0) next[ageIndex] = null;
        if (index % 13 === 0) next[weightIndex] = null;
        return next;
      }),
    };
    const outcomeObserved = missingData.rows.filter((row) => row[outcomeIndex] !== null && row[outcomeIndex] !== "").length;

    for (const policy of ["knn", "rf"] as const) {
      const setup = {
        ...defaultModelingSetup(fixture.schema, "smoke", 19, missingData),
        outcome: "smoke",
        predictors: ["gestation", "age", "height", "weight"],
        model: "ridge" as const,
        imputation: { policy, m: 20, knnNeighbors: 3 },
        validationB: 0,
        ciBootstrapB: 0,
        fastMode: true,
      };
      const result = await pyodideClient.fitLogisticModel(missingData, fixture.schema, setup);
      expect(result.regime.n).toBe(outcomeObserved);
      expect(result.imputationMethod).toBe(`${policy}_numeric_mode_categorical`);
      expect(result.adjusted.length).toBeGreaterThan(0);
    }
  }, 300_000);
  });

  it("uses the outcome helper in inference-path multivariate imputers without leaking it into the design", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import math
import pandas as pd

rows = []
for i in range(50):
    signal = None if i < 5 else 0.1 + 0.1 * (i % 5)
    rows.append({"outcome": 0, "signal": signal, "noise": float((i % 7) + 1)})
for i in range(50):
    signal = None if i < 40 else 0.4 + 0.1 * (i % 5)
    rows.append({"outcome": 1, "signal": signal, "noise": float((i % 7) + 1)})
df = pd.DataFrame(rows)
schema = {
    "outcome": {"name": "outcome", "confirmedType": "binary"},
    "signal": {"name": "signal", "confirmedType": "continuous"},
    "noise": {"name": "noise", "confirmedType": "continuous"},
}
base_setup = {
    "outcome": "outcome",
    "predictors": ["signal", "noise"],
    "referenceLevels": {},
    "goal": "adjust",
    "seed": 123,
    "model": "ridge",
    "lambdaRule": "lambda_1se",
    "validationB": 0,
    "ciBootstrapB": 0,
    "fastMode": True,
}

def fit_or(policy, include_outcome):
    setup = dict(base_setup)
    setup["imputation"] = {"policy": policy, "m": 2, "knnNeighbors": 3}
    if include_outcome is not None:
        setup["imputation"]["includeOutcome"] = include_outcome
    fit = _fit_once(df, schema, setup, seed=123, fixed_c=0.1, inner_cv=2)
    return float(math.exp(float(fit["coef"].get("signal", 0.0)))), list(fit["X"].columns)

out = {}
for policy in ["mice", "knn", "rf"]:
    default_or, default_cols = fit_or(policy, None)
    included_or, included_cols = fit_or(policy, True)
    excluded_or, excluded_cols = fit_or(policy, False)
    out[policy] = {
        "default_or": default_or,
        "included_or": included_or,
        "excluded_or": excluded_or,
        "default_cols": default_cols,
        "included_cols": included_cols,
        "excluded_cols": excluded_cols,
    }
out
`]);
    const plain = proxyToPlain(result);

    for (const policy of ["mice", "knn", "rf"] as const) {
      expect(Math.abs(plain[policy].included_or - 1)).toBeGreaterThan(Math.abs(plain[policy].excluded_or - 1));
      expect(plain[policy].included_cols).not.toContain("__outcome_helper__");
      expect(plain[policy].excluded_cols).not.toContain("__outcome_helper__");
      expect(plain[policy].default_cols).not.toContain("__outcome_helper__");
    }
    expect(plain.mice.default_or).toBeCloseTo(plain.mice.included_or, 8);
    expect(plain.knn.default_or).toBeCloseTo(plain.knn.excluded_or, 8);
    expect(plain.rf.default_or).toBeCloseTo(plain.rf.excluded_or, 8);
    expect(plain.mice.default_or).toBeGreaterThan(plain.knn.default_or);
    expect(plain.mice.default_or).toBeGreaterThan(plain.rf.default_or);
  }, 300_000);

  it("keeps ML benchmark fold imputation predictor-only", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd

captured = []
original_fit_fold_imputer = _fit_fold_imputer
def spy_fit_fold_imputer(X_train, X_test, setup, policy, seed):
    captured.append({"train": list(X_train.columns), "test": list(X_test.columns)})
    return original_fit_fold_imputer(X_train, X_test, setup, policy, seed)

_fit_fold_imputer = spy_fit_fold_imputer
try:
    df = pd.DataFrame({
        "outcome": [0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0, 1],
        "age": [30, None, 36, 42, 55, 60, None, 66, 39, 58, 44, 62],
        "marker": [1.0, 1.2, None, 1.4, 2.5, 2.8, 3.0, None, 1.6, 2.7, 1.5, 2.9],
    })
    schema = {
        "outcome": {"name": "outcome", "confirmedType": "binary"},
        "age": {"name": "age", "confirmedType": "continuous"},
        "marker": {"name": "marker", "confirmedType": "continuous"},
    }
    setup = {
        "outcome": "outcome",
        "predictors": ["age", "marker"],
        "referenceLevels": {},
        "imputation": {"policy": "knn", "m": 20, "knnNeighbors": 2, "includeOutcome": True},
        "goal": "adjust",
        "seed": 42,
        "model": "ridge",
        "lambdaRule": "lambda_1se",
        "validationB": 0,
        "ciBootstrapB": 0,
        "fastMode": True,
    }
    _ml_artifacts(df, schema, setup)
finally:
    _fit_fold_imputer = original_fit_fold_imputer

{
  "called": len(captured),
  "has_outcome": any("outcome" in item["train"] or "outcome" in item["test"] for item in captured),
  "has_helper": any("__outcome_helper__" in item["train"] or "__outcome_helper__" in item["test"] for item in captured),
}
`]);
    const plain = proxyToPlain(result);

    expect(plain.called).toBeGreaterThan(0);
    expect(plain.has_outcome).toBe(false);
    expect(plain.has_helper).toBe(false);
  }, 180_000);

  it("re-runs ML-based imputation inside each logistic bootstrap resample", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import json
original_ml_impute_frame = _ml_impute_frame
calls = {"count": 0, "seeds": []}
def counted_ml_impute_frame(df, schema, setup, policy, seed):
    calls["count"] += 1
    calls["seeds"].append(int(seed))
    return original_ml_impute_frame(df, schema, setup, policy, seed)
_ml_impute_frame = counted_ml_impute_frame
try:
    data = {
      "columns": [{"name": "outcome"}, {"name": "age"}, {"name": "marker"}],
      "rows": [[0, 30, 1.0], [0, 35, None], [0, 40, 1.4], [0, 45, 1.8], [1, 55, 2.1], [1, 60, None], [1, 65, 2.8], [1, 70, 3.0]]
    }
    schema = {"columns": [
      {"name": "outcome", "confirmedType": "binary"},
      {"name": "age", "confirmedType": "continuous"},
      {"name": "marker", "confirmedType": "continuous"}
    ]}
    setup = {
      "outcome": "outcome",
      "predictors": ["age", "marker"],
      "referenceLevels": {},
      "imputation": {"policy": "knn", "m": 20, "knnNeighbors": 2},
      "goal": "adjust",
      "seed": 314,
      "model": "ridge",
      "lambdaRule": "lambda_1se",
      "validationB": 0,
      "ciBootstrapB": 3,
      "fastMode": True
    }
    parsed = json.loads(run_logistic_model(json.dumps(data), json.dumps(schema), json.dumps(setup)))
finally:
    _ml_impute_frame = original_ml_impute_frame
{"count": calls["count"], "seeds": calls["seeds"], "method": parsed.get("imputation_method")}
`]);
    const plain = proxyToPlain(result);
    expect(plain.method).toBe("knn_numeric_mode_categorical");
    expect(plain.count).toBeGreaterThan(1);
    expect(new Set(plain.seeds).size).toBeGreaterThan(1);
  }, 180_000);

  it("uses configured constant fills for numeric and categorical predictors", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd
df = pd.DataFrame({"outcome": [0, 1, 0], "age": [20, None, 40], "sex": ["F", None, "M"]})
schema = {
  "outcome": {"confirmedType": "binary"},
  "age": {"confirmedType": "continuous"},
  "sex": {"confirmedType": "binary"},
}
setup = {
  "outcome": "outcome",
  "predictors": ["age", "sex"],
  "imputation": {"policy": "constant", "constantNumeric": 99, "constantLabel": "Unknown"},
}
filled, unmatched = _simple_impute_frame(df, schema, setup, "constant")
{"age": filled["age"].tolist(), "sex": filled["sex"].tolist(), "unmatched": unmatched}
`]);
    const plain = proxyToPlain(result);
    expect(plain.age).toEqual([20, 99, 40]);
    expect(plain.sex).toEqual(["F", "Unknown", "M"]);
    expect(plain.unmatched).toEqual([]);
  }, 120_000);

  describe.skipIf(!fs.existsSync(INTERNAL_BABIES))("internal fixture: babies.csv (Rubin pooled inference)", () => {
  it("returns Rubin pooled inference for MICE plain logistic on babies.csv", async () => {
    const fixture = await loadBabiesFixture();
    const stressData: DataFrame = {
      ...fixture.data,
      rows: fixture.data.rows.map((row, index) => {
        const next = [...row];
        if (index % 3 === 0) next[fixture.data.columns.findIndex((column) => column.name === "gestation")] = null;
        if (index % 4 === 0) next[fixture.data.columns.findIndex((column) => column.name === "age")] = null;
        if (index % 5 === 0) next[fixture.data.columns.findIndex((column) => column.name === "weight")] = null;
        return next;
      }),
    };
    const baseSetup = {
      ...defaultModelingSetup(fixture.schema, "smoke", 23, stressData),
      outcome: "smoke",
      predictors: ["gestation", "age", "height", "weight"],
      model: "plain" as const,
      validationB: 0,
      ciBootstrapB: 0,
      fastMode: true,
    };
    const complete = await pyodideClient.fitLogisticModel(fixture.data, fixture.schema, {
      ...baseSetup,
      imputation: { policy: "complete_case", m: 20 },
    });
    const mice = await pyodideClient.fitLogisticModel(stressData, fixture.schema, {
      ...baseSetup,
      imputation: { policy: "mice", m: 3 },
    });

    expect(mice.imputationMethod).toBe("mice_iterativeimputer_numeric_mode_categorical_m3");
    expect(mice.adjusted.length).toBeGreaterThan(0);
    expect(mice.adjusted.every((row) => row.ciMethod === "rubin")).toBe(true);
    expect(mice.adjusted.every((row) => row.p !== null && Number.isFinite(row.p))).toBe(true);
    expect(mice.adjusted.every((row) => row.ciLow !== null && row.ciHigh !== null && row.ciHigh > row.ciLow)).toBe(true);
    const completeWidths = new Map(complete.adjusted.map((row) => [row.label, Math.log(row.ciHigh ?? Number.NaN) - Math.log(row.ciLow ?? Number.NaN)]));
    const miceWidths = mice.adjusted
      .map((row) => [row.label, Math.log(row.ciHigh ?? Number.NaN) - Math.log(row.ciLow ?? Number.NaN)] as const)
      .filter(([, width]) => Number.isFinite(width));
    expect(miceWidths.some(([label, width]) => width > (completeWidths.get(label) ?? Number.POSITIVE_INFINITY))).toBe(true);
  }, 240_000);
  });

  it("uses >=50% variable-level voting for penalized MICE selection", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd

original_fit_once = _fit_once
original_can_mice = _can_mice
calls = {"i": 0}
terms = ["age", "marker", "treatment=Drug", "treatment=Placebo"]
sources = ["age", "marker", "treatment", "treatment"]
selected_by_fit = [
    ["age", "treatment=Drug"],
    ["age"],
    ["marker", "treatment=Placebo"],
    [],
]

def fake_fit_once(df, schema, setup, seed=None, force_complete=False, fixed_c=None, inner_cv=None, resolved_model=None):
    idx = calls["i"]
    calls["i"] += 1
    selected = selected_by_fit[idx]
    coef = pd.Series({term: float(idx + 1) for term in selected}, dtype=float)
    return {
        "X": pd.DataFrame({term: [0.0, 1.0, 0.0, 1.0] for term in terms}),
        "y": pd.Series([0, 1, 0, 1]),
        "terms": terms,
        "sources": sources,
        "model": "lasso",
        "intercept": 0.0,
        "coef": coef,
        "se": None,
        "ci": None,
        "pvals": pd.Series(dtype=float),
        "probs": pd.Series([0.5, 0.5, 0.5, 0.5]),
        "selected": selected,
        "method_fallback": False,
        "lambda": 1.0,
        "lambda_rule_applied": "lambda_1se",
        "c_value": 1.0,
        "unmatched": [],
        "imputation_method": "mice",
        "diagnostics": {"firth_fallback_count": 0},
    }

_fit_once = fake_fit_once
_can_mice = lambda: True
try:
    fit = _fit_point(pd.DataFrame({"outcome": [0, 1, 0, 1]}), {}, {
        "outcome": "outcome",
        "predictors": ["age", "marker", "treatment"],
        "model": "lasso",
        "seed": 10,
        "imputation": {"policy": "mice", "m": 4},
    })
finally:
    _fit_once = original_fit_once
    _can_mice = original_can_mice

{"selected": fit["selected"], "coef_index": list(fit["coef"].index)}
`]);
    const plain = proxyToPlain(result);
    expect(plain.selected).toEqual(["age", "treatment=Drug", "treatment=Placebo"]);
    expect(plain.coef_index).toEqual(plain.selected);
    expect(plain.selected).not.toContain("marker");
  }, 120_000);

  it("leaves ridge MICE selection as all coefficient terms", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd

original_fit_once = _fit_once
original_can_mice = _can_mice
terms = ["age", "marker"]

def fake_fit_once(df, schema, setup, seed=None, force_complete=False, fixed_c=None, inner_cv=None, resolved_model=None):
    return {
        "X": pd.DataFrame({"age": [1.0, 2.0, 3.0, 4.0], "marker": [0.1, 0.2, 0.3, 0.4]}),
        "y": pd.Series([0, 1, 0, 1]),
        "terms": terms,
        "sources": terms,
        "model": "ridge",
        "intercept": 0.0,
        "coef": pd.Series({"age": 0.2, "marker": 0.0}),
        "se": None,
        "ci": None,
        "pvals": pd.Series(dtype=float),
        "probs": pd.Series([0.5, 0.5, 0.5, 0.5]),
        "selected": ["age"],
        "method_fallback": False,
        "lambda": 1.0,
        "lambda_rule_applied": "lambda_1se",
        "c_value": 1.0,
        "unmatched": [],
        "imputation_method": "mice",
        "diagnostics": {"firth_fallback_count": 0},
    }

_fit_once = fake_fit_once
_can_mice = lambda: True
try:
    fit = _fit_point(pd.DataFrame({"outcome": [0, 1, 0, 1]}), {}, {
        "outcome": "outcome",
        "predictors": ["age", "marker"],
        "model": "ridge",
        "seed": 10,
        "imputation": {"policy": "mice", "m": 3},
    })
finally:
    _fit_once = original_fit_once
    _can_mice = original_can_mice

fit["selected"]
`]);
    expect(proxyToPlain(result)).toEqual(["age", "marker"]);
  }, 120_000);

  it("pins bootstrap resamples to the point model and reports Firth fallback counts", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd

original_fit_once = _fit_once
seen = []

def fake_fit_once(df, schema, setup, seed=None, force_complete=False, fixed_c=None, inner_cv=None, resolved_model=None):
    seen.append(resolved_model)
    fallback = resolved_model == "plain" and len(seen) == 1
    return {
        "X": pd.DataFrame({"age": [1.0, 2.0, 3.0, 4.0]}),
        "y": pd.Series([0, 0, 1, 1]),
        "terms": ["age"],
        "sources": ["age"],
        "model": "firth" if fallback else resolved_model,
        "intercept": 0.0,
        "coef": pd.Series({"age": 0.1}),
        "se": None,
        "ci": None,
        "pvals": pd.Series(dtype=float),
        "probs": pd.Series([0.25, 0.35, 0.65, 0.75]),
        "selected": ["age"],
        "method_fallback": fallback,
        "lambda": None,
        "lambda_rule_applied": None,
        "c_value": None,
        "unmatched": [],
        "imputation_method": "complete_case",
        "diagnostics": {"firth_fallback_count": 1 if fallback else 0},
    }

point = {
    "X": pd.DataFrame({"age": [1.0, 2.0, 3.0, 4.0]}),
    "y": pd.Series([0, 0, 1, 1]),
    "coef": pd.Series({"age": 0.1}),
    "model": "plain",
}
_fit_once = fake_fit_once
try:
    boot = _bootstrap_engine(pd.DataFrame({"outcome": [0, 0, 1, 1], "age": [1, 2, 3, 4]}), {}, {"seed": 77}, point, 12)
finally:
    _fit_once = original_fit_once

{"seen": seen, "fallbacks": boot["firth_fallback_count"], "b_effective": boot["b_effective"]}
`]);
    const plain = proxyToPlain(result);
    expect(plain.seen.length).toBeGreaterThan(0);
    expect(plain.seen.every((model: string) => model === "plain")).toBe(true);
    expect(plain.fallbacks).toBe(1);
    expect(plain.b_effective).toBeGreaterThan(0);
  }, 120_000);

  it("routes continuous-predictor separation to Firth or a friendly error", async () => {
    const rows = Array.from({ length: 80 }, (_, index) => {
      const x = index / 79 - 0.5;
      return [x > 0.12 ? 1 : 0, x, Math.sin(index)];
    });
    const continuousSeparationData: DataFrame = {
      columns: [
        { originalName: "outcome", name: "outcome" },
        { originalName: "x", name: "x" },
        { originalName: "noise", name: "noise" },
      ],
      rows,
      meta: data.meta,
    };
    const continuousSeparationSchema: Schema = {
      columns: [
        { name: "outcome", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
        { name: "x", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "noise", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ],
    };
    const setup = {
      ...defaultModelingSetup(continuousSeparationSchema, "outcome", 42, continuousSeparationData),
      outcome: "outcome",
      predictors: ["x", "noise"],
      model: "plain" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };

    const separation = await pyodideClient.detectSeparation(continuousSeparationData, continuousSeparationSchema, setup);
    expect(separation.separated).toBe(false);
    expect(separation.quasi).toBe(true);

    const raw = await runRaw(setup, continuousSeparationData, continuousSeparationSchema);
    if (raw.error) {
      expect(raw.error).toContain("The model could not be fit for this data");
      expect(raw.error).not.toContain("LinAlgError");
    } else {
      expect(raw.model).toBe("firth");
      expect(raw.regime.separation.quasi).toBe(true);
    }
  }, 120_000);

  it("keeps non-separated plain point fits plain with no bootstrap Firth fallback", async () => {
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 42, noisyData),
      outcome: "outcome",
      predictors: ["age", "marker"],
      model: "plain" as const,
      validationB: 0,
      ciBootstrapB: 8,
    };

    const result = await pyodideClient.fitLogisticModel(noisyData, schema, setup);
    expect(result.model).toBe("plain");
    expect(result.diagnostics.firth_fallback_count).toBe(0);
  }, 120_000);

  it("returns a friendly payload for unexpected logistic entry-point failures", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import json
import pandas as pd

original_fit_core = _fit_core

def exploding_fit_core(df, schema, setup, point=None):
    raise RuntimeError("synthetic solver failure")

_fit_core = exploding_fit_core
try:
    raw = run_logistic_model(
        json.dumps({"columns": [{"name": "outcome"}, {"name": "age"}], "rows": [[0, 30], [1, 40], [0, 35], [1, 45]]}),
        json.dumps({"columns": [
            {"name": "outcome", "confirmedType": "binary"},
            {"name": "age", "confirmedType": "continuous"}
        ]}),
        json.dumps({
            "outcome": "outcome",
            "predictors": ["age"],
            "referenceLevels": {},
            "imputation": {"policy": "complete_case", "m": 20},
            "goal": "adjust",
            "seed": 42,
            "model": "plain",
            "lambdaRule": "lambda_1se",
            "validationB": 0,
            "ciBootstrapB": 0,
            "fastMode": True
        })
    )
finally:
    _fit_core = original_fit_core

json.loads(raw)
`]);
    const plain = proxyToPlain(result);
    expect(plain.error).toContain("The model could not be fit for this data: synthetic solver failure");
  }, 120_000);

  it("matches the logistf endometrial Firth benchmark coefficients and profile CIs", async () => {
    const fixture = parseEndometrial();
    const setup = {
      ...defaultModelingSetup(fixture.schema, "HG", 42, fixture.data),
      outcome: "HG",
      predictors: ["NV", "PI", "EH"],
      model: "firth" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };
    const result = await pyodideClient.fitLogisticModel(fixture.data, fixture.schema, setup);
    const expected = {
      NV: { coef: 2.92927330, ci: [0.6097244, 7.85463171], significant: true },
      PI: { coef: -0.03475175, ci: [-0.1244587, 0.04045547], significant: false },
      EH: { coef: -2.60416387, ci: [-4.3651832, -1.23272106], significant: true },
    };

    for (const row of result.adjusted) {
      const target = expected[row.label as keyof typeof expected];
      expect(target).toBeDefined();
      expect(Math.log(row.or ?? Number.NaN)).toBeCloseTo(target.coef, 2);
      expect(Math.log(row.ciLow ?? Number.NaN)).toBeCloseTo(target.ci[0], 2);
      expect(Math.log(row.ciHigh ?? Number.NaN)).toBeCloseTo(target.ci[1], 2);
      if (target.significant) {
        expect(row.p).not.toBeNull();
        expect(row.p as number).toBeLessThan(0.05);
      } else {
        expect(row.p === null || row.p >= 0.05).toBe(true);
      }
    }
  }, 120_000);

  it("returns an actionable Firth error for a constant predictor", async () => {
    const constantSchema: Schema = {
      columns: [
        ...schema.columns,
        { name: "constant_marker", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ],
    };
    const constantData: DataFrame = {
      ...data,
      columns: constantSchema.columns.map((c) => ({ originalName: c.name, name: c.name })),
      rows: data.rows.map((row) => [...row, 1]),
    };
    const setup = {
      ...defaultModelingSetup(constantSchema, "outcome", 42, constantData),
      outcome: "outcome",
      predictors: ["age", "constant_marker"],
      model: "firth" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };

    const result = await runRaw(setup, constantData, constantSchema);

    expect(result.error).toContain("constant_marker");
    expect(result.error).toContain("constant after rows with missing data were dropped");
    expect(result.error).toContain("MICE");
    expect(result.error).not.toContain("failed in this build");
  }, 120_000);

  it("returns the same actionable design diagnostic for penalized fits", async () => {
    const constantSchema: Schema = {
      columns: [
        ...schema.columns,
        { name: "constant_marker", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ],
    };
    const constantData: DataFrame = {
      ...data,
      columns: constantSchema.columns.map((c) => ({ originalName: c.name, name: c.name })),
      rows: data.rows.map((row) => [...row, 1]),
    };
    const setup = {
      ...defaultModelingSetup(constantSchema, "outcome", 42, constantData),
      outcome: "outcome",
      predictors: ["age", "constant_marker"],
      model: "ridge" as const,
      validationB: 0,
      ciBootstrapB: 0,
    };

    const result = await runRaw(setup, constantData, constantSchema);

    expect(result.error).toContain("constant_marker");
    expect(result.error).toContain("constant predictor can't be estimated");
  }, 120_000);

  it("returns a structured error for a non-binary outcome", async () => {
    const threeLevel = withColumnName(data, "sex", "three_level");
    const threeLevelSchema: Schema = {
      columns: [
        ...schema.columns.filter((c) => c.name !== "sex"),
        { name: "three_level", inferredType: "categorical_nominal", confirmedType: "categorical_nominal", levels: [{ code: "A", label: "A" }, { code: "B", label: "B" }, { code: "C", label: "C" }], cardinalityTier: "ok" },
      ],
    };
    threeLevel.rows = data.rows.map((row, index) => [row[0], row[1], row[2], index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C"]);
    const setup = { ...defaultModelingSetup(threeLevelSchema, null, 42, threeLevel), outcome: "three_level", predictors: ["age"], model: "ridge" as const };
    const result = await runRaw(setup, threeLevel, threeLevelSchema);
    expect(result.error).toContain("exactly 2 groups");
    expect(result.error).toContain("3 non-missing");
  }, 120_000);

  it("resolves predictor names by trimmed fallback in both directions", async () => {
    const setup = { ...defaultModelingSetup(schema, "outcome", 42, data), outcome: "outcome", predictors: ["age", "marker"], model: "ridge" as const, validationB: 0, ciBootstrapB: 0 };
    const clean = await pyodideClient.fitLogisticModel(data, schema, setup);
    const dataTrailing = withColumnName(data, "age", "age ");
    const trailing = await pyodideClient.fitLogisticModel(dataTrailing, schema, setup);
    expect(trailing.adjusted.map((r) => r.label)).toEqual(clean.adjusted.map((r) => r.label));

    const schemaTrailing: Schema = { columns: schema.columns.map((c) => c.name === "age" ? { ...c, name: "age " } : c) };
    const setupTrailing = { ...defaultModelingSetup(schemaTrailing, "outcome", 42, data), outcome: "outcome", predictors: ["age "], model: "ridge" as const, validationB: 0, ciBootstrapB: 0 };
    const reverse = await pyodideClient.fitLogisticModel(data, schemaTrailing, setupTrailing);
    expect(reverse.adjusted.some((r) => r.label.trim() === "age")).toBe(true);
  }, 120_000);

  it("drops a genuinely absent predictor and reports it without crashing", async () => {
    const setup = { ...defaultModelingSetup(schema, "outcome", 42, data), outcome: "outcome", predictors: ["age", "NotAColumn"], model: "ridge" as const, validationB: 0, ciBootstrapB: 0 };
    const result = await pyodideClient.fitLogisticModel(data, schema, setup);
    expect(result.unmatchedPredictors).toContain("NotAColumn");
    expect(result.adjusted.some((row) => row.label === "age")).toBe(true);
  }, 120_000);

  it("runs the ML benchmark with deterministic shared-fold metadata and 100-point ROC curves", async () => {
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 42, data),
      outcome: "outcome",
      predictors: ["age", "marker"],
      fastMode: true,
    };
    const result = await pyodideClient.runMlBenchmark(data, schema, setup);

    expect(result.folds).toEqual({ nSplits: 5, nRepeats: 3, seed: 42 });
    expect(result.models.map((model) => model.name)).toEqual(["Random Forest", "Naive Bayes", "SVM", "Ridge Logistic"]);
    expect(result.models.every((model) => model.roc.grid.length === 100 && model.roc.mean.length === 100 && model.roc.sd.length === 100)).toBe(true);
    expect(result.classificationThreshold).toBe(0.5);
    expect(result.models.every((model) => model.classificationThreshold === 0.5)).toBe(true);
    expect(result.models.every((model) => model.decisionCurve?.basis === "pooled_repeated_cv")).toBe(true);
    expect(result.models.every((model) => model.decisionCurve?.points.length === 99)).toBe(true);
    expect(result.comparison.every((row) => row.auc.mean !== null && row.auc.mean >= 0 && row.auc.mean <= 1)).toBe(true);
    const metricRanges = { auc: [0, 1], sens: [0, 1], spec: [0, 1], balacc: [0, 1], mcc: [-1, 1], f1: [0, 1] } as const;
    for (const row of result.comparison) {
      for (const [metric, [minimum, maximum]] of Object.entries(metricRanges) as Array<[keyof typeof metricRanges, readonly [number, number]]>) {
        const summary = row[metric];
        if (summary?.ciLow !== null && summary?.ciLow !== undefined && summary.ciHigh !== null && summary.ciHigh !== undefined) {
          // D93(g): containment carries a 1e-9 tolerance because `mean` is computed on the
          // natural scale and the endpoints on the transformed one, so they can differ by an
          // ulp. The range assertions stay exact: the back-transform cannot leave the range.
          const EPS = 1e-9;
          expect(summary.ciLow).toBeLessThanOrEqual(summary.mean! + EPS);
          expect(summary.mean!).toBeLessThanOrEqual(summary.ciHigh + EPS);
          expect(summary.ciLow).toBeGreaterThanOrEqual(minimum);
          expect(summary.ciHigh).toBeLessThanOrEqual(maximum);
        }
      }
    }
    // D93(c): a boundary-saturated repeat (e.g. AUC 1.0 on this small synthetic fixture)
    // legitimately withholds the interval, so assert the pairing - basis present with the
    // right value iff an interval was emitted - rather than unconditional presence. The
    // final count assertion stops this passing vacuously if every interval were withheld.
    const expectedBasis = { auc: "logit", sens: "logit", spec: "logit", balacc: "logit", f1: "logit", mcc: "fisher_z" } as const;
    let intervalsEmitted = 0;
    for (const row of result.comparison) {
      for (const [metric, basis] of Object.entries(expectedBasis) as Array<[keyof typeof expectedBasis, string]>) {
        const summary = row[metric];
        if (!summary) continue;
        if (summary.ciLow !== null && summary.ciLow !== undefined) {
          expect(summary.ciBasis).toBe(basis);
          intervalsEmitted += 1;
        } else {
          expect(summary.ciBasis).toBeUndefined();
        }
      }
    }
    expect(intervalsEmitted).toBeGreaterThan(0);
    expect(result.comparison.every((row) => row.mcc && row.f1 && row.mcc.mean !== null && row.f1.mean !== null)).toBe(true);
    expect(result.models.every((model) => Object.keys(model.hyperparameters ?? {}).length > 0)).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("Gaussian Naive Bayes"))).toBe(false);
  }, 180_000);

  it("uses mixed Gaussian/Bernoulli naive Bayes for mixed predictor types", async () => {
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 42, data),
      outcome: "outcome",
      predictors: ["age", "sex"],
      fastMode: true,
    };
    const result = await pyodideClient.runMlBenchmark(data, schema, setup);
    const nb = result.models.find((model) => model.name === "Naive Bayes");

    expect(nb?.hyperparameters?.nb_variant).toBe("mixed_gaussian_bernoulli");
    expect(nb?.hyperparameters?.continuous_features).toBe(1);
    expect(nb?.hyperparameters?.categorical_features).toBe(1);
    expect(result.warnings.some((warning) => warning.includes("Gaussian Naive Bayes"))).toBe(false);

    await pyodideClient.isReady();
    const comparison = await pyodideClient.call("run_python", [`
from sklearn.metrics import roc_auc_score
from sklearn.naive_bayes import GaussianNB
X_nb_fixture = pd.DataFrame({
    "age": [52.1, 38.1, 53.2, 39.2, 55.9, 50.9, 35.7, 39.8, 43.7, 49.3, 48.5, 41.5],
    "sex=M": [0, 1, 1, 0, 0, 1, 1, 0, 1, 1, 1, 1],
})
y_nb_fixture = np.array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1])
mixed_nb_fixture = MixedNaiveBayes(continuous_columns=["age"], categorical_columns=["sex=M"]).fit(X_nb_fixture, y_nb_fixture)
gaussian_nb_fixture = GaussianNB().fit(X_nb_fixture, y_nb_fixture)
{
    "variant": mixed_nb_fixture.nb_variant_,
    "mixed_auc": float(roc_auc_score(y_nb_fixture, mixed_nb_fixture.predict_proba(X_nb_fixture)[:, 1])),
    "gaussian_auc": float(roc_auc_score(y_nb_fixture, gaussian_nb_fixture.predict_proba(X_nb_fixture)[:, 1])),
}
`]);
    const plain = proxyToPlain(comparison);
    expect(plain.variant).toBe("mixed_gaussian_bernoulli");
    expect(Math.abs(plain.mixed_auc - plain.gaussian_auc)).toBeGreaterThan(1e-6);
  }, 180_000);

  it("omits ML metric CIs when only one repeat-level estimate is available", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`_metric_summary([0.7, 0.8], [0.75], metric_key="auc")`]);
    const plain = proxyToPlain(result);
    expect(plain.mean).toBeCloseTo(0.75, 9);
    expect(plain.sd).toBeCloseTo(0.070710678, 6);
    expect(plain.ci_low == null).toBe(true);
    expect(plain.ci_high == null).toBe(true);
  }, 120_000);

  it("computes MCC against a known confusion matrix", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", ["__import__('sklearn.metrics', fromlist=['matthews_corrcoef']).matthews_corrcoef([1, 1, 1, 0, 0, 0], [1, 1, 0, 0, 0, 1])"]);
    expect(Number(result)).toBeCloseTo(1 / 3, 8);
  }, 120_000);

  it("computes decision-curve net benefit and handles threshold 1 safely", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`_decision_curve([1, 1, 0, 0], [0.9, 0.7, 0.8, 0.1], [0.2, 1.0], "apparent")`]);
    const plain = proxyToPlain(result);
    expect(plain.basis).toBe("apparent");
    expect(plain.prevalence).toBeCloseTo(0.5, 9);
    expect(plain.points[0].threshold).toBeCloseTo(0.2, 9);
    expect(plain.points[0].net_benefit).toBeCloseTo(0.5 - 0.25 * (0.2 / 0.8), 9);
    expect(plain.points[0].net_benefit_treat_all).toBeCloseTo(0.5 - 0.5 * (0.2 / 0.8), 9);
    expect(plain.points[1].net_benefit == null).toBe(true);
    expect(plain.points[1].net_benefit_treat_all == null).toBe(true);
  }, 120_000);

  it("computes subgroup performance from supplied predictions and suppresses tiny levels", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`_subgroup_performance_for_values(
  [1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 0],
  [0.95, 0.9, 0.85, 0.8, 0.75, 0.3, 0.25, 0.2, 0.15, 0.1, 0.6, 0.4],
  ["A", "A", "A", "A", "A", "A", "A", "A", "A", "A", "Tiny", "Tiny"],
  "site",
  "pooled_repeated_cv",
  min_events=5,
)`]);
    const plain = proxyToPlain(result);
    expect(plain.variable).toBe("site");
    expect(plain.basis).toBe("pooled_repeated_cv");
    expect(plain.levels[0].level).toBe("A");
    expect(plain.levels[0].auc).toBeCloseTo(1, 9);
    expect(plain.levels[0].brier).toBeGreaterThan(0);
    expect(plain.levels[1].level).toBe("Tiny");
    expect(plain.levels[1].auc == null).toBe(true);
    expect(plain.levels[1].reason).toBe("insufficient_events");
  }, 120_000);

  it("honors median, kNN, and RF imputation in the ML benchmark", async () => {
    const missingData: DataFrame = {
      ...data,
      rows: data.rows.map((row, index) => {
        const next = [...row];
        if (index % 3 === 0) next[1] = null;
        if (index % 4 === 0) next[2] = null;
        return next;
      }),
    };
    for (const [policy, method] of [
      ["median", "foldwise_simple_median_numeric_foldmode_categorical"],
      ["knn", "foldwise_knn_numeric_foldmode_categorical"],
      ["rf", "foldwise_rf_numeric_foldmode_categorical"],
    ] as const) {
      const setup = {
        ...defaultModelingSetup(schema, "outcome", 42, missingData),
        outcome: "outcome",
        predictors: ["age", "marker"],
        imputation: { policy, m: 20, knnNeighbors: 3 },
        fastMode: true,
      };
      const result = await pyodideClient.runMlBenchmark(missingData, schema, setup);
      expect(result.imputationMethod).toBe(method);
      expect(result.comparison.some((row) => row.auc.mean !== null && Number.isFinite(row.auc.mean))).toBe(true);
    }
  }, 300_000);

  it("fits ML fold imputers on train data only", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd
X_train = pd.DataFrame({"marker": [1.0, None, 3.0]})
X_test = pd.DataFrame({"marker": [1000.0, None]})
setup = {"imputation": {"policy": "mean", "m": 20}}
train, test = _fit_fold_imputer(X_train, X_test, setup, "mean", 7)
{"train": train["marker"].tolist(), "test": test["marker"].tolist()}
`]);
    const plain = proxyToPlain(result);
    expect(plain.train).toEqual([1, 2, 3]);
    expect(plain.test).toEqual([1000, 2]);
  }, 120_000);

  it("mode-imputes ML categorical predictors from each training fold before one-hot encoding", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import pandas as pd
schema_local = {
    "outcome": {"confirmedType": "binary"},
    "age": {"confirmedType": "continuous"},
    "group": {"confirmedType": "categorical_nominal", "referenceLevel": "A"},
}
train = pd.DataFrame({
    "outcome": [0, 1, 0, 1],
    "age": [20, 30, 40, 50],
    "group": ["B", "B", "A", None],
})
test = pd.DataFrame({
    "outcome": [0, 1],
    "age": [60, 70],
    "group": [None, "C"],
})
level_sets = {"group": ["B", "C"]}
refs = {"group": "A"}
X_train, X_test, terms = _fold_local_design(train, test, schema_local, "outcome", ["age", "group"], refs, level_sets)
{
    "terms": terms,
    "train_missing_as_mode": float(X_train.iloc[3]["group=B"]),
    "test_missing_as_mode": float(X_test.iloc[0]["group=B"]),
    "test_missing_as_reference": float(X_test.iloc[0]["group=C"]),
    "observed_c_preserved": float(X_test.iloc[1]["group=C"]),
}
`]);
    const plain = proxyToPlain(result);
    expect(plain.terms).toEqual(["age", "group=B", "group=C"]);
    expect(plain.train_missing_as_mode).toBe(1);
    expect(plain.test_missing_as_mode).toBe(1);
    expect(plain.test_missing_as_reference).toBe(0);
    expect(plain.observed_c_preserved).toBe(1);
  }, 120_000);

  it("uses fold-local categorical mode imputation inside the ML benchmark path", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import numpy as np
import pandas as pd

captured = []
original_splits = _ml_shared_splits
original_fit_fold_imputer = _fit_fold_imputer

def fixed_splits(y, seed, requested_splits, n_repeats):
    return [(np.array([0, 1, 2, 3, 4, 5]), np.array([6, 7, 8, 9]))], 2, []

def spy_fit_fold_imputer(X_train, X_test, setup, policy, seed):
    captured.append({
        "train": X_train.copy(),
        "test": X_test.copy(),
        "policy": policy,
    })
    return original_fit_fold_imputer(X_train, X_test, setup, policy, seed)

_ml_shared_splits = fixed_splits
_fit_fold_imputer = spy_fit_fold_imputer
try:
    df = pd.DataFrame({
        "outcome": [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
        "age": [20, 21, 22, 23, 24, 25, 26, 27, 28, 29],
        "group": ["B", "B", "B", "A", "A", "C", None, "C", "A", "B"],
    })
    schema = {
        "outcome": {"name": "outcome", "confirmedType": "binary"},
        "age": {"name": "age", "confirmedType": "continuous"},
        "group": {"name": "group", "confirmedType": "categorical_nominal", "referenceLevel": "A"},
    }
    setup = {
        "outcome": "outcome",
        "predictors": ["age", "group"],
        "referenceLevels": {"group": "A"},
        "imputation": {"policy": "median", "m": 20},
        "goal": "adjust",
        "seed": 42,
        "model": "ridge",
        "lambdaRule": "lambda_1se",
        "validationB": 0,
        "ciBootstrapB": 0,
        "fastMode": True,
    }
    artifacts = _ml_artifacts(df, schema, setup)
finally:
    _ml_shared_splits = original_splits
    _fit_fold_imputer = original_fit_fold_imputer

first = captured[0]["test"]
{
    "method": artifacts["imputation_method"],
    "missing_row_b": float(first.loc[6, "group=B"]),
    "missing_row_c": float(first.loc[6, "group=C"]),
    "columns": list(first.columns),
    "calls": len(captured),
}
`]);
    const plain = proxyToPlain(result);
    expect(plain.method).toBe("foldwise_simple_median_numeric_foldmode_categorical");
    expect(plain.columns).toEqual(["age", "group=B", "group=C"]);
    expect(plain.missing_row_b).toBe(1);
    expect(plain.missing_row_c).toBe(0);
    expect(plain.calls).toBeGreaterThan(0);
  }, 180_000);

  it("keeps kNN imputation scale-invariant in whole-frame and fold paths", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler

base = pd.DataFrame({
    "target": [0.0, 10.0, np.nan, 30.0],
    "small": [0.0, 10.0, 1.0, 30.0],
    "large": [0.0, 1.0, 100.0, 3.0],
})
rescaled = base.copy()
rescaled["large"] = rescaled["large"] * 1000.0
whole_base, _ = _knn_impute_scaled(base, None, ["target", "small", "large"], 1)
whole_rescaled, _ = _knn_impute_scaled(rescaled, None, ["target", "small", "large"], 1)

train = base.iloc[[0, 1, 3]].copy()
test = base.iloc[[2]].copy()
train_rescaled = rescaled.iloc[[0, 1, 3]].copy()
test_rescaled = rescaled.iloc[[2]].copy()
fold_train, fold_test = _fit_fold_imputer(train, test, {"imputation": {"policy": "knn", "knnNeighbors": 1}}, "knn", 7)
fold_train_rescaled, fold_test_rescaled = _fit_fold_imputer(train_rescaled, test_rescaled, {"imputation": {"policy": "knn", "knnNeighbors": 1}}, "knn", 7)
scaled = StandardScaler().fit_transform(pd.DataFrame({"x": [1.0, np.nan, 3.0]}))
{
    "whole": [float(whole_base.loc[2, "target"]), float(whole_rescaled.loc[2, "target"])],
    "fold": [float(fold_test.iloc[0]["target"]), float(fold_test_rescaled.iloc[0]["target"])],
    "nan_survived_scaling": bool(np.isnan(scaled[1, 0])),
}
`]);
    const plain = proxyToPlain(result);
    expect(plain.whole[0]).toBeCloseTo(plain.whole[1], 8);
    expect(plain.fold[0]).toBeCloseTo(plain.fold[1], 8);
    expect(plain.nan_survived_scaling).toBe(true);
  }, 120_000);

  it("uses a corrected MICE warning in the ML benchmark", async () => {
    const missingData: DataFrame = {
      ...data,
      rows: data.rows.map((row, index) => {
        const next = [...row];
        if (index % 3 === 0) next[1] = null;
        return next;
      }),
    };
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 42, missingData),
      outcome: "outcome",
      predictors: ["age", "marker"],
      imputation: { policy: "mice" as const, m: 3 },
      fastMode: true,
    };
    const result = await pyodideClient.runMlBenchmark(missingData, schema, setup);
    expect(result.imputationMethod).toBe("foldwise_mice_iterativeimputer_numeric_foldmode_categorical_single");
    expect(result.warnings.some((warning) => warning.includes("one leak-free MICE-style imputation pass"))).toBe(true);
    expect(result.warnings.some((warning) => warning.includes("applies to the logistic tab only"))).toBe(false);
  }, 240_000);

  it("exports deterministic tidy modeling data and ML out-of-fold probabilities", async () => {
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 42, data),
      outcome: "outcome",
      predictors: ["age", "marker"],
      model: "ridge" as const,
      validationB: 0,
      ciBootstrapB: 0,
      fastMode: true,
    };
    const first = await exportModelingRaw(setup);
    const second = await exportModelingRaw(setup);

    expect(first.error).toBeUndefined();
    expect(first.model_input_matrix[0]).toEqual(expect.objectContaining({
      row_index: expect.any(Number),
      outcome: expect.any(Number),
      outcome_label: expect.any(String),
      imputation_method: "complete_case",
      age: expect.any(Number),
      marker: expect.any(Number),
    }));
    expect(first.lr_predicted_probabilities[0]).toEqual(expect.objectContaining({
      row_index: expect.any(Number),
      predicted_probability: expect.any(Number),
      outcome: expect.any(Number),
    }));
    expect(first.ml_oof_predictions).toHaveLength(data.rows.length * 4 * 3);
    expect(first.ml_oof_predictions[0]).toEqual(expect.objectContaining({
      row_index: expect.any(Number),
      model: expect.any(String),
      repeat: expect.any(Number),
      fold: expect.any(Number),
      predicted_probability: expect.any(Number),
      observed: expect.any(Number),
    }));
    expect(first.ml_roc_curve).toHaveLength(4 * 100);
    expect(first.ml_calibration.length).toBeGreaterThan(0);
    expect(first.ml_variable_importance.length).toBeGreaterThan(0);
    expect(first.ml_metrics).toHaveLength(4 * 6);
    expect(second.ml_oof_predictions).toEqual(first.ml_oof_predictions);
    expect(second.ml_roc_curve).toEqual(first.ml_roc_curve);
  }, 240_000);

  it("returns a structured ML error when one outcome class has fewer than 2 observations", async () => {
    const rareData: DataFrame = {
      ...data,
      rows: data.rows.map((row, index) => [index === 0 ? 1 : 0, row[1], row[2], row[3]]),
    };
    const setup = {
      ...defaultModelingSetup(schema, "outcome", 42, rareData),
      outcome: "outcome",
      predictors: ["age"],
      fastMode: true,
    };
    const result = await runMlRaw(setup, rareData);

    expect(result.error).toContain("requires at least 2 observations in each outcome class");
  }, 120_000);

  it("returns a structured error for an absent outcome column", async () => {
    const setup = { ...defaultModelingSetup(schema, "outcome", 42, data), outcome: "MissingOutcome", predictors: ["age"], model: "ridge" as const };
    const result = await runRaw(setup);
    expect(result.error).toContain("Outcome column 'MissingOutcome' was not found");
    expect(result.unmatched).toContain("MissingOutcome");
    expect(result.available).toContain("outcome");
  }, 120_000);

  it("returns a structured error when complete-case filtering leaves no rows", async () => {
    const missingData: DataFrame = {
      ...data,
      columns: [...data.columns, { originalName: "all_missing", name: "all_missing" }],
      rows: data.rows.map((row) => [...row, null]),
    };
    const missingSchema: Schema = {
      columns: [...schema.columns, { name: "all_missing", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" }],
    };
    const setup = { ...defaultModelingSetup(missingSchema, "outcome", 42, missingData), outcome: "outcome", predictors: ["all_missing"], model: "ridge" as const };
    const result = await runRaw(setup, missingData, missingSchema);
    expect(result.error).toContain("No complete rows remain");
  }, 120_000);

  it("only treats two-level columns as eligible modeling outcomes", () => {
    const mixedSchema: Schema = {
      columns: [
        { name: "binary01", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
        { name: "yesno", inferredType: "categorical_nominal", confirmedType: "categorical_nominal", cardinalityTier: "ok" },
        { name: "three", inferredType: "categorical_nominal", confirmedType: "categorical_nominal", cardinalityTier: "ok" },
        { name: "measure", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ],
    };
    const mixedData: DataFrame = {
      ...data,
      columns: mixedSchema.columns.map((c) => ({ originalName: c.name, name: c.name })),
      rows: [
        [0, "Yes", "A", 1],
        [1, "No", "B", 2],
        [0, "Yes", "C", 3],
      ],
    };
    expect(isEligibleModelingOutcome(mixedSchema, "binary01", mixedData)).toBe(true);
    expect(isEligibleModelingOutcome(mixedSchema, "yesno", mixedData)).toBe(true);
    expect(isEligibleModelingOutcome(mixedSchema, "three", mixedData)).toBe(false);
    expect(isEligibleModelingOutcome(mixedSchema, "measure", mixedData)).toBe(false);
    expect(defaultModelingSetup(mixedSchema, "three", 42, mixedData).outcome).toBe("binary01");
  });

  it("coherently links elastic-net 1SE C refit to the CV-selected l1_ratio", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegressionCV

np.random.seed(42)
X = np.random.normal(size=(100, 4))
y = np.random.binomial(1, 1 / (1 + np.exp(-2.0 * X[:, 0] + X[:, 1])))

# Manual CV to check selected l1_ratio
from sklearn.preprocessing import StandardScaler
X_scaled = StandardScaler().fit_transform(X)
n_cv = min(5, max(2, int(y.sum()), int((1 - y).sum())))
cv = LogisticRegressionCV(
    Cs=10, cv=n_cv, penalty="elasticnet",
    solver="saga", l1_ratios=[0.25, 0.5, 0.75], scoring="neg_log_loss",
    max_iter=2000, random_state=42
)
cv.fit(X_scaled, y)
expected_l1 = float(cv.l1_ratio_[0])

# Run fit_sklearn with lambda_1se
df = pd.DataFrame(X, columns=["x0", "x1", "x2", "x3"])
intercept, coef, c_value, pipe, applied = _fit_sklearn(df, pd.Series(y), "elasticnet", 42, schema={}, lambda_rule="lambda_1se")
refitted_clf = pipe.named_steps["model"]
actual_l1 = refitted_clf.l1_ratio

{
  "expected_l1": expected_l1,
  "actual_l1": actual_l1,
  "success": expected_l1 == actual_l1
}
`]);
    const plain = proxyToPlain(result);
    expect(plain.success).toBe(true);
    expect(plain.actual_l1).toBe(plain.expected_l1);
  }, 120_000);

  it("calculates bounded ML repeated-CV intervals while preserving arithmetic mean and SD", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
import numpy as np
import math
from scipy.special import expit, logit

values = [0.8, 0.82, 0.78, 0.85, 0.81, 0.83]
repeat_values = [0.81, 0.83, 0.82]

res = _metric_summary(values, repeat_values, metric_key="auc")
expected_mean = float(np.mean(repeat_values))
expected_sd = float(np.std(repeat_values, ddof=1))

# Single repeat case
res_single = _metric_summary(values, [0.82], metric_key="auc")
expected_mean_single = float(np.mean(values))
expected_sd_single = float(np.std(values, ddof=1))

{
  "multi_mean": res["mean"],
  "multi_sd": res["sd"],
  "multi_ci_low": res["ci_low"],
  "multi_ci_high": res["ci_high"],
  "ci_basis": res.get("ci_basis"),
  "expected_mean": expected_mean,
  "expected_sd": expected_sd,
  "single_mean": res_single["mean"],
  "single_sd": res_single["sd"],
  "single_ci_low": res_single["ci_low"],
  "single_ci_high": res_single["ci_high"],
  "expected_mean_single": expected_mean_single,
  "expected_sd_single": expected_sd_single
}
`]);
    const plain = proxyToPlain(result);
    expect(plain.multi_mean).toBeCloseTo(plain.expected_mean, 7);
    expect(plain.multi_sd).toBeCloseTo(plain.expected_sd, 7);
    expect(plain.multi_ci_low).toBeGreaterThan(0);
    expect(plain.multi_ci_high).toBeLessThan(1);
    expect(plain.multi_ci_low).toBeLessThanOrEqual(plain.multi_mean);
    expect(plain.multi_mean).toBeLessThanOrEqual(plain.multi_ci_high);
    expect(plain.ci_basis).toBe("logit");
    expect(plain.single_mean).toBeCloseTo(plain.expected_mean_single, 7);
    expect(plain.single_sd).toBeCloseTo(plain.expected_sd_single, 7);
    expect(plain.single_ci_low).toBeUndefined();
    expect(plain.single_ci_high).toBeUndefined();
  }, 120_000);

  it("uses Fisher z for MCC and withholds a boundary-saturated metric interval", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
mcc = _metric_summary([-0.2, 0.1, 0.3], [-0.2, 0.1, 0.3], metric_key="mcc")
boundary = _metric_summary([0.0, 0.2, 0.3], [0.0, 0.2, 0.3], metric_key="sens")
{
  "mcc": mcc,
  "boundary": boundary,
}
`]);
    const plain = proxyToPlain(result);
    expect(plain.mcc.ci_basis).toBe("fisher_z");
    expect(plain.mcc.ci_low).toBeGreaterThan(-1);
    expect(plain.mcc.ci_high).toBeLessThan(1);
    expect(plain.mcc.ci_low).toBeLessThanOrEqual(plain.mcc.mean);
    expect(plain.mcc.mean).toBeLessThanOrEqual(plain.mcc.ci_high);
    expect(plain.boundary.mean).not.toBeNull();
    // Pyodide converts Python None to JS undefined, not null (see the single-repeat test above).
    expect(plain.boundary.ci_low).toBeUndefined();
    expect(plain.boundary.ci_high).toBeUndefined();
    expect(plain.boundary.ci_basis).toBeUndefined();
  }, 120_000);

  it("rejects an unregistered ML metric key", async () => {
    await pyodideClient.isReady();
    const result = await pyodideClient.call("run_python", [`
try:
    _metric_summary([0.2, 0.3], [0.2, 0.3], metric_key="unknown")
    message = "no error raised"
except ValueError as exc:
    message = str(exc)
message
`]);
    expect(String(result)).toContain("unregistered metric key 'unknown'");
  }, 120_000);
});
