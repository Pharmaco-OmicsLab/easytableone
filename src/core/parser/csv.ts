import Papa from "papaparse";
import type { Cell, DataFrame, ParseWarning } from "../types";

export const DEFAULT_MISSING_SENTINELS = [
  "",
  "NA",
  "N/A",
  "NULL",
  "na",
  "n/a",
  "null",
  ".",
  "#N/A",
];

export const EXCEL_ERROR_TOKENS = [
  "#REF!",
  "#VALUE!",
  "#DIV/0!",
  "#NAME?",
  "#NULL!",
  "#NUM!",
  "#SPILL!",
  "#CALC!",
  "#GETTING_DATA",
];

export const ALL_MISSING_SENTINELS = [...DEFAULT_MISSING_SENTINELS, ...EXCEL_ERROR_TOKENS];

export function isExcelErrorToken(value: string): boolean {
  return EXCEL_ERROR_TOKENS.includes(value.trim().toUpperCase());
}

export function recordExcelError(
  counts: Record<string, { count: number; tokens: Set<string> }>,
  column: string,
  token: string,
): void {
  const entry = counts[column] ?? { count: 0, tokens: new Set<string>() };
  entry.count++;
  entry.tokens.add(token.trim().toUpperCase());
  counts[column] = entry;
}

export function appendExcelErrorWarnings(
  warnings: ParseWarning[],
  counts: Record<string, { count: number; tokens: Set<string> }>,
): Record<string, number> | undefined {
  const excelErrorCounts: Record<string, number> = {};
  for (const [column, entry] of Object.entries(counts)) {
    excelErrorCounts[column] = entry.count;
    const tokenList = Array.from(entry.tokens).join(", ");
    warnings.push({
      message: `Column '${column}': ${entry.count} Excel error value(s) (${tokenList}) treated as missing.`,
      column,
    });
  }
  return Object.keys(excelErrorCounts).length > 0 ? excelErrorCounts : undefined;
}

function isEuropeanDecimalPattern(value: string): boolean {
  // Matches "123,45" or "1.234,56"
  if (/^-?\d+,\d+$/.test(value)) return true;
  if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(value)) return true;
  return false;
}

export function parseCSV(file: File, onProgress?: (pct: number) => void): Promise<DataFrame> {
  return new Promise((resolve, reject) => {

    let headers: Array<{ originalName: string; name: string }> = [];
    const rows: Cell[][] = [];
    const warnings: ParseWarning[] = [];
    const excelErrorAccumulator: Record<string, { count: number; tokens: Set<string> }> = {};
    let isFirstRow = true;


    Papa.parse(file, {
      worker: typeof window !== "undefined" && typeof Worker !== "undefined",
      skipEmptyLines: true,
      step: (results, _parser) => {
        const rawRow = results.data as string[];
        if (isFirstRow) {
          headers = rawRow.map((h, _colIndex) => {
            const originalName = typeof h === "string" ? h : "";
            return {
              originalName,
              name: originalName.trim(), // only trim leading/trailing whitespace
            };
          });
          isFirstRow = false;
        } else {
          // Process cells
          const processedRow: Cell[] = rawRow.map((cellStr, colIndex) => {
            const trimmed = typeof cellStr === "string" ? cellStr.trim() : String(cellStr);
            if (isExcelErrorToken(trimmed)) {
              recordExcelError(
                excelErrorAccumulator,
                headers[colIndex]?.name || String(colIndex),
                trimmed,
              );
              return null;
            }
            if (DEFAULT_MISSING_SENTINELS.includes(trimmed)) {
              return null;
            }
            if (isEuropeanDecimalPattern(trimmed)) {
              warnings.push({
                message: `Cell matches European decimal format, which is not supported (use . for decimals).`,
                row: rows.length + 1, // +1 because headers were row 0
                column: headers[colIndex]?.name || String(colIndex),
              });
            }

            // Try to parse number if it's not empty and matches US format
            if (trimmed !== "" && !Number.isNaN(Number(trimmed))) {
              return Number(trimmed);
            }
            return trimmed;
          });
          rows.push(processedRow);
        }

        if (onProgress && file.size > 0) {
          // Papa doesn't expose byte progress directly in step easily, but we can approximate
          // or we can just not emit progress for now
        }
      },
      complete: () => {
        const excelErrorCounts = appendExcelErrorWarnings(warnings, excelErrorAccumulator);
        resolve({
          columns: headers,
          rows,
          meta: {
            sourceFile: file.name,
            parseWarnings: warnings,
            locale: { decimalSeparator: ".", thousandSeparator: "," },
            detectedHeaderRow: 0,
            confirmedHeaderRow: 0,
            encoding: "utf-8",
            missingSentinels: [...ALL_MISSING_SENTINELS],
            ...(excelErrorCounts && { excelErrorCounts }),
          },
        });
      },
      error: (error) => reject(error),
    });
  });
}
