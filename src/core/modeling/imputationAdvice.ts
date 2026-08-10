import type { DataQualityReport } from "../types";
import type { ImputationPolicy } from "./types";

export interface ImputationSuggestion {
  recommendedPolicy: ImputationPolicy;
  headline: string;
  reason: string;
  missingnessSummary: string;
  disclaimer: string;
}

export const IMPUTATION_SUGGESTION_DISCLAIMER =
  "This suggestion is based only on how much data are missing, not why. It cannot tell whether values are missing at random. Treat it as a starting point and verify the choice against your study's assumptions - it is not guaranteed to be correct.";

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function getImputationSuggestion(
  selectedColumns: string[],
  qaReport: DataQualityReport | null,
): ImputationSuggestion | null {
  if (!qaReport || selectedColumns.length === 0) return null;
  const selected = new Set(selectedColumns);
  const matched = qaReport.columns.filter((col) => selected.has(col.name));
  if (matched.length === 0) return null;

  const totalMissing = matched.reduce((sum, col) => sum + col.missingPercent, 0);
  const meanMissing = totalMissing / matched.length;
  const highest = matched.reduce((max, col) => col.missingPercent > max.missingPercent ? col : max, matched[0]);
  const missingnessSummary = `Highest missingness among selected variables: ${highest.name} ${formatPercent(highest.missingPercent)}; average ${formatPercent(meanMissing)}.`;

  // Advisory amount-only heuristic per D65. Keep thresholds centralized because they are guidance, not proof of the missingness mechanism.
  if (highest.missingPercent === 0 && meanMissing === 0) {
    return {
      recommendedPolicy: "complete_case",
      headline: "No missing data in your selected variables",
      reason: "Nothing needs imputing.",
      missingnessSummary,
      disclaimer: IMPUTATION_SUGGESTION_DISCLAIMER,
    };
  }
  if (highest.missingPercent <= 5) {
    return {
      recommendedPolicy: "complete_case",
      headline: "Very little missing data",
      reason: "Complete-case is usually fine; median/mode fill is a low-risk alternative if you want to keep every row.",
      missingnessSummary,
      disclaimer: IMPUTATION_SUGGESTION_DISCLAIMER,
    };
  }
  if (highest.missingPercent <= 20) {
    return {
      recommendedPolicy: "mice",
      headline: "Moderate missing data",
      reason: "Median/mode fill may be acceptable for sensitivity checks, but MICE is preferred when you need confidence intervals to reflect imputation uncertainty.",
      missingnessSummary,
      disclaimer: IMPUTATION_SUGGESTION_DISCLAIMER,
    };
  }
  return {
    recommendedPolicy: "mice",
    headline: "Substantial missing data",
    reason: "Multiple imputation (MICE) is the option that keeps your confidence intervals honest when this much is missing.",
    missingnessSummary,
    disclaimer: IMPUTATION_SUGGESTION_DISCLAIMER,
  };
}
