import * as XLSX from "xlsx";
import type { Cell, DataFrame, ParseWarning } from "../types";
import {
  ALL_MISSING_SENTINELS,
  DEFAULT_MISSING_SENTINELS,
  appendExcelErrorWarnings,
  isExcelErrorToken,
  recordExcelError,
} from "./csv";

export interface SheetInfo {
  name: string;
  rowCount: number;
  colCount: number;
  isLikelyDictionary: boolean;
}

export async function enumerateSheets(
  file: File,
): Promise<{ workbook: XLSX.WorkBook; sheets: SheetInfo[] }> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const rowCount = range.e.r - range.s.r + 1;
    const colCount = range.e.c - range.s.c + 1;
    const isLikelyDictionary = /code|dict|variable|codebook/i.test(name);
    return { name, rowCount, colCount, isLikelyDictionary };
  });

  return { workbook, sheets };
}

export function detectHeaderRow(rows: any[][]): number {
  // Heuristic: first row where >50% cells are non-numeric and unique
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    let nonNumericCount = 0;
    const uniqueVals = new Set();
    let validCellCount = 0;

    for (const cell of row) {
      if (cell === null || cell === undefined || cell === "") continue;
      validCellCount++;
      const str = String(cell);
      uniqueVals.add(str);
      if (Number.isNaN(Number(str))) {
        nonNumericCount++;
      }
    }

    if (
      validCellCount > 0 &&
      nonNumericCount / validCellCount > 0.5 &&
      uniqueVals.size / validCellCount > 0.8
    ) {
      return i;
    }
  }
  return 0; // Default to first row
}

export function parseXLSXSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  headerRowIndex: number,
  sourceFile?: string,
): DataFrame {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet ${sheetName} not found`);

  // Convert to array of arrays, raw
  const rawData: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });

  if (rawData.length <= headerRowIndex) {
    throw new Error("Header row index out of bounds");
  }

  const headerRow = rawData[headerRowIndex];
  const headers = headerRow.map((h, i) => {
    const originalName = String(h || `Column_${i + 1}`);
    return {
      originalName,
      name: originalName.trim(),
    };
  });

  const rows: Cell[][] = [];
  const warnings: ParseWarning[] = [];
  const excelErrorAccumulator: Record<string, { count: number; tokens: Set<string> }> = {};

  for (let r = headerRowIndex + 1; r < rawData.length; r++) {
    const rawRow = rawData[r];
    // Skip empty rows
    if (!rawRow || rawRow.every((c) => c === "" || c === null || c === undefined)) continue;

    const processedRow: Cell[] = headers.map((_, colIndex) => {
      const cellAddress = XLSX.utils.encode_cell({ r, c: colIndex });
      const worksheetCell = sheet[cellAddress];
      const displayedError = typeof worksheetCell?.w === "string" ? worksheetCell.w.trim() : "";
      if (worksheetCell?.t === "e" || (displayedError && isExcelErrorToken(displayedError))) {
        recordExcelError(excelErrorAccumulator, headers[colIndex].name, displayedError || "#ERROR!");
        return null;
      }

      let cell = rawRow[colIndex];
      if (cell === null || cell === undefined) cell = "";

      const strVal = typeof cell === "string" ? cell.trim() : String(cell);
      if (isExcelErrorToken(strVal)) {
        recordExcelError(excelErrorAccumulator, headers[colIndex].name, strVal);
        return null;
      }
      if (DEFAULT_MISSING_SENTINELS.includes(strVal)) {
        return null;
      }

      if (typeof cell === "number") {
        return cell;
      }

      if (typeof cell === "string") {
        // European decimal check
        if (/^-?\d+,\d+$/.test(strVal) || /^-?\d{1,3}(\.\d{3})+,\d+$/.test(strVal)) {
          warnings.push({
            message: `Cell matches European decimal format, which is not supported (use . for decimals).`,
            row: r,
            column: headers[colIndex].name,
          });
        }
        if (strVal !== "" && !Number.isNaN(Number(strVal))) {
          return Number(strVal);
        }
      }

      return typeof cell === "string" ? strVal : cell;
    });

    rows.push(processedRow);
  }

  const excelErrorCounts = appendExcelErrorWarnings(warnings, excelErrorAccumulator);

  return {
    columns: headers,
    rows,
    meta: {
      sourceFile: sourceFile ?? "workbook",
      sheetName,
      parseWarnings: warnings,
      locale: { decimalSeparator: ".", thousandSeparator: "," },
      detectedHeaderRow: headerRowIndex,
      confirmedHeaderRow: headerRowIndex,
      encoding: "utf-8",
      missingSentinels: [...ALL_MISSING_SENTINELS],
      ...(excelErrorCounts && { excelErrorCounts }),
    },
  };
}
