import { useMemo } from "react";
import type { MlResult, ModelingSetup } from "../../core/modeling/types";
import type { RuntimeEstimate } from "../../core/modeling/runtimeEstimate";
import { getModelingRationales } from "../../core/modeling/rationale";
import { buildDecisionCurveSpec, buildMlCalibrationSpec, buildMlImportanceSpec, buildMlRocSpec } from "../../core/modeling/vizSpecs";
import { VegaPlot } from "./VegaPlot";
import DecisionExplainer, { ExplainerDetails } from "./DecisionExplainer";
import RunProgress from "./RunProgress";
import SubgroupPerformanceTables from "./SubgroupPerformanceTables";

interface MachineLearningTabProps {
  setup: ModelingSetup;
  result: MlResult | null;
  running: boolean;
  error: string | null;
  onRun: () => void;
  confirmedLargeRun: boolean;
  runtimeEstimate: RuntimeEstimate;
}

function fmt(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function fmtMetric(value: { mean: number | null; sd: number | null }) {
  return `${fmt(value.mean)} +/- ${fmt(value.sd)}`;
}

function fmtMetricCi(value: { ciLow?: number | null; ciHigh?: number | null }) {
  return value.ciLow !== null && value.ciLow !== undefined && value.ciHigh !== null && value.ciHigh !== undefined
    ? `${fmt(value.ciLow)}-${fmt(value.ciHigh)}`
    : "-";
}

function fmtThreshold(value: number | null | undefined) {
  return fmt(value ?? 0.5, 2);
}

export default function MachineLearningTab({ setup, result, running, error, onRun, confirmedLargeRun, runtimeEstimate }: MachineLearningTabProps) {
  const roc = useMemo(() => (result ? buildMlRocSpec(result) : null), [result]);
  const rationales = getModelingRationales(setup, result ? { schemaFingerprint: "", setup, logistic: null, ml: result, generatedAt: "" } : null);
  const educationContext = { modelingSetup: setup, modelingResults: result ? { schemaFingerprint: "", setup, logistic: null, ml: result, generatedAt: "" } : null };
  const blockReason = !setup.outcome || setup.predictors.length === 0
    ? "Choose a two-group outcome and at least one candidate predictor."
    : !confirmedLargeRun
      ? "Acknowledge the large-dataset risk above to run Modeling."
      : undefined;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onRun}
          disabled={running || Boolean(blockReason)}
          title={blockReason}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "Running benchmark..." : "Run benchmark"}
        </button>
        <span className="text-sm text-gray-600">
          {setup.predictors.length} predictors, shared-fold repeated stratified CV, {setup.fastMode ? "fast" : "thorough"} mode. Estimated runtime: {runtimeEstimate.label}.
        </span>
      </div>

      <RunProgress running={running} estimate={runtimeEstimate} label="Fitting RF, Naive Bayes, SVM, and ridge logistic on shared folds..." />
      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {result ? (
        <>
          {result.warnings.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <ul className="list-disc space-y-1 pl-5">
                {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            </div>
          )}

          <div className="overflow-hidden rounded border border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h3 className="text-base font-semibold text-gray-900">Model comparison</h3>
              <p className="text-sm text-gray-600">{result.folds.nSplits} folds x {result.folds.nRepeats} repeats, seed {result.folds.seed}</p>
              <p className="mt-1 text-xs text-gray-500">Evaluated sample: {result.imputationMethod ?? "complete_case"}{result.nEvaluated !== undefined ? `, N=${result.nEvaluated}` : ""}. Confusion counts are pooled repeated-CV held-out predictions.</p>
              <p className="mt-1 text-xs text-gray-500">Sensitivity, specificity, balanced accuracy, MCC, and F1 use a classification threshold of {fmtThreshold(result.classificationThreshold)} on predicted probability. AUC and ROC curves are threshold-independent; threshold metrics and confusion matrices are read at this cut-point.</p>
              <p className="mt-1 text-xs text-gray-500">{rationales.mlValidation.what}. {rationales.mlValidation.why}</p>
              <p className="mt-1 text-xs text-gray-500" title="This interval reflects run-to-run variability of repeated cross-validation on this dataset; it is not a confidence interval for performance on new patients.">The +/- SD value is per-repeat spread. The 95% interval across CV repetitions is computed from repeat-level metric means and is omitted when only one repeat is available. Intervals are computed on the logit scale (Fisher z for MCC) and back-transformed, so they cannot fall outside the metric's range; an interval is omitted when a repeat reaches that range's boundary. This interval reflects run-to-run variability of repeated cross-validation on this dataset; it is not a confidence interval for performance on new patients.</p>
              <ExplainerDetails label="How was this computed, and why?">
                <p>{rationales.mlValidation.plain}</p>
                <p>{rationales.mlValidation.example}</p>
              </ExplainerDetails>
              <DecisionExplainer decisionId="modeling.validation" label="Why this validation?" context={educationContext} />
              <DecisionExplainer decisionId="modeling.performanceCi" label="Why performance intervals?" context={educationContext} />
            </div>
            <div className="overflow-x-auto overflow-y-visible">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Model</th>
                    <th className="px-4 py-2">AUC</th>
                    <th className="px-4 py-2">AUC 95% interval across CV repetitions</th>
                    <th className="px-4 py-2">Sensitivity</th>
                    <th className="px-4 py-2">Sensitivity 95% interval across CV repetitions</th>
                    <th className="px-4 py-2">Specificity</th>
                    <th className="px-4 py-2">Specificity 95% interval across CV repetitions</th>
                    <th className="px-4 py-2">Balanced accuracy</th>
                    <th className="px-4 py-2">Balanced accuracy 95% interval across CV repetitions</th>
                    <th className="px-4 py-2">MCC</th>
                    <th className="px-4 py-2">F1</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.comparison.map((row) => (
                    <tr key={row.model}>
                      <td className="px-4 py-2 font-medium text-gray-800">{row.model}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetric(row.auc)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetricCi(row.auc)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetric(row.sens)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetricCi(row.sens)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetric(row.spec)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetricCi(row.spec)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetric(row.balacc)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetricCi(row.balacc)}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetric(row.mcc ?? { mean: null, sd: null })}</td>
                      <td className="px-4 py-2 text-gray-700">{fmtMetric(row.f1 ?? { mean: null, sd: null })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {roc && (
            <div className="rounded border border-gray-200 bg-white p-4">
              <h3 className="mb-3 text-base font-semibold text-gray-900">Mean ROC with SD band</h3>
              <p className="mb-3 text-xs text-gray-500">{rationales.rocAveraging.what}. {rationales.rocAveraging.why}</p>
              <ExplainerDetails label="How was this computed, and why?" className="mb-3">
                <p>{rationales.rocAveraging.plain}</p>
                <p>{rationales.rocAveraging.example}</p>
              </ExplainerDetails>
              <DecisionExplainer decisionId="modeling.roc" label="Why average ROC this way?" context={educationContext} />
              <div className="min-h-80">
                <VegaPlot spec={roc} />
              </div>
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            {result.models.map((model) => (
              <div key={model.name} className="rounded border border-gray-200 bg-white p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-semibold text-gray-900">{model.name}</h3>
                    <p className="text-sm text-gray-600">Brier {fmt(model.calibration.brier)}; calibration slope {fmt(model.calibration.slope)}</p>
                    <p className="text-xs text-gray-500">MCC {fmt(model.metrics.mcc?.mean)}; F1 {fmt(model.metrics.f1?.mean)}. Hyperparameters: {Object.entries(model.hyperparameters ?? {}).map(([key, value]) => `${key}=${value}`).join(", ") || "not recorded"}.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-1 rounded border border-gray-200 p-2 text-center text-xs">
                    <div className="bg-green-50 px-3 py-1">TP {model.confusion.tp}</div>
                    <div className="bg-red-50 px-3 py-1">FP {model.confusion.fp}</div>
                    <div className="bg-red-50 px-3 py-1">FN {model.confusion.fn}</div>
                    <div className="bg-green-50 px-3 py-1">TN {model.confusion.tn}</div>
                  </div>
                  <p className="w-full text-right text-xs text-gray-500">Pooled over {model.cvFolds ?? result.folds.nSplits} x {model.cvRepeats ?? result.folds.nRepeats} CV held-out predictions at threshold {fmtThreshold(model.classificationThreshold ?? result.classificationThreshold)}.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <h4 className="mb-1 text-sm font-semibold text-gray-800">Permutation importance</h4>
                    <p className="mb-2 text-xs text-gray-500">{rationales.variableImportance.why}</p>
                    <ExplainerDetails label="How was this computed, and why?" className="mb-2">
                      <p>{rationales.variableImportance.plain}</p>
                      <p>{rationales.variableImportance.example}</p>
                    </ExplainerDetails>
                    <DecisionExplainer decisionId="modeling.importance" label="Why this importance measure?" context={educationContext} />
                    <div className="min-h-40">
                      {model.importanceAvailable === false ? (
                        <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Permutation importance unavailable for this model.</div>
                      ) : (
                        <VegaPlot spec={buildMlImportanceSpec(model)} />
                      )}
                    </div>
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold text-gray-800">Calibration</h4>
                    <div className="min-h-52">
                      <VegaPlot spec={buildMlCalibrationSpec(model)} />
                    </div>
                  </div>
                  {model.decisionCurve && (
                    <div className="md:col-span-2">
                      <h4 className="mb-1 text-sm font-semibold text-gray-800">Clinical utility: decision curve</h4>
                      <p className="mb-2 text-xs text-gray-500">{rationales.decisionCurve.what}. Basis: {model.decisionCurve.basis}; thresholds {fmt(model.decisionCurve.points[0]?.threshold, 2)} to {fmt(model.decisionCurve.points.at(-1)?.threshold, 2)}.</p>
                      <ExplainerDetails label="How do I read this curve?" className="mb-2">
                        <p>{rationales.decisionCurve.plain}</p>
                        <p>{rationales.decisionCurve.example}</p>
                      </ExplainerDetails>
                      <div className="min-h-64">
                        <VegaPlot spec={buildDecisionCurveSpec(model.decisionCurve)} />
                      </div>
                    </div>
                  )}
                  <div className="md:col-span-2">
                    <SubgroupPerformanceTables
                      subgroups={model.subgroups}
                      overall={{
                        auc: model.metrics.auc.mean,
                        calibrationSlope: model.calibration.slope,
                        brier: model.calibration.brier,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="rounded border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Run the benchmark to compare discrimination, calibration, variable importance, and confusion matrices.
        </div>
      )}
    </div>
  );
}
