import type { ImputationPolicy, LogisticModelKind, ModelingResults, ModelingSetup } from "./types";

export interface MethodRationale {
  what: string;
  why: string;
  plain: string;
  example: string;
}

export interface ModelingRationales {
  model: MethodRationale;
  logisticValidation: MethodRationale;
  mlValidation: MethodRationale;
  variableImportance: MethodRationale;
  rocAveraging: MethodRationale;
  lambdaRule: MethodRationale;
  imputation: MethodRationale;
  predictorHandling: MethodRationale;
  classImbalance: MethodRationale;
  performanceCi: MethodRationale;
  decisionCurve: MethodRationale;
  fairness: MethodRationale;
}

const MODEL_LABELS: Record<LogisticModelKind, string> = {
  plain: "Plain maximum-likelihood logistic regression",
  ridge: "Ridge-penalized logistic regression",
  lasso: "LASSO logistic regression",
  elasticnet: "Elastic-net logistic regression",
  firth: "Firth bias-reduced logistic regression",
};

export const IMPUTATION_BEST_FOR: Record<ImputationPolicy, string> = {
  complete_case: "Simplest and most transparent when very little is missing.",
  mean: "Quickest fill; can be pulled by skew or outliers.",
  median: "Safer than mean for skewed measurements; a low-risk fill at low missingness.",
  mode: "For filling missing categories; crude for numbers.",
  constant: "When a blank has a defensible fixed meaning you set yourself.",
  knn: "Ideal for machine-learning pipelines and predictive modeling; strongest when predictors are correlated (e.g. a panel of lab markers).",
  rf: "Handles messy, nonlinear relationships between predictors; the slowest single-fill option.",
  mice: "Best for statistical modeling where precise P-values and confidence intervals matter.",
};

function modelReason(setup: ModelingSetup, results?: ModelingResults | null): string {
  const logistic = results?.logistic;
  const regimeText = logistic?.regime.rationale;
  const recommended = logistic?.regime.recommendedModels ?? [];
  const separation = logistic?.regime.separation;
  const selected = logistic?.model ?? setup.model;

  if (regimeText) {
    const overrideText = recommended.length > 0 && !recommended.includes(selected)
      ? ` The user-selected model differs from the automatic recommendation (${recommended.join(", ")}), so the report treats this as a proceeded-with-override choice.`
      : "";
    return `${regimeText}${overrideText}`;
  }

  if (selected === "firth" || separation?.separated || separation?.quasi) {
    return "Firth was preferred because separation or rare events can make ordinary maximum-likelihood estimates unstable or infinite.";
  }
  if (setup.goal === "select" && selected === "lasso") {
    return "LASSO was preferred because the stated goal was predictor selection, and the penalty can shrink weak terms exactly to zero.";
  }
  if (selected === "elasticnet") {
    return "Elastic-net was preferred because it combines LASSO selection with ridge stabilization when predictors may be correlated.";
  }
  if (selected === "ridge") {
    return "Ridge was preferred because it stabilizes adjusted odds ratios when events per variable are limited, while retaining the prespecified predictor set.";
  }
  return "Plain maximum-likelihood logistic regression was used because the regime allowed an unpenalized fit without small-sample or separation guardrails.";
}

export function getModelRationale(setup: ModelingSetup, results?: ModelingResults | null): MethodRationale {
  const selected = results?.logistic?.model ?? setup.model;
  return {
    what: MODEL_LABELS[selected],
    why: modelReason(setup, results),
    plain: selected === "plain"
      ? "This estimates how each predictor changes the odds of the outcome while holding the other predictors steady."
      : "This model adds a guardrail for small or difficult data so weak or unstable associations are pulled closer to no effect.",
    example: selected === "firth"
      ? "Example: if one treatment group has no events, Firth can still estimate an odds ratio instead of running to infinity."
      : "Example: with only a few events, ridge can keep age and marker in the model while shrinking noisy estimates toward 1.",
  };
}

export function getLogisticValidationRationale(setup: ModelingSetup, results?: ModelingResults | null): MethodRationale {
  const method = results?.logistic?.validation?.method;
  const ciMethod = results?.logistic?.validation?.ciMethod ?? setup.validationCiMethod;
  if (method === "apparent_only") {
    return {
      what: "Apparent validation only",
      why: "Bootstrap validation did not run or did not produce enough successful resamples, so the app reports performance on the fitted data and labels it as apparent.",
      plain: "This is the model checking itself on the same data used to build it, so it can look better than it would on new patients.",
      example: "Example: an apparent AUC of 0.82 may fall after bootstrap correction once overfitting is counted.",
    };
  }

  let ciDetail = "";
  if (ciMethod === "bootstrap_oob") {
    ciDetail = " (Out-of-bag validation CIs, utilizing held-out samples from each bootstrap resample)";
  } else if (ciMethod === "bootstrap_nested") {
    ciDetail = " (Nested bootstrap validation CIs, executing a double bootstrap loop to propagate all uncertainty)";
  } else if (ciMethod === "bootstrap_full_sample") {
    ciDetail = " (Full-sample bootstrap validation CIs, legacy method; understates uncertainty and is not recommended)";
  }

  return {
    what: `Optimism-corrected bootstrap validation (${results?.logistic?.validation?.bEffective ?? setup.validationB} resamples)${ciDetail}`,
    why: "Bootstrap validation was preferred for the logistic-regression tab because it evaluates the fitted model's apparent performance and subtracts optimism without spending scarce observations on a holdout split.",
    plain: "The app repeatedly rebuilds the model on resampled copies of the data and measures how much better it looks on those copies than on the original data.",
    example: "Example: if resampled models average 0.04 AUC too high, an apparent AUC of 0.82 is reported as about 0.78.",
  };
}

export function getMlValidationRationale(results?: ModelingResults | null): MethodRationale {
  const folds = results?.ml?.folds;
  const foldText = folds ? `${folds.nSplits} folds x ${folds.nRepeats} repeats` : "repeated stratified cross-validation";
  return {
    what: `Shared-fold ${foldText}`,
    why: "The same stratified folds were reused for every machine-learning model so AUC, sensitivity, specificity, and balanced accuracy compare models on identical validation data.",
    plain: "Each model gets tested on the same train/test splits, which makes the comparison fairer.",
    example: "Example: random forest and SVM both see fold 1 as the same held-out patients.",
  };
}

export function getVariableImportanceRationale(): MethodRationale {
  return {
    what: "Permutation importance",
    why: "Permutation importance was preferred over random-forest impurity importance because the same definition can be applied across RF, naive Bayes, SVM, and ridge logistic models.",
    plain: "The app shuffles one predictor at a time and checks how much the model gets worse.",
    example: "Example: if shuffling age drops AUC more than shuffling sex, age is ranked as more important.",
  };
}

export function getRocAveragingRationale(): MethodRationale {
  return {
    what: "Mean ROC from a 100-point false-positive-rate grid",
    why: "Each fold's ROC curve was interpolated onto the same grid before averaging so curves with different thresholds can be summarized with a comparable mean and SD band.",
    plain: "ROC curves from different folds use different cutoffs, so the app lines them up on a common scale before averaging.",
    example: "Example: every fold contributes a true-positive rate at false-positive rate 0.20.",
  };
}

export function getLambdaRuleRationale(setup: ModelingSetup, results?: ModelingResults | null): MethodRationale {
  const realized = results?.logistic?.lambdaRuleApplied ?? setup.lambdaRule;
  if (realized === "lambda_min") {
    return {
      what: "lambda_min",
      why: "lambda_min was used because the user chose the penalty with the best cross-validated fit, accepting less parsimony than the default one-standard-error rule.",
      plain: "Lambda controls how strongly the model shrinks coefficients; lambda_min chooses the setting with the best validation score.",
      example: "Example: a smaller lambda may keep more predictors if that slightly improves cross-validated fit.",
    };
  }
  return {
    what: realized === "fixed_lambda" ? "fixed_lambda" : "lambda_1se",
    why: "The one-standard-error rule was preferred because it chooses a simpler penalized model whose validation performance is close to the best observed value.",
    plain: "Lambda controls shrinkage; lambda_1se chooses a simpler model whose validation score is still close to the best.",
    example: "Example: if two penalties perform nearly the same, the app picks the stronger shrinkage to reduce noise.",
  };
}

export function getImputationRationale(setup: ModelingSetup, results?: ModelingResults | null): MethodRationale {
  const method = results?.logistic?.imputationMethod;
  if (setup.imputation.policy === "mean" || setup.imputation.policy === "median") {
    const isMedian = setup.imputation.policy === "median";
    return {
      what: `${isMedian ? "Median" : "Mean"} single imputation`,
      why: `${isMedian ? "Median" : "Mean"} fill keeps every patient in the model, but it treats guessed values as measured values, so confidence intervals can look narrower than they should unless bootstrap CIs are enabled.`,
      plain: `Missing numeric values are filled with the column's ${isMedian ? "middle value" : "average"}; missing categories are filled with the most common category. ${isMedian ? "Median is usually safer than mean for skewed measurements." : "Mean is simple, but it can be pulled by skewed or extreme measurements."}`,
      example: `Example: a missing lab value is replaced by the predictor's ${setup.imputation.policy}, which can make the model look more certain than the data really are.`,
    };
  }
  if (setup.imputation.policy === "mode") {
    return {
      what: "Mode single imputation",
      why: "Mode fill is reasonable for categories and crude for numbers; it keeps every patient but can make confidence intervals look narrower than they should unless bootstrap CIs are enabled.",
      plain: "Every missing value is filled with the most common observed value in that column.",
      example: "Example: a missing treatment group is filled with the most common group, while a missing number gets the most repeated number.",
    };
  }
  if (setup.imputation.policy === "constant") {
    return {
      what: "Constant single imputation",
      why: "Constant fill is useful only when a blank has a defensible real meaning; it is still one guessed value per blank, so confidence intervals can look narrower than they should unless bootstrap CIs are enabled.",
      plain: `Missing numbers are filled with ${setup.imputation.constantNumeric ?? 0}; missing categories are treated as a distinct "${setup.imputation.constantLabel ?? "Missing"}" category that can appear as its own model row.`,
      example: "Example: if a test not done should be coded as 0 by protocol, a constant fill can preserve that meaning.",
    };
  }
  if (setup.imputation.policy === "knn") {
    const outcomeOn = setup.imputation.includeOutcome ?? false;
    const outcomeCopy = outcomeOn
      ? "You have turned on outcome-aware filling; for a single-fill method this can push odds ratios away from no effect."
      : "Outcome-aware filling is off by default here, which avoids overstating effects (odds ratios pushed away from no effect); MICE is preferred if you want to use the outcome.";
    return {
      what: "k-nearest-neighbours single imputation",
      why: "kNN can be smarter than a column average because it uses relationships between variables, but it still makes one guess per missing value, so confidence intervals can look too narrow unless bootstrap CIs are enabled.",
      plain: `A missing value is filled from the most similar patients based on the selected variables. ${outcomeCopy}`,
      example: "Example: a missing lab value can be filled using patients with similar age, sex, and other lab results before the model is fitted.",
    };
  }
  if (setup.imputation.policy === "rf") {
    const outcomeOn = setup.imputation.includeOutcome ?? false;
    const outcomeCopy = outcomeOn
      ? "You have turned on outcome-aware filling; for a single-fill method this can push odds ratios away from no effect."
      : "Outcome-aware filling is off by default here, which avoids overstating effects (odds ratios pushed away from no effect); MICE is preferred if you want to use the outcome.";
    return {
      what: "Random-forest single imputation",
      why: "Random-forest imputation can work well on messy relationships, but it is the slowest option and still fills one value per blank, so confidence intervals can look over-confident unless bootstrap CIs are enabled.",
      plain: `The app uses random forests to predict each missing value from the selected variables, similar to missForest. ${outcomeCopy}`,
      example: "Example: a missing marker can be predicted from age, treatment, and other markers before the final model is fitted.",
    };
  }
  if (method?.startsWith("mice") || setup.imputation.policy === "mice") {
    const hasBootstrapCi = Boolean(results?.logistic?.adjusted.some((row) => row.ciMethod?.startsWith("bootstrap")));
    const hasRubinCi = Boolean(results?.logistic?.adjusted.some((row) => row.ciMethod === "rubin"));
    const outcomeCopy = setup.imputation.includeOutcome === false
      ? "Because outcome-aware filling is off, estimates can be pulled toward no effect."
      : "The outcome is used while filling predictor gaps, which helps reduce bias toward no effect.";
    return {
      what: method ? `Multiple imputation by chained equations (${method.replace("mice_iterativeimputer_", "")})` : `Multiple imputation by chained equations (m=${setup.imputation.m})`,
      why: hasRubinCi
        ? "MICE was used because the analysis was configured to retain partially observed records; Rubin's rules combined the imputation-specific estimates and uncertainty."
        : hasBootstrapCi
        ? "MICE was used because the analysis was configured to retain partially observed records; bootstrap resamples re-impute to reflect sampling and imputation uncertainty."
        : "MICE builds several plausible completed datasets and is the preferred option for valid missing-data inference; Rubin's rules or bootstrap resampling are needed to carry the extra uncertainty into intervals.",
      plain: hasRubinCi
        ? `Numeric predictors were imputed by chained equations, categorical predictors were mode-filled, and pooled confidence intervals combine within- and between-imputation uncertainty. ${outcomeCopy}`
        : hasBootstrapCi
        ? `Numeric predictors were imputed by chained equations, categorical predictors were mode-filled, and each bootstrap resample got fresh fills. ${outcomeCopy}`
        : `The app builds several complete datasets with slightly different plausible fills, fits the model on each, and combines the results so uncertainty from guessing is not treated as certain. ${outcomeCopy}`,
      example: "Example: a missing age can be estimated several plausible ways from marker and sex, then the fitted odds ratios are combined.",
    };
  }
  return {
    what: "Complete-case analysis",
    why: "Complete-case analysis is the simplest and most transparent default when missingness is low, but it can bias results and shrink the sample if many selected values are missing.",
    plain: "Only patients with no missing values among the outcome and selected predictors are used.",
    example: "Example: if marker is missing for a patient, that patient is left out of this model, which can change both the sample size and the estimated association.",
  };
}

export function getPredictorHandlingRationale(): MethodRationale {
  return {
    what: "Original-scale linear predictors with reference-level encoding",
    why: "Continuous predictors enter with a linear functional form and no automatic splines or transformations; categorical predictors are dummy-encoded against the configured reference level. Penalized logistic fits standardize predictors internally and then report coefficients and odds ratios back on the original scale.",
    plain: "Number variables are modeled as straight-line effects unless you transform them before upload. Category variables compare each non-reference level with the reference level you chose.",
    example: "Example: age is modeled per one year on its original scale, while treatment=B is compared with the reference treatment=A.",
  };
}

export function getClassImbalanceRationale(_results?: ModelingResults | null): MethodRationale {
  return {
    what: "No class-imbalance resampling",
    why: "The event rate was handled by stratified cross-validation and by reporting balanced accuracy alongside sensitivity and specificity, rather than by oversampling, undersampling, or SMOTE, which can distort predicted probabilities and require recalibration.",
    plain: "The app did not create or delete rows to balance the outcome. It kept your data as-is and used fair splitting plus balanced accuracy so a rare outcome is not hidden by a high overall accuracy.",
    example: "Example: with 10% events, a model that always predicts 'no event' scores 90% accuracy but about 50% balanced accuracy, which is why balanced accuracy is reported.",
  };
}

export function getPerformanceCiRationale(results?: ModelingResults | null): MethodRationale {
  const hasMl = Boolean(results?.ml);
  return {
    what: hasMl ? "95% performance intervals" : "95% confidence intervals for performance",
    why: hasMl
      ? "AUC, sensitivity, specificity, and balanced accuracy are summarised across the CV repeats; the +/- value and 95% interval across CV repetitions describe the spread of the per-repeat means (Student-t, df = repeats - 1), computed on the logit scale (Fisher z for MCC) and back-transformed so intervals remain within the metric's range, not new-patient sampling uncertainty."
      : "Intervals show how much the performance estimate would vary across comparable samples; a single number can look more certain than it is.",
    plain: hasMl
      ? "Logistic performance intervals are bootstrap confidence intervals. Machine-learning intervals show run-to-run variability from repeated cross-validation on this dataset; they are not confidence intervals for performance on new patients."
      : "The range is where the true performance most plausibly sits. The logistic intervals come from the same bootstrap used to correct for optimism.",
    example: hasMl
      ? "Example: AUC 0.78 (95% interval across CV repetitions 0.71-0.84) varied more across repeats than AUC 0.78 (0.77-0.79)."
      : "Example: AUC 0.78 (95% CI 0.71-0.84) is much weaker evidence of high discrimination than 0.78 (95% CI 0.77-0.79).",
  };
}

export function getDecisionCurveRationale(): MethodRationale {
  return {
    what: "Decision-curve analysis (net benefit)",
    why: "Discrimination and calibration do not tell you whether using the model to make a treat/don't-treat decision does more good than harm at a given risk threshold; net benefit does, and compares the model against treating everyone and treating no one.",
    plain: "For each 'act if risk is above X%' cut-off, the curve weighs true positives against false positives and shows whether the model beats the simple strategies of treating everyone or no one.",
    example: "Example: if at a 20% threshold the model's net benefit sits above both 'treat all' and 'treat none', using it to decide is worthwhile for someone whose treatment threshold is around 20%.",
  };
}

export function getFairnessRationale(_setup?: ModelingSetup): MethodRationale {
  return {
    what: "Subgroup (fairness) performance",
    why: "A model can perform well overall yet noticeably worse for an under-represented or differently-sourced subgroup; reporting performance per subgroup makes that visible instead of hidden inside an average.",
    plain: "The app re-scores the same predictions separately for each group you pick (for example by sex or age band) so you can see whether the model works as well for each. It reports the numbers; it does not decide whether the model is 'fair' - that judgement, and any fix, is yours.",
    example: "Example: AUC 0.82 overall but 0.74 in one subgroup is a gap worth reporting and investigating.",
  };
}

export function getModelingRationales(setup: ModelingSetup, results?: ModelingResults | null): ModelingRationales {
  return {
    model: getModelRationale(setup, results),
    logisticValidation: getLogisticValidationRationale(setup, results),
    mlValidation: getMlValidationRationale(results),
    variableImportance: getVariableImportanceRationale(),
    rocAveraging: getRocAveragingRationale(),
    lambdaRule: getLambdaRuleRationale(setup, results),
    imputation: getImputationRationale(setup, results),
    predictorHandling: getPredictorHandlingRationale(),
    classImbalance: getClassImbalanceRationale(results),
    performanceCi: getPerformanceCiRationale(results),
    decisionCurve: getDecisionCurveRationale(),
    fairness: getFairnessRationale(setup),
  };
}
