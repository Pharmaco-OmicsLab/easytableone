import type { DataFrame, Schema } from "../types";

export function validateGroupingVariable(schema: Schema, groupingVariable: string) {
  const groupingCol = schema.columns.find((c) => c.name === groupingVariable);
  if (!groupingCol || !['binary', 'categorical_nominal', 'categorical_ordinal'].includes(groupingCol.confirmedType)) {
    throw new Error(
      `Grouping variable '${groupingVariable}' must be categorical (binary, ` +
      `categorical_nominal, or categorical_ordinal). Got '${groupingCol?.confirmedType ?? 'unknown'}'.`
    );
  }
  if (groupingCol.exclusionReason) {
    throw new Error(`Grouping variable '${groupingVariable}' has been excluded and cannot be used for analysis.`);
  }
}

export function defaultGroupOrder(schema: Schema, dataFrame: DataFrame, groupingVar: string): Array<string | number> {
  const col = schema.columns.find((c) => c.name === groupingVar)!;
  const colIdx = dataFrame.columns.findIndex((c) => c.name === groupingVar);
  const present = new Set<string | number>();
  for (const row of dataFrame.rows) {
    const v = row[colIdx];
    if (v !== null && v !== undefined && !Number.isNaN(v as number)) {
      present.add(v as string | number);
    }
  }
  const presentArr = [...present];

  // If schema levels exist, sort by their order
  if (col.levels && col.levels.length > 0) {
    const orderMap = new Map<string | number, number>();
    col.levels.forEach((l, idx) => {
      orderMap.set(l.code, l.order ?? idx);
    });
    return presentArr.sort((a, b) => {
      const oa = orderMap.has(a) ? orderMap.get(a)! : 9999;
      const ob = orderMap.has(b) ? orderMap.get(b)! : 9999;
      return oa - ob;
    });
  }

  // Otherwise, default to order of appearance in the dataset rows
  return presentArr;
}
