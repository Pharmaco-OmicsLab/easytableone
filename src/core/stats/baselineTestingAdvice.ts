import type { AnalysisPlan } from "../types";

export type BaselineTestingAdvice =
  | { severity: "strong"; message: string; smdAvailable: boolean }
  | null;

/**
 * Advise against hypothesis testing of baseline balance in a randomised design (D87).
 * Returns null for every other design, and null if the P-value column is already hidden.
 */
export function getBaselineTestingAdvice(
  plan: Pick<AnalysisPlan, "studyDesign" | "userOverrides">,
  smdAvailable: boolean,
): BaselineTestingAdvice {
  if (plan.studyDesign !== "randomized_trial") return null;
  if (plan.userOverrides?.hidePValueColumn) return null;
  const message = smdAvailable
    ? "You have declared a randomised design and this table reports P values for baseline characteristics. In a properly randomised trial any baseline imbalance is due to chance, so a significance test of baseline balance tests a null hypothesis that is known to be true; the CONSORT explanatory guidance discourages the practice. EasyTableOne has already computed a standardised difference for every variable, which measures the size of any imbalance independently of sample size. You can switch to standardised differences only, or keep the P-value column if your target journal requires it."
    : "You have declared a randomised design and this table reports P values for baseline characteristics. In a properly randomised trial any baseline imbalance is due to chance, so a significance test of baseline balance tests a null hypothesis that is known to be true; the CONSORT explanatory guidance discourages the practice. Standardised differences are the recommended alternative but are not available for this table.";
  return { severity: "strong", message, smdAvailable };
}
