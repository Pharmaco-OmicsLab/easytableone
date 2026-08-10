import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import JSZip from "jszip";
import { exportCsv } from "../../core/export/csv";
import { exportDocx } from "../../core/export/docx";
import { HtmlPreview } from "../../core/export/htmlPreview";
import { exportLatex } from "../../core/export/latex";
import { exportXlsx } from "../../core/export/xlsx";
import { generateReproducibilityJson } from "../../core/export/reproducibilityJson";
import { generateAnalysisHistory } from "../../core/export/analysisHistory";
import { generateDataQualityReport } from "../../core/export/dataQualityReport";
import { generateEDAReportHtml, generateEdaSummaryMarkdown } from "../../core/export/edaReport";
import { vegaLiteSpecToPng } from "../../core/export/vegaRender";
import { buildModelingDataZip } from "../../core/export/modelingData";
import { buildModelingReportMarkdown, exportModelingReportDocx } from "../../core/export/modelingReport";
import { buildMethodsSummaryMarkdown, exportMethodsSummaryDocx } from "../../core/export/methodsSummary";
import { buildEducationReportMarkdown, exportEducationReportDocx } from "../../core/export/educationReport";
import { renderUnifiedReportHtml } from "../../core/export/reportHtml";
import { buildUnifiedReport, type ReportAsset, type UnifiedReportContext, type UnifiedReportSections } from "../../core/export/unifiedReport";
import { APP_VERSION } from "../../core/appVersion";
import type { ExplanationDepth } from "../../core/education/educationTypes";
import { exportDataQualityDocx, exportDataQualityPdf } from "../../core/export/dataQualityExport";
import { formatTable, journalRulesets } from "../../core/format/formatTable";
import { getEffectiveJournalSettings } from "../../core/format/getEffectiveJournalSettings";
import { generateDiagnosticsCsv } from "../../core/format/diagnosticsCsv";
import { buildResultsSummary } from "../../core/format/resultsSummary";
import { getColumnDisplayLabel, resolveLevelLabel, resolvePlotDataLabels } from "../../core/format/columnLabel";
import type { LogisticResult, MlResult } from "../../core/modeling/types";
import { buildDecisionCurveSpec, buildMlCalibrationSpec, buildMlImportanceSpec, buildMlRocSpec } from "../../core/modeling/vizSpecs";
import { JournalStyleCard } from "../components/JournalStyleCard";
import JournalOverridePanel from "../components/JournalOverridePanel";
import { useStore } from "../../store";
import { sha256Hex } from "../../lib/hash";
import { pyodideClient } from "../../workers/pyodide.client";
import AboutThisStep from "../components/AboutThisStep";
import EmptyState from "../components/EmptyState";

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

export default function FormatExportStage() {
  const {
    stats,
    journalId,
    setJournalId,
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

  const journalConfig = useMemo(
    () => journalRulesets.EasyTableOne_Ruleset.journals.find((j) => j.journal_id === journalId),
    [journalId]
  );
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

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
      alert("Failed to export DOCX.");
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
      alert("Missing data to generate reproducibility JSON.");
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

  /** Step 5 — Diagnostics CSV + JSON */
  const handleDownloadDiagnostics = () => {
    if (!stats) return;
    // CSV
    const csvStr = generateDiagnosticsCsv(stats, schema ?? undefined, plan?.groupingVariable, journalId, plan?.userOverrides);
    triggerDownload(new Blob([csvStr], { type: "text/csv;charset=utf-8;" }), "diagnostics.csv");
    // JSON
    const groupingSchemaCol = schema?.columns.find(c => c.name === plan?.groupingVariable);
    const resolvedPerVariable = stats.perVariable.map(v => {
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

  const handleDownloadEdaReport = () => {
    if (!edaResults) return;
    const html = generateEDAReportHtml(edaResults, schema, APP_VERSION, new Date().toISOString());
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
      alert("Failed to export methods summary DOCX.");
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
      alert("Failed to export methods & rationale explainer DOCX.");
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
      alert("Failed to export modeling report DOCX.");
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
      alert(e instanceof Error ? e.message : "Failed to export modeling data.");
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
      alert(e instanceof Error ? e.message : "Failed to export full report HTML.");
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
      alert(e instanceof Error ? e.message : "Failed to export full report source.");
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
        alert("Could not open the print view. Please allow pop-ups for this site and try again.");
        return;
      }
      printWindow.document.open();
      printWindow.document.write(
        html.replace("</body>", "<script>window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 150); });</script></body>"),
      );
      printWindow.document.close();
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to open the PDF/print view.");
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
      alert("Failed to export Data Quality DOCX.");
    }
  };

  const handleDownloadDataQualityPdf = () => {
    if (!plan || !schema) return;
    exportDataQualityPdf(dataQualityRecords, schema, plan, APP_VERSION, { qaReport, edaResults: includeEdaReport ? edaResults : null });
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
      alert(e instanceof Error ? e.message : "Failed to export figures.");
    } finally {
      setIsExportingFigures(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!formattedTable || !stats) return;
    setIsDownloadingAll(true);
    try {
      // 1. DOCX (with or without plots per checkbox)
      await handleDownloadDocx();
      // 2. CSV
      handleDownloadCsv();
      // 3. Excel
      handleDownloadXlsx();
      // 4. LaTeX
      handleDownloadLatex();
      // 5. Reproducibility JSON
      await handleDownloadReproJson();
      // 6. Diagnostics
      handleDownloadDiagnostics();
      // 7. Analysis history
      handleDownloadAnalysisHistory();
      // 8. Data quality report (md, docx, pdf)
      handleDownloadDataQualityReport();
      await handleDownloadDataQualityDocx();
      handleDownloadDataQualityPdf();
      if (includeEdaReport) {
        handleDownloadEdaReport();
        handleDownloadEdaSummary();
      }
      if (hasModelingReport) {
        handleDownloadModelingReportMarkdown();
        await handleDownloadModelingReportDocx();
        await handleDownloadModelingData();
      }
      handleDownloadResultsSummary();
      handleDownloadMethodsSummary();
      await handleDownloadMethodsSummaryDocx();
      handleDownloadEducationReportMarkdown();
      await handleDownloadEducationReportDocx();
    } catch (e) {
      console.error(e);
      alert("Download All encountered an error. Some files may not have been downloaded.");
    } finally {
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

      <CollapsibleSection title="Select Journal Style">
        <label htmlFor="journal-select" className="block text-sm font-medium text-gray-700 mb-2">
          Select Journal Style
        </label>
        <select
          id="journal-select"
          value={journalId}
          onChange={(e) => setJournalId(e.target.value)}
          className="mt-1 block w-64 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border p-2"
        >
          {journalRulesets.EasyTableOne_Ruleset.journals.map((j) => (
            <option key={j.journal_id} value={j.journal_id}>
              {j.display_name}
            </option>
          ))}
        </select>

        {/* Step 9 — JournalStyleCard */}
        {journalConfig && (
          <div className="mt-4">
            <JournalStyleCard config={journalConfig} />
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Journal Formatting Overrides">
        <JournalOverridePanel hideHeader />
      </CollapsibleSection>

      <CollapsibleSection title="Live Preview">
        {formattedTable ? (
          <div className="border border-gray-200 p-4 rounded bg-white">
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
          <p className="text-sm text-gray-700 leading-relaxed">{resultsSummary}</p>
        </CollapsibleSection>
      )}

      <CollapsibleSection title="Export Options">
        <div className="mb-5 max-w-3xl rounded-lg border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-emerald-950">Full report (single document)</h4>
            <button
              type="button"
              onClick={toggleFullReportOptions}
              className="rounded border border-emerald-200 bg-white px-2 py-1 text-xs font-semibold text-emerald-950 hover:bg-emerald-50"
            >
              {allEnabledFullReportSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="mt-3 grid gap-2 text-sm text-emerald-950 sm:grid-cols-2">
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked
                disabled
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-700 disabled:opacity-70"
              />
              <span>Table 1 section</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={includeDataQualityFullReport}
                onChange={(e) => setIncludeDataQualityFullReport(e.target.checked)}
                disabled={!schema || !plan}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50"
              />
              <span>Data quality section</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={includeEdaFullReport}
                onChange={(e) => setIncludeEdaFullReport(e.target.checked)}
                disabled={!edaResults}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50"
              />
              <span>EDA section</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={includeModelingFullReport && hasModelingReport}
                onChange={(e) => setIncludeModelingFullReport(e.target.checked)}
                disabled={!hasModelingReport}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50"
              />
              <span>Modeling section</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={includeMethodsSummaryFullReport}
                onChange={(e) => setIncludeMethodsSummaryFullReport(e.target.checked)}
                disabled={!stats || !schema || !plan}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600 disabled:opacity-50"
              />
              <span>Methods summary section</span>
            </label>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={includeEducationFullReport}
                onChange={(e) => setIncludeEducationFullReport(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-700 focus:ring-emerald-600"
              />
              <span>Methods &amp; rationale section</span>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleDownloadUnifiedReportHtml}
              disabled={!formattedTable || isExportingReport}
              className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50"
            >
              {isExportingReport ? "Rendering report..." : "Download report (.html)"}
            </button>
            <button
              type="button"
              onClick={handleDownloadUnifiedReportSource}
              disabled={!formattedTable || isExportingReport}
              className="px-4 py-2 border border-emerald-200 text-sm font-medium rounded-md text-emerald-950 bg-white hover:bg-emerald-50 disabled:opacity-50"
            >
              Download source (.md + figures)
            </button>
            <button
              type="button"
              onClick={handleOpenUnifiedReportPdf}
              disabled={!formattedTable || isExportingReport}
              className="px-4 py-2 border border-emerald-200 text-sm font-medium rounded-md text-emerald-950 bg-white hover:bg-emerald-50 disabled:opacity-50"
            >
              Print / Save PDF
            </button>
          </div>
          <p className="mt-2 text-xs text-emerald-900">
            The HTML is timestamped and self-contained, with report figures embedded. Use the PDF option to save the same report through your browser's print dialog.
          </p>
        </div>

        <div className="mb-4 max-w-3xl rounded-lg border border-sky-100 bg-sky-50 p-4">
          <h4 className="mb-3 text-sm font-semibold text-sky-950">Standalone methods &amp; rationale files</h4>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs font-medium text-sky-900">
              Depth
              <select
                value={educationExportDepth}
                onChange={(e) => setEducationExportDepth(e.target.value as ExplanationDepth)}
                className="mt-1 rounded border border-sky-200 bg-white px-2 py-1.5 text-sm text-gray-900"
              >
                <option value="concise">Concise</option>
                <option value="deep">Detailed</option>
              </select>
            </label>
            <button
              type="button"
              onClick={handleDownloadEducationReportMarkdown}
              className="px-4 py-2 border border-sky-200 text-sm font-medium rounded-md text-sky-900 bg-white hover:bg-sky-50"
            >
              Methods & rationale (.md)
            </button>
            <button
              type="button"
              onClick={handleDownloadEducationReportDocx}
              className="px-4 py-2 border border-sky-200 text-sm font-medium rounded-md text-sky-900 bg-white hover:bg-sky-50"
            >
              Methods & rationale (.docx)
            </button>
          </div>
        </div>
        {figureExportItems.length > 0 && (
          <div className="mb-5 max-w-2xl rounded-lg border border-sky-100 bg-sky-50 p-4">
            <h4 className="text-sm font-semibold text-sky-950">Figure export</h4>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs font-medium text-sky-900">
                Format
                <select
                  value={figureFormat}
                  onChange={(e) => setFigureFormat(e.target.value as "png" | "pdf" | "svg")}
                  className="mt-1 rounded border border-sky-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                >
                  <option value="png">PNG</option>
                  <option value="pdf">PDF</option>
                  <option value="svg">SVG</option>
                </select>
              </label>
              <label className="flex flex-col text-xs font-medium text-sky-900">
                DPI
                <select
                  value={figureDpi}
                  onChange={(e) => setFigureDpi(Number(e.target.value))}
                  className="mt-1 rounded border border-sky-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                >
                  {[150, 300, 600].map((dpi) => (
                    <option key={dpi} value={dpi}>{dpi}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col text-xs font-medium text-sky-900">
                Font scale
                <input
                  type="number"
                  min="0.6"
                  max="2"
                  step="0.1"
                  value={figureFontScale}
                  onChange={(e) => setFigureFontScale(Number(e.target.value))}
                  className="mt-1 w-24 rounded border border-sky-200 bg-white px-2 py-1.5 text-sm text-gray-900"
                />
              </label>
              <button
                type="button"
                onClick={handleDownloadFiguresZip}
                disabled={isExportingFigures}
                className="px-4 py-2 border border-sky-200 text-sm font-medium rounded-md text-sky-900 bg-white hover:bg-sky-50 disabled:opacity-50"
              >
                {isExportingFigures ? "Rendering figures..." : `Download figures (.zip)`}
              </button>
            </div>
            <p className="mt-2 text-xs text-sky-800">{figureExportItems.length} diagnostic figure files will be rendered using the active journal theme.</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3 rounded border border-blue-200 bg-blue-50 p-4">
          <h4 className="w-full text-sm font-semibold text-blue-950">All files</h4>
          {/* Download All */}
          <button
            id="download-all"
            onClick={handleDownloadAll}
            disabled={!formattedTable || isExporting || isDownloadingAll}
            className="px-4 py-2 border border-blue-700 text-sm font-medium rounded-md shadow-sm text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-50"
          >
            {isDownloadingAll ? "Downloading..." : "⬇ Download All"}
          </button>

          <div className="w-px bg-gray-200 self-stretch" />

          <div data-testid="manuscript-table-export" className="w-full border-t border-blue-100 pt-3">
            <h4 className="text-sm font-semibold text-gray-900">Manuscript table</h4>
            <div className="mt-3 rounded border border-blue-100 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h5 className="text-sm font-semibold text-blue-950">Manuscript Word export</h5>
                  <p className="mt-1 text-xs text-blue-900">
                    These options affect the Word (.docx) export below.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleManuscriptWordOptions}
                  className="rounded border border-blue-200 bg-white px-2 py-1 text-xs font-semibold text-blue-950 hover:bg-blue-50"
                >
                  {allEnabledManuscriptWordSelected ? "Clear all" : "Select all"}
                </button>
              </div>
              <div className="mt-3 grid gap-3 text-sm text-gray-700 md:grid-cols-2">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={includePlotsInDocx}
                    onChange={(e) => setIncludePlotsInDocx(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="font-medium text-gray-900">Diagnostic plots as supplementary figures</span>
                    <span className="block text-xs text-gray-500">
                      Adds a Supplementary Figures section. Rendering may take 10-30 s depending on dataset size.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={includeMethodsSummary}
                    onChange={(e) => setIncludeMethodsSummary(e.target.checked)}
                    disabled={!stats || !schema || !plan}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <span>
                    <span className="font-medium text-gray-900">Methods summary appendix</span>
                    <span className="block text-xs text-gray-500">
                      Appends per-variable summary format, test, and selection reason.
                    </span>
                  </span>
                </label>
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={includeEducationReport}
                    onChange={(e) => setIncludeEducationReport(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="font-medium text-gray-900">Methods &amp; rationale explainer appendix</span>
                    <span className="block text-xs text-gray-500">
                      Appends the stage-by-stage teaching explainer using the selected depth.
                    </span>
                  </span>
                </label>
                {hasModelingReport && (
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={includeModelingReport}
                      onChange={(e) => setIncludeModelingReport(e.target.checked)}
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>
                      <span className="font-medium text-gray-900">Modeling report appendix</span>
                      <span className="block text-xs text-gray-500">
                        Appends the publication-style modeling report after Table 1 and selected appendices.
                      </span>
                    </span>
                  </label>
                )}
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={includeEdaReport}
                    onChange={(e) => setIncludeEdaReport(e.target.checked)}
                    disabled={!edaResults}
                    className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  <span>
                    <span className="font-medium text-gray-900">EDA report appendix</span>
                    <span className="block text-xs text-gray-500">
                      Adds generated EDA summaries and available EDA plots. Generate EDA in Stage 5 first.
                    </span>
                  </span>
                </label>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  id="download-docx"
                  onClick={handleDownloadDocx}
                  disabled={!formattedTable || isExporting}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {isExporting ? "Generating Word..." : "Download Word (.docx)"}
                </button>
              </div>
            </div>
          </div>

          <button
            id="download-csv"
            onClick={handleDownloadCsv}
            disabled={!formattedTable}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Download CSV
          </button>
          <button
            id="download-xlsx"
            onClick={handleDownloadXlsx}
            disabled={!formattedTable}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Download Excel (.xlsx)
          </button>
          <button
            id="download-latex"
            onClick={handleDownloadLatex}
            disabled={!formattedTable}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Download LaTeX
          </button>
          <h4 className="w-full border-t border-blue-100 pt-3 text-sm font-semibold text-gray-900">Reproducibility bundle</h4>
          <button
            id="download-repro-json"
            onClick={handleDownloadReproJson}
            disabled={!stats}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Reproducibility JSON
          </button>
          {/* Step 5 */}
          <h4 className="w-full border-t border-blue-100 pt-3 text-sm font-semibold text-gray-900">Reviewer / audit files</h4>
          <button
            id="download-diagnostics"
            onClick={handleDownloadDiagnostics}
            disabled={!stats}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Diagnostics (CSV/JSON)
          </button>
          {/* Step 6 */}
          <h4 className="w-full border-t border-blue-100 pt-3 text-sm font-semibold text-gray-900">Reproducibility bundle</h4>
          <button
            id="download-analysis-history"
            onClick={handleDownloadAnalysisHistory}
            disabled={!stats}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Reproducible Python (.py)
          </button>
          <button
            id="download-data-quality-report"
            onClick={handleDownloadDataQualityReport}
            disabled={!stats}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Data quality report (.md)
          </button>
          <button
            id="download-data-quality-docx"
            onClick={handleDownloadDataQualityDocx}
            disabled={!stats}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Data quality report (.docx)
          </button>
          <button
            id="download-data-quality-pdf"
            onClick={handleDownloadDataQualityPdf}
            disabled={!stats}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Data quality report (PDF)
          </button>
          <h4 className="w-full border-t border-blue-100 pt-3 text-sm font-semibold text-gray-900">Teaching / rationale</h4>
          <button
            id="download-eda-report"
            onClick={handleDownloadEdaReport}
            disabled={!edaResults}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            EDA report (.html)
          </button>
          <button
            id="download-eda-summary"
            onClick={handleDownloadEdaSummary}
            disabled={!edaResults}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Download EDA summary (.md)
          </button>
          <button
            id="download-results-summary"
            onClick={handleDownloadResultsSummary}
            disabled={!resultsSummary}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Download results summary (.md)
          </button>
          <button
            id="download-methods-summary"
            onClick={handleDownloadMethodsSummary}
            disabled={!stats || !schema || !plan}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Methods summary (.md)
          </button>
          <button
            id="download-methods-summary-docx"
            onClick={handleDownloadMethodsSummaryDocx}
            disabled={!stats || !schema || !plan}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            Methods summary (.docx)
          </button>
          <h4 className="w-full border-t border-blue-100 pt-3 text-sm font-semibold text-gray-900">Modeling files</h4>
          {hasModelingReport && (
            <>
              <button
                id="download-modeling-report-md"
                onClick={handleDownloadModelingReportMarkdown}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                Modeling report (.md)
              </button>
              <button
                id="download-modeling-report-docx"
                onClick={handleDownloadModelingReportDocx}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50"
              >
                Modeling report (.docx)
              </button>
              <button
                id="download-modeling-data"
                onClick={handleDownloadModelingData}
                disabled={isExportingModelingData}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
              >
                {isExportingModelingData ? "Preparing modeling data..." : "Download all modeling data (.zip)"}
              </button>
            </>
          )}
        </div>
        {hasModelingReport && (
          <p className="mt-3 max-w-2xl text-xs text-gray-500">
            Modeling data files contain row-level modeling data for your own re-plotting; they are downloaded locally and are not written anywhere else.
          </p>
        )}
      </CollapsibleSection>


      <div className="flex justify-start">
        <button
          onClick={() => setStage(7)}
          className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md shadow-sm text-gray-700 bg-white hover:bg-gray-50 focus:outline-none"
        >
          Back
        </button>
      </div>
    </div>
  );
}
