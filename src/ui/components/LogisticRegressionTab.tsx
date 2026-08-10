import type { LogisticResult, ModelingSetup } from "../../core/modeling/types";
import type { RuntimeEstimate } from "../../core/modeling/runtimeEstimate";
import { getModelingRationales } from "../../core/modeling/rationale";
import { buildDecisionCurveSpec } from "../../core/modeling/vizSpecs";
import DecisionExplainer, { ExplainerDetails } from "./DecisionExplainer";
import RunProgress from "./RunProgress";
import SubgroupPerformanceTables from "./SubgroupPerformanceTables";
import { VegaPlot } from "./VegaPlot";

interface LogisticRegressionTabProps {
  setup: ModelingSetup;
  result: LogisticResult | null;
  running: boolean;
  error: string | null;
  onRun: () => void;
  confirmedLargeRun: boolean;
  runtimeEstimate: RuntimeEstimate;
}

function fmt(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (Math.abs(value) < 0.001 && value !== 0) return "<0.001";
  return value.toFixed(digits);
}

function fmtCi(ci: [number, number] | null | undefined) {
  return ci ? `95% CI ${fmt(ci[0])} to ${fmt(ci[1])}` : "95% CI not available";
}

function ValidationMetricCard({
  label,
  metricKey,
  value,
  ci,
  validation,
}: {
  label: string;
  metricKey: string;
  value: number | null | undefined;
  ci: [number, number] | null | undefined;
  validation: NonNullable<LogisticResult["validation"]>;
}) {
  const unstable = validation.unstableMetrics?.includes(metricKey) ?? false;
  return (
    <div>
      <div className="text-xs uppercase text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{unstable ? "not reportable" : fmt(value)}</div>
      <div className="text-xs text-gray-500">{unstable ? "Suppressed because this metric was not reliably estimable." : fmtCi(ci)}</div>
    </div>
  );
}

function OrTable({ title, rows }: { title: string; rows: NonNullable<LogisticResult["adjusted"]> }) {
  const showSelection = rows.some((row) => row.selectionFrequency !== null && row.selectionFrequency !== undefined);
  return (
    <div className="overflow-hidden rounded border border-gray-200 bg-white">
      <div className="border-b border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900">{title}</div>
      <div className="overflow-x-auto overflow-y-visible">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Term</th>
              <th className="px-4 py-2">OR</th>
              <th className="px-4 py-2">95% CI</th>
              {showSelection && <th className="px-4 py-2">Selection %</th>}
              <th className="px-4 py-2">p</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, index) => (
              <tr key={`${row.label}-${index}`}>
                <td className="px-4 py-2 font-medium text-gray-800">{row.displayLabel ?? row.label}</td>
                <td className="px-4 py-2 text-gray-700">{fmt(row.or)}</td>
                <td className="px-4 py-2 text-gray-700">
                  {(row.ciLow === null || row.ciLow === undefined || Number.isNaN(row.ciLow)) &&
                  (row.ciHigh === null || row.ciHigh === undefined || Number.isNaN(row.ciHigh)) ? (
                    <span title="A confidence interval could not be estimated for this term — often caused by separation, where a predictor perfectly predicts the outcome.">
                      not estimable
                    </span>
                  ) : (
                    <>{fmt(row.ciLow)} to {fmt(row.ciHigh)}</>
                  )}
                </td>
                {showSelection && <td className="px-4 py-2 text-gray-700">{row.selectionFrequency === null || row.selectionFrequency === undefined ? "-" : fmt(row.selectionFrequency * 100, 0)}</td>}
                <td className="px-4 py-2 text-gray-700" title={row.p === null && row.ciMethod?.startsWith("bootstrap") ? "Penalized models omit Wald P-values; use the bootstrap CI instead." : undefined}>{row.p === null ? "-" : fmt(row.p)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td className="px-4 py-4 text-gray-500" colSpan={showSelection ? 5 : 4}>No rows yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function LogisticRegressionTab({ setup, result, running, error, onRun, confirmedLargeRun, runtimeEstimate }: LogisticRegressionTabProps) {
  const rationales = getModelingRationales(setup, result ? { schemaFingerprint: "", setup, logistic: result, ml: null, generatedAt: "" } : null);
  const educationContext = { modelingSetup: setup, modelingResults: result ? { schemaFingerprint: "", setup, logistic: result, ml: null, generatedAt: "" } : null };
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
          {running ? "Running..." : "Run logistic regression"}
        </button>
        <span className="text-sm text-gray-600">
          {setup.predictors.length} predictors, {setup.model} model, {setup.fastMode ? "fast" : "thorough"} validation. Estimated runtime: {runtimeEstimate.label}.
        </span>
      </div>

      <RunProgress running={running} estimate={runtimeEstimate} label="Fitting logistic model and validation resamples..." />

      {error && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {result ? (
        <>
          {result.unmatchedPredictors && result.unmatchedPredictors.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Some predictors were not found in the data and were omitted: {result.unmatchedPredictors.join(", ")}.
            </div>
          )}
          <OrTable title="Univariate odds ratios" rows={result.univariate} />
          <div className="rounded border border-gray-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold text-gray-900">Adjusted model</h3>
                <p className="text-sm text-gray-600">Selected model: {result.model}{result.lambda ? `, lambda ${fmt(result.lambda, 4)}` : ""}</p>
                {result.outcomeEventLevel && (
                  <p className="text-sm text-gray-600">Modeled event: {result.outcomeEventLevel}{result.outcomeReferenceLevel ? `; reference/non-event: ${result.outcomeReferenceLevel}` : ""}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  {rationales.model.what}. {rationales.model.why}
                </p>
                <ExplainerDetails label="How was this computed, and why?">
                  <p>{rationales.model.plain}</p>
                  <p>{rationales.model.example}</p>
                  {result.adjusted.some((row) => row.p === null && row.ciMethod?.startsWith("bootstrap")) && (
                    <p>This penalized model deliberately shrinks weak associations, so the usual P-value is not shown; read statistical signal from whether the confidence interval crosses 1.</p>
                  )}
                </ExplainerDetails>
                {result.lambda !== null && (
                  <p className="mt-1 text-xs text-gray-500">
                    Lambda rule applied: {result.lambdaRuleApplied ?? rationales.lambdaRule.what}. {rationales.lambdaRule.why}
                  </p>
                )}
                <DecisionExplainer decisionId="modeling.model" label="Why this model?" context={educationContext} />
                {result.lambda !== null && <DecisionExplainer decisionId="modeling.lambda" label="Why this lambda rule?" context={educationContext} />}
                <DecisionExplainer decisionId="modeling.imputation" label="Why this missing-data policy?" context={educationContext} />
                <DecisionExplainer decisionId="modeling.ci" label="Why these intervals?" context={educationContext} />
              </div>
              <div className="text-sm text-gray-600">Selected terms: {result.selected.length ? result.selected.join(", ") : "none"}</div>
            </div>
            <OrTable title="Adjusted odds ratios" rows={result.adjusted} />
            <ExplainerDetails label="Show the fitted model equation">
              <p className="mb-2 text-xs text-gray-600">
                This is the fitted logistic model written out: the log-odds of the modeled
                event as a straight-line combination of the predictors. Each number is that
                predictor's coefficient (log-odds change); exponentiating it gives the odds
                ratio shown above.
              </p>
              <div className="rounded bg-gray-50 p-3 font-mono text-xs text-gray-700">
                {result.displayEquation ?? result.equation}
              </div>
            </ExplainerDetails>
          </div>

          {result.validation && (
            <div className="rounded border border-gray-200 bg-white p-4">
              <div className="mb-3 text-xs text-gray-500">
                {rationales.logisticValidation.what}. {rationales.logisticValidation.why}
                <p className="mt-1">
                  ROC and calibration curve data are apparent (in-sample); the headline scalar metrics below are {result.validation.scalarBasis === "optimism_corrected" ? "optimism-corrected" : "apparent"}.
                </p>
                <ExplainerDetails label="How was this computed, and why?">
                  <p>{rationales.logisticValidation.plain}</p>
                  <p>{rationales.logisticValidation.example}</p>
                </ExplainerDetails>
                <DecisionExplainer decisionId="modeling.validation" label="Why this validation?" context={educationContext} />
                <DecisionExplainer decisionId="modeling.performanceCi" label="Why performance CIs?" context={educationContext} />
              </div>
              <div className="grid gap-3 sm:grid-cols-6">
                <ValidationMetricCard label={result.validation.scalarBasis === "optimism_corrected" ? "AUC optimism-corrected" : "AUC apparent"} metricKey="auc" value={result.validation.aucCorrected} ci={result.validation.aucCorrectedCi} validation={result.validation} />
                <ValidationMetricCard label={result.validation.scalarBasis === "optimism_corrected" ? "Calibration slope corrected" : "Calibration slope apparent"} metricKey="calibration_slope" value={result.validation.calibrationSlope} ci={result.validation.calibrationSlopeCi} validation={result.validation} />
                <ValidationMetricCard label={result.validation.scalarBasis === "optimism_corrected" ? "Calibration intercept corrected" : "Calibration intercept apparent"} metricKey="calibration_intercept" value={result.validation.calibrationIntercept} ci={result.validation.calibrationInterceptCi} validation={result.validation} />
                <ValidationMetricCard label={result.validation.scalarBasis === "optimism_corrected" ? "Brier corrected" : "Brier apparent"} metricKey="brier" value={result.validation.brier} ci={result.validation.brierCi} validation={result.validation} />
                <ValidationMetricCard label="MCC (threshold 0.5)" metricKey="mcc" value={result.validation.mcc} ci={result.validation.mccCi} validation={result.validation} />
                <ValidationMetricCard label="F1 (threshold 0.5)" metricKey="f1" value={result.validation.f1} ci={result.validation.f1Ci} validation={result.validation} />
              </div>
              {result.validation.ciMethod === "none" && (
                <p className="mt-3 text-xs text-gray-500">No validation CI is shown because bootstrap optimism correction did not produce enough successful resamples.</p>
              )}
              {result.validation.unstableMetrics && result.validation.unstableMetrics.length > 0 && (
                <p className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
                  Not reportable: {result.validation.unstableMetrics.join(", ")}. {result.validation.unstableReason}
                </p>
              )}
            </div>
          )}

          {result.decisionCurve && (
            <div className="rounded border border-gray-200 bg-white p-4">
              <h3 className="mb-2 text-base font-semibold text-gray-900">Clinical utility: decision curve</h3>
              <p className="mb-2 text-xs text-gray-500">{rationales.decisionCurve.what}. {rationales.decisionCurve.why}</p>
              <p className="mb-3 text-xs text-gray-500">Basis: {result.decisionCurve.basis}; prevalence {fmt(result.decisionCurve.prevalence)}; thresholds {fmt(result.decisionCurve.points[0]?.threshold, 2)} to {fmt(result.decisionCurve.points.at(-1)?.threshold, 2)}.</p>
              <ExplainerDetails label="How do I read this curve?" className="mb-3">
                <p>{rationales.decisionCurve.plain}</p>
                <p>{rationales.decisionCurve.example}</p>
              </ExplainerDetails>
              <div className="min-h-64">
                <VegaPlot spec={buildDecisionCurveSpec(result.decisionCurve)} />
              </div>
            </div>
          )}

          <SubgroupPerformanceTables
            subgroups={result.subgroups}
            overall={result.validation ? {
              auc: result.validation.aucCorrected,
              calibrationSlope: result.validation.calibrationSlope,
              brier: result.validation.brier,
              n: result.regime.n,
              events: result.regime.events,
            } : undefined}
          />
        </>
      ) : (
        <div className="rounded border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Run the model to populate univariate ORs, adjusted ORs, the fitted equation, and validation metrics.
        </div>
      )}
    </div>
  );
}
