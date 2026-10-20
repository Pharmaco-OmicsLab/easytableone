import { useMemo, useState } from "react";
import { useStore } from "../../store";
import { getColumnDisplayLabel, resolveLevelLabel } from "../../core/format/columnLabel";
import { stripBracketCodes } from "../../core/format/tableTitle";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";
import { formatTable, journalRulesets } from "../../core/format/formatTable";
import { APP_VERSION } from "../../core/appVersion";
import { HtmlPreview } from "../../core/export/htmlPreview";
import { countTestedVariablesFromResults, getMtcAdvice } from "../../core/stats/mtcAdvice";
import { getBaselineTestingAdvice } from "../../core/stats/baselineTestingAdvice";
import { isFisherLike } from "../../core/format/testName";
import AboutThisStep from "../components/AboutThisStep";
import DecisionExplainer from "../components/DecisionExplainer";
import EmptyState from "../components/EmptyState";
import StepHeader from "../layout/StepHeader";
import StepActionBar from "../layout/StepActionBar";
import { DiagnosticThumbnail } from "../components/DiagnosticThumbnail";

export default function StatsPreviewStage() {
  const { stats, schema, plan, journalId, setStage, setModelingEnabled, setPlan, dataQualityRecords, qaReport } = useStore();
  const [baselineAdviceDismissed, setBaselineAdviceDismissed] = useState(false);
  const [selectedVariable, setSelectedVariable] = useState<string | null>(null);
  const [activeGlossary, setActiveGlossary] = useState<string | null>(null);
  const formattedTable = useMemo(() => {
    if (!stats || !plan || !schema) return null;
    try {
      return formatTable(stats, journalId, plan, schema, APP_VERSION, dataQualityRecords, qaReport);
    } catch (err) {
      console.error(err);
      return null;
    }
  }, [stats, journalId, plan, schema, dataQualityRecords, qaReport]);

  if (!stats) {
    return (
      <EmptyState
        title="No statistics available"
        reason="Statistics run after you confirm your analysis plan in Step 6."
        next="Go back to the analysis plan, choose the grouping variable and rows, then run statistics."
        action={{ label: "Go to Analysis Plan", onClick: () => setStage(6) }}
      />
    );
  }

  const ruleset = journalRulesets.EasyTableOne_Ruleset;
  const logic = ruleset.global_defaults.normality_logic;
  const mtcAdvice = plan ? getMtcAdvice(plan, countTestedVariablesFromResults(stats)) : null;
  const smdAvailable = stats.perVariable.some((v) => v.smd !== undefined && v.smd !== null);
  const baselineAdvice = plan && !baselineAdviceDismissed
    ? getBaselineTestingAdvice(plan, smdAvailable ? "computed" : "rerun_required")
    : null;

  const getDisplayVar = (name: string) => {
    const col = schema?.columns.find(c => c.name === name);
    return col ? getColumnDisplayLabel(col, 'stripped') : stripBracketCodes(name);
  };

  const getRationaleText = (v: any) => {
    const col = schema?.columns.find(c => c.name === v.variable);
    const isContinuous = col?.confirmedType === 'continuous' || v.overallSummary['mean'] !== undefined || v.overallSummary['median'] !== undefined;
    const isCategorical = col?.confirmedType === 'binary' || col?.confirmedType === 'categorical_nominal' || col?.confirmedType === 'categorical_ordinal' || v.overallSummary['counts'] !== undefined;
    const varDisplay = getDisplayVar(v.variable);

    if (v.test.name === 'None') {
      return `No statistical test was run for ${varDisplay}. ${v.notes.join('; ')}`;
    }

    if (isContinuous) {
      const isNormal = ["Welch's t-test", 'ANOVA'].includes(v.test.name);
      
      const alternative = stats.groups.length === 2
        ? (isNormal ? "Mann-Whitney U test" : "Welch's t-test")
        : (isNormal ? "Kruskal-Wallis test" : "one-way ANOVA");

      const normalityMethod = v.test.auxiliary?.normalityMethod;
      if (normalityMethod === "mixed") {
        return isNormal
          ? `${varDisplay} met the normality assumption using Shapiro-Wilk for groups with n <= ${logic.large_n_threshold_n} and skewness/kurtosis for groups with n > ${logic.large_n_threshold_n}, so the parametric ${v.test.name} was used. If the data had not been approximately normal, the non-parametric ${alternative} would apply.`
          : `${varDisplay} did not meet the normality assumption using Shapiro-Wilk for groups with n <= ${logic.large_n_threshold_n} and skewness/kurtosis for groups with n > ${logic.large_n_threshold_n}, so the non-parametric ${v.test.name} was used. If the data had been approximately normal, the parametric ${alternative} would apply.`;
      }
      if (normalityMethod === "skew_kurtosis") {
        return isNormal
          ? `${varDisplay} met the normality assumption (group skewness within ±${logic.large_n_skew_max} and excess kurtosis within ±${logic.large_n_kurt_max}), so the parametric ${v.test.name} was used. If the data had not been approximately normal, the non-parametric ${alternative} would apply.`
          : `${varDisplay} did not meet the normality assumption (group skewness outside ±${logic.large_n_skew_max} or excess kurtosis outside ±${logic.large_n_kurt_max}), so the non-parametric ${v.test.name} was used. If the data had been approximately normal, the parametric ${alternative} would apply.`;
      }
      return isNormal
        ? `${varDisplay} met the normality assumption (Shapiro–Wilk test p >= ${logic.small_n_threshold_p} for all groups), so the parametric ${v.test.name} was used. If the data had not been approximately normal, the non-parametric ${alternative} would apply.`
        : `${varDisplay} did not meet the normality assumption (Shapiro–Wilk test p < ${logic.small_n_threshold_p} in at least one group), so the non-parametric ${v.test.name} was used. If the data had been approximately normal, the parametric ${alternative} would apply.`;
    }

    if (isCategorical) {
      const isFisher = isFisherLike(v.test.name);
      const alternative = isFisher ? 'chi-square test' : "Fisher's exact test";
      if (isFisher && v.test.name.includes('Monte Carlo')) {
        return `Some expected cell counts were less than 5 and the table is larger than 2x2, so Fisher's exact test with seeded Monte-Carlo estimation was used. If expected cell counts had been 5 or more, the ${alternative} would apply.`;
      }
      if (isFisher) {
        return `Some expected cell counts were less than 5, so Fisher's exact test was used. If expected cell counts had been 5 or more, the ${alternative} would apply.`;
      } else {
        return `All expected cell counts were 5 or more, so the chi-square test was used. If expected cell counts had been less than 5, the ${alternative} would apply.`;
      }
    }

    return "";
  };

  const getDecisionBadge = (v: any) => v.test.name;

  const selectedResult = stats.perVariable.find((v) => v.variable === selectedVariable) ?? null;
  const journalName = ruleset.journals.find((journal) => journal.journal_id === (journalId || "NEJM"))?.display_name ?? "NEJM";
  const hasPValue = !plan?.userOverrides?.hidePValueColumn && stats.perVariable.some((v) => v.test.pValue !== null);
  const hasSmd = stats.perVariable.some((v) => v.smd !== undefined && v.smd !== null);
  const columnSet = hasPValue && hasSmd ? "P-value + SMD" : hasSmd ? "SMD only" : hasPValue ? "P-value" : "No comparison column";
  const selectedIsNumeric = selectedResult
    ? selectedResult.overallSummary.mean !== undefined || selectedResult.overallSummary.median !== undefined
    : false;
  const selectedColumn = selectedResult ? schema?.columns.find((column) => column.name === selectedResult.variable) : undefined;
  const shapiroRaw = selectedResult?.test.auxiliary?.shapiroPValue;
  const shapiroP = typeof shapiroRaw === "number" ? shapiroRaw : typeof shapiroRaw === "string" ? Number.parseFloat(shapiroRaw) : undefined;
  const shapiroCaption = shapiroP === undefined || Number.isNaN(shapiroP)
    ? "Shapiro-Wilk result not available for this variable."
    : `Shapiro-Wilk p = ${shapiroP < 0.001 ? "< 0.001" : shapiroP.toFixed(2)}`;
  const observedCounts = selectedResult && !selectedIsNumeric
    ? Object.keys(selectedResult.overallSummary.counts ?? {}).map((level) => ({
        level: resolveLevelLabel(level, selectedColumn),
        counts: stats.groups.map((group) => selectedResult.summaryByGroup[group.name]?.counts?.[level] ?? 0),
      }))
    : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-4">
      <AboutThisStep stage="stats" />
      <StepHeader n={5} eyebrow="STATISTICAL REVIEW" title="Statistical Review" lede="This is the table we computed. Each row shows which test was used and why. Open a row to see the diagnostics behind the choice." next="Modeling (optional) or Format & export" />

      {mtcAdvice && (
        <div className={`rounded-xl border p-4 text-sm ${
          mtcAdvice.severity === "strong"
            ? "border-red-200 bg-red-50 text-red-800 font-semibold"
            : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          {mtcAdvice.message}
          {mtcAdvice.severity === "strong" && (
            <span> For a baseline Table 1 of a randomized trial, see the note about omitting P-values below.</span>
          )}
        </div>
      )}

      {baselineAdvice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
          <p>{baselineAdvice.message.replaceAll("randomised", "randomized").replaceAll("Standardised", "Standardized").replaceAll("standardised", "standardized").replaceAll("P values", "P-values")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {baselineAdvice.smdState === "computed" && (
              <button
                type="button"
                onClick={() => {
                  if (!plan) return;
                  setPlan({
                    ...plan,
                    userOverrides: { ...(plan.userOverrides ?? {}), hidePValueColumn: true },
                  });
                }}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
              Show SMD, hide P-values
              </button>
            )}
            {baselineAdvice.smdState === "rerun_required" && (
              <button
                type="button"
                onClick={() => {
                  if (!plan) return;
                  setPlan({
                    ...plan,
                    showSMD: true,
                    userOverrides: { ...(plan.userOverrides ?? {}), hidePValueColumn: true },
                  });
                  setStage(6);
                }}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
              Switch on SMD and return to the Analysis Plan
              </button>
            )}
            <button
              type="button"
              onClick={() => setBaselineAdviceDismissed(true)}
              className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Keep P-values
            </button>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-[14px] border border-gray-200 bg-white shadow-sm" aria-label="Table 1 card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3.5">
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900">Table 1</h2>
            <p className="mt-1 text-xs text-gray-600">Formatted with {journalName} rules. Change the journal in Format &amp; export.</p>
          </div>
          <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{columnSet}</span>
        </div>
        <div className="overflow-auto p-4" tabIndex={0} role="region" aria-label="Table 1 preview">
          {formattedTable ? <HtmlPreview table={formattedTable} /> : <p className="text-sm text-gray-600">Table 1 preview is unavailable. Review the analysis plan and run statistics again.</p>}
        </div>
      </section>
      
      <div className="space-y-2" role="group" aria-label="Statistical glossary">
        <div className="flex flex-wrap gap-2">
          {[
            ["p", "P-value & 0.05 convention", "A P-value of 0.05 is a convention, not a boundary between true and false. Report exact values and interpret them with effect sizes."],
            ["parametric", "Parametric vs. non-parametric tests", "Parametric tests (t-test, ANOVA) assume roughly normal data; non-parametric tests (Mann-Whitney U, Kruskal-Wallis) use ranks."],
            ["chi", "Chi-square vs. Fisher's exact", "Chi-square needs adequate expected counts; Fisher's exact is exact for sparse tables."],
            ["smd", "Standardized Mean Difference (SMD)", "The size of a group difference in standard-deviation units, independent of sample size. Above 0.1 is conventionally considered imbalanced."],
          ].map(([id, label]) => (
            <button key={id} type="button" aria-pressed={activeGlossary === id} onClick={() => setActiveGlossary(activeGlossary === id ? null : id)} className={`rounded-full border px-3 py-1.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-blue-600 ${activeGlossary === id ? "border-blue-200 bg-blue-50 text-blue-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"}`}>
              {label}
            </button>
          ))}
        </div>
        {activeGlossary && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status">
            {activeGlossary === "p" && "A P-value of 0.05 is a convention, not a boundary between true and false. Report exact values and interpret them with effect sizes."}
            {activeGlossary === "parametric" && "Parametric tests (t-test, ANOVA) assume roughly normal data; non-parametric tests (Mann-Whitney U, Kruskal-Wallis) use ranks."}
            {activeGlossary === "chi" && "Chi-square needs adequate expected counts; Fisher's exact is exact for sparse tables."}
            {activeGlossary === "smd" && "The size of a group difference in standard-deviation units, independent of sample size. Above 0.1 is conventionally considered imbalanced."}
          </div>
        )}
      </div>

      {/* Diagnostics Panel Table */}
      <div className="space-y-2">
        <h3 className="text-lg font-semibold text-gray-900">Statistical Diagnostics</h3>
        <DiagnosticsPanel results={stats} schema={schema ?? undefined} groupingVariable={plan?.groupingVariable} journalId={journalId} selectedVariable={selectedVariable} onVariableSelect={setSelectedVariable} />
      </div>

      {selectedResult && (
        <section className="rounded-[14px] border border-gray-200 bg-white p-[18px] shadow-sm" aria-live="polite" aria-labelledby="decision-detail-title">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="decision-detail-title" className="text-base font-semibold text-gray-900">Decision detail · {getDisplayVar(selectedResult.variable)}</h2>
              <p className="mt-1 text-xs font-mono text-gray-600">{selectedResult.test.name} (stat = {selectedResult.test.statistic === null ? "—" : selectedResult.test.statistic.toFixed(2)}, P = {selectedResult.test.pValue === null ? "—" : selectedResult.test.pValue < 0.001 ? "<0.001" : selectedResult.test.pValue.toFixed(3)})</p>
            </div>
            <button type="button" onClick={() => setSelectedVariable(null)} className="rounded border border-gray-300 px-3 py-1 text-sm font-medium text-gray-700 hover:bg-gray-50">Close</button>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-gray-700">{getRationaleText(selectedResult)}</p>
          {selectedIsNumeric ? (
            <figure className="mt-4 rounded-[10px] border border-gray-200 p-2">
              <DiagnosticThumbnail variable={selectedColumn ?? { name: selectedResult.variable, inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" }} plotData={selectedResult.plotData} plotHeight={130} plotWidth={200} />
              <figcaption className="mt-2 text-xs text-gray-600">Histogram · {getDisplayVar(selectedResult.variable)} · Q-Q plot · {shapiroCaption}</figcaption>
            </figure>
          ) : observedCounts.length > 0 ? (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-2 text-xs font-medium text-gray-700">Observed counts by group</p>
              <table className="border-collapse font-mono text-xs" aria-label="Observed counts by group">
                <thead className="bg-gray-100"><tr><th className="border border-gray-200 px-2.5 py-1 text-left">Level</th>{stats.groups.map((group) => <th key={group.name} className="border border-gray-200 px-2.5 py-1 text-right">{getDisplayVar(group.name)}</th>)}</tr></thead>
                <tbody>{observedCounts.map((row) => <tr key={row.level}><th className="border border-gray-200 px-2.5 py-1 text-left font-normal">{row.level}</th>{row.counts.map((count, index) => <td key={`${row.level}-${index}`} className="border border-gray-200 px-2.5 py-1 text-right">{count}</td>)}</tr>)}</tbody>
              </table>
            </div>
          ) : null}
        </section>
      )}

      {/* Per-Variable Test Choice Rationale */}
      <div className="rounded-[14px] border border-gray-200 bg-white p-[18px] shadow-sm space-y-4">
        <h3 className="text-[14.5px] font-semibold text-gray-900">Test Selection Rationale</h3>
        <div className="space-y-4">
          {stats.perVariable.map((v) => {
            const varDisplay = getDisplayVar(v.variable);
            const pFormatted = v.test.pValue === null ? '—' : v.test.pValue < 0.001 ? '<0.001' : v.test.pValue.toFixed(3);
            const statFormatted = v.test.statistic === null ? '—' : v.test.statistic.toFixed(2);
            return (
              <div key={v.variable} className="border-t border-gray-200 py-3 space-y-1">
                <div className="flex items-baseline justify-between">
                  <h4 className="font-semibold text-gray-800">{varDisplay}</h4>
                  <span className="text-xs text-gray-600 font-mono">
                    {v.test.name} (stat={statFormatted}, p={pFormatted})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-px text-[11px] font-semibold text-blue-800">
                    {getDecisionBadge(v)}
                  </span>
                </div>
                <details className="text-sm text-gray-600">
                  <summary className="cursor-pointer select-none font-medium text-gray-700">Decision detail</summary>
                  <p className="pt-1 leading-relaxed">{getRationaleText(v)}</p>
                </details>
                <DecisionExplainer
                  decisionId={`stats.test-selection.${v.variable}`}
                  label="Why this test?"
                  context={{ stats, schema, plan }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <StepActionBar
        onBack={() => setStage(6)}
        backLabel="Back to Analysis plan"
        status={{ tone: "ok", text: `Table 1 computed · ${stats.perVariable.length} rows` }}
        secondary={{ label: "Enable Modeling", testId: "enable-modeling", onClick: () => { setModelingEnabled(true); setStage(8); } }}
        primary={{ label: "Continue to Format and export", onClick: () => setStage(9), testId: "stats-continue-format-export" }}
      />
    </div>
  );
}
