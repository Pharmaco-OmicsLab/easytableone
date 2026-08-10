import { useEffect, useMemo, useState } from "react";
import { effectiveIncludeOutcome, inferModeledEvent, isEligibleModelingOutcome, observedLevels } from "../../core/modeling/types";
import type { ModelingRegime, ModelingSetup } from "../../core/modeling/types";
import type { DataFrame, Schema } from "../../core/types";
import { getColumnDisplayLabel, resolveLevelLabel } from "../../core/format/columnLabel";
import { getImputationRationale, getModelingRationales, IMPUTATION_BEST_FOR } from "../../core/modeling/rationale";
import { getImputationSuggestion } from "../../core/modeling/imputationAdvice";
import { estimateModelingRuntime } from "../../core/modeling/runtimeEstimate";
import { LARGE_N_NOTICE_THRESHOLD, describeLargeNAdvisory } from "../../core/performance/largeDatasetGuardrails";
import { useStore } from "../../store";
import { pyodideClient } from "../../workers/pyodide.client";
import { ExplainerDetails } from "./DecisionExplainer";

interface ModelingSetupHeaderProps {
  data: DataFrame;
  schema: Schema;
  setup: ModelingSetup;
  onSetupChange: (setup: ModelingSetup) => void;
  regime: ModelingRegime | null;
  onRegimeChange: (regime: ModelingRegime | null) => void;
}

const MODEL_OPTIONS = [
  ["plain", "Plain"],
  ["ridge", "Ridge"],
  ["lasso", "LASSO"],
  ["elasticnet", "Elastic-net"],
  ["firth", "Firth"],
] as const;

const MODEL_TOOLTIPS: Record<(typeof MODEL_OPTIONS)[number][0], string> = {
  plain: "Fits a standard logistic regression. Choose this when the outcome has enough events and the predictor set is modest.",
  ridge: "Shrinks all predictor effects a little to make estimates more stable. Choose this when predictors are correlated or events are limited.",
  lasso: "Can shrink weak predictors all the way to zero. Choose this when you want the data to help narrow down a larger predictor set.",
  elasticnet: "Blends ridge stability with LASSO-style selection. Choose this when predictors may overlap and you still want some variable selection.",
  firth: "Uses bias-reduced logistic regression. Choose this for rare outcomes or separation when standard logistic regression is unreliable.",
};

const IMPUTATION_POLICIES: ModelingSetup["imputation"]["policy"][] = ["complete_case", "mean", "median", "mode", "constant", "knn", "rf", "mice"];

function classCounts(data: DataFrame, outcome: string): Record<string, number> {
  const idx = data.columns.findIndex((c) => c.name === outcome);
  const counts: Record<string, number> = {};
  if (idx < 0) return counts;
  for (const row of data.rows) {
    const value = row[idx];
    if (value === null || value === undefined || value === "") continue;
    counts[String(value)] = (counts[String(value)] ?? 0) + 1;
  }
  return counts;
}

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

function modelLabel(model: ModelingSetup["model"]) {
  return MODEL_OPTIONS.find(([value]) => value === model)?.[1] ?? model;
}

export default function ModelingSetupHeader({ data, schema, setup, onSetupChange, regime, onRegimeChange }: ModelingSetupHeaderProps) {
  const [expanded, setExpanded] = useState(false);
  const [modelUserOverridden, setModelUserOverridden] = useState(setup.model !== "ridge");
  const [separationDeferred, setSeparationDeferred] = useState(false);
  const qaReport = useStore((state) => state.qaReport);
  const eligibleOutcomes = schema.columns.filter((c) => isEligibleModelingOutcome(schema, c.name, data));
  const currentOutcomeEligible = eligibleOutcomes.some((c) => c.name === setup.outcome);
  const outcomeColumn = schema.columns.find((c) => c.name === setup.outcome);
  const outcomeLevels = useMemo(() => observedLevels(data, setup.outcome), [data, setup.outcome]);
  const modeledEvent = useMemo(
    () => inferModeledEvent(outcomeLevels, outcomeColumn, setup.outcomePositiveLevel),
    [outcomeColumn, outcomeLevels, setup.outcomePositiveLevel],
  );
  const candidatePredictors = schema.columns.filter((c) => !c.exclusionReason && c.name !== setup.outcome && !["id_like", "date", "unsupported"].includes(c.confirmedType));
  const eligibleSubgroups = schema.columns.filter((c) => !c.exclusionReason && c.name !== setup.outcome && ["binary", "categorical_nominal", "categorical_ordinal"].includes(c.confirmedType));
  const meta = useMemo(() => ({
    n: data.rows.length,
    p: predictorExpansion(schema, setup.predictors),
    class_counts: classCounts(data, setup.outcome),
    goal: setup.goal,
  }), [data, schema, setup.outcome, setup.predictors, setup.goal]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let separation: ModelingRegime["separation"] | undefined;
        const shouldCheckSeparation = Boolean(setup.outcome && setup.predictors.length > 0 && meta.n <= LARGE_N_NOTICE_THRESHOLD);
        setSeparationDeferred(Boolean(setup.outcome && setup.predictors.length > 0 && meta.n > LARGE_N_NOTICE_THRESHOLD));
        if (shouldCheckSeparation) {
          separation = await pyodideClient.detectSeparation(data, schema, setup);
        }
        const next = await pyodideClient.detectRegime({
          ...meta,
          separation: Boolean(separation?.separated || separation?.quasi),
        });
        if (!cancelled) {
          onRegimeChange(separation ? { ...next, separation } : next);
        }
      } catch {
        if (!cancelled) onRegimeChange(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, schema, setup, meta, onRegimeChange]);

  useEffect(() => {
    const recommended = regime?.recommendedModels[0];
    if (!recommended || modelUserOverridden || setup.model === recommended) return;
    onSetupChange({ ...setup, model: recommended });
  }, [modelUserOverridden, onSetupChange, regime, setup]);

  useEffect(() => {
    if (!currentOutcomeEligible || !modeledEvent.event) return;
    if (setup.outcomePositiveLevel !== modeledEvent.event) {
      onSetupChange({ ...setup, outcomePositiveLevel: modeledEvent.event });
    }
  }, [currentOutcomeEligible, modeledEvent.event, onSetupChange, setup]);

  const invalidPlain = regime ? !regime.plainMleAllowed : false;
  const outcomeCounts = Object.values(meta.class_counts);
  const eventCount = outcomeCounts.length > 0 ? Math.min(...outcomeCounts) : 0;
  const epv = meta.p > 0 ? eventCount / meta.p : null;
  const modelingRationale = getModelingRationales(setup);
  const update = (patch: Partial<ModelingSetup>) => onSetupChange({ ...setup, ...patch });
  const usesOutcomeAwareImputation = setup.imputation.policy === "knn" || setup.imputation.policy === "rf" || setup.imputation.policy === "mice";
  const includeOutcome = effectiveIncludeOutcome(setup.imputation);
  const isSingleFillMultivariate = setup.imputation.policy === "knn" || setup.imputation.policy === "rf";
  const includeOutcomeLabel = isSingleFillMultivariate
    ? "Use the outcome when filling in missing values (off by default for this method)"
    : "Include the outcome when filling in missing values (recommended)";
  const updateImputationPolicy = (policy: ModelingSetup["imputation"]["policy"]) => {
    const imputation = { ...setup.imputation };
    delete imputation.includeOutcome;
    update({ imputation: { ...imputation, policy } });
  };
  const hasSelectedCategoricalPredictor = setup.predictors.some((name) => {
    const col = schema.columns.find((candidate) => candidate.name === name);
    return col ? ["binary", "categorical_nominal", "categorical_ordinal"].includes(col.confirmedType) : false;
  });
  const allCandidatePredictorNames = candidatePredictors.map((c) => c.name);
  const allPredictorsSelected = allCandidatePredictorNames.length > 0 && allCandidatePredictorNames.every((name) => setup.predictors.includes(name));
  const runtimeEstimate = estimateModelingRuntime(setup, meta.n, meta.p);
  const recommendedModel = regime?.recommendedModels[0] ?? null;
  const selectedModelingColumns = useMemo(
    () => [setup.outcome, ...setup.predictors].filter(Boolean),
    [setup.outcome, setup.predictors],
  );
  const imputationSuggestion = useMemo(
    () => getImputationSuggestion(selectedModelingColumns, qaReport),
    [selectedModelingColumns, qaReport],
  );
  const imputationOptionHelp = useMemo(
    () => IMPUTATION_POLICIES.map((policy) => ({
      policy,
      rationale: getImputationRationale({ ...setup, imputation: { ...setup.imputation, policy } }),
    })),
    [setup],
  );
  const suggestedImputationRationale = imputationSuggestion
    ? imputationOptionHelp.find(({ policy }) => policy === imputationSuggestion.recommendedPolicy)?.rationale
    : null;
  const subgroupVars = setup.subgroupVars ?? [];
  const modeledEventLabel = modeledEvent.event && outcomeColumn ? resolveLevelLabel(modeledEvent.event, outcomeColumn) : modeledEvent.event;
  const modeledReferenceLabel = modeledEvent.reference && outcomeColumn ? resolveLevelLabel(modeledEvent.reference, outcomeColumn) : modeledEvent.reference;

  return (
    <section className="border-b border-gray-200 bg-white px-5 py-4">
      <div className="grid gap-4 lg:grid-cols-[1.1fr_1.4fr_0.8fr]">
        <label className="text-sm font-medium text-gray-800">
          Outcome
          <select
            className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm"
            value={currentOutcomeEligible ? setup.outcome : ""}
            onChange={(e) => {
              const outcome = e.target.value;
              update({
                outcome,
                outcomePositiveLevel: undefined,
                predictors: setup.predictors.filter((p) => p !== outcome),
                subgroupVars: subgroupVars.filter((name) => name !== outcome),
              });
            }}
          >
            <option value="" disabled>Choose a two-group outcome</option>
            {eligibleOutcomes.map((c) => <option key={c.name} value={c.name}>{getColumnDisplayLabel(c)}</option>)}
          </select>
          {!currentOutcomeEligible && (
            <span className="mt-1 block text-xs font-normal text-amber-700">
              Choose a two-group outcome to model. If the intended outcome is hidden, confirm it as binary or a two-level categorical column in Variable types.
            </span>
          )}
          {currentOutcomeEligible && outcomeLevels.length === 2 && modeledEvent.event && (
            <span className="mt-2 block">
              <span className="block text-xs font-semibold text-gray-700">Event to model</span>
              <select
                aria-label="Event to model"
                className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm"
                value={modeledEvent.event}
                onChange={(e) => update({ outcomePositiveLevel: e.target.value })}
              >
                {outcomeLevels.map((level) => (
                  <option key={level} value={level}>{outcomeColumn ? resolveLevelLabel(level, outcomeColumn) : level}</option>
                ))}
              </select>
              <span className="mt-1 block text-xs font-normal text-gray-600">
                Odds ratios and predicted probabilities describe <strong>P({modeledEventLabel})</strong> vs {modeledReferenceLabel}.
              </span>
              {modeledEvent.source !== "explicit" && (
                <span className="mt-1 block rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-normal text-amber-800">
                  Check this - your dictionary's reference level was set from frequency, which may not be the clinical event.
                </span>
              )}
            </span>
          )}
        </label>

        <div className="text-sm font-medium text-gray-800">
          <div className="flex items-center justify-between gap-3">
            <span>Candidate predictors</span>
            <button
              type="button"
              onClick={() => update({ predictors: allPredictorsSelected ? [] : allCandidatePredictorNames })}
              disabled={allCandidatePredictorNames.length === 0}
              className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {allPredictorsSelected ? "Clear all" : "Select all"}
            </button>
          </div>
          <div className="mt-1 grid max-h-28 grid-cols-2 gap-1 overflow-y-auto rounded border border-gray-300 bg-white p-2">
            {candidatePredictors.map((c) => (
              <label key={c.name} className="flex min-w-0 items-center gap-2 text-xs font-normal text-gray-700">
                <input
                  type="checkbox"
                  checked={setup.predictors.includes(c.name)}
                  onChange={(e) => {
                    const predictors = e.target.checked
                      ? [...setup.predictors, c.name]
                      : setup.predictors.filter((p) => p !== c.name);
                    update({ predictors });
                  }}
                />
                <span className="truncate" title={c.name}>{getColumnDisplayLabel(c)}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-gray-800">
            Goal
            <select className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm" value={setup.goal} onChange={(e) => update({ goal: e.target.value as ModelingSetup["goal"] })}>
              <option value="adjust">Adjust for fixed set</option>
              <option value="select">Let data select</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-800">
            Seed
            <input className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" type="number" value={setup.seed} onChange={(e) => update({ seed: Number(e.target.value) || 1 })} />
          </label>
        </div>
      </div>

      {regime && (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>EPV guardrail:</strong> {regime.rationale}
          {recommendedModel && (
            <span className="mt-1 block">
              Recommended: {modelLabel(recommendedModel)}{setup.model === recommendedModel ? " - selected" : ""}; you can override below.
            </span>
          )}
          {separationDeferred && (
            <span className="mt-1 block text-xs">
              Separation will be confirmed on run for this large dataset.
            </span>
          )}
        </div>
      )}

      {meta.n > LARGE_N_NOTICE_THRESHOLD && (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Large dataset:</strong> {describeLargeNAdvisory(meta.n, setup.fastMode)} Estimated modeling runtime: {runtimeEstimate.label}.
        </div>
      )}

      <details className="mt-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
        <summary className="cursor-pointer select-none font-semibold">Modeling guardrails</summary>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          <p>
            <strong>When not to model:</strong> Be cautious with tiny datasets or rare outcomes. Current N is {meta.n}; smallest outcome class is {eventCount || "not selected"}.
          </p>
          <p>
            <strong>Outcome requirement:</strong> Choose a binary or two-level categorical outcome with enough observations in both classes.
          </p>
          <p>
            <strong>Events per variable:</strong> {epv === null ? "Select predictors to estimate EPV." : `${eventCount} events / ${meta.p} expanded predictor terms = ${epv.toFixed(1)} EPV.`} {regime?.rationale ?? modelingRationale.model.why}
          </p>
          <p>
            <strong>Leakage and validation:</strong> Do not include predictors measured after the outcome. {modelingRationale.logisticValidation.plain}
          </p>
        </div>
      </details>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded border border-gray-300 bg-gray-50 p-1">
          {MODEL_OPTIONS.map(([value, label]) => {
            const disabled = value === "plain" && invalidPlain;
            return (
              <button
                key={value}
                type="button"
                disabled={disabled}
                title={disabled ? regime?.rationale : MODEL_TOOLTIPS[value]}
                onClick={() => {
                  setModelUserOverridden(true);
                  update({ model: value });
                }}
                className={`px-3 py-1.5 text-sm ${setup.model === value ? "bg-blue-600 text-white" : "text-gray-700"} ${disabled ? "cursor-not-allowed opacity-40" : "hover:bg-white"}`}
              >
                {label}
              </button>
            );
          })}
        </div>
        <label
          className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
          title="Fast validation keeps the app responsive by taking a few shortcuts: it reuses one penalty strength instead of re-picking it for every resample, checks each model against fewer internal splits (2 folds), repeats the whole cross-validation 3 times instead of 10, and tries a smaller set of model settings. It also uses 200 resamples and a single fill for missing values. Thorough (unchecked) re-picks the penalty each time, uses the full settings and 1000 resamples, and re-runs the full imputation inside every resample. Your odds ratios are identical either way. Validation results (AUC, calibration, and their intervals) are estimates from resampling, so Fast and Thorough can differ slightly - Thorough uses more resamples and gives more stable numbers."
        >
          <input type="checkbox" checked={setup.fastMode} onChange={(e) => update({ fastMode: e.target.checked, validationB: e.target.checked ? 200 : 1000, ciBootstrapB: e.target.checked ? 200 : 1000 })} />
          Fast validation
        </label>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          title="Show settings for missing-data handling, validation repeats, and the penalty selection rule."
          aria-expanded={expanded}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          {expanded ? "Hide advanced settings" : "Advanced settings"}
        </button>
      </div>

      <div className="mt-4 rounded border border-gray-200 bg-gray-50 p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Fairness / subgroup performance (optional)</h3>
            <p className="mt-1 text-xs text-gray-600">
              Choose categorical characteristics to report model performance separately by group. The app reports subgroup AUC, calibration, and Brier scores; it does not decide whether the model is fair or apply mitigation.
            </p>
          </div>
          {subgroupVars.length > 0 && (
            <button
              type="button"
              onClick={() => update({ subgroupVars: [] })}
              className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold text-gray-700 hover:bg-white"
            >
              Clear subgroups
            </button>
          )}
        </div>
        <div className="mt-2 grid max-h-24 grid-cols-2 gap-1 overflow-y-auto rounded border border-gray-300 bg-white p-2 md:grid-cols-3">
          {eligibleSubgroups.map((c) => (
            <label key={c.name} className="flex min-w-0 items-center gap-2 text-xs font-normal text-gray-700">
              <input
                type="checkbox"
                checked={subgroupVars.includes(c.name)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...subgroupVars, c.name]
                    : subgroupVars.filter((name) => name !== c.name);
                  update({ subgroupVars: next });
                }}
              />
              <span className="truncate" title={c.name}>{getColumnDisplayLabel(c)}</span>
            </label>
          ))}
          {eligibleSubgroups.length === 0 && (
            <div className="col-span-full text-xs text-gray-500">No eligible categorical subgroup columns are available for this outcome.</div>
          )}
        </div>
        <p className="mt-2 text-xs text-gray-500">Continuous subgroup variables need user-defined bins and are not included in this version.</p>
      </div>

      {expanded && (
        <div className="mt-4 grid gap-3 border-t border-gray-100 pt-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="text-sm font-medium text-gray-800">
              Imputation
              <select
                className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm"
                value={setup.imputation.policy}
                title="Choose how missing predictor values are handled for modeling."
                onChange={(e) => updateImputationPolicy(e.target.value as ModelingSetup["imputation"]["policy"])}
              >
                <optgroup label="None">
                  <option value="complete_case">Complete-case (drop incomplete rows)</option>
                </optgroup>
                <optgroup label="Simple (single fill)">
                  <option value="mean">Mean</option>
                  <option value="median">Median</option>
                  <option value="mode">Mode</option>
                  <option value="constant">Constant</option>
                </optgroup>
                <optgroup label="ML-based (single fill)">
                  <option value="knn">k-nearest-neighbours</option>
                  <option value="rf">Random forest / missForest</option>
                </optgroup>
                <optgroup label="Multiple imputation">
                  <option value="mice">MICE (multiple imputation)</option>
                </optgroup>
              </select>
            </label>
            <div className="mt-2 rounded border border-sky-100 bg-sky-50 p-3 text-xs text-sky-950">
              <p className="font-medium text-sky-900">{IMPUTATION_BEST_FOR[setup.imputation.policy]}</p>
              <p>{modelingRationale.imputation.plain}</p>
              {imputationSuggestion && (
                <div className="mt-3 rounded border border-sky-200 bg-white p-3 text-gray-800">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-semibold text-gray-900">{imputationSuggestion.headline}</div>
                      <p className="mt-1 font-semibold text-sky-900">
                        Suggested policy: {suggestedImputationRationale?.what ?? imputationSuggestion.recommendedPolicy}
                      </p>
                      <p className="mt-1">{imputationSuggestion.reason}</p>
                      <p className="mt-1">{imputationSuggestion.missingnessSummary}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => updateImputationPolicy(imputationSuggestion.recommendedPolicy)}
                      className="rounded border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50"
                    >
                      Use this
                    </button>
                  </div>
                  <p className="mt-2 text-gray-500">{imputationSuggestion.disclaimer}</p>
                </div>
              )}
              <ExplainerDetails label="Compare all options" className="mt-3">
                <ul className="space-y-2">
                  {imputationOptionHelp.map(({ policy, rationale }) => (
                    <li key={policy}>
                      <em>{IMPUTATION_BEST_FOR[policy]}</em> <strong>{rationale.what}:</strong> {rationale.plain} {rationale.why}
                    </li>
                  ))}
                </ul>
              </ExplainerDetails>
            </div>
            {setup.imputation.policy === "mean" && (
              <div className="mt-2 rounded border border-sky-100 bg-sky-50 p-3 text-xs text-sky-950">
                Tip: for skewed measurements (many lab values, costs, durations), the median is usually a safer fill than the mean, because the mean is pulled by outliers. Consider{" "}
                <button
                  type="button"
                  className="font-semibold text-sky-800 underline"
                  onClick={() => updateImputationPolicy("median")}
                >
                  switching to median
                </button>.
              </div>
            )}
            {usesOutcomeAwareImputation && (
              <div className="mt-3 space-y-2 text-xs">
                <label className="flex items-start gap-2 font-medium text-gray-800">
                  <input
                    className="mt-0.5"
                    type="checkbox"
                    checked={includeOutcome}
                    onChange={(e) => update({ imputation: { ...setup.imputation, includeOutcome: e.target.checked } })}
                  />
                  <span>{includeOutcomeLabel}</span>
                </label>
                {isSingleFillMultivariate ? (
                  <div className="rounded border border-sky-100 bg-sky-50 p-3 text-sky-950">
                    For kNN and random-forest imputation, EasyTableOne fills each missing value with a single best guess. Using your outcome to make that guess can overstate the real relationships in your data (odds ratios pushed away from "no effect"), so it is off by default for these methods. MICE is different — it fills each gap several times with built-in randomness, so it can use the outcome safely and does so by default.
                  </div>
                ) : (
                  <div className="rounded border border-sky-100 bg-sky-50 p-3 text-sky-950">
                    To reduce bias, EasyTableOne uses your outcome variable when filling in missing predictor values. This is standard imputation practice: it keeps the real relationships in your data intact, so your odds ratios aren't pulled toward "no effect." The outcome is used only to fill gaps — it is never added to your model as a predictor.
                  </div>
                )}
                {isSingleFillMultivariate && includeOutcome && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    You've turned on using the outcome to fill in missing values for a single-fill method (kNN or random forest). Because these methods fill each gap with one fixed best guess, this can bias your results toward a stronger effect than really exists (odds ratios pushed away from 1.0). If you want to use the outcome during imputation, MICE is the recommended method for it.
                  </div>
                )}
                {!isSingleFillMultivariate && !includeOutcome && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    You've turned off using the outcome to fill in missing values. This can bias your results toward showing no effect (odds ratios closer to 1.0). We recommend leaving it on unless you have a specific methodological reason.
                  </div>
                )}
              </div>
            )}
          </div>
          {setup.imputation.policy === "mice" && (
            <label className="text-sm font-medium text-gray-800">
              MICE m
              <input className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" type="number" min={1} value={setup.imputation.m} onChange={(e) => update({ imputation: { ...setup.imputation, m: Number(e.target.value) || 1 } })} />
            </label>
          )}
          {setup.imputation.policy === "knn" && (
            <label className="text-sm font-medium text-gray-800">
              Neighbours
              <input className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" type="number" min={1} value={setup.imputation.knnNeighbors ?? 5} onChange={(e) => update({ imputation: { ...setup.imputation, knnNeighbors: Number(e.target.value) || 5 } })} />
            </label>
          )}
          {setup.imputation.policy === "constant" && (
            <>
              <label className="text-sm font-medium text-gray-800">
                Numeric fill
                <input className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" type="number" value={setup.imputation.constantNumeric ?? 0} onChange={(e) => update({ imputation: { ...setup.imputation, constantNumeric: Number(e.target.value) || 0 } })} />
              </label>
              <label className="text-sm font-medium text-gray-800">
                Category fill
                <input className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" type="text" value={setup.imputation.constantLabel ?? "Missing"} onChange={(e) => update({ imputation: { ...setup.imputation, constantLabel: e.target.value } })} />
              </label>
              {hasSelectedCategoricalPredictor && (
                <div className="rounded border border-sky-100 bg-sky-50 p-3 text-xs text-sky-950 md:col-span-2">
                  For number variables, "constant" fills blanks with the value you set. For category variables, "constant" instead creates a distinct "Missing" category, which appears as its own row in your results. This is deliberate - it shows whether missingness itself is informative; choose "mode" to fold blanks into the most common category instead.
                </div>
              )}
            </>
          )}
          <label className="text-sm font-medium text-gray-800">
            Validation B
            <input className="mt-1 w-full rounded border border-gray-300 p-2 text-sm" type="number" min={0} value={setup.validationB} onChange={(e) => update({ validationB: Number(e.target.value) || 0 })} />
          </label>
          <div className="flex flex-col">
            <label className="text-sm font-medium text-gray-800">
              Validation CI method
              <select
                className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm"
                value={setup.validationCiMethod ?? "oob"}
                onChange={(e) => update({ validationCiMethod: e.target.value as any })}
              >
                <option value="oob">Out-of-bag (recommended)</option>
                <option value="nested">Nested bootstrap (most accurate, slow)</option>
                <option value="full_sample">Full-sample (legacy, not recommended)</option>
              </select>
            </label>
            {(() => {
              const method = setup.validationCiMethod ?? "oob";
              switch (method) {
                case "oob":
                  return (
                    <p className="text-xs text-gray-600 mt-1">
                      Scores each practice model on the patients it did <strong>not</strong> train on — like testing a student on questions they haven't seen. Gives an honest interval and is fast.
                    </p>
                  );
                case "nested":
                  return (
                    <p className="text-xs text-gray-600 mt-1">
                      Runs a full re-check <em>inside</em> every re-check (a loop within a loop) to capture every source of uncertainty. The most rigorous interval, but can take minutes in your browser.
                    </p>
                  );
                case "full_sample":
                  return (
                    <p className="text-xs text-gray-600 mt-1">
                      Scores each model on the same patients it was trained on, so it tends to look more confident than it really should be. Kept only to reproduce older results — prefer Out-of-bag.
                    </p>
                  );
                default:
                  return null;
              }
            })()}
            {setup.validationCiMethod === "nested" && (
              <span className="text-[10px] text-amber-600 font-semibold mt-1 leading-tight">
                Warning: Nested bootstrap runs validationB × validationB fits. In-browser runtime will be extremely long!
              </span>
            )}
          </div>
          <label className="text-sm font-medium text-gray-800">
            Lambda rule
            <select className="mt-1 w-full rounded border border-gray-300 bg-white p-2 text-sm" value={setup.lambdaRule} onChange={(e) => update({ lambdaRule: e.target.value as any })}>
              <option value="lambda_1se">lambda 1-SE</option>
              <option value="lambda_min">lambda min</option>
            </select>
          </label>
        </div>
      )}
    </section>
  );
}
