import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { getColumnDisplayLabel } from "../format/columnLabel";
import { getModelingRationales, type MethodRationale } from "../modeling/rationale";
import { TRIPOD_AI_MAPPING, TRIPOD_AI_REPORTING_HEADER } from "../modeling/tripodMapping";
import type { DecisionCurve, MlMetricSummary, MlModelResult, ModelingResults, ModelingSetup, OddsRatioRow, SubgroupPerformance } from "../modeling/types";
import { PYODIDE_VERSION } from "../runtimeEnvironment";
import type { Schema } from "../types";
import type { ReportAsset } from "./unifiedReport";

type DocxChild = Paragraph | Table;

function fmt(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  if (Math.abs(value) < 0.001 && value !== 0) return "<0.001";
  return value.toFixed(digits);
}

function fmtMetric(value: MlMetricSummary): string {
  return `${fmt(value.mean)} +/- ${fmt(value.sd)}`;
}

function fmtCi(ci: [number, number] | null | undefined): string {
  return ci ? ` (95% CI ${fmt(ci[0])} to ${fmt(ci[1])})` : "";
}

function fmtMetricCi(value: MlMetricSummary): string {
  return value.ciLow !== null && value.ciLow !== undefined && value.ciHigh !== null && value.ciHigh !== undefined
    ? `${fmt(value.ciLow)} to ${fmt(value.ciHigh)}`
    : "-";
}

function fmtValidationMetric(value: number | null | undefined, ci: [number, number] | null | undefined): string {
  return `${fmt(value)}${fmtCi(ci)}`;
}

function fmtLogisticValidationMetric(validation: NonNullable<NonNullable<ModelingResults["logistic"]>["validation"]>, key: string, value: number | null | undefined, ci: [number, number] | null | undefined): string {
  return validation.unstableMetrics?.includes(key) ? "not reportable" : fmtValidationMetric(value, ci);
}

function unstableValidationDisclosure(validation: NonNullable<NonNullable<ModelingResults["logistic"]>["validation"]>): string | null {
  return validation.unstableMetrics && validation.unstableMetrics.length > 0
    ? `Not reportable: ${validation.unstableMetrics.join(", ")}. ${validation.unstableReason ?? ""}`.trim()
    : null;
}

function fmtThreshold(value: number | null | undefined): string {
  return fmt(value ?? 0.5, 2);
}

function decisionCurveRange(curve: DecisionCurve): string {
  const first = curve.points[0]?.threshold;
  const last = curve.points.at(-1)?.threshold;
  return `${fmt(first, 2)}-${fmt(last, 2)}`;
}

function decisionCurveSummary(curve: DecisionCurve): string {
  return `Decision-curve analysis (net benefit) basis: ${curve.basis}; prevalence ${fmt(curve.prevalence)}; threshold range ${decisionCurveRange(curve)}; reference strategies are treat all and treat none.`;
}

function subgroupAucGap(group: SubgroupPerformance): number | null {
  const values = group.levels.map((level) => level.auc).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

function subgroupMarkdown(groups: SubgroupPerformance[]): string[] {
  const lines: string[] = [];
  for (const group of groups) {
    const gap = subgroupAucGap(group);
    lines.push(`#### ${group.variable}`);
    lines.push(`Basis: ${group.basis}.${gap === null ? "" : ` Largest AUC difference across ${group.variable}: ${fmt(gap)}.`}`);
    lines.push("| Level | n | Events | AUC | Calibration slope | Brier |");
    lines.push("|---|---:|---:|---:|---:|---:|");
    for (const level of group.levels) {
      if (level.reason === "insufficient_events") {
        lines.push(`| ${level.level} | ${level.n} | ${level.events} | Too few events to estimate reliably | - | - |`);
      } else {
        lines.push(`| ${level.level} | ${level.n} | ${level.events} | ${fmt(level.auc)} | ${fmt(level.calibrationSlope)} | ${fmt(level.brier)} |`);
      }
    }
    lines.push("");
  }
  return lines;
}

function labelFor(schema: Schema | null | undefined, name: string): string {
  const col = schema?.columns.find((column) => column.name === name);
  return col ? getColumnDisplayLabel(col, "stripped") : name;
}

function orMarkdown(rows: OddsRatioRow[]): string {
  const showSelection = rows.some((row) => row.selectionFrequency !== null && row.selectionFrequency !== undefined);
  const lines = [showSelection ? "| Term | OR | 95% CI | Selection % | p |" : "| Term | OR | 95% CI | p |", showSelection ? "|---|---:|---:|---:|---:|" : "|---|---:|---:|---:|"];
  if (rows.length === 0) {
    lines.push(showSelection ? "| No rows | - | - | - | - |" : "| No rows | - | - | - |");
    return lines.join("\n");
  }
  for (const row of rows) {
    const pText = row.p === null ? "-" : fmt(row.p);
    const ciText = (row.ciLow === null || row.ciLow === undefined || Number.isNaN(row.ciLow)) &&
                  (row.ciHigh === null || row.ciHigh === undefined || Number.isNaN(row.ciHigh))
      ? "not estimable"
      : `${fmt(row.ciLow)} to ${fmt(row.ciHigh)}`;
    const termLabel = row.displayLabel ?? row.label;
    if (showSelection) {
      lines.push(`| ${termLabel} | ${fmt(row.or)} | ${ciText} | ${row.selectionFrequency === null || row.selectionFrequency === undefined ? "-" : fmt(row.selectionFrequency * 100, 0)} | ${pText} |`);
    } else {
      lines.push(`| ${termLabel} | ${fmt(row.or)} | ${ciText} | ${pText} |`);
    }
  }
  return lines.join("\n");
}

function methodLine(name: string, rationale: MethodRationale): string {
  return `- ${name}: ${rationale.what}. Why: ${rationale.why} Plain language: ${rationale.plain} ${rationale.example}`;
}

function warningLines(results: ModelingResults): string[] {
  const lines: string[] = [];
  const logistic = results.logistic;
  if (logistic?.regime.epv !== undefined && logistic.regime.epv < 10) {
    lines.push(`EPV guardrail: events per variable was ${fmt(logistic.regime.epv, 2)}; proceeded with the selected penalized/small-sample-aware model.`);
  }
  if (logistic?.regime.pGeN) {
    lines.push("p >= n guardrail: plain maximum-likelihood logistic regression was not allowed by the automatic regime check.");
  }
  if (logistic?.regime.separation?.separated || logistic?.regime.separation?.quasi) {
    const culprits = logistic.regime.separation.culprits.length ? ` Culprit terms: ${logistic.regime.separation.culprits.join(", ")}.` : "";
    lines.push(`Separation guardrail: possible ${logistic.regime.separation.separated ? "complete" : "quasi"} separation was detected by a heuristic check.${culprits}`);
  }
  if (logistic?.regime.separation?.convergenceWarning) {
    lines.push("Convergence warning: the separation screen found a fit warning without a single-term separation culprit.");
  }
  if (logistic && logistic.selected.length > 0 && ["lasso", "elasticnet"].includes(logistic.model)) {
    lines.push("Selection caveat: adjusted confidence intervals are bootstrap percentile intervals conditional on the selection process; penalized Wald P-values are omitted because they are not valid after shrinkage.");
  }
  if (logistic?.validation?.method === "apparent_only") {
    lines.push("Validation caveat: bootstrap optimism correction did not run successfully, so validation is labeled apparent only.");
  }
  if (logistic?.adjusted.some((row) => row.ciMethod === "none")) {
    lines.push("Interval caveat: at least one adjusted odds ratio has no confidence interval because bootstrap/profile/Wald inference was unavailable.");
  }
  const recommended = logistic?.regime.recommendedModels ?? [];
  if (logistic && recommended.length > 0 && !recommended.includes(logistic.model)) {
    lines.push(`User override: ${logistic.model} was used although the automatic recommendation was ${recommended.join(", ")}; proceeded despite this override.`);
  }
  for (const warning of results.ml?.warnings ?? []) {
    lines.push(`ML warning: ${warning}`);
  }
  if (logistic?.unmatchedPredictors?.length) {
    lines.push(`Omitted predictors: ${logistic.unmatchedPredictors.join(", ")} were not found in the data and were not modeled.`);
  }
  return lines.length ? lines : ["No modeling guardrails or warnings were raised."];
}

function methodsParagraph(results: ModelingResults): string {
  const setup = results.setup;
  const rationales = getModelingRationales(setup, results);
  const lr = results.logistic;
  const ml = results.ml;
  const parts = [
    `A binary-outcome modeling analysis was performed for ${setup.outcome} using ${setup.predictors.length} candidate predictors.`,
    `${rationales.imputation.what} was used before model fitting.`,
    "Continuous predictors entered the model on their original scale with a linear functional form (no automatic splines or transformations); categorical predictors were dummy-encoded against a reference level. Predictors were standardised before penalised logistic fitting and odds ratios are reported on the original scale. k-nearest-neighbours imputation, when selected, standardises numeric predictors before computing neighbour distances.",
    "No class-imbalance resampling (e.g., SMOTE, over- or under-sampling) was applied; the outcome distribution was handled by stratified cross-validation and balanced-accuracy reporting.",
  ];
  if (lr) {
    parts.push(`${rationales.model.what} was selected according to the prespecified sample-size regime (${lr.regime.n} observations, ${lr.regime.events} events, ${lr.regime.p} parameters, EPV ${fmt(lr.regime.epv, 2)}). Logistic-regression validation used ${rationales.logisticValidation.what}. ${rationales.logisticValidation.plain}`);
    if (lr.validation) {
      parts.push("The logistic-regression model was validated by optimism-corrected bootstrap, with imputation re-run inside each resample.");
      if (lr.validation.ciMethod === "bootstrap_oob") {
        parts.push("Logistic validation performance intervals are 95% out-of-bag percentile confidence intervals computed from the out-of-bag samples of each bootstrap resample, pivotally recentered around the corrected point estimates.");
      } else if (lr.validation.ciMethod === "bootstrap_nested") {
        parts.push("Logistic validation performance intervals are 95% confidence intervals estimated via a nested optimism-corrected bootstrap (double bootstrap loop) to propagate all uncertainty.");
      } else if (lr.validation.ciMethod === "bootstrap_full_sample") {
        parts.push("Logistic validation performance intervals are bootstrap-percentile 95% confidence intervals from the same successful optimism-bootstrap resamples across the full training dataset.");
      }
    }
  }
  if (ml) {
    parts.push(`Machine-learning models were compared using ${rationales.mlValidation.what} on ${ml.imputationMethod ?? "complete_case"} data (N=${ml.nEvaluated ?? "not recorded"}); ROC curves were summarized using ${rationales.rocAveraging.what}, predictors were ranked by ${rationales.variableImportance.what}, and confusion counts were pooled repeated-CV held-out predictions.`);
    parts.push(`For the machine-learning benchmark, data were partitioned by repeated stratified ${ml.folds.nSplits}-fold cross-validation (${ml.folds.nRepeats} repeats); missing-value imputation and any feature scaling were fit on the training folds only and applied to the held-out fold, so no information from held-out patients entered model fitting.`);
    parts.push(`Machine-learning performance intervals are 95% intervals across CV repetitions calculated as Student-t intervals across repeat-level metric means on the logit scale (Fisher z for MCC) and back-transformed (df = ${ml.folds.nRepeats - 1}); they reflect run-to-run variability of repeated cross-validation on this dataset and are not confidence intervals for performance on new patients. The reported +/- SD is the per-repeat spread.`);
    parts.push(`Sensitivity, specificity, and balanced accuracy are computed at a classification threshold of ${fmtThreshold(ml.classificationThreshold)} on predicted probability.`);
  }
  parts.push(`Analyses ran on Pyodide ${PYODIDE_VERSION} (CPython compiled to WebAssembly, executed entirely in the browser) using the package versions recorded with the results.`);
  parts.push("The logistic model is fully specified by the exported equation and reproducibility JSON; machine-learning benchmark models are evaluated in-session and are not exported as portable fitted objects.");
  parts.push("Discrimination, calibration, clinical utility by decision-curve net benefit, Brier score, odds ratios, model warnings, and the TRIPOD+AI reporting checklist were reported to support transparent modeling-reporting.");
  return parts.join(" ");
}

function tripodChecklistMarkdown(): string {
  const lines = ["## TRIPOD+AI reporting checklist", "", TRIPOD_AI_REPORTING_HEADER, "", "| Item | Status | What EasyTableOne emits / who owns it |", "|---|---|---|"];
  for (const row of TRIPOD_AI_MAPPING) {
    lines.push(`| ${row.item} - ${row.label} | ${row.status === "supported" ? "Supported by app output" : "Author-owned / planned"} | ${row.detail} |`);
  }
  return lines.join("\n");
}

export function buildModelingReportMarkdown(
  results: ModelingResults,
  setup: ModelingSetup = results.setup,
  schema?: Schema | null,
): string {
  const rationales = getModelingRationales(setup, results);
  const outcome = labelFor(schema, setup.outcome);
  const predictors = setup.predictors.map((name) => labelFor(schema, name)).join(", ") || "none";
  const lines: string[] = [];
  const logistic = results.logistic;
  const ml = results.ml;

  lines.push("# Modeling Report");
  lines.push("");
  lines.push(`Generated: ${results.generatedAt}`);
  lines.push(`Outcome: ${outcome}`);
  if (logistic?.outcomeEventLevel) {
    lines.push(`Modeled event: ${logistic.outcomeEventLevel} (reference/non-event: ${logistic.outcomeReferenceLevel ?? "not recorded"})`);
  }
  lines.push(`Candidate predictors: ${predictors}`);
  lines.push("");

  lines.push("## Steps taken");
  lines.push(`The modeling workflow used ${rationales.imputation.what.toLowerCase()} for missing data, encoded categorical predictors using configured reference levels, and fit models for the binary outcome ${outcome}.`);
  if (logistic) {
    lines.push(`Logistic regression used regime detection with n=${logistic.regime.n}, events=${logistic.regime.events}, nonevents=${logistic.regime.nonevents}, p=${logistic.regime.p}, and EPV=${fmt(logistic.regime.epv, 2)}. The fitted model was ${logistic.model}; selected terms were ${logistic.selected.length ? logistic.selected.join(", ") : "none"}.`);
  }
  if (ml) {
    lines.push(`Machine-learning comparison evaluated ${ml.models.map((model) => model.name).join(", ")} on ${ml.folds.nSplits} folds x ${ml.folds.nRepeats} repeats with seed ${ml.folds.seed}; evaluated sample ${ml.imputationMethod ?? "complete_case"}${ml.nEvaluated !== undefined ? `, N=${ml.nEvaluated}` : ""}.`);
  }
  lines.push("");

  lines.push("## Chosen models and methods");
  lines.push(methodLine("Model", rationales.model));
  lines.push(methodLine("Logistic validation", rationales.logisticValidation));
  if (ml) {
    lines.push(methodLine("ML validation", rationales.mlValidation));
    lines.push(methodLine("Variable importance", rationales.variableImportance));
    lines.push(methodLine("ROC averaging", rationales.rocAveraging));
  }
  lines.push(methodLine("Lambda rule", rationales.lambdaRule));
  lines.push(methodLine("Imputation", rationales.imputation));
  lines.push(methodLine("Predictor handling", rationales.predictorHandling));
  lines.push(methodLine("Class imbalance", rationales.classImbalance));
  lines.push(methodLine("Performance intervals", rationales.performanceCi));
  lines.push(methodLine("Decision-curve analysis", rationales.decisionCurve));
  lines.push(methodLine("Subgroup performance", rationales.fairness));
  lines.push("");

  lines.push("## Warnings raised and override status");
  warningLines(results).forEach((line) => lines.push(`- ${line}`));
  lines.push("");

  lines.push("## Results");
  if (logistic) {
    lines.push("### Univariate odds ratios");
    lines.push(orMarkdown(logistic.univariate));
    lines.push("");
    lines.push("### Adjusted odds ratios");
    lines.push(orMarkdown(logistic.adjusted));
    lines.push("");
    lines.push(`Equation: \`${logistic.displayEquation ?? logistic.equation ?? "not available"}\``);
    if (logistic.validation) {
      const aucLabel = logistic.validation.scalarBasis === "optimism_corrected" ? "optimism-corrected AUC" : "apparent AUC";
      lines.push(`Logistic validation: ${aucLabel} ${fmtLogisticValidationMetric(logistic.validation, "auc", logistic.validation.aucCorrected, logistic.validation.aucCorrectedCi)}, calibration slope ${fmtLogisticValidationMetric(logistic.validation, "calibration_slope", logistic.validation.calibrationSlope, logistic.validation.calibrationSlopeCi)}, calibration intercept ${fmtLogisticValidationMetric(logistic.validation, "calibration_intercept", logistic.validation.calibrationIntercept, logistic.validation.calibrationInterceptCi)}, Brier ${fmtLogisticValidationMetric(logistic.validation, "brier", logistic.validation.brier, logistic.validation.brierCi)}, MCC at threshold 0.5 ${fmtLogisticValidationMetric(logistic.validation, "mcc", logistic.validation.mcc, logistic.validation.mccCi)}, F1 at threshold 0.5 ${fmtLogisticValidationMetric(logistic.validation, "f1", logistic.validation.f1, logistic.validation.f1Ci)}.`);
      const unstableDisclosure = unstableValidationDisclosure(logistic.validation);
      if (unstableDisclosure) {
        lines.push(unstableDisclosure);
      }
      lines.push("Logistic ROC and calibration curve coordinates, when exported for plotting, are apparent (in-sample); the corrected scalar is the headline validation estimate.");
      if (logistic.decisionCurve) {
        lines.push("");
        lines.push("### Clinical utility (decision-curve analysis)");
        lines.push(`${rationales.decisionCurve.plain} ${decisionCurveSummary(logistic.decisionCurve)} Logistic decision-curve coordinates are labeled ${logistic.decisionCurve.basis} and should be read with the same basis honesty as the ROC/calibration curve coordinates.`);
      }
      if (logistic.validation.ciMethod === "none") {
        lines.push("No logistic validation CI is shown because bootstrap optimism correction did not produce enough successful resamples; the apparent-only caveat applies.");
      }
    }
    if (logistic.subgroups && logistic.subgroups.length > 0) {
      lines.push("");
      lines.push("### Performance by subgroup (fairness)");
      lines.push(`${rationales.fairness.plain} The app reports subgroup performance for the characteristics the user selected and does not itself adjudicate fairness or mitigate disparities.`);
      lines.push(...subgroupMarkdown(logistic.subgroups));
    }
    lines.push("");
  }
  if (ml) {
    lines.push("### Machine-learning comparison");
    lines.push("| Model | AUC mean +/- SD | AUC 95% interval across CV repetitions | Sensitivity mean +/- SD | Sensitivity 95% interval across CV repetitions | Specificity mean +/- SD | Specificity 95% interval across CV repetitions | Balanced accuracy mean +/- SD | MCC mean +/- SD | F1 mean +/- SD |");
    lines.push("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
    for (const row of ml.comparison) {
      lines.push(`| ${row.model} | ${fmtMetric(row.auc)} | ${fmtMetricCi(row.auc)} | ${fmtMetric(row.sens)} | ${fmtMetricCi(row.sens)} | ${fmtMetric(row.spec)} | ${fmtMetricCi(row.spec)} | ${fmtMetric(row.balacc)} | ${fmtMetric(row.mcc ?? { mean: null, sd: null })} | ${fmtMetric(row.f1 ?? { mean: null, sd: null })} |`);
    }
    lines.push("");
    lines.push("For ML metrics, +/- SD describes per-repeat spread; the 95% interval across CV repetitions is computed from repeat-level metric means and is omitted when only one repeat is available. Intervals are computed on the logit scale (Fisher z for MCC) and back-transformed, so they cannot fall outside the metric's range; an interval is omitted when a repeat reaches that range's boundary. This interval reflects run-to-run variability of repeated cross-validation on this dataset; it is not a confidence interval for performance on new patients.");
    lines.push(`Sensitivity, specificity, balanced accuracy, MCC, and F1 are computed at a classification threshold of ${fmtThreshold(ml.classificationThreshold)} on predicted probability. AUC and ROC curves are threshold-independent; threshold metrics and confusion matrices are read at this cut-point.`);
    lines.push("");
    for (const model of ml.models) {
      lines.push(`#### ${model.name}`);
      lines.push(`Brier ${fmt(model.calibration.brier)}; calibration slope ${fmt(model.calibration.slope)}; calibration intercept ${fmt(model.calibration.intercept)}.`);
      lines.push(model.importanceAvailable === false
        ? "Permutation importance unavailable; failed folds were not treated as zero importance."
        : `Top permutation importance: ${model.varImportance.slice(0, 10).map((item) => `${item.name}=${fmt(item.score, 1)}`).join(", ") || "none"}.`);
      lines.push(`Confusion matrix basis: ${model.confusionBasis ?? ml.confusionBasis ?? "pooled_repeated_cv"} (${model.cvFolds ?? ml.folds.nSplits} x ${model.cvRepeats ?? ml.folds.nRepeats} held-out CV predictions; threshold ${fmtThreshold(model.classificationThreshold ?? ml.classificationThreshold)}).`);
      if (model.decisionCurve) {
        lines.push(`Clinical utility: ${decisionCurveSummary(model.decisionCurve)}`);
      }
      if (model.subgroups && model.subgroups.length > 0) {
        lines.push("Performance by subgroup (fairness):");
        lines.push(...subgroupMarkdown(model.subgroups));
      }
      lines.push("");
    }
  }

  lines.push(tripodChecklistMarkdown());
  lines.push("");

  lines.push("## Methods paragraph");
  lines.push(methodsParagraph(results));
  lines.push("");

  return lines.join("\n");
}

function p(text: string, heading?: (typeof HeadingLevel)[keyof typeof HeadingLevel]): Paragraph {
  return new Paragraph({
    text,
    ...(heading ? { heading } : {}),
    spacing: { after: 120 },
  });
}

function bullet(text: string): Paragraph {
  return new Paragraph({ text, bullet: { level: 0 }, spacing: { after: 80 } });
}

function cell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold })], alignment: AlignmentType.CENTER })],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
    },
  });
}

function simpleTable(headers: string[], rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: headers.map((header) => cell(header, true)) }),
      ...(rows.length ? rows : [headers.map(() => "-")]).map((row) => new TableRow({ children: row.map((item) => cell(item)) })),
    ],
  });
}

function orDocxTable(rows: OddsRatioRow[]): Table {
  const showSelection = rows.some((row) => row.selectionFrequency !== null && row.selectionFrequency !== undefined);
  return simpleTable(
    showSelection ? ["Term", "OR", "95% CI", "Selection %", "p"] : ["Term", "OR", "95% CI", "p"],
    rows.map((row) => {
      const ciText = (row.ciLow === null || row.ciLow === undefined || Number.isNaN(row.ciLow)) &&
                    (row.ciHigh === null || row.ciHigh === undefined || Number.isNaN(row.ciHigh))
        ? "not estimable"
        : `${fmt(row.ciLow)} to ${fmt(row.ciHigh)}`;
      const termLabel = row.displayLabel ?? row.label;
      return showSelection
        ? [termLabel, fmt(row.or), ciText, row.selectionFrequency === null || row.selectionFrequency === undefined ? "-" : fmt(row.selectionFrequency * 100, 0), row.p === null ? "-" : fmt(row.p)]
        : [termLabel, fmt(row.or), ciText, row.p === null ? "-" : fmt(row.p)];
    })
  );
}

function mlRows(models: MlModelResult[]): string[][] {
  return models.map((model) => [
    model.name,
    fmtMetric(model.metrics.auc),
    fmtMetricCi(model.metrics.auc),
    fmtMetric(model.metrics.sens),
    fmtMetricCi(model.metrics.sens),
    fmtMetric(model.metrics.spec),
    fmtMetricCi(model.metrics.spec),
    fmtMetric(model.metrics.balacc),
    fmtMetricCi(model.metrics.balacc),
    fmt(model.calibration.brier),
  ]);
}

function subgroupDocxChildren(groups: SubgroupPerformance[]): DocxChild[] {
  const children: DocxChild[] = [];
  for (const group of groups) {
    const gap = subgroupAucGap(group);
    children.push(p(`${group.variable} (basis: ${group.basis}${gap === null ? "" : `; largest AUC difference ${fmt(gap)}`})`, HeadingLevel.HEADING_4));
    children.push(simpleTable(
      ["Level", "n", "Events", "AUC", "Calibration slope", "Brier"],
      group.levels.map((level) => level.reason === "insufficient_events"
        ? [level.level, String(level.n), String(level.events), "Too few events to estimate reliably", "-", "-"]
        : [level.level, String(level.n), String(level.events), fmt(level.auc), fmt(level.calibrationSlope), fmt(level.brier)]
      ),
    ));
  }
  return children;
}

export function buildModelingReportDocxChildren(results: ModelingResults, schema?: Schema | null): DocxChild[] {
  const setup = results.setup;
  const rationales = getModelingRationales(setup, results);
  const children: DocxChild[] = [];
  const logistic = results.logistic;
  const ml = results.ml;

  children.push(p("Modeling Report", HeadingLevel.HEADING_2));
  children.push(p(`Generated: ${results.generatedAt}`));
  children.push(p(`Outcome: ${labelFor(schema, setup.outcome)}`));
  children.push(p(`Candidate predictors: ${setup.predictors.map((name) => labelFor(schema, name)).join(", ") || "none"}`));

  children.push(p("Steps taken", HeadingLevel.HEADING_3));
  children.push(p(`Missing data policy: ${rationales.imputation.what}. Predictors were encoded using configured reference levels before fitting.`));
  if (logistic) {
    children.push(p(`Logistic regime: n=${logistic.regime.n}, events=${logistic.regime.events}, p=${logistic.regime.p}, EPV=${fmt(logistic.regime.epv, 2)}. Selected model: ${logistic.model}.`));
  }
  if (ml) {
    children.push(p(`ML comparison: ${ml.models.map((model) => model.name).join(", ")}; ${ml.folds.nSplits} folds x ${ml.folds.nRepeats} repeats.`));
  }

  children.push(p("Chosen models and methods", HeadingLevel.HEADING_3));
  const methodItems: Array<[string, MethodRationale]> = [
    ["Model", rationales.model],
    ["Logistic validation", rationales.logisticValidation],
    ["Lambda rule", rationales.lambdaRule],
    ["Imputation", rationales.imputation],
    ["Predictor handling", rationales.predictorHandling],
    ["Class imbalance", rationales.classImbalance],
    ["Performance intervals", rationales.performanceCi],
    ["Decision-curve analysis", rationales.decisionCurve],
    ["Subgroup performance", rationales.fairness],
  ];
  if (ml) {
    methodItems.splice(2, 0,
      ["ML validation", rationales.mlValidation],
      ["Variable importance", rationales.variableImportance],
      ["ROC averaging", rationales.rocAveraging],
    );
  }
  methodItems.forEach(([name, rationale]) => children.push(bullet(`${name}: ${rationale.what}. Why: ${rationale.why} Plain language: ${rationale.plain} ${rationale.example}`)));

  children.push(p("Warnings raised and override status", HeadingLevel.HEADING_3));
  warningLines(results).forEach((line) => children.push(bullet(line)));

  children.push(p("Results", HeadingLevel.HEADING_3));
  if (logistic) {
    children.push(p("Univariate odds ratios", HeadingLevel.HEADING_4));
    children.push(orDocxTable(logistic.univariate));
    children.push(p("Adjusted odds ratios", HeadingLevel.HEADING_4));
    children.push(orDocxTable(logistic.adjusted));
    children.push(p(`Equation: ${logistic.displayEquation ?? logistic.equation ?? "not available"}`));
    if (logistic.validation) {
      const aucLabel = logistic.validation.scalarBasis === "optimism_corrected" ? "optimism-corrected AUC" : "apparent AUC";
      children.push(p(`Validation: ${aucLabel} ${fmtLogisticValidationMetric(logistic.validation, "auc", logistic.validation.aucCorrected, logistic.validation.aucCorrectedCi)}, calibration slope ${fmtLogisticValidationMetric(logistic.validation, "calibration_slope", logistic.validation.calibrationSlope, logistic.validation.calibrationSlopeCi)}, calibration intercept ${fmtLogisticValidationMetric(logistic.validation, "calibration_intercept", logistic.validation.calibrationIntercept, logistic.validation.calibrationInterceptCi)}, Brier ${fmtLogisticValidationMetric(logistic.validation, "brier", logistic.validation.brier, logistic.validation.brierCi)}.`));
      const unstableDisclosure = unstableValidationDisclosure(logistic.validation);
      if (unstableDisclosure) {
        children.push(p(unstableDisclosure));
      }
      children.push(p("Logistic ROC and calibration curve coordinates, when exported for plotting, are apparent (in-sample); the corrected scalar is the headline validation estimate."));
      if (logistic.decisionCurve) {
        children.push(p("Clinical utility (decision-curve analysis)", HeadingLevel.HEADING_4));
        children.push(p(`${rationales.decisionCurve.plain} ${decisionCurveSummary(logistic.decisionCurve)} Logistic decision-curve coordinates are labeled ${logistic.decisionCurve.basis} and should be read with the same basis honesty as the ROC/calibration curve coordinates.`));
      }
      if (logistic.validation.ciMethod === "none") {
        children.push(p("No logistic validation CI is shown because bootstrap optimism correction did not produce enough successful resamples; the apparent-only caveat applies."));
      }
    }
    if (logistic.subgroups && logistic.subgroups.length > 0) {
      children.push(p("Performance by subgroup (fairness)", HeadingLevel.HEADING_4));
      children.push(p(`${rationales.fairness.plain} The app reports subgroup performance for the characteristics the user selected and does not itself adjudicate fairness or mitigate disparities.`));
      children.push(...subgroupDocxChildren(logistic.subgroups));
    }
  }
  if (ml) {
    children.push(p("Machine-learning comparison", HeadingLevel.HEADING_4));
    children.push(simpleTable(["Model", "AUC +/- SD", "AUC 95% interval across CV repetitions", "Sensitivity +/- SD", "Sensitivity 95% interval across CV repetitions", "Specificity +/- SD", "Specificity 95% interval across CV repetitions", "Balanced accuracy +/- SD", "Balanced accuracy 95% interval across CV repetitions", "Brier"], mlRows(ml.models)));
    children.push(p("For ML metrics, +/- SD describes per-repeat spread; the 95% interval across CV repetitions is computed from repeat-level metric means and is omitted when only one repeat is available. Intervals are computed on the logit scale (Fisher z for MCC) and back-transformed, so they cannot fall outside the metric's range; an interval is omitted when a repeat reaches that range's boundary. This interval reflects run-to-run variability of repeated cross-validation on this dataset; it is not a confidence interval for performance on new patients."));
    children.push(p(`Sensitivity, specificity, and balanced accuracy are computed at a classification threshold of ${fmtThreshold(ml.classificationThreshold)} on predicted probability. AUC and ROC curves are threshold-independent; sensitivity, specificity, balanced accuracy, and confusion matrices are read at this cut-point.`));
    ml.models.filter((model) => model.decisionCurve).forEach((model) => children.push(p(`${model.name} clinical utility: ${decisionCurveSummary(model.decisionCurve as DecisionCurve)}`)));
    ml.models.filter((model) => model.subgroups && model.subgroups.length > 0).forEach((model) => {
      children.push(p(`${model.name} performance by subgroup (fairness)`, HeadingLevel.HEADING_4));
      children.push(p("The app reports subgroup performance for the selected characteristics and does not itself adjudicate fairness or mitigate disparities."));
      children.push(...subgroupDocxChildren(model.subgroups ?? []));
    });
  }

  children.push(p("TRIPOD+AI reporting checklist", HeadingLevel.HEADING_3));
  children.push(p(TRIPOD_AI_REPORTING_HEADER));
  children.push(simpleTable(
    ["Item", "Status", "What EasyTableOne emits / who owns it"],
    TRIPOD_AI_MAPPING.map((row) => [
      `${row.item} - ${row.label}`,
      row.status === "supported" ? "Supported by app output" : "Author-owned / planned",
      row.detail,
    ]),
  ));

  children.push(p("Methods paragraph", HeadingLevel.HEADING_3));
  children.push(p(methodsParagraph(results)));

  return children;
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function figureDocxChildren(assets: ReportAsset[] = []): DocxChild[] {
  if (assets.length === 0) return [];
  const children: DocxChild[] = [p("Benchmark figures", HeadingLevel.HEADING_3)];
  for (const asset of assets) {
    children.push(new Paragraph({
      children: [
        new ImageRun({
          type: "png",
          data: base64ToArrayBuffer(asset.base64Png),
          transformation: { width: 520, height: 320 },
          inline: true,
        } as any),
      ],
      spacing: { after: 80 },
    }));
    children.push(p(asset.caption));
  }
  return children;
}

export async function exportModelingReportDocx(results: ModelingResults, schema?: Schema | null, appVersion = "unknown", figureAssets: ReportAsset[] = []): Promise<Blob> {
  const doc = new Document({
    creator: `EasyTableOne v${appVersion}`,
    title: "Modeling Report",
    description: `Generated by EasyTableOne v${appVersion}.`,
    sections: [{ properties: {}, children: [...buildModelingReportDocxChildren(results, schema), ...figureDocxChildren(figureAssets)] }],
  });
  return Packer.toBlob(doc);
}
