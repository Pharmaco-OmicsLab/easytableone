import { describe, expect, it } from "vitest";
import type { DataQualityRecord } from "../types";
import { generateReproducibilityJson, toReproducibilityWarning } from "./reproducibilityJson";

describe("toReproducibilityWarning", () => {
  it("keeps D43 metadataOnly but omits detail strings, rows, and values", () => {
    const record: DataQualityRecord = {
      finding: {
        checkId: "sanityBounds_age",
        tier: "advisory",
        category: "quality",
        variable: "age",
        title: "Potential implausible values in \"age\"",
        detail: "Specific values: 999",
        remedy: "Dismiss if different units.",
        affectedCount: 1,
        affectedRowsSample: [3],
        highlightedValues: [999],
        metadataOnly: {
          conceptId: "age",
          violationCount: 1,
          matchedBy: "alias_exact",
        },
      },
      response: "acknowledged",
      timestamp: "2026-06-27T00:00:00.000Z",
    };

    const warning = toReproducibilityWarning(record);

    expect(warning.metadataOnly).toEqual({
      conceptId: "age",
      violationCount: 1,
      matchedBy: "alias_exact",
    });
    expect(JSON.stringify(warning)).not.toContain("Specific values");
    expect(JSON.stringify(warning)).not.toContain("affectedRowsSample");
    expect(JSON.stringify(warning)).not.toContain("highlightedValues");
  });

  it("records ML modeling metadata without raw fold indices", () => {
    const json = generateReproducibilityJson({
      plan: { groupingVariable: "outcome" } as any,
      schema: { columns: [] } as any,
      results: { computeMetadata: { libVersions: {} }, perVariable: [] } as any,
      formattedTable: { journal: "Example Journal", rulesetVersion: "test" } as any,
      appVersion: "test",
      timestamp: "2026-06-29T00:00:00.000Z",
      modelingResults: {
        schemaFingerprint: "fp",
        setup: {
          outcome: "outcome",
          outcomePositiveLevel: "1",
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
          subgroupVars: ["sex"],
        },
        logistic: null,
        ml: {
          folds: { nSplits: 5, nRepeats: 3, seed: 42 },
          warnings: [],
          classificationThreshold: 0.5,
          models: [
            {
              name: "Random Forest",
              hyperparameters: { n_estimators: 100, max_features: "sqrt" },
              subgroups: [{
                variable: "sex",
                basis: "pooled_repeated_cv",
                levels: [{ level: "F", n: 12, events: 6, auc: 0.8, calibrationSlope: 0.9, brier: 0.2 }],
              }],
            } as any,
            { name: "SVM" } as any,
          ],
          comparison: [
            {
              model: "Random Forest",
              auc: { mean: 0.9, sd: 0.05, ciLow: 0.84, ciHigh: 0.96, ciBasis: "logit" },
              sens: { mean: 0.8, sd: 0.1 },
              spec: { mean: 0.85, sd: 0.08 },
              balacc: { mean: 0.825, sd: 0.06 },
            },
          ],
        },
        generatedAt: "2026-06-29T00:00:00.000Z",
      },
    });
    const parsed = JSON.parse(json);

    expect(parsed.modeling.ml.models).toEqual(["Random Forest", "SVM"]);
    expect(parsed.modeling.ml.folds).toEqual({ nSplits: 5, nRepeats: 3, seed: 42 });
    expect(parsed.modeling.ml.comparison[0].auc.mean).toBe(0.9);
    expect(parsed.modeling.ml.comparison[0].auc.ciLow).toBe(0.84);
    expect(parsed.modeling.ml.comparison[0].auc.ciHigh).toBe(0.96);
    expect(parsed.modeling.ml.comparison[0].auc.ciBasis).toBe("logit");
    expect(parsed.modeling.classImbalanceHandling).toBe("none_stratified_cv");
    expect(parsed.modeling.outcomePositiveLevelConfigured).toBe("1");
    expect(parsed.modeling.ml.classificationThreshold).toBe(0.5);
    expect(parsed.modeling.ml.comparison[0].hyperparameters).toEqual({ n_estimators: 100, max_features: "sqrt" });
    expect(parsed.modeling.subgroupVars).toEqual(["sex"]);
    expect(parsed.modeling.ml.subgroups["Random Forest"][0].variable).toBe("sex");
    expect(parsed.modeling.environment.runtime).toContain("Pyodide");
    expect(parsed.modeling.environment.runtime).toContain("WebAssembly");
    expect(JSON.stringify(parsed.modeling.ml)).not.toContain("train");
    expect(JSON.stringify(parsed.modeling.ml)).not.toContain("test");
    expect(parsed.modeling.imputationOutcomeIncluded).toBe(false);
  });

  it("records the policy-specific effective outcome-aware imputation default", () => {
    const baseSetup = {
      outcome: "outcome",
      predictors: ["age"],
      referenceLevels: {},
      goal: "adjust" as const,
      seed: 42,
      model: "ridge" as const,
      lambdaRule: "lambda_1se" as const,
      validationB: 200,
      ciBootstrapB: 200,
      fastMode: true,
    };
    const serialize = (imputation: any) => JSON.parse(generateReproducibilityJson({
      plan: { groupingVariable: "outcome" } as any,
      schema: { columns: [] } as any,
      results: { computeMetadata: { libVersions: {} }, perVariable: [] } as any,
      formattedTable: { journal: "Example Journal", rulesetVersion: "test" } as any,
      appVersion: "test",
      timestamp: "2026-06-29T00:00:00.000Z",
      modelingResults: {
        schemaFingerprint: "fp",
        setup: { ...baseSetup, imputation },
        logistic: {
          regime: { n: 10, events: 5, nonevents: 5, p: 1, epv: 5, pGeN: false, recommendedModels: ["ridge"], plainMleAllowed: true, rationale: "" },
          univariate: [],
          adjusted: [],
          equation: "",
          selected: [],
          model: "ridge",
          lambda: null,
          diagnostics: {},
          validation: null,
        },
        ml: null,
        generatedAt: "2026-06-29T00:00:00.000Z",
      },
    })).modeling.imputationOutcomeIncluded;

    expect(serialize({ policy: "mice", m: 20 })).toBe(true);
    expect(serialize({ policy: "knn", m: 20, knnNeighbors: 5 })).toBe(false);
    expect(serialize({ policy: "rf", m: 20 })).toBe(false);
    expect(serialize({ policy: "knn", m: 20, knnNeighbors: 5, includeOutcome: true })).toBe(true);
    expect(serialize({ policy: "mice", m: 20, includeOutcome: false })).toBe(false);
  });

  it("records logistic validation performance confidence intervals", () => {
    const json = generateReproducibilityJson({
      plan: { groupingVariable: "outcome" } as any,
      schema: { columns: [] } as any,
      results: { computeMetadata: { libVersions: {} }, perVariable: [] } as any,
      formattedTable: { journal: "Example Journal", rulesetVersion: "test" } as any,
      appVersion: "test",
      timestamp: "2026-06-29T00:00:00.000Z",
      modelingResults: {
        schemaFingerprint: "fp",
        setup: {
          outcome: "outcome",
          outcomePositiveLevel: "1",
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
          validationCiMethod: "oob",
          subgroupVars: ["sex"],
        },
        logistic: {
          regime: { n: 10, events: 5, nonevents: 5, p: 1, epv: 5, pGeN: false, recommendedModels: ["ridge"], plainMleAllowed: true, rationale: "" },
          univariate: [],
          adjusted: [],
          equation: "",
          selected: [],
          model: "ridge",
          lambda: null,
          diagnostics: {},
          validation: {
            method: "bootstrap_optimism",
            ciMethod: "bootstrap_oob",
            ciLevel: 0.95,
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
            rocCurve: [],
            calibrationCurve: [],
          },
          decisionCurve: {
            basis: "apparent",
            prevalence: 0.5,
            points: [{ threshold: 0.2, netBenefit: 0.3, netBenefitTreatAll: 0.375 }],
          },
          subgroups: [{
            variable: "sex",
            basis: "apparent",
            levels: [
              { level: "F", n: 12, events: 6, auc: 0.82, calibrationSlope: 0.91, brier: 0.17 },
              { level: "Unknown", n: 2, events: 1, auc: null, calibrationSlope: null, brier: null, reason: "insufficient_events" },
            ],
          }],
        },
        ml: null,
        generatedAt: "2026-06-29T00:00:00.000Z",
      },
    });
    const parsed = JSON.parse(json);

    expect(parsed.modeling.validationCiMethod).toBe("bootstrap_oob");
    expect(parsed.modeling.validationCiMethodConfigured).toBe("oob");
    expect(parsed.modeling.validationCiLevel).toBe(0.95);
    expect(parsed.modeling.validationPerformance.aucCorrectedCi).toEqual([0.71, 0.84]);
    expect(parsed.modeling.validationPerformance.brierCi).toEqual([0.12, 0.2]);
    expect(parsed.modeling.decisionCurve).toEqual({
      basis: "apparent",
      prevalence: 0.5,
      points: [{ threshold: 0.2, netBenefit: 0.3, netBenefitTreatAll: 0.375 }],
    });
    expect(parsed.modeling.subgroupVars).toEqual(["sex"]);
    expect(parsed.modeling.validationSubgroups[0].levels[1].reason).toBe("insufficient_events");
  });

  it("records modeling outcome-aware imputation opt-out", () => {
    const baseSetup = {
      outcome: "outcome",
      predictors: ["age"],
      referenceLevels: {},
      imputation: { policy: "mice" as const, m: 20, includeOutcome: false },
      goal: "adjust" as const,
      seed: 42,
      model: "ridge" as const,
      lambdaRule: "lambda_1se" as const,
      validationB: 200,
      ciBootstrapB: 200,
      fastMode: true,
    };
    const json = generateReproducibilityJson({
      plan: { groupingVariable: "outcome" } as any,
      schema: { columns: [] } as any,
      results: { computeMetadata: { libVersions: {} }, perVariable: [] } as any,
      formattedTable: { journal: "Example Journal", rulesetVersion: "test" } as any,
      appVersion: "test",
      timestamp: "2026-06-29T00:00:00.000Z",
      modelingResults: {
        schemaFingerprint: "fp",
        setup: baseSetup,
        logistic: {
          regime: { n: 10, events: 5, nonevents: 5, p: 1, epv: 5, pGeN: false, recommendedModels: ["ridge"], plainMleAllowed: true, rationale: "" },
          univariate: [],
          adjusted: [],
          equation: "",
          selected: [],
          model: "ridge",
          lambda: null,
          diagnostics: {},
          validation: null,
        },
        ml: null,
        generatedAt: "2026-06-29T00:00:00.000Z",
      },
    });

    expect(JSON.parse(json).modeling.imputationOutcomeIncluded).toBe(false);
  });

  it("does not emit stale display-only review note copy", () => {
    const json = generateReproducibilityJson({
      plan: { groupingVariable: "group" } as any,
      schema: {
        columns: [{
          name: "ENVHOXY",
          inferredType: "categorical_nominal",
          confirmedType: "categorical_nominal",
          cardinalityTier: "warn",
          distinctCount: 9,
          isWholeNumberNumeric: true,
        }],
      } as any,
      results: { computeMetadata: { libVersions: {} }, perVariable: [] } as any,
      formattedTable: { journal: "Example Journal", rulesetVersion: "test" } as any,
      appVersion: "test",
      timestamp: "2026-06-29T00:00:00.000Z",
    });

    expect(json).not.toContain("Switch to Continuous");
    expect(json).not.toContain("SpO2");
  });
});
