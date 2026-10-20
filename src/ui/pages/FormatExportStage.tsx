import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import JSZip from "jszip";
import { exportCsv } from "../../core/export/csv";
import { exportDocx } from "../../core/export/docx";
import { HtmlPreview } from "../../core/export/htmlPreview";
import { exportLatex } from "../../core/export/latex";
import { exportXlsx } from "../../core/export/xlsx";
import { generateReproducibilityJson } from "../../core/export/reproducibilityJson";
import { toAggregateResults } from "../../core/export/aggregateOnly";
import { generateAnalysisHistory } from "../../core/export/analysisHistory";
import { generateDataQualityReport } from "../../core/export/dataQualityReport";
import { generateEDAReportHtml, generateEdaSummaryMarkdown } from "../../core/export/edaReport";
import { renderEdaReportChartPngs } from "../../core/export/edaReportCharts";
import { vegaLiteSpecToPng } from "../../core/export/vegaRender";
import { buildModelingDataZip } from "../../core/export/modelingData";
import { buildModelingReportMarkdown, exportModelingReportDocx } from "../../core/export/modelingReport";
import { buildMethodsSummaryMarkdown, exportMethodsSummaryDocx } from "../../core/export/methodsSummary";
import { buildEducationReportMarkdown, exportEducationReportDocx } from "../../core/export/educationReport";
import { renderUnifiedReportHtml } from "../../core/export/reportHtml";
import { buildUnifiedReport, type ReportAsset, type UnifiedReportContext, type UnifiedReportSections } from "../../core/export/unifiedReport";
import { APP_VERSION } from "../../core/appVersion";
import type { ExplanationDepth } from "../../core/education/educationTypes";
import { buildDataQualityPrintHtml, exportDataQualityDocx, exportDataQualityPdf } from "../../core/export/dataQualityExport";
import { formatTable, journalRulesets } from "../../core/format/formatTable";
import { getEffectiveJournalSettings } from "../../core/format/getEffectiveJournalSettings";
import { generateDiagnosticsCsv } from "../../core/format/diagnosticsCsv";
import { buildResultsSummary } from "../../core/format/resultsSummary";
import { getColumnDisplayLabel, resolveLevelLabel, resolvePlotDataLabels } from "../../core/format/columnLabel";
import type { LogisticResult, MlResult } from "../../core/modeling/types";
import { buildDecisionCurveSpec, buildMlCalibrationSpec, buildMlImportanceSpec, buildMlRocSpec } from "../../core/modeling/vizSpecs";
import JournalOverridePanel from "../components/JournalOverridePanel";
import { useStore } from "../../store";
import { sha256Hex } from "../../lib/hash";
import { pyodideClient } from "../../workers/pyodide.client";
import AboutThisStep from "../components/AboutThisStep";
import EmptyState from "../components/EmptyState";
import StepActionBar from "../layout/StepActionBar";
import { useToast } from "../layout/Toast";

export function getUniqueZipFilename(filename: string, usedNames: Set<string>): string {
  if (!usedNames.has(filename)) {
    usedNames.add(filename);
    return filename;
  }
  const extensionIndex = filename.lastIndexOf(".");
  const stem = extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex > 0 ? filename.slice(extensionIndex) : "";
  let suffix = 2;
  let candidate = `${stem} (${suffix})${extension}`;
  while (usedNames.has(candidate)) {
    suffix += 1;
    candidate = `${stem} (${suffix})${extension}`;
  }
  usedNames.add(candidate);
  return candidate;
}

const cardCls = "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";
const smallBtn = "rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 shadow-sm hover:border-blue-300 hover:bg-blue-50 disabled:opacity-50";

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const sectionSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const contentId = `${sectionSlug}-section`;

  return (
    <section className="bg-white shadow rounded-lg p-6">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        <span
          className={`text-gray-500 transition-transform ${isOpen ? "rotate-90" : ""}`}
          aria-hidden="true"
        >
          ▶
        </span>
      </button>
      {isOpen && (
        <div id={contentId} data-testid={`${sectionSlug}-content`} className="mt-4">
          {children}
        </div>
      )}
    </section>
  );
}

export default function FormatExportStage({ engineReady = true, engineError = false }: { engineReady?: boolean; engineError?: boolean }) {
  const toast = useToast();
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const exportErrorHandlerRef = useRef<((message: string) => void) | null>(null);
  const reportExportError = (message: string) => {
    if (exportErrorHandlerRef.current) exportErrorHandlerRef.current(message);
    else toast(message);
  };
  const {
    stats,
    journalId,
    setJournalId,
    setPlan,
    plan,
    schema,
    data,
    includeInputDataHashInRepro,
    auditLog,
    dataQualityRecords,
    qaReport,
    edaResults,
    modelingResults,
    modelingSetup,
    explanationDepth,
    setStage,
  } = useStore();

  const effectiveJournalConfig = useMemo(
    () => getEffectiveJournalSettings(journalId, plan?.userOverrides),
    [journalId, plan?.userOverrides]
  );

  const formattedTable = useMemo(() => {
    if (!stats || !plan || !schema) return null;
    try {
      return formatTable(stats, journalId, plan, schema, APP_VERSION, dataQualityRecords, qaReport);
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [stats, journalId, plan, schema, dataQualityRecords, qaReport]);

  const resultsSummary = useMemo(() => {
    if (!stats || !plan || !schema) return "";
    return buildResultsSummary(stats, plan, schema);
  }, [stats, plan, schema]);

  /** Trigger a file download in the browser. */
  function triggerDownload(blob: Blob, filename: string) {
    if (downloadCaptureRef.current) {
      downloadCaptureRef.current.push({ blob, filename });
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setHasDownloaded(true);
    const extension = filename.split(".").pop()?.toUpperCase() ?? "FILE";
    toast(`Downloaded: ${filename} (${extension})`);
    // Safari/WebKit may not consume a download initiated by a second click if its URL is revoked
    // synchronously in the same user gesture.
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const downloadCaptureRef = useRef<Array<{ blob: Blob; filename: string }> | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [includePlotsInDocx, setIncludePlotsInDocx] = useState(false);
  const [includeEdaReport, setIncludeEdaReport] = useState(false);
  const [includeModelingReport, setIncludeModelingReport] = useState(false);
  const [includeMethodsSummary, setIncludeMethodsSummary] = useState(false);
  const [includeEducationReport, setIncludeEducationReport] = useState(false);
  const [includeDataQualityFullReport, setIncludeDataQualityFullReport] = useState(false);
  const [includeEdaFullReport, setIncludeEdaFullReport] = useState(false);
  const [includeModelingFullReport, setIncludeModelingFullReport] = useState(false);
  const [includeMethodsSummaryFullReport, setIncludeMethodsSummaryFullReport] = useState(false);
  const [includeEducationFullReport, setIncludeEducationFullReport] = useState(false);
  const [educationExportDepth, setEducationExportDepth] = useState<ExplanationDepth>(explanationDepth);
  const [isExportingModelingData, setIsExportingModelingData] = useState(false);
  const [isExportingFigures, setIsExportingFigures] = useState(false);
  const [isExportingReport, setIsExportingReport] = useState(false);
  const [figureFormat, setFigureFormat] = useState<"png" | "pdf" | "svg">("png");
  const [figureDpi, setFigureDpi] = useState<number>(effectiveJournalConfig.plot_theme.figure_dpi_export);
  const [figureFontScale, setFigureFontScale] = useState<number>(1);
  const diagnosticAssetsCacheRef = useRef<{
    items: typeof figureExportItems;
    journalId: string;
    userOverrides: typeof plan extends { userOverrides: infer T } ? T : unknown;
    fontScale: number;
    assets: ReportAsset[];
  } | null>(null);
  const modelingFigureAssetsCacheRef = useRef<{ ml: MlResult | null | undefined; logistic: LogisticResult | null | undefined; assets: ReportAsset[] } | null>(null);
  const hasModelingReport = !!(modelingResults?.logistic || modelingResults?.ml);
  const overrideCount = plan?.userOverrides
    ? Object.entries(plan.userOverrides).reduce<number>((count, [, value]) => {
      if (value == null) return count;
      return count + (typeof value === "object" ? Object.keys(value).length : 1);
    }, 0)
    : 0;

  useEffect(() => {
    setEducationExportDepth(explanationDepth);
  }, [explanationDepth]);

  const renderDocxPlots = async () => {
    if (!formattedTable || !stats) return;
    await pyodideClient.isReady();
    const renderedPlots: Record<string, { histogram?: string; qqplot?: string; barchart?: string }> = {};
    const plotTheme = effectiveJournalConfig.plot_theme;
    const groupingSchemaCol = schema?.columns.find((c) => c.name === plan?.groupingVariable);

    for (const v of stats.perVariable) {
      if (!v.plotData) continue;
      if (plan?.includedVariables && !plan.includedVariables.includes(v.variable)) continue;
      const col = schema?.columns.find((c) => c.name === v.variable);
      if (col?.exclusionReason) continue;
      const isContinuous = col?.confirmedType === "continuous" || v.overallSummary["mean"] !== undefined || v.overallSummary["median"] !== undefined;
      const isCategorical = col?.confirmedType === "binary" || col?.confirmedType === "categorical_nominal" || col?.confirmedType === "categorical_ordinal" || v.overallSummary["counts"] !== undefined;
      const resolvedPlotData = resolvePlotDataLabels(v.plotData, col, groupingSchemaCol);

      renderedPlots[v.variable] = {};

      if (isContinuous) {
        try {
          const histB64 = await pyodideClient.renderPublicationFigure(resolvedPlotData, "histogram", plotTheme);
          renderedPlots[v.variable].histogram = histB64;
        } catch (err) {
          console.error("Failed to render histogram for", v.variable, err);
        }
        try {
          const qqB64 = await pyodideClient.renderPublicationFigure(resolvedPlotData, "qqplot", plotTheme);
          renderedPlots[v.variable].qqplot = qqB64;
        } catch (err) {
          console.error("Failed to render qqplot for", v.variable, err);
        }
      } else if (isCategorical) {
        try {
          const barB64 = await pyodideClient.renderPublicationFigure(resolvedPlotData, "barchart", plotTheme);
          renderedPlots[v.variable].barchart = barB64;
        } catch (err) {
          console.error("Failed to render barchart for", v.variable, err);
        }
      }
    }

    return renderedPlots;
  };

  const handleDownloadDocx = async () => {
    if (!formattedTable) return;
    setIsExporting(true);
    try {
      const plots = includePlotsInDocx ? await renderDocxPlots() : undefined;
      const baseDocxArgs = [
        formattedTable,
        { appVersion: APP_VERSION },
        plots,
        includeEdaReport ? edaResults : null,
        includeModelingReport ? modelingResults : null,
        includeMethodsSummary && stats && schema && plan ? { stats, schema, plan } : null,
      ] as const;
      const blob = includeEducationReport
        ? await exportDocx(...baseDocxArgs, { stats, schema, plan, modelingSetup, modelingResults }, educationExportDepth)
        : await exportDocx(...baseDocxArgs);
      triggerDownload(blob, `EasyTableOne_${journalId}_${Date.now()}.docx`);
    } catch (e) {
      console.error(e);
      reportExportError("Failed to export DOCX.");
    } finally {
      setIsExporting(false);
    }
  };


  const handleDownloadCsv = () => {
    if (!formattedTable) return;
    const csvStr = exportCsv(formattedTable);
    triggerDownload(new Blob([csvStr], { type: "text/csv;charset=utf-8;" }), `EasyTableOne_${journalId}_${Date.now()}.csv`);
  };

  const handleDownloadXlsx = () => {
    if (!formattedTable) return;
    triggerDownload(exportXlsx(formattedTable), `EasyTableOne_${journalId}_${Date.now()}.xlsx`);
  };

  const handleDownloadLatex = () => {
    if (!formattedTable) return;
    const latexStr = exportLatex(formattedTable);
    triggerDownload(new Blob([latexStr], { type: "text/plain;charset=utf-8;" }), `EasyTableOne_${journalId}_${Date.now()}.tex`);
  };

  const handleDownloadReproJson = async () => {
    if (!plan || !schema || !stats || !data || !formattedTable) {
      reportExportError("Missing data to generate reproducibility JSON.");
      return;
    }

    let hashHex: string | undefined;
    if (includeInputDataHashInRepro) {
      const dataStr = JSON.stringify(data.rows);
      hashHex = await sha256Hex(dataStr);
    }

    const jsonStr = generateReproducibilityJson({
      plan: { ...plan, auditLog },
      schema, results: stats, formattedTable, appVersion: APP_VERSION,
      dataQualityWarnings: dataQualityRecords,
      modelingResults,
      ...(hashHex && { inputDataHash: hashHex }),
    });
    triggerDownload(new Blob([jsonStr], { type: "application/json;charset=utf-8;" }), "reproducibility.json");
  };

  /** Step 5 — Diagnostics CSV */
  const handleDownloadDiagnosticsCsv = () => {
    if (!stats) return;
    const csvStr = generateDiagnosticsCsv(stats, schema ?? undefined, plan?.groupingVariable, journalId, plan?.userOverrides);
    triggerDownload(new Blob([csvStr], { type: "text/csv;charset=utf-8;" }), "diagnostics.csv");
  };

  /** Step 5 — Diagnostics JSON */
  const handleDownloadDiagnosticsJson = () => {
    if (!stats) return;
    const groupingSchemaCol = schema?.columns.find(c => c.name === plan?.groupingVariable);
    // Phase 51 R1 (D105a): exported diagnostics are aggregate-only (no plotData).
    const resolvedPerVariable = toAggregateResults(stats).perVariable.map(v => {
      const varSchemaCol = schema?.columns.find(c => c.name === v.variable);
      const resolvedSummaryByGroup: Record<string, any> = {};
      for (const [groupCode, groupSummary] of Object.entries(v.summaryByGroup)) {
        const groupLabel = resolveLevelLabel(groupCode, groupingSchemaCol);
        
        let resolvedSummary = { ...groupSummary };
        if (groupSummary.counts) {
          const resolvedCounts: Record<string, number> = {};
          const resolvedPercentages: Record<string, number> = {};
          for (const [code, val] of Object.entries(groupSummary.counts)) {
            const levelLabel = resolveLevelLabel(code, varSchemaCol);
            resolvedCounts[levelLabel] = val as number;
          }
          if (groupSummary.percentages) {
            for (const [code, val] of Object.entries(groupSummary.percentages)) {
              const levelLabel = resolveLevelLabel(code, varSchemaCol);
              resolvedPercentages[levelLabel] = val as number;
            }
          }
          resolvedSummary = {
            ...groupSummary,
            counts: resolvedCounts,
            percentages: resolvedPercentages,
          };
        }
        resolvedSummaryByGroup[groupLabel] = resolvedSummary;
      }

      let resolvedOverallSummary = { ...v.overallSummary };
      if (v.overallSummary.counts) {
        const resolvedCounts: Record<string, number> = {};
        const resolvedPercentages: Record<string, number> = {};
        for (const [code, val] of Object.entries(v.overallSummary.counts)) {
          const levelLabel = resolveLevelLabel(code, varSchemaCol);
          resolvedCounts[levelLabel] = val as number;
        }
        if (v.overallSummary.percentages) {
          for (const [code, val] of Object.entries(v.overallSummary.percentages)) {
            const levelLabel = resolveLevelLabel(code, varSchemaCol);
            resolvedPercentages[levelLabel] = val as number;
          }
        }
        resolvedOverallSummary = {
          ...v.overallSummary,
          counts: resolvedCounts,
          percentages: resolvedPercentages,
        };
      }

      return {
        ...v,
        summaryByGroup: resolvedSummaryByGroup,
        overallSummary: resolvedOverallSummary,
      };
    });
    const jsonStr = JSON.stringify(resolvedPerVariable, null, 2);
    triggerDownload(new Blob([jsonStr], { type: "application/json;charset=utf-8;" }), "diagnostics.json");
  };

  /** Step 6 — Reproducible Python */
  const handleDownloadAnalysisHistory = () => {
    if (!plan || !schema || !stats) return;
    const script = generateAnalysisHistory(
      plan, stats, schema,
      { filename: data?.meta.sourceFile ?? "data.xlsx", sheetName: data?.meta.sheetName },
      new Date().toISOString(),
      dataQualityRecords,
      journalId,
      modelingResults,
    );
    triggerDownload(new Blob([script], { type: "text/plain;charset=utf-8;" }), "analysis_history.py");
  };

  const handleDownloadDataQualityReport = () => {
    if (!plan || !schema) return;
    const reportStr = generateDataQualityReport(
      dataQualityRecords, schema, plan, APP_VERSION, new Date().toISOString(), { qaReport, edaResults: includeEdaReport ? edaResults : null }
    );
    triggerDownload(new Blob([reportStr], { type: "text/markdown;charset=utf-8;" }), "data_quality_report.md");
  };

  const handleDownloadEdaReport = async () => {
    if (!edaResults) return;
    const { correlationChartPng, missingnessChartPng } = await renderEdaReportChartPngs(edaResults, schema);
    const html = generateEDAReportHtml(
      edaResults, schema, APP_VERSION, new Date().toISOString(), correlationChartPng, missingnessChartPng,
    );
    triggerDownload(new Blob([html], { type: "text/html;charset=utf-8;" }), "eda_report.html");
  };

  const handleDownloadEdaSummary = () => {
    if (!edaResults) return;
    const markdown = generateEdaSummaryMarkdown(edaResults);
    triggerDownload(new Blob([markdown], { type: "text/markdown;charset=utf-8;" }), "eda_summary.md");
  };

  const handleDownloadResultsSummary = () => {
    if (!resultsSummary) return;
    triggerDownload(new Blob([resultsSummary], { type: "text/markdown;charset=utf-8;" }), "results_summary.md");
  };

  const handleDownloadMethodsSummary = () => {
    if (!stats || !schema || !plan) return;
    const markdown = buildMethodsSummaryMarkdown(stats, schema, plan);
    triggerDownload(new Blob([markdown], { type: "text/markdown;charset=utf-8;" }), "methods_summary.md");
  };

  const handleDownloadMethodsSummaryDocx = async () => {
    if (!stats || !schema || !plan) return;
    try {
      const blob = await exportMethodsSummaryDocx(stats, schema, plan, APP_VERSION);
      triggerDownload(blob, "methods_summary.docx");
    } catch (e) {
      console.error(e);
      reportExportError("Failed to export methods summary DOCX.");
    }
  };

  const handleDownloadEducationReportMarkdown = () => {
    const markdown = buildEducationReportMarkdown({ stats, schema, plan, modelingSetup, modelingResults }, educationExportDepth);
    triggerDownload(new Blob([markdown], { type: "text/markdown;charset=utf-8;" }), "methods_rationale_explainer.md");
  };

  const handleDownloadEducationReportDocx = async () => {
    try {
      const blob = await exportEducationReportDocx({ stats, schema, plan, modelingSetup, modelingResults }, educationExportDepth, APP_VERSION);
      triggerDownload(blob, "methods_rationale_explainer.docx");
    } catch (e) {
      console.error(e);
      reportExportError("Failed to export methods & rationale explainer DOCX.");
    }
  };

  const handleDownloadModelingReportMarkdown = () => {
    if (!hasModelingReport || !modelingResults) return;
    const markdown = buildModelingReportMarkdown(modelingResults, modelingResults.setup, schema);
    triggerDownload(new Blob([markdown], { type: "text/markdown;charset=utf-8;" }), "modeling_report.md");
  };

  const handleDownloadModelingReportDocx = async () => {
    if (!hasModelingReport || !modelingResults) return;
    try {
      const modelingFigures = await buildModelingFigureAssets();
      const blob = await exportModelingReportDocx(modelingResults, schema, APP_VERSION, modelingFigures);
      triggerDownload(blob, "modeling_report.docx");
    } catch (e) {
      console.error(e);
      reportExportError("Failed to export modeling report DOCX.");
    }
  };

  const handleDownloadModelingData = async () => {
    if (!data || !schema || !modelingResults) return;
    setIsExportingModelingData(true);
    try {
      const exportData = await pyodideClient.exportModelingData(data, schema, modelingResults.setup);
      const blob = await buildModelingDataZip(exportData);
      triggerDownload(blob, `modeling_data_${Date.now()}.zip`);
    } catch (e) {
      console.error(e);
      reportExportError(e instanceof Error ? e.message : "Failed to export modeling data.");
    } finally {
      setIsExportingModelingData(false);
    }
  };

  const buildReportSections = (): UnifiedReportSections => ({
    table1: true,
    dataQuality: includeDataQualityFullReport,
    eda: includeEdaFullReport,
    modeling: includeModelingFullReport && hasModelingReport,
    methods: includeMethodsSummaryFullReport,
    education: includeEducationFullReport,
  });

  const buildReportContext = (timestamp: string, supplementaryFigures: ReportAsset[] = [], modelingFigures: ReportAsset[] = []): UnifiedReportContext => ({
    stats,
    schema,
    plan,
    journalId,
    formattedTable,
    dataQualityRecords,
    qaReport,
    edaResults,
    modelingResults,
    modelingSetup,
    educationDepth: educationExportDepth,
    appVersion: APP_VERSION,
    rulesetVersion: formattedTable?.rulesetVersion ?? journalRulesets.EasyTableOne_Ruleset.version,
    timestamp,
    supplementaryFigures,
    modelingFigures,
  });

  const reportTimestampForFilename = (timestamp: string) => timestamp.replace(/[:.]/g, "-");

  const buildDiagnosticReportAssets = async (): Promise<ReportAsset[]> => {
    if (figureExportItems.length === 0) return [];
    const cached = diagnosticAssetsCacheRef.current;
    if (
      cached &&
      cached.items === figureExportItems &&
      cached.journalId === journalId &&
      cached.userOverrides === plan?.userOverrides &&
      cached.fontScale === figureFontScale
    ) {
      return cached.assets;
    }
    await pyodideClient.isReady();
    const assets: ReportAsset[] = [];
    for (const item of figureExportItems) {
      const schemaCol = schema?.columns.find((column) => column.name === item.variable);
      const displayLabel = schemaCol ? getColumnDisplayLabel(schemaCol, "stripped") : item.variable;
      const caption = `${displayLabel}: ${item.plotType}`;
      const base64Png = await pyodideClient.renderPublicationFigure(
        item.data,
        item.plotType,
        effectiveJournalConfig.plot_theme,
        6,
        4,
        effectiveJournalConfig.plot_theme.figure_dpi_export,
        "png",
        figureFontScale,
      );
      assets.push({
        id: `diagnostic-${item.key.replace(/[^A-Za-z0-9_-]+/g, "-")}`,
        caption,
        base64Png,
      });
    }
    diagnosticAssetsCacheRef.current = { items: figureExportItems, journalId, userOverrides: plan?.userOverrides, fontScale: figureFontScale, assets };
    return assets;
  };

  const buildModelingFigureAssets = async (): Promise<ReportAsset[]> => {
    const ml = modelingResults?.ml;
    const logistic = modelingResults?.logistic;
    if (!ml && !logistic?.decisionCurve) return [];
    const cached = modelingFigureAssetsCacheRef.current;
    if (cached && cached.ml === ml && cached.logistic === logistic) return cached.assets;

    const assets: ReportAsset[] = [];
    const slug = (name: string) => name.replace(/[^A-Za-z0-9_-]+/g, "-");

    if (logistic?.decisionCurve) {
      const dcaPng = await vegaLiteSpecToPng(buildDecisionCurveSpec(logistic.decisionCurve));
      assets.push({ id: "modeling-logistic-decision-curve", caption: "Logistic regression: decision curve (net benefit)", base64Png: dcaPng });
    }

    if (ml) {
      const rocPng = await vegaLiteSpecToPng(buildMlRocSpec(ml));
      assets.push({ id: "modeling-roc", caption: "Mean ROC with SD band (repeated cross-validation)", base64Png: rocPng });

      for (const model of ml.models) {
        if (model.importanceAvailable !== false) {
          const importancePng = await vegaLiteSpecToPng(buildMlImportanceSpec(model));
          assets.push({ id: `modeling-${slug(model.name)}-importance`, caption: `${model.name}: permutation importance`, base64Png: importancePng });
        }
        const calibrationPng = await vegaLiteSpecToPng(buildMlCalibrationSpec(model));
        assets.push({ id: `modeling-${slug(model.name)}-calibration`, caption: `${model.name}: calibration curve`, base64Png: calibrationPng });
        if (model.decisionCurve) {
          const dcaPng = await vegaLiteSpecToPng(buildDecisionCurveSpec(model.decisionCurve));
          assets.push({ id: `modeling-${slug(model.name)}-decision-curve`, caption: `${model.name}: decision curve (net benefit)`, base64Png: dcaPng });
        }
      }
    }

    modelingFigureAssetsCacheRef.current = { ml, logistic, assets };
    return assets;
  };

  const buildUnifiedReportHtml = async (timestamp: string) => {
    const supplementaryFigures = await buildDiagnosticReportAssets();
    const modelingFigures = await buildModelingFigureAssets();
    const artifacts = buildUnifiedReport(buildReportSections(), buildReportContext(timestamp, supplementaryFigures, modelingFigures));
    return renderUnifiedReportHtml(artifacts, { title: artifacts.md.match(/^#\s+(.+)$/m)?.[1] ?? "EasyTableOne report" });
  };

  const handleDownloadUnifiedReportHtml = async () => {
    if (!formattedTable) return;
    setIsExportingReport(true);
    try {
      const timestamp = new Date().toISOString();
      const html = await buildUnifiedReportHtml(timestamp);
      triggerDownload(
        new Blob([html], { type: "text/html;charset=utf-8;" }),
        `easytableone_report_${journalId}_${reportTimestampForFilename(timestamp)}.html`,
      );
    } catch (e) {
      console.error(e);
      reportExportError(e instanceof Error ? e.message : "Failed to export full report HTML.");
    } finally {
      setIsExportingReport(false);
    }
  };

  const handleDownloadUnifiedReportSource = async () => {
    if (!formattedTable) return;
    setIsExportingReport(true);
    try {
      const timestamp = new Date().toISOString();
      const supplementaryFigures = await buildDiagnosticReportAssets();
      const modelingFigures = await buildModelingFigureAssets();
      const artifacts = buildUnifiedReport(buildReportSections(), buildReportContext(timestamp, supplementaryFigures, modelingFigures));
      const zip = new JSZip();
      const markdown = artifacts.md.replace(/asset:([A-Za-z0-9_-]+)/g, "figures/$1.png");
      zip.file("report.md", markdown);
      for (const asset of artifacts.assets) {
        zip.file(`figures/${asset.id}.png`, base64ToBlobPart(asset.base64Png));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `easytableone_report_source_${reportTimestampForFilename(timestamp)}.zip`);
    } catch (e) {
      console.error(e);
      reportExportError(e instanceof Error ? e.message : "Failed to export full report source.");
    } finally {
      setIsExportingReport(false);
    }
  };

  const handleOpenUnifiedReportPdf = async () => {
    if (!formattedTable) return;
    setIsExportingReport(true);
    try {
      const timestamp = new Date().toISOString();
      const html = await buildUnifiedReportHtml(timestamp);
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        reportExportError("Could not open the print view. Please allow pop-ups for this site and try again.");
        return;
      }
      printWindow.document.open();
      printWindow.document.write(
        html.replace("</body>", "<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 150); });</script></body>"),
      );
      printWindow.document.close();
    } catch (e) {
      console.error(e);
      reportExportError(e instanceof Error ? e.message : "Failed to open the PDF/print view.");
    } finally {
      setIsExportingReport(false);
    }
  };

  const handleDownloadDataQualityDocx = async () => {
    if (!plan || !schema) return;
    try {
      const blob = await exportDataQualityDocx(
        dataQualityRecords, schema, plan, APP_VERSION, { qaReport, edaResults: includeEdaReport ? edaResults : null }
      );
      triggerDownload(blob, "data_quality_report.docx");
    } catch (e) {
      console.error(e);
      reportExportError("Failed to export Data Quality DOCX.");
    }
  };

  const handleDownloadDataQualityPdf = () => {
    if (!plan || !schema) return;
    exportDataQualityPdf(dataQualityRecords, schema, plan, APP_VERSION, { qaReport, edaResults: includeEdaReport ? edaResults : null });
  };

  const handleDownloadDataQualityPrintHtml = () => {
    if (!plan || !schema) return;
    const html = buildDataQualityPrintHtml(dataQualityRecords, schema, plan, APP_VERSION, { qaReport, edaResults: includeEdaReport ? edaResults : null });
    triggerDownload(new Blob([html], { type: "text/html;charset=utf-8;" }), "data_quality_report_print.html");
  };

  const [isDownloadingAll, setIsDownloadingAll] = useState(false);

  const supplementaryVariableCount = useMemo(() => {
    if (!stats) return 0;
    return stats.perVariable.filter((v) => {
      if (!v.plotData) return false;
      if (plan?.includedVariables && !plan.includedVariables.includes(v.variable)) return false;
      const col = schema?.columns.find((c) => c.name === v.variable);
      return !col?.exclusionReason;
    }).length;
  }, [stats, plan?.includedVariables, schema?.columns]);

  const figureExportItems = useMemo(() => {
    if (!stats) return [];
    const items: Array<{ key: string; variable: string; plotType: "histogram" | "qqplot" | "barchart" | "boxplot"; data: any }> = [];
    const groupingSchemaCol = schema?.columns.find((c) => c.name === plan?.groupingVariable);
    for (const v of stats.perVariable) {
      if (!v.plotData) continue;
      if (plan?.includedVariables && !plan.includedVariables.includes(v.variable)) continue;
      const col = schema?.columns.find((c) => c.name === v.variable);
      if (col?.exclusionReason) continue;
      const isContinuous = col?.confirmedType === "continuous" || v.overallSummary["mean"] !== undefined || v.overallSummary["median"] !== undefined;
      const isCategorical = col?.confirmedType === "binary" || col?.confirmedType === "categorical_nominal" || col?.confirmedType === "categorical_ordinal" || v.overallSummary["counts"] !== undefined;
      const resolvedPlotData = resolvePlotDataLabels(v.plotData, col, groupingSchemaCol);
      if (isContinuous) {
        items.push({ key: `${v.variable}_histogram`, variable: v.variable, plotType: "histogram", data: resolvedPlotData });
        items.push({ key: `${v.variable}_qqplot`, variable: v.variable, plotType: "qqplot", data: resolvedPlotData });
      } else if (isCategorical) {
        items.push({ key: `${v.variable}_barchart`, variable: v.variable, plotType: "barchart", data: resolvedPlotData });
      }
    }
    return items;
  }, [stats, plan?.includedVariables, schema?.columns]);

  const fullReportOptions = [
    { enabled: Boolean(schema && plan), checked: includeDataQualityFullReport, setChecked: setIncludeDataQualityFullReport },
    { enabled: Boolean(edaResults), checked: includeEdaFullReport, setChecked: setIncludeEdaFullReport },
    { enabled: hasModelingReport, checked: includeModelingFullReport && hasModelingReport, setChecked: setIncludeModelingFullReport },
    { enabled: Boolean(stats && schema && plan), checked: includeMethodsSummaryFullReport, setChecked: setIncludeMethodsSummaryFullReport },
    { enabled: true, checked: includeEducationFullReport, setChecked: setIncludeEducationFullReport },
  ];
  const allEnabledFullReportSelected = fullReportOptions.filter((option) => option.enabled).every((option) => option.checked);
  const toggleFullReportOptions = () => {
    const next = !allEnabledFullReportSelected;
    fullReportOptions.forEach((option) => {
      if (option.enabled) option.setChecked(next);
    });
  };

  const manuscriptWordOptions = [
    { enabled: true, checked: includePlotsInDocx, setChecked: setIncludePlotsInDocx },
    { enabled: Boolean(stats && schema && plan), checked: includeMethodsSummary, setChecked: setIncludeMethodsSummary },
    { enabled: true, checked: includeEducationReport, setChecked: setIncludeEducationReport },
    { enabled: hasModelingReport, checked: includeModelingReport && hasModelingReport, setChecked: setIncludeModelingReport },
    { enabled: Boolean(edaResults), checked: includeEdaReport, setChecked: setIncludeEdaReport },
  ];
  const allEnabledManuscriptWordSelected = manuscriptWordOptions.filter((option) => option.enabled).every((option) => option.checked);
  const toggleManuscriptWordOptions = () => {
    const next = !allEnabledManuscriptWordSelected;
    manuscriptWordOptions.forEach((option) => {
      if (option.enabled) option.setChecked(next);
    });
  };

  function base64ToBlobPart(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  const handleDownloadFiguresZip = async () => {
    if (figureExportItems.length === 0) return;
    setIsExportingFigures(true);
    try {
      await pyodideClient.isReady();
      const zip = new JSZip();
      for (const item of figureExportItems) {
        const b64 = await pyodideClient.renderPublicationFigure(
          item.data,
          item.plotType,
          effectiveJournalConfig.plot_theme,
          6,
          4,
          figureDpi,
          figureFormat,
          figureFontScale,
        );
        zip.file(`${item.key}.${figureFormat}`, base64ToBlobPart(b64));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `figures_${journalId}_${Date.now()}.zip`);
    } catch (e) {
      console.error(e);
      reportExportError(e instanceof Error ? e.message : "Failed to export figures.");
    } finally {
      setIsExportingFigures(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!formattedTable || !stats) return;
    setIsDownloadingAll(true);
    const captured: Array<{ blob: Blob; filename: string }> = [];
    const errors: Array<{ label: string; message: string }> = [];
    const collect = async (label: string, action: () => unknown | Promise<unknown>) => {
      const before = captured.length;
      const errorCount = errors.length;
      downloadCaptureRef.current = captured;
      exportErrorHandlerRef.current = (message) => errors.push({ label, message });
      try {
        await action();
        if (captured.length === before && errors.length === errorCount) errors.push({ label, message: "Export did not produce a file." });
      } catch (error) {
        errors.push({ label, message: error instanceof Error ? error.message : String(error) });
      } finally {
        downloadCaptureRef.current = null;
        exportErrorHandlerRef.current = null;
      }
    };
    try {
      await collect("Table 1 DOCX", handleDownloadDocx);
      await collect("Table 1 CSV", handleDownloadCsv);
      await collect("Table 1 XLSX", handleDownloadXlsx);
      await collect("Table 1 LaTeX", handleDownloadLatex);
      await collect("Full report HTML", handleDownloadUnifiedReportHtml);
      await collect("Full report source", handleDownloadUnifiedReportSource);
      await collect("Reproducibility JSON", handleDownloadReproJson);
      await collect("Diagnostics CSV", handleDownloadDiagnosticsCsv);
      await collect("Diagnostics JSON", handleDownloadDiagnosticsJson);
      await collect("Analysis history", handleDownloadAnalysisHistory);
      await collect("Data quality report", handleDownloadDataQualityReport);
      await collect("Data quality DOCX", handleDownloadDataQualityDocx);
      await collect("Data quality print HTML", handleDownloadDataQualityPrintHtml);
      if (includeEdaReport) {
        await collect("EDA report", handleDownloadEdaReport);
        await collect("EDA summary", handleDownloadEdaSummary);
      }
      if (hasModelingReport) {
        await collect("Modeling report", handleDownloadModelingReportMarkdown);
        await collect("Modeling report DOCX", handleDownloadModelingReportDocx);
        await collect("Modeling data", handleDownloadModelingData);
      }
      await collect("Results summary", handleDownloadResultsSummary);
      await collect("Methods summary", handleDownloadMethodsSummary);
      await collect("Methods summary DOCX", handleDownloadMethodsSummaryDocx);
      await collect("Methods & rationale", handleDownloadEducationReportMarkdown);
      await collect("Methods & rationale DOCX", handleDownloadEducationReportDocx);
      if (figureExportItems.length > 0) await collect("Figures", handleDownloadFiguresZip);

      const stamp = new Date().toISOString();
      const zip = new JSZip();
      const usedNames = new Set<string>(["MANIFEST.txt"]);
      const renamed: Array<{ original: string; renamed: string }> = [];
      const zipEntries: Array<{ original: string; filename: string }> = [];
      for (const file of captured) {
        const filename = getUniqueZipFilename(file.filename, usedNames);
        if (filename !== file.filename) renamed.push({ original: file.filename, renamed: filename });
        zip.file(filename, file.blob);
        zipEntries.push({ original: file.filename, filename });
      }
      const manifest = [
        `EasyTableOne ${APP_VERSION}`,
        `Ruleset version: ${formattedTable.rulesetVersion ?? journalRulesets.EasyTableOne_Ruleset.version}`,
        `Created: ${stamp}`,
        "",
        "Files:",
        ...zipEntries.map((entry) => `- ${entry.filename}`),
        ...(renamed.length ? ["", "Renamed:", ...renamed.map((item) => `- ${item.original} -> ${item.renamed}`)] : []),
        ...(errors.length ? ["", "Failed:", ...errors.map((failure) => `- ${failure.label}: ${failure.message}`)] : []),
      ].join("\n");
      zip.file("MANIFEST.txt", manifest);
      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      triggerDownload(blob, `EasyTableOne_${journalId}_${stamp.replace(/[:.]/g, "-")}.zip`);
      if (errors.length) toast(`${errors.length} file(s) could not be created — see MANIFEST.txt`);
      else toast("Downloaded: Everything (.zip)");
    } catch (e) {
      console.error(e);
      toast(e instanceof Error ? e.message : "Download All failed.");
    } finally {
      downloadCaptureRef.current = null;
      setIsDownloadingAll(false);
    }
  };


  if (!stats || !plan || !schema) {
    return (
      <EmptyState
        title="No results ready to export"
        reason="Export files are created after Statistical Review has results from Step 7."
        next="Run statistics from the analysis plan, then return here to format and export."
        action={{ label: "Go to Statistical Review", onClick: () => setStage(7) }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <AboutThisStep stage="export" />
      <h2 className="text-2xl font-bold text-gray-900">Format &amp; Export</h2>
      <div className="grid items-start gap-4 min-[1201px]:grid-cols-[340px_minmax(0,1fr)]">
      <div className="space-y-4" data-testid="export-left-column">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-gray-900">Journal style</h3>
        <p className="mb-3 mt-1 text-sm text-gray-600">Presets set number, P-value and notation rules for the journal you are targeting.</p>
        <div role="radiogroup" aria-label="Journal style" className="grid gap-2 sm:grid-cols-2 min-[1201px]:grid-cols-1">
          {journalRulesets.EasyTableOne_Ruleset.journals.map((j) => {
            const pFormat = j.p_value_formatting;
            const iqr = j.summary_statistics.iqr_delimiter;
            const summary = j.journal_id === "JAMA" && pFormat.leading_zero === false
              ? "P values without a leading zero"
              : j.journal_id === "LANCET" && pFormat.decimal_separator === "·"
                ? `Middle-dot decimals; ${pFormat.threshold_low} floor`
                : `${iqr === " to " ? "Median with ‘to’ between quartiles; " : "IQR delimiter “" + iqr + "”; "}${pFormat.threshold_low} P-value floor`;
            return (
              <label key={j.journal_id} className={`block cursor-pointer rounded-xl border px-3 py-2 hover:border-gray-300 has-[:checked]:border-blue-600 has-[:checked]:bg-blue-50 has-[:checked]:ring-1 has-[:checked]:ring-inset has-[:checked]:ring-blue-600 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-blue-600 has-[:focus-visible]:outline-offset-2 ${journalId === j.journal_id ? "border-blue-600 bg-blue-50" : "border-gray-200 bg-white"}`}>
                <input className="sr-only" type="radio" name="journal-style" value={j.journal_id} checked={journalId === j.journal_id} onChange={() => { setJournalId(j.journal_id); setPlan({ ...plan, userOverrides: undefined }); }} />
                <span className="block text-sm font-semibold text-gray-900">{j.journal_id === "GENERIC" ? "Standard / Generic" : j.journal_id === "NEJM" ? "NEJM" : j.journal_id === "JAMA" ? "JAMA" : j.display_name}</span>
                <span className="block text-xs text-gray-600">{summary}</span>
              </label>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-gray-600">Your choices apply to every Table 1 download. The exact P-value rules come from the selected journal ruleset.</p>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm" data-testid="what-to-include">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-900">What to include</h3>
          <button type="button" onClick={toggleFullReportOptions} className={smallBtn}>
            {allEnabledFullReportSelected ? "Clear all" : "Select all"}
          </button>
        </div>
        <h4 className="mt-3 text-sm font-semibold text-gray-900">Full report contents</h4>
        <div className="mt-2 grid gap-2 text-sm text-gray-800">
          <label className="flex items-start gap-2">
            <input type="checkbox" checked disabled className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 disabled:opacity-70" />
            <span>Table 1 section</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={includeDataQualityFullReport}
              onChange={(e) => setIncludeDataQualityFullReport(e.target.checked)}
              disabled={!schema || !plan}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 disabled:opacity-50"
            />
            <span>Data quality section</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={includeEdaFullReport}
              onChange={(e) => setIncludeEdaFullReport(e.target.checked)}
              disabled={!edaResults}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 disabled:opacity-50"
            />
            <span>EDA section</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={includeModelingFullReport && hasModelingReport}
              onChange={(e) => setIncludeModelingFullReport(e.target.checked)}
              disabled={!hasModelingReport}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 disabled:opacity-50"
            />
            <span>Modeling section</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={includeMethodsSummaryFullReport}
              onChange={(e) => setIncludeMethodsSummaryFullReport(e.target.checked)}
              disabled={!stats || !schema || !plan}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600 disabled:opacity-50"
            />
            <span>Methods summary section</span>
          </label>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={includeEducationFullReport}
              onChange={(e) => setIncludeEducationFullReport(e.target.checked)}
              className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-600"
            />
            <span>Methods &amp; rationale section</span>
          </label>
        </div>
        {figureExportItems.length > 0 && (
          <div className="mt-4 border-t border-gray-200 pt-3">
            <h4 className="text-sm font-semibold text-gray-900">Figure export</h4>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs font-medium text-gray-700">
                Format
                <select
                  value={figureFormat}
                  onChange={(e) => setFigureFormat(e.target.value as "png" | "pdf" | "svg")}
                  className="mt-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                >
                  <option value="png">PNG</option>
                  <option value="pdf">PDF</option>
                  <option value="svg">SVG</option>
                </select>
              </label>
              <label className="flex flex-col text-xs font-medium text-gray-700">
                DPI
                <select
                  value={figureDpi}
                  onChange={(e) => setFigureDpi(Number(e.target.value))}
                  className="mt-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                >
                  {[150, 300, 600].map((dpi) => (
                    <option key={dpi} value={dpi}>{dpi}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs font-medium text-gray-700">
                Font scale
                <input
                  type="number"
                  min="0.6"
                  max="2"
                  step="0.1"
                  value={figureFontScale}
                  onChange={(e) => setFigureFontScale(Number(e.target.value))}
                  className="mt-1 w-20 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-600">{figureExportItems.length} diagnostic figure files will be rendered using the active journal theme.</p>
          </div>
        )}
      </section>
      </div>

      <div className="order-first min-w-0 space-y-4 min-[1201px]:order-none">

      <CollapsibleSection title="Live Preview">
        {formattedTable ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-4 text-black [&_table]:w-full [&_table]:text-xs [&_td]:px-2 [&_th]:px-2">
            <HtmlPreview table={formattedTable} />
            {includePlotsInDocx && (
              <div className="mt-6 border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">Supplementary Figures</div>
                <div>{supplementaryVariableCount} diagnostic plots will be appended</div>
                <div>(histogram + QQ for continuous variables, bar chart for categorical variables)</div>
              </div>
            )}
            {includeEdaReport && edaResults && (
              <div className="mt-4 border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">Exploratory Data Analysis Report</div>
                <div>EDA summaries and available EDA plots will be appended.</div>
              </div>
            )}
            {includeModelingReport && hasModelingReport && (
              <div className="mt-4 border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">Modeling Report</div>
                <div>Modeling steps, method rationale, warnings, OR tables, ML metrics, validation, and Methods text will be appended.</div>
              </div>
            )}
            {includeMethodsSummary && stats && schema && plan && (
              <div className="mt-4 border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">Per-variable Methods Summary</div>
                <div>Summary format, test, and selection reason will be appended.</div>
              </div>
            )}
            {includeEducationReport && (
              <div className="mt-4 border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
                <div className="font-semibold text-gray-900">Methods & Rationale Explainer</div>
                <div>The stage overviews and decision explanations will be appended at {educationExportDepth === "deep" ? "detailed" : "concise"} depth.</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-8 text-gray-500 border border-dashed border-gray-300 rounded">
            No statistical results available to preview. Run stats first.
          </div>
        )}
      </CollapsibleSection>

      {resultsSummary && (
        <CollapsibleSection title="Results Summary">
          <div className="mb-3 flex flex-wrap gap-2 text-xs text-gray-700" data-testid="results-summary-stats">
            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5">Journal style: {journalId === "GENERIC" ? "Standard / Generic" : journalId}</span>
            {figureExportItems.length > 0 && <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5">{figureExportItems.length} figure files</span>}
          </div>
          <p className="text-sm text-gray-700 leading-relaxed">{resultsSummary}</p>
        </CollapsibleSection>
      )}
      </div>
      <details className="col-span-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer text-sm font-semibold text-gray-900">Override individual settings{overrideCount > 0 && <span className="ml-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{overrideCount} changed</span>}</summary>
        <div className="mt-4"><JournalOverridePanel hideHeader /></div>
      </details>
      </div>

      <section aria-labelledby="downloads-heading" className="space-y-4" data-testid="downloads-section">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 id="downloads-heading" className="text-lg font-semibold text-gray-900">Downloads</h3>
            <p className="mt-1 text-sm text-gray-600">Download All bundles every file here that applies to this analysis into one .zip. Modeling files are included only if Step 6 ran; EDA and full-report options follow their checkboxes.</p>
          </div>
          <button type="button" data-testid="download-all" onClick={handleDownloadAll} disabled={!formattedTable || isExporting || isDownloadingAll || !engineReady} title={!engineReady ? (engineError ? "The analysis engine failed to start. Retry from the sidebar." : "Waiting for the analysis engine to finish starting…") : undefined} className="rounded-lg border border-blue-600 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50">{isDownloadingAll ? "Creating zip…" : "Download All (.zip)"}</button>
        </div>

        <div className="grid items-start gap-4 min-[1201px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="space-y-4 min-w-0">
          <div className={`${cardCls}`}>
            <h4 className="text-base font-semibold text-gray-900">Manuscript &amp; figures</h4>
            <div data-testid="manuscript-table-export" className="mt-3">
              <h5 className="text-sm font-semibold text-gray-900">Manuscript table</h5>
              <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h5 className="text-sm font-semibold text-gray-900">Manuscript Word export</h5>
                    <p className="mt-1 text-xs text-gray-600">These options affect the Word (.docx) export below.</p>
                  </div>
                  <button type="button" onClick={toggleManuscriptWordOptions} className={smallBtn}>
                    {allEnabledManuscriptWordSelected ? "Clear all" : "Select all"}
                  </button>
                </div>
                <div className="mt-3 grid gap-3 text-sm text-gray-700 md:grid-cols-2">
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={includePlotsInDocx} onChange={(e) => setIncludePlotsInDocx(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span>
                      <span className="font-medium text-gray-900">Diagnostic plots as supplementary figures</span>
                      <span className="block text-xs text-gray-500">Adds a Supplementary Figures section. Rendering may take 10-30 s depending on dataset size.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={includeMethodsSummary} onChange={(e) => setIncludeMethodsSummary(e.target.checked)} disabled={!stats || !schema || !plan} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
                    <span>
                      <span className="font-medium text-gray-900">Methods summary appendix</span>
                      <span className="block text-xs text-gray-500">Appends per-variable summary format, test, and selection reason.</span>
                    </span>
                  </label>
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={includeEducationReport} onChange={(e) => setIncludeEducationReport(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span>
                      <span className="font-medium text-gray-900">Methods &amp; rationale explainer appendix</span>
                      <span className="block text-xs text-gray-500">Appends the stage-by-stage teaching explainer using the selected depth.</span>
                    </span>
                  </label>
                  {hasModelingReport && (
                    <label className="flex items-start gap-3">
                      <input type="checkbox" checked={includeModelingReport} onChange={(e) => setIncludeModelingReport(e.target.checked)} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                      <span>
                        <span className="font-medium text-gray-900">Modeling report appendix</span>
                        <span className="block text-xs text-gray-500">Appends the publication-style modeling report after Table 1 and selected appendices.</span>
                      </span>
                    </label>
                  )}
                  <label className="flex items-start gap-3">
                    <input type="checkbox" checked={includeEdaReport} onChange={(e) => setIncludeEdaReport(e.target.checked)} disabled={!edaResults} className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50" />
                    <span>
                      <span className="font-medium text-gray-900">EDA report appendix</span>
                      <span className="block text-xs text-gray-500">Adds generated EDA summaries and available EDA plots. Generate EDA in Stage 5 first.</span>
                    </span>
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button id="download-docx" data-testid="download-docx" onClick={handleDownloadDocx} disabled={!formattedTable || isExporting} className={smallBtn}>
                    {isExporting ? "Generating Word..." : "Download Word (.docx)"}
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button id="download-csv" data-testid="download-csv" onClick={handleDownloadCsv} disabled={!formattedTable} className={smallBtn}>Download CSV</button>
              <button id="download-xlsx" data-testid="download-xlsx" onClick={handleDownloadXlsx} disabled={!formattedTable} className={smallBtn}>Download Excel (.xlsx)</button>
              <button id="download-latex" data-testid="download-latex" onClick={handleDownloadLatex} disabled={!formattedTable} className={smallBtn}>Download LaTeX</button>
              {figureExportItems.length > 0 && (
                <button type="button" data-testid="download-figures-zip" onClick={handleDownloadFiguresZip} disabled={isExportingFigures} className={smallBtn}>
                  {isExportingFigures ? "Rendering figures..." : `Download figures (.zip)`}
                </button>
              )}
            </div>
          </div>

          <div className={`${cardCls}`}>
            <h4 className="text-base font-semibold text-gray-900">Reproducibility &amp; audit</h4>
            <div className="mt-3 flex flex-wrap gap-2">
              <button id="download-repro-json" data-testid="download-repro-json" onClick={handleDownloadReproJson} disabled={!stats} className={smallBtn}>Reproducibility JSON</button>
              <button id="download-analysis-history" data-testid="download-analysis-history" onClick={handleDownloadAnalysisHistory} disabled={!stats} className={smallBtn}>Reproducible Python (.py)</button>
              <button id="download-diagnostics-csv" data-testid="download-diagnostics-csv" onClick={handleDownloadDiagnosticsCsv} disabled={!stats} className={smallBtn}>Diagnostics CSV</button>
              <button id="download-diagnostics-json" data-testid="download-diagnostics-json" onClick={handleDownloadDiagnosticsJson} disabled={!stats} className={smallBtn}>Diagnostics JSON</button>
              <button id="download-data-quality-report" data-testid="download-data-quality-report" onClick={handleDownloadDataQualityReport} disabled={!stats} className={smallBtn}>Data quality report (.md)</button>
              <button id="download-data-quality-docx" data-testid="download-data-quality-docx" onClick={handleDownloadDataQualityDocx} disabled={!stats} className={smallBtn}>Data quality report (.docx)</button>
              <div>
                <button id="download-data-quality-pdf" data-testid="download-data-quality-pdf" onClick={handleDownloadDataQualityPdf} disabled={!stats} className={smallBtn}>Data quality report — print / save as PDF</button>
                <p className="mt-1 text-xs text-gray-500">Opens a print view; choose 'Save as PDF' in your browser.</p>
              </div>
              <button id="download-methods-summary" data-testid="download-methods-summary" onClick={handleDownloadMethodsSummary} disabled={!stats || !schema || !plan} className={smallBtn}>Methods summary (.md)</button>
              <button id="download-methods-summary-docx" data-testid="download-methods-summary-docx" onClick={handleDownloadMethodsSummaryDocx} disabled={!stats || !schema || !plan} className={smallBtn}>Methods summary (.docx)</button>
              <button id="download-eda-report" data-testid="download-eda-report" onClick={handleDownloadEdaReport} disabled={!edaResults} className={smallBtn}>EDA report (.html)</button>
              <button id="download-eda-summary" data-testid="download-eda-summary" onClick={handleDownloadEdaSummary} disabled={!edaResults} className={smallBtn}>Download EDA summary (.md)</button>
            </div>
          </div>

          </div>
          <div className="space-y-4 min-w-0">
          <div className={cardCls}>
            <h4 className="text-base font-semibold text-gray-900">Full report (single document)</h4>
            <p className="mt-1 text-xs text-gray-600">Sections follow the checkboxes under What to include.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" data-testid="download-report-html" onClick={handleDownloadUnifiedReportHtml} disabled={!formattedTable || isExportingReport} className={smallBtn}>
                {isExportingReport ? "Rendering report..." : "Download report (.html)"}
              </button>
              <button type="button" data-testid="download-report-source" onClick={handleDownloadUnifiedReportSource} disabled={!formattedTable || isExportingReport} className={smallBtn}>
                Download source (.md + figures)
              </button>
              <button type="button" data-testid="open-report-pdf" onClick={handleOpenUnifiedReportPdf} disabled={!formattedTable || isExportingReport} className={smallBtn}>
                Print / Save PDF
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-600">
              The HTML is timestamped and self-contained, with report figures embedded. Use the PDF option to save the same report through your browser's print dialog.
            </p>
          </div>

          <div className={cardCls}>
            <h4 className="text-base font-semibold text-gray-900">Teaching</h4>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-xs font-medium text-gray-700">
                Depth
                <select
                  value={educationExportDepth}
                  onChange={(e) => setEducationExportDepth(e.target.value as ExplanationDepth)}
                  className="mt-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
                >
                  <option value="concise">Concise</option>
                  <option value="deep">Detailed</option>
                </select>
              </label>
              <button type="button" data-testid="download-education-md" onClick={handleDownloadEducationReportMarkdown} className={smallBtn}>Methods & rationale (.md)</button>
              <button type="button" data-testid="download-education-docx" onClick={handleDownloadEducationReportDocx} className={smallBtn}>Methods & rationale (.docx)</button>
              <button id="download-results-summary" data-testid="download-results-summary" onClick={handleDownloadResultsSummary} disabled={!resultsSummary} className={smallBtn}>Download results summary (.md)</button>
            </div>
          </div>

          <div className={cardCls}>
            <h4 className="text-base font-semibold text-gray-900">Modeling</h4>
            {hasModelingReport ? (
              <>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button id="download-modeling-report-md" data-testid="download-modeling-report-md" onClick={handleDownloadModelingReportMarkdown} className={smallBtn}>Modeling report (.md)</button>
                  <button id="download-modeling-report-docx" data-testid="download-modeling-report-docx" onClick={handleDownloadModelingReportDocx} className={smallBtn}>Modeling report (.docx)</button>
                  <button id="download-modeling-data" data-testid="download-modeling-data" onClick={handleDownloadModelingData} disabled={isExportingModelingData} className={smallBtn}>
                    {isExportingModelingData ? "Preparing modeling data..." : "Download all modeling data (.zip)"}
                  </button>
                </div>
                <p className="mt-3 text-xs text-gray-500">
                  Modeling data files contain row-level modeling data for your own re-plotting; they are downloaded locally and are not written anywhere else.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-gray-500">Modeling files appear here after you run Modeling (Step 6).</p>
            )}
          </div>
          </div>
        </div>
      </section>
      <StepActionBar
        onBack={() => setStage(hasModelingReport ? 8 : 7)}
        backLabel={hasModelingReport ? "Back to Modeling" : "Back to Statistical review"}
        status={hasDownloaded ? { tone: "ok", text: "Downloaded" } : { tone: "info", text: "Table 1 ready to export" }}
        engineReady={engineReady}
        engineError={engineError}
        primary={{ label: "Download All", testId: "download-all-action", needsEngine: true, onClick: handleDownloadAll }}
      />
    </div>
  );
}
