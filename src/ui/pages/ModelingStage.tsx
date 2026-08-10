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

  return (
    <div className="mx-auto max-w-7xl overflow-hidden rounded border border-gray-200 bg-gray-50">
      <div className="border-b border-gray-200 bg-white px-5 py-4">
        <div className="mb-4">
          <AboutThisStep stage="modeling" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Modeling</h2>
            <p className="text-sm text-gray-600">Logistic regression is opt-in and runs entirely in the browser worker.</p>
          </div>
          <button onClick={() => setStage(9)} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            Skip to Format and export
          </button>
        </div>
      </div>

      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={setup}
        onSetupChange={setModelingSetup}
        regime={regime}
        onRegimeChange={setRegime}
      />

      {isVeryLargeDataset && (
        <div className="border-b border-gray-200 bg-red-50 p-4 text-sm text-red-900">
          <p>{describeLargeNConfirm(data.rows.length)}</p>
          <label className="mt-2 flex items-center gap-2 font-medium">
            <input
              type="checkbox"
              checked={largeNAcknowledged}
              onChange={(e) => setLargeNAcknowledged(e.target.checked)}
            />
            I understand this may be slow or crash my browser tab, and I want to proceed anyway.
          </label>
        </div>
      )}

      <div className="px-5 py-5">
        <div className="mb-4 flex border-b border-gray-200">
          <button
            type="button"
            onClick={() => setActiveTab("logistic")}
            className={`px-4 py-2 text-sm font-semibold ${activeTab === "logistic" ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-600 hover:text-gray-900"}`}
          >
            Logistic Regression
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("ml")}
            className={`px-4 py-2 text-sm font-semibold ${activeTab === "ml" ? "border-b-2 border-blue-600 text-blue-700" : "text-gray-600 hover:text-gray-900"}`}
          >
            Machine Learning
          </button>
        </div>
        {activeTab === "logistic" ? (
          <LogisticRegressionTab
            setup={setup}
            result={modelingResults?.logistic ?? null}
            running={running}
            error={error}
            onRun={run}
            confirmedLargeRun={confirmedLargeRun}
            runtimeEstimate={runtimeEstimate}
          />
        ) : (
          <MachineLearningTab
            setup={setup}
            result={modelingResults?.ml ?? null}
            running={mlRunning}
            error={mlError}
            onRun={runMl}
            confirmedLargeRun={confirmedLargeRun}
            runtimeEstimate={runtimeEstimate}
          />
        )}

        <TripodAiReportingPanel />

        <div className="mt-6 flex justify-between">
          <button onClick={() => setStage(7)} className="rounded border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50">
            Back to Statistical Review
          </button>
          <button onClick={() => setStage(9)} className="rounded bg-blue-600 px-6 py-2 text-white hover:bg-blue-700">
            Continue to Format and export
          </button>
        </div>
      </div>
    </div>
  );
}
