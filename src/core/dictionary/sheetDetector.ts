/**
 * src/core/dictionary/sheetDetector.ts
 *
 * Auto-detect a variable dictionary sheet from a workbook (Step 8 / D39).
 *
 * Heuristic:
 * 1. For each non-data sheet, find the column whose cell values (trimmed)
 *    match the most data column names → "raw column".
 *    Score = matched_count / total_data_columns.
 * 2. If score ≥ 0.8, that sheet is a candidate.
 * 3. Find a second column: mostly-string, avg length > 5, mostly-unique,
 *    NOT the raw column → "label column".
 * 4. Optional: column whose name matches /unit/i with short string values
 *    → "units column".
 *
 * User confirmation is ALWAYS required before using detected labels (D39).
 */

import { stripBracketCodes } from '../format/tableTitle';
import { parseEncodingString, type ParsedLevel } from './encodingParser';
import type { DictionaryMap } from './importer';

export interface WorkbookSheets {
  /** Map of sheet name → rows (first row = header). */
  sheets: Record<string, Cell[][]>;
}

type Cell = string | number | boolean | null | undefined;

function cellStr(c: Cell): string {
  if (c === null || c === undefined) return '';
  return String(c).trim();
}

export interface DetectedDictionarySheet {
  sheetName: string;
  /** Column header whose values match data column names. */
  rawColumn: string;
  /** Column header with display labels. */
  labelColumn: string;
  /** Optional column with units. */
  unitsColumn?: string;
  /** Optional column with encoding strings (e.g. "1: Yes, 2: No"). */
  encodingColumn?: string;
  /** True when parsed as one row per level (variable/code/label). */
  isLongFormat?: boolean;
  /** Optional long-format column with level codes. */
  codeColumn?: string;
  /** 0..1 fraction of data columns successfully mapped. */
  matchScore: number;
  /** First 8 raw→label pairs for the preview modal. */
  preview: Array<{ raw: string; label: string; units?: string }>;
  /** Full map from raw column name → { label, units? }. */
  mapping: Record<string, { label: string; units?: string }>;
  /**
   * Full DictionaryMap (with levels) — ready for classifyColumnsFromDict.
   * Present when at least one data column was matched.
   */
  dictionaryMap?: DictionaryMap;
}

/**
 * Score how well a column in the candidate sheet matches the data column names.
 * Returns fraction of data columns that appear in that candidate column's values.
 * Both sides are normalized via stripBracketCodes so a dict with "GA" matches a
 * data column "[b1]GA".
 */
function scoreColumnAsRaw(
  colValues: string[],
  dataColumnNames: readonly string[],
): number {
  const normalizedValues = new Set(
    colValues.filter(Boolean).map((v) => stripBracketCodes(v).trim()),
  );
  let matched = 0;
  for (const name of dataColumnNames) {
    if (normalizedValues.has(stripBracketCodes(name).trim())) matched++;
  }
  return dataColumnNames.length > 0 ? matched / dataColumnNames.length : 0;
}

/**
 * Return the column index (0-based) with the highest raw-column score,
 * along with the score. Returns { idx: -1, score: 0 } if no column qualifies.
 */
function findBestRawColumn(
  rows: Cell[][],
  dataColumnNames: readonly string[],
): { idx: number; colName: string; score: number; values: string[] } {
  if (rows.length < 2) return { idx: -1, colName: '', score: 0, values: [] };

  const header = rows[0].map(cellStr);
  const dataRows = rows.slice(1);

  let bestIdx = -1;
  let bestScore = 0;
  let bestColName = '';
  let bestValues: string[] = [];

  for (let colIdx = 0; colIdx < header.length; colIdx++) {
    const colValues = dataRows.map((row) => cellStr(row[colIdx])).filter(Boolean);
    const score = scoreColumnAsRaw(colValues, dataColumnNames);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = colIdx;
      bestColName = header[colIdx];
      bestValues = colValues;
    }
  }

  return { idx: bestIdx, colName: bestColName, score: bestScore, values: bestValues };
}

/**
 * Find the best "label column" — a column that is not the raw column,
 * has mostly string values, average length > 5, and mostly unique per row.
 *
 * Priority 1: a column whose header explicitly says "label" or "description"
 *   (but NOT an encoding/definition column, which findEncodingColumn needs).
 * Priority 2: highest avgLen × uniqueness, skipping encoding-like headers so
 *   that columns with headers matching /defin|encod|levels?|^codes?$|categ/i
 *   are left for findEncodingColumn rather than being consumed here.
 */
function findLabelColumn(
  rows: Cell[][],
  rawColIdx: number,
): { idx: number; colName: string } {
  if (rows.length < 2) return { idx: -1, colName: '' };

  const header = rows[0].map(cellStr);
  const dataRows = rows.slice(1);

  // Priority 1: explicit label/description header, not an encoding/definition column.
  for (let colIdx = 0; colIdx < header.length; colIdx++) {
    if (colIdx === rawColIdx) continue;
    const h = header[colIdx].toLowerCase();
    if (
      /^label$|label_|_label|^description$/.test(h) &&
      !/defin|encod|levels?|^codes?$|categ/i.test(h)
    ) {
      return { idx: colIdx, colName: header[colIdx] };
    }
  }

  // Priority 2: highest avgLen × uniqueness, skipping encoding-like headers.
  let bestIdx = -1;
  let bestScore = -1;
  let bestColName = '';

  for (let colIdx = 0; colIdx < header.length; colIdx++) {
    if (colIdx === rawColIdx) continue;
    if (/defin|encod|levels?|^codes?$|categ/i.test(header[colIdx])) continue;
    const colValues = dataRows.map((row) => cellStr(row[colIdx])).filter(Boolean);
    if (colValues.length === 0) continue;

    // Exclude columns containing newlines
    const hasNewline = colValues.some((v) => v.includes('\n') || v.includes('\r'));
    if (hasNewline) continue;

    // Exclude columns where values start with brackets (bracket codes)
    const hasBrackets = colValues.some((v) => /^\[.*?\]/.test(v));
    if (hasBrackets) continue;

    // Exclude columns that look like computer variable names (no spaces, contains underscores)
    const isComputerVar = colValues.some((v) => /^[a-zA-Z0-9_]+$/.test(v) && v.includes('_') && !v.includes(' '));
    if (isComputerVar) continue;

    const avgLen = colValues.reduce((s, v) => s + v.length, 0) / colValues.length;
    if (avgLen <= 5 || avgLen > 40) continue;

    const uniqueness = new Set(colValues).size / colValues.length;
    const score = avgLen * uniqueness;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = colIdx;
      bestColName = header[colIdx];
    }
  }

  return { idx: bestIdx, colName: bestColName };
}

/**
 * Find a column whose header matches /unit/i and has short string values.
 */
function findUnitsColumn(rows: Cell[][], excludeIndices: number[]): { idx: number; colName: string } {
  if (rows.length < 2) return { idx: -1, colName: '' };
  const header = rows[0].map(cellStr);
  for (let colIdx = 0; colIdx < header.length; colIdx++) {
    if (excludeIndices.includes(colIdx)) continue;
    if (/unit/i.test(header[colIdx])) {
      return { idx: colIdx, colName: header[colIdx] };
    }
  }
  return { idx: -1, colName: '' };
}

/**
 * Find a column whose header matches encoding-related keywords.
 * Must not be one of the excluded column indices (raw, label, units).
 */
function findEncodingColumn(rows: Cell[][], excludeIndices: number[]): { idx: number; colName: string } {
  if (rows.length < 2) return { idx: -1, colName: '' };
  const header = rows[0].map(cellStr);
  
  // Priority 1: defin, encod, coding, levels, codes
  let idx = header.findIndex(
    (h, i) => !excludeIndices.includes(i) && /defin|encod|coding|levels?|^codes?$/i.test(h),
  );
  
  // Priority 2: categ
  if (idx === -1) {
    idx = header.findIndex(
      (h, i) => !excludeIndices.includes(i) && /categ/i.test(h),
    );
  }
  
  if (idx === -1) return { idx: -1, colName: '' };
  return { idx, colName: header[idx] };
}

function findCodeColumn(rows: Cell[][], excludeIndices: number[]): { idx: number; colName: string } {
  if (rows.length < 2) return { idx: -1, colName: '' };
  const header = rows[0].map(cellStr);
  const idx = header.findIndex((h, i) => !excludeIndices.includes(i) && /^codes?$/i.test(h));
  if (idx === -1) return { idx: -1, colName: '' };
  return { idx, colName: header[idx] };
}

function normalizeLongFormatCode(value: string): string | number {
  const trimmed = value.trim();
  if (/^-?\d+(?:\.0+)?$/.test(trimmed)) return parseInt(trimmed, 10);
  return trimmed;
}

function hasMostlyNumericShortCodes(rows: Cell[][], codeIdx: number): boolean {
  const values = rows.slice(1).map((row) => cellStr(row[codeIdx])).filter(Boolean);
  if (values.length === 0) return false;
  const numericShort = values.filter((value) => /^-?\d+(?:\.\d+)?$/.test(value) && value.length <= 8);
  return numericShort.length / values.length >= 0.8;
}

function hasDuplicateRawValues(rows: Cell[][], rawIdx: number): boolean {
  const seen = new Set<string>();
  for (const row of rows.slice(1)) {
    const value = cellStr(row[rawIdx]).toLowerCase();
    if (!value) continue;
    if (seen.has(value)) return true;
    seen.add(value);
  }
  return false;
}

/**
 * Parse a dictionary sheet and build its metadata mapping and levels dictionary.
 */
export function parseDictionarySheet(
  rows: Cell[][],
  dataColumnNames: readonly string[],
): Omit<DetectedDictionarySheet, 'sheetName'> | null {
  if (rows.length < 2) return null;

  const raw = findBestRawColumn(rows, dataColumnNames);
  if (raw.idx < 0) return null;

  const lbl = findLabelColumn(rows, raw.idx);
  if (lbl.idx < 0) return null;

  const code = findCodeColumn(rows, [raw.idx, lbl.idx]);
  const isLongFormat = code.idx >= 0 && hasDuplicateRawValues(rows, raw.idx) && hasMostlyNumericShortCodes(rows, code.idx);
  const enc = findEncodingColumn(rows, [raw.idx, lbl.idx]);
  const units = findUnitsColumn(rows, [raw.idx, lbl.idx, ...(enc.idx >= 0 ? [enc.idx] : [])]);
  const dataRows = rows.slice(1);

  const normalizedToDataCol = new Map<string, string>();
  for (const name of dataColumnNames) {
    normalizedToDataCol.set(stripBracketCodes(name).trim().toLowerCase(), name);
  }
  const dataColKeyFor = (rawVal: string) => {
    const cleanRaw = stripBracketCodes(rawVal).trim().toLowerCase();
    return normalizedToDataCol.get(cleanRaw) ?? rawVal;
  };

  const mapping: Record<string, { label: string; units?: string }> = {};
  if (isLongFormat) {
    for (const row of dataRows) {
      const rawVal = cellStr(row[raw.idx]);
      if (!rawVal) continue;
      const dataColKey = dataColKeyFor(rawVal);
      if (!mapping[dataColKey]) mapping[dataColKey] = { label: '' };
    }
  } else {
    for (const row of dataRows) {
      const rawVal = cellStr(row[raw.idx]);
      const lblVal = cellStr(row[lbl.idx]);
      if (!rawVal || !lblVal) continue;
      const dataColKey = dataColKeyFor(rawVal);
      const entry: { label: string; units?: string } = { label: lblVal };
      if (units.idx >= 0) {
        const u = cellStr(row[units.idx]);
        if (u) entry.units = u;
      }
      mapping[dataColKey] = entry;
    }
  }

  const preview = Object.entries(mapping)
    .slice(0, 8)
    .map(([r, v]) => ({ raw: r, label: v.label, ...(v.units ? { units: v.units } : {}) }));

  const dictionaryMap: DictionaryMap = {};
  if (isLongFormat) {
    const grouped = new Map<string, ParsedLevel[]>();
    for (const row of dataRows) {
      const rawVal = cellStr(row[raw.idx]);
      const codeVal = cellStr(row[code.idx]);
      const lblVal = cellStr(row[lbl.idx]);
      if (!rawVal || !codeVal || !lblVal) continue;
      const dataColKey = dataColKeyFor(rawVal);
      const levels = grouped.get(dataColKey) ?? [];
      const normalizedCode = normalizeLongFormatCode(codeVal);
      if (!levels.some((level) => String(level.code) === String(normalizedCode))) {
        levels.push({ code: normalizedCode, label: lblVal });
      }
      grouped.set(dataColKey, levels);
    }
    for (const [dataColKey, levels] of grouped) {
      dictionaryMap[dataColKey] = levels.length >= 2 ? { levels } : {};
    }
  } else {
    for (const row of dataRows) {
      const rawVal = cellStr(row[raw.idx]);
      const lblVal = cellStr(row[lbl.idx]);
      if (!rawVal) continue;
      const dataColKey = dataColKeyFor(rawVal);
      const dmEntry: DictionaryMap[string] = {};
      if (lblVal) dmEntry.label = lblVal;
      if (units.idx >= 0) {
        const u = cellStr(row[units.idx]);
        if (u) dmEntry.units = u;
      }
      if (enc.idx >= 0) {
        const encVal = cellStr(row[enc.idx]);
        if (encVal) {
          const { levels } = parseEncodingString(encVal);
          if (levels.length >= 2) {
            dmEntry.levels = levels;
          } else if (!dmEntry.units) {
            dmEntry.units = encVal;
          }
        }
      }
      dictionaryMap[dataColKey] = dmEntry;
    }
  }

  return {
    rawColumn: raw.colName,
    labelColumn: lbl.colName,
    ...(units.idx >= 0 ? { unitsColumn: units.colName } : {}),
    ...(enc.idx >= 0 ? { encodingColumn: enc.colName } : {}),
    ...(isLongFormat ? { isLongFormat: true, codeColumn: code.colName } : {}),
    matchScore: raw.score,
    preview,
    mapping,
    dictionaryMap,
  };
}

/**
 * Scan all non-data sheets for variable dictionary candidates.
 * Returns candidates ranked by matchScore (highest first).
 * Only returns sheets with score ≥ 0.8 (D39 threshold).
 */
export function detectDictionarySheets(
  workbook: WorkbookSheets,
  dataSheetName: string,
  dataColumnNames: readonly string[],
): DetectedDictionarySheet[] {
  const MIN_SCORE = 0.8;
  const candidates: DetectedDictionarySheet[] = [];

  for (const [sheetName, rows] of Object.entries(workbook.sheets)) {
    if (sheetName === dataSheetName) continue;
    if (rows.length < 2) continue;

    const parsed = parseDictionarySheet(rows, dataColumnNames);
    if (!parsed || parsed.matchScore < MIN_SCORE) continue;

    candidates.push({
      sheetName,
      ...parsed,
    });
  }

  // Sort by matchScore descending
  candidates.sort((a, b) => b.matchScore - a.matchScore);
  return candidates;
}
