import { useState, useEffect } from "react";
import type { OutlierAction, DataQualityRecord, DataQualityFinding } from "../../core/types";
import { useStore } from "../../store";
import { resolveTreatAsMissing, resolveAddAsLevels } from "../../core/qa/dictionaryComplianceResolvers";
import { DataQualityGatePanel } from "../components/DataQualityGatePanel";
import { PolishAdvisorPanel } from "../components/PolishAdvisorPanel";
import { EDAPanel } from "../components/EDAPanel";
import { runChecks, type CheckContext, type WorkbookMeta } from "../../core/qa/checkRegistry";
import AboutThisStep from "../components/AboutThisStep";
import DecisionExplainer from "../components/DecisionExplainer";
import GlossaryTerm from "../components/GlossaryTerm";
import { TABLE1_MISSING_DATA_SIGNPOST } from "../../core/education/educationContent";

export default function QAStage() {
  const {
    qaReport,
    setStage,
    outlierActions,
    setOutlierAction,
    data,
    schema,
    setData,
    setSchema,
    auditLog,
    setAuditLog,
    sheets,
    dataQualityFindings,
    setDataQualityFindings,
    setDataQualityRecords,
    plan,
    draftGroupingVariable,
    edaResults,
    setEdaResults,
    journalId,
    clearDismissedPolishFindings,
    setOrdinalReorderFocusColumn,
    setTutorialOpen,
    researchPopulation,
    unitSystem,
  } = useStore();

  const [complianceResolutions, setComplianceResolutions] = useState<Record<string, 'unresolved' | 'reupload_pending' | 'treat_as_missing' | 'levels_added'>>({});
  const [newLabelInputs, setNewLabelInputs] = useState<Record<string, Record<string, string>>>({});
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());
  const [acknowledgeReasons, setAcknowledgeReasons] = useState<Record<string, string>>({});
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const [detailsToggled, setDetailsToggled] = useState(false);

  // Run checks on mount / when schema or data changes
  useEffect(() => {
    if (schema && data) {
      const workbook: WorkbookMeta = {
        sheetNames: sheets.map(s => s.name),
      };
      const ctx: CheckContext = { schema, data, workbook, researchPopulation, unitSystem };
      const findings = runChecks("data-review", ctx);
      setDataQualityFindings(findings);
    }
  }, [schema, data, sheets, setDataQualityFindings, researchPopulation, unitSystem]);

  // Clear dismissed polish findings when entering Stage 5 (re-surfaced on Stage 5 re-entry)
  useEffect(() => {
    clearDismissedPolishFindings();
    setOrdinalReorderFocusColumn(null);
  }, [clearDismissedPolishFindings, setOrdinalReorderFocusColumn]);

  const complianceError = qaReport?.blockingErrors.find((e) => e.kind === "dictionary_compliance");
  const complianceViolations = (qaReport?.columns ?? [])
    .filter((c) => c.dictionaryViolations)
    .map((c) => ({ ...c.dictionaryViolations!, columnName: c.name }));

  // Determine if compliance is fully resolved
  const allComplianceResolved = complianceViolations.length === 0 || complianceViolations.every(
    (v) => (complianceResolutions[v.columnName] ?? v.resolutionStatus) !== 'unresolved'
  );

  const detailsHasContent = !!qaReport && Boolean(
    qaReport.columns.length > 0 ||
    qaReport.blockingErrors.length > 0 ||
    (complianceError && !allComplianceResolved)
  );

  useEffect(() => {
    if (!detailsToggled) {
      setDetailsExpanded(detailsHasContent);
    }
  }, [detailsHasContent, detailsToggled]);

  if (!qaReport) return <div>No QA report available.</div>;



  function applyTreatAsMissing(columnName: string) {
    if (!data || !schema) return;
    const violation = complianceViolations.find((v) => v.columnName === columnName);
    if (!violation) return;
    const undeclaredValues = violation.undeclaredValues.map((u) => u.value);
    const log = [...(auditLog ?? [])];
    const newData = resolveTreatAsMissing(data, columnName, undeclaredValues, log);
    setData(newData);
    setAuditLog?.(log);
    setComplianceResolutions((prev) => ({ ...prev, [columnName]: 'treat_as_missing' }));
  }

  function applyAddAsLevels(columnName: string) {
    if (!schema) return;
    const violation = complianceViolations.find((v) => v.columnName === columnName);
    if (!violation) return;
    const labels = newLabelInputs[columnName] ?? {};
    const newLevels = violation.undeclaredValues.map((u) => ({
      code: u.value,
      label: labels[String(u.value)] || String(u.value),
    }));
    const log = [...(auditLog ?? [])];
    const newSchema = resolveAddAsLevels(schema, columnName, newLevels, log);
    setSchema(newSchema);
    setAuditLog?.(log);
    setComplianceResolutions((prev) => ({ ...prev, [columnName]: 'levels_added' }));
  }

  function handleReupload(columnName: string) {
    setComplianceResolutions((prev) => ({ ...prev, [columnName]: 'reupload_pending' }));
    setStage(1);
  }

  // Prepend compliance violations to dataQualityFindings for UI grouping
  const displayFindings: DataQualityFinding[] = [...dataQualityFindings];
  if (complianceError && !allComplianceResolved) {
    displayFindings.push({
      checkId: "dictionary_compliance",
      tier: "blocking",
      category: "format",
      title: "Dictionary Compliance Violations",
      detail: "Some columns contain values that are not declared in the data dictionary.",
      requirement: "All undeclared values must be resolved before proceeding.",
      remedy: "Please resolve the violations in the compliance check panel below.",
    });
  }

  const blockingFindings = displayFindings.filter((f) => f.tier === "blocking");
  const reviewFindings = displayFindings.filter((f) => f.tier === "review");
  const hasBlocking = blockingFindings.length > 0;
  const hasUnacknowledgedReview = reviewFindings.some((f) => !acknowledgedIds.has(f.checkId));

  const handleProceed = () => {
    // Commit Stage 5 findings to records
    const committed = dataQualityFindings.map((f) => {
      let response: DataQualityRecord["response"] = "acknowledged";
      if (f.tier === "review") {
        response = acknowledgedIds.has(f.checkId) ? "acknowledged" : "overridden";
      } else if (f.tier === "advisory") {
        response = dismissedIds.has(f.checkId) ? "dismissed" : "acknowledged";
      } else if (f.tier === "blocking") {
        response = "fixed";
      }
      return {
        finding: f,
        response,
        timestamp: new Date().toISOString(),
        ...(acknowledgeReasons[f.checkId]?.trim() ? { fixDetails: acknowledgeReasons[f.checkId].trim() } : {}),
      };
    });
    setDataQualityRecords(committed);
    const reasonEntries = committed
      .filter((record) => record.response === "acknowledged" && record.fixDetails)
      .map((record) => ({
        timestamp: record.timestamp,
        action: "data_quality_acknowledged",
        details: {
          checkId: record.finding.checkId,
          reason: record.fixDetails ?? "",
        },
      }));
    if (reasonEntries.length > 0) {
      setAuditLog?.([...(auditLog ?? []), ...reasonEntries]);
    }
    clearDismissedPolishFindings();
    setOrdinalReorderFocusColumn(null);
    setStage(6);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <AboutThisStep stage="qa" />
      <div className="grid gap-3 md:grid-cols-2">
        <DecisionExplainer decisionId="qa.gates" label="Why these data-quality gates?" context={{ schema, plan }} />
        <DecisionExplainer decisionId="qa.sanity-bounds" label="Why these sanity-range checks?" context={{ schema, plan }} />
      </div>
      <p aria-label={TABLE1_MISSING_DATA_SIGNPOST} className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Table 1 summarizes the values actually recorded (<GlossaryTerm term="available-case" /> per variable). It does not fill in missing values. If you want a <GlossaryTerm term="complete-case" /> or multiple-<GlossaryTerm term="imputation" /> analysis, choose it in the Modeling step.
      </p>
      {/* Data Quality Gate Panel */}
      <DataQualityGatePanel
        findings={displayFindings}
        acknowledgedIds={acknowledgedIds}
        acknowledgeReasons={acknowledgeReasons}
        onAcknowledgeReasonChange={(id, reason) => setAcknowledgeReasons(prev => ({ ...prev, [id]: reason }))}
        dismissedIds={dismissedIds}
        onAcknowledge={(id) => setAcknowledgedIds(prev => new Set([...prev, id]))}
        onDismiss={(id) => setDismissedIds(prev => new Set([...prev, id]))}
        onReupload={() => setStage(1)}
        onOpenTutorial={() => setTutorialOpen(true)}
      />

      {/* Polish Advisor Panel */}
      <PolishAdvisorPanel />

      <p className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Run EDA if you want missingness and correlation checks before finalizing - optional for a descriptive Table 1.
      </p>

      <EDAPanel
        data={data}
        schema={schema}
        plan={plan ?? (draftGroupingVariable ? { groupingVariable: draftGroupingVariable } as any : null)}
        edaResults={edaResults}
        setEdaResults={setEdaResults}
        activeJournal={journalId}
        userOverrides={plan?.userOverrides}
      />

      {/* Collapsible Details */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <button
          onClick={() => {
            setDetailsToggled(true);
            setDetailsExpanded(!detailsExpanded);
          }}
          className="w-full flex items-center justify-between p-4 bg-gray-50 text-gray-800 hover:bg-gray-100 transition-colors"
        >
          <span className="font-bold text-sm">QA / QC Details</span>
          <span>{detailsExpanded ? "▲" : "▼"}</span>
        </button>

        {detailsExpanded && (
          <div className="p-4 border-t border-gray-200 space-y-6">
            {/* D33: Dictionary Compliance Modal */}
            {complianceError && !allComplianceResolved && (
              <div className="mb-8 border-2 border-amber-400 rounded-xl bg-amber-50 shadow-lg">
                <div className="flex items-center gap-3 px-6 py-4 bg-amber-400 rounded-t-xl">
                  <span className="text-2xl">⚠️</span>
                  <h3 className="text-lg font-bold text-amber-900">Data Dictionary Compliance Check</h3>
                </div>
                <div className="px-6 py-4">
                  <p className="text-amber-800 mb-4">
                    Some columns contain values that are not declared in your data dictionary.
                    This usually indicates a data-entry error. Please resolve each column below before continuing.
                  </p>

                  <div className="space-y-4">
                    {complianceViolations.map((v) => {
                      const resolution = complianceResolutions[v.columnName] ?? 'unresolved';
                      const isResolved = resolution !== 'unresolved';
                      const labelsForCol = newLabelInputs[v.columnName] ?? {};

                      return (
                        <div key={v.columnName} className={`border rounded-lg p-4 ${isResolved ? 'border-green-300 bg-green-50' : 'border-amber-200 bg-white'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-semibold text-gray-800">{v.columnName}</h4>
                            {isResolved && (
                              <span className="text-green-600 text-sm font-medium">
                                ✓ {resolution === 'treat_as_missing' ? 'Treated as missing' : resolution === 'levels_added' ? 'Added as levels' : 'Re-upload pending'}
                              </span>
                            )}
                          </div>

                          {!isResolved && (
                            <>
                              <p className="text-sm text-gray-600 mb-1">
                                <strong>Dictionary declares:</strong> {v.declaredCodes.join(', ')}
                              </p>
                              <p className="text-sm text-gray-600 mb-3">
                                Found <strong>{v.undeclaredValues.length}</strong> undeclared value(s):
                              </p>
                              <ul className="text-sm text-red-700 mb-4 space-y-1">
                                {v.undeclaredValues.map((u) => {
                                  const displayRows = u.rowIndices.slice(0, 10).map((r) => r + 2).join(', ');
                                  const extra = u.rowIndices.length > 10 ? ` and ${u.rowIndices.length - 10} more` : '';
                                  return (
                                    <li key={String(u.value)} className="flex items-start gap-2">
                                      <span className="text-red-500">•</span>
                                      <span>
                                        Value <strong>"{u.value}"</strong> appears in {u.count} row(s)
                                        (rows {displayRows}{extra})
                                      </span>
                                    </li>
                                  );
                                })}
                              </ul>

                              {/* Label inputs for add-as-level */}
                              <div className="mb-3 space-y-1">
                                {v.undeclaredValues.map((u) => (
                                  <div key={String(u.value)} className="flex items-center gap-2 text-sm">
                                    <span className="text-gray-500 w-32">Label for "{u.value}":</span>
                                    <input
                                      type="text"
                                      className="border rounded px-2 py-1 text-sm flex-1"
                                      placeholder={`Label for value "${u.value}"`}
                                      value={labelsForCol[String(u.value)] ?? ''}
                                      onChange={(e) => setNewLabelInputs((prev) => ({
                                        ...prev,
                                        [v.columnName]: { ...(prev[v.columnName] ?? {}), [String(u.value)]: e.target.value }
                                      }))}
                                    />
                                  </div>
                                ))}
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <button
                                  onClick={() => applyTreatAsMissing(v.columnName)}
                                  className="px-3 py-1.5 text-sm bg-yellow-100 border border-yellow-300 text-yellow-800 rounded hover:bg-yellow-200"
                                >
                                  Treat as missing for this column
                                </button>
                                <button
                                  onClick={() => applyAddAsLevels(v.columnName)}
                                  className="px-3 py-1.5 text-sm bg-blue-100 border border-blue-300 text-blue-800 rounded hover:bg-blue-200"
                                >
                                  Add as new level(s)
                                </button>
                                <button
                                  onClick={() => handleReupload(v.columnName)}
                                  className="px-3 py-1.5 text-sm bg-gray-100 border border-gray-300 text-gray-700 rounded hover:bg-gray-200"
                                >
                                  Cancel &amp; Re-upload Data
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {!allComplianceResolved && (
                    <p className="text-amber-700 text-sm mt-4 font-medium">
                      ⛔ Continue button is disabled until every column above has a resolution.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white shadow rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Column
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Missing
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Cardinality
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Outliers (IQR)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Flags
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {qaReport.columns.map((col) => (
                    <tr key={col.name} className={col.dictionaryViolations ? 'bg-amber-50' : ''}>
                      <td className="px-4 py-3 font-medium text-sm text-gray-900">
                        {col.name}
                        {col.dictionaryViolations && (
                          <span className="ml-2 text-xs text-amber-600">⚠ dict violation</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {col.missingCount > 0 ? (
                          <span className="text-yellow-600">
                            {col.missingCount} ({col.missingPercent.toFixed(1)}%)
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{col.cardinality}</td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {col.outliers ? (
                          <div className="max-h-32 overflow-y-auto pr-2">
                            <div className="font-medium text-xs mb-1">
                              {col.outliers.values.length} detected
                            </div>
                            {col.outliers.values.slice(0, 50).map((v, idx) => {
                              const rIdx = col.outliers?.rowIndices[idx] ?? -1;
                              const acts = outlierActions[col.name] || [];
                              const act = acts.find((a) => a.rowIndex === rIdx)?.action || "keep";
                              return (
                                <div
                                  key={rIdx}
                                  className="flex items-center justify-between py-1 text-xs border-b border-gray-100 last:border-0"
                                >
                                  <span>
                                    Row {rIdx}: <strong className="text-red-500">{v}</strong>
                                  </span>
                                  <select
                                    className="ml-2 border rounded p-1 text-xs"
                                    value={act}
                                    onChange={(e) =>
                                      setOutlierAction(col.name, {
                                        rowIndex: rIdx,
                                        action: e.target.value as OutlierAction["action"],
                                        winsorizeBound: "p01_p99",
                                      })
                                    }
                                  >
                                    <option value="keep">Keep</option>
                                    <option value="exclude">Exclude</option>
                                    <option value="winsorize">Winsorize</option>
                                  </select>
                                </div>
                              );
                            })}
                            {col.outliers.values.length > 50 && (
                              <div className="text-xs text-gray-400 mt-1">
                                ...and {col.outliers.values.length - 50} more
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {col.isConstant && <span className="text-red-500 block">Constant Value</span>}
                        {col.flags.map((f) => (
                          <span key={f.type} className="block text-yellow-600">
                            {f.message}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* BOTTOM ACTION BUTTONS */}
      <div className="flex items-center justify-between border-t border-gray-100 pt-6">
        <button
          onClick={() => setStage(4)}
          className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Go back to Variable types
        </button>

        {hasBlocking ? (
          <div className="flex items-center space-x-2">
            <span className="text-xs text-red-600 font-semibold">
              Resolve blocking issues to proceed
            </span>
            <button
              disabled
              className="px-6 py-2 bg-gray-300 text-gray-500 rounded cursor-not-allowed font-medium"
            >
              Acknowledge all and proceed
            </button>
          </div>
        ) : hasUnacknowledgedReview ? (
          <button
            onClick={() => {
              const reviewIds = displayFindings.filter(f => f.tier === "review").map(f => f.checkId);
              setAcknowledgedIds(new Set([...acknowledgedIds, ...reviewIds]));
            }}
            className="px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded font-medium transition-colors"
          >
            I acknowledge these issues and want to proceed
          </button>
        ) : (
          <button
            onClick={handleProceed}
            data-testid="qa-proceed"
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-medium transition-colors"
          >
            Proceed
          </button>
        )}
      </div>
    </div>
  );
}
