import type { AnalysisPlan } from "../types";

export type SmdState = "computed" | "enable_before_run" | "rerun_required";

export type BaselineTestingAdvice =
  | { severity: "strong"; message: string; smdState: SmdState }
  | null;

const PREFIX =
  "You have declared a randomised design and this table reports P values for baseline characteristics. In a properly randomised trial any baseline imbalance is due to chance, so a significance test of baseline balance tests a null hypothesis that is known to be true; the CONSORT explanatory guidance discourages the practice.";

const SUFFIXES: Record<SmdState, string> = {
  computed:
    " EasyTableOne has already computed a standardised difference for every variable, which measures the size of any imbalance independently of sample size. You can switch to standardised differences only, or keep the P-value column if your target journal requires it.",
  enable_before_run:
    " Standardised differences measure the size of any imbalance independently of sample size. You can report standardised differences instead of P values, or keep the P-value column if your target journal requires it.",
  rerun_required:
    " Standardised differences were not computed for this run. You can return to the Analysis Plan with standardised differences switched on and the P-value column hidden, then re-run; or keep the P-value column if your target journal requires it.",
};

/**
 * Advise against hypothesis testing of baseline balance in a randomised design (D87, D101).
 * Returns null for every other design, and null if the P-value column is already hidden.
 */
export function getBaselineTestingAdvice(
  plan: Pick<AnalysisPlan, "studyDesign" | "userOverrides">,
  smdState: SmdState,
): BaselineTestingAdvice {
  if (plan.studyDesign !== "randomized_trial") return null;
  if (plan.userOverrides?.hidePValueColumn) return null;
  return {
    severity: "strong",
    message: `${PREFIX}${SUFFIXES[smdState]}`,
    smdState,
  };
}
