import type { RecomputeVariableResult, StatisticalResults } from "../types";

export function getRecomputedVariable(result: RecomputeVariableResult): StatisticalResults["perVariable"][number] {
  return "result" in result ? result.result : result;
}

export function applyRecomputeResult(
  results: StatisticalResults,
  recomputed: RecomputeVariableResult,
): StatisticalResults {
  const row = getRecomputedVariable(recomputed);
  const adjustedPValues = "result" in recomputed ? recomputed.adjustedPValues : undefined;
  const perVariable = results.perVariable.map((item) => {
    if (item.variable === row.variable) return row;
    const adjusted = adjustedPValues?.[item.variable];
    if (adjusted === undefined || adjusted === null) return item;
    return {
      ...item,
      test: {
        ...item.test,
        originalPValue: item.test.originalPValue ?? item.test.pValue,
        pValue: adjusted,
      },
    };
  });

  return { ...results, perVariable };
}
