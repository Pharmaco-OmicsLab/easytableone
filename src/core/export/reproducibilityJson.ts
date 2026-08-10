import type { AnalysisPlan, FormattedTable, Schema, StatisticalResults, DataQualityRecord, UserOverrides } from "../types";
import { effectiveIncludeOutcome, type ModelingResults } from "../modeling/types";
import { journalRulesets } from "../format/formatTable";
import { PYODIDE_VERSION, pyodideRuntimeLabel } from "../runtimeEnvironment";

export interface ReproducibilityWarning {
  checkId: string;
  tier: string;
  category: string;
  variable?: string;
  title: string;
  affectedCount?: number;
  response: string;
  timestamp: string;
  fixDetails?: string;
  metadataOnly?: Record<string, string | number | boolean | null>;
}

export function toReproducibilityWarning(record: DataQualityRecord): ReproducibilityWarning {
  return {
    checkId: record.finding.checkId,
    tier: record.finding.tier,
    category: record.finding.category,
    variable: record.finding.variable,
    title: record.finding.title,
    affectedCount: record.finding.affectedCount,
    response: record.response,
    timestamp: record.timestamp,
    fixDetails: record.fixDetails,
    metadataOnly: record.finding.metadataOnly,
  };
}

export interface UserOverrideMetadata {
  field: string;
  rulesetDefault: any;
  overrideValue: any;
  timestamp: string;
}

export function compileUserOverrides(
  overrides: UserOverrides | undefined,
  journalId: string,
  timestamp: string = new Date().toISOString()
): UserOverrideMetadata[] | undefined {
  if (!overrides || Object.keys(overrides).length === 0) return undefined;

  const defaultJournal = journalRulesets.EasyTableOne_Ruleset.journals.find(
    (j) => j.journal_id.toLowerCase() === journalId.toLowerCase()
  );
  if (!defaultJournal) return undefined;

  const list: UserOverrideMetadata[] = [];

  // numberFormat.thousandSeparator
  if (overrides.numberFormat?.thousandSeparator !== undefined) {
    list.push({
      field: "numberFormat.thousandSeparator",
      rulesetDefault: defaultJournal.number_format?.thousand_separator ?? false,
      overrideValue: overrides.numberFormat.thousandSeparator,
      timestamp,
    });
  }

  // numberFormat.decimalPlaces
  if (overrides.numberFormat?.decimalPlaces !== undefined) {
    list.push({
      field: "numberFormat.decimalPlaces",
      rulesetDefault: defaultJournal.number_format?.decimal_precision ?? 1,
      overrideValue: overrides.numberFormat.decimalPlaces,
      timestamp,
    });
  }

  // numberFormat.suppressTrailingZeros
  if (overrides.numberFormat?.suppressTrailingZeros !== undefined) {
    list.push({
      field: "numberFormat.suppressTrailingZeros",
      rulesetDefault: defaultJournal.number_format?.suppress_trailing_zero ?? true,
      overrideValue: overrides.numberFormat.suppressTrailingZeros,
      timestamp,
    });
  }

  // iqrDelimiter
  if (overrides.iqrDelimiter !== undefined) {
    list.push({
      field: "iqrDelimiter",
      rulesetDefault: defaultJournal.summary_statistics.iqr_delimiter,
      overrideValue: overrides.iqrDelimiter,
      timestamp,
    });
  }

  // pValueThreshold
  if (overrides.pValueThreshold !== undefined) {
    list.push({
      field: "pValueThreshold",
      rulesetDefault: defaultJournal.p_value_formatting.threshold_low,
      overrideValue: overrides.pValueThreshold,
      timestamp,
    });
  }

  // pValueSignificantDigits
  if (overrides.pValueSignificantDigits !== undefined) {
    list.push({
      field: "pValueSignificantDigits",
      rulesetDefault: defaultJournal.p_value_formatting.max_decimal_places,
      overrideValue: overrides.pValueSignificantDigits,
      timestamp,
    });
  }

  // titleTemplate
  if (overrides.titleTemplate !== undefined) {
    list.push({
      field: "titleTemplate",
      rulesetDefault: defaultJournal.table_title_template ?? null,
      overrideValue: overrides.titleTemplate,
      timestamp,
    });
  }

  // variableCodingSectionTitle
  if (overrides.variableCodingSectionTitle !== undefined) {
    list.push({
      field: "variableCodingSectionTitle",
      rulesetDefault: defaultJournal.variable_coding_section_title ?? null,
      overrideValue: overrides.variableCodingSectionTitle,
      timestamp,
    });
  }

  if (overrides.showPlannedZeroCountLevels !== undefined) {
    list.push({
      field: "showPlannedZeroCountLevels",
      rulesetDefault: false,
      overrideValue: overrides.showPlannedZeroCountLevels,
      timestamp,
    });
  }

  if (overrides.showMissingDataRows !== undefined) {
    list.push({
      field: "showMissingDataRows",
      rulesetDefault: false,
      overrideValue: overrides.showMissingDataRows,
      timestamp,
    });
  }

  if (overrides.hidePValueColumn !== undefined) {
    list.push({
      field: "userOverrides.hidePValueColumn",
      rulesetDefault: false,
      overrideValue: overrides.hidePValueColumn,
      timestamp,
    });
  }

  return list.length > 0 ? list : undefined;
}

export interface ReproducibilityData {
  appVersion: string;
  rulesetVersion: string;
  libraryVersions: Record<string, string>;
  analysisPlan: AnalysisPlan;
  schema: Schema;
  results: StatisticalResults;
  formattedTable: FormattedTable;
  generatedAt: string;
  dataQualityWarnings: ReproducibilityWarning[];
  userOverrides?: UserOverrideMetadata[];
  // Optional: SHA-256 hash of input file content. Off by default per privacy-first
  // design (D15). User can opt in via Settings → "Include input data hash in
  // reproducibility JSON (helps verify the same input was used; does NOT include
  // the data itself)".
  inputDataHash?: string;
  testOverrides?: {
    variable: string;
    method: string;
    autoMethod: string;
    assumptionCheckContradicted: boolean;
    timestamp: string;
  }[];
  modeling?: {
    outcome: string;
    predictors: string[];
    subgroupVars?: string[];
    outcomePositiveLevelConfigured?: string | null;
    model?: string;
    lambda?: number | null;
    lambdaRuleApplied?: string | null;
    outcomePositiveLevel?: string | null;
    outcomeReferenceLevel?: string | null;
    seed: number;
    m: number;
    imputationOutcomeIncluded: boolean;
    B?: number;
    validationMethod?: string;
    validationCiMethod?: string;
    validationCiMethodConfigured?: string;
    validationCiLevel?: number;
    validationPerformance?: {
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
    };
    validationSubgroups?: NonNullable<ModelingResults["logistic"]>["subgroups"];
    decisionCurve?: {
      basis: string;
      prevalence: number;
      points: Array<{ threshold: number; netBenefit: number | null; netBenefitTreatAll: number | null }>;
    } | null;
    ciBootstrapB?: number;
    classImbalanceHandling?: "none_stratified_cv";
    environment?: {
      runtime: string;
      pyodideVersion: string;
    };
    imputationMethod?: string;
    ciMethods?: string[];
    terms?: Array<{
      label: string;
      ciMethod?: string;
      selectionFrequency?: number | null;
    }>;
    regime?: {
      n: number;
      events: number;
      nonevents: number;
      p: number;
      epv: number;
    };
    ml?: {
      models: string[];
      folds: {
        nSplits: number;
        nRepeats: number;
        seed: number;
      };
      imputationMethod?: string;
      nEvaluated?: number;
      confusionBasis?: string;
      classificationThreshold?: number;
      comparison: Array<{
        model: string;
        auc: { mean: number | null; sd: number | null; ciLow?: number | null; ciHigh?: number | null; ciBasis?: "logit" | "fisher_z" };
        sens: { mean: number | null; sd: number | null; ciLow?: number | null; ciHigh?: number | null; ciBasis?: "logit" | "fisher_z" };
        spec: { mean: number | null; sd: number | null; ciLow?: number | null; ciHigh?: number | null; ciBasis?: "logit" | "fisher_z" };
        balacc: { mean: number | null; sd: number | null; ciLow?: number | null; ciHigh?: number | null; ciBasis?: "logit" | "fisher_z" };
        mcc?: { mean: number | null; sd: number | null; ciLow?: number | null; ciHigh?: number | null; ciBasis?: "logit" | "fisher_z" };
        f1?: { mean: number | null; sd: number | null; ciLow?: number | null; ciHigh?: number | null; ciBasis?: "logit" | "fisher_z" };
        hyperparameters?: Record<string, string | number | boolean | null>;
      }>;
      decisionCurves?: Record<string, {
        basis: string;
        prevalence: number;
        points: Array<{ threshold: number; netBenefit: number | null; netBenefitTreatAll: number | null }>;
      }>;
      subgroups?: Record<string, NonNullable<NonNullable<ModelingResults["ml"]>["models"][number]["subgroups"]>>;
    };
  };
}

function omitDisplayOnlySchemaFields(schema: Schema): Schema {
  return schema;
}

function compactDecisionCurves(models: NonNullable<ModelingResults["ml"]>["models"]) {
  const entries: Array<[string, NonNullable<(typeof models)[number]["decisionCurve"]>]> = [];
  for (const model of models) {
    if (model.decisionCurve) entries.push([model.name, model.decisionCurve]);
  }
  return Object.fromEntries(entries);
}

function compactMlSubgroups(models: NonNullable<ModelingResults["ml"]>["models"]) {
  const entries: Array<[string, NonNullable<(typeof models)[number]["subgroups"]>]> = [];
  for (const model of models) {
    if (model.subgroups && model.subgroups.length > 0) entries.push([model.name, model.subgroups]);
  }
  return Object.fromEntries(entries);
}

export function generateReproducibilityJson(args: {
  plan: AnalysisPlan;
  schema: Schema;
  results: StatisticalResults;
  formattedTable: FormattedTable;
  appVersion: string;
  inputDataHash?: string;  // optional; only set if user opted in
  dataQualityWarnings?: DataQualityRecord[];
  timestamp?: string;
  modelingResults?: ModelingResults | null;
}): string {
  const overridesTimestamp = args.timestamp ?? new Date().toISOString();
  const compiledOverrides = compileUserOverrides(
    args.plan.userOverrides,
    args.formattedTable.journal,
    overridesTimestamp
  );

  const compiledTestOverrides = args.plan.testOverrides?.map(o => {
    const v = args.results.perVariable.find(item => item.variable === o.variable);
    return {
      variable: o.variable,
      method: o.method,
      autoMethod: String(v?.test.auxiliary?.autoMethod ?? (v?.test.name || "")),
      assumptionCheckContradicted: v?.test.auxiliary?.assumptionCheckContradicted === "true",
      timestamp: o.timestamp
    };
  });
  const generatedAt = args.timestamp ?? new Date().toISOString();
  const auditLog = [...(args.plan.auditLog ?? [])];
  if ((args.plan.studyDesign ?? "unspecified") !== "unspecified") {
    auditLog.push({
      timestamp: generatedAt,
      action: "Study design declared",
      details: { studyDesign: args.plan.studyDesign ?? "unspecified" },
    });
  }
  if (args.plan.userOverrides?.hidePValueColumn !== undefined) {
    auditLog.push({
      timestamp: generatedAt,
      action: "P-value column display override",
      details: { "userOverrides.hidePValueColumn": args.plan.userOverrides.hidePValueColumn },
    });
  }
  const analysisPlan = auditLog.length === (args.plan.auditLog ?? []).length
    ? args.plan
    : { ...args.plan, auditLog };

  const data: ReproducibilityData = {
    appVersion: args.appVersion,
    rulesetVersion: args.formattedTable.rulesetVersion,
    libraryVersions: args.results.computeMetadata.libVersions,
    analysisPlan,
    schema: omitDisplayOnlySchemaFields(args.schema),
    results: args.results,
    formattedTable: args.formattedTable,
    generatedAt,
    dataQualityWarnings: (args.dataQualityWarnings ?? []).map(toReproducibilityWarning),
    ...(compiledOverrides && { userOverrides: compiledOverrides }),
    ...(args.inputDataHash !== undefined && { inputDataHash: args.inputDataHash }),
    ...(compiledTestOverrides && compiledTestOverrides.length > 0 && { testOverrides: compiledTestOverrides }),
    ...(args.modelingResults && (args.modelingResults.logistic || args.modelingResults.ml) && {
      modeling: {
        outcome: args.modelingResults.setup.outcome,
        predictors: args.modelingResults.setup.predictors,
        subgroupVars: args.modelingResults.setup.subgroupVars ?? [],
        outcomePositiveLevelConfigured: args.modelingResults.setup.outcomePositiveLevel ?? null,
        seed: args.modelingResults.setup.seed,
        m: args.modelingResults.setup.imputation.m,
        imputationOutcomeIncluded: effectiveIncludeOutcome(args.modelingResults.setup.imputation),
        validationCiMethodConfigured: args.modelingResults.setup.validationCiMethod,
        classImbalanceHandling: "none_stratified_cv",
        environment: {
          runtime: pyodideRuntimeLabel(),
          pyodideVersion: PYODIDE_VERSION,
        },
        ...(args.modelingResults.logistic && {
          model: args.modelingResults.logistic.model,
          lambda: args.modelingResults.logistic.lambda,
          lambdaRuleApplied: args.modelingResults.logistic.lambdaRuleApplied,
          outcomePositiveLevel: args.modelingResults.logistic.outcomeEventLevel,
          outcomeReferenceLevel: args.modelingResults.logistic.outcomeReferenceLevel,
          B: args.modelingResults.setup.validationB,
          validationMethod: args.modelingResults.logistic.validation?.method,
          validationCiMethod: args.modelingResults.logistic.validation?.ciMethod,
          validationCiLevel: args.modelingResults.logistic.validation?.ciLevel,
          validationPerformance: args.modelingResults.logistic.validation ? {
            aucCorrected: args.modelingResults.logistic.validation.aucCorrected,
            aucCorrectedCi: args.modelingResults.logistic.validation.aucCorrectedCi ?? null,
            calibrationSlope: args.modelingResults.logistic.validation.calibrationSlope,
            calibrationSlopeCi: args.modelingResults.logistic.validation.calibrationSlopeCi ?? null,
            calibrationIntercept: args.modelingResults.logistic.validation.calibrationIntercept,
            calibrationInterceptCi: args.modelingResults.logistic.validation.calibrationInterceptCi ?? null,
            brier: args.modelingResults.logistic.validation.brier,
            brierCi: args.modelingResults.logistic.validation.brierCi ?? null,
            mcc: args.modelingResults.logistic.validation.mcc ?? null,
            mccCi: args.modelingResults.logistic.validation.mccCi ?? null,
            f1: args.modelingResults.logistic.validation.f1 ?? null,
            f1Ci: args.modelingResults.logistic.validation.f1Ci ?? null,
          } : undefined,
          validationSubgroups: args.modelingResults.logistic.subgroups ?? [],
          decisionCurve: args.modelingResults.logistic.decisionCurve ?? null,
          ciBootstrapB: args.modelingResults.setup.ciBootstrapB,
          imputationMethod: args.modelingResults.logistic.imputationMethod,
          ciMethods: Array.from(new Set(args.modelingResults.logistic.adjusted.map((row) => row.ciMethod).filter(Boolean) as string[])),
          terms: args.modelingResults.logistic.adjusted.map((row) => ({
            label: row.label,
            ciMethod: row.ciMethod,
            selectionFrequency: row.selectionFrequency ?? null,
          })),
          regime: {
            n: args.modelingResults.logistic.regime.n,
            events: args.modelingResults.logistic.regime.events,
            nonevents: args.modelingResults.logistic.regime.nonevents,
            p: args.modelingResults.logistic.regime.p,
            epv: args.modelingResults.logistic.regime.epv,
          },
        }),
        ...(args.modelingResults.ml && {
          ml: {
            models: args.modelingResults.ml.models.map((model) => model.name),
            folds: args.modelingResults.ml.folds,
            imputationMethod: args.modelingResults.ml.imputationMethod,
            nEvaluated: args.modelingResults.ml.nEvaluated,
            confusionBasis: args.modelingResults.ml.confusionBasis,
            classificationThreshold: args.modelingResults.ml.classificationThreshold,
            comparison: args.modelingResults.ml.comparison.map((row) => ({
              ...row,
              hyperparameters: args.modelingResults!.ml!.models.find((model) => model.name === row.model)?.hyperparameters ?? {},
            })),
            decisionCurves: compactDecisionCurves(args.modelingResults.ml.models),
            subgroups: compactMlSubgroups(args.modelingResults.ml.models),
          },
        }),
      },
    }),
  };
  return JSON.stringify(data, null, 2);
}
