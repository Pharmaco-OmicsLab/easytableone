/**
 * src/core/export/analysisHistory.ts
 *
 * Generates a standalone, runnable `analysis_history.py` Python script
 * that reproduces the EasyTableOne analysis from source data.
 *
 * This is a code GENERATOR — it produces a Python string. No Python
 * is executed at this stage. The generated script imports pandas/scipy
 * directly (no EasyTableOne dependency) so it can be run on any machine
 * with a compatible Python environment.
 *
 * D37: exported alongside docx as a standalone runnable Python script.
 */
import type { AnalysisPlan, StatisticalResults, Schema, SchemaColumn, DataQualityRecord, JournalConfig } from '../types';
import { getColumnDisplayLabel } from '../format/columnLabel';
import { stripBracketCodes } from '../format/tableTitle';
import { getEffectiveJournalSettings } from '../format/getEffectiveJournalSettings';
import { formatStatisticalNumberAtPrecision, numberFormatFromJournalConfig, resolveRowPrecision } from '../format/numberFormat';
import { buildOutlierHistoryLine } from '../format/outlierNote';
import { getModelingRationales } from '../modeling/rationale';
import type { ModelingResults } from '../modeling/types';
import { isFisherLike } from '../format/testName';
import { categoricalDisplayLevels, reorderLevelsTailLast } from '../format/levelOrdering';
import { buildContinuousLabel, formatPValue, getContinuousSummaryString } from '../format/formatTable';

export interface SourceMetadata {
  filename: string;
  sheetName?: string;
  sha256?: string;
  droppedMissingGroupingRows?: number;
}

function pyStr(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Serialize JSON-compatible values using Python's literal spellings. */
function pyLiteral(value: unknown): string {
  if (value === null || value === undefined) return 'None';
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'None';
  if (typeof value === 'string') return pyStr(value);
  if (Array.isArray(value)) return `[${value.map(pyLiteral).join(', ')}]`;
  if (typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${pyStr(key)}: ${pyLiteral(item)}`)
      .join(', ')}}`;
  }
  return 'None';
}

function resolveLabel(schemaCol: SchemaColumn | undefined, code: string | number): string {
  if (!schemaCol?.levels) return String(code);
  const lv = schemaCol.levels.find(
    (l) => String(l.code) === String(code) || l.code === code
  );
  return lv?.label ?? String(code);
}

function variableBlock(
  v: (StatisticalResults['perVariable'])[0],
  plan: AnalysisPlan,
  schema: Schema,
  journalConfig: JournalConfig,
): string {
  const schemaCol = schema.columns.find((c) => c.name === v.variable);
  const colLabel = schemaCol
    ? getColumnDisplayLabel(schemaCol, 'stripped')
    : v.variable;
  const varKey = pyStr(v.variable);
  const groupKey = pyStr(plan.groupingVariable);
  const isContinuous = v.overallSummary['mean'] !== undefined || v.overallSummary['median'] !== undefined;
  const isCategorical = v.overallSummary['counts'] !== undefined;

  const headerLabel = isContinuous
    ? buildContinuousLabel(
        colLabel,
        getContinuousSummaryString(v.test.name, journalConfig.summary_statistics),
        schemaCol?.units,
        journalConfig.summary_statistics.continuous_label_template,
      )
    : colLabel;

  const lines: string[] = [];
  lines.push(`# === ${headerLabel} ===`);

  const override = plan.testOverrides?.find((o) => o.variable === v.variable);
  if (override) {
    lines.push(`# User selected ${v.test.name} for this variable (auto-selected: ${v.test.auxiliary?.autoMethod}).`);
    const hasContradiction = v.test.auxiliary?.assumptionCheckContradicted === "true";
    if (hasContradiction) {
      const reason = v.test.auxiliary?.contradictionReason;
      let warningText: string;
      if (reason === "unequal_variance") {
        const leveneP = v.test.auxiliary?.levenePValue;
        const levenePNum = typeof leveneP === "number" ? leveneP : typeof leveneP === "string" ? parseFloat(leveneP) : undefined;
        const p = levenePNum !== undefined ? (levenePNum < 0.001 ? "< 0.001" : levenePNum.toFixed(2)) : "";
        warningText = `Levene/Brown-Forsythe p = ${p} indicates unequal group variances; one-way ANOVA assumes equal variances, so its P-value may be unreliable. Welch's ANOVA is the indicated alternative but is not available in this release.`;
      } else if (reason === "low_expected_count" || (!reason && isCategorical)) {
        warningText = `Some expected cell counts are < 5; the chi-square approximation is unreliable, so Fisher's exact test is recommended.`;
      } else {
        const shapiroP = v.test.auxiliary?.shapiroPValue;
        const shapiroPNum = typeof shapiroP === "number" ? shapiroP : typeof shapiroP === "string" ? parseFloat(shapiroP) : undefined;
        const pValStr = shapiroPNum !== undefined ? (shapiroPNum < 0.001 ? "< 0.001" : shapiroPNum.toFixed(2)) : "";
        warningText = `Shapiro–Wilk p = ${pValStr} indicates the data are not normally distributed; a t-test assumes normality, so its P-value may be unreliable. Mann–Whitney U is recommended.`;
      }
      lines.push(`# ${warningText}`);
    }
  }

  // Recoding block
  if (schemaCol?.levels && schemaCol.levels.length > 0) {
    lines.push(`# Levels: ${schemaCol.levels.map((l) => `${l.code}=${l.label}`).join(', ')}`);
    if (schemaCol.referenceLevel !== undefined) {
      lines.push(`# Reference level: ${resolveLabel(schemaCol, schemaCol.referenceLevel)}`);
    }
  }

  const safeName = v.variable.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_');
  const groups = Object.keys(v.summaryByGroup);
  const gSafes = groups.map(g => `${safeName}_${g.replace(/[^a-zA-Z0-9_]/g, '_')}`).join(', ');

  const numFmtOpts = numberFormatFromJournalConfig(journalConfig.number_format);
  const decSep = journalConfig.p_value_formatting.decimal_separator || ".";
  function fmtStat(value: number, precision: number): string {
    const s = formatStatisticalNumberAtPrecision(value, precision, numFmtOpts);
    if (decSep !== '.') {
      return s.replace('.', decSep);
    }
    return s;
  }
  const iqrDelim = journalConfig.summary_statistics.iqr_delimiter || " to ";

  if (isContinuous) {
    const isNonNormal = v.test.name === 'Mann-Whitney U' || v.test.name === 'Kruskal-Wallis';
    const rowValues: number[] = [];
    for (const g of groups) {
      const gs = v.summaryByGroup[g];
      if (!gs || gs.n === 0) continue;
      if (isNonNormal) {
        if (typeof gs['median'] === 'number') rowValues.push(gs['median'] as number);
        if (typeof gs['q25'] === 'number') rowValues.push(gs['q25'] as number);
        if (typeof gs['q75'] === 'number') rowValues.push(gs['q75'] as number);
      } else {
        if (typeof gs['mean'] === 'number') rowValues.push(gs['mean'] as number);
        if (typeof gs['sd'] === 'number') rowValues.push(gs['sd'] as number);
      }
    }
    const rowPrecision = resolveRowPrecision(rowValues, numFmtOpts);

    if (isNonNormal) {
      lines.push(`# Type: continuous  |  Normality: rejected  |  Test: ${v.test.name}`);
    } else {
      lines.push(`# Type: continuous  |  Normality: not rejected  |  Test: ${v.test.name}`);
    }

    groups.forEach((g) => {
      const gs = v.summaryByGroup[g];
      const gSafe = g.replace(/[^a-zA-Z0-9_]/g, '_');
      lines.push(`${safeName}_${gSafe} = df[df[${groupKey}] == ${pyStr(g)}][${varKey}].dropna()`);
      if (isNonNormal) {
        const med = gs?.['median'];
        const q25 = gs?.['q25'];
        const q75 = gs?.['q75'];
        if (med !== undefined && q25 !== undefined && q75 !== undefined) {
          lines.push(`# ${g}: median=${fmtStat(med as number, rowPrecision)}, IQR=[${fmtStat(q25 as number, rowPrecision)}${iqrDelim}${fmtStat(q75 as number, rowPrecision)}]`);
        }
      } else {
        const m = gs?.['mean'];
        const s = gs?.['sd'];
        if (m !== undefined) {
          const mStr = fmtStat(m as number, rowPrecision);
          const sStr = s !== undefined ? fmtStat(s as number, rowPrecision) : 'NA';
          lines.push(`# ${g}: mean=${mStr}, SD=${sStr}`);
        }
      }
    });

    if (groups.length === 2) {
      const g0Safe = groups[0].replace(/[^a-zA-Z0-9_]/g, '_');
      const g1Safe = groups[1].replace(/[^a-zA-Z0-9_]/g, '_');
      const docxP = formatPValue(v.test.pValue, journalConfig.p_value_formatting);
      if (v.test.name === 'Mann-Whitney U') {
        lines.push(`u_${safeName}, p_${safeName} = stats.mannwhitneyu(${safeName}_${g0Safe}, ${safeName}_${g1Safe}, alternative="two-sided")`);
        if (v.test.pValue !== null) {
          lines.push(`print(f"[${colLabel}] Mann-Whitney U: stat={u_${safeName}:.4f}, p={_eto_format_p_value(p_${safeName})}")  # EasyTableOne p=${docxP}`);
        }
      } else if (v.test.name === "Welch's t-test" || v.test.name === 'Student t-test') {
        lines.push(`t_${safeName}, p_${safeName} = stats.ttest_ind(${safeName}_${g0Safe}, ${safeName}_${g1Safe}, equal_var=False)`);
        if (v.test.pValue !== null) {
          lines.push(`print(f"[${colLabel}] ${v.test.name}: stat={t_${safeName}:.4f}, p={_eto_format_p_value(p_${safeName})}")  # EasyTableOne p=${docxP}`);
        }
      } else {
        lines.push(`# Test: ${v.test.name}`);
        if (v.test.pValue !== null) {
          lines.push(`print(f"[${colLabel}] ${v.test.name}: p={_eto_format_p_value(p_${safeName})}")  # EasyTableOne p=${docxP}`);
        }
      }
    } else if (groups.length > 2) {
      const docxP = formatPValue(v.test.pValue, journalConfig.p_value_formatting);
      if (v.test.name === 'ANOVA') {
        lines.push(`f_${safeName}, p_${safeName} = stats.f_oneway(${gSafes})`);
        if (v.test.pValue !== null) {
          lines.push(`print(f"[${colLabel}] ANOVA: stat={f_${safeName}:.4f}, p={_eto_format_p_value(p_${safeName})}")  # EasyTableOne p=${docxP}`);
        }
      } else if (v.test.name === 'Kruskal-Wallis') {
        lines.push(`h_${safeName}, p_${safeName} = stats.kruskal(${gSafes})`);
        if (v.test.pValue !== null) {
          lines.push(`print(f"[${colLabel}] Kruskal-Wallis: stat={h_${safeName}:.4f}, p={_eto_format_p_value(p_${safeName})}")  # EasyTableOne p=${docxP}`);
        }
      } else {
        lines.push(`# Test: ${v.test.name}`);
        if (v.test.pValue !== null) {
          lines.push(`print(f"[${colLabel}] ${v.test.name}: p={_eto_format_p_value(p_${safeName})}")  # EasyTableOne p=${docxP}`);
        }
      }
    }
    if (v.postHoc) {
      lines.push(`# Post-hoc pairwise comparisons (${v.postHoc.correction} correction).`);
      if (v.postHoc.method === "tukey_hsd") {
        lines.push(`posthoc_${safeName} = pairwise_tukeyhsd(df[${varKey}].dropna(), df.loc[df[${varKey}].notna(), ${groupKey}], alpha=0.05)`);
      } else if (v.postHoc.method === "dunn") {
        lines.push(`# Dunn's test (Holm-adjusted).`);
        lines.push(`posthoc_${safeName} = scikit_posthocs.posthoc_dunn([${gSafes}], p_adjust="holm")`);
      }
      for (const pair of v.postHoc.pairs.filter((p) => p.significant)) {
        lines.push(`# Significant post-hoc pair: ${pair.groupA} vs ${pair.groupB}, corrected p=${pair.pValueCorrected?.toFixed(4) ?? 'NA'}`);
      }
      if (v.postHoc.caveat) {
        lines.push(`# ${v.postHoc.caveat}`);
      }
    }

  } else if (isCategorical) {
    lines.push(`# Type: categorical  |  Test: ${v.test.name}`);
    lines.push(`# Summary reported as: ${journalConfig.summary_statistics.categorical}`);
    lines.push(`ct_${safeName} = pd.crosstab(df[${varKey}], df[${groupKey}])`);
    const counts = v.overallSummary.counts as Record<string, number> | undefined;
    if (counts) {
      const rawLevels = categoricalDisplayLevels(counts, schemaCol, false);
      const levels = schemaCol?.confirmedType === 'categorical_ordinal'
        ? rawLevels
        : reorderLevelsTailLast(rawLevels, (k) => resolveLabel(schemaCol, k));
      if (levels.length > 0) {
        lines.push(`ct_${safeName} = ct_${safeName}.reindex([${levels.map((level) => pyStr(String(level))).join(', ')}], fill_value=0)`);
      }
    }

    if (v.test.name === 'Chi-square') {
      lines.push(`chi2_${safeName}, p_${safeName}, df_${safeName}, expected_${safeName} = scipy.stats.chi2_contingency(ct_${safeName}, correction=False)`);
    } else if (isFisherLike(v.test.name)) {
      const numRows = Object.keys(v.overallSummary.counts || {}).length;
      const numCols = Object.keys(v.summaryByGroup || {}).length;
      const is2x2 = numRows === 2 && numCols === 2;

      if (is2x2) {
        lines.push(`# Fisher's exact — scipy >= 1.15 supports R×C tables`);
        lines.push(`result_${safeName} = scipy.stats.fisher_exact(ct_${safeName}.values)`);
      } else {
        lines.push(`# Fisher's exact — scipy >= 1.15 supports R×C tables`);
        lines.push(`result_${safeName} = scipy.stats.fisher_exact(ct_${safeName}.values, method=scipy.stats.MonteCarloMethod(rng=rng))`);
      }
      lines.push(`p_${safeName} = result_${safeName}.pvalue`);
    } else {
      lines.push(`# Test: ${v.test.name}`);
    }

    if (v.test.pValue !== null) {
      lines.push(`print(f"[${colLabel}] ${v.test.name}: p={_eto_format_p_value(p_${safeName})}")  # EasyTableOne p=${formatPValue(v.test.pValue, journalConfig.p_value_formatting)}`);
    }
    lines.push(`print(ct_${safeName})`);
    if (v.postHoc) {
      lines.push(`# Post-hoc pairwise categorical comparisons used chi-square when expected counts were >= 5, otherwise Fisher's exact, then Holm correction.`);
      for (const pair of v.postHoc.pairs.filter((p) => p.significant)) {
        lines.push(`# Significant post-hoc pair: ${pair.groupA} vs ${pair.groupB}, corrected p=${pair.pValueCorrected?.toFixed(4) ?? 'NA'}`);
      }
    }
  }

  lines.push('');
  return lines.join('\n');
}

function modelingBlock(modelingResults: ModelingResults | null | undefined): string {
  if (!modelingResults || (!modelingResults.logistic && !modelingResults.ml)) return '';
  const setup = modelingResults.setup;
  const rationales = getModelingRationales(setup, modelingResults);
  const lines: string[] = [];
  const predictors = setup.predictors.map(pyStr).join(', ');
  const modeledEventLevel = setup.outcomePositiveLevel ?? modelingResults.logistic?.outcomeEventLevel;

  lines.push('');
  lines.push('# === Modeling analysis ===');
  lines.push('# Requires: scikit-learn' + (modelingResults.logistic?.model === 'firth' ? ', firthlogist' : ''));
  lines.push(`# Outcome: ${setup.outcome}`);
  if (modeledEventLevel !== undefined && modeledEventLevel !== null) {
    lines.push(`# Modeled event level: ${modeledEventLevel}; reference/non-event: ${modelingResults.logistic?.outcomeReferenceLevel ?? 'not recorded'}`);
  }
  lines.push(`# Candidate predictors: ${setup.predictors.join(', ')}`);
  lines.push(`# Imputation: ${rationales.imputation.what}. Why: ${rationales.imputation.why}`);
  lines.push(`# Logistic model: ${rationales.model.what}. Why: ${rationales.model.why}`);
  if (modelingResults.logistic?.validation) {
    lines.push(`# Logistic validation: ${rationales.logisticValidation.what}. Why: ${rationales.logisticValidation.why}`);
  }
  if (modelingResults.ml) {
    lines.push(`# ML evaluated sample: ${modelingResults.ml.imputationMethod ?? 'complete_case'}${modelingResults.ml.nEvaluated !== undefined ? `, N=${modelingResults.ml.nEvaluated}` : ''}; confusion basis: ${modelingResults.ml.confusionBasis ?? 'pooled_repeated_cv'}`);
    lines.push(`# ML validation: ${rationales.mlValidation.what}. Why: ${rationales.mlValidation.why}`);
    lines.push(`# ROC averaging: ${rationales.rocAveraging.what}. Why: ${rationales.rocAveraging.why}`);
    lines.push(`# Variable importance: ${rationales.variableImportance.what}. Why: ${rationales.variableImportance.why}`);
  }
  lines.push('from sklearn.compose import ColumnTransformer');
  lines.push('from sklearn.impute import SimpleImputer');
  if (setup.imputation.policy === 'mice') {
    lines.push('from sklearn.experimental import enable_iterative_imputer  # noqa: F401');
    lines.push('from sklearn.impute import IterativeImputer');
  }
  lines.push('from sklearn.metrics import roc_auc_score, brier_score_loss, f1_score, matthews_corrcoef');
  lines.push('from sklearn.model_selection import RepeatedStratifiedKFold');
  lines.push('from sklearn.pipeline import Pipeline');
  lines.push('from sklearn.preprocessing import OneHotEncoder, StandardScaler');
  lines.push('from sklearn.linear_model import LogisticRegression');
  lines.push('');
  lines.push(`modeling_outcome = ${pyStr(setup.outcome)}`);
  lines.push(`modeling_predictors = [${predictors}]`);
  lines.push('model_df = df[[modeling_outcome] + modeling_predictors].copy()');
  if (setup.imputation.policy === 'complete_case') {
    lines.push('model_df = model_df.dropna(subset=[modeling_outcome] + modeling_predictors)');
  } else {
    lines.push(`# EasyTableOne used MICE with m=${setup.imputation.m}; this portable script shows one IterativeImputer pass as a runnable approximation of the first completed data set.`);
    lines.push('model_df = model_df.dropna(subset=[modeling_outcome])');
  }
  lines.push('X_model = model_df[modeling_predictors]');
  if (modeledEventLevel !== undefined && modeledEventLevel !== null) {
    lines.push(`modeling_event_level = ${pyStr(String(modeledEventLevel))}`);
    lines.push('y_model = (model_df[modeling_outcome].astype(str) == modeling_event_level).astype(int)');
  } else {
    lines.push('# outcomePositiveLevel was not recorded; using the exported outcome values as-is.');
    lines.push('y_model = model_df[modeling_outcome]');
  }
  lines.push('numeric_cols = X_model.select_dtypes(include=[np.number]).columns.tolist()');
  lines.push('categorical_cols = [c for c in modeling_predictors if c not in numeric_cols]');
  lines.push('preprocess = ColumnTransformer([');
  lines.push('    ("num", Pipeline([("imputer", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric_cols),');
  lines.push('    ("cat", Pipeline([("imputer", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), categorical_cols),');
  lines.push('])');
  if (setup.imputation.policy === 'mice') {
    lines.push('numeric_cols_for_mice = X_model.select_dtypes(include=[np.number]).columns.tolist()');
    lines.push('if numeric_cols_for_mice:');
    lines.push('    X_model.loc[:, numeric_cols_for_mice] = IterativeImputer(sample_posterior=True, random_state=SEED).fit_transform(X_model[numeric_cols_for_mice])');
  }
  const logisticModel = modelingResults.logistic?.model ?? setup.model;
  if (logisticModel === 'plain') {
    lines.push('clf = LogisticRegression(penalty=None, solver="lbfgs", random_state=SEED, max_iter=1000)');
  } else if (logisticModel === 'lasso') {
    lines.push('clf = LogisticRegression(penalty="l1", solver="saga", random_state=SEED, max_iter=2000)');
  } else if (logisticModel === 'elasticnet') {
    lines.push('clf = LogisticRegression(penalty="elasticnet", solver="saga", l1_ratio=0.5, random_state=SEED, max_iter=2000)');
  } else if (logisticModel === 'firth') {
    lines.push('# EasyTableOne used FirthLogisticRegression; install firthlogist for the closest reproduction.');
    lines.push('from firthlogist import FirthLogisticRegression');
    lines.push('clf = FirthLogisticRegression(max_iter=1000)');
  } else {
    lines.push('clf = LogisticRegression(penalty="l2", solver="lbfgs", random_state=SEED, max_iter=1000)');
  }
  lines.push('modeling_pipeline = Pipeline([("preprocess", preprocess), ("model", clf)])');
  lines.push('modeling_pipeline.fit(X_model, y_model)');
  if (modeledEventLevel !== undefined && modeledEventLevel !== null) {
    lines.push('# y_model is encoded 0/1, so predict_proba(... )[:, 1] is P(modeled event).');
    lines.push('assert list(modeling_pipeline.named_steps["model"].classes_) == [0, 1]');
  }
  lines.push('print("Modeling fit complete:", modeling_pipeline.named_steps["model"])');
  if (modelingResults.ml) {
    lines.push(`cv = RepeatedStratifiedKFold(n_splits=${modelingResults.ml.folds.nSplits}, n_repeats=${modelingResults.ml.folds.nRepeats}, random_state=${modelingResults.ml.folds.seed})`);
    lines.push('cv_splits = list(cv.split(X_model, y_model))');
    lines.push('repeat_metrics = []');
    lines.push(`for repeat_index in range(${modelingResults.ml.folds.nRepeats}):`);
    lines.push('    oof_prob = np.zeros(len(y_model), dtype=float)');
    lines.push(`    repeat_splits = cv_splits[repeat_index * ${modelingResults.ml.folds.nSplits}:(repeat_index + 1) * ${modelingResults.ml.folds.nSplits}]`);
    lines.push('    for train_idx, test_idx in repeat_splits:');
    lines.push('        modeling_pipeline.fit(X_model.iloc[train_idx], y_model.iloc[train_idx])');
    lines.push('        oof_prob[test_idx] = modeling_pipeline.predict_proba(X_model.iloc[test_idx])[:, 1]');
    lines.push('    oof_pred = (oof_prob >= 0.5).astype(int)');
    lines.push('    repeat_metrics.append((roc_auc_score(y_model, oof_prob), brier_score_loss(y_model, oof_prob), matthews_corrcoef(y_model, oof_pred), f1_score(y_model, oof_pred, zero_division=0)))');
    lines.push('repeat_metrics = np.asarray(repeat_metrics, dtype=float)');
    lines.push('print(f"CV AUC mean +/- SD: {repeat_metrics[:, 0].mean():.3f} +/- {repeat_metrics[:, 0].std(ddof=1):.3f}")');
    lines.push('print(f"CV Brier mean +/- SD: {repeat_metrics[:, 1].mean():.3f} +/- {repeat_metrics[:, 1].std(ddof=1):.3f}")');
    lines.push('print(f"CV MCC mean +/- SD (threshold 0.5): {repeat_metrics[:, 2].mean():.3f} +/- {repeat_metrics[:, 2].std(ddof=1):.3f}")');
    lines.push('print(f"CV F1 mean +/- SD (threshold 0.5): {repeat_metrics[:, 3].mean():.3f} +/- {repeat_metrics[:, 3].std(ddof=1):.3f}")');
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Generate the full `analysis_history.py` content string.
 * Produces a reproducible Python analysis script from the plan, results, schema, source metadata, and optional findings.
 * It is a pure formatter with no I/O or Python execution; source paths use a placeholder when unavailable, and the
 * selected journal rules and user overrides are written into the history text.
 */
export function generateAnalysisHistory(
  plan: AnalysisPlan,
  results: StatisticalResults,
  schema: Schema,
  meta: SourceMetadata,
  timestamp: string = new Date().toISOString(),
  dataQualityRecords?: DataQualityRecord[],
  journalId: string = 'NEJM',
  modelingResults?: ModelingResults | null,
): string {
  const libVersions = results.computeMetadata.libVersions;
  const journalConfig = getEffectiveJournalSettings(journalId, plan.userOverrides);
  const usesDunn = results.perVariable.some((v) => v.postHoc?.method === "dunn");
  const libLine = Object.entries(libVersions)
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');

  // Use placeholder when filename is not available or is the internal default "workbook".
  const isPlaceholder = !meta.filename || meta.filename === 'workbook';
  const filenameDisplay = isPlaceholder ? '<source_file>' : meta.filename;
  const filenameArg = isPlaceholder
    ? '"<your_source_file>"  # TODO: replace with your actual file path'
    : pyStr(meta.filename);

  let dqNotesBlock = "";
  const activeRecords = (dataQualityRecords ?? []).filter(
    (r) =>
      r.response === "acknowledged" ||
      r.response === "overridden" ||
      r.response === "applied" ||
      r.response === "dismissed"
  );
  if (activeRecords.length > 0) {
    const bullets: string[] = [];
    const getVarIndex = (varName: string | undefined): number => {
      if (!varName) return -1;
      return schema.columns.findIndex((c) => c.name === varName);
    };

    const items: { index: number; text: string }[] = [];
    const isGrouped = !!plan.groupingVariable && results.groups && results.groups.length > 0;
    if (isGrouped) {
      const groupingSchemaCol = schema.columns.find((c) => c.name === plan.groupingVariable);
      const groupSizesStr = results.groups
        .map((g) => `${resolveLabel(groupingSchemaCol, g.name)} n=${g.n}`)
        .join(", ");
      const groupIndex = getVarIndex(plan.groupingVariable);
      items.push({
        index: groupIndex >= 0 ? groupIndex : 9999,
        text: `- Group sizes: ${groupSizesStr}`
      });
    }

    activeRecords.forEach((r) => {
      if (r.finding.checkId === "groupImbalance" || r.finding.checkId.startsWith("groupImbalance_")) {
        return;
      }
      const colName = r.finding.variable;
      const schemaCol = schema.columns.find((c) => c.name === colName);
      const displayVar = schemaCol ? getColumnDisplayLabel(schemaCol, 'stripped') : stripBracketCodes(colName || '');
      const varIdx = getVarIndex(colName);

      let text = "";
      const matchCanonical = r.fixDetails?.match(/Canonical:\s*(.*)/);
      const canonical = matchCanonical ? matchCanonical[1] : "";

      if (r.finding.checkId.startsWith("whitespace_inconsistency")) {
        if (r.response === "applied") {
          text = `- Merged ${r.finding.affectedCount} whitespace variants in *${displayVar}* to '${canonical}'; applied`;
        } else {
          text = `- Whitespace inconsistency in *${displayVar}*; dismissed`;
        }
      } else if (r.finding.checkId.startsWith("case_inconsistency")) {
        if (r.response === "applied") {
          text = `- Merged ${r.finding.affectedCount} case variants in *${displayVar}* to '${canonical}'; applied`;
        } else {
          text = `- Case inconsistency in *${displayVar}*; dismissed`;
        }
      } else if (r.finding.checkId.startsWith("column_name_whitespace")) {
        if (r.response === "applied") {
          text = `- Column name *${colName}* trimmed to '${canonical}'; applied`;
        } else {
          text = `- Column name whitespace in *${colName}*; dismissed`;
        }
      } else if (r.finding.checkId.startsWith("near_duplicate")) {
        if (r.response === "applied") {
          text = `- Merged ${r.finding.affectedCount} similar variants in *${displayVar}* to '${canonical}'; applied`;
        } else {
          text = `- Similar variants in *${displayVar}*; dismissed`;
        }
      } else if (r.finding.checkId.startsWith("synonym_hints")) {
        if (r.response === "applied") {
          text = `- Merged ${r.finding.affectedCount} synonym variants in *${displayVar}* to '${canonical}'; applied`;
        } else {
          text = `- Synonym variants in *${displayVar}*; dismissed`;
        }
      } else if (r.finding.checkId.startsWith("mixed_type")) {
        if (r.response === "applied") {
          text = `- Mapped mixed type codes in *${displayVar}*; applied`;
        } else {
          text = `- Mixed type in *${displayVar}*; dismissed`;
        }
      } else if (r.finding.checkId.startsWith("ordinal_stored_as_string")) {
        if (r.response === "applied") {
          text = `- Set ordinal order for *${displayVar}*; applied`;
        } else {
          text = `- Ordinal suggestion for *${displayVar}*; dismissed`;
        }
      } else if (r.finding.checkId.startsWith("smallCategoryLevel_")) {
        text = `- ${r.finding.detail}`;
      } else if (r.finding.checkId.startsWith("highMissingness")) {
        const match = r.finding.detail.match(/had\s+([\d.]+%)\s+missingness/);
        const pctStr = match ? match[1] : "some";
        text = `- Variable ${displayVar} had ${pctStr} missingness`;
      } else if (r.finding.checkId.startsWith("outliers")) {
        text = buildOutlierHistoryLine(r.finding.affectedCount ?? 0, displayVar);
      } else if (r.finding.checkId === "duplicateRows") {
        const rowWord = r.finding.affectedCount === 1 ? "row" : "rows";
        text = `- ${r.finding.affectedCount} exact duplicate ${rowWord} detected`;
      } else if (r.finding.checkId.startsWith("sampleSize")) {
        const valWord = r.finding.affectedCount === 1 ? "value" : "values";
        text = `- Variable ${displayVar} has N = ${r.finding.affectedCount} (< 30) non-null ${valWord}`;
      } else if (r.finding.checkId === "unlabeledVariables") {
        const count = r.finding.affectedCount || 0;
        const varWord = count === 1 ? "variable has" : "variables have";
        text = `- ${count} ${varWord} no display label`;
      } else if (r.finding.checkId === "noDictionarySheet") {
        text = `- No data dictionary was imported for this workbook`;
      } else if (colName) {
        text = `- ${r.finding.title} in ${displayVar}`;
      } else {
        text = `- ${r.finding.title}`;
      }

      items.push({
        index: varIdx >= 0 ? varIdx : 9999,
        text
      });
    });

    items.sort((a, b) => a.index - b.index);
    bullets.push(...items.map((item) => item.text));

    dqNotesBlock = `\n\nDATA QUALITY NOTES\n==================\nThis analysis proceeded with the following acknowledged data\nquality issues:\n${bullets.join('\n')}`;
  }

  const lines: string[] = [];
  lines.push(`"""
Analysis history for EasyTableOne run on ${timestamp}.
Reproduces the table from ${filenameDisplay}.

EasyTableOne v${plan.appVersion} (ruleset v${plan.rulesetVersion})
${libLine}${dqNotesBlock}
"""

# === Original data ===
# Source file: ${filenameDisplay}${meta.sheetName ? `\n# Sheet: ${meta.sheetName}` : ''}${meta.sha256 ? `\n# SHA-256 of source file: ${meta.sha256}` : ''}
# Research population: ${plan.researchPopulation ?? "adult"}
# Study design: ${plan.studyDesign ?? "unspecified"}
# Unit system: ${plan.unitSystem ?? "metric"}
# Grouping variable: ${plan.groupingVariable}${
    meta.droppedMissingGroupingRows !== undefined
      ? `\n# Dropped ${meta.droppedMissingGroupingRows} rows missing the grouping variable.`
      : ''
  }

import pandas as pd
import numpy as np
import scipy
import scipy.stats as stats
import math
from decimal import Decimal, ROUND_HALF_UP, localcontext
from statsmodels.stats.multicomp import pairwise_tukeyhsd
from statsmodels.stats.multitest import multipletests
${usesDunn ? '# Requires: pip install scikit-posthocs\nimport scikit_posthocs\n' : ''}

_ETO_P_FORMAT = ${pyLiteral(journalConfig.p_value_formatting)}
def _eto_format_p_value(p):
    if p is None or math.isnan(float(p)):
        return "-"
    p = float(p)
    separator = _ETO_P_FORMAT.get("decimal_separator", ".")
    def number(value):
        return float(value.strip().replace("·", ".").replace(",", ".").replace(separator, "."))
    threshold = _ETO_P_FORMAT["threshold_low"]
    if threshold.startswith("<") and p < number(threshold[1:]):
        return threshold
    decimals = _ETO_P_FORMAT["max_decimal_places"]
    explicit = None
    for rule in _ETO_P_FORMAT.get("conditional_decimals", []):
        interval = rule["range"].strip()
        matched = False
        if interval.startswith(">=") or interval.startswith(">"):
            inclusive = interval.startswith(">=")
            bound = number(interval[2:] if inclusive else interval[1:])
            matched = p >= bound if inclusive else p > bound
        elif "to" in interval:
            low, high = [number(part) for part in interval.split("to", 1)]
            matched = low <= p <= high
        if matched:
            explicit = rule.get("display")
            decimals = rule.get("decimals", decimals)
            break
    if explicit is not None:
        return explicit
    significant = _ETO_P_FORMAT.get("significant_figures")
    if significant is not None:
        value = Decimal(str(p))
        exponent = value.copy_abs().adjusted()
        with localcontext() as context:
            context.prec = max(32, significant + abs(exponent) + 8)
            rounded = value.quantize(Decimal(1).scaleb(exponent - significant + 1), rounding=ROUND_HALF_UP)
        exponent = rounded.copy_abs().adjusted()
        places = max(0, significant - exponent - 1)
        return format(rounded, f".{places}f").replace(".", separator)
    rendered = f"{p:.{decimals}f}"
    if not _ETO_P_FORMAT["leading_zero"] and rendered.startswith("0"):
        rendered = rendered[1:]
    return rendered.replace(".", separator)

`);

  const extension = meta.filename.toLowerCase().split('.').pop();
  const readSource = extension === 'csv'
    ? `pd.read_csv(${filenameArg})`
    : extension === 'tsv'
      ? `pd.read_csv(${filenameArg}, sep="\\t")`
      : `pd.read_excel(${filenameArg}${meta.sheetName ? `, sheet_name=${pyStr(meta.sheetName)}` : ''})`;
  lines.push(`df = ${readSource}`);
  const categoricalSourceColumns = Array.from(new Set([
    plan.groupingVariable,
    ...schema.columns.filter((c) => c.levels && c.levels.length > 0).map((c) => c.name),
  ]));
  for (const col of categoricalSourceColumns) {
    lines.push(`df[${pyStr(col)}] = df[${pyStr(col)}].astype(str)`);
  }
  lines.push(`df = df.dropna(subset=[${pyStr(plan.groupingVariable)}]).copy()`);

  // Applied polish advisor recodes
  const appliedPolish = (dataQualityRecords ?? []).filter((r) => r.response === "applied");
  if (appliedPolish.length > 0) {
    lines.push("# === Data Polish Advisor Applied Fixes ===");
    for (const r of appliedPolish) {
      const matchCanonical = r.fixDetails?.match(/Canonical:\s*(.*)/);
      const canonical = matchCanonical ? matchCanonical[1] : "";
      const colName = r.finding.variable;

      if (r.finding.checkId.startsWith("column_name_whitespace") && colName) {
        lines.push(`df = df.rename(columns={${pyStr(colName)}: ${pyStr(canonical)}})`);
      } else if (colName && r.finding.sampleValues && r.finding.sampleValues.length > 0) {
        const replaceMap: Record<string, string> = {};
        for (const variant of r.finding.sampleValues) {
          if (variant !== canonical) {
            replaceMap[variant] = canonical;
          }
        }
        if (Object.keys(replaceMap).length > 0) {
          lines.push(`df[${pyStr(colName)}] = df[${pyStr(colName)}].replace(${JSON.stringify(replaceMap)})`);
        }
      }
    }
    lines.push("");
  }

  // Recoding blocks
  const recodedVars = schema.columns.filter(
    (c) => c.name !== plan.groupingVariable && c.levels && c.levels.length > 0 && plan.includedVariables.includes(c.name)
  );
  if (recodedVars.length > 0) {
    lines.push('# === Variable recoding ===');
    for (const col of recodedVars) {
      const mapping = Object.fromEntries(col.levels!.map((l) => [l.code, l.label]));
      lines.push(`df[${pyStr(col.name)}] = df[${pyStr(col.name)}].map(${JSON.stringify(mapping)}).fillna(df[${pyStr(col.name)}].astype(str))`);
    }
    lines.push('');
  }

  lines.push('# === Per-variable analyses ===');
  lines.push('# Statistical seed (for deterministic Monte Carlo paths, e.g. r×c Fisher):');
  lines.push(`SEED = ${results.computeMetadata.seed}`);
  lines.push('rng = np.random.default_rng(SEED)');
  lines.push('');
  for (const v of results.perVariable) {
    lines.push(variableBlock(v, plan, schema, journalConfig));
  }

  const modelingTrace = modelingBlock(modelingResults);
  if (modelingTrace) {
    lines.push(modelingTrace);
  }

  lines.push(`print("Analysis complete. EasyTableOne v${plan.appVersion} — ${timestamp}")`);

  return lines.join('\n');
}
