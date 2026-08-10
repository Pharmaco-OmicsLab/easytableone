/**
 * src/core/format/numberFormat.ts
 *
 * Number formatting for statistical summaries (D40).
 * Used for median, IQR bounds, mean, SD — NOT for p-values (those have
 * their own threshold-based formatting in formatPValue).
 */

export interface NumberFormatOptions {
  /** Use thousand separators for integer-magnitude numbers. */
  thousandSeparator: boolean;
  /** Suppress trailing ".0" if the value is integer-valued. */
  suppressTrailingZero: boolean;
  /** Decimal precision for non-integer values. */
  decimalPrecision: number;
}

/**
 * Returns true if the value should be treated as an integer.
 * Covers exact integers and floating-point artifacts (e.g., 1100.0000000001).
 */
function isIntegerValued(value: number): boolean {
  return Number.isInteger(value) || Math.abs(value - Math.round(value)) < 1e-9;
}

/**
 * Add thousand separators to the integer part of a numeric string.
 * Handles negative sign correctly.
 */
function addThousandSeparator(str: string): string {
  const [intPart, decPart] = str.split('.');
  const sign = intPart.startsWith('-') ? '-' : '';
  const absInt = sign ? intPart.slice(1) : intPart;
  const formatted = absInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return sign + formatted + (decPart !== undefined ? '.' + decPart : '');
}

/**
 * Resolve one decimal precision for a group of values that must render
 * consistently (all cells of a single Table-1 variable row).
 *
 * suppress_trailing_zero is a ROW-level rule (D86): a variable renders without
 * decimals only if every summary value for that variable is integer-valued.
 * If any value needs a decimal, the whole row uses opts.decimalPrecision.
 */
export function resolveRowPrecision(
  values: readonly number[],
  opts: NumberFormatOptions,
): number {
  if (!opts.suppressTrailingZero) return opts.decimalPrecision;
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return opts.decimalPrecision;
  return finite.every(isIntegerValued) ? 0 : opts.decimalPrecision;
}

/**
 * Format a value at an already-resolved, row-uniform precision.
 */
export function formatStatisticalNumberAtPrecision(
  value: number,
  precision: number,
  opts: Pick<NumberFormatOptions, "thousandSeparator">,
): string {
  let str = value.toFixed(precision);
  if (opts.thousandSeparator) {
    str = addThousandSeparator(str);
  }
  return str;
}

/**
 * Format a statistical number according to journal-specific options (D40).
 *
 * @param value - The number to format.
 * @param opts - Formatting options derived from journal ruleset.
 * @returns Formatted string.
 */
export function formatStatisticalNumber(
  value: number,
  opts: NumberFormatOptions,
): string {
  const { thousandSeparator, suppressTrailingZero, decimalPrecision } = opts;

  let str: string;
  if (suppressTrailingZero && isIntegerValued(value)) {
    str = String(Math.round(value));
  } else {
    str = value.toFixed(decimalPrecision);
  }

  if (thousandSeparator) {
    str = addThousandSeparator(str);
  }

  return str;
}

/**
 * Build a NumberFormatOptions object from a journal config's number_format block.
 * Falls back to safe defaults if the block is absent.
 */
export function numberFormatFromJournalConfig(
  numberFormat: { thousand_separator: boolean; suppress_trailing_zero: boolean; decimal_precision: number } | undefined,
): NumberFormatOptions {
  return {
    thousandSeparator: numberFormat?.thousand_separator ?? false,
    suppressTrailingZero: numberFormat?.suppress_trailing_zero ?? true,
    decimalPrecision: numberFormat?.decimal_precision ?? 1,
  };
}

export function formatSmdValue(value: number, decSep = "."): string {
  const SMD_DISPLAY_CAP = 10;
  if (!Number.isFinite(value) || value > SMD_DISPLAY_CAP) {
    return `>${SMD_DISPLAY_CAP}`;
  }
  const str = value.toFixed(3);
  if (decSep === ".") return str;
  return str.replace(".", decSep);
}
