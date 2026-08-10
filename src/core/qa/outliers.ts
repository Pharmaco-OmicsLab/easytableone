import type { DataFrame } from "../types";

export interface OutlierResult {
  method: "iqr" | "zscore";
  rowIndices: number[];
  values: number[];
}

/**
 * Linear interpolation quantile (Type 7, matches numpy/pandas default).
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

export function detectOutliers(
  data: DataFrame,
  colName: string,
  method: "iqr" | "zscore" = "iqr",
): OutlierResult | null {
  const colIndex = data.columns.findIndex((c) => c.name === colName);
  if (colIndex === -1) return null;

  const valuesWithIdx: Array<{ val: number; idx: number }> = [];
  for (let i = 0; i < data.rows.length; i++) {
    const val = data.rows[i][colIndex];
    if (typeof val === "number" && !Number.isNaN(val)) {
      valuesWithIdx.push({ val, idx: i });
    }
  }

  // (S-14) return null only when computation is impossible (< 4 numeric values)
  if (valuesWithIdx.length < 4) return null;

  const sortedVals = valuesWithIdx.map((v) => v.val).sort((a, b) => a - b);
  const n = sortedVals.length;

  const rowIndices: number[] = [];
  const values: number[] = [];

  if (method === "iqr") {
    const q1 = quantile(sortedVals, 0.25);
    const q3 = quantile(sortedVals, 0.75);
    const iqr = q3 - q1;
    const lower = q1 - 1.5 * iqr;
    const upper = q3 + 1.5 * iqr;

    for (const item of valuesWithIdx) {
      if (item.val < lower || item.val > upper) {
        rowIndices.push(item.idx);
        values.push(item.val);
      }
    }
  } else if (method === "zscore") {
    const sum = sortedVals.reduce((acc, curr) => acc + curr, 0);
    const mean = sum / n;
    const variance = sortedVals.reduce((acc, curr) => acc + (curr - mean) ** 2, 0) / (n - 1);
    const sd = Math.sqrt(variance);

    // (S-14) sd=0 truly cannot compute z-scores → null
    if (sd === 0) return null;

    for (const item of valuesWithIdx) {
      const z = (item.val - mean) / sd;
      if (Math.abs(z) > 3) {
        rowIndices.push(item.idx);
        values.push(item.val);
      }
    }
  }

  // (S-14) Always return a result object — empty arrays when no outliers found
  return {
    method,
    rowIndices,
    values,
  };
}
