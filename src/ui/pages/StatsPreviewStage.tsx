import { useState } from "react";
import { useStore } from "../../store";
import { getColumnDisplayLabel } from "../../core/format/columnLabel";
import { stripBracketCodes } from "../../core/format/tableTitle";
import { DiagnosticsPanel } from "../components/DiagnosticsPanel";
import { journalRulesets } from "../../core/format/formatTable";
import { countTestedVariablesFromResults, getMtcAdvice } from "../../core/stats/mtcAdvice";
import { getBaselineTestingAdvice } from "../../core/stats/baselineTestingAdvice";
import { isFisherLike } from "../../core/format/testName";
import AboutThisStep from "../components/AboutThisStep";
import DecisionExplainer from "../components/DecisionExplainer";
import EmptyState from "../components/EmptyState";

export default function StatsPreviewStage() {
  const { stats, schema, plan, journalId, setStage, setModelingEnabled, setPlan } = useStore();
  const [baselineAdviceDismissed, setBaselineAdviceDismissed] = useState(false);

  if (!stats) {
    return (
      <EmptyState
        title="No statistics available"
        reason="Statistics run after you confirm your analysis plan in Step 6."
        next="Go back to the analysis plan, choose the grouping variable and rows, then run statistics."
        action={{ label: "Go to Analysis Plan", onClick: () => setStage(6) }}
      />
    );
  }

  const ruleset = journalRulesets.EasyTableOne_Ruleset;
  const logic = ruleset.global_defaults.normality_logic;
  const mtcAdvice = plan ? getMtcAdvice(plan, countTestedVariablesFromResults(stats)) : null;
  const smdAvailable = stats.perVariable.some((v) => v.smd !== undefined && v.smd !== null);
  const baselineAdvice = plan && !baselineAdviceDismissed
    ? getBaselineTestingAdvice(plan, smdAvailable)
    : null;

  const getDisplayVar = (name: string) => {
    const col = schema?.columns.find(c => c.name === name);
    return col ? getColumnDisplayLabel(col, 'stripped') : stripBracketCodes(name);
  };

  const getRationaleText = (v: any) => {
    const col = schema?.columns.find(c => c.name === v.variable);
    const isContinuous = col?.confirmedType === 'continuous' || v.overallSummary['mean'] !== undefined || v.overallSummary['median'] !== undefined;
    const isCategorical = col?.confirmedType === 'binary' || col?.confirmedType === 'categorical_nominal' || col?.confirmedType === 'categorical_ordinal' || v.overallSummary['counts'] !== undefined;
    const varDisplay = getDisplayVar(v.variable);

    if (v.test.name === 'None') {
      return `No statistical test was run for ${varDisplay}. ${v.notes.join('; ')}`;
    }

    if (isContinuous) {
      const groupSizes = stats.groups.map(g => v.summaryByGroup[g.name]?.n ?? 0);
      const nMin = Math.min(...groupSizes);
      const isNormal = ["Welch's t-test", 'ANOVA'].includes(v.test.name);
      
      const alternative = stats.groups.length === 2
        ? (isNormal ? "Mann-Whitney U test" : "Welch's t-test")
        : (isNormal ? "Kruskal-Wallis test" : "one-way ANOVA");

      if (nMin <= logic.large_n_threshold_n) {
        if (isNormal) {
          return `${varDisplay} met the normality assumption (Shapiro–Wilk test p >= ${logic.small_n_threshold_p} for all groups), so the parametric ${v.test.name} was used. If the data had not been approximately normal, the non-parametric ${alternative} would apply.`;
        } else {
          return `${varDisplay} did not meet the normality assumption (Shapiro–Wilk test p < ${logic.small_n_threshold_p} in at least one group), so the non-parametric ${v.test.name} was used. If the data had been approximately normal, the parametric ${alternative} would apply.`;
        }
      } else {
        if (isNormal) {
          return `${varDisplay} met the normality assumption (group skewness within ±${logic.large_n_skew_max} and excess kurtosis within ±${logic.large_n_kurt_max}), so the parametric ${v.test.name} was used. If the data had not been approximately normal, the non-parametric ${alternative} would apply.`;
        } else {
          return `${varDisplay} did not meet the normality assumption (group skewness outside ±${logic.large_n_skew_max} or excess kurtosis outside ±${logic.large_n_kurt_max}), so the non-parametric ${v.test.name} was used. If the data had been approximately normal, the parametric ${alternative} would apply.`;
        }
      }
    }

    if (isCategorical) {
      const isFisher = isFisherLike(v.test.name);
      const alternative = isFisher ? 'chi-square test' : "Fisher's exact test";
      if (isFisher && v.test.name.includes('Monte Carlo')) {
        return `Some expected cell counts were less than 5 and the table is larger than 2x2, so Fisher's exact test with seeded Monte-Carlo estimation was used. If expected cell counts had been 5 or more, the ${alternative} would apply.`;
      }
      if (isFisher) {
        return `Some expected cell counts were less than 5, so Fisher's exact test was used. If expected cell counts had been 5 or more, the ${alternative} would apply.`;
      } else {
        return `All expected cell counts were 5 or more, so the chi-square test was used. If expected cell counts had been less than 5, the ${alternative} would apply.`;
      }
    }

    return "";
  };

  const getDecisionBadge = (v: any) => {
    if (isFisherLike(v.test.name)) return v.test.name.includes('Monte Carlo') ? "Fisher's exact (Monte Carlo) - sparse table" : "Fisher's exact - sparse cells";
    if (v.test.name === "Chi-square") return "Chi-square - adequate expected counts";
    if (v.test.name === "Welch's t-test") return "Welch t-test - normality acceptable";
    if (v.test.name === "ANOVA") return "ANOVA - normality acceptable";
    if (v.test.name === "Mann-Whitney U") return "Mann-Whitney U - non-normal data";
    if (v.test.name === "Kruskal-Wallis") return "Kruskal-Wallis - non-normal data";
    return v.test.name;
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <AboutThisStep stage="stats" />
      <h2 className="text-2xl font-bold text-gray-900">Statistical Review</h2>

      {mtcAdvice && (
        <div className={`rounded p-4 text-sm ${
          mtcAdvice.severity === "strong"
            ? "border border-red-300 bg-red-50 text-red-700 font-bold"
            : "border border-amber-300 bg-amber-50 text-amber-800"
        }`}>
          {mtcAdvice.message}
          {mtcAdvice.severity === "strong" && (
            <span> For a baseline Table 1 of a randomized trial, see the note about omitting P-values below.</span>
          )}
        </div>
      )}

      {baselineAdvice && (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p>{baselineAdvice.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {baselineAdvice.smdAvailable && (
              <button
                type="button"
                onClick={() => {
                  if (!plan) return;
                  setPlan({
                    ...plan,
                    userOverrides: { ...(plan.userOverrides ?? {}), hidePValueColumn: true },
                  });
                }}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Report standardised differences only
              </button>
            )}
            <button
              type="button"
              onClick={() => setBaselineAdviceDismissed(true)}
              className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Keep P values
            </button>
          </div>
        </div>
      )}
      
      {/* Novice Help Guide */}
      <details className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2 text-sm text-blue-900">
        <summary className="font-semibold cursor-pointer focus:outline-none select-none">
          About these statistics (Help Guide)
        </summary>
        <div className="pt-2 space-y-3">
          <p>
            <strong>P-value &amp; 0.05 Convention:</strong> A P-value is the probability of seeing a difference at least as large as the one observed if there were truly no difference between the groups (the null hypothesis). It is not the probability that the groups are the same. By convention, a P-value less than 0.05 is often treated as statistically significant.
          </p>
          <p>
            <strong>Parametric vs. Non-parametric Tests:</strong> Parametric tests (like Welch's t-test and ANOVA) assume the data follow a specific distribution (usually normal). When data violate normality (as flagged by Shapiro-Wilk or skewness checks), we use non-parametric tests (like Mann-Whitney U or Kruskal-Wallis), which do not assume a normal distribution and compare medians or ranks instead of means.
          </p>
          <p>
            <strong>Chi-square vs. Fisher's Exact:</strong> For categorical variables, the Chi-square test evaluates group differences by comparing observed counts with expected counts. However, the Chi-square approximation is unreliable if any expected cell count is small (less than 5). In those cases, we use Fisher's exact test, which computes the exact probability.
          </p>
          <p>
            <strong>Standardized Mean Difference (SMD):</strong> SMD measures the effect size of differences between groups, independent of sample size. An SMD greater than 0.1 is conventionally interpreted as indicating an imbalance between the groups.
          </p>
        </div>
      </details>

      {/* Diagnostics Panel Table */}
      <div className="space-y-2">
        <h3 className="text-lg font-bold text-gray-900">Statistical Diagnostics</h3>
        <DiagnosticsPanel results={stats} schema={schema ?? undefined} groupingVariable={plan?.groupingVariable} journalId={journalId} />
      </div>

      {/* Per-Variable Test Choice Rationale */}
      <div className="bg-white p-6 rounded-lg shadow border space-y-4">
        <h3 className="text-lg font-bold text-gray-900">Test Selection Rationale</h3>
        <div className="space-y-4">
          {stats.perVariable.map((v) => {
            const varDisplay = getDisplayVar(v.variable);
            const pFormatted = v.test.pValue === null ? '—' : v.test.pValue < 0.001 ? '<0.001' : v.test.pValue.toFixed(3);
            const statFormatted = v.test.statistic === null ? '—' : v.test.statistic.toFixed(2);
            return (
              <div key={v.variable} className="border-b border-gray-100 pb-4 last:border-b-0 last:pb-0 space-y-1">
                <div className="flex items-baseline justify-between">
                  <h4 className="font-semibold text-gray-800">{varDisplay}</h4>
                  <span className="text-xs text-gray-500 font-mono">
                    {v.test.name} (stat={statFormatted}, p={pFormatted})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                    {getDecisionBadge(v)}
                  </span>
                </div>
                <details className="text-sm text-gray-600">
                  <summary className="cursor-pointer select-none font-medium text-gray-700">Decision detail</summary>
                  <p className="pt-1 leading-relaxed">{getRationaleText(v)}</p>
                </details>
                <DecisionExplainer
                  decisionId={`stats.test-selection.${v.variable}`}
                  label="Why this test?"
                  context={{ stats, schema, plan }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation Controls */}
      <div className="flex justify-between">
        <button onClick={() => setStage(6)} className="px-4 py-2 border rounded text-gray-700 bg-white hover:bg-gray-50">
          Back to Analysis plan
        </button>
        <div className="flex gap-2">
        <button
          onClick={() => {
            setModelingEnabled(true);
            setStage(8);
          }}
          className="px-4 py-2 border rounded text-gray-700 bg-white hover:bg-gray-50"
        >
          Enable Modeling
        </button>
        <button 
          onClick={() => setStage(9)} 
          data-testid="stats-continue-format-export"
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Continue to Format and export
        </button>
        </div>
      </div>
    </div>
  );
}
