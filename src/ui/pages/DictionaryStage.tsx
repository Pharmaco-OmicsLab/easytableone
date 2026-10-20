import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import {
  classifyColumnsFromDict,
  findDictEntry,
  type DictionaryMap,
} from "../../core/dictionary/importer";
import {
  detectDictionarySheets,
  parseDictionarySheet,
  type DetectedDictionarySheet,
  type WorkbookSheets,
} from "../../core/dictionary/sheetDetector";
import { parseCSV } from "../../core/parser/csv";
import { enumerateSheets, type SheetInfo } from "../../core/parser/xlsx";
import { inferSchema } from "../../core/schema/inference";
import type { SchemaColumn } from "../../core/types";
import { useStore } from "../../store";
import { sha256Hex } from "../../lib/hash";
import { DictionaryDetectModal } from "../components/DictionaryDetectModal";
import { DictionaryHelpPanel } from "../components/DictionaryHelpPanel";
import AboutThisStep from "../components/AboutThisStep";

/**
 * Stage 3 — Data Dictionary.
 *
 * Flow:
 *   1. On mount, auto-detect a dictionary sheet (D39). If a candidate with
 *      score ≥ 0.8 is found, present the DictionaryDetectModal.
 *   2a. User accepts → displayLabel + units populated from mapping →
 *       advance to Stage 4 (skipping the manual flow).
 *   2b. User picks a different sheet → modal closes → existing manual
 *       sheet-picker flow.
 *   2c. User skips → no dictionary applied → advance to Stage 4.
 *   3. If no candidate is detected, the manual flow renders directly.
 */
interface DictionaryStageProps {
  embedded?: boolean;
}

export default function DictionaryStage({ embedded = false }: DictionaryStageProps) {
  const { file, sheets, data, schema, setSchema, setStage, addAuditEntry } = useStore();
  const [dictionaryDragging, setDictionaryDragging] = useState(false);
  const [skip, setSkip] = useState(false);
  const [selectedDictionarySheet, setSelectedDictionarySheet] = useState<string>("");
  const [dictionaryFile, setDictionaryFile] = useState<File | null>(null);
  const [dictionarySheets, setDictionarySheets] = useState<SheetInfo[]>([]);
  const [dictionaryFileError, setDictionaryFileError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<DetectedDictionarySheet[]>([]);
  const [modalDismissed, setModalDismissed] = useState(false);
  const [manualOverride, setManualOverride] = useState(false);
  const [dictionaryPreview, setDictionaryPreview] = useState<any[][]>([]);
  const [dictionaryPreviewError, setDictionaryPreviewError] = useState<string | null>(null);
  const [manualMatch, setManualMatch] = useState<{ matched: number; total: number } | null>(null);

  const currentWorkbookOptions = file?.name.endsWith(".xlsx")
    ? sheets.filter((sheet) => sheet.name !== (data?.meta.sheetName ?? ""))
    : [];
  const selectedDictionarySource = selectedDictionarySheet.startsWith("uploaded:")
    ? "uploaded"
    : "current";
  const selectedSheetName = selectedDictionarySheet.replace(/^(current|uploaded):/, "");
  const dictionaryFileIsCsv = dictionaryFile?.name.toLowerCase().endsWith(".csv") ?? false;
  const countMatchedDataColumns = (mapping: Record<string, unknown> | null | undefined) => {
    if (!data) return 0;
    const dataColumnNames = new Set(data.columns.map((c) => c.name));
    return Object.keys(mapping ?? {}).filter((name) => dataColumnNames.has(name)).length;
  };
  const schemaBase = (): SchemaColumn[] => schema && schema.columns.length === data?.columns.length
    ? schema.columns
    : (data ? inferSchema(data) : []);
  const applyReplacementDictionary = (dictionary: DictionaryMap): SchemaColumn[] => {
    // Preserve existing Variable types choices and exclusions while allowing the
    // replacement dictionary to refresh the metadata it supplies.
    const base = schemaBase().map((column) => {
      const entry = findDictEntry(dictionary, column.name);
      if (!entry) return column;
      return {
        ...column,
        ...(entry.label ? { label: undefined, displayLabel: undefined } : {}),
        ...(entry.units ? { units: undefined } : {}),
        ...(entry.levels ? { levels: undefined } : {}),
      };
    });
    const classified = classifyColumnsFromDict(base, dictionary);
    // A re-imported dictionary must not silently change previously confirmed
    // types. Initial imports still use dictionary levels to assist inference.
    return schema?.columns.length === data?.columns.length
      ? classified.map((column, index) => ({ ...column, confirmedType: base[index].confirmedType }))
      : classified;
  };

  // Auto-detect on mount.
  useEffect(() => {
    let cancelled = false;
    async function detect() {
      if (!file || !data) return;
      // Only xlsx has multi-sheet workbook context to scan.
      if (!file.name.endsWith(".xlsx")) return;
      try {
        const buf = await file.arrayBuffer();
        if (cancelled) return;
        const wb = XLSX.read(buf, { type: "array" });
        const workbookSheets: WorkbookSheets = { sheets: {} };
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          workbookSheets.sheets[name] = XLSX.utils.sheet_to_json(ws, {
            header: 1,
            defval: "",
          }) as any[][];
        }
        const dataSheet = data.meta.sheetName ?? "";
        const colNames = data.columns.map((c) => c.name);
        const detected = detectDictionarySheets(workbookSheets, dataSheet, colNames);
        if (!cancelled) setCandidates(detected);
      } catch (e) {
        console.error("dictionary auto-detect failed", e);
      }
    }
    detect();
    return () => {
      cancelled = true;
    };
  }, [file, data]);

  const showModal = candidates.length > 0 && !modalDismissed;

  useEffect(() => {
    let cancelled = false;

    async function loadPreview() {
      if (!selectedDictionarySheet) {
        setDictionaryPreview([]);
        setDictionaryPreviewError(null);
        setManualMatch(null);
        return;
      }

      try {
        setDictionaryPreviewError(null);
        const sourceFile = selectedDictionarySource === "uploaded" ? dictionaryFile : file;
        if (!sourceFile) return;

        let rawData: any[][] = [];
        if (selectedDictionarySource === "uploaded" && dictionaryFileIsCsv && dictionaryFile) {
          const parsedCsv = await parseCSV(dictionaryFile);
          rawData = [parsedCsv.columns.map((c) => c.originalName), ...parsedCsv.rows];
        } else {
          const arrayBuffer = await sourceFile.arrayBuffer();
          const workbook = XLSX.read(arrayBuffer, { type: "array" });
          const sheet = workbook.Sheets[selectedSheetName];
          rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
        }

        if (!cancelled) {
          setDictionaryPreview(rawData.slice(0, 8));
          if (data) {
            const parsed = parseDictionarySheet(rawData, data.columns.map((c) => c.name));
            setManualMatch({
              matched: countMatchedDataColumns(parsed?.mapping),
              total: data.columns.length,
            });
          } else {
            setManualMatch(null);
          }
        }
      } catch (error: any) {
        if (!cancelled) {
          setDictionaryPreview([]);
          setDictionaryPreviewError(error.message || "Could not preview this dictionary sheet.");
          setManualMatch(null);
        }
      }
    }

    loadPreview();
    return () => {
      cancelled = true;
    };
  }, [selectedDictionarySheet, selectedDictionarySource, selectedSheetName, dictionaryFile, dictionaryFileIsCsv, file, data]);

  function continueWithoutDictionary() {
    if (data) {
      setSchema({ columns: inferSchema(data) });
    }
    setStage(4);
  }

  async function handleDictionaryFile(nextFile: File) {
    const lowerName = nextFile.name.toLowerCase();
    if (!lowerName.endsWith(".xlsx") && !lowerName.endsWith(".csv")) {
      setDictionaryFile(null);
      setDictionarySheets([]);
      setSelectedDictionarySheet("");
      setDictionaryFileError("Please upload an XLSX or CSV dictionary file.");
      return;
    }

    try {
      setDictionaryFileError(null);
      if (lowerName.endsWith(".csv")) {
        setDictionaryFile(nextFile);
        setDictionarySheets([{ name: "CSV dictionary", rowCount: 0, colCount: 0, isLikelyDictionary: true }]);
        setSelectedDictionarySheet("uploaded:CSV dictionary");
        setSkip(false);
        return;
      }

      const { sheets: parsedSheets } = await enumerateSheets(nextFile);
      setDictionaryFile(nextFile);
      setDictionarySheets(parsedSheets);
      setSkip(false);
      if (parsedSheets.length === 1) {
        setSelectedDictionarySheet(`uploaded:${parsedSheets[0].name}`);
      } else {
        setSelectedDictionarySheet("");
      }
    } catch (err: any) {
      setDictionaryFile(null);
      setDictionarySheets([]);
      setSelectedDictionarySheet("");
      setDictionaryFileError(err.message || "Failed to read dictionary file.");
    }
  }

  async function handleAcceptDetected(detected: DetectedDictionarySheet) {
    if (!data) return;
    const inferred = inferSchema(data);
    const matched = data.columns.filter((column) => Boolean(detected.mapping[column.name])).length;
    // Apply the dictionary without resetting choices already made in Variable types.
    const withFull = detected.dictionaryMap
      ? applyReplacementDictionary(detected.dictionaryMap)
      : schemaBase();

    // Step 3: Compute reference levels (most-frequent value) for binary/categorical columns —
    // mirrors manual path so binary display shows the "event" group (e.g. "Yes") not "No".
    const withRefLevels = withFull.map((col) => {
      if (
        ['binary', 'categorical_nominal', 'categorical_ordinal'].includes(col.confirmedType) &&
        col.referenceLevel === undefined &&
        col.levels && col.levels.length > 0
      ) {
        const colIdx = data.columns.findIndex((c) => c.name === col.name);
        const freq = new Map<string | number, number>();
        for (const row of data.rows) {
          const v = row[colIdx];
          if (v !== null && v !== undefined && !Number.isNaN(v as number)) {
            freq.set(v as string | number, (freq.get(v as string | number) ?? 0) + 1);
          }
        }
        const mostFrequent = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        return { ...col, referenceLevel: mostFrequent };
      }
      return col;
    });

    const fingerprintInput = JSON.stringify({
      source: "auto-detect",
      sheet: detected.sheetName,
      rows: Object.entries(detected.mapping)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => [k, v.label, v.units ?? ""]),
    });
    const dictionaryFingerprint = await sha256Hex(fingerprintInput);

    setSchema({
      columns: withRefLevels,
      dictionarySource: "imported",
      dictionaryFingerprint,
    });
    addAuditEntry(
      `Imported dictionary from sheet '${detected.sheetName}': matched ${matched}/${inferred.length} columns.`,
      {
        sheet: detected.sheetName,
        matched,
        total: inferred.length,
        matchScore: detected.matchScore,
      },
    );
    setCandidates([]);
    setStage(4);
  }

  function handlePickDifferent() {
    setModalDismissed(true);
    addAuditEntry("User chose to pick a different dictionary sheet manually.", {});
  }

  function handleManualOverride() {
    setManualOverride(true);
    addAuditEntry("User chose to pick a different dictionary sheet manually.", {});
  }

  function handleSkipDetected() {
    if (!data) {
      setStage(4);
      return;
    }
    setSchema({ columns: inferSchema(data) });
    addAuditEntry("User declined dictionary auto-detection.", {});
    setCandidates([]);
    setStage(4);
  }

  const handleImport = async () => {
    if (skip || !selectedDictionarySheet) {
      continueWithoutDictionary();
      return;
    }

    try {
      const sourceFile = selectedDictionarySource === "uploaded" ? dictionaryFile : file;
      let rawData: any[][] = [];
      if (selectedDictionarySource === "uploaded" && dictionaryFileIsCsv && dictionaryFile) {
        const parsedCsv = await parseCSV(dictionaryFile);
        rawData = [
          parsedCsv.columns.map((c) => c.originalName),
          ...parsedCsv.rows,
        ];
      } else {
        const arrayBuffer = await sourceFile?.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheet = workbook.Sheets[selectedSheetName];
        rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      }

      let dict: DictionaryMap = {};

      if (rawData.length > 1 && data) {
        const colNames = data.columns.map((c) => c.name);
        const parsed = parseDictionarySheet(rawData, colNames);
        const matchedCount = countMatchedDataColumns(parsed?.mapping);
        if (matchedCount === 0) {
          addAuditEntry(`Skipped manual dictionary from sheet '${selectedSheetName}': matched 0/${colNames.length} columns.`, {
            sheet: selectedSheetName,
            sourceFile: sourceFile?.name ?? null,
            matched: 0,
            total: colNames.length,
          });
          continueWithoutDictionary();
          return;
        }
        if (parsed && parsed.dictionaryMap) {
          dict = parsed.dictionaryMap;
        }
}
      if (data) {
        let schemaColumns = applyReplacementDictionary(dict);

        // Step 4b: Compute dictionary fingerprint
        const fingerprintInput = JSON.stringify({
          rows: Object.entries(dict).sort((a, b) => a[0].localeCompare(b[0]))
        });
        const dictionaryFingerprint = await sha256Hex(fingerprintInput);

        // Step 4c: Apply reference level defaults (D10)
        schemaColumns = schemaColumns.map((col) => {
          if (
            ['binary', 'categorical_nominal', 'categorical_ordinal'].includes(col.confirmedType) &&
            col.referenceLevel === undefined &&
            col.levels && col.levels.length > 0
          ) {
            // Compute most-frequent level from the dataFrame
            const colIdx = data.columns.findIndex((c) => c.name === col.name);
            const freq = new Map<string | number, number>();
            for (const row of data.rows) {
              const v = row[colIdx];
              if (v !== null && v !== undefined && !Number.isNaN(v as number)) {
                freq.set(v as string | number, (freq.get(v as string | number) ?? 0) + 1);
              }
            }
            // Fix: properly sort by value in descending order, then pick the first key
            const mostFrequent = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
            return { ...col, referenceLevel: mostFrequent };
          }
          return col;
        });

        setSchema({ columns: schemaColumns, dictionarySource: "imported", dictionaryFingerprint });
        addAuditEntry(`Imported dictionary from sheet '${selectedSheetName}' (manual).`, {
          sheet: selectedSheetName,
          sourceFile: sourceFile?.name ?? null,
          format: selectedDictionarySource === "uploaded" && dictionaryFileIsCsv ? "csv" : "xlsx",
          matched: countMatchedDataColumns(dict),
          total: data.columns.length,
        });
      }

      setStage(4);
    } catch (e) {
      console.error(e);
      // fallback
      if (data) setSchema({ columns: inferSchema(data) });
      setStage(4);
    }
  };

  const showDetectedDisclosure = embedded && showModal && !manualOverride;
  const showManualFlow = !showDetectedDisclosure;
  const manualMatched = manualMatch?.matched ?? 0;
  const manualTotal = manualMatch?.total ?? data?.columns.length ?? 0;
  const hasZeroManualMatch = Boolean(selectedDictionarySheet && !skip && manualMatch && manualMatched === 0);
  const hasPartialManualMatch = Boolean(selectedDictionarySheet && !skip && manualMatch && manualMatched > 0 && manualMatched < manualTotal);

  return (
    <div className={embedded ? "" : "max-w-3xl mx-auto"}>
      {showModal && !embedded && (
        <DictionaryDetectModal
          candidates={candidates}
          onAccept={handleAcceptDetected}
          onPickDifferent={handlePickDifferent}
          onSkip={handleSkipDetected}
        />
      )}
      {!embedded && <AboutThisStep stage="dictionary" />}

      {!embedded && <h2 className="text-2xl font-bold mb-6">Optional: Import Data Dictionary</h2>}

      {showDetectedDisclosure && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" data-testid="dictionary-detect-banner">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
                <div className="font-semibold text-blue-950">We found a dictionary on the “{candidates[0].sheetName}” sheet</div>
              <p className="mt-1">
                Labels and units can flow into your Table 1. Review the matches, then apply this dictionary.
              </p>
            </div>
          </div>
          <div className="mb-3 overflow-hidden rounded border border-blue-100 bg-white">
            <table className="min-w-full text-xs">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold text-blue-950">Variable</th>
                  <th className="px-3 py-2 text-left font-semibold text-blue-950">Label</th>
                  {candidates[0].unitsColumn && <th className="px-3 py-2 text-left font-semibold text-blue-950">Units</th>}
                </tr>
              </thead>
              <tbody>
                {candidates[0].preview.slice(0, 6).map((row) => (
                  <tr key={row.raw} className="border-t border-blue-100">
                    <td className="px-3 py-2 font-mono text-gray-700">{row.raw}</td>
                    <td className="px-3 py-2 text-gray-900">{row.label}</td>
                    {candidates[0].unitsColumn && <td className="px-3 py-2 text-gray-700">{row.units ?? ""}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mb-3 text-xs text-blue-800">Showing {Math.min(candidates[0].preview.length, 6)} of {Object.keys(candidates[0].mapping).length}</p>
          <p className="mb-3 text-xs font-medium text-blue-900">{data ? data.columns.filter((column) => Boolean(candidates[0].mapping[column.name])).length : 0} / {data?.columns.length ?? 0} columns matched</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => handleAcceptDetected(candidates[0])} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              Use this dictionary
            </button>
            <button data-testid="dictionary-skip" type="button" onClick={handleSkipDetected} className="rounded border border-blue-200 bg-white px-3 py-1.5 text-sm text-blue-800 hover:bg-blue-50">
              Skip — no dictionary
            </button>
            <button type="button" onClick={handleManualOverride} className="rounded px-1 py-1.5 text-sm font-medium text-blue-700 underline hover:text-blue-900">
              Choose another sheet
            </button>
          </div>
        </div>
      )}

      {showManualFlow && (
        <>
          {manualOverride && candidates.length > 0 && (
            <div className="mb-4">
              <button type="button" onClick={() => setManualOverride(false)} className="text-sm font-medium text-blue-700 underline hover:text-blue-900">
                Back to detected
              </button>
            </div>
          )}

          <p className="mb-6 text-gray-600">
            If you have a codebook or data dictionary defining your variables and categorical encodings
            (like "1=Male, 2=Female"), you can import it here.
          </p>

          <div className="mb-6 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <div className="font-semibold text-blue-950">Need an example?</div>
            <p className="mt-1">
              The sample workbook includes a data sheet and a dictionary sheet you can inspect or reuse as a template.
            </p>
            <a
              href={`${import.meta.env.BASE_URL}samples/easytableone_sample.xlsx`}
              download
              className="mt-3 inline-flex items-center rounded border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-800 hover:bg-blue-50"
            >
              Download example workbook
            </a>
          </div>

          <div className="mb-8">
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Upload a separate dictionary file (optional)</h3>
            <p className="mb-3 text-sm text-gray-600">If your data dictionary is in its own file rather than a sheet of your data workbook, upload it here.</p>
            <div
              onDrop={(e) => { e.preventDefault(); setDictionaryDragging(false); const dropped = e.dataTransfer.files[0]; if (dropped) handleDictionaryFile(dropped); }}
              onDragOver={(e) => { e.preventDefault(); setDictionaryDragging(true); }}
              onDragLeave={() => setDictionaryDragging(false)}
              className={`relative cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors ${dictionaryDragging ? "border-blue-600 bg-blue-50" : "border-gray-300 bg-white hover:bg-gray-50"}`}
            >
              <div className="mb-3 text-gray-400">
                <svg className="mx-auto h-10 w-10" stroke="currentColor" fill="none" viewBox="0 0 48 48" aria-hidden="true">
                  <path
                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <p className="text-base font-semibold text-gray-900">Drop your dictionary file here</p>
              <p className="mt-1 text-sm text-gray-600">or browse files on this device</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2 text-xs"><span className="rounded-full bg-gray-100 px-3 py-1">.xlsx</span><span className="rounded-full bg-gray-100 px-3 py-1">.csv</span></div>
              <input
                id="dictionaryFileInput"
                type="file"
                accept=".xlsx,.csv"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleDictionaryFile(e.target.files[0])}
                aria-label="Upload separate dictionary file"
              />
              <label htmlFor="dictionaryFileInput" className="absolute inset-0 cursor-pointer" aria-label="Browse for a dictionary file" />
            </div>
            {dictionaryFile && (
              <p className="mt-2 text-sm text-gray-600">
                {dictionaryFile.name} loaded. {dictionarySheets.length} sheet{dictionarySheets.length === 1 ? "" : "s"} found.
              </p>
            )}
            {dictionaryFileError && (
              <p className="mt-2 text-sm text-red-700">{dictionaryFileError}</p>
            )}
          </div>

          {(currentWorkbookOptions.length > 0 || dictionarySheets.length > 0) && (
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Dictionary Sheet
              </label>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2"
                value={selectedDictionarySheet}
                onChange={(e) => {
                  setSelectedDictionarySheet(e.target.value);
                  if (e.target.value) setSkip(false);
                }}
              >
                <option value="">-- No Dictionary --</option>
                {currentWorkbookOptions.map((s) => (
                  <option key={`current:${s.name}`} value={`current:${s.name}`}>
                    {s.name} {s.isLikelyDictionary ? "(Suggested)" : ""}
                    {" - current workbook"}
                  </option>
                ))}
                {dictionarySheets.map((s) => (
                  <option key={`uploaded:${s.name}`} value={`uploaded:${s.name}`}>
                    {s.name} {s.isLikelyDictionary ? "(Suggested)" : ""}
                    {" - uploaded dictionary file"}
                  </option>
                ))}
              </select>
            </div>
          )}

          <DictionaryHelpPanel hasDictionary={Boolean(selectedDictionarySheet) && !skip} />

          {selectedDictionarySheet && !skip && (
            <div className="mb-8 rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-100 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-900">Dictionary preview</h3>
                <p className="mt-1 text-xs text-gray-500">
                  Review the selected sheet before importing it. Showing the first {Math.max(dictionaryPreview.length - 1, 0)} data row{dictionaryPreview.length === 2 ? "" : "s"}.
                </p>
              </div>
              {dictionaryPreviewError ? (
                <p className="px-4 py-3 text-sm text-red-700">{dictionaryPreviewError}</p>
              ) : dictionaryPreview.length > 0 ? (
                <div className="overflow-x-auto overflow-y-visible">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        {(dictionaryPreview[0] ?? []).map((cell, index) => (
                          <th key={index} className="px-3 py-2 text-left font-semibold text-gray-600">
                            {String(cell || `Column ${index + 1}`)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {dictionaryPreview.slice(1).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {(dictionaryPreview[0] ?? []).map((_, cellIndex) => (
                            <td key={cellIndex} className="max-w-[16rem] truncate px-3 py-2 text-gray-700" title={String(row[cellIndex] ?? "")}>
                              {String(row[cellIndex] ?? "")}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="px-4 py-3 text-sm text-gray-500">Preparing preview...</p>
              )}
            </div>
          )}

          {selectedDictionarySheet && !skip && manualMatch && (
            <div
              className={`mb-6 rounded-md border p-4 text-sm ${
                hasZeroManualMatch
                  ? "border-red-200 bg-red-50 text-red-800"
                  : hasPartialManualMatch
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : "border-emerald-200 bg-emerald-50 text-emerald-800"
              }`}
              role={hasZeroManualMatch ? "alert" : "status"}
            >
              <div className="font-semibold">
                {manualMatched} of {manualTotal} data columns matched this dictionary.
              </div>
              {hasZeroManualMatch && (
                <p className="mt-1">
                  This dictionary doesn't match your dataset. 0 of {manualTotal} data columns were found in it. You may have selected the wrong file. It will not be applied.
                </p>
              )}
              {hasPartialManualMatch && (
                <p className="mt-1">
                  Only {manualMatched} of {manualTotal} columns matched - the rest keep their raw names.
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between">
            {!embedded && (
              <button
                onClick={() => setStage(2)}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
            )}
            <div className={`${embedded ? "ml-auto" : ""} flex flex-wrap justify-end gap-2`}>
              {hasZeroManualMatch && (
                <button
                  type="button"
                  onClick={() => {
                    setDictionaryFile(null);
                    setDictionarySheets([]);
                    setSelectedDictionarySheet("");
                    setManualMatch(null);
                    setSkip(false);
                  }}
                  className="rounded border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                >
                  Choose a different file
                </button>
              )}
              <button
                onClick={hasZeroManualMatch ? continueWithoutDictionary : handleImport}
                data-testid="dictionary-skip"
                className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
              >
                {hasZeroManualMatch
                  ? "Skip - continue without a dictionary"
                  : skip || !selectedDictionarySheet
                    ? "Skip - continue to variable types"
                    : "Import dictionary"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
