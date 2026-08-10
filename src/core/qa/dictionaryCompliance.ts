import type { Schema, DataFrame } from '../types';

export interface DictionaryViolation {
  columnName: string;
  declaredCodes: Array<string | number>;
  undeclaredValues: Array<{ value: string | number; rowIndices: number[]; count: number }>;
  resolutionStatus: 'unresolved' | 'reupload_pending' | 'treat_as_missing' | 'levels_added';
}

/**
 * D33 — Dictionary Compliance Check.
 * Scans all categorical/binary columns whose schema levels come from an imported dictionary
 * and flags any data values that are not in the declared level set.
 * Only runs when schema.dictionarySource === 'imported'.
 */
export function scanDictionaryCompliance(
  schema: Schema,
  dataFrame: DataFrame,
): DictionaryViolation[] {
  // Only run when a dictionary has been imported.
  if (schema.dictionarySource !== 'imported') return [];

  const violations: DictionaryViolation[] = [];

  for (const col of schema.columns) {
    // Only check columns where the dictionary actually defined levels.
    if (!col.levels || col.levels.length === 0) continue;
    // Only check categorical/binary types.
    if (!['binary', 'categorical_nominal', 'categorical_ordinal'].includes(col.confirmedType)) continue;

    const colIdx = dataFrame.columns.findIndex((c) => c.name === col.name);
    if (colIdx === -1) continue;

    const declaredKeys = new Set(col.levels.map((l) => String(l.code)));
    // Also accept numeric equivalence (e.g. "1" vs "1.0")
    const declaredNumerics = new Set(
      col.levels
        .map((l) => parseFloat(String(l.code)))
        .filter((n) => !isNaN(n)),
    );

    const undeclared = new Map<string, { value: string | number; rowIndices: number[] }>();
    for (let i = 0; i < dataFrame.rows.length; i++) {
      const v = dataFrame.rows[i][colIdx];
      if (v === null || v === undefined || v === '') continue;
      const sKey = String(v);
      if (declaredKeys.has(sKey)) continue;
      const num = parseFloat(sKey);
      if (!isNaN(num) && declaredNumerics.has(num)) continue;
      // Undeclared:
      const existing = undeclared.get(sKey);
      if (existing) {
        existing.rowIndices.push(i);
      } else {
        undeclared.set(sKey, { value: v as string | number, rowIndices: [i] });
      }
    }

    if (undeclared.size > 0) {
      violations.push({
        columnName: col.name,
        declaredCodes: col.levels.map((l) => l.code),
        undeclaredValues: [...undeclared.values()].map((u) => ({
          value: u.value,
          rowIndices: u.rowIndices,
          count: u.rowIndices.length,
        })),
        resolutionStatus: 'unresolved',
      });
    }
  }

  return violations;
}
