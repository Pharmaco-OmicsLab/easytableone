import type { AnalysisPlan, FormattedTable, JournalConfig, JournalRuleset, StatisticalResults, Schema, DataQualityRecord, DataQualityReport } from "../types";
import journalRulesetsJson from "./journal_rulesets.json";
import { generateMethodsParagraph } from "./methodsParagraph";
import { categoricalDisplayLevels, observedKeyForLevel, reorderLevelsTailLast } from "./levelOrdering";
import { multipleTestingLabels } from "./multipleTestingLabels";
import { formatStatisticalNumberAtPrecision, numberFormatFromJournalConfig, formatSmdValue, resolveRowPrecision } from "./numberFormat";
import { generateTableTitle, stripBracketCodes } from "./tableTitle";
import { getColumnDisplayLabel, resolveLevelLabel } from "./columnLabel";
import { getEffectiveJournalSettings } from "./getEffectiveJournalSettings";
import { buildOutlierNote } from "./outlierNote";

/**
 * NOTE: `conditional_decimals` rules in journal_rulesets.json MUST be ordered
 * most-specific-first. The formatter applies the FIRST matching rule and stops.
 * For example, JAMA's `> 0.99` rule must come before `>= 0.01`. If the order
 * were reversed, all p-values ≥ 0.01 (including 0.995) would format with 2
 * decimals, never reaching the `> 0.99` display rule.
 *
 * If you add a new journal or modify conditional_decimals, verify ordering
 * with the snapshot tests in /tests/format/.
 */

// Typed import, version-pinned
export const journalRulesets = journalRulesetsJson as unknown as JournalRuleset;

const NEGATIVE_LABEL = /^(no|none|neg(ative)?|absent|alive|surviv(al|ed|or)?|false|without|non[- ].*|no[- ].*|0|control)$/i;



export function chooseDefaultBinaryDisplayLevel(
  countsDict: Record<string, number>,
  schemaCol?: Schema["columns"][number],
): string {
  const observedKeys = Object.keys(countsDict);
  
  if (schemaCol?.displayLevel !== undefined) {
    const matchKey = observedKeyForLevel(schemaCol.displayLevel, countsDict);
    if (matchKey !== undefined) {
      return matchKey;
    }
  }

  let levelForBinaryChoice: string | undefined;
  if (schemaCol?.levels) {
    for (const lv of schemaCol.levels) {
      const matchKey = observedKeyForLevel(lv.code, countsDict);
      if (matchKey !== undefined) {
        if (!NEGATIVE_LABEL.test(lv.label)) {
          levelForBinaryChoice = matchKey;
          break;
        }
      }
    }
  }
  if (!levelForBinaryChoice) {
    for (const lv of (schemaCol?.levels ?? [])) {
      const matchKey = observedKeyForLevel(lv.code, countsDict);
      if (matchKey !== undefined) {
        levelForBinaryChoice = matchKey;
        break;
      }
    }
  }
  return levelForBinaryChoice ?? observedKeys[1] ?? observedKeys[0] ?? "";
}



export function buildContinuousLabel(
  label: string,
  summary: string,
  unit?: string | null,
  template?: string,
): string {
  if (!unit || !unit.trim()) {
    return `${label}, ${summary}`;
  }

  const effectiveTemplate = template || "{label} ({unit}), {summary}";
  return effectiveTemplate.replace(/\{(\w+)\}/g, (match, key) => {
    if (key === "label") return label;
    if (key === "summary") return summary;
    if (key === "unit") return unit;
    return match;
  });
}



export function getContinuousSummaryString(
  testName: string,
  summaryStatistics: JournalConfig["summary_statistics"],
): string {
  const isNormal = testName !== "Mann-Whitney U" && testName !== "Kruskal-Wallis";
  return isNormal
    ? summaryStatistics.continuous_normal
    : summaryStatistics.continuous_non_normal;
}

/**
 * Format a number to a specified number of decimal places
 */
function formatNumber(value: number, decimals: number, separator = "."): string {
  const str = value.toFixed(decimals);
  if (separator === ".") return str;
  return str.replace(".", separator);
}

function parseJournalBound(value: string, decimalSeparator = "."): number {
  const normalized = value.trim().replace(/[·,]/g, ".").replace(decimalSeparator, ".");
  return Number(normalized);
}

/**
 * Formats a P value using the selected journal's threshold, decimal separator, and precision rules.
 * Null/NaN values render as `-`; values below `threshold_low` use that threshold string. When configured,
 * significant figures take precedence over maximum decimal places (D109); decimal bounds are parsed with
 * the journal separator so a midline-dot threshold remains numeric.
 */
export function formatPValue(
  pValue: number | null,
  formatting: JournalConfig["p_value_formatting"]
): string {
  if (pValue === null || isNaN(pValue)) return "-";

  const {
    leading_zero,
    max_decimal_places,
    conditional_decimals,
    threshold_low,
    decimal_separator = ".",
    significant_figures,
  } = formatting;

  // Handle threshold low
  let isLow = false;
  let thresholdVal = 0.001; // default fallback
  if (threshold_low.startsWith("<")) {
    thresholdVal = parseJournalBound(threshold_low.substring(1), decimal_separator);
    if (pValue < thresholdVal) {
      isLow = true;
    }
  }

  if (isLow) {
    return threshold_low;
  }

  // Handle conditional decimals
  let decimals = max_decimal_places;
  let explicitDisplay: string | undefined;

  if (conditional_decimals && conditional_decimals.length > 0) {
    for (const cond of conditional_decimals) {
      if (cond.range.startsWith(">=") || cond.range.startsWith(">")) {
        const isGte = cond.range.startsWith(">=");
        const valStr = cond.range.replace(">=", "").replace(">", "").trim();
        const val = parseJournalBound(valStr, decimal_separator);
        if ((isGte && pValue >= val) || (!isGte && pValue > val)) {
          if (cond.display) explicitDisplay = cond.display;
          if (cond.decimals !== undefined) decimals = cond.decimals;
          break; // First match wins (assuming descending order in config, e.g. >0.99 then >=0.01)
        }
      } else if (cond.range.includes("to")) {
        const [lowStr, highStr] = cond.range.split("to").map((s) => s.trim());
        const low = parseJournalBound(lowStr, decimal_separator);
        const high = parseJournalBound(highStr, decimal_separator);
        if (pValue >= low && pValue <= high) {
          if (cond.display) explicitDisplay = cond.display;
          if (cond.decimals !== undefined) decimals = cond.decimals;
          break;
        }
      }
    }
  }

  if (explicitDisplay) return explicitDisplay;

  if (significant_figures !== undefined) {
    const significant = pValue.toPrecision(significant_figures);
    if (/[eE]/.test(significant)) return threshold_low;
    return decimal_separator === "." ? significant : significant.replace(".", decimal_separator);
  }

  let formatted = formatNumber(pValue, decimals, decimal_separator);

  if (!leading_zero && formatted.startsWith("0")) {
    formatted = formatted.substring(1);
  }

  return formatted;
}



/**
 * Converts validated statistical results and the analysis context into the journal-specific display table.
 * All rendered statistics are formatted from the selected ruleset and recorded user overrides; this function
 * does not recompute statistical results. Journal-only rules, including JAMA's denominator-based percentage
 * precision (D108) and Lancet's P-value precision (D109), are applied here for parity across exporters.
 */
export function formatTable(
  stats: StatisticalResults,
  journalId: string,
  plan: AnalysisPlan,
  schema: Schema,
  appVersion: string,
  dataQualityRecords?: DataQualityRecord[],
  qaReport?: DataQualityReport | null,
): FormattedTable {
  const ruleset = journalRulesets;
  const journalConfig = getEffectiveJournalSettings(journalId, plan.userOverrides);

  const { p_value_formatting, summary_statistics, table_styling } = journalConfig;
  const decSep = p_value_formatting.decimal_separator || ".";
  const showPlannedZeroCountLevels = Boolean(plan.userOverrides?.showPlannedZeroCountLevels);
  const showMissingDataRows = Boolean(plan.userOverrides?.showMissingDataRows);
  const numFmtOpts = numberFormatFromJournalConfig(journalConfig.number_format);
  const missingDataLabel = journalConfig.missing_data_label ?? ruleset.EasyTableOne_Ruleset.global_defaults.missing_data_label;
  const missingByVariable = new Map((qaReport?.columns ?? []).map((col) => [col.name, col]));
  // Wrapper: format a stat number using journal rules and decimal separator
  function fmtStat(value: number, precision: number): string {
    const s = formatStatisticalNumberAtPrecision(value, precision, numFmtOpts);
    // Apply decimal separator override if journal uses a non-default separator (e.g. Lancet '·')
    if (decSep !== '.') {
      return s.replace('.', decSep);
    }
    return s;
  }

  function formatSmd(value: number): string {
    return formatSmdValue(value, decSep);
  }

  function formatCategoricalCell(count: number, percentage: number, analyzedN: number, groupN: number): string {
    const conditional = summary_statistics.percentage_decimals_rule;
    const decimals = conditional && analyzedN < conditional.below_n
      ? conditional.decimals
      : summary_statistics.percentage_decimals;
    const formattedPct = formatNumber(percentage, decimals, decSep);
    return analyzedN !== groupN
      ? `${count}/${analyzedN} (${formattedPct}%)`
      : `${count} (${formattedPct}%)`;
  }

  const header: string[] = ["Characteristic"];
  const pValueHeader = multipleTestingLabels[plan.multipleTestingCorrection].header;
  


  // Apply group order: stats.groups is already ordered by frequency/override
  // Resolve raw group codes (e.g. "0", "1.0") to dictionary labels via the
  // grouping variable's schema column (D32 / G-6).
  const groupingSchemaCol = schema.columns.find((c) => c.name === plan.groupingVariable);
  function resolveGroupName(rawName: string): string {
    return resolveLevelLabel(rawName, groupingSchemaCol);
  }

  stats.groups.forEach((g) => {
    header.push(`${resolveGroupName(g.name)} (N=${g.n})`);
  });

  
  if (stats.perVariable.some((v) => v.smd !== undefined && v.smd !== null)) {
    header.push("SMD");
  }
  
  const showPValue =
    !plan.userOverrides?.hidePValueColumn &&
    stats.perVariable.some((v) => v.test.pValue !== null);
  if (showPValue) {
    header.push(pValueHeader);
  }

  const rows: FormattedTable["rows"] = [];
  const footnotes: FormattedTable["footnotes"] = [];
  const headerFootnoteRefs: NonNullable<FormattedTable["headerFootnoteRefs"]> = {};
  let footnoteCounter = 0;
  const getNextFootnoteMarker = () => {
    const sequence = table_styling.footnote_sequence;
    if (footnoteCounter < sequence.length) {
      return sequence[footnoteCounter++];
    }
    // Fallback: numeric continuation
    return String(footnoteCounter++ + 1);
  };
  if (showPValue) {
    const adjustmentFootnote = multipleTestingLabels[plan.multipleTestingCorrection].footnote;
    if (adjustmentFootnote) {
      const marker = getNextFootnoteMarker();
      footnotes.push({ marker, text: adjustmentFootnote });
      headerFootnoteRefs[pValueHeader] = [marker];
    }
  }

  for (const v of stats.perVariable) {
    // 1. Variable header row
    const varSchemaCol = schema.columns.find((c) => c.name === v.variable);
    if (varSchemaCol?.exclusionReason) continue;
    const variableDisplayLabel = varSchemaCol
      ? getColumnDisplayLabel(varSchemaCol, 'stripped')
      : stripBracketCodes(v.variable);
    const varRow: FormattedTable["rows"][0] = {
      indent: 0,
      cells: [variableDisplayLabel],
      isSubgroup: false,
      footnoteRefs: [],
    };

    // Determine type from overallSummary to pick correct statistics template
    let isCategorical = false;
    let isContinuous = false;
    let isNormal = true; // Default normal unless proven non-normal

    if (v.overallSummary["mean"] !== undefined || v.overallSummary["median"] !== undefined) {
      isContinuous = true;
      // Normal if test was ttest or anova
      if (v.test.name === "Mann-Whitney U" || v.test.name === "Kruskal-Wallis") {
        isNormal = false;
      }
    } else if (v.overallSummary["counts"] !== undefined) {
      isCategorical = true;
    }

    const isSkipped = v.test.name === 'None';

    const summaryType = isContinuous
      ? getContinuousSummaryString(v.test.name, summary_statistics)
      : summary_statistics.categorical;

    // Check if it's a binary categorical variable represented as a single row
    // stats.overallSummary for categorical has { counts: {...}, percentages: {...}, n: ... }
    const countsDict = v.overallSummary["counts"] as Record<string, number> | undefined;
    const plannedLevelCount = isCategorical && countsDict
      ? categoricalDisplayLevels(countsDict, varSchemaCol, showPlannedZeroCountLevels).length
      : 0;
    const isSingleRowSummary = isContinuous || (isCategorical && countsDict && plannedLevelCount === 2);
    const rowValues: number[] = [];
    if (isContinuous) {
      for (const g of stats.groups) {
        const gs = v.summaryByGroup[g.name];
        if (!gs || gs.n === 0) continue;
        if (isNormal) {
          if (typeof gs.mean === 'number') rowValues.push(gs.mean);
          if (typeof gs.sd === 'number') rowValues.push(gs.sd);
        } else {
          if (typeof gs.median === 'number') rowValues.push(gs.median);
          if (typeof gs.q25 === 'number') rowValues.push(gs.q25);
          if (typeof gs.q75 === 'number') rowValues.push(gs.q75);
        }
      }
    }
    const rowPrecision = resolveRowPrecision(rowValues, numFmtOpts);

    if (isSingleRowSummary) {
      if (isContinuous) {
        varRow.cells[0] = buildContinuousLabel(
          variableDisplayLabel,
          summaryType,
          varSchemaCol?.units,
          summary_statistics.continuous_label_template,
        );
      } else {
        // Add summary text to the variable name if it's compact style
        varRow.cells[0] += `, ${summaryType}`;
      }
      
      let levelForBinary = "";
      if (isCategorical && countsDict) {
        const schemaCol = schema.columns.find((c) => c.name === v.variable);
        const overrideLevel = plan.variableConfig[v.variable]?.displayLevel;
        levelForBinary = overrideLevel !== undefined
          ? observedKeyForLevel(overrideLevel, countsDict) ?? String(overrideLevel)
          : chooseDefaultBinaryDisplayLevel(countsDict, schemaCol);
        const levelDisplayLabel = resolveLevelLabel(levelForBinary, schemaCol);

        // Suppress the parenthetical when the displayed level still has only a raw numeric code.
        if (!(/^[\d.]+$/.test(levelDisplayLabel) && levelDisplayLabel === levelForBinary)) {
          varRow.cells[0] += ` (${levelDisplayLabel})`;
        }

      }

      stats.groups.forEach((g) => {
        const groupStat = v.summaryByGroup[g.name];
        if (isSkipped || !groupStat || groupStat.n === 0) {
          varRow.cells.push("-");
          return;
        }

        if (isContinuous) {
          if (isNormal) {
            if (typeof groupStat.mean !== 'number') {
              varRow.cells.push("-");
              return;
            }
            const mean = fmtStat(groupStat.mean as number, rowPrecision);
            const sd = typeof groupStat.sd === 'number' ? fmtStat(groupStat.sd as number, rowPrecision) : "";
            const tmpl = summary_statistics.continuous_normal;
            if (!sd) {
              varRow.cells.push(mean);
              return;
            }
            if (tmpl.includes("±")) {
              varRow.cells.push(`${mean} ± ${sd}`);
            } else {
              varRow.cells.push(`${mean} (${sd})`);
            }
          } else {
            if (typeof groupStat.median !== 'number') {
              varRow.cells.push("-");
              return;
            }
            const median = fmtStat(groupStat.median as number, rowPrecision);
            const q25 = typeof groupStat.q25 === 'number' ? fmtStat(groupStat.q25 as number, rowPrecision) : "";
            const q75 = typeof groupStat.q75 === 'number' ? fmtStat(groupStat.q75 as number, rowPrecision) : "";
            const delim = summary_statistics.iqr_delimiter;
            varRow.cells.push(q25 && q75 ? `${median} (${q25}${delim}${q75})` : median);
          }
        } else if (isCategorical) {
          const groupCounts = groupStat["counts"] as Record<string, number> | undefined;
          const groupPcts = groupStat["percentages"] as Record<string, number> | undefined;
          if (!groupCounts || !groupPcts) {
            varRow.cells.push("-");
            return;
          }
          const n = groupCounts[levelForBinary] || 0;
          varRow.cells.push(formatCategoricalCell(n, groupPcts[levelForBinary] || 0, groupStat.n, g.n));
        }
      });
    } else {
      // It's a multi-level categorical, the main row just has empty cells for groups
      stats.groups.forEach(() => varRow.cells.push(""));
    }

    // SMD
    if (header.includes("SMD")) {
      if (v.smd !== undefined && v.smd !== null) {
        varRow.cells.push(formatSmd(v.smd));
      } else {
        varRow.cells.push("");
      }
    }

    // P-value (always on the main row for the variable)
    if (showPValue) {
      const pStr = formatPValue(v.test.pValue, p_value_formatting);
      varRow.cells.push(pStr);
    }

    // Footnotes for tests
    if (v.notes && v.notes.length > 0) {
      for (const note of v.notes) {
        if (!showPValue && /p-?value/i.test(note)) {
          continue;
        }
        if (/^p-value adjusted via /i.test(note)) {
          continue;
        }
        let existing = footnotes.find((f) => f.text === note);
        if (!existing) {
          existing = { marker: getNextFootnoteMarker(), text: note };
          footnotes.push(existing);
        }
        varRow.footnoteRefs.push(existing.marker);
      }
    }

    rows.push(varRow);

    // 2. Subgroup rows (for multi-level categorical)
    if (!isSingleRowSummary && isCategorical && countsDict) {
      // D35: pin tail labels (other/unknown/N/A) to bottom for nominal variables.
      // Ordinal variables are exempt — their order is meaningful.
      const schemaCol = schema.columns.find((c) => c.name === v.variable);
      const isOrdinal = schemaCol?.confirmedType === 'categorical_ordinal';
      const rawLevels = categoricalDisplayLevels(countsDict, schemaCol, showPlannedZeroCountLevels);
      const levels = isOrdinal
        ? rawLevels
        : reorderLevelsTailLast(rawLevels, (k) => resolveLevelLabel(k, schemaCol));
      
      for (const level of levels) {
        const subRow: FormattedTable["rows"][0] = {
          indent: table_styling.indent_subgroups ? 1 : 0,
          cells: [resolveLevelLabel(level, schemaCol)],
          isSubgroup: true,
          footnoteRefs: [],
        };

        stats.groups.forEach((g) => {
          const groupStat = v.summaryByGroup[g.name];
          if (isSkipped || !groupStat || groupStat.n === 0) {
            subRow.cells.push("-");
          } else {
            const groupCounts = groupStat["counts"] as Record<string, number> | undefined;
            const groupPcts = groupStat["percentages"] as Record<string, number> | undefined;
            if (!groupCounts || !groupPcts) {
              subRow.cells.push("-");
            } else {
              const n = groupCounts[level] || 0;
              subRow.cells.push(formatCategoricalCell(n, groupPcts[level] || 0, groupStat.n, g.n));
            }
          }
        });

        if (header.includes("SMD")) {
          subRow.cells.push("");
        }
        if (showPValue) {
          subRow.cells.push("");
        }

        rows.push(subRow);
      }
    }

    const missingRecord = missingByVariable.get(v.variable);
    if (showMissingDataRows && missingRecord && missingRecord.missingCount > 0) {
      const missingRow: FormattedTable["rows"][0] = {
        indent: table_styling.indent_subgroups ? 1 : 0,
        cells: [`${missingDataLabel}, ${summary_statistics.categorical}`],
        isSubgroup: true,
        footnoteRefs: [],
      };
      stats.groups.forEach((g) => {
        const groupAnalyzedN = v.summaryByGroup[g.name]?.n ?? 0;
        const missing_g = Math.max(0, g.n - groupAnalyzedN);
        const pct_g = g.n > 0 ? (missing_g / g.n) * 100 : 0;
        const formattedCount = fmtStat(missing_g, 0);
        const conditional = summary_statistics.percentage_decimals_rule;
        const decimals = conditional && g.n < conditional.below_n
          ? conditional.decimals
          : summary_statistics.percentage_decimals;
        const formattedPct = formatNumber(pct_g, decimals, decSep);
        missingRow.cells.push(`${formattedCount} (${formattedPct}%)`);
      });
      if (header.includes("SMD")) {
        missingRow.cells.push("");
      }
      if (showPValue) {
        missingRow.cells.push("");
      }
      rows.push(missingRow);
    }
  }

  const methodsParagraph = generateMethodsParagraph(stats, ruleset, plan, appVersion, plan.userOverrides, dataQualityRecords, summary_statistics.categorical);

  // Step 7: generate title with grouping variable annotation.
  const groupingLabel = groupingSchemaCol
    ? getColumnDisplayLabel(groupingSchemaCol, 'raw')
    : plan.groupingVariable;
  const title = generateTableTitle(journalConfig.table_title_template, groupingLabel);

  // Step 4: variable coding notes — one bullet per recoded/coded categorical variable.
  const codingNotes: string[] = [];
  if (journalConfig.variable_coding_section_title !== null) {
    for (const v of stats.perVariable) {
      const schemaCol = schema.columns.find((c) => c.name === v.variable);
      if (!schemaCol?.levels || schemaCol.levels.length === 0) continue;
      const displayVar = getColumnDisplayLabel(schemaCol, 'stripped');
      const refLevel = schemaCol.referenceLevel !== undefined
        ? `. Reference level: ${resolveLevelLabel(String(schemaCol.referenceLevel), schemaCol)}`
        : '';
      const levelCount = schemaCol.levels.length;
      const levelList = schemaCol.levels
        .map((l) => `${l.code}=${l.label}`)
        .join(', ');
      if (levelCount <= 6) {
        codingNotes.push(`${displayVar}: ${levelList}${refLevel}.`);
      } else {
        const first6 = schemaCol.levels.slice(0, 6).map((l) => `${l.code}=${l.label}`).join(', ');
        codingNotes.push(`${displayVar}: ${levelCount} levels (${first6}, …)${refLevel}.`);
      }
    }
    // Also note the grouping variable if it has levels
    if (groupingSchemaCol?.levels && groupingSchemaCol.levels.length > 0) {
      const groupDisplayVar = getColumnDisplayLabel(groupingSchemaCol, 'stripped');
      const grouped = `${groupDisplayVar} (grouping variable)`;
      const refLevel = groupingSchemaCol.referenceLevel !== undefined
        ? `. Reference level: ${resolveLevelLabel(String(groupingSchemaCol.referenceLevel), groupingSchemaCol)}`
        : '';
      const levelList = groupingSchemaCol.levels
        .map((l) => `${l.code}=${l.label}`)
        .join(', ');
      const existing = codingNotes.find((n) => n.startsWith(groupDisplayVar) || n.startsWith(stripBracketCodes(groupDisplayVar)));
      if (!existing) {
        codingNotes.push(`${grouped}: ${levelList}${refLevel}.`);
      }
    }
  }

  // Step 8.5: data quality notes
  let dataQualityNotes: string[] | undefined;
  if (dataQualityRecords && journalConfig.data_quality_section_title !== null) {
    const activeRecords = dataQualityRecords.filter((r) => {
      if (r.response === "acknowledged" || r.response === "overridden") {
        return true;
      }
      if (r.response === "applied") {
        return true;
      }
      if (r.response === "dismissed") {
        const isAdvisor =
          r.finding.checkId.startsWith("whitespace_inconsistency") ||
          r.finding.checkId.startsWith("case_inconsistency") ||
          r.finding.checkId.startsWith("column_name_whitespace") ||
          r.finding.checkId.startsWith("near_duplicate") ||
          r.finding.checkId.startsWith("synonym_hints") ||
          r.finding.checkId.startsWith("mixed_type") ||
          r.finding.checkId.startsWith("ordinal_stored_as_string");
        return isAdvisor;
      }
      return false;
    });
    if (activeRecords.length > 0) {
      const items: { index: number; text: string }[] = [];
      const getVarIndex = (varName: string | undefined): number => {
        if (!varName) return -1;
        return schema.columns.findIndex((c) => c.name === varName);
      };

      const isGrouped = !!plan.groupingVariable && stats.groups && stats.groups.length > 0;
      if (isGrouped) {
        const groupSizesStr = stats.groups
          .map((g) => `${resolveGroupName(g.name)} n=${g.n}`)
          .join(", ");
        const groupIndex = getVarIndex(plan.groupingVariable);
        items.push({
          index: groupIndex >= 0 ? groupIndex : 9999,
          text: `Group sizes: ${groupSizesStr}.`
        });
      }

      activeRecords.forEach((r) => {
        if (r.finding.checkId === "groupImbalance" || r.finding.checkId.startsWith("groupImbalance_") || r.finding.checkId.startsWith("smallCategoryLevel_")) {
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
            text = `Merged ${r.finding.affectedCount} whitespace variants in *${displayVar}* to '${canonical}'; applied.`;
          } else {
            text = `Whitespace inconsistency in *${displayVar}*; dismissed.`;
          }
        } else if (r.finding.checkId.startsWith("case_inconsistency")) {
          if (r.response === "applied") {
            text = `Merged ${r.finding.affectedCount} case variants in *${displayVar}* to '${canonical}'; applied.`;
          } else {
            text = `Case inconsistency in *${displayVar}*; dismissed.`;
          }
        } else if (r.finding.checkId.startsWith("column_name_whitespace")) {
          if (r.response === "applied") {
            text = `Column name *${colName}* trimmed to '${canonical}'; applied.`;
          } else {
            text = `Column name whitespace in *${colName}*; dismissed.`;
          }
        } else if (r.finding.checkId.startsWith("near_duplicate")) {
          if (r.response === "applied") {
            text = `Merged ${r.finding.affectedCount} similar variants in *${displayVar}* to '${canonical}'; applied.`;
          } else {
            text = `Similar variants in *${displayVar}*; dismissed.`;
          }
        } else if (r.finding.checkId.startsWith("synonym_hints")) {
          if (r.response === "applied") {
            text = `Merged ${r.finding.affectedCount} synonym variants in *${displayVar}* to '${canonical}'; applied.`;
          } else {
            text = `Synonym variants in *${displayVar}*; dismissed.`;
          }
        } else if (r.finding.checkId.startsWith("mixed_type")) {
          if (r.response === "applied") {
            text = `Mapped mixed type codes in *${displayVar}*; applied.`;
          } else {
            text = `Mixed type in *${displayVar}*; dismissed.`;
          }
        } else if (r.finding.checkId.startsWith("ordinal_stored_as_string")) {
          if (r.response === "applied") {
            text = `Set ordinal order for *${displayVar}*; applied.`;
          } else {
            text = `Ordinal suggestion for *${displayVar}*; dismissed.`;
          }
        } else if (r.finding.checkId.startsWith("highMissingness")) {
          const match = r.finding.detail.match(/had\s+([\d.]+%)\s+missingness/);
          const pctStr = match ? match[1] : "some";
          text = `Variable ${displayVar} had ${pctStr} missingness; ${r.response} and analysis proceeded.`;
        } else if (r.finding.checkId.startsWith("outliers")) {
          text = buildOutlierNote(r.finding.affectedCount ?? 0, displayVar, "; no action was taken.");
        } else if (r.finding.checkId === "duplicateRows") {
          const rowWord = r.finding.affectedCount === 1 ? "row was" : "rows were";
          text = `${r.finding.affectedCount} exact duplicate ${rowWord} detected in the dataset; no action was taken.`;
        } else if (r.finding.checkId.startsWith("sampleSize")) {
          text = `Variable ${displayVar} had a small sample size (N = ${r.finding.affectedCount}); acknowledged and analysis proceeded.`;
        } else if (r.finding.checkId === "unlabeledVariables") {
          const count = r.finding.affectedCount || 0;
          const varWord = count === 1 ? "variable has" : "variables have";
          text = `${count} ${varWord} no display label; ${r.response} and analysis proceeded.`;
        } else if (r.finding.checkId.startsWith("missing_code")) {
          const codes = (r.finding.sampleValues ?? []).join(", ");
          text = `${r.finding.affectedCount} value(s) coded ${codes} in *${displayVar}* were treated as missing.`;
        } else {
          text = `${r.finding.title}${colName ? ` in ${displayVar}` : ""}; ${r.response} and analysis proceeded.`;
        }

        items.push({
          index: varIdx >= 0 ? varIdx : 9999,
          text
        });
      });

      items.sort((a, b) => a.index - b.index);
      dataQualityNotes = items.map((item) => item.text);
    }
  }

  const result: FormattedTable = {
    journal: journalId,
    rulesetVersion: ruleset.EasyTableOne_Ruleset.version,
    title,
    header,
    rows,
    footnotes,
    methodsParagraph,
    codingNotes: codingNotes.length > 0 ? codingNotes : undefined,
    dataQualityNotes,
    dataQualitySectionTitle: journalConfig.data_quality_section_title,
  };
  if (Object.keys(headerFootnoteRefs).length) {
    result.headerFootnoteRefs = headerFootnoteRefs;
  }

  if (plan.userOverrides?.variableCodingSectionTitle !== undefined) {
    result.variableCodingSectionTitle = journalConfig.variable_coding_section_title;
  }

  return result;
}
