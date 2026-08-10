import { useState, type ReactNode } from "react";
import type { ResearchPopulation, UnitSystem } from "../../core/bounds/boundsChecker";
import type { StudyDesign } from "../../core/types";
import { useStore } from "../../store";
import DictionaryStage from "./DictionaryStage";
import SheetHeaderStage from "./SheetHeaderStage";
import UploadStage from "./UploadStage";
import { LARGE_N_NOTICE_THRESHOLD, describeLargeNNotice } from "../../core/performance/largeDatasetGuardrails";

const populationLabels: Record<ResearchPopulation, string> = {
  adult: "Adult",
  pediatric: "Pediatric",
  other: "Other",
};

const unitLabels: Record<UnitSystem, string> = {
  metric: "Metric",
  imperial: "Imperial",
};

const designLabels: Record<StudyDesign, string> = {
  unspecified: "Not specified",
  randomized_trial: "Randomised trial",
  observational: "Observational",
  other: "Other design",
};

function CheckBadge() {
  return (
    <span aria-label="Completed" className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
      <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.31a1 1 0 0 1-1.42 0L3.29 9.22a1 1 0 1 1 1.42-1.408l4.04 4.075 6.54-6.59a1 1 0 0 1 1.414-.006Z" clipRule="evenodd" />
      </svg>
    </span>
  );
}

function ActiveBadge() {
  return (
    <span aria-label="Active" className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-50 text-blue-700">
      <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-blue-600 ring-2 ring-blue-200" />
    </span>
  );
}

function PendingBadge() {
  return (
    <span aria-label="Pending" className="flex h-6 w-6 flex-none items-center justify-center rounded-full text-gray-400">
      <span aria-hidden="true" className="h-3 w-3 rounded-full border border-gray-400" />
    </span>
  );
}

function SummaryRow({ title, summary, action, onClick }: { title: string; summary: string; action: string; onClick: () => void }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <CheckBadge />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900">{title}</div>
          <div className="truncate text-sm text-gray-600">{summary}</div>
        </div>
        <button type="button" onClick={onClick} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-800 hover:bg-gray-50">
          {action}
        </button>
      </div>
    </div>
  );
}

function PendingRow({ title, summary }: { title: string; summary: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 opacity-60">
      <div className="flex items-center gap-3">
        <PendingBadge />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-600">{title}</div>
          <div className="truncate text-sm text-gray-500">{summary}</div>
        </div>
      </div>
    </div>
  );
}

function ActivePanel({ title, optional, children }: { title: string; optional?: boolean; children: ReactNode }) {
  return (
    <section data-testid="import-active-panel" className="rounded-xl border-2 border-blue-500 bg-white px-4 py-4">
      <div className="mb-4 flex items-center gap-3">
        <ActiveBadge />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-gray-900">
            {title} {optional && <span className="font-normal text-gray-500">- optional</span>}
          </h3>
        </div>
      </div>
      {children}
    </section>
  );
}

function StudySettingsPanel({ onDone, doneLabel = "Done" }: { onDone: () => void; doneLabel?: string }) {
  const { researchPopulation, setResearchPopulation, unitSystem, setUnitSystem, studyDesign, setStudyDesign } = useStore();
  const populationOptions: Array<{ value: ResearchPopulation; label: string; description: string }> = [
    {
      value: "adult",
      label: "Adult (≥18 years)",
      description: "Human subjects aged 18 or older, or mixed pediatric/adult cohorts.",
    },
    {
      value: "pediatric",
      label: "Pediatric (0-17 years)",
      description: "Human subjects aged 0-17, including neonates and adolescents.",
    },
    {
      value: "other",
      label: "Other / Non-human",
      description: "Animal studies, cell cultures, metabolomics, in vitro experiments, or other non-human datasets.",
    },
  ];
  const unitOptions: Array<{ value: UnitSystem; label: string; description: string }> = [
    { value: "metric", label: "Metric (SI)", description: "kg, cm, mmol/L, umol/L, etc." },
    { value: "imperial", label: "Imperial (US customary)", description: "lbs, inches, mg/dL, etc." },
  ];
  const studyDesignOptions: Array<{ value: StudyDesign; label: string; description: string }> = [
    {
      value: "unspecified",
      label: "Not specified",
      description: "Skip this question. Baseline characteristics are reported with P values, as today.",
    },
    {
      value: "randomized_trial",
      label: "Randomised trial",
      description:
        "Participants were randomly allocated to groups. EasyTableOne will suggest reporting standardised differences instead of baseline P values.",
    },
    {
      value: "observational",
      label: "Observational study",
      description: "Cohort, case-control, cross-sectional, or registry data. Baseline P values are conventional here.",
    },
    {
      value: "other",
      label: "Other",
      description: "Any other design, including non-human and experimental datasets.",
    },
  ];

  return (
    <div className="space-y-5">
      <section>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Study Population</h4>
        <div className="space-y-2" role="radiogroup" aria-label="Study Population">
          {populationOptions.map((option) => (
            <label key={option.value} className="flex items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="import-research-population"
                value={option.value}
                checked={researchPopulation === option.value}
                onChange={() => setResearchPopulation(option.value)}
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
      <section>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Measurement Units</h4>
        <div className="space-y-2" role="radiogroup" aria-label="Measurement Units">
          {unitOptions.map((option) => (
            <label key={option.value} className="flex items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="import-unit-system"
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
      <section>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Study Design</h4>
        <div className="space-y-2" role="radiogroup" aria-label="Study Design">
          {studyDesignOptions.map((option) => (
            <label key={option.value} className="flex items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="radio"
                name="import-study-design"
                value={option.value}
                checked={studyDesign === option.value}
                onChange={() => setStudyDesign(option.value)}
                className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-600"
              />
              <span>
                <span className="block text-sm font-semibold text-gray-900">{option.label}</span>
                <span className="block text-sm text-gray-700">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>
      <div className="flex justify-end">
        <button data-testid="study-settings-continue" type="button" onClick={onDone} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          {doneLabel}
        </button>
      </div>
    </div>
  );
}

export default function ImportStage() {
  const {
    stage,
    setStage,
    file,
    data,
    sheets,
    selectedSheet,
    headerRowIndex,
    researchPopulation,
    studyDesign,
    unitSystem,
    setFile,
    setData,
    setSheets,
    setSelectedSheet,
    setSchema,
    setError,
    error,
  } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isCSV = file?.name.toLowerCase().endsWith(".csv") ?? false;
  const rowCount = data?.rows.length ?? sheets[0]?.rowCount ?? 0;
  const colCount = data?.columns.length ?? sheets[0]?.colCount ?? 0;
  const fileSummary = file ? `${file.name} - ${rowCount.toLocaleString()} rows x ${colCount.toLocaleString()} columns` : "";
  const headerSummary = isCSV
    ? `Row ${headerRowIndex + 1} (no sheet to pick - single CSV)`
    : `Sheet "${selectedSheet ?? sheets[0]?.name ?? "Data"}" - header on row ${headerRowIndex + 1}`;
  const designSuffix = studyDesign === "unspecified" ? "" : ` - ${designLabels[studyDesign]}`;
  const studySettingsSummary = `${populationLabels[researchPopulation]} population - ${unitLabels[unitSystem]} units${designSuffix}`;

  const replaceFile = () => {
    setStage(1);
    setFile(null);
    setData(null);
    setSheets([]);
    setSelectedSheet(null);
    setSchema(null);
    setError(null);
  };
  const hasParsedFile = Boolean(file && !error && (data || sheets.length > 0));
  const fileActive = stage === 1 && (!hasParsedFile || Boolean(error));
  const studyActive = stage === 1 && hasParsedFile;
  const showLargeFileWarning = Boolean(file && file.size > 25 * 1024 * 1024);
  const showLargeNNotice = Boolean(hasParsedFile && data && data.rows.length > LARGE_N_NOTICE_THRESHOLD);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Import data</h2>
          <p className="mt-1 text-sm text-gray-600">Finished steps collapse so only the step you are on is expanded.</p>
        </div>
        <span className="text-sm text-gray-500">Step 1 of 7 - Variable types next</span>
      </div>

      {(showLargeFileWarning || showLargeNNotice || error) && (
        <div className="mb-4 space-y-3">
          {showLargeFileWarning && file && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              This file is {(file.size / (1024 * 1024)).toFixed(1)} MB. EasyTableOne uses your browser's memory and CPU, so later steps may take longer on very large files.
            </div>
          )}
          {showLargeNNotice && data && (
            <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              {describeLargeNNotice(data.rows.length)}
            </div>
          )}
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>
      )}

      <div className="space-y-3">
        <div data-testid="import-section-file" data-state={fileActive ? "active" : hasParsedFile ? "done" : "pending"}>
          {fileActive ? (
            <ActivePanel title="File">
              <UploadStage embedded />
            </ActivePanel>
          ) : hasParsedFile ? (
            <SummaryRow title="File" summary={fileSummary} action="Replace" onClick={replaceFile} />
          ) : (
            <PendingRow title="File" summary="Upload a CSV or XLSX file" />
          )}
        </div>

        <div data-testid="import-section-study" data-state={studyActive || settingsOpen ? "active" : hasParsedFile && stage >= 2 ? "done" : "pending"}>
          {studyActive ? (
            <ActivePanel title="Study settings">
              <StudySettingsPanel onDone={() => setStage(2)} doneLabel="Continue to sheet & header" />
            </ActivePanel>
          ) : hasParsedFile && stage >= 2 ? (
            settingsOpen ? (
              <ActivePanel title="Study settings">
                <StudySettingsPanel onDone={() => setSettingsOpen(false)} />
              </ActivePanel>
            ) : (
              <SummaryRow
                title="Study settings"
                summary={studySettingsSummary}
                action="Edit"
                onClick={() => setSettingsOpen(true)}
              />
            )
          ) : (
            <PendingRow title="Study settings" summary="Confirm population and measurement units after upload" />
          )}
        </div>

        <div data-testid="import-section-header" data-state={stage === 2 && !settingsOpen ? "active" : stage > 2 ? "done" : "pending"}>
          {stage === 2 && !settingsOpen ? (
            <ActivePanel title="Sheet & header row">
              <SheetHeaderStage embedded />
            </ActivePanel>
          ) : stage > 2 ? (
            <SummaryRow title={isCSV ? "Header row" : "Sheet & header row"} summary={headerSummary} action="Edit" onClick={() => setStage(2)} />
          ) : (
            <PendingRow title="Sheet & header row" summary="Confirm the header before dictionary import" />
          )}
        </div>

        <div data-testid="import-section-dictionary" data-state={stage === 3 && !settingsOpen ? "active" : stage > 3 ? "done" : "pending"}>
          {stage === 3 && !settingsOpen ? (
            <ActivePanel title="Data dictionary" optional>
              <DictionaryStage embedded />
            </ActivePanel>
          ) : stage < 3 ? (
            <PendingRow title="Data dictionary" summary="Optional codebook import opens next" />
          ) : null}
        </div>
      </div>
    </div>
  );
}
