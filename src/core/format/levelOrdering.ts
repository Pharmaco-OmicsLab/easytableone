import type { SchemaColumn } from "../types";
import { resolveLevelLabel } from "./columnLabel";

/**
 * src/core/format/levelOrdering.ts
 *
 * Tail-label ordering (D35): "other", "unknown", "N/A", and similar
 * residual categories are pinned to the BOTTOM of categorical subgroup
 * listings, regardless of dictionary order.
 *
 * Rules:
 * - Applied only to `categorical_nominal` variables.
 * - `categorical_ordinal` variables are EXEMPT (their order is meaningful).
 * - Matching is case- and whitespace-insensitive; whole-label only (^...$).
 * - Stable: relative order within head and within tail is preserved.
 */

/**
 * Labels treated as "tail" — pinned to the bottom of categorical subgroup
 * listings regardless of dictionary order. Case- and whitespace-insensitive.
 * Matches whole label only.
 */
export const TAIL_LABEL_PATTERNS: readonly RegExp[] = [
  /^other$/i,
  /^others$/i,
  /^unknown$/i,
  /^n\/a$/i,
  /^na$/i,
  /^none$/i,
  /^missing$/i,
  /^not\s+specified$/i,
  /^not\s+reported$/i,
  /^not\s+applicable$/i,
];

/**
 * Returns true if the label should appear at the tail of a categorical listing.
 */
export function isTailLabel(label: string): boolean {
  const norm = label.trim();
  return TAIL_LABEL_PATTERNS.some((re) => re.test(norm));
}

/**
 * Reorder an array of levels so tail labels appear at the end.
 * Stable: preserves relative order within head and within tail.
 *
 * @param levels - Array of level items to reorder.
 * @param getLabel - Extracts the display label from an item.
 * @returns New array with tail items moved to the end.
 */
export function reorderLevelsTailLast<T>(
  levels: readonly T[],
  getLabel: (l: T) => string,
): T[] {
  const head: T[] = [];
  const tail: T[] = [];
  for (const lvl of levels) {
    (isTailLabel(getLabel(lvl)) ? tail : head).push(lvl);
  }
  return [...head, ...tail];
}

export function firstNumberInLabel(label: string): number | null {
  const match = label.match(/[-+]?(?:\d+\.?\d*|\.\d+)/);
  return match ? Number(match[0]) : null;
}

export function naturalOrdinalCompare(a: string, b: string): number {
  const aNum = firstNumberInLabel(a);
  const bNum = firstNumberInLabel(b);
  if (aNum !== null && bNum !== null && aNum !== bNum) return aNum - bNum;
  if (aNum !== null && bNum === null) return -1;
  if (aNum === null && bNum !== null) return 1;
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function sortOrdinalLevels<T>(
  levels: readonly T[],
  getLabel: (l: T) => string,
): T[] {
  return [...levels].sort((a, b) => naturalOrdinalCompare(getLabel(a), getLabel(b)));
}

export function levelMatches(left: string | number | undefined, right: string | number | undefined): boolean {
  if (left === undefined || right === undefined) return false;
  if (String(left) === String(right)) return true;
  const leftNum = parseFloat(String(left));
  const rightNum = parseFloat(String(right));
  return !isNaN(leftNum) && !isNaN(rightNum) && leftNum === rightNum;
}

export function observedKeyForLevel(level: string | number, counts: Record<string, number>): string | undefined {
  return Object.keys(counts).find((key) => levelMatches(level, key));
}

export function categoricalDisplayLevels(
  countsDict: Record<string, number>,
  schemaCol: SchemaColumn | undefined,
  includePlannedZeroCountLevels: boolean,
): string[] {
  const observed = Object.keys(countsDict);
  const isOrdinal = schemaCol?.confirmedType === "categorical_ordinal";
  const hasDeclaredOrder = Boolean(schemaCol?.levels?.some((level) => typeof level.order === "number"));
  if (!includePlannedZeroCountLevels || !schemaCol?.levels?.length) {
    return isOrdinal ? sortOrdinalLevels(observed, (level) => resolveLevelLabel(level, schemaCol)) : observed;
  }
  const schemaLevels = isOrdinal && hasDeclaredOrder
    ? [...schemaCol.levels].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    : schemaCol.levels;
  const planned = schemaLevels.map((level) => observedKeyForLevel(level.code, countsDict) ?? String(level.code));
  const merged = [...planned];
  for (const level of observed) {
    if (!merged.some((existing) => levelMatches(existing, level))) {
      merged.push(level);
    }
  }
  if (isOrdinal && !hasDeclaredOrder) {
    return sortOrdinalLevels(merged, (level) => resolveLevelLabel(level, schemaCol));
  }
  return merged;
}
