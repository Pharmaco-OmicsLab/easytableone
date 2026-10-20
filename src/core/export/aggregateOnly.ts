import type { StatisticalResults } from "../types";

/**
 * Phase 51 R1 (D105a). Sentence embedded in the reproducibility JSON so a recipient can
 * see that the record carries aggregate statistics only.
 */
export const AGGREGATE_ONLY_NOTICE =
  "This record contains aggregate statistics only; it holds no per-observation data (no raw values, row-level plot data, or row indices of patients).";

type PerVariable = StatisticalResults["perVariable"][number];

/**
 * Removes every per-observation field from a single per-variable result.
 * `plotData` (raw values, QQ points) is the only such field produced by the engine
 * (audited in Phase 51 R1 Step 1). In-memory results are never mutated: the app keeps
 * `plotData` for in-app plots and removes it at export time only.
 */
export function toAggregateVariable<T extends Pick<PerVariable, "variable">>(v: T): Omit<T, "plotData"> {
  const { plotData: _plotData, ...rest } = v as T & { plotData?: unknown };
  return rest as Omit<T, "plotData">;
}

/**
 * Returns a copy of `results` safe for export: no `plotData` on any `perVariable` entry.
 * The input object and its entries are not mutated (the nested summary/test objects are
 * shared by reference, which is safe because exports only serialize them).
 */
export function toAggregateResults(results: StatisticalResults): StatisticalResults {
  return {
    ...results,
    perVariable: results.perVariable.map((v) => toAggregateVariable(v) as PerVariable),
  };
}
