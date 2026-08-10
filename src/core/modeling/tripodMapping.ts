export type TripodMappingStatus = "supported" | "author";

export interface TripodMappingItem {
  item: string;
  label: string;
  status: TripodMappingStatus;
  detail: string;
}

export const TRIPOD_AI_REPORTING_HEADER =
  "EasyTableOne generates modeling output designed to support transparent reporting under TRIPOD+AI (2024). It produces the analysis/reporting items below. Items that depend on your study design and context remain your responsibility - using EasyTableOne does not by itself make a study TRIPOD+AI compliant.";

export const TRIPOD_AI_MAPPING: TripodMappingItem[] = [
  { item: "11", label: "Missing data", status: "supported", detail: "Reports the selected modeling missing-data policy, fold-local ML imputation, logistic resample imputation, and reproducibility metadata." },
  { item: "12a", label: "Data partitioning and leakage prevention", status: "supported", detail: "Reports repeated stratified k-fold ML validation, train-only fold preprocessing, held-out application, and optimism-corrected bootstrap validation for logistic regression." },
  { item: "12b", label: "Predictor handling", status: "supported", detail: "Reports linear original-scale continuous predictors, reference-level categorical encoding, penalized-fit standardisation with original-scale odds ratios, and kNN distance standardisation where selected." },
  { item: "12c", label: "Model type, tuning, and internal validation", status: "supported", detail: "Reports logistic model family, lambda rule where relevant, bootstrap validation, shared-fold ML benchmarking, and model rationale text." },
  { item: "12e", label: "Clinical utility", status: "supported", detail: "Reports decision-curve analysis with net benefit across risk thresholds, including treat-all and treat-none reference strategies, alongside discrimination and calibration; basis labels distinguish apparent logistic coordinates from pooled repeated-CV held-out ML predictions." },
  { item: "12g", label: "Model specification", status: "supported", detail: "Exports the logistic equation and adjusted odds-ratio table; ML benchmark models are evaluated in-session and are not serialized as portable fitted objects." },
  { item: "13", label: "Class imbalance", status: "supported", detail: "States that no class-imbalance resampling is applied and that stratified cross-validation plus balanced accuracy are used instead." },
  { item: "14", label: "Fairness and subgroup performance", status: "supported", detail: "Supports reporting with opt-in per-subgroup discrimination and calibration on held-out or validation-appropriate predictions; reporting only, no fairness verdict and no auto-mitigation." },
  { item: "15", label: "Model output and threshold", status: "supported", detail: "Reports predicted probabilities and the classification threshold used for sensitivity, specificity, balanced accuracy, and confusion matrices." },
  { item: "18f", label: "Software, packages, and runtime environment", status: "supported", detail: "Emits EasyTableOne, ruleset, Pyodide/WebAssembly runtime, and package versions in report text and reproducibility JSON." },
  { item: "20b", label: "Baseline characteristics", status: "supported", detail: "The core Table 1 output reports baseline variables, missingness, group summaries, and selected journal formatting." },
  { item: "21", label: "Participants and events", status: "supported", detail: "Reports modeling N, events, non-events, parameters, EPV, evaluated ML sample size, and fold structure where available." },
  { item: "22", label: "Final model availability", status: "supported", detail: "Reports the logistic equation and reproducibility JSON needed to reconstruct the logistic specification; ML fitted objects are not exported." },
  { item: "23a", label: "Performance estimates with intervals and key subgroups", status: "supported", detail: "Reports 95% confidence intervals for derivable logistic validation performance estimates and 95% intervals across CV repetitions for ML AUC, sensitivity, specificity, and balanced accuracy, computed on the logit scale (Fisher z for MCC) and back-transformed; intervals are omitted with reasons when a repeat reaches the metric boundary. When selected by the user, also reports opt-in per-subgroup discrimination and calibration on validation-appropriate predictions; intervals or subgroup metrics are omitted with reasons when resampling or small subgroup counts do not support them." },
  { item: "1-9c", label: "Title, abstract, background, setting, outcomes, predictors, and assessor context", status: "author", detail: "Author-owned manuscript and study-design content; EasyTableOne cannot infer or certify these narrative items from a dataset." },
  { item: "17-19", label: "Ethics, funding, registration, and public involvement", status: "author", detail: "Author-owned governance and administrative content that must be reported from the study record." },
  { item: "25-26", label: "Interpretation and limitations", status: "author", detail: "Author-owned discussion content; EasyTableOne can supply analysis outputs, but not the study interpretation." },
];
