import type { AnalysisPlan, StatisticalResults } from "../types";

export const MTC_STRONG_THRESHOLD = 10;

export type MtcAdvice =
  | { severity: "strong" | "soft"; nTestedVariables: number; message: string }
  | null;

export function countTestedVariablesFromResults(results: StatisticalResults): number {
  return results.perVariable.filter((v) => v.test.pValue !== null || v.test.originalPValue !== undefined).length;
}

export function countTestableVariablesFromPlan(plan: AnalysisPlan): number {
  return plan.includedVariables.filter((name) => {
    const conf = plan.variableConfig[name];
    return conf && conf.treatAs !== "date" && conf.treatAs !== "id_like" && conf.treatAs !== "unsupported";
  }).length;
}

export function getMtcAdvice(plan: Pick<AnalysisPlan, "multipleTestingCorrection">, nTestedVariables: number): MtcAdvice {
  if (plan.multipleTestingCorrection !== "none" || nTestedVariables < 2) return null;
  const strong = nTestedVariables >= MTC_STRONG_THRESHOLD;
  const message = strong
    ? `You are reporting ${nTestedVariables} P-values with no multiple-testing correction. When you test many variables at once, the chance that at least one P-value falls below 0.05 purely by chance grows with the number of tests, so some "significant" results here may be false positives. If you intend to interpret these P-values, consider the Holm or Benjamini-Hochberg (FDR) correction in the Multiple Testing Correction setting on the Plan step.`
    : `You are reporting ${nTestedVariables} P-values with no multiple-testing correction. If you intend to interpret several P-values together, consider Holm or Benjamini-Hochberg (FDR).`;
  return { severity: strong ? "strong" : "soft", nTestedVariables, message };
}
