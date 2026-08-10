import type React from "react";
import { useCallback, useState } from "react";
import type { ResearchPopulation, UnitSystem } from "../../core/bounds/boundsChecker";
import { PRIVACY_BLURB_SHORT } from "../../core/about/aboutContent";
import { parseCSV } from "../../core/parser/csv";
import { enumerateSheets } from "../../core/parser/xlsx";
import { LARGE_N_NOTICE_THRESHOLD, describeLargeNNotice } from "../../core/performance/largeDatasetGuardrails";
import { useStore } from "../../store";
import AboutThisStep from "../components/AboutThisStep";

interface UploadStageProps {
  embedded?: boolean;
}

export default function UploadStage({ embedded = false }: UploadStageProps) {
  const {
    file,
    data,
    sheets,
    setFile,
    setStage,
    setData,
    setSheets,
    setError,
    error,
    setTutorialOpen,
    setAboutOpen,
    researchPopulation,
    setResearchPopulation,
    unitSystem,
    setUnitSystem,
  } = useStore();
  const [processingMessage, setProcessingMessage] = useState<string | null>(null);

  const handleFile = async (nextFile: File) => {
    try {
      setError(null);
      setProcessingMessage(`Reading ${nextFile.name} in your browser...`);
      setFile(nextFile);
      if (nextFile.name.endsWith(".csv")) {
        const parsedData = await parseCSV(nextFile);
        setData(parsedData);
      } else if (nextFile.name.endsWith(".xlsx")) {
        const { sheets: parsedSheets } = await enumerateSheets(nextFile);
        setSheets(parsedSheets);
      } else {
        setFile(null);
        setError("Please upload a CSV or XLSX file");
      }
    } catch (err: any) {
      setError(err.message || "Error processing file");
    } finally {
      setProcessingMessage(null);
    }
  };

  const handleTrySample = async () => {
    try {
      setError(null);
      const response = await fetch(`${import.meta.env.BASE_URL}samples/easytableone_sample.xlsx`);
      if (!response.ok) throw new Error("Could not load the sample workbook");
      const blob = await response.blob();
      const sampleFile = new File([blob], "easytableone_sample.xlsx", {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      await handleFile(sampleFile);
      setStage(2);
    } catch (err: any) {
      setError(err.message || "Could not load the sample workbook");
    }
  };

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFile(droppedFile);
    },
    [handleFile],
  );

  const populationOptions: Array<{ value: ResearchPopulation; label: string; description: string }> = [
    {
      value: "adult",
      label: "Adult (≥18 years)",
      description:
        "Human subjects aged 18 or older, or mixed pediatric/adult cohorts such as ages 0-80. Uses broad adult human plausibility bounds to reduce false alarms in adults.",
    },
    {
      value: "pediatric",
      label: "Pediatric (0-17 years)",
      description:
        "Human subjects aged 0-17, including neonates and adolescents. Uses pediatric reference ranges with wider tolerance for neonatal physiology.",
    },
    {
      value: "other",
      label: "Other / Non-human",
      description:
        "Animal studies, cell cultures, metabolomics, in vitro experiments, or other non-human datasets. Sanity-bound checks are turned off because the reference ranges assume human clinical physiology.",
    },
  ];

  const unitOptions: Array<{ value: UnitSystem; label: string; description: string }> = [
    {
      value: "metric",
      label: "Metric (SI)",
      description: "kg, cm, mmol/L, umol/L, etc. Used in many international research datasets.",
    },
    {
      value: "imperial",
      label: "Imperial (US customary)",
      description: "lbs, inches, mg/dL, etc. Common in US datasets and some source systems.",
    },
  ];

  const canProceed = Boolean(file && !error && (data || sheets.length > 0));
  const uploadedSummary = data
    ? `${data.rows.length.toLocaleString()} data rows parsed.`
    : `${sheets.length.toLocaleString()} sheet${sheets.length === 1 ? "" : "s"} found.`;

  const handleChooseDifferentFile = () => {
    setFile(null);
    setData(null);
    setSheets([]);
    setError(null);
  };

  return (
    <div className={embedded ? "" : "max-w-2xl mx-auto"}>
      {!embedded && <AboutThisStep stage="upload" />}
      {!embedded && <h2 className="text-2xl font-bold mb-6">Upload Dataset</h2>}

      <div id="upload-tutorial-card" className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-5">
        <p className="text-sm font-medium text-blue-800 mb-3">New here? See the expected input format.</p>
        <div className="flex flex-wrap gap-3">
          <button
            id="upload-view-guide-button"
            type="button"
            onClick={() => setTutorialOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            View input format guide
          </button>
          <button
            id="upload-try-sample"
            type="button"
            onClick={handleTrySample}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Try with sample data
          </button>
          <a
            id="upload-download-sample"
            href={`${import.meta.env.BASE_URL}samples/easytableone_sample.xlsx`}
            download
            className="inline-flex items-center px-4 py-2 border border-blue-300 text-blue-700 bg-white text-sm font-medium rounded-lg hover:bg-blue-50 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download sample workbook
          </a>
        </div>
      </div>

      {canProceed && file ? (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-emerald-700">
              <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.31a1 1 0 0 1-1.42 0L3.29 9.22a1 1 0 1 1 1.42-1.408l4.04 4.075 6.54-6.59a1 1 0 0 1 1.414-.006Z" clipRule="evenodd" />
              </svg>
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-emerald-950">{file.name}</div>
              <div className="text-sm text-emerald-800">{uploadedSummary}</div>
              <div className="mt-1 text-xs text-emerald-700">Drop another CSV/XLSX here to replace it.</div>
            </div>
            <button
              type="button"
              onClick={handleChooseDifferentFile}
              className="rounded border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              Choose a different file
            </button>
          </div>
        </div>
      ) : (
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          className="relative border-2 border-dashed border-gray-300 rounded-lg p-12 text-center bg-white hover:bg-gray-50 transition-colors cursor-pointer mb-6"
        >
          <div className="mb-4 text-gray-400">
            <svg className="mx-auto h-12 w-12" stroke="currentColor" fill="none" viewBox="0 0 48 48">
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <p className="text-lg text-gray-600 mb-1">Drag and drop a CSV or XLSX file here</p>
          <p className="text-sm text-gray-500">Or click to select a file</p>
          <p className="mt-3 text-xs font-bold text-gray-950">
            Privacy note: {PRIVACY_BLURB_SHORT}{" "}
            <button type="button" onClick={() => setAboutOpen(true)} className="font-normal underline">
              Learn more
            </button>
          </p>
          <input
            type="file"
            className="hidden"
            accept=".csv,.xlsx"
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            id="fileInput"
            data-testid="upload-file-input"
          />
          <label htmlFor="fileInput" className="absolute inset-0 cursor-pointer" />
        </div>
      )}

      {processingMessage && (
        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800" role="status" aria-live="polite">
          <div className="font-semibold">{processingMessage}</div>
          <div className="mt-1 text-xs">Large files may take a little longer because all parsing happens locally on this device.</div>
        </div>
      )}

      {!embedded && file && file.size > 25 * 1024 * 1024 && (
        <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          This file is {(file.size / (1024 * 1024)).toFixed(1)} MB. EasyTableOne uses your browser's memory and CPU, so later steps may take longer on very large files.
        </div>
      )}

      {!embedded && canProceed && data && data.rows.length > LARGE_N_NOTICE_THRESHOLD && (
        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          {describeLargeNNotice(data.rows.length)}
        </div>
      )}

      {!embedded && (
        <details open className="mb-6 bg-white border border-gray-200 rounded-lg shadow-sm">
          <summary className="cursor-pointer select-none px-5 py-4 text-sm font-bold text-gray-900 bg-gray-50 rounded-t-lg">
            Study Configuration
          </summary>
          <div className="p-5 space-y-6">
            <section>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Study Population</h3>
              <p className="text-sm text-gray-600 mb-3">
                Select the type of observations in your study. The app uses this only to choose the sanity-bounds reference library for implausible-value screening in Stage 5.
              </p>
              <p className="mb-3 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                If your study includes both children and adults (for example, age 0-80), choose Adult. The current bounds library is a broad plausibility screen, not age-stratified pediatric reference interpretation.
              </p>
              <div className="space-y-3" role="radiogroup" aria-label="Study Population">
                {populationOptions.map((option) => (
                  <label key={option.value} className="flex items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="research-population"
                      value={option.value}
                      checked={researchPopulation === option.value}
                      onChange={() => setResearchPopulation(option.value)}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                      <span className="block text-sm text-gray-600">{option.description}</span>
                      {option.value === "other" && researchPopulation === "other" && (
                        <span className="mt-2 block rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                          <span className="block">Sanity bounds checking will be disabled for this study.</span>
                          <span className="block">Sanity-bound checks (which assume human clinical ranges) are turned off; everything else works the same.</span>
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-sm font-bold text-gray-900 mb-2">Measurement Units</h3>
              <p className="text-sm text-gray-600 mb-3">
                Select the unit system used in your dataset. This determines how the app interprets continuous measurements when checking for implausible values. Choose the system your data source uses - not your preferred display format.
              </p>
              <div className="space-y-3" role="radiogroup" aria-label="Measurement Units">
                {unitOptions.map((option) => (
                  <label key={option.value} className="flex items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
                    <input
                      type="radio"
                      name="unit-system"
                      value={option.value}
                      checked={unitSystem === option.value}
                      onChange={() => setUnitSystem(option.value)}
                      className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                      <span className="block text-sm text-gray-600">{option.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>
          </div>
        </details>
      )}

      {!embedded && error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-md">
          {error}
        </div>
      )}

      {!embedded && (
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => setStage(2)}
            disabled={!canProceed}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Proceed to Sheet & Header -&gt;
          </button>
        </div>
      )}
    </div>
  );
}
