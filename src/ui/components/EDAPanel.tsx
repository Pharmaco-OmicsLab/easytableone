import { useMemo, useState } from "react";
import type { AnalysisPlan, DataFrame, Schema, UserOverrides } from "../../core/types";
import { computeSchemaFingerprint, type EDAResults } from "../../core/eda/types";
import { buildCorrelationSpec, buildMissingnessSpec } from "../../core/eda/edaSpecBuilders";
import { getEffectiveJournalSettings } from "../../core/format/getEffectiveJournalSettings";
import { useStore } from "../../store";
import { pyodideClient } from "../../workers/pyodide.client";
import DecisionExplainer from "./DecisionExplainer";
import { VegaPlot } from "./VegaPlot";

const HIGH_MISSING_FRACTION = 0.20;

interface EDAPanelProps {
  data: DataFrame | null;
  schema: Schema | null;
  plan: AnalysisPlan | null;
  edaResults: EDAResults | null;
  setEdaResults: (results: EDAResults | null) => void;
  activeJournal: string;
  userOverrides?: UserOverrides;
  onGenerate?: () => Promise<EDAResults>;
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 text-left"
      >
        <span className="text-sm font-bold text-gray-900">{title}</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="p-4 space-y-4">{children}</div>}
    </div>
  );
}

export function EDAPanel({
  data,
  schema,
  plan,
  edaResults,
  setEdaResults,
  activeJournal,
  userOverrides,
  onGenerate,
}: EDAPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [isComputing, setIsComputing] = useState(false);
  const [isBivariateComputing, setIsBivariateComputing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftGroupingVariable = useStore((state) => state.draftGroupingVariable);
  const setDraftGroupingVariable = useStore((state) => state.setDraftGroupingVariable);

  const currentFingerprint = computeSchemaFingerprint(schema);
  const isStale = Boolean(edaResults && edaResults.schemaFingerprint !== currentFingerprint);
  const canGenerate = Boolean(data && schema);
  const groupingCandidates = useMemo(
    () =>
      schema?.columns.filter(
        (column) =>
          !column.exclusionReason &&
          ["binary", "categorical_nominal", "categorical_ordinal"].includes(column.confirmedType),
      ) ?? [],
    [schema],
  );
  const candidateNames = useMemo(() => new Set(groupingCandidates.map((column) => column.name)), [groupingCandidates]);
  const selectedGroupingVariable =
    (draftGroupingVariable && candidateNames.has(draftGroupingVariable) ? draftGroupingVariable : null) ??
    (plan?.groupingVariable && candidateNames.has(plan.groupingVariable) ? plan.groupingVariable : null);

  const missingVars = edaResults?.missingness.perVariable.filter((item) => item.missingPct > 0) ?? [];
  const highMissingVars = edaResults?.missingness.perVariable.filter((item) => item.missingPct / 100 > HIGH_MISSING_FRACTION) ?? [];
  const missingnessSpec = useMemo(
    () => buildMissingnessSpec(edaResults?.missingness.perVariable ?? []),
    [edaResults?.missingness.perVariable],
  );
  const correlationSpec = useMemo(
    () => edaResults
      ? buildCorrelationSpec(
          edaResults.correlations.pairs,
          edaResults.correlations.flagged,
          edaResults.correlations.variableOrder,
          schema,
        )
      : {},
    [edaResults, schema],
  );

  const handleGenerateEDA = async () => {
    if (!data || !schema) return;
    setIsComputing(true);
    setError(null);
    try {
      const result = onGenerate
        ? await onGenerate()
        : await pyodideClient.computeEDA(
            data,
            schema,
            getEffectiveJournalSettings(activeJournal, userOverrides).plot_theme,
            selectedGroupingVariable,
          );
      setEdaResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsComputing(false);
    }
  };

  const handleGroupingChange = async (selectedColumnName: string) => {
    if (!selectedColumnName) return;
    setDraftGroupingVariable(selectedColumnName);
    if (!data || !schema || !edaResults) return;

    setIsBivariateComputing(true);
    setError(null);
    try {
      const result = await pyodideClient.computeEDA(
        data,
        schema,
        getEffectiveJournalSettings(activeJournal, userOverrides).plot_theme,
        selectedColumnName,
      );
      setEdaResults(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBivariateComputing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden" data-testid="eda-panel">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 text-gray-800 hover:bg-gray-100 transition-colors"
      >
        <span className="font-bold text-sm">Exploratory Data Analysis</span>
        <span>{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="p-4 border-t border-gray-200 space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              Generate exploratory missingness, correlation, and grouping-variable plots for the active variable types.
            </p>
            <button
              type="button"
              onClick={handleGenerateEDA}
              disabled={!canGenerate || isComputing}
              className="px-4 py-2 rounded bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isComputing ? "Computing..." : edaResults ? "Regenerate EDA" : "Generate EDA"}
            </button>
          </div>

          {!canGenerate && <div className="text-sm text-gray-500">Upload a file to enable EDA.</div>}
          {error && <div className="p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">{error}</div>}
          {isStale && (
            <div className="p-3 rounded border border-amber-200 bg-amber-50 text-sm text-amber-800">
              Variable types have changed since EDA was generated. Click Regenerate to update.
            </div>
          )}

          {isComputing && <div className="text-sm text-blue-700" role="status">Computing EDA...</div>}

          {(edaResults || schema) && (
            <div className="space-y-4">
              {edaResults && (
                <>
                  <Section title="Missingness">
                    {missingVars.length > 0 ? (
                      <div className="min-h-72 pb-4" data-testid="missingness-chart">
                        <VegaPlot spec={missingnessSpec} />
                      </div>
                    ) : (
                      <div className="text-sm text-green-700">No missing values detected across all variables.</div>
                    )}
                    {highMissingVars.length > 0 && (
                      <ul className="space-y-1 text-sm text-amber-800">
                        {highMissingVars.map((item) => {
                          const label = item.displayLabel ?? item.name;
                          const pct = item.missingPct.toFixed(1);
                          const observed = (100 - item.missingPct).toFixed(1);
                          const moreThanHalf = item.missingPct >= 50;
                          return (
                            <li key={item.name}>
                              {moreThanHalf
                                ? `More than half of values are missing for ${label} (${pct}%); the statistics for this variable describe only the ${observed}% with data and should be interpreted with caution.`
                                : `${pct}% of values are missing for ${label}; the statistics for this variable describe only the ${observed}% with data and may not represent everyone.`}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {edaResults.missingness.indicatorCorrelations.length > 0 ? (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-900">Correlated missingness (r &gt;= 0.5)</h4>
                        <ul className="space-y-1 text-sm text-gray-700">
                          {edaResults.missingness.indicatorCorrelations.map((item) => (
                            <li key={`${item.colA}-${item.colB}`}>
                              {item.displayA} and {item.displayB}: r = {item.correlation.toFixed(2)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">No correlated missingness patterns detected.</div>
                    )}
                    {edaResults.missingness.mcar && (
                      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                        <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                          Missingness mechanism (Little&apos;s MCAR)
                          {edaResults.missingness.mcar.experimental && (
                            <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                              Experimental
                            </span>
                          )}
                        </h4>
                        <DecisionExplainer decisionId="qa.eda-mcar" context={{ schema, plan }} />
                        {edaResults.missingness.mcar.pValue === null || edaResults.missingness.mcar.statistic === null ? (
                          <p className="mt-2 text-gray-600">{edaResults.missingness.mcar.note}</p>
                        ) : (
                          <>
                            <p className="mt-2 font-semibold text-gray-900">
                              {edaResults.missingness.mcar.verdict === "consistent_with_mcar" ||
                              (edaResults.missingness.mcar.verdict === undefined && edaResults.missingness.mcar.pValue >= 0.05)
                                ? 'Missingness pattern is consistent with "completely at random" (approximate test)'
                                : 'Missingness pattern is not consistent with "completely at random" (approximate test)'}
                            </p>
                            <p className="mt-1 text-gray-600">
                              Chi-square = {edaResults.missingness.mcar.statistic.toFixed(2)}, df = {edaResults.missingness.mcar.df}, {edaResults.missingness.mcar.pValue < 0.001 ? "p < 0.001" : `p ≈ ${edaResults.missingness.mcar.pValue.toFixed(3)}`} across {edaResults.missingness.mcar.nPatterns} patterns.
                            </p>
                            <p className="mt-2 text-xs text-gray-500">
                              {edaResults.missingness.mcar.note}
                            </p>
                            {edaResults.missingness.mcar.approximationNote && (
                              <p className="mt-1 text-xs text-gray-500 italic">
                                {edaResults.missingness.mcar.approximationNote}
                              </p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {edaResults.missingness.heatmapPng && (
                      <img
                        src={`data:image/png;base64,${edaResults.missingness.heatmapPng}`}
                        alt="Sampled missingness heatmap"
                        className="max-h-80 w-full object-contain border border-gray-100 rounded"
                      />
                    )}
                  </Section>

                  <Section title="Correlations">
                    <DecisionExplainer decisionId="qa.eda-correlation" context={{ schema, plan }} />
                    {edaResults.correlations.nContinuous < 2 ? (
                      <div className="text-sm text-gray-600">Fewer than 2 continuous variables: correlation matrix not available.</div>
                    ) : (
                      <div className="overflow-x-auto overflow-y-visible">
                        <div
                          className="pb-8"
                          style={{ minHeight: `${Math.min(500, edaResults.correlations.variableOrder.length * 35 + 80) + 150}px` }}
                          data-testid="correlation-chart"
                        >
                          <VegaPlot spec={correlationSpec} />
                        </div>
                      </div>
                    )}
                    {edaResults.correlations.flagged.length > 0 ? (
                      <div className="space-y-2">
                        <h4 className="text-sm font-semibold text-gray-900">Highly correlated pairs (|r| &gt; 0.7)</h4>
                        <ul className="space-y-1 text-sm text-gray-700">
                          {edaResults.correlations.flagged.map((item) => (
                            <li key={`${item.colA}-${item.colB}`}>
                              {item.displayA} and {item.displayB}: r = {item.pearsonR.toFixed(2)}, rho = {item.spearmanRho.toFixed(2)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">No highly correlated continuous-variable pairs detected.</div>
                    )}
                  </Section>

                  <Section title="Multicollinearity" defaultOpen={false}>
                    <p className="text-sm text-gray-600">
                      Use this when you plan regression or machine-learning models; it is not required for a descriptive Table 1.
                    </p>
                    <DecisionExplainer decisionId="qa.eda-vif" context={{ schema, plan }} />
                    {edaResults.vif && edaResults.vif.length > 0 ? (
                      <div className="overflow-x-auto overflow-y-visible">
                        <table className="min-w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200 text-left text-gray-600">
                              <th className="py-2 pr-4 font-semibold">Variable</th>
                              <th className="py-2 pr-4 font-semibold">VIF</th>
                              <th className="py-2 pr-4 font-semibold">Flag</th>
                            </tr>
                          </thead>
                          <tbody>
                            {edaResults.vif.map((row) => (
                              <tr key={row.variable} className="border-b border-gray-100">
                                <td className="py-2 pr-4 text-gray-900">{row.displayLabel}</td>
                                <td className="py-2 pr-4 text-gray-700">{row.vif === null ? "Infinity" : row.vif.toFixed(2)}</td>
                                <td className="py-2 pr-4">
                                  <span className={
                                    row.severity === "high"
                                      ? "text-red-700 font-semibold"
                                      : row.severity === "elevated"
                                        ? "text-amber-700 font-semibold"
                                        : "text-green-700"
                                  }>
                                    {row.severity === "high" ? "> 10 high" : row.severity === "elevated" ? "> 5 elevated" : "OK"}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">VIF requires at least 2 complete continuous predictors.</div>
                    )}
                  </Section>

                  <Section title="Categorical Associations" defaultOpen={false}>
                    <DecisionExplainer decisionId="qa.eda-mosaic" context={{ schema, plan }} />
                    {edaResults.mosaic?.pairs.length ? (
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {edaResults.mosaic.pairs.map((pair) => (
                          <div key={`${pair.colA}-${pair.colB}`} className="border border-gray-200 rounded-lg p-3">
                            <div className="text-sm font-semibold text-gray-800 mb-2">
                              {pair.displayA} x {pair.displayB}
                            </div>
                            <img
                              src={`data:image/png;base64,${pair.png}`}
                              alt={`${pair.displayA} by ${pair.displayB} mosaic plot`}
                              className="max-h-44 w-full object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600">Mosaic plots require at least 2 categorical variables with observed levels.</div>
                    )}
                  </Section>
                </>
              )}

              <Section title="Bivariate Plots">
                <div className="space-y-4">
                  {groupingCandidates.length > 0 ? (
                    <div className="space-y-2">
                      <label htmlFor="eda-grouping-variable" className="block text-sm font-semibold text-gray-900">
                        Grouping variable
                      </label>
                      <select
                        id="eda-grouping-variable"
                        aria-label="Grouping variable"
                        value={selectedGroupingVariable ?? ""}
                        onChange={(event) => handleGroupingChange(event.target.value)}
                        disabled={isBivariateComputing}
                        className="w-full max-w-sm rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value="" disabled>
                          -- select a variable --
                        </option>
                        {groupingCandidates.map((column) => (
                          <option key={column.name} value={column.name}>
                            {column.displayLabel ?? column.label ?? column.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-sm text-gray-600">
                        Select a grouping variable to see how each variable is distributed across groups.
                      </p>
                      <p className="text-sm text-gray-600">This selection carries forward to Stage 6.</p>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-600">
                      Add categorical variables to your dataset to enable bivariate plots.
                    </div>
                  )}

                  {isBivariateComputing && (
                    <div className="text-sm text-blue-700" role="status">
                      Updating bivariate plots...
                    </div>
                  )}

                  {!edaResults || edaResults.bivariate === null ? (
                    groupingCandidates.length > 0 && selectedGroupingVariable ? (
                      <div className="text-sm text-gray-600">
                        Bivariate plots will appear after EDA finishes updating.
                      </div>
                    ) : null
                  ) : (
                    <div className="space-y-3">
                      <h4 className="text-sm font-semibold text-gray-900">
                        Bivariate distributions by {edaResults.bivariate.groupingDisplayLabel}
                      </h4>
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {edaResults.bivariate.plots.map((plot) => (
                          <div key={plot.variable} className="border border-gray-200 rounded-lg p-3">
                            <div className="text-sm font-semibold text-gray-800 mb-2">{plot.displayLabel}</div>
                            <img
                              src={`data:image/png;base64,${plot.png}`}
                              alt={`${plot.displayLabel} bivariate plot`}
                              className="max-h-44 w-full object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
