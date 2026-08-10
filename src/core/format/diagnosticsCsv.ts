/**
 * src/core/format/diagnosticsCsv.ts
 *
 * Serialise StatisticalResults into RFC 4180 CSV for the diagnostics download.
 * One row per variable. No new dependencies — hand-rolled quoting.
 */
import type { Schema, StatisticalResults, UserOverrides } from '../types';
import { getColumnDisplayLabel, resolveLevelLabel } from './columnLabel';
import { formatStatisticalNumber, formatStatisticalNumberAtPrecision, numberFormatFromJournalConfig, resolveRowPrecision } from './numberFormat';
import { getEffectiveJournalSettings } from './getEffectiveJournalSettings';
import { categoricalDisplayLevels, reorderLevelsTailLast } from './levelOrdering';

export function getContinuousFormatter(
  journalId: string = 'NEJM',
  overrides?: UserOverrides,
): {
  fmt: (value: number) => string;
  fmtAtPrecision: (value: number, precision: number) => string;
  resolvePrecision: (values: readonly number[]) => number;
  iqrDelimiter: string;
  normalTemplate: string;
} {
  const journalConfig = getEffectiveJournalSettings(journalId, overrides);

  const decSep = journalConfig.p_value_formatting.decimal_separator || ".";
  const numFmtOpts = numberFormatFromJournalConfig(journalConfig.number_format);
  const iqrDelimiter = journalConfig.summary_statistics.iqr_delimiter || " to ";
  const normalTemplate = journalConfig.summary_statistics.continuous_normal || "mean (sd)";

  return {
    fmt: (value: number) => {
      const s = formatStatisticalNumber(value, numFmtOpts);
      if (decSep !== '.') {
        return s.replace('.', decSep);
      }
      return s;
    },
    fmtAtPrecision: (value: number, precision: number) => {
      const s = formatStatisticalNumberAtPrecision(value, precision, numFmtOpts);
      if (decSep !== '.') {
        return s.replace('.', decSep);
      }
      return s;
    },
    resolvePrecision: (values: readonly number[]) => resolveRowPrecision(values, numFmtOpts),
    iqrDelimiter,
    normalTemplate,
  };
}

/**
 * Wrap a cell value in double quotes and escape internal quotes per RFC 4180.
 * Numbers are emitted unquoted. Missing values are empty strings (not "NaN").
 */
function csvCell(value: unknown): string {
  if (value === null || value === undefined || (typeof value === 'number' && isNaN(value as number))) {
    return '';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const HEADER = [
  'variable',
  'display_label',
  'test_name',
  'test_statistic',
  'p_value',
  'n_total',
  'summary_type',
  // per-group columns are appended dynamically
] as const;

/**
 * Generate a flat CSV string from StatisticalResults.
 * Columns: variable, test, statistic, p_value, n, summary_type, [per-group counts/means].
 *
 * @returns RFC 4180 CSV string with CRLF line endings.
 */
export function generateDiagnosticsCsv(
  results: StatisticalResults,
  schema?: Schema,
  groupingVariable?: string,
  journalId?: string,
  overrides?: UserOverrides,
): string {
  const { fmtAtPrecision, resolvePrecision, iqrDelimiter, normalTemplate } = getContinuousFormatter(journalId, overrides);

  const groupingSchemaCol = schema && groupingVariable
    ? schema.columns.find((c) => c.name === groupingVariable)
    : undefined;

  const groups = results.groups.map((g) => g.name);
  const groupLabels = groups.map((g) => resolveLevelLabel(g, groupingSchemaCol));

  const header = [
    ...HEADER,
    ...groupLabels.flatMap((label) => [`n_${label}`, `summary_${label}`]),
  ];

  const lines: string[] = [header.map(csvCell).join(',')];

  for (const v of results.perVariable) {
    const isContinuous = v.overallSummary['mean'] !== undefined || v.overallSummary['median'] !== undefined;
    const isCategorical = v.overallSummary['counts'] !== undefined;
    const summaryType = isContinuous
      ? (v.test.name === 'Mann-Whitney U' || v.test.name === 'Kruskal-Wallis'
        ? 'Median (IQR)'
        : 'Mean (SD)')
      : 'n (%)';

    const schemaCol = schema?.columns.find((c) => c.name === v.variable);
    const rowValues: number[] = [];
    if (isContinuous) {
      const isNonNormal = v.test.name === 'Mann-Whitney U' || v.test.name === 'Kruskal-Wallis';
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
    }
    const rowPrecision = resolvePrecision(rowValues);

    const perGroupCells: string[] = [];
    for (const g of groups) {
      const gs = v.summaryByGroup[g];
      if (!gs) {
        perGroupCells.push('', '');
        continue;
      }
      perGroupCells.push(csvCell(gs['n'] ?? ''));
      if (isContinuous) {
        if (v.test.name === 'Mann-Whitney U' || v.test.name === 'Kruskal-Wallis') {
          const med = gs['median'];
          const q25 = gs['q25'];
          const q75 = gs['q75'];
          if (med !== undefined && q25 !== undefined && q75 !== undefined) {
            perGroupCells.push(csvCell(`${fmtAtPrecision(med as number, rowPrecision)} (${fmtAtPrecision(q25 as number, rowPrecision)}${iqrDelimiter}${fmtAtPrecision(q75 as number, rowPrecision)})`));
          } else {
            perGroupCells.push('');
          }
        } else {
          const m = gs['mean'];
          const sd = gs['sd'];
          if (m !== undefined && sd !== undefined) {
            const mStr = fmtAtPrecision(m as number, rowPrecision);
            const sdStr = fmtAtPrecision(sd as number, rowPrecision);
            if (normalTemplate.includes('±')) {
              perGroupCells.push(csvCell(`${mStr} ± ${sdStr}`));
            } else {
              perGroupCells.push(csvCell(`${mStr} (${sdStr})`));
            }
          } else {
            perGroupCells.push('');
          }
        }
      } else if (isCategorical) {
        const counts = gs['counts'] as Record<string, number> | undefined;
        const pcts = gs['percentages'] as Record<string, number> | undefined;
        if (counts && pcts) {
          const rawLevels = categoricalDisplayLevels(counts, schemaCol, Boolean(overrides?.showPlannedZeroCountLevels));
          const levels = schemaCol?.confirmedType === 'categorical_ordinal'
            ? rawLevels
            : reorderLevelsTailLast(rawLevels, (k) => resolveLevelLabel(k, schemaCol));
          perGroupCells.push(csvCell(
            levels
              .map((k) => {
                const n = counts[k] ?? 0;
                const label = resolveLevelLabel(k, schemaCol);
                return `${label}: ${n} (${(pcts[k] ?? 0).toFixed(1)}%)`;
              })
              .join('; ')
          ));
        } else {
          perGroupCells.push('');
        }
      } else {
        perGroupCells.push('');
      }
    }

    const displayLabel = schemaCol
      ? getColumnDisplayLabel(schemaCol, 'stripped')
      : v.variable;

    const row = [
      csvCell(v.variable),
      csvCell(displayLabel),
      csvCell(v.test.name),
      csvCell(v.test.statistic),
      csvCell(v.test.pValue),
      csvCell(v.overallSummary['n'] ?? ''),
      csvCell(summaryType),
      ...perGroupCells,
    ];
    lines.push(row.join(','));
  }

  return lines.join('\r\n');
}
