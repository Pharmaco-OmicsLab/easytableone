import { useEffect, useState } from "react";
import type { DataQualityFinding } from "../../core/types";
import { useStore } from "../../store";
import { getColumnDisplayLabel } from "../../core/format/columnLabel";
import { stripBracketCodes } from "../../core/format/tableTitle";
import { exportDataQualityDocx, exportDataQualityPdf } from "../../core/export/dataQualityExport";

export interface DataQualityGatePanelProps {
  findings: DataQualityFinding[];
  acknowledgedIds: Set<string>;
  dismissedIds: Set<string>;
  onAcknowledge: (checkId: string) => void;
  acknowledgeReasons?: Record<string, string>;
  onAcknowledgeReasonChange?: (checkId: string, reason: string) => void;
  onDismiss: (checkId: string) => void;
  onReupload: () => void;
  /** Optional: opens the TutorialModal without navigating away. */
  onOpenTutorial?: () => void;
}

export function DataQualityGatePanel({
  findings,
  acknowledgedIds,
  dismissedIds,
  onAcknowledge,
  acknowledgeReasons = {},
  onAcknowledgeReasonChange,
  onDismiss,
  onReupload,
  onOpenTutorial,
}: DataQualityGatePanelProps) {
  const { schema, updateSchemaColumn, qaReport, edaResults } = useStore();

  const getDisplayVarName = (f: DataQualityFinding) => {
    if (!f.variable) return "";
    const col = schema?.columns.find((c) => c.name === f.variable);
    return col ? getColumnDisplayLabel(col, "stripped") : stripBracketCodes(f.variable);
  };

  const renderDetailText = (f: DataQualityFinding) => {
    if (!f.variable) return f.detail;
    const displayVar = getDisplayVarName(f);
    if (!displayVar || !f.detail.includes(displayVar)) return f.detail;

    const parts = f.detail.split(displayVar);
    return (
      <>
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < parts.length - 1 && <strong>{displayVar}</strong>}
          </span>
        ))}
      </>
    );
  };

  const renderAdvisoryExtras = (f: DataQualityFinding) => (
    <>
      {f.assumedUnitNote && (
        <p className="text-xs text-gray-500 italic">{f.assumedUnitNote}</p>
      )}
      {f.highlightedValues && f.highlightedValues.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
          <span>Values outside range:</span>
          {f.highlightedValues.slice(0, 10).map((value, index) => (
            <span key={`${f.checkId}-${value}-${index}`} className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-gray-700">
              {value}
            </span>
          ))}
          {f.affectedCount !== undefined && f.affectedCount > 10 && (
            <span className="text-gray-500">and {f.affectedCount - 10} more</span>
          )}
        </div>
      )}
    </>
  );

  const blockingFindings = findings.filter((f) => f.tier === "blocking");
  const reviewFindings = findings.filter((f) => f.tier === "review");
  const advisoryFindings = findings.filter((f) => f.tier === "advisory" && !dismissedIds.has(f.checkId));

  const hasBlocking = blockingFindings.length > 0;
  const hasReview = reviewFindings.length > 0;
  const hasAdvisory = advisoryFindings.length > 0;

  const [blockingExpanded, setBlockingExpanded] = useState(hasBlocking);
  const [reviewExpanded, setReviewExpanded] = useState(hasReview);
  const [advisoryExpanded, setAdvisoryExpanded] = useState(hasAdvisory);
  const [blockingToggled, setBlockingToggled] = useState(false);
  const [reviewToggled, setReviewToggled] = useState(false);
  const [advisoryToggled, setAdvisoryToggled] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!blockingToggled) {
      setBlockingExpanded(hasBlocking);
    }
  }, [hasBlocking, blockingToggled]);

  useEffect(() => {
    if (!reviewToggled) {
      setReviewExpanded(hasReview);
    }
  }, [hasReview, reviewToggled]);

  useEffect(() => {
    if (!advisoryToggled) {
      setAdvisoryExpanded(hasAdvisory);
    }
  }, [hasAdvisory, advisoryToggled]);

  const hasUnacknowledgedReview = reviewFindings.some((f) => !acknowledgedIds.has(f.checkId));

  const toggleRowExpansion = (id: string) => {
    const next = new Set(expandedRows);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedRows(next);
  };

  const handleExportDocx = async () => {
    const tempRecords = findings.map(f => ({
      finding: f,
      response: acknowledgedIds.has(f.checkId) ? "acknowledged" as const : (dismissedIds.has(f.checkId) ? "dismissed" as const : "overridden" as const),
      timestamp: new Date().toISOString()
    }));
    try {
      const blob = await exportDataQualityDocx(tempRecords, schema, null, "1.0", { qaReport, edaResults });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `data_quality_report_${Date.now()}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert("Failed to export Word document.");
    }
  };

  const handleExportPdf = () => {
    const tempRecords = findings.map(f => ({
      finding: f,
      response: acknowledgedIds.has(f.checkId) ? "acknowledged" as const : (dismissedIds.has(f.checkId) ? "dismissed" as const : "overridden" as const),
      timestamp: new Date().toISOString()
    }));
    exportDataQualityPdf(tempRecords, schema, null, "1.0", { qaReport, edaResults });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900 mb-2">Data Quality Gate</h3>
          <p className="text-sm text-gray-600">
            Review issues, missingness, and layout format warnings before proceeding.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 md:self-start">
          <button
            onClick={handleExportDocx}
            className="px-3 py-1.5 border border-gray-300 text-xs font-semibold rounded text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors"
          >
            Export Word (.docx)
          </button>
          <button
            onClick={handleExportPdf}
            className="px-3 py-1.5 border border-gray-300 text-xs font-semibold rounded text-gray-700 bg-white hover:bg-gray-50 shadow-sm transition-colors"
          >
            Export PDF
          </button>
        </div>
      </div>
      <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-100">
        
        {/* Tier Definitions */}
        <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start space-x-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-red-600 mt-1 flex-shrink-0" />
            <div>
              <strong className="text-red-900 font-bold block">Blocking Issues (Critical)</strong>
              <span className="text-gray-500">Errors that must be resolved (e.g., by correcting data or excluding variables) before the table can be generated.</span>
            </div>
          </div>
          <div className="flex items-start space-x-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1 flex-shrink-0" />
            <div>
              <strong className="text-amber-900 font-bold block">Review Needed (Important)</strong>
              <span className="text-gray-500">Important data warnings (e.g., high missingness or outliers) that you must review and acknowledge, but they do not block progression.</span>
            </div>
          </div>
          <div className="flex items-start space-x-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 mt-1 flex-shrink-0" />
            <div>
              <strong className="text-blue-900 font-bold block">Advisory</strong>
              <span className="text-gray-500">Optional recommendations and passive quality notes (e.g., formatting improvements) to help polish your final table.</span>
            </div>
          </div>
        </div>

        {/* Contextual tutorial link (Step 12.3 — trigger surface 3) */}
        {onOpenTutorial && (
          <p className="mt-3 text-sm text-gray-500">
            If a finding looks wrong, your input format may not match the expected shape.{" "}
            <button
              id="gate-panel-tutorial-link"
              onClick={onOpenTutorial}
              className="text-blue-600 underline hover:text-blue-800 bg-transparent border-none p-0 cursor-pointer"
            >
              View input format guide
            </button>
            .
          </p>
        )}
      </div>

      {/* 1. BLOCKING SECTION */}
      {blockingFindings.length === 0 ? (
        <div className="flex items-center justify-between p-4 bg-gray-50 text-gray-500 border border-gray-200 rounded-lg">
          <span className="font-bold text-sm">Blocking Issues: None</span>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => {
              setBlockingToggled(true);
              setBlockingExpanded(!blockingExpanded);
            }}
            className="w-full flex items-center justify-between p-4 bg-red-50 text-red-900 hover:bg-red-100 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <span className="font-bold">Blocking Issues ({blockingFindings.length})</span>
              {hasBlocking && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-red-600 text-white rounded-full">
                  Action Required
                </span>
              )}
            </div>
            <span>{blockingExpanded ? "▲" : "▼"}</span>
          </button>

          {blockingExpanded && (
            <div className="p-4 space-y-4 divide-y divide-gray-100">
              {blockingFindings.map((f) => (
                <div key={f.checkId} className="pt-4 first:pt-0 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-red-700">{f.title}</h4>
                      {f.variable && (
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="inline-block px-1.5 py-0.5 text-xs font-mono bg-red-100 text-red-800 rounded">
                            Variable: {f.variable}
                          </span>
                          <button
                            onClick={() => {
                              updateSchemaColumn(f.variable!, { exclusionReason: "Manually excluded" });
                            }}
                            className="px-2 py-0.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded shadow-sm transition-colors"
                          >
                            Exclude Column
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700">{f.detail}</p>
                  
                  {f.requirement && (
                    <div className="bg-red-50 border border-red-200 rounded p-3 text-sm space-y-1">
                      <strong className="block text-red-900 font-semibold">What the app requires:</strong>
                      <p className="text-red-800">{f.requirement}</p>
                    </div>
                  )}

                  <div className="bg-gray-50 border border-gray-200 rounded p-3 text-sm space-y-1">
                    <strong className="block text-gray-900 font-semibold">How to fix it:</strong>
                    <p className="text-gray-800">{f.remedy}</p>
                  </div>
                  {f.category === "format" && (
                    <button
                      onClick={onReupload}
                      className="inline-flex items-center text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline pt-1"
                    >
                      Re-upload your corrected file &rarr;
                    </button>
                  )}

                  {f.affectedRowsSample && f.affectedRowsSample.length > 0 && (
                    <div className="mt-2">
                      <button
                        onClick={() => toggleRowExpansion(f.checkId)}
                        className="text-xs text-gray-500 hover:text-gray-700 hover:underline focus:outline-none"
                      >
                        {expandedRows.has(f.checkId) ? "Hide affected rows" : "View affected rows"}
                      </button>
                      {expandedRows.has(f.checkId) && (
                        <div className="mt-2 text-xs font-mono bg-gray-50 p-2 rounded max-h-32 overflow-y-auto border border-gray-200">
                          <p className="text-gray-500 mb-1">Affected rows (1-indexed):</p>
                          <p className="text-gray-700 mb-2">{f.affectedRowsSample.join(", ")}</p>
                          {f.sampleValues && f.sampleValues.length > 0 && (
                            <>
                              <p className="text-gray-500 mb-1">Sample values:</p>
                              <p className="text-gray-700">{f.sampleValues.map(v => `'${v}'`).join(", ")}</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. REVIEW SECTION */}
      {reviewFindings.length === 0 ? (
        <div className="flex items-center justify-between p-4 bg-gray-50 text-gray-500 border border-gray-200 rounded-lg">
          <span className="font-bold text-sm">Review Needed: None</span>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => {
              setReviewToggled(true);
              setReviewExpanded(!reviewExpanded);
            }}
            className="w-full flex items-center justify-between p-4 bg-amber-50 text-amber-900 hover:bg-amber-100 transition-colors"
          >
            <div className="flex items-center space-x-2">
              <span className="font-bold">Review Needed ({reviewFindings.length})</span>
              {hasUnacknowledgedReview && (
                <span className="px-2 py-0.5 text-xs font-semibold bg-amber-600 text-white rounded-full">
                  Review Required
                </span>
              )}
            </div>
            <span>{reviewExpanded ? "▲" : "▼"}</span>
          </button>

          {reviewExpanded && (
            <div className="p-4 space-y-4 divide-y divide-gray-100">
              {reviewFindings.map((f) => {
                const isAcked = acknowledgedIds.has(f.checkId);
                return (
                  <div key={f.checkId} className="pt-4 first:pt-0 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-amber-700">{f.title}</h4>
                        {f.variable && (
                          <div className="flex items-center space-x-2 mt-1">
                            <span className="inline-block px-1.5 py-0.5 text-xs font-mono bg-amber-100 text-amber-800 rounded">
                              Variable: {f.variable}
                            </span>
                            <button
                              onClick={() => {
                                updateSchemaColumn(f.variable!, { exclusionReason: "Manually excluded" });
                              }}
                              className="px-2 py-0.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded shadow-sm transition-colors"
                            >
                              Exclude Column
                            </button>
                          </div>
                        )}
                      </div>
                      {!isAcked ? (
                        <button
                          onClick={() => onAcknowledge(f.checkId)}
                          className="px-3 py-1 text-xs font-semibold bg-amber-600 text-white rounded hover:bg-amber-700 transition-colors"
                        >
                          Acknowledge
                        </button>
                      ) : (
                        <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded">
                          ✓ Acknowledged
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700">{f.detail}</p>
                    <p className="text-xs text-gray-500 italic">
                      <strong>How to fix it:</strong> {f.remedy}
                    </p>
                    <label className="block pt-1 text-xs font-medium text-gray-700">
                      Optional acknowledgement reason
                      <textarea
                        value={acknowledgeReasons[f.checkId] ?? ""}
                        onChange={(event) => onAcknowledgeReasonChange?.(f.checkId, event.target.value)}
                        placeholder="Example: reviewed source file; values are expected for this cohort."
                        maxLength={300}
                        rows={2}
                        className="mt-1 w-full rounded border border-gray-300 p-2 text-sm font-normal text-gray-800"
                      />
                    </label>

                    {f.affectedRowsSample && f.affectedRowsSample.length > 0 && (
                      <div className="mt-2">
                        <button
                          onClick={() => toggleRowExpansion(f.checkId)}
                          className="text-xs text-gray-500 hover:text-gray-700 hover:underline focus:outline-none"
                        >
                          {expandedRows.has(f.checkId) ? "Hide affected rows" : "View affected rows"}
                        </button>
                        {expandedRows.has(f.checkId) && (
                          <div className="mt-2 text-xs font-mono bg-gray-50 p-2 rounded max-h-32 overflow-y-auto border border-gray-200">
                            <p className="text-gray-500 mb-1">Affected rows (1-indexed):</p>
                            <p className="text-gray-700 mb-2">{f.affectedRowsSample.join(", ")}</p>
                            {f.sampleValues && f.sampleValues.length > 0 && (
                              <>
                                <p className="text-gray-500 mb-1">Sample values:</p>
                                <p className="text-gray-700">{f.sampleValues.map(v => `'${v}'`).join(", ")}</p>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. ADVISORY SECTION */}
      {advisoryFindings.length === 0 ? (
        <div className="flex items-center justify-between p-4 bg-gray-50 text-gray-500 border border-gray-200 rounded-lg">
          <span className="font-bold text-sm">Advisory Notes: None</span>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <button
            onClick={() => {
              setAdvisoryToggled(true);
              setAdvisoryExpanded(!advisoryExpanded);
            }}
            className="w-full flex items-center justify-between p-4 bg-blue-50 text-blue-900 hover:bg-blue-100 transition-colors"
          >
            <span className="font-bold">Advisory ({advisoryFindings.length})</span>
            <span>{advisoryExpanded ? "▲" : "▼"}</span>
          </button>

          {advisoryExpanded && (
            <div className="p-4 space-y-6">
              {/* Data Quality Notes */}
              {advisoryFindings.some(f => f.category === "quality") && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Passive Data-Quality Notes
                  </h4>
                  <div className="space-y-3 divide-y divide-gray-50">
                    {advisoryFindings
                      .filter(f => f.category === "quality")
                      .map((f) => (
                        <div key={f.checkId} className="pt-3 first:pt-0 space-y-1">
                          <div className="flex items-start justify-between">
                            <span className="text-sm font-medium text-gray-900">{f.title}</span>
                            <button
                              onClick={() => onDismiss(f.checkId)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Dismiss
                            </button>
                          </div>
                          <p className="text-sm text-gray-600">{renderDetailText(f)}</p>
                          {renderAdvisoryExtras(f)}
                          {f.remedy && (
                            <p className="text-xs text-gray-500 italic">
                              <strong className="text-gray-700">What to check:</strong> {f.remedy}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Improve Your Output */}
              {advisoryFindings.some(f => f.category === "beautify") && (
                <div className="space-y-3 pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    Improve Your Output
                  </h4>
                  <div className="space-y-3 divide-y divide-gray-50">
                    {advisoryFindings
                      .filter(f => f.category === "beautify")
                      .map((f) => (
                        <div key={f.checkId} className="pt-3 first:pt-0 space-y-1">
                          <div className="flex items-start justify-between">
                            <span className="text-sm font-medium text-gray-900">{f.title}</span>
                            <button
                              onClick={() => onDismiss(f.checkId)}
                              className="text-xs text-gray-400 hover:text-gray-600"
                            >
                              Dismiss
                            </button>
                          </div>
                          <p className="text-sm text-gray-600">{renderDetailText(f)}</p>
                          {renderAdvisoryExtras(f)}
                          {f.remedy && (
                            <p className="text-xs text-blue-600">
                              <strong>What to check:</strong> {f.remedy}
                            </p>
                          )}
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
