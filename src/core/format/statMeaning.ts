import type { Schema, StatisticalResults, UserOverrides } from "../types";
import { resolveLevelLabel } from "./columnLabel";
import { getEffectiveJournalSettings } from "./getEffectiveJournalSettings";
import { formatSmdValue } from "./numberFormat";

type PerVariable = StatisticalResults["perVariable"][number];

function pLabel(p: number | null | undefined): string {
  if (p === null || p === undefined) return "-";
  return p < 0.001 ? "<0.001" : p.toFixed(3);
}

export function smdMagnitude(smd: number | null | undefined): string {
  const value = Math.abs(smd ?? 0);
  if (value < 0.2) return "negligible-to-small";
  if (value < 0.5) return "small-to-moderate";
  if (value < 0.8) return "moderate-to-large";
  return "large";
}

export function buildStatMeaning(
  v: PerVariable,
  opts: { results: StatisticalResults; schema?: Schema; groupingVariable?: string; journalId?: string; userOverrides?: UserOverrides },
): string {
  const p = v.test.pValue;
  if (p === null) return "Not enough data to test this variable.";

  const isContinuous = v.overallSummary.mean !== undefined || v.overallSummary.median !== undefined;
  const groups = opts.results.groups.length;
  const journalConfig = opts.journalId ? getEffectiveJournalSettings(opts.journalId, opts.userOverrides) : undefined;
  let smdText = "";
  if (v.smd !== null && v.smd !== undefined) {
    const decSep = journalConfig?.p_value_formatting?.decimal_separator || ".";
    const isCapped = !Number.isFinite(v.smd) || v.smd > 10;
    const smdValStr = isCapped ? ">10" : `=${formatSmdValue(v.smd, decSep)}`;
    if (groups > 2) {
      smdText = ` Largest pairwise SMD${smdValStr} indicates a ${smdMagnitude(v.smd)} difference between at least one pair of groups.`;
    } else {
      smdText = ` SMD${smdValStr} indicates a ${smdMagnitude(v.smd)} difference.`;
    }
  }
  const baseSig = isContinuous ? "groups differ significantly" : "distribution differs significantly across groups";
  const baseNot = isContinuous ? "No statistically significant difference between groups" : "No statistically significant distribution difference across groups";

  if (groups <= 2) {
    return p < 0.05
      ? `The two ${baseSig} (p=${pLabel(p)}).${smdText}`
      : `${baseNot} (p=${pLabel(p)}).${smdText}`;
  }

  if (p >= 0.05) return `No statistically significant overall difference across groups (p=${pLabel(p)}).${smdText}`;

  const groupingCol = opts.schema?.columns.find((c) => c.name === opts.groupingVariable);
  const significantPairs = v.postHoc?.pairs.filter((pair) => pair.significant) ?? [];
  if (significantPairs.length === 0) {
    return "The overall test is significant, but no single pair of groups differs after correction.";
  }

  const shown = significantPairs.slice(0, 3).map((pair) => `${resolveLevelLabel(pair.groupA, groupingCol)} vs ${resolveLevelLabel(pair.groupB, groupingCol)}`);
  const extra = significantPairs.length > 3 ? `, and ${significantPairs.length - 3} more` : "";
  return `The overall test is significant (p=${pLabel(p)}). Post-hoc: ${shown.join(", ")} differ${extra}.${smdText}`;
}
