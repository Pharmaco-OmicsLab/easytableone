import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { enumerateSheets, parseXLSXSheet } from "../../core/parser/xlsx";
import { LARGE_N_NOTICE_THRESHOLD, describeLargeNNotice, MAX_DATA_ROWS, describeRowLimitExceeded } from "../../core/performance/largeDatasetGuardrails";
import { useStore } from "../../store";
import AboutThisStep from "../components/AboutThisStep";
import type { Cell } from "../../core/types";

interface PreviewState {
  headers: string[];
  rows: Cell[][];
  rawRows: Cell[][];
  rowCount: number;
  colCount: number;
}

function cellText(cell: Cell | undefined): string {
  if (cell === null || cell === undefined) return "";
  return String(cell);
}

function likelyGroupingCandidates(preview: PreviewState): string[] {
  return preview.headers.filter((_, colIndex) => {
    const values = preview.rows.map((row) => cellText(row[colIndex])).filter(Boolean);
    const uniqueCount = new Set(values).size;
    return uniqueCount >= 2 && uniqueCount <= 5 && uniqueCount < values.length;
  });
}

interface SheetHeaderStageProps {
  embedded?: boolean;
}

export default function SheetHeaderStage({ embedded = false }: SheetHeaderStageProps) {
  const {
    file,
    sheets,
    setSheets,
    selectedSheet,
    setSelectedSheet,
    headerRowIndex,
    setHeaderRowIndex,
    data,
    setData,
    setStage,
    setError,
  } = useStore();
  const isCSV = file?.name.toLowerCase().endsWith(".csv");
  const shouldShowSheetPicker = !isCSV;

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const displayedHeaderRow = headerRowIndex + 1;

  useEffect(() => {
    if (!isCSV && sheets.length === 1 && selectedSheet !== sheets[0].name) {
      setSelectedSheet(sheets[0].name);
    }
  }, [isCSV, selectedSheet, setSelectedSheet, sheets]);

  useEffect(() => {
    let cancelled = false;

    async function loadMissingSheets() {
      if (!file || isCSV || sheets.length > 0) return;

      try {
        const { sheets: parsedSheets } = await enumerateSheets(file);
        if (cancelled) return;
        setSheets(parsedSheets);
        if (parsedSheets.length === 1 && selectedSheet !== parsedSheets[0].name) {
          setSelectedSheet(parsedSheets[0].name);
        }
      } catch (err: any) {
        if (!cancelled) setError(err.message || "Failed to read workbook sheets");
      }
    }

    loadMissingSheets();
    return () => {
      cancelled = true;
    };
  }, [file, isCSV, selectedSheet, setError, setSelectedSheet, setSheets, sheets.length]);

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (isCSV && data) {
        setPreview({
          headers: data.columns.map((c) => c.originalName),
          rows: data.rows.slice(0, 5),
          rawRows: [data.columns.map((c) => c.originalName), ...data.rows.slice(0, 9)],
          rowCount: data.rows.length,
          colCount: data.columns.length,
        });
        return;
      }

      if (!file || !selectedSheet) {
        setPreview(null);
        return;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheet = workbook.Sheets[selectedSheet];
        const rawRows: Cell[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
        const header = rawRows[headerRowIndex] ?? [];
        const rows = rawRows
          .slice(headerRowIndex + 1)
          .filter((row) => row.some((cell) => cellText(cell) !== ""))
          .slice(0, 5);
        if (!cancelled) {
          const nextPreview = {
            headers: header.map((h, i) => cellText(h) || `Column_${i + 1}`),
            rows,
            rawRows: rawRows.slice(0, Math.max(10, headerRowIndex + 2)),
            rowCount: rawRows.slice(headerRowIndex + 1).filter((row) => row?.some((cell) => cellText(cell) !== "")).length,
            colCount: header.length,
          };
          setPreview(nextPreview);
          if (nextPreview.rowCount > MAX_DATA_ROWS) setError(describeRowLimitExceeded(nextPreview.rowCount));
        }
      } catch {
        if (!cancelled) setPreview(null);
      }
    }

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [data, file, headerRowIndex, isCSV, selectedSheet, setError]);

  const handleNext = async () => {
    if (isCSV) {
      setStage(3);
      return;
    }

    if (!selectedSheet) {
      setError("Please select a sheet");
      return;
    }
    if (preview && preview.rowCount > MAX_DATA_ROWS) {
      setError(describeRowLimitExceeded(preview.rowCount));
      return;
    }

    setLoading(true);
    try {
      const arrayBuffer = await file?.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const df = parseXLSXSheet(workbook, selectedSheet, headerRowIndex, file?.name);
      if (!setData(df)) return;
      setStage(3);
    } catch (err: any) {
      setError(err.message || "Failed to parse sheet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={embedded ? "" : "max-w-4xl mx-auto"}>
      {!embedded && <AboutThisStep stage="sheet-header" />}
      {!embedded && <h2 className="text-2xl font-bold mb-6">Sheet & Header Configuration</h2>}

      {shouldShowSheetPicker && (
        <div className="mb-8">
          <h3 className="text-base font-semibold mb-3">Which sheet holds the data?</h3>
          {sheets.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sheets.map((sheet) => (
                <button type="button" aria-pressed={selectedSheet === sheet.name}
                  key={sheet.name}
                  onClick={() => setSelectedSheet(sheet.name)}
                  className={`p-4 border text-left rounded-xl ${selectedSheet === sheet.name ? "border-blue-300 bg-blue-50" : "border-gray-200 hover:border-blue-300"} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-gray-900">{sheet.name}</span>
                    {sheet.isLikelyDictionary && (
                      <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded">
                        Looks like a dictionary
                      </span>
                    )}
                  </div>
                  <div className="text-sm text-gray-500">
                    {sheet.rowCount.toLocaleString()} × {sheet.colCount.toLocaleString()}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-4 border border-gray-200 rounded-lg bg-gray-50 text-sm text-gray-600">
              Reading workbook sheets...
            </div>
          )}
        </div>
      )}

      <div className="mb-8">
        <h3 className="text-base font-semibold mb-3">Click the row that contains column names</h3>
        <p className="text-sm text-gray-600 mb-4">
          Pick the row that holds your column names - usually row 1. Use the preview below to check that the first data rows line up under the right headers.
        </p>
        <div className="mb-3 flex items-center gap-2"><span className="text-sm font-medium text-gray-700">Header row</span><button type="button" aria-label="Previous row" disabled={headerRowIndex <= 0} onClick={() => setHeaderRowIndex(Math.max(0, headerRowIndex - 1))} className="h-9 w-9 rounded-lg border border-gray-300 disabled:opacity-40">−</button><output data-testid="header-row-selector" className="min-w-10 text-center text-sm font-semibold">{displayedHeaderRow}</output><button type="button" aria-label="Next row" disabled={Boolean(preview && headerRowIndex >= preview.rawRows.length - 1)} onClick={() => setHeaderRowIndex(headerRowIndex + 1)} className="h-9 w-9 rounded-lg border border-gray-300 disabled:opacity-40">+</button></div>
        {preview && preview.rowCount > MAX_DATA_ROWS && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
            {describeRowLimitExceeded(preview.rowCount)}
          </div>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Most files use Excel row 1. Choose another row only if your sheet has title notes or blank rows above the headers.
        </p>
        {preview && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <strong>Preview · select a header row</strong>
              <span className="text-xs text-gray-500">{preview.rowCount} rows x {preview.colCount} columns</span>
            </div>
            {preview.rowCount > LARGE_N_NOTICE_THRESHOLD && (
              <div className="mb-3 rounded border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
                {describeLargeNNotice(preview.rowCount)}
              </div>
            )}
            <div className="mb-3 text-xs text-gray-600">
              <span className="font-semibold">Detected headers:</span> {preview.headers.join(", ")}
            </div>
            <div className="overflow-x-auto overflow-y-visible rounded border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700">Row</th>{preview.headers.map((header, index) => (
                      <th key={`${header}-${index}`} className="px-2 py-2 text-left text-xs font-semibold text-gray-700">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {preview.rawRows.map((row, rowIndex) => (
                    <tr key={rowIndex} className={rowIndex === headerRowIndex ? "border-l-2 border-blue-600 bg-blue-50" : rowIndex < headerRowIndex ? "bg-gray-100 text-gray-500" : ""}>
                      <td className="px-2 py-1"><button type="button" aria-pressed={rowIndex === headerRowIndex} aria-label={`Use row ${rowIndex + 1} as header`} onClick={() => setHeaderRowIndex(rowIndex)} className="font-medium text-blue-700 underline">{rowIndex + 1}</button></td>{preview.headers.map((_, colIndex) => <td key={colIndex} className={`px-2 py-1 text-xs ${rowIndex < headerRowIndex ? "text-gray-500" : "text-gray-700"}`}>{cellText(row[colIndex])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 text-xs text-gray-600">
              <span className="font-semibold">Likely grouping candidates:</span>{" "}
              {likelyGroupingCandidates(preview).length > 0 ? likelyGroupingCandidates(preview).join(", ") : "none spotted in the first rows"}
            </div>
          </div>
        )}
      </div>

      {preview && <p className="mb-3 text-xs text-gray-600">{preview.rowCount.toLocaleString()} data rows · {preview.colCount.toLocaleString()} columns will be imported</p>}
      <div className="flex justify-between">
        <button
          onClick={() => setStage(1)}
          className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          data-testid="header-row-confirm"
          disabled={loading || (!isCSV && !selectedSheet) || Boolean(preview && preview.rowCount > MAX_DATA_ROWS)}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Processing..." : "Looks right"}
        </button>
      </div>
    </div>
  );
}
