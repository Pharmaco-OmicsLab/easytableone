import type { DataFrame, Schema, SchemaColumn } from "../types";

export type ModelingGoal = "adjust" | "select";
export type LogisticModelKind = "plain" | "ridge" | "lasso" | "elasticnet" | "firth";
export type ImputationPolicy = "complete_case" | "mean" | "median" | "mode" | "constant" | "knn" | "rf" | "mice";

export interface ModelingSetup {
  outcome: string;
  outcomePositiveLevel?: string | null;
  predictors: string[];
  referenceLevels: Record<string, string | number>;
  imputation: {
    policy: ImputationPolicy;
    m: number;
    knnNeighbors?: number;
    constantNumeric?: number;
    constantLabel?: string;
    includeOutcome?: boolean;
  };
  goal: ModelingGoal;
  seed: number;
  model: LogisticModelKind;
  lambdaRule: "lambda_1se" | "lambda_min";
  validationB: number;
  ciBootstrapB: number;
  fastMode: boolean;
  validationCiMethod?: "oob" | "nested" | "full_sample";
  subgroupVars?: string[];
}

export function effectiveIncludeOutcome(imputation: ModelingSetup["imputation"]): boolean {
  return imputation.includeOutcome ?? imputation.policy === "mice";
}

export interface ModelingRegime {
  n: number;
  events: number;
  nonevents: number;
  p: number;
  epv: number;
  pGeN: boolean;
  recommendedModels: LogisticModelKind[];
  plainMleAllowed: boolean;
  rationale: string;
  separation?: {
    separated: boolean;
    quasi: boolean;
    convergenceWarning?: boolean;
    culprits: string[];
    detection?: string;
  };
}

export interface OddsRatioRow {
  variable?: string;
  label: string;
  displayLabel?: string;
  level?: string | null;
  or: number | null;
  ciLow: number | null;
  ciHigh: number | null;
  p: number | null;
  ciMethod?: string;
  method?: string;
  selectionFrequency?: number | null;
}

export interface LogisticValidation {
  method?: string;
  bEffective?: number;
  firthFallbackCount?: number;
  ciMethod?: "bootstrap_oob" | "bootstrap_nested" | "bootstrap_full_sample" | "none";
  ciLevel?: number;
  curveBasis?: "apparent";
  scalarBasis?: "apparent" | "optimism_corrected";
  aucApparent: number | null;
  aucOptimism: number | null;
  aucCorrected: number | null;
  aucCorrectedCi?: [number, number] | null;
  calibrationSlope: number | null;
  calibrationSlopeCi?: [number, number] | null;
  calibrationIntercept: number | null;
  calibrationInterceptCi?: [number, number] | null;
  brier: number | null;
  brierCi?: [number, number] | null;
  mcc?: number | null;
  mccCi?: [number, number] | null;
  f1?: number | null;
  f1Ci?: [number, number] | null;
  unstableMetrics?: string[];
  unstableReason?: string | null;
  rocCurve: Array<{ fpr: number; tpr: number; threshold: number | null }>;
  calibrationCurve: Array<{ predicted: number; observed: number; n: number }>;
}

export interface DecisionCurvePoint {
  threshold: number;
  netBenefit: number | null;
  netBenefitTreatAll: number | null;
}

export interface DecisionCurve {
  basis: "apparent" | "pooled_repeated_cv" | "optimism_corrected";
  prevalence: number;
  points: DecisionCurvePoint[];
}

export interface SubgroupMetric {
  level: string;
  n: number;
  events: number;
  auc: number | null;
  calibrationSlope: number | null;
  calibrationIntercept?: number | null;
  brier: number | null;
  reason?: "insufficient_events";
}

export interface SubgroupPerformance {
  variable: string;
  basis: "apparent" | "pooled_repeated_cv" | "optimism_corrected";
  levels: SubgroupMetric[];
}

export interface LogisticResult {
  regime: ModelingRegime;
  univariate: OddsRatioRow[];
  adjusted: OddsRatioRow[];
  equation: string;
  displayEquation?: string;
  selected: string[];
  model: LogisticModelKind;
  lambda: number | null;
  lambdaRuleApplied?: "lambda_1se" | "lambda_min" | "fixed_lambda" | string | null;
  outcomeEventLevel?: string | null;
  outcomeReferenceLevel?: string | null;
  imputationMethod?: string;
  diagnostics: Record<string, unknown>;
  unmatchedPredictors?: string[];
  validation: LogisticValidation | null;
  decisionCurve?: DecisionCurve | null;
  subgroups?: SubgroupPerformance[];
}

export interface MlMetricSummary {
  mean: number | null;
  sd: number | null;
  ciLow?: number | null;
  ciHigh?: number | null;
  ciBasis?: "logit" | "fisher_z";
}

export interface MlModelResult {
  name: string;
  metrics: {
    auc: MlMetricSummary;
    sens: MlMetricSummary;
    spec: MlMetricSummary;
    balacc: MlMetricSummary;
    mcc?: MlMetricSummary;
    f1?: MlMetricSummary;
  };
  roc: {
    grid: number[];
    mean: number[];
    sd: number[];
  };
  varImportance: Array<{ name: string; score: number }>;
  importanceAvailable?: boolean;
  calibration: {
    slope: number | null;
    intercept: number | null;
    curve: Array<{ predicted: number; observed: number; n: number }>;
    brier: number | null;
  };
  confusion: {
    tp: number;
    fp: number;
    fn: number;
    tn: number;
  };
  confusionBasis?: "pooled_repeated_cv" | string;
  classificationThreshold?: number;
  cvFolds?: number;
  cvRepeats?: number;
  decisionCurve?: DecisionCurve | null;
  subgroups?: SubgroupPerformance[];
  hyperparameters?: Record<string, string | number | boolean | null>;
}

export interface MlComparisonRow {
  model: string;
  auc: MlMetricSummary;
  sens: MlMetricSummary;
  spec: MlMetricSummary;
  balacc: MlMetricSummary;
  mcc?: MlMetricSummary;
  f1?: MlMetricSummary;
}

export interface MlResult {
  models: MlModelResult[];
  comparison: MlComparisonRow[];
  folds: {
    nSplits: number;
    nRepeats: number;
    seed: number;
  };
  warnings: string[];
  imputationMethod?: string;
  nEvaluated?: number;
  confusionBasis?: "pooled_repeated_cv" | string;
  classificationThreshold?: number;
}

export interface ModelingResults {
  schemaFingerprint: string;
  setup: ModelingSetup;
  logistic: LogisticResult | null;
  ml?: MlResult | null;
  generatedAt: string;
}

export type ModelingDataRow = Record<string, string | number | boolean | null | undefined>;

export interface ModelingDataExport {
  modelInputMatrix: ModelingDataRow[];
  lrPredictedProbabilities: ModelingDataRow[];
  mlOofPredictions: ModelingDataRow[];
  mlRocCurve: ModelingDataRow[];
  mlCalibration: ModelingDataRow[];
  mlVariableImportance: ModelingDataRow[];
  mlMetrics: ModelingDataRow[];
  warnings?: string[];
}

export function computeModelingFingerprint(data: DataFrame | null, schema: Schema | null): string {
  const cols = schema?.columns.map((c) => JSON.stringify({
    name: c.name,
    confirmedType: c.confirmedType,
    referenceLevel: c.referenceLevel ?? null,
    levels: c.levels?.map((level) => ({
      code: level.code,
      label: level.label,
      order: level.order ?? null,
    })) ?? [],
    exclusionReason: c.exclusionReason ?? null,
  })).join("|") ?? "";
  const dataShape = data ? `${data.columns.map((c) => c.name).join("|")}#${data.rows.length}` : "no-data";
  return `${dataShape}::${cols}`;
}

export function observedLevelCount(data: DataFrame | null, columnName: string): number {
  if (!data) return 0;
  const idx = data.columns.findIndex((c) => c.name === columnName || c.name.trim() === columnName.trim());
  if (idx < 0) return 0;
  const levels = new Set<string>();
  for (const row of data.rows) {
    const value = row[idx];
    if (value === null || value === undefined || value === "") continue;
    levels.add(String(value));
  }
  return levels.size;
}

export function observedLevels(data: DataFrame | null, columnName: string): string[] {
  if (!data) return [];
  const idx = data.columns.findIndex((c) => c.name === columnName || c.name.trim() === columnName.trim());
  if (idx < 0) return [];
  const levels: string[] = [];
  const seen = new Set<string>();
  for (const row of data.rows) {
    const value = row[idx];
    if (value === null || value === undefined || value === "") continue;
    const key = String(value);
    if (seen.has(key)) continue;
    seen.add(key);
    levels.push(key);
  }
  return levels;
}

function naturalLevelKey(value: string): [number, string | number] {
  const text = String(value).trim().toLowerCase();
  const negativeRank = new Set(["0", "false", "no", "control", "survival", "none"]);
  const positiveRank = new Set(["1", "true", "yes", "case", "event", "death"]);
  if (negativeRank.has(text)) return [0, text];
  if (positiveRank.has(text)) return [2, text];
  const numeric = Number(text);
  return Number.isFinite(numeric) ? [1, numeric] : [1, text];
}

export function inferModeledEvent(
  levels: string[],
  schemaCol?: Pick<SchemaColumn, "referenceLevel"> | null,
  explicitPositiveLevel?: string | number | null,
): { event: string | null; reference: string | null; source: "explicit" | "referenceLevel" | "heuristic" | "none" } {
  if (levels.length !== 2) return { event: null, reference: null, source: "none" };
  const levelByString = new Map(levels.map((level) => [String(level), level]));
  const explicit = explicitPositiveLevel === undefined ? null : explicitPositiveLevel;
  if (explicit !== null && levelByString.has(String(explicit))) {
    const event = levelByString.get(String(explicit)) ?? null;
    return { event, reference: levels.find((level) => level !== event) ?? null, source: "explicit" };
  }
  const referenceLevel = schemaCol?.referenceLevel;
  if (referenceLevel !== undefined && referenceLevel !== null && levelByString.has(String(referenceLevel))) {
    const reference = levelByString.get(String(referenceLevel)) ?? null;
    return { event: levels.find((level) => level !== reference) ?? null, reference, source: "referenceLevel" };
  }
  const ordered = [...levels].sort((a, b) => {
    const left = naturalLevelKey(a);
    const right = naturalLevelKey(b);
    if (left[0] !== right[0]) return left[0] - right[0];
    if (typeof left[1] === "number" && typeof right[1] === "number") return left[1] - right[1];
    return String(left[1]).localeCompare(String(right[1]));
  });
  return { event: ordered[1], reference: ordered[0], source: "heuristic" };
}

export function isEligibleModelingOutcome(schema: Schema, columnName: string, data: DataFrame | null = null): boolean {
  const col = schema.columns.find((c) => c.name === columnName);
  if (!col || col.exclusionReason) return false;
  if (["id_like", "date", "unsupported", "continuous"].includes(col.confirmedType)) return false;
  if (col.confirmedType === "binary") return true;
  if (["categorical_nominal", "categorical_ordinal"].includes(col.confirmedType)) {
    const observed = observedLevelCount(data, col.name);
    return observed === 2 || (!data && col.levels?.length === 2);
  }
  return false;
}

export function defaultModelingSetup(schema: Schema, groupingVariable?: string | null, seed = 20260229, data: DataFrame | null = null): ModelingSetup {
  const outcome =
    groupingVariable && isEligibleModelingOutcome(schema, groupingVariable, data)
      ? groupingVariable
      : schema.columns.find((c) => isEligibleModelingOutcome(schema, c.name, data))?.name ?? "";
  const predictors = schema.columns
    .filter((c) => !c.exclusionReason && c.name !== outcome && c.confirmedType !== "id_like" && c.confirmedType !== "unsupported" && c.confirmedType !== "date")
    .map((c) => c.name);
  const referenceLevels = Object.fromEntries(
    schema.columns
      .filter((c) => c.referenceLevel !== undefined || c.levels?.length)
      .map((c) => [c.name, c.referenceLevel ?? c.levels?.[0]?.code ?? ""])
  );

  return {
    outcome,
    outcomePositiveLevel: undefined,
    predictors,
    referenceLevels,
    imputation: { policy: "complete_case", m: 20, knnNeighbors: 5 },
    goal: "adjust",
    seed,
    model: "ridge",
    lambdaRule: "lambda_1se",
    validationB: 200,
    ciBootstrapB: 200,
    fastMode: true,
    validationCiMethod: "oob",
    subgroupVars: [],
  };
}
