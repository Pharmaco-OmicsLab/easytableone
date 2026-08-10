import type { SchemaColumn } from "../types";

import { parseEncodingString, type ParsedLevel } from "./encodingParser";

export interface DictionaryMap {
  [columnName: string]: {
    label?: string;
    units?: string;
    levels?: ParsedLevel[];
  };
}

/**
 * Locate a DictionaryMap entry for a given data column name, using case-insensitive
 * and bracket-stripped normalization so dict keys like "GA" match "[b1]GA".
 */
export function findDictEntry(
  dict: DictionaryMap,
  colName: string,
): DictionaryMap[string] | undefined {
  if (dict[colName]) return dict[colName];
  const cleanName = colName.replace(/^\[.*?\]\s*/, "").trim().toLowerCase();
  const colLower = colName.toLowerCase();
  const key = Object.keys(dict).find((k) => {
    const kLower = k.toLowerCase();
    if (kLower === colLower) return true;
    if (kLower === cleanName) return true;
    const kClean = k.replace(/^\[.*?\]\s*/, "").trim().toLowerCase();
    if (kClean === cleanName) return true;
    if (kClean === colLower) return true;
    return false;
  });
  return key ? dict[key] : undefined;
}

/**
 * Apply a dictionary mapping to a schema: populates displayLabel, units (with
 * trim-and-drop semantics matching applyDetectedDictionary), levels, and type
 * classification. Pre-existing displayLabel and units are preserved (no overwrite).
 *
 * Replaces the old `applyDictionary` export — renamed so the codebase has exactly
 * one exported function matching /apply.*[Dd]ictionary/ (which is applyDetectedDictionary
 * in applyDetected.ts). See 7e.1.
 */
export function classifyColumnsFromDict(schema: SchemaColumn[], dict: DictionaryMap): SchemaColumn[] {
  return schema.map((col) => {
    const d = findDictEntry(dict, col.name);
    if (!d) return col;

    const updatedCol = { ...col };

    // label — kept for the fallback chain in getColumnDisplayLabel; encoding-guarded
    if (d.label && !col.label) {
      const { levels: enc } = parseEncodingString(d.label);
      if (enc.length === 0) updatedCol.label = d.label;
    }

    // displayLabel — canonical display field; trimmed, preserved, encoding-string guarded.
    // Reject labels that look like "1: Yes, 2: No" (row-misalignment defence, 7g.4).
    if (!col.displayLabel) {
      const trimmedLabel = (d.label ?? "").trim();
      if (trimmedLabel) {
        const { levels: encodingLevels } = parseEncodingString(trimmedLabel);
        if (encodingLevels.length === 0) updatedCol.displayLabel = trimmedLabel;
      }
    }

    // units — trimmed, drop-if-empty, encoding-guarded, preserved
    if (!col.units) {
      const trimmedUnits = (d.units ?? "").trim();
      if (trimmedUnits) {
        const { levels: encodedLevels } = parseEncodingString(trimmedUnits);
        if (encodedLevels.length === 0) updatedCol.units = trimmedUnits;
      }
    }

    if (d.levels && canDictionaryLevelsSetType(col)) {
      const numLevels = d.levels.length;
      if (numLevels >= 2) {
        updatedCol.confirmedType = numLevels === 2 ? "binary" : "categorical_nominal";
        updatedCol.levels = d.levels.map((lv) => ({ code: lv.code, label: lv.label }));
      }
    } else if (
      // G-3 fallback: column matched in dictionary (at least a label) but has no levels
      // encoding — auto-classify as binary when schema inference found exactly 2 unique values.
      col.confirmedType === "numeric_encoded_categorical_ambiguous" &&
      col.levels?.length === 2
    ) {
      updatedCol.confirmedType = "binary";
    }
    return updatedCol;
  });
}

function canDictionaryLevelsSetType(col: SchemaColumn): boolean {
  return [
    "binary",
    "categorical_nominal",
    "categorical_ordinal",
    "numeric_encoded_categorical_ambiguous",
  ].includes(col.confirmedType);
}


export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0, len = str.length; i < len; i++) {
    const chr = str.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash.toString(16);
}
