import { useState, useEffect } from "react";
import type { DataQualityRecord, DataQualityFinding } from "../../core/types";
import { useStore } from "../../store";
import { resolveTreatAsMissing, resolveAddAsLevels } from "../../core/qa/dictionaryComplianceResolvers";
import { DataQualityGatePanel } from "../components/DataQualityGatePanel";
import { PolishAdvisorPanel } from "../components/PolishAdvisorPanel";
import { EDAPanel } from "../components/EDAPanel";
import { runChecks, type CheckContext, type WorkbookMeta } from "../../core/qa/checkRegistry";
import DecisionExplainer from "../components/DecisionExplainer";
import GlossaryTerm from "../components/GlossaryTerm";
import { TABLE1_MISSING_DATA_SIGNPOST } from "../../core/education/educationContent";
import StepHeader from "../layout/StepHeader";
import StepActionBar from "../layout/StepActionBar";
import { useToast } from "../layout/Toast";

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
    dataQualityRecords,
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
  const toast = useToast();

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
    toast("Resolution applied and logged in analysis history");
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
    toast("Resolution applied and logged in analysis history");
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
  const gateReason = hasBlocking
    ? `${blockingFindings.length} blocking issue${blockingFindings.length === 1 ? "" : "s"} must be resolved`
    : complianceError && !allComplianceResolved
      ? "1 blocking issue must be resolved"
      : undefined;

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
    const preserved = dataQualityRecords.filter((r) => r.response === "applied");
    const recordMap = new Map<string, DataQualityRecord>();
    for (const r of [...preserved, ...committed]) {
      recordMap.delete(r.finding.checkId);
      recordMap.set(r.finding.checkId, r);
    }
    setDataQualityRecords(Array.from(recordMap.values()));
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
    <div className="mx-auto max-w-7xl space-y-5">
      <StepHeader n={3} eyebrow="DATA CHECKS" title="Check data quality" lede="We scan for blocking errors, items to review, and advisories. Nothing is changed unless you choose to act." next="Analysis plan" />
      <div className="grid gap-3 md:grid-cols-2">
        <DecisionExplainer decisionId="qa.gates" label="Why these data-quality gates?" context={{ schema, plan }} />
        <DecisionExplainer decisionId="qa.sanity-bounds" label="Why these sanity-range checks?" context={{ schema, plan }} />
      </div>
      <p aria-label={TABLE1_MISSING_DATA_SIGNPOST} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Table 1 summarizes the values actually recorded (<GlossaryTerm term="available-case" /> per variable). It does not fill in missing values. If you want a <GlossaryTerm term="complete-case" /> or multiple-<GlossaryTerm term="imputation" /> analysis, choose it in the Modeling step.
      </p>
      {researchPopulation === "other" && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Plausibility checks are off. You chose “Other / non-human” in Step 1, so human bound checks are not run. Edit study settings in Step 1 to change this.</p>}
      <div className="grid gap-4 min-[1181px]:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
      <DataQualityGatePanel
        findings={displayFindings}
        acknowledgedIds={acknowledgedIds}
        acknowledgeReasons={acknowledgeReasons}
        onAcknowledgeReasonChange={(id, reason) => setAcknowledgeReasons(prev => ({ ...prev, [id]: reason }))}
        dismissedIds={dismissedIds}
        onAcknowledge={(id, acknowledged) => setAcknowledgedIds((prev) => { const next = new Set(prev); if (acknowledged) next.add(id); else next.delete(id); return next; })}
        onDismiss={(id) => setDismissedIds(prev => new Set([...prev, id]))}
        onReupload={() => setStage(1)}
        onGoToVariableTypes={() => setStage(4)}
        onOpenTutorial={() => setTutorialOpen(true)}
      />

      <p className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Run EDA if you want missingness and correlation checks before finalizing - optional for a descriptive Table 1.
      </p>

      {/* Collapsible Details */}
      <div className="rounded-[14px] border border-gray-200 bg-white shadow-sm overflow-hidden">
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
              <div className="mb-5 rounded-[14px] border border-red-200 bg-red-50 shadow-sm">
                <div className="flex items-center gap-3 rounded-t-[14px] bg-red-100 px-5 py-4">
                  <span className="text-2xl">⚠️</span>
                  <h3 className="text-base font-bold text-red-900">Dictionary Compliance Violations</h3>
                </div>
                <div className="px-6 py-4">
                  <p className="text-sm text-red-800 mb-4">
                    Some columns contain values that are not declared in the data dictionary. All undeclared values must be resolved before proceeding.
                  </p>

                  <div className="space-y-4">
                    {complianceViolations.map((v) => {
                      const resolution = complianceResolutions[v.columnName] ?? 'unresolved';
                      const isResolved = resolution !== 'unresolved';
                      const labelsForCol = newLabelInputs[v.columnName] ?? {};

                      return (
                        <div key={v.columnName} className={`border rounded-xl p-4 ${isResolved ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
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
                                      aria-label={`Display label for ${String(u.value)}`}
                                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-[13px] flex-1"
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
                                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                >
                                  Treat as missing for this column
                                </button>
                                <button
                                  onClick={() => applyAddAsLevels(v.columnName)}
                                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
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

            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
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
                                  <div role="group" aria-label={`Outlier handling for ${col.name}, row ${rIdx}`} className="ml-2 flex shrink-0 gap-1">
                                    {(["keep", "exclude", "winsorize"] as const).map((choice) => <button key={choice} type="button" aria-label={`${choice === "keep" ? "Keep" : choice === "exclude" ? "Exclude" : "Winsorize"} ${col.name} row ${rIdx}`} aria-pressed={act === choice} onClick={() => { if (act === choice) return; setOutlierAction(col.name, { rowIndex: rIdx, action: choice, winsorizeBound: "p01_p99" }); toast("Outlier choice logged in analysis history"); }} className={`rounded-lg border px-2.5 py-[3px] text-xs ${act === choice ? "border-blue-600 bg-blue-50 font-semibold text-blue-600" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}>{choice === "keep" ? "Keep" : choice === "exclude" ? "Exclude" : "Winsorize"}</button>)}
                                  </div>
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
      </div>
      <aside className="space-y-4">
        <PolishAdvisorPanel />
        <EDAPanel data={data} schema={schema} plan={plan ?? (draftGroupingVariable ? { groupingVariable: draftGroupingVariable } as any : null)} edaResults={edaResults} setEdaResults={setEdaResults} activeJournal={journalId} userOverrides={plan?.userOverrides} />
      </aside>
      </div>
      <StepActionBar onBack={() => setStage(4)} backLabel="Back" status={gateReason ? { tone: "error", text: gateReason } : hasUnacknowledgedReview ? { tone: "warn", text: `${reviewFindings.filter((f) => !acknowledgedIds.has(f.checkId)).length} review item(s) to acknowledge` } : { tone: "ok", text: "All issues resolved or acknowledged" }} primary={gateReason ? { label: "Proceed to Analysis plan", testId: "qa-proceed", onClick: handleProceed, disabledReason: gateReason } : hasUnacknowledgedReview ? { label: "I acknowledge these issues and want to proceed", onClick: () => { const reviewIds = reviewFindings.map((f) => f.checkId); setAcknowledgedIds(new Set([...acknowledgedIds, ...reviewIds])); } } : { label: "Proceed to Analysis plan", testId: "qa-proceed", onClick: handleProceed }} />
    </div>
  );
}
