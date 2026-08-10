import type { AnalysisPlan, Schema, StatisticalResults } from "../types";
import { getColumnDisplayLabel, resolveLevelLabel } from "./columnLabel";
import { getMtcAdvice, countTestedVariablesFromResults } from "../stats/mtcAdvice";

export function buildResultsSummary(stats: StatisticalResults, plan: AnalysisPlan, schema: Schema): string {
  const groupingCol = schema.columns.find((c) => c.name === plan.groupingVariable);
  const groupingLabel = groupingCol ? getColumnDisplayLabel(groupingCol, "stripped") : plan.groupingVariable;
  const groupSizes = stats.groups.map((g) => `${resolveLevelLabel(g.name, groupingCol)} n=${g.n}`).join(", ");
  const significant = stats.perVariable
    .filter((v) => v.test.pValue !== null && v.test.pValue < 0.05)
    .map((v) => {
      const col = schema.columns.find((c) => c.name === v.variable);
      return col ? getColumnDisplayLabel(col, "stripped") : v.variable;
    });
  const notSignificant = stats.perVariable.filter((v) => v.test.pValue !== null && v.test.pValue >= 0.05).length;
  const mtc = getMtcAdvice(plan, countTestedVariablesFromResults(stats));
  const caveat = mtc?.severity === "strong" ? "Because no multiple-testing correction was applied across many P-values, interpret significant rows cautiously. " : "";
  const sigSentence = significant.length > 0
    ? `${caveat}Variables differing significantly between groups were ${significant.join(", ")}; ${notSignificant} tested variable${notSignificant === 1 ? "" : "s"} did not differ significantly.`
    : `${caveat}No tested variables differed significantly between groups; ${notSignificant} tested variable${notSignificant === 1 ? "" : "s"} did not differ significantly.`;
  return `Among ${stats.totalN} participants grouped by ${groupingLabel} (${groupSizes}), the table summarizes baseline characteristics by group. ${sigSentence} This summary is generated from the table above; it is descriptive and does not imply causation.`;
}
