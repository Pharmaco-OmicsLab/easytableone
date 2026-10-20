/**
 * src/core/format/columnLabel.ts
 *
 * Centralized "what label should we show for this column?" helper (Step 7b.5.5).
 *
 * Precedence (highest first):
 *   1. column.displayLabel — set by dictionary import or manual edit.
 *   2. column.label — legacy dictionary label.
 *   3. bracket-stripped raw column name (fallback='stripped', default)
 *      or the raw column name as-is (fallback='raw').
 *
 * Single source of truth — every consumer that prints a "column label" in user-
 * facing output (docx, diagnostics, generated Python comments, etc.) routes
 * through this helper.
 */
import type { SchemaColumn } from '../types';
import { stripBracketCodes } from './tableTitle';

export type LabelFallback = 'raw' | 'stripped';

export function getColumnDisplayLabel(
  column: Pick<SchemaColumn, 'name' | 'displayLabel' | 'label'>,
  fallback: LabelFallback = 'stripped',
): string {
  const dl = column.displayLabel?.trim();
  if (dl) return dl;
  const lbl = column.label?.trim();
  if (lbl) return lbl;
  return fallback === 'stripped' ? stripBracketCodes(column.name) : column.name;
}

/**
 * Diagnostic surfaces only (QA findings, EDA, Analysis-plan pickers).
 * Never use for Table 1 output, which must keep row labels publication-ready.
 */
export function getColumnDiagnosticLabel(column: SchemaColumn | undefined): string {
  if (!column) return '';
  const display = getColumnDisplayLabel(column);
  const raw = column.name.trim();
  return display && display !== raw ? `${display} (${raw})` : raw;
}

export function formatCodeAsInteger(code: string): string {
  const num = parseFloat(code);
  if (!isNaN(num) && Number.isInteger(num)) {
    return String(num);
  }
  return code;
}

export function resolveLevelLabel(rawKey: string, schemaCol: SchemaColumn | undefined): string {
  if (!schemaCol?.levels || schemaCol.levels.length === 0) {
    return formatCodeAsInteger(rawKey);
  }
  const rawNum = parseFloat(rawKey);
  const levelDef = schemaCol.levels.find((l) => {
    if (String(l.code) === rawKey) return true;
    const codeNum = parseFloat(String(l.code));
    return !isNaN(codeNum) && !isNaN(rawNum) && codeNum === rawNum;
  });
  if (levelDef) {
    return levelDef.label;
  }
  return formatCodeAsInteger(rawKey);
}

export function resolvePlotDataLabels(
  plotData: any,
  varSchemaCol: SchemaColumn | undefined,
  groupingSchemaCol: SchemaColumn | undefined,
): any {
  if (!plotData?.raw) return plotData;

  const resolveGroup = (group: unknown) =>
    group === "All" ? group : resolveLevelLabel(String(group), groupingSchemaCol);

  return {
    ...plotData,
    raw: plotData.raw.map((row: any) => ({
      ...row,
      val: plotData.type === "categorical" ? resolveLevelLabel(String(row.val), varSchemaCol) : row.val,
      group: resolveGroup(row.group),
    })),
    ...(plotData.qq ? {
      qq: {
        ...plotData.qq,
        points: (plotData.qq.points ?? []).map((point: any) => ({ ...point, group: resolveGroup(point.group) })),
        lines: (plotData.qq.lines ?? []).map((line: any) => ({ ...line, group: resolveGroup(line.group) })),
      },
    } : {}),
  };
}
