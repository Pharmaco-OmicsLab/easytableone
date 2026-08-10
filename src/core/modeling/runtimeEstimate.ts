import type { ModelingSetup } from "./types";

export type RuntimeEstimateBucket = "few_seconds" | "thirty_to_sixty_seconds" | "one_to_three_minutes" | "several_minutes";

export interface RuntimeEstimate {
  bucket: RuntimeEstimateBucket;
  label: string;
  isLongRun: boolean;
  score: number;
}

export function estimateModelingRuntime(setup: ModelingSetup, n: number, expandedPredictors: number): RuntimeEstimate {
  const validationCiMethod = setup.validationCiMethod ?? "oob";
  const validationB = setup.validationB ?? 0;
  const effectiveValidationB = validationCiMethod === "nested" && validationB > 0
    ? Math.min(validationB, 80) * Math.min(validationB, 80)
    : validationB;
  const bootstrapB = Math.max(effectiveValidationB, setup.ciBootstrapB ?? 0, 1);
  const modelCostFactor =
    setup.model === "firth" ? 85 :
    setup.model === "elasticnet" ? 650 :
    setup.model === "lasso" ? 240 :
    setup.model === "plain" ? 1.1 :
    100;
  const imputationFactor =
    setup.imputation.policy === "mice" ? Math.max(2, setup.imputation.m / 4) :
    setup.imputation.policy === "rf" ? Math.max(4, expandedPredictors) * (bootstrapB > 0 ? 1.2 : 1) :
    setup.imputation.policy === "knn" ? 1.5 :
    1;
  const fastFactor = setup.fastMode ? 0.55 : 1;
  const score = n * Math.max(expandedPredictors, 1) * bootstrapB * modelCostFactor * imputationFactor * fastFactor;

  if (score < 6_000_000) {
    return { bucket: "few_seconds", label: "~a few seconds", isLongRun: false, score };
  }
  if (score < 45_000_000) {
    return { bucket: "thirty_to_sixty_seconds", label: "~30-60 s", isLongRun: false, score };
  }
  if (score < 160_000_000) {
    return { bucket: "one_to_three_minutes", label: "~1-3 min", isLongRun: true, score };
  }
  return { bucket: "several_minutes", label: "may take several minutes", isLongRun: true, score };
}
