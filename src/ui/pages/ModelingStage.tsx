import { useEffect, useMemo, useState } from "react";
import { computeModelingFingerprint, defaultModelingSetup, isEligibleModelingOutcome, type ModelingRegime, type ModelingSetup } from "../../core/modeling/types";
import { estimateModelingRuntime } from "../../core/modeling/runtimeEstimate";
import type { Schema } from "../../core/types";
import { LARGE_N_CONFIRM_THRESHOLD, describeLargeNConfirm } from "../../core/performance/largeDatasetGuardrails";
import { TRIPOD_AI_MAPPING, TRIPOD_AI_REPORTING_HEADER } from "../../core/modeling/tripodMapping";
import { useStore } from "../../store";
import { pyodideClient } from "../../workers/pyodide.client";
import LogisticRegressionTab from "../components/LogisticRegressionTab";
import MachineLearningTab from "../components/MachineLearningTab";
import ModelingSetupHeader from "../components/ModelingSetupHeader";
import AboutThisStep from "../components/AboutThisStep";
import StepHeader from "../layout/StepHeader";
import StepActionBar from "../layout/StepActionBar";

function predictorExpansion(schema: Schema, predictors: string[]) {
  return predictors.reduce((sum, name) => {
    const col = schema.columns.find((c) => c.name === name);
    if (!col) return sum;
    if (["binary", "categorical_nominal", "categorical_ordinal"].includes(col.confirmedType)) {
      return sum + Math.max(1, (col.levels?.length ?? 2) - 1);
    }
    return sum + 1;
  }, 0);
}

function TripodAiReportingPanel() {
  return (
    <details className="mt-6 rounded border border-gray-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-gray-900">
        TRIPOD+AI reporting
      </summary>
      <div className="border-t border-gray-200 px-4 py-4">
        <p className="text-sm text-gray-700">{TRIPOD_AI_REPORTING_HEADER}</p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Item</th>
                <th className="px-3 py-2">Ownership</th>
                <th className="px-3 py-2">What is reported</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {TRIPOD_AI_MAPPING.map((row) => (
                <tr key={`${row.item}-${row.label}`}>
                  <td className="px-3 py-2 font-medium text-gray-800">{row.item} - {row.label}</td>
                  <td className="px-3 py-2 text-gray-700">{row.status === "supported" ? "Supported by app output" : "Author-owned / planned"}</td>
                  <td className="px-3 py-2 text-gray-700">{row.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

export default function ModelingStage() {
  const {
    data,
    schema,
    plan,
    modelingSetup,
    setModelingSetup,
    modelingResults,
    setModelingResults,
    setStage,
  } = useStore();
  const [regime, setRegime] = useState<ModelingRegime | null>(modelingResults?.logistic?.regime ?? null);
  const [activeTab, setActiveTab] = useState<"logistic" | "ml">("logistic");
  const [running, setRunning] = useState(false);
  const [mlRunning, setMlRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mlError, setMlError] = useState<string | null>(null);
  const [largeNAcknowledged, setLargeNAcknowledged] = useState(false);

  const fallbackSetup = useMemo(
    () => (schema ? defaultModelingSetup(schema, plan?.groupingVariable, plan?.randomSeed, data) : null),
    [data, schema, plan?.groupingVariable, plan?.randomSeed],
  );

  const isSetupCurrent = (setup: ModelingSetup | null): setup is ModelingSetup => {
    if (!setup || !schema) return false;
    if (!isEligibleModelingOutcome(schema, setup.outcome, data)) return false;
    const validPredictors = new Set(
      schema.columns
        .filter((c) => !c.exclusionReason && c.name !== setup.outcome && !["id_like", "date", "unsupported"].includes(c.confirmedType))
        .map((c) => c.name),
    );
    return setup.predictors.every((predictor) => validPredictors.has(predictor));
  };

  useEffect(() => {
    if (fallbackSetup && !isSetupCurrent(modelingSetup)) {
      setModelingSetup(fallbackSetup);
      setError(null);
      setMlError(null);
    }
  }, [fallbackSetup, modelingSetup, setModelingSetup]);

  useEffect(() => {
    setLargeNAcknowledged(false);
  }, [data]);

  if (!data || !schema) {
    return <div>No data available for modeling.</div>;
  }

  const setup = isSetupCurrent(modelingSetup) ? modelingSetup : fallbackSetup ?? defaultModelingSetup(schema, plan?.groupingVariable, plan?.randomSeed, data);
  const isVeryLargeDataset = data.rows.length > LARGE_N_CONFIRM_THRESHOLD;
  const confirmedLargeRun = !isVeryLargeDataset || largeNAcknowledged;
  const runtimeEstimate = estimateModelingRuntime(setup, data.rows.length, predictorExpansion(schema, setup.predictors));

  const run = async () => {
    if (!setup.outcome || setup.predictors.length === 0) {
      setError("Choose a two-group outcome and at least one candidate predictor before running logistic regression.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const logistic = await pyodideClient.fitLogisticModel(data, schema, setup);
      const resultSetup = logistic.model !== setup.model ? { ...setup, model: logistic.model } : setup;
      setRegime(logistic.regime);
      if (resultSetup !== setup) {
        setModelingSetup(resultSetup);
      }
      setModelingResults({
        schemaFingerprint: computeModelingFingerprint(data, schema),
        setup: resultSetup,
        logistic,
        ml: modelingResults?.ml ?? null,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err?.message ?? String(err));
    } finally {
      setRunning(false);
    }
  };

  const runMl = async () => {
    if (!setup.outcome || setup.predictors.length === 0) {
      setMlError("Choose a two-group outcome and at least one candidate predictor before running the benchmark.");
      return;
    }
    setMlRunning(true);
    setMlError(null);
    try {
      const ml = await pyodideClient.runMlBenchmark(data, schema, setup);
      setModelingResults({
        schemaFingerprint: computeModelingFingerprint(data, schema),
        setup,
        logistic: modelingResults?.logistic ?? null,
        ml,
        generatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      setMlError(err?.message ?? String(err));
    } finally {
      setMlRunning(false);
    }
  };

  const hasRun = Boolean(modelingResults?.logistic || modelingResults?.ml);
  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-4">
      <AboutThisStep stage="modeling" />
      <StepHeader n={6} eyebrow="MODELING (OPTIONAL)" title="Modeling" lede="Table 1 is complete without this step. Use it to fit a logistic regression or benchmark machine-learning classifiers on a binary outcome. Nothing here changes Table 1." next="Format & export" />
      <div className="grid items-start gap-4 min-[1101px]:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="Model setup">
          <h2 className="mb-1 text-base font-semibold text-gray-900">Choose a two-group outcome</h2>
          <p className="mb-3 text-xs text-gray-600">Logistic regression and the benchmark both need a binary outcome.</p>
          {isVeryLargeDataset && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
              <p>{describeLargeNConfirm(data.rows.length)}</p>
              <label className="mt-2 flex items-center gap-2 font-medium">
                <input type="checkbox" checked={largeNAcknowledged} onChange={(e) => setLargeNAcknowledged(e.target.checked)} />
                I understand this may be slow or crash my browser tab, and I want to proceed anyway.
              </label>
            </div>
          )}
          <ModelingSetupHeader data={data} schema={schema} setup={setup} onSetupChange={setModelingSetup} regime={regime} onRegimeChange={setRegime} />
        </section>

        <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="Model results" aria-live="polite" aria-busy={running || mlRunning}>
          <div role="tablist" aria-label="Model type" className="mb-4 flex gap-1 border-b border-gray-200">
            <button type="button" role="tab" aria-selected={activeTab === "logistic"} onClick={() => setActiveTab("logistic")} className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm font-semibold ${activeTab === "logistic" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>Logistic Regression</button>
            <button type="button" role="tab" aria-selected={activeTab === "ml"} onClick={() => setActiveTab("ml")} className={`-mb-px border-b-2 px-3.5 py-2.5 text-sm font-semibold ${activeTab === "ml" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}>Machine Learning</button>
          </div>
          {activeTab === "logistic" ? (
            <LogisticRegressionTab setup={setup} result={modelingResults?.logistic ?? null} running={running} error={error} onRun={run} confirmedLargeRun={confirmedLargeRun} runtimeEstimate={runtimeEstimate} />
          ) : (
            <MachineLearningTab setup={setup} result={modelingResults?.ml ?? null} running={mlRunning} error={mlError} onRun={runMl} confirmedLargeRun={confirmedLargeRun} runtimeEstimate={runtimeEstimate} />
          )}
        </section>
      </div>
      <TripodAiReportingPanel />
      <StepActionBar onBack={() => setStage(7)} backLabel="Back to Statistical review" status={{ tone: "info", text: "Optional step · does not affect Table 1" }} primary={{ label: hasRun ? "Continue to Format and export" : "Skip to Format and export", onClick: () => setStage(9) }} />
    </div>
  );
}
