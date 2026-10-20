import type { AnalysisPlan, JournalRuleset, StatisticalResults, DataQualityRecord } from "../types";
import { pyodideRuntimeLabel } from "../runtimeEnvironment";
import { isFisherLike } from "./testName";
import { multipleTestingLabels } from "./multipleTestingLabels";



export function generateMethodsParagraph(
  results: StatisticalResults,
  ruleset: JournalRuleset,
  plan: AnalysisPlan,
  appVersion: string,
  overrides?: any,
  dataQualityRecords?: DataQualityRecord[],
  categoricalSummaryLabel = "n (%)",
): string {
  const logic = ruleset.EasyTableOne_Ruleset.global_defaults.normality_logic;

  // Aggregate which tests actually ran
  const testsRun = new Set<string>();
  let ranFisher = false;
  let ranMonteCarloFisher = false;
  for (const v of results.perVariable) {
    if (v.test.name && v.test.name !== 'None') {
      testsRun.add(v.test.name);
      if (isFisherLike(v.test.name)) ranFisher = true;
      if (v.test.name === "Fisher's exact (Monte Carlo)") ranMonteCarloFisher = true;
    }
  }

  // Continuous tests sentence
  const continuousSentences: string[] = [];
  if (testsRun.has("Welch's t-test") || testsRun.has('ANOVA')) {
    continuousSentences.push(
      `Continuous variables that met the normality assumption were summarized as mean (SD) and compared between groups using ${
        results.groups.length === 2 ? "Welch's t-test" : 'one-way ANOVA'
      }.`
    );
  }
  if (testsRun.has('Mann-Whitney U') || testsRun.has('Kruskal-Wallis')) {
    continuousSentences.push(
      `Continuous variables that did not meet the normality assumption were summarized as median (IQR) and compared using the ${
        results.groups.length === 2 ? 'Mann-Whitney U test' : 'Kruskal-Wallis test'
      }.`
    );
  }

  // Normality criterion
  let normalitySentence =
    `Normality was assessed by Shapiro-Wilk for n ≤ ${logic.large_n_threshold_n} ` +
    `and by skewness/kurtosis criterion (|skew| < ${logic.large_n_skew_max} ` +
    `and |excess kurtosis| < ${logic.large_n_kurt_max}) for n > ${logic.large_n_threshold_n}.`;
  if (results.perVariable.some((v) => v.test.auxiliary?.normalityMethod === "mixed")) {
    normalitySentence += " Each group was assessed by the criterion corresponding to its own size.";
  }

  // Categorical tests sentence
  const categoricalSentences: string[] = [];
  if (testsRun.has('Chi-square') || ranFisher) {
    let cat = `Categorical variables were summarized as ${categoricalSummaryLabel} and compared using `;
    const parts: string[] = [];
    if (testsRun.has('Chi-square')) parts.push('the chi-square test');
    if (ranFisher)
      parts.push("Fisher's exact test when expected cell counts were less than 5");
    cat += parts.join(', or ') + '.';
    categoricalSentences.push(cat);
    if (ranMonteCarloFisher) {
      categoricalSentences.push("For tables larger than 2x2 with low expected counts, Fisher P-values were estimated by seeded Monte Carlo simulation.");
    }
  }
  if (testsRun.has("Mann-Whitney U (ordinal)") || testsRun.has("Kruskal-Wallis (ordinal)")) {
    const testLabel = testsRun.has("Mann-Whitney U (ordinal)")
      ? "Mann-Whitney U"
      : "Kruskal-Wallis";
    categoricalSentences.push(
      `Ordered categorical variables selected by the user were compared using the ${testLabel} test on level ranks.`
    );
  }

  // SMD mention
  const smdPresent = results.perVariable.some((v) => v.smd != null);
  const hidePValueColumn = Boolean(plan.userOverrides?.hidePValueColumn);
  const smdSentence = (hidePValueColumn && smdPresent)
    ? 'Between-group baseline differences are displayed as standardized mean differences (SMD) rather than as a P-value column; SMD > 0.1 is conventionally interpreted as imbalanced.'
    : (!hidePValueColumn && smdPresent)
    ? 'Standardized mean differences (SMD) are reported alongside P-values; SMD > 0.1 is conventionally interpreted as imbalanced.'
    : '';

  // MTC mention
  const mtcSentence = plan.multipleTestingCorrection !== 'none'
    ? `Multiple testing was controlled using the ${multipleTestingLabels[plan.multipleTestingCorrection].method}.`
    : '';

  let postHocSentence = results.perVariable.some((v) => v.postHoc)
    ? "For variables with more than two groups and a significant overall test (using the multiplicity-adjusted omnibus p when a correction was applied), pairwise post-hoc comparisons were performed (Tukey HSD after ANOVA; Dunn's test (Holm-adjusted) after Kruskal-Wallis; Holm-adjusted pairwise chi-square/Fisher for categorical variables)."
    : '';
  if (postHocSentence && results.perVariable.some((v) => v.postHoc?.caveat)) {
    postHocSentence += " Where the equal-variance check was not met, Tukey HSD results were flagged for cautious interpretation.";
  }

  let missingCodesSentence = '';
  const appliedMissingRecords = (dataQualityRecords ?? []).filter(
    (r) => r.response === 'applied' && r.finding.checkId.startsWith('missing_code'),
  );
  if (appliedMissingRecords.length > 0) {
    const distinctCodes = Array.from(
      new Set(appliedMissingRecords.flatMap((r) => r.finding.sampleValues ?? [])),
    );
    const formatCodeForExample = (c: string) => {
      const num = Number(c);
      return !Number.isNaN(num) ? c : `"${c}"`;
    };
    const firstTwo = distinctCodes.slice(0, 2).map(formatCodeForExample);
    let exampleStr = '';
    if (firstTwo.length === 1) {
      exampleStr = `for example ${firstTwo[0]}`;
    } else if (firstTwo.length >= 2) {
      exampleStr = `for example ${firstTwo[0]} or ${firstTwo[1]}`;
    }
    missingCodesSentence = `Values recorded as missing-data codes (${exampleStr}) were set to missing before analysis at user direction.`;
  }

  // Library + app version
  const libs = results.computeMetadata.libVersions;
  const libParts = Object.entries(libs).map(([k, v]) => `${k} v${v}`).join(', ');
  const versionSentence =
    `Analyses were performed in EasyTableOne v${appVersion} (ruleset v${ruleset.EasyTableOne_Ruleset.version}) ` +
    `using ${libParts} on ${pyodideRuntimeLabel()}.`;

  const testOverridesSentences: string[] = [];
  if (plan.testOverrides && plan.testOverrides.length > 0) {
    for (const o of plan.testOverrides) {
      const v = results.perVariable.find((item) => item.variable === o.variable);
      if (!v) continue;
      const displayLabel = plan.variableConfig[o.variable]?.label ?? o.variable;

      let methodHumanName = v.test.name;
      if (isFisherLike(v.test.name)) methodHumanName = "Fisher's exact test";
      else if (v.test.name === "Chi-square") methodHumanName = "the chi-square test";
      else if (v.test.name === "Mann-Whitney U") methodHumanName = "the Mann-Whitney U test";
      else if (v.test.name === "Kruskal-Wallis") methodHumanName = "the Kruskal-Wallis test";
      else if (v.test.name === "ANOVA") methodHumanName = "one-way ANOVA";
      else if (v.test.name === "Mann-Whitney U (ordinal)") methodHumanName = "the Mann-Whitney U test on ordered categories";
      else if (v.test.name === "Kruskal-Wallis (ordinal)") methodHumanName = "the Kruskal-Wallis test on ordered categories";

      const hasContradiction = v.test.auxiliary?.assumptionCheckContradicted === "true";
      if (hasContradiction) {
        const isCategorical = v.overallSummary['counts'] !== undefined;
        const reason = v.test.auxiliary?.contradictionReason;
        let flagText = "a non-normality flag";
        if (reason === "unequal_variance") {
          flagText = "an unequal-variance flag";
        } else if (reason === "low_expected_count" || (!reason && isCategorical)) {
          flagText = "a low-expected-count flag";
        }
        testOverridesSentences.push(`${displayLabel} was compared using ${methodHumanName} at user selection despite ${flagText}.`);
      } else {
        testOverridesSentences.push(`${displayLabel} was compared using ${methodHumanName} at user selection.`);
      }
    }
  }

  const actualOverrides = overrides ?? plan.userOverrides;
  const hasOverrides = actualOverrides && Object.keys(actualOverrides).length > 0;
  const customSentence = hasOverrides
    ? "Some journal-default formatting options were customized; see reproducibility.json for details."
    : "";

  return [
    ...continuousSentences,
    normalitySentence,
    ...categoricalSentences,
    smdSentence,
    mtcSentence,
    postHocSentence,
    missingCodesSentence,
    versionSentence,
    ...testOverridesSentences,
    customSentence,
  ]
    .filter(Boolean)
    .join(' ');
}
