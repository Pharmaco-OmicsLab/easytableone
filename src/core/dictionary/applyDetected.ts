/**
 * src/core/dictionary/applyDetected.ts
 *
 * Pure helper: apply an auto-detected dictionary mapping to a list of
 * SchemaColumns. Populates `displayLabel` (and `units` when present) for
 * every column matched by raw name.
 *
 * Kept separate from the UI handler so it can be unit-tested without React
 * or XLSX in the loop (Step 7b.5.2).
 */
import type { SchemaColumn } from '../types';
import type { DetectedDictionarySheet } from './sheetDetector';
import { parseEncodingString } from './encodingParser';

export interface ApplyDetectedResult {
  columns: SchemaColumn[];
  matched: number;
  total: number;
}

export function applyDetectedDictionary(
  inferred: SchemaColumn[],
  detected: DetectedDictionarySheet,
): ApplyDetectedResult {
  let matched = 0;
  const columns = inferred.map((col) => {
    const entry = detected.mapping[col.name];
    if (!entry) return col;
    matched++;
    const next: SchemaColumn = { ...col };
    if (!next.displayLabel) {
      const trimmedLabel = (entry.label ?? '').trim();
      if (trimmedLabel) {
        const { levels } = parseEncodingString(trimmedLabel);
        if (levels.length === 0) next.displayLabel = trimmedLabel;
      }
    }
    if (!next.units) {
      const trimmedUnits = (entry.units ?? '').trim();
      if (trimmedUnits) {
        // Only apply as units if the value is not an encoding string (e.g. "1: Yes, 2: No").
        const { levels } = parseEncodingString(trimmedUnits);
        if (levels.length === 0) next.units = trimmedUnits;
      }
    }
    return next;
  });
  return { columns, matched, total: inferred.length };
}
