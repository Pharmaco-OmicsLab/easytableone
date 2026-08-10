import type { AuditEntry, DataFrame, Schema } from '../types';

function timestamp(): string { return new Date().toISOString(); }

/**
 * Resolve undeclared values by treating them as missing (null).
 * Mutates a working copy of the DataFrame.
 */
export function resolveTreatAsMissing(
  dataFrame: DataFrame,
  columnName: string,
  undeclaredValues: Array<string | number>,
  auditLog: AuditEntry[],
): DataFrame {
  const colIdx = dataFrame.columns.findIndex((c) => c.name === columnName);
  if (colIdx === -1) return dataFrame;
  const undecSet = new Set(undeclaredValues.map(String));
  let changedCount = 0;
  const newRows = dataFrame.rows.map((row) => {
    const v = row[colIdx];
    if (v !== null && undecSet.has(String(v))) {
      changedCount++;
      const newRow = [...row];
      newRow[colIdx] = null;
      return newRow;
    }
    return row;
  });
  auditLog.push({
    timestamp: timestamp(),
    action: 'dictionary_compliance_treat_as_missing',
    details: { column: columnName, count: changedCount },
  });
  return { ...dataFrame, rows: newRows };
}

/**
 * Resolve undeclared values by adding them to the schema as new levels.
 */
export function resolveAddAsLevels(
  schema: Schema,
  columnName: string,
  newLevels: Array<{ code: string | number; label: string }>,
  auditLog: AuditEntry[],
): Schema {
  const newCols = schema.columns.map((c) => {
    if (c.name !== columnName) return c;
    return { ...c, levels: [...(c.levels ?? []), ...newLevels] };
  });
  auditLog.push({
    timestamp: timestamp(),
    action: 'dictionary_compliance_levels_added',
    details: {
      column: columnName,
      newCodes: newLevels.map((l) => String(l.code)).join(','),
    },
  });
  return { ...schema, columns: newCols };
}
