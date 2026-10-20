import { useEffect, useState } from "react";
import type { ResearchPopulation, UnitSystem } from "../../core/bounds/boundsChecker";
import type { StudyDesign } from "../../core/types";
import { useStore } from "../../store";
import DictionaryStage from "./DictionaryStage";
import SheetHeaderStage from "./SheetHeaderStage";
import UploadStage from "./UploadStage";
import { LARGE_N_NOTICE_THRESHOLD, describeLargeNNotice } from "../../core/performance/largeDatasetGuardrails";
import { ChoiceGroup } from "./import/ChoiceGroup";
import { SectionCard } from "./import/SectionCard";
import ContextAside, { type ImportPhase } from "./import/ContextAside";
import StepHeader from "../layout/StepHeader";

const populationLabels: Record<ResearchPopulation, string> = { adult: "Adult", pediatric: "Pediatric", other: "Other" };
const unitLabels: Record<UnitSystem, string> = { metric: "Metric", imperial: "Imperial" };
const designLabels: Record<StudyDesign, string> = { unspecified: "Design not specified", randomized_trial: "Randomized trial", observational: "Observational", other: "Other design" };
function StudySettingsPanel({ onDone, doneLabel = "Continue" }: { onDone: () => void; doneLabel?: string }) {
  const { researchPopulation, setResearchPopulation, unitSystem, setUnitSystem, studyDesign, setStudyDesign, explanationDepth, file, data, sheets, selectedSheet } = useStore();
  const selectedSheetInfo = sheets.find((sheet) => sheet.name === selectedSheet) ?? sheets[0];
  const pillRows = data?.rows.length ?? selectedSheetInfo?.rowCount ?? 0;
  const pillColumns = data?.columns.length ?? selectedSheetInfo?.colCount ?? 0;
  return <div className="space-y-5">
    {file && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-green-950">{file.name}</p><p className="text-xs text-green-800">Parsed locally{selectedSheetInfo ? ` · ${selectedSheetInfo.name} · ` : " · "}{pillRows.toLocaleString()} rows × {pillColumns.toLocaleString()} columns</p></div><span aria-hidden="true" className="text-green-700">✓</span></div>}
    <p className="text-sm text-gray-600">Three quick questions — change them any time.</p>
    <ChoiceGroup name="import-research-population" question="Who was studied?" hint="Sets plausibility ranges for data checks." value={researchPopulation} onChange={setResearchPopulation} options={[
      { value: "adult", label: "Adult", description: "Human subjects aged 18 or older." },
      { value: "pediatric", label: "Pediatric", description: "Human subjects aged 0–17.", note: explanationDepth === "deep" ? <span className="mt-1 block text-xs text-blue-800">Pediatric plausibility ranges are used for data checks.</span> : undefined },
      { value: "other", label: "Other / non-human", note: researchPopulation === "other" ? <span className="mt-2 block rounded bg-amber-50 p-2 text-xs text-amber-800">Human plausibility-range checks will be turned off. Everything else works the same.</span> : undefined },
    ]} />
    <ChoiceGroup name="import-unit-system" question="Which units does the source data use?" value={unitSystem} onChange={setUnitSystem} options={[
      { value: "metric", label: "Metric (SI)" }, { value: "imperial", label: "Imperial (US)" },
    ]} />
    <ChoiceGroup name="import-study-design" question="Study Design" hint="Shapes how baseline differences are reported." value={studyDesign} onChange={setStudyDesign} options={[
      { value: "unspecified", label: "Not specified" },
      { value: "randomized_trial", label: "Randomized trial", tag: "SMDs suggested instead of P values" },
      { value: "observational", label: "Observational" }, { value: "other", label: "Other" },
    ]} />
    <p className="text-xs text-gray-500">Recorded in your analysis history and exports.</p>
    <div className="flex justify-end"><button data-testid="study-settings-continue" type="button" onClick={onDone} className="min-h-10 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">{doneLabel}</button></div>
  </div>;
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
    setDataQualityRecords,
    setError,
    error,
  } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isCSV = file?.name.toLowerCase().endsWith(".csv") ?? false;
  const rowCount = data?.rows.length ?? sheets[0]?.rowCount ?? 0;
  const colCount = data?.columns.length ?? sheets[0]?.colCount ?? 0;
  const fileSummary = file ? `${file.name} · ${rowCount.toLocaleString()} rows × ${colCount.toLocaleString()} columns` : "";
  const headerSummary = isCSV
    ? `Row ${headerRowIndex + 1} (no sheet to pick - single CSV)`
    : `Sheet "${selectedSheet ?? sheets[0]?.name ?? "Data"}" - header on row ${headerRowIndex + 1}`;
  const studySettingsSummary = `${populationLabels[researchPopulation]} · ${unitLabels[unitSystem]} units · ${studyDesign === "unspecified" ? designLabels.unspecified : designLabels[studyDesign]}`;

  const replaceFile = () => {
    setStage(1);
    setFile(null);
    setData(null);
    setSheets([]);
    setSelectedSheet(null);
    setSchema(null);
    setError(null);
    setDataQualityRecords([]);
  };
  const hasParsedFile = Boolean(file && !error && (data || sheets.length > 0));
  const fileActive = stage === 1 && (!hasParsedFile || Boolean(error));
  const studyActive = stage === 1 && hasParsedFile;
  const showLargeFileWarning = Boolean(file && file.size > 25 * 1024 * 1024);
  const showLargeNNotice = Boolean(hasParsedFile && data && data.rows.length > LARGE_N_NOTICE_THRESHOLD);

  const fileStatus = fileActive ? "active" : hasParsedFile ? "done" : "pending";
  const studyStatus = studyActive || settingsOpen ? "active" : hasParsedFile && stage >= 2 ? "done" : "pending";
  const headerStatus = stage === 2 && !settingsOpen ? "active" : stage > 2 ? "done" : "pending";
  const dictionaryStatus = stage === 3 && !settingsOpen ? "active" : stage > 3 ? "done" : "pending";
  const activePhase: ImportPhase = fileStatus === "active" ? "file" : studyStatus === "active" ? "study" : headerStatus === "active" ? "header" : "dictionary";
  const pageHeading: Record<ImportPhase, { title: string; lede: string }> = {
    file: { title: "Every good table starts with data.", lede: "CSV or Excel, one row per participant. Choose a file to get started." },
    study: { title: "Tell us about your study", lede: "Three quick questions help EasyTableOne interpret your data." },
    header: { title: "Let's check the layout", lede: "Choose the data sheet and the row that contains your column names." },
    dictionary: { title: "Add labels, if you have them", lede: "A dictionary can add readable labels and units. This step is optional." },
  };
  useEffect(() => {
    if (activePhase === "file") return;
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="import-active-panel"] h2')?.focus());
  }, [activePhase]);

  return <div className="grid gap-6 min-[1181px]:grid-cols-[minmax(0,1fr)_300px]">
    <div className="min-w-0">
      <StepHeader n={1} eyebrow="IMPORT DATA" title={pageHeading[activePhase].title} lede={pageHeading[activePhase].lede} next="Variable types" />
      {(showLargeFileWarning || showLargeNNotice || error) && <div className="mb-4 space-y-3" role={error ? "alert" : "status"}>
        {showLargeFileWarning && file && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This file is {(file.size / (1024 * 1024)).toFixed(1)} MB. EasyTableOne uses your browser's memory and CPU, so later steps may take longer on very large files.</div>}
        {showLargeNNotice && data && <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{describeLargeNNotice(data.rows.length)}</div>}
        {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      </div>}
      <div className="space-y-4">
        <div data-testid="import-section-file" data-state={fileStatus}><SectionCard n={1} title="File" status={fileStatus} summary={fileSummary} action="Replace" onAction={replaceFile} activePanel={fileStatus === "active"}>{fileStatus === "active" && <UploadStage embedded />}</SectionCard></div>
        <div data-testid="import-section-study" data-state={studyStatus}><SectionCard n={2} title="Study settings" status={studyStatus} summary={studySettingsSummary} action="Edit" onAction={() => setSettingsOpen(true)} activePanel={studyStatus === "active"}>{studyStatus === "active" && <StudySettingsPanel onDone={() => settingsOpen ? setSettingsOpen(false) : setStage(2)} doneLabel={settingsOpen ? "Done" : "Continue"} />}</SectionCard></div>
        <div data-testid="import-section-header" data-state={headerStatus}><SectionCard n={3} title={isCSV ? "Header row" : "Sheet & header"} status={headerStatus} summary={headerSummary} action="Edit" onAction={() => setStage(2)} activePanel={headerStatus === "active"}>{headerStatus === "active" && <SheetHeaderStage embedded />}</SectionCard></div>
        <div data-testid="import-section-dictionary" data-state={dictionaryStatus}><SectionCard n={4} title="Data dictionary" optional status={dictionaryStatus} summary="Optional · add labels and units" activePanel={dictionaryStatus === "active"}>{dictionaryStatus === "active" && <DictionaryStage embedded />}</SectionCard></div>
      </div>
    </div>
    <ContextAside phase={activePhase} />
  </div>;;
}
