import type { DataFrame, Schema, SchemaColumn, Cell } from "../types";
import { inferSchema } from "../schema/inference";
import { maxOf } from "../utils/arrayExtent";

export interface MissingCodeCandidate {
  column: string;
  code: string;            // as displayed, e.g. "999", "Unknown"
  count: number;
  kind: "numeric_sentinel" | "text_token";
  reason: string;          // user-facing, one sentence
  declaredLabel?: string;  // if the dictionary declares this code as a level
}

function normalizeText(s: string): string {
  return s.normalize("NFC").trim().toLocaleLowerCase("vi");
}

export const MISSING_TEXT_TOKENS = [
  "unknown", "unk", "missing", "not known", "not recorded", "not available",
  "not done", "n.a.", "n/k", "-", "--", "?", "none recorded",
  "không rõ", "không biết", "chưa rõ", "không xác định", "kxđ", "không có dữ liệu",
].map(normalizeText);

export const CODES = [-9, -99, -999, -9999, 99, 999, 9999, 99999, 88, 888, 8888, 77, 777, 7777];

/**
 * Linear interpolation quantile (Type 7, matches numpy/pandas default and src/core/qa/outliers.ts).
 * Sorted input required.
 */
function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) {
    return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  } else {
    return sorted[base];
  }
}

function isColumnExcluded(col: SchemaColumn): boolean {
  if (col.exclusionReason === "Manually excluded") return true;
  if (col.exclusionReason && col.confirmedType !== "unsupported" && col.inferredType !== "unsupported") {
    return true;
  }
  return false;
}

export function detectMissingCodes(df: DataFrame, schema: Schema): MissingCodeCandidate[] {
  const candidates: MissingCodeCandidate[] = [];

  for (const col of schema.columns) {
    if (isColumnExcluded(col)) continue;

    const colIndex = df.columns.findIndex((c) => c.name === col.name);
    if (colIndex === -1) continue;

    const colCandidates: MissingCodeCandidate[] = [];
    const textTokenCounts = new Map<string, { count: number; firstObserved: string }>();
    const numericCounts = new Map<number, number>();
    const allNumericValues: number[] = [];

    // Scan all non-null, non-empty cells
    for (let r = 0; r < df.rows.length; r++) {
      const cell = df.rows[r][colIndex];
      if (cell === null || cell === undefined) continue;

      if (typeof cell === "string") {
        const trimmed = cell.trim();
        if (trimmed === "") continue;

        const norm = normalizeText(trimmed);
        if (MISSING_TEXT_TOKENS.includes(norm)) {
          const existing = textTokenCounts.get(norm) ?? { count: 0, firstObserved: trimmed };
          existing.count++;
          textTokenCounts.set(norm, existing);
          continue;
        }

        const num = Number(trimmed);
        if (!Number.isNaN(num)) {
          allNumericValues.push(num);
          numericCounts.set(num, (numericCounts.get(num) ?? 0) + 1);
        }
      } else if (typeof cell === "number" && !Number.isNaN(cell)) {
        allNumericValues.push(cell);
        numericCounts.set(cell, (numericCounts.get(cell) ?? 0) + 1);
      }
    }

    // A. Text tokens
    for (const [, item] of textTokenCounts) {
      colCandidates.push({
        column: col.name,
        code: item.firstObserved,
        count: item.count,
        kind: "text_token",
        reason: "Text value often used to mean 'missing'.",
      });
    }

    // B. Numeric sentinels
    // others: column's numeric values excluding CODES
    const others = allNumericValues.filter((v) => !CODES.includes(v));
    const sortedOthers = [...others].sort((a, b) => a - b);

    // Check codes in CODES
    for (const c of CODES) {
      const count = numericCounts.get(c);
      if (count && count > 0) {
        let isCandidate = false;
        if (sortedOthers.length >= 10) {
          const q1 = quantile(sortedOthers, 0.25);
          const q3 = quantile(sortedOthers, 0.75);
          const iqr = q3 - q1;
          if (c > q3 + 3 * iqr || c < q1 - 3 * iqr) {
            isCandidate = true;
          }
        }
        if (!isCandidate && sortedOthers.length > 0 && c < 0 && sortedOthers[0] >= 0) {
          isCandidate = true;
        }

        // Small coded check for 99
        if (!isCandidate && c === 99 && sortedOthers.length > 0) {
          const distinctOthers = new Set(sortedOthers);
          const allWhole = sortedOthers.every(Number.isInteger);
          if (allWhole && distinctOthers.size <= 6 && sortedOthers[sortedOthers.length - 1] <= 5) {
            isCandidate = true;
          }
        }

        if (isCandidate) {
          colCandidates.push({
            column: col.name,
            code: String(c),
            count,
            kind: "numeric_sentinel",
            reason: `${c} is far outside the other values in this column and is a common missing-data code.`,
          });
        }
      }
    }

    // Small coded columns: 9
    const countNine = numericCounts.get(9);
    if (countNine && countNine > 0) {
      const othersForNine = allNumericValues.filter((v) => !CODES.includes(v) && v !== 9);
      if (othersForNine.length > 0) {
        const distinctOthers = new Set(othersForNine);
        const allWhole = othersForNine.every(Number.isInteger);
        if (allWhole && distinctOthers.size <= 6 && maxOf(othersForNine) <= 5) {
          colCandidates.push({
            column: col.name,
            code: "9",
            count: countNine,
            kind: "numeric_sentinel",
            reason: "9 is far outside the other values in this column and is a common missing-data code.",
          });
        }
      }
    }

    // C. Dictionary awareness:
    // Only when schema.dictionarySource === "imported":
    // If schema.columns[x].levels declares the code, set declaredLabel and keep it as a candidate.
    // Also, if a declared level label is in MISSING_TEXT_TOKENS and occurs in data, ensure it is proposed.
    if (schema.dictionarySource === "imported" && col.levels && col.levels.length > 0) {
      for (const cand of colCandidates) {
        const matchingLevel = col.levels.find(
          (lvl) =>
            normalizeText(String(lvl.code)) === normalizeText(cand.code) ||
            Number(lvl.code) === Number(cand.code),
        );
        if (matchingLevel) {
          cand.declaredLabel = matchingLevel.label;
        }
      }

      for (const lvl of col.levels) {
        const lvlLabelNorm = normalizeText(lvl.label);
        if (MISSING_TEXT_TOKENS.includes(lvlLabelNorm)) {
          const codeStr = String(lvl.code);
          const alreadyCand = colCandidates.some(
            (c) => normalizeText(c.code) === normalizeText(codeStr) || Number(c.code) === Number(lvl.code),
          );
          if (!alreadyCand) {
            // Count occurrences in df
            let count = 0;
            const lvlNum = Number(codeStr);
            const isLvlNum = !Number.isNaN(lvlNum);
            for (let r = 0; r < df.rows.length; r++) {
              const cell = df.rows[r][colIndex];
              if (cell === null || cell === undefined) continue;
              if (typeof cell === "number" && isLvlNum && cell === lvlNum) count++;
              else if (typeof cell === "string") {
                if (normalizeText(cell) === normalizeText(codeStr)) count++;
                else if (isLvlNum && Number(cell.trim()) === lvlNum) count++;
              }
            }
            if (count > 0) {
              colCandidates.push({
                column: col.name,
                code: codeStr,
                count,
                kind: isLvlNum ? "numeric_sentinel" : "text_token",
                reason: isLvlNum
                  ? `${codeStr} is far outside the other values in this column and is a common missing-data code.`
                  : "Text value often used to mean 'missing'.",
                declaredLabel: lvl.label,
              });
            }
          }
        }
      }
    }

    candidates.push(...colCandidates);
  }

  // Sort candidates by column order, then by count descending
  const colOrder = new Map(schema.columns.map((c, i) => [c.name, i]));
  candidates.sort((a, b) => {
    const ordA = colOrder.get(a.column) ?? 999;
    const ordB = colOrder.get(b.column) ?? 999;
    if (ordA !== ordB) return ordA - ordB;
    return b.count - a.count;
  });

  return candidates;
}

export function recodeToMissing(
  df: DataFrame,
  schema: Schema,
  column: string,
  codes: string[],
): { df: DataFrame; schema: Schema; changed: number } {
  const colIndex = df.columns.findIndex((c) => c.name === column);
  if (colIndex === -1) {
    return { df, schema, changed: 0 };
  }

  const textCodes = new Set<string>();
  const numericCodes = new Set<number>();

  for (const code of codes) {
    textCodes.add(normalizeText(code));
    const num = Number(code.trim());
    if (!Number.isNaN(num)) {
      numericCodes.add(num);
    }
  }

  function cellMatches(val: Cell): boolean {
    if (val === null || val === undefined) return false;
    if (typeof val === "number" && !Number.isNaN(val)) {
      return numericCodes.has(val);
    }
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed === "") return false;
      if (textCodes.has(normalizeText(trimmed))) return true;
      const num = Number(trimmed);
      if (!Number.isNaN(num) && numericCodes.has(num)) return true;
    }
    return false;
  }

  let changed = 0;
  const newRows = df.rows.map((row) => {
    const val = row[colIndex];
    if (cellMatches(val)) {
      changed++;
      const nextRow = [...row];
      nextRow[colIndex] = null;
      return nextRow;
    }
    return row;
  });

  const newDf: DataFrame = {
    ...df,
    rows: newRows,
  };

  const reInferred = inferSchema(newDf);
  const newCol = reInferred.find((c) => c.name === column);
  const prevCol = schema.columns.find((c) => c.name === column);

  if (!newCol || !prevCol) {
    return { df: newDf, schema, changed };
  }

  const userChangedType = prevCol.confirmedType !== prevCol.inferredType;
  const confirmedType = userChangedType ? prevCol.confirmedType : newCol.inferredType;

  // Filter out any level whose code was recoded
  const remainingLevels = prevCol.levels
    ? prevCol.levels.filter((lvl) => {
        const lvlNorm = normalizeText(String(lvl.code));
        const lvlNum = Number(lvl.code);
        if (textCodes.has(lvlNorm)) return false;
        if (!Number.isNaN(lvlNum) && numericCodes.has(lvlNum)) return false;
        return true;
      })
    : undefined;

  const updatedCol: SchemaColumn = {
    ...prevCol,
    name: column,
    inferredType: newCol.inferredType,
    confirmedType,
    cardinalityTier: newCol.cardinalityTier,
    distinctCount: newCol.distinctCount,
    isWholeNumberNumeric: newCol.isWholeNumberNumeric,
    exclusionReason: newCol.exclusionReason, // cleared if newCol has none
    levels: confirmedType === "continuous" ? undefined : (prevCol.levels ? remainingLevels : newCol.levels),
  };

  const newSchema: Schema = {
    ...schema,
    columns: schema.columns.map((c) => (c.name === column ? updatedCol : c)),
  };

  return { df: newDf, schema: newSchema, changed };
}
