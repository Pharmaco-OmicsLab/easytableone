import { describe, expect, it } from "vitest";
import type { ImputationPolicy, ModelingResults, ModelingSetup } from "./types";
import { getClassImbalanceRationale, getDecisionCurveRationale, getFairnessRationale, getImputationRationale, getPerformanceCiRationale, getPredictorHandlingRationale, IMPUTATION_BEST_FOR } from "./rationale";

const setup: ModelingSetup = {
  outcome: "outcome",
  predictors: ["age"],
  referenceLevels: {},
  imputation: { policy: "complete_case", m: 20 },
  goal: "adjust",
  seed: 42,
  model: "plain",
  lambdaRule: "lambda_1se",
  validationB: 0,
  ciBootstrapB: 0,
  fastMode: true,
};

describe("getImputationRationale", () => {
  it("returns non-stub plain-language text for every policy", () => {
    const policies: ImputationPolicy[] = ["complete_case", "mean", "median", "mode", "constant", "knn", "rf", "mice"];
    for (const policy of policies) {
      const rationale = getImputationRationale({ ...setup, imputation: { policy, m: 20 } });
      expect(rationale.what.length).toBeGreaterThan(8);
      expect(rationale.plain.length).toBeGreaterThan(20);
      expect(rationale.what).not.toMatch(/coming soon|stub/i);
      expect(rationale.plain).not.toMatch(/coming soon|stub/i);
    }
  });

  it("describes single-fill policies as potentially over-confident", () => {
    const policies: ImputationPolicy[] = ["mean", "median", "mode", "constant", "knn", "rf"];
    for (const policy of policies) {
      const rationale = getImputationRationale({ ...setup, imputation: { policy, m: 20, knnNeighbors: 5 } });
      expect(`${rationale.why} ${rationale.plain} ${rationale.example}`).toMatch(/narrower|too narrow|over-confident|more certain/i);
    }
  });

  it("describes Rubin pooled MICE uncertainty", () => {
    const results = {
      logistic: {
        imputationMethod: "mice_iterativeimputer_numeric_mode_categorical_m3",
        adjusted: [{ label: "age", or: 1.2, ciLow: 1.0, ciHigh: 1.4, p: 0.04, ciMethod: "rubin" }],
      },
    } as ModelingResults;

    const rationale = getImputationRationale({ ...setup, imputation: { policy: "mice", m: 3 } }, results);

    expect(rationale.why).toMatch(/Rubin's rules|combined/i);
    expect(rationale.plain).toMatch(/within- and between-imputation uncertainty/i);
  });

  it("describes MICE as combined uncertainty before results exist", () => {
    const rationale = getImputationRationale({ ...setup, imputation: { policy: "mice", m: 20 } });
    expect(`${rationale.why} ${rationale.plain}`).toMatch(/several|combines|uncertainty/i);
  });

  it("describes outcome-aware filling for multivariate imputers only", () => {
    for (const policy of ["knn", "rf", "mice"] as const) {
      const rationale = getImputationRationale({ ...setup, imputation: { policy, m: 20, knnNeighbors: 5 } });
      expect(`${rationale.plain} ${rationale.why}`).toMatch(/outcome/i);
      expect(`${rationale.plain} ${rationale.why}`).toMatch(/bias|no effect|odds ratios/i);
    }

    const mean = getImputationRationale({ ...setup, imputation: { policy: "mean", m: 20 } });
    expect(`${mean.plain} ${mean.why}`).not.toMatch(/outcome-aware|uses the outcome/i);
  });

  it("uses the policy-specific outcome-aware default in rationale copy", () => {
    for (const policy of ["knn", "rf"] as const) {
      const defaultRationale = getImputationRationale({ ...setup, imputation: { policy, m: 20, knnNeighbors: 5 } });
      expect(defaultRationale.plain).toContain("Outcome-aware filling is off by default here");

      const optInRationale = getImputationRationale({ ...setup, imputation: { policy, m: 20, knnNeighbors: 5, includeOutcome: true } });
      expect(optInRationale.plain).toContain("You have turned on outcome-aware filling");
      expect(optInRationale.plain).toContain("push odds ratios away from no effect");
    }

    const mice = getImputationRationale({ ...setup, imputation: { policy: "mice", m: 20 } });
    expect(mice.plain).toContain("The outcome is used while filling predictor gaps");
  });

  it("has a best-for positioning line for every imputation policy", () => {
    const policies: ImputationPolicy[] = ["complete_case", "mean", "median", "mode", "constant", "knn", "rf", "mice"];
    expect(Object.keys(IMPUTATION_BEST_FOR).sort()).toEqual([...policies].sort());
    for (const policy of policies) {
      expect(IMPUTATION_BEST_FOR[policy].length).toBeGreaterThan(20);
    }
  });

  it("describes class-imbalance handling without resampling", () => {
    const rationale = getClassImbalanceRationale();
    expect(rationale.what).toContain("No class-imbalance resampling");
    expect(`${rationale.why} ${rationale.plain}`).toMatch(/stratified/i);
    expect(`${rationale.why} ${rationale.plain}`).toContain("balanced accuracy");
  });

  it("describes predictor handling for original scale and reference levels", () => {
    const rationale = getPredictorHandlingRationale();
    expect(`${rationale.what} ${rationale.why}`).toMatch(/original scale/i);
    expect(`${rationale.what} ${rationale.why}`).toMatch(/reference/i);
  });

  it("explains performance confidence intervals at the point of use", () => {
    const rationale = getPerformanceCiRationale();
    expect(rationale.what).toContain("95% confidence intervals for performance");
    expect(rationale.plain).toContain("same bootstrap used to correct for optimism");
    expect(rationale.example).toContain("95% CI");

    const mlRationale = getPerformanceCiRationale({ ml: { folds: { nSplits: 5, nRepeats: 3, seed: 42 } } } as ModelingResults);
    expect(mlRationale.what).toContain("95% performance intervals");
    expect(mlRationale.why).toContain("95% interval across CV repetitions");
    expect(mlRationale.why).toContain("logit scale (Fisher z for MCC)");
    expect(mlRationale.plain).toContain("not confidence intervals for performance on new patients");
  });

  it("explains decision curves and net benefit at the point of use", () => {
    const rationale = getDecisionCurveRationale();
    expect(rationale.what).toContain("Decision-curve analysis");
    expect(`${rationale.why} ${rationale.plain}`).toContain("treating everyone");
    expect(`${rationale.why} ${rationale.plain}`).toContain("treating no one");
    expect(rationale.example).toContain("20% threshold");
  });

  it("explains subgroup fairness performance without claiming a verdict", () => {
    const rationale = getFairnessRationale(setup);
    expect(rationale.what).toContain("Subgroup");
    expect(rationale.why).toContain("perform well overall");
    expect(rationale.plain).toContain("same predictions");
    expect(rationale.plain).toContain("does not decide whether the model is 'fair'");
    expect(rationale.example).toContain("AUC 0.82");
  });
});
