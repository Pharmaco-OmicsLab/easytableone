import { getColumnDisplayLabel } from "../format/columnLabel";
import { journalRulesets } from "../format/formatTable";
import { isFisherLike } from "../format/testName";
import { getModelingRationales, getRocAveragingRationale, getVariableImportanceRationale } from "../modeling/rationale";
import type { MethodRationale } from "../modeling/rationale";
import type { StatisticalResults } from "../types";
import type { DecisionExplanation, EducationContext, ExplanationBody, ExplanationDepth, StageId, StageOverview } from "./educationTypes";

export const STAGE_ORDER: StageId[] = ["upload", "sheet-header", "dictionary", "schema", "qa", "plan", "stats", "modeling", "export"];

export const TABLE1_MISSING_DATA_SIGNPOST =
  "Table 1 summarizes the values actually recorded (available-case per variable). It does not fill in missing values. If you want a complete-case or multiple-imputation analysis, choose it in the Modeling step.";

export const STAGE_DECISIONS: Record<StageId, string[]> = {
  upload: [],
  "sheet-header": [],
  dictionary: [],
  schema: ["schema.type-inference", "schema.reference-level", "schema.ordinal-order", "schema.exclusions"],
  qa: ["qa.gates", "qa.sanity-bounds", "qa.table1-missing-data", "qa.eda-correlation", "qa.eda-vif", "qa.eda-mcar", "qa.eda-mosaic"],
  plan: ["plan.grouping-variable", "plan.group-order", "plan.variable-order"],
  stats: ["stats.test-selection", "stats.normality-basis", "stats.yates", "stats.posthoc", "stats.smd", "stats.multiple-testing", "stats.baseline-testing"],
  modeling: ["modeling.model", "modeling.validation", "modeling.performanceCi", "modeling.ci", "modeling.imputation", "modeling.importance", "modeling.roc", "modeling.lambda"],
  export: [],
};

const COMING_SOON: ExplanationBody = {
  what: "Explanation coming soon.",
  why: "This decision is planned for the next education round so the app can keep the current workflow stable while the teaching layer expands.",
  alternatives: "Use the existing controls in this stage to review or change the decision; a fuller why-this-over-alternatives note is scheduled for Round 9.",
};

const stageOverviews: Record<StageId, StageOverview> = {
  upload: {
    title: "Upload Dataset",
    purpose: "Bring a CSV or Excel workbook into the browser and set study-wide assumptions before any analysis runs.",
    whatToDo: "Choose the dataset, then confirm the population and unit system used by the source data.",
    whyItMatters: "These choices affect parsing, sheet selection, and later plausibility checks, while keeping all row-level data local to your browser.",
  },
  "sheet-header": {
    title: "Sheet & Header",
    purpose: "Select the worksheet and header row that define the analyzable table.",
    whatToDo: "Pick the sheet, inspect the preview, and confirm the row that contains variable names.",
    whyItMatters: "A correct header prevents shifted columns, unnamed variables, and downstream type mistakes.",
  },
  dictionary: {
    title: "Data Dictionary",
    purpose: "Optionally attach labels, units, codes, and allowed values from a dictionary.",
    whatToDo: "Import or review dictionary fields, then resolve detected code mismatches when they appear.",
    whyItMatters: "Dictionary metadata makes the final table more readable and helps catch values that do not match the study codebook.",
  },
  schema: {
    title: "Variable types",
    purpose: "Confirm how each variable should be treated before quality checks and statistics.",
    whatToDo: "Review inferred types, labels, units, reference levels, ordinal order, and exclusions.",
    whyItMatters: "Statistical tests, summaries, model coding, and table labels all depend on these variable definitions.",
  },
  qa: {
    title: "Data checks",
    purpose: "Find data quality issues and optional exploratory patterns before the analysis plan is locked.",
    whatToDo: "Review blocking issues, polish suggestions, sanity-bound alerts, missingness, and EDA diagnostics.",
    whyItMatters: "Addressing data problems here reduces misleading summaries, invalid tests, and hard-to-explain exclusions later.",
  },
  plan: {
    title: "Analysis plan",
    purpose: "Choose the comparison structure and reporting options for Table 1.",
    whatToDo: "Select the grouping variable, included variables, display options, multiple-testing policy, and ordering.",
    whyItMatters: "The plan is the analysis contract that controls which results are computed and how they appear in exports.",
  },
  stats: {
    title: "Statistical Review",
    purpose: "Inspect the computed Table 1 statistics, diagnostics, tests, P-values, SMDs, and method choices.",
    whatToDo: "Check warnings, review test-selection rationale, and decide whether to continue to modeling or export.",
    whyItMatters: "This is the main audit point for whether automated statistical choices match the data and study design.",
  },
  modeling: {
    title: "Modeling",
    purpose: "Optionally fit logistic-regression and machine-learning models using the staged dataset and variable types.",
    whatToDo: "Choose an eligible outcome, predictors, modeling goal, validation settings, imputation policy, and run the selected analyses.",
    whyItMatters: "Modeling choices can change interpretation, so the app explains guardrails, validation, shrinkage, and performance summaries.",
  },
  export: {
    title: "Format and export",
    purpose: "Apply journal formatting and download the table, diagnostics, reproducibility files, and teaching reports.",
    whatToDo: "Choose the journal style, optional appendices, explanation depth, and download the needed files.",
    whyItMatters: "Exports preserve the table plus enough rationale to review, reproduce, and explain the analysis outside the app.",
  },
};

function bodyFromRationale(rationale: MethodRationale, alternatives: string): { concise: ExplanationBody; deep: ExplanationBody } {
  return {
    concise: { what: rationale.what, why: rationale.why, alternatives },
    deep: {
      what: `${rationale.what}. ${rationale.plain}`,
      why: `${rationale.why} ${rationale.example}`,
      alternatives,
    },
  };
}

function getDisplayVar(variable: string, context?: EducationContext): string {
  const col = context?.schema?.columns.find((c) => c.name === variable);
  return col ? getColumnDisplayLabel(col, "stripped") : variable;
}

function formatType(type: string | undefined): string {
  return (type ?? "unknown").replace(/_/g, " ");
}

function summarizeInferredTypes(context?: EducationContext): string {
  const columns = context?.schema?.columns ?? [];
  if (!columns.length) return "No active variable types are available yet, so type inference will be explained after upload and variable-type detection.";
  const examples = columns.slice(0, 4).map((col) => `${getColumnDisplayLabel(col, "stripped")} -> ${formatType(col.inferredType)}`);
  const suffix = columns.length > examples.length ? `, plus ${columns.length - examples.length} more` : "";
  return `The current variable types include ${examples.join(", ")}${suffix}.`;
}

function summarizeReferenceLevels(context?: EducationContext): string {
  const refs = (context?.schema?.columns ?? []).filter((col) => col.referenceLevel !== undefined);
  if (!refs.length) return "No reference levels have been set in the current variable types yet.";
  return refs
    .slice(0, 4)
    .map((col) => `${getColumnDisplayLabel(col, "stripped")}: ${col.levels?.find((level) => String(level.code) === String(col.referenceLevel))?.label ?? String(col.referenceLevel)}`)
    .join("; ");
}

function summarizeOrdinalColumns(context?: EducationContext): string {
  const ordinal = (context?.schema?.columns ?? []).filter((col) => col.confirmedType === "categorical_ordinal");
  if (!ordinal.length) return "No variables are currently marked ordinal.";
  return ordinal
    .slice(0, 4)
    .map((col) => {
      const levels = [...(col.levels ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((level) => level.label).join(" < ");
      return `${getColumnDisplayLabel(col, "stripped")}${levels ? ` (${levels})` : ""}`;
    })
    .join("; ");
}

function summarizeExclusions(context?: EducationContext): string {
  const excluded = (context?.schema?.columns ?? []).filter((col) => col.exclusionReason);
  if (!excluded.length) return "No variables are currently auto-excluded in the variable types step.";
  return excluded
    .slice(0, 4)
    .map((col) => `${getColumnDisplayLabel(col, "stripped")}: ${col.exclusionReason}`)
    .join("; ");
}

function summarizeGrouping(context?: EducationContext): string {
  const grouping = context?.plan?.groupingVariable;
  if (!grouping) return "No grouping variable has been locked into the current plan yet.";
  const col = context?.schema?.columns.find((item) => item.name === grouping);
  return `${getDisplayVar(grouping, context)} is the grouping variable${col ? ` and is typed as ${formatType(col.confirmedType)}` : ""}.`;
}

function summarizeGroupOrder(context?: EducationContext): string {
  const order = context?.plan?.groupOrder;
  if (!order?.length) return "No saved group order is present yet; the default order will be computed when statistics run.";
  return `Current saved order: ${order.map(String).join(", ")}.`;
}

function summarizeVariableOrder(context?: EducationContext): string {
  const variables = context?.plan?.includedVariables ?? [];
  if (!variables.length) return "No included-variable order has been saved yet.";
  return `Current row order starts with ${variables.slice(0, 5).map((name) => getDisplayVar(name, context)).join(", ")}${variables.length > 5 ? `, plus ${variables.length - 5} more` : ""}.`;
}

function statsDecisionForVariable(v: StatisticalResults["perVariable"][number], context?: EducationContext): DecisionExplanation {
  const logic = journalRulesets.EasyTableOne_Ruleset.global_defaults.normality_logic;
  const label = `Test selection: ${getDisplayVar(v.variable, context)}`;
  const groups = context?.stats?.groups ?? [];
  const groupCount = groups.length || Object.keys(v.summaryByGroup).length;
  const isContinuous = v.overallSummary.mean !== undefined || v.overallSummary.median !== undefined;
  const isCategorical = v.overallSummary.counts !== undefined;
  const notes = v.notes.length ? v.notes.join("; ") : "No additional diagnostic notes were recorded.";
  let concise: ExplanationBody;
  let deep: ExplanationBody;

  if (v.test.name === "None") {
    concise = { what: "No statistical test", why: notes, alternatives: "Return to Analysis plan or Variable types to include a comparable variable with an appropriate type and grouping structure." };
    deep = concise;
  } else if (isContinuous) {
    const groupSizes = groups.map((g) => v.summaryByGroup[g.name]?.n ?? 0).filter((n) => n > 0);
    const nMin = groupSizes.length ? Math.min(...groupSizes) : 0;
    const parametric = ["Welch's t-test", "ANOVA"].includes(v.test.name);
    const normalityBasis = nMin > 0 && nMin <= logic.large_n_threshold_n
      ? `Shapiro-Wilk p >= ${logic.small_n_threshold_p} in every group for the parametric path`
      : `skewness within +/-${logic.large_n_skew_max} and excess kurtosis within +/-${logic.large_n_kurt_max} for the parametric path`;
    const alternative = groupCount === 2
      ? (parametric ? "Mann-Whitney U test" : "Welch's t-test")
      : (parametric ? "Kruskal-Wallis test" : "one-way ANOVA");
    concise = {
      what: v.test.name,
      why: parametric ? `The variable met the app's normality rule (${normalityBasis}), so a parametric comparison was used.` : `The variable did not meet the app's normality rule (${normalityBasis}), so a rank-based comparison was used.`,
      alternatives: `Use a test override in the plan to choose ${alternative} when the study protocol requires it.`,
    };
    deep = {
      what: `${v.test.name} for a ${groupCount === 2 ? "two-group" : "multi-group"} continuous comparison.`,
      why: `${concise.why} The rule is data-driven and uses the observed grouped summaries for this variable rather than assuming one method for every continuous column.`,
      alternatives: `The main alternative here is ${alternative}. Override only when justified by protocol, diagnostics, or a prespecified analysis plan, because changing tests after seeing P-values can bias interpretation.`,
    };
  } else if (isCategorical) {
    const fisher = isFisherLike(v.test.name);
    concise = {
      what: v.test.name,
      why: fisher ? "Sparse expected cell counts made the exact test more appropriate than a chi-square approximation." : "Expected cell counts were adequate for the chi-square approximation.",
      alternatives: `Use a test override in the plan to choose ${fisher ? "chi-square" : "Fisher's exact"} when the study protocol requires it.`,
    };
    deep = {
      what: `${v.test.name} for a categorical group comparison.`,
      why: `${concise.why} This choice is based on the contingency table produced for this variable and grouping variable.`,
      alternatives: `${concise.alternatives} Fisher's exact is more conservative for sparse tables; chi-square is faster and conventional when expected counts are large enough.`,
    };
  } else {
    concise = { what: v.test.name, why: notes || "Automatic test selection was applied.", alternatives: "Review the variable type in Variable types or use a test override in Analysis plan." };
    deep = concise;
  }

  return { id: `stats.test-selection.${v.variable}`, label, concise, deep };
}

function simpleDecision(id: string, label: string, concise: ExplanationBody, deep?: ExplanationBody): DecisionExplanation {
  return { id, label, concise, deep: deep ?? concise };
}

const staticBuilders: Record<string, (context?: EducationContext) => DecisionExplanation> = {
  "schema.type-inference": (context) => simpleDecision(
    "schema.type-inference",
    "Type inference",
    {
      what: summarizeInferredTypes(context),
      why: "The app uses observed values and the number of distinct values in each column: decimals usually become continuous, two-level whole-number or code columns become binary, low-cardinality text/code columns become categorical, and ID-like or unsupported columns are separated.",
      alternatives: "Use the per-column Type dropdown or the bulk controls for ambiguous numeric columns to choose continuous, binary, nominal, ordinal, ID-like, or unsupported.",
    },
    {
      what: `${summarizeInferredTypes(context)} The confirmed type controls summaries, tests, plots, model coding, and whether the variable can be used as a grouping variable.`,
      why: "Inference is a starting point, not a final truth. The app keeps common clinical patterns practical by distinguishing continuous measurements from low-cardinality categories, binary indicators, high-cardinality fields, and identifiers before downstream statistics run.",
      alternatives: "Change a single column in the Type dropdown, use the bulk ambiguous-column buttons when many numeric codes need the same treatment, or mark a field ID-like/unsupported when it should not be analyzed.",
    },
  ),
  "schema.reference-level": (context) => simpleDecision(
    "schema.reference-level",
    "Reference level",
    {
      what: summarizeReferenceLevels(context),
      why: "When a categorical variable has a reference, the app defaults to the most frequent observed level so contrasts and odds ratios compare other levels against a stable baseline.",
      alternatives: "Change the reference level when the protocol, clinical convention, or interpretation requires another baseline.",
    },
    {
      what: `${summarizeReferenceLevels(context)} A reference level is the baseline category used for contrasts, regression coding, and odds-ratio interpretation.`,
      why: "The most frequent level is used by default because it often gives the most stable comparison group and avoids rare categories becoming the denominator for interpretation.",
      alternatives: "Use a different level when a control group, placebo arm, normal category, or prespecified comparator is more meaningful than the frequency default.",
    },
  ),
  "schema.ordinal-order": (context) => simpleDecision(
    "schema.ordinal-order",
    "Ordinal order",
    {
      what: summarizeOrdinalColumns(context),
      why: "Ordinal order needs user confirmation because the app can see levels but cannot always know their real clinical ranking.",
      alternatives: "Leave the variable nominal when the levels are labels without a meaningful order.",
    },
    {
      what: `${summarizeOrdinalColumns(context)} Ordinal order controls display order and lets later steps distinguish ranked categories from unordered labels.`,
      why: "The safest default is to ask for confirmation: values such as mild/moderate/severe are ordered, while site names or treatment arms may have no natural rank even if they look categorical.",
      alternatives: "Turn off Mark as ordinal to treat the variable as nominal, or reorder the levels when the displayed sequence does not match the study codebook.",
    },
  ),
  "schema.exclusions": (context) => simpleDecision(
    "schema.exclusions",
    "Variable type exclusions",
    {
      what: summarizeExclusions(context),
      why: "The app excludes variables that are likely unsafe for automatic Table 1 use, including severe missingness, unsupported types, and high-cardinality fields.",
      alternatives: "Restore an excluded variable only after confirming the missingness, coding, or cardinality issue is acceptable for this analysis.",
    },
    {
      what: `${summarizeExclusions(context)} Excluded variables stay out of QA, planning, statistics, modeling, and exports unless restored.`,
      why: "Automatic exclusion protects the workflow from variables that would create misleading summaries, invalid comparisons, or unreadable tables. The recorded reason is kept so the choice remains auditable.",
      alternatives: "Use Restore to re-include a variable, then adjust its type or coding. Re-inclusion is reasonable when the exclusion reflects a known design feature rather than a data problem.",
    },
  ),
  "qa.gates": () => simpleDecision(
    "qa.gates",
    "QA gates",
    {
      what: "QA findings use blocking, review, and advisory tiers.",
      why: "Blocking issues prevent invalid analyses, while warnings and polish suggestions can still move forward after documented review.",
      alternatives: "Fix blocking issues, acknowledge review findings, dismiss advisory polish items, or return to earlier stages to change the data or variable types.",
    },
    {
      what: "The QA gate separates findings into blocking issues that stop progression, review issues that require acknowledgement, and advisory items that support cleanup.",
      why: "This tiering avoids treating every issue as equally severe. It blocks known-invalid states, asks for deliberate review when analysis may still be defensible, and keeps minor polish suggestions from interrupting the workflow.",
      alternatives: "Resolve the source data, edit variable metadata, acknowledge a review warning with rationale, dismiss advisory polish, or re-upload a corrected workbook.",
    },
  ),
  "qa.sanity-bounds": () => simpleDecision(
    "qa.sanity-bounds",
    "Sanity bounds",
    {
      what: "The bounds library checks known clinical ranges for compatible concepts, populations, and units.",
      why: "These checks are advisory because plausible ranges depend on population, unit conventions, and study context.",
      alternatives: "Review highlighted values, correct units/coding, or keep true extreme values with documentation.",
    },
    {
      what: "Sanity bounds compare values against curated adult or pediatric ranges when a variable can be matched to a known concept and unit system.",
      why: "They are advisory rather than blocking because an out-of-range value may be a data-entry error, a unit mismatch, or a real extreme observation in the target population.",
      alternatives: "Change the population/unit assumptions, correct source values, exclude or winsorize only when justified, or leave valid extremes in the analysis.",
    },
  ),
  "qa.table1-missing-data": () => simpleDecision(
    "qa.table1-missing-data",
    "Table 1 missing-data handling",
    {
      what: TABLE1_MISSING_DATA_SIGNPOST,
      why: "Descriptive Table 1 rows stay tied to observed values and their per-variable denominators, while modeling has separate controls for complete-case and MICE workflows.",
      alternatives: "Use Format and export to show per-variable missing rows, or use Modeling when the analysis itself should use complete-case rows or multiple imputation.",
    },
    {
      what: TABLE1_MISSING_DATA_SIGNPOST,
      why: "Keeping Table 1 observed-only avoids silently changing descriptive denominators. It also makes the missing-data strategy auditable: the descriptive table can show missingness, and inferential modeling can explicitly choose complete-case or MICE when that is the study's analysis plan.",
      alternatives: "Show the missing-data row in exported Table 1 for transparency, review EDA missingness diagnostics, then choose complete-case or MICE in Modeling for model-based analyses.",
    },
  ),
  "qa.eda-correlation": () => simpleDecision(
    "qa.eda-correlation",
    "Correlation screen",
    {
      what: "EDA shows Pearson r and Spearman rho for continuous-variable pairs, with |r| > 0.7 flagged.",
      why: "Highly correlated predictors are an early warning for collinearity before modeling or interpretation.",
      alternatives: "Inspect the heatmap, review flagged pairs, or use modeling diagnostics for model-specific collinearity decisions.",
    },
    {
      what: "The correlation view focuses on the lower triangle of continuous-variable pairs and reports both linear Pearson correlation and rank-based Spearman correlation.",
      why: "A |r| > 0.7 flag is not an automatic exclusion rule, but it points to variables that may be redundant, mechanically related, or unstable together in a model.",
      alternatives: "Keep both variables for descriptive Table 1 reporting, combine related measures, prespecify one representative variable, or review scatterplots/model diagnostics outside the table workflow.",
    },
  ),
  "qa.eda-vif": () => simpleDecision(
    "qa.eda-vif",
    "VIF screen",
    {
      what: "VIF measures how much a continuous predictor is explained by the other continuous predictors.",
      why: "It matters when you plan regression or machine-learning models; it is optional and not needed for a descriptive Table 1.",
      alternatives: "Keep all variables for descriptive reporting, then drop, combine, or prespecify one of a correlated predictor set when modeling requires a simpler design.",
    },
    {
      what: "Variance inflation factor is a multicollinearity diagnostic: it increases when one predictor can be predicted from the others.",
      why: "The >5 and >10 thresholds are practical warning levels. They do not invalidate Table 1 summaries, but they help you notice redundancy before using the same variables in regression or machine-learning models.",
      alternatives: "Keep variables for descriptive reporting, remove one of a redundant pair, combine measurements into a score, or handle collinearity later with penalized modeling or protocol-defined predictor selection.",
    },
  ),
  "qa.eda-mcar": () => simpleDecision(
    "qa.eda-mcar",
    "MCAR screen",
    {
      what: "Little's MCAR test asks whether missingness looks unrelated to the observed data pattern. Experimental: R parity validation was not available in this environment.",
      why: "A low P-value argues against MCAR; it does not prove whether the mechanism is MAR or MNAR.",
      alternatives: "Inspect missingness patterns, use subject-matter review, or plan sensitivity/imputation analyses outside this screening step.",
    },
    {
      what: "Little's MCAR test summarizes whether complete and incomplete records differ in ways that make missing completely at random implausible. Experimental: R parity validation was not available in this environment.",
      why: "When the P-value is low, the app treats MCAR as unlikely, which means complete-case summaries may describe a selected subset. The test cannot distinguish missing at random from missing not at random, and it can be limited by sample size and missingness pattern counts.",
      alternatives: "Use the missingness heatmap and correlated-missingness list, check data-collection causes, consider multiple imputation or sensitivity analysis, and document the chosen missing-data strategy.",
    },
  ),
  "qa.eda-mosaic": () => simpleDecision(
    "qa.eda-mosaic",
    "Mosaic plots",
    {
      what: "Mosaic plots show categorical-by-categorical association through rectangle widths and heights.",
      why: "They make imbalanced or unexpectedly concentrated level combinations visible before final reporting.",
      alternatives: "Use contingency tables, chi-square/Fisher results, or stratified bar charts for more formal or presentation-ready views.",
    },
    {
      what: "Each mosaic tile represents a combination of two categorical levels; larger areas mean more observations in that combination.",
      why: "The plot is exploratory. It helps reveal separation, sparse cells, imbalance, or coding surprises that may affect categorical tests and model stability.",
      alternatives: "Review the underlying counts, collapse rare levels when clinically defensible, use formal tests in Statistical Review, or export data for custom categorical graphics.",
    },
  ),
  "plan.grouping-variable": (context) => simpleDecision(
    "plan.grouping-variable",
    "Grouping variable",
    {
      what: summarizeGrouping(context),
      why: "Only categorical variables can define Table 1 columns and comparison groups.",
      alternatives: "Choose another binary, nominal, or ordinal variable, or return to Variable types to correct a variable type.",
    },
    {
      what: `${summarizeGrouping(context)} The selected grouping variable defines the table columns, statistical comparisons, bivariate EDA grouping, and the default outcome candidate carried into modeling.`,
      why: "Grouping is restricted to categorical variables because continuous variables do not define discrete Table 1 strata without a separate binning decision.",
      alternatives: "Pick a different eligible categorical variable, change the variable type when a coded variable was misclassified, or create a prespecified grouped variable upstream before upload.",
    },
  ),
  "plan.group-order": (context) => simpleDecision(
    "plan.group-order",
    "Group order",
    {
      what: summarizeGroupOrder(context),
      why: "By default, ordinal groups follow their level order, binary groups use ascending code/value order, and nominal groups are sorted by frequency unless you override them.",
      alternatives: "Use frequency, value, or custom ordering when journal convention or study protocol requires a different column order.",
    },
    {
      what: `${summarizeGroupOrder(context)} Group order controls the left-to-right Table 1 columns and the order used in comparisons and exports.`,
      why: "The default rules keep ordered categories clinically ordered, binary codes predictable, and nominal groups readable by putting common groups first. Custom order is preserved when selected.",
      alternatives: "Switch to frequency descending, value ascending, or enter a custom order to match protocol, manuscript, or clinical convention.",
    },
  ),
  "plan.variable-order": (context) => simpleDecision(
    "plan.variable-order",
    "Variable order",
    {
      what: summarizeVariableOrder(context),
      why: "The default follows the variable order, while miscellaneous labels such as Other, Unknown, or N/A stay at the bottom within categorical level displays.",
      alternatives: "Drag variables or use move controls to match the manuscript's preferred row order.",
    },
    {
      what: `${summarizeVariableOrder(context)} This order becomes the row order in Statistical Review and exports.`,
      why: "Variable order preserves the source table/codebook structure unless you deliberately reorganize it. Miscellaneous categorical tail labels are kept from interrupting substantive levels.",
      alternatives: "Use drag-and-drop or move-to-top/up/down controls to group related variables, follow a journal shell, or match a prespecified analysis plan.",
    },
  ),
  "stats.test-selection": (context) => simpleDecision(
    "stats.test-selection",
    "Test selection",
    {
      what: "Automatic per-variable statistical test selection.",
      why: "Continuous and categorical variables use different rules, and each variable is checked against the grouped data that actually ran.",
      alternatives: "Open each variable's explainer below or use Plan test overrides when a protocol specifies a different test.",
    },
    {
      what: "Automatic per-variable statistical test selection for the Statistical Review stage.",
      why: `The app chooses among Welch's t-test, ANOVA, Mann-Whitney U, Kruskal-Wallis, chi-square, Fisher's exact, or no test based on type, group count, normality diagnostics, sparsity, and notes from the computed results. ${context?.plan?.testOverrides?.length ? "One or more user test overrides are present in the plan." : "No user test overrides are recorded in the current plan."}`,
      alternatives: "Use Variable types to correct variable type, Analysis plan to set a test override, or journal/display controls to suppress P-values when the study design calls for SMD-only reporting.",
    },
  ),
  "stats.normality-basis": () => simpleDecision(
    "stats.normality-basis",
    "Normality basis",
    {
      what: "Small groups use Shapiro-Wilk; larger groups use skewness and kurtosis guardrails.",
      why: "The app avoids relying on one normality signal for every sample size.",
      alternatives: "Override individual tests in Plan when a protocol defines a different normality approach.",
    },
    {
      what: "Normality basis for continuous-variable test selection.",
      why: "For smaller group sizes, Shapiro-Wilk is sensitive to distributional departures. For larger groups, skewness and excess kurtosis are used because very large samples can make tiny, clinically irrelevant departures statistically significant.",
      alternatives: "Use a protocol-driven test override in Analysis plan, or change the variable type in Variable types if the column should be summarized categorically instead.",
    },
  ),
  "stats.yates": () => simpleDecision(
    "stats.yates",
    "Yates correction",
    {
      what: "Yates continuity correction can be applied to eligible 2 x 2 chi-square comparisons.",
      why: "It is a conservative guardrail for small two-by-two tables.",
      alternatives: "Use Fisher's exact for sparse cells or disable the correction when the journal/protocol prefers uncorrected chi-square.",
    },
  ),
  "stats.posthoc": (context) => simpleDecision(
    "stats.posthoc",
    "Post-hoc comparisons",
    {
      what: "Pairwise post-hoc tests appear when a multi-group omnibus test supports follow-up comparisons.",
      why: "They show which groups drive an overall difference while applying a correction to pairwise P-values.",
      alternatives: "Report only the omnibus test, or predefine specific pairwise contrasts outside Table 1.",
    },
    {
      what: "Post-hoc comparisons for variables with available pairwise results.",
      why: `${context?.stats?.perVariable.some((v) => v.postHoc) ? "At least one variable currently has post-hoc output." : "No variable currently has post-hoc output."} Pairwise testing is separated from the omnibus test so the table can distinguish a global difference from specific group pairs. When multiple-testing correction is active, the omnibus used for the post-hoc decision is the adjusted one.`,
      alternatives: "Use only the omnibus P-value for a compact Table 1, or conduct prespecified pairwise contrasts in a separate analysis section.",
    },
  ),
  "stats.smd": () => simpleDecision(
    "stats.smd",
    "Standardized mean difference",
    {
      what: "SMD is an effect-size balance measure.",
      why: "It is less driven by sample size than a P-value and is preferred for baseline balance checks.",
      alternatives: "Show P-values, SMDs, both, or SMD-only through the plan/display options.",
    },
  ),
  "stats.multiple-testing": (context) => simpleDecision(
    "stats.multiple-testing",
    "Multiple-testing correction",
    {
      what: context?.plan?.multipleTestingCorrection && context.plan.multipleTestingCorrection !== "none" ? `${context.plan.multipleTestingCorrection} correction` : "No multiple-testing correction",
      why: context?.plan?.multipleTestingCorrection && context.plan.multipleTestingCorrection !== "none" ? "The plan applies a correction because many P-values can increase false-positive risk." : "The plan keeps raw P-values, which is common for descriptive Table 1 reporting.",
      alternatives: "Change the correction policy in Plan to none, Bonferroni, Holm, or Benjamini-Hochberg.",
    },
  ),
  "stats.baseline-testing": (context) => simpleDecision(
    "stats.baseline-testing",
    "Baseline testing",
    {
      what: context?.plan?.studyDesign === "randomized_trial" ? "Randomised design declared" : "No randomised-design advisory applies",
      why: "In a properly randomised trial, baseline differences are expected to arise by chance, so significance tests of baseline balance are discouraged by CONSORT explanatory guidance.",
      alternatives: "Report standardised differences to describe imbalance size independently of sample size, or keep P values when a target journal requires them.",
    },
    {
      what: "Baseline P-value reporting depends on the user-declared study design and is never inferred from the dataset.",
      why: "For randomised trials, a baseline significance test asks whether groups differ beyond chance even though randomisation makes chance the mechanism. Standardised differences instead describe the magnitude of imbalance and remain useful without implying a hypothesis test of randomisation quality.",
      alternatives: "Use the advisory action to hide the P-value column while keeping computed P values in reproducibility JSON, or dismiss the advisory for the session and keep P values visible.",
    },
  ),
  "modeling.model": (context) => {
    const rationales = context?.modelingSetup ? getModelingRationales(context.modelingSetup, context.modelingResults) : null;
    const body = rationales ? bodyFromRationale(rationales.model, "Change the selected model in the Modeling setup: plain, ridge, LASSO, elastic-net, or Firth, subject to guardrails.") : { concise: COMING_SOON, deep: COMING_SOON };
    return { id: "modeling.model", label: "Model choice", ...body };
  },
  "modeling.validation": (context) => {
    const rationales = context?.modelingSetup ? getModelingRationales(context.modelingSetup, context.modelingResults) : null;
    const source = rationales?.logisticValidation ?? rationales?.mlValidation;
    const body = source ? bodyFromRationale(source, "Use fast/thorough validation settings, rerun bootstrap validation, or compare with the machine-learning shared-fold benchmark.") : { concise: COMING_SOON, deep: COMING_SOON };
    return { id: "modeling.validation", label: "Validation", ...body };
  },
  "modeling.ci": () => simpleDecision(
    "modeling.ci",
    "Confidence intervals",
    {
      what: "Model intervals summarize uncertainty around odds ratios or performance estimates.",
      why: "Intervals are often more informative than a single P-value, especially for penalized models.",
      alternatives: "Use the validation and bootstrap settings in Modeling, or report model estimates without intervals only when justified by the protocol.",
    },
  ),
  "modeling.performanceCi": (context) => {
    const rationales = context?.modelingSetup ? getModelingRationales(context.modelingSetup, context.modelingResults) : null;
    const body = rationales ? bodyFromRationale(rationales.performanceCi, "Report the point estimate without a performance interval only when the bootstrap or repeated-CV repeats do not support one.") : { concise: COMING_SOON, deep: COMING_SOON };
    return { id: "modeling.performanceCi", label: "Performance intervals", ...body };
  },
  "modeling.imputation": (context) => {
    const rationales = context?.modelingSetup ? getModelingRationales(context.modelingSetup, context.modelingResults) : null;
    const body = rationales ? bodyFromRationale(rationales.imputation, "Open advanced Modeling settings to compare complete-case, simple fill, kNN, random-forest, and MICE options.") : { concise: COMING_SOON, deep: COMING_SOON };
    return { id: "modeling.imputation", label: "Imputation", ...body };
  },
  "modeling.importance": () => {
    const rationale = getVariableImportanceRationale();
    const body = bodyFromRationale(rationale, "Permutation importance is used for cross-model comparability; model-specific importance can be computed outside the app if needed.");
    return { id: "modeling.importance", label: "Variable importance", ...body };
  },
  "modeling.roc": () => {
    const rationale = getRocAveragingRationale();
    const body = bodyFromRationale(rationale, "Inspect individual model ROC output or export modeling data to draw custom curves.");
    return { id: "modeling.roc", label: "ROC averaging", ...body };
  },
  "modeling.lambda": (context) => {
    const rationales = context?.modelingSetup ? getModelingRationales(context.modelingSetup, context.modelingResults) : null;
    const body = rationales ? bodyFromRationale(rationales.lambdaRule, "Open advanced Modeling settings to switch between lambda_1se and lambda_min.") : { concise: COMING_SOON, deep: COMING_SOON };
    return { id: "modeling.lambda", label: "Lambda rule", ...body };
  },
};

export function getStageOverview(stage: StageId): StageOverview {
  return stageOverviews[stage];
}

export function getAllStageOverviews(): Record<StageId, StageOverview> {
  return stageOverviews;
}

export function getDecision(id: string, depth: ExplanationDepth, context?: EducationContext): DecisionExplanation {
  if (id.startsWith("stats.test-selection.")) {
    const variable = id.slice("stats.test-selection.".length);
    const row = context?.stats?.perVariable.find((item) => item.variable === variable);
    if (row) return getStatsVariableDecision(row, depth, context);
  }
  const builder = staticBuilders[id];
  const decision = builder ? builder(context) : { id, label: id, concise: COMING_SOON, deep: COMING_SOON };
  const selected = decision[depth];
  return { ...decision, concise: selected, deep: selected };
}

export function getDecisionBody(id: string, depth: ExplanationDepth, context?: EducationContext): ExplanationBody {
  return getDecision(id, depth, context).concise;
}

export function getStageDecisionIds(stage: StageId, context?: EducationContext): string[] {
  if (stage !== "stats") return STAGE_DECISIONS[stage];
  const variableIds = context?.stats?.perVariable.map((v) => `stats.test-selection.${v.variable}`) ?? [];
  return [...STAGE_DECISIONS.stats, ...variableIds];
}

export function getStatsVariableDecision(variable: StatisticalResults["perVariable"][number], depth: ExplanationDepth, context?: EducationContext): DecisionExplanation {
  const decision = statsDecisionForVariable(variable, context);
  const selected = decision[depth];
  return { ...decision, concise: selected, deep: selected };
}
