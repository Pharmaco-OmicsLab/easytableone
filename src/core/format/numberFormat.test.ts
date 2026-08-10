import { describe, it, expect } from 'vitest';
import { formatStatisticalNumber, formatStatisticalNumberAtPrecision, resolveRowPrecision } from './numberFormat';
import type { NumberFormatOptions } from './numberFormat';

const nejm: NumberFormatOptions = { thousandSeparator: true, suppressTrailingZero: true, decimalPrecision: 1 };
const generic: NumberFormatOptions = { thousandSeparator: false, suppressTrailingZero: true, decimalPrecision: 1 };
const precise: NumberFormatOptions = { thousandSeparator: true, suppressTrailingZero: true, decimalPrecision: 2 };

describe('formatStatisticalNumber', () => {
  it('integer value with thousand separator', () => {
    expect(formatStatisticalNumber(1100, nejm)).toBe('1,100');
  });

  it('integer value without thousand separator', () => {
    expect(formatStatisticalNumber(1100, generic)).toBe('1100');
  });

  it('non-integer value keeps decimals', () => {
    expect(formatStatisticalNumber(1100.5, nejm)).toBe('1,100.5');
  });

  it('non-integer small value', () => {
    expect(formatStatisticalNumber(0.05, { ...nejm, decimalPrecision: 2 })).toBe('0.05');
  });

  it('floating-point integer artifact treated as integer', () => {
    expect(formatStatisticalNumber(1100.0000000001, nejm)).toBe('1,100');
  });

  it('negative integer', () => {
    expect(formatStatisticalNumber(-1100, nejm)).toBe('-1,100');
  });

  it('negative non-integer', () => {
    expect(formatStatisticalNumber(-1100.5, nejm)).toBe('-1,100.5');
  });

  it('zero', () => {
    expect(formatStatisticalNumber(0, nejm)).toBe('0');
  });

  it('large number with separator', () => {
    expect(formatStatisticalNumber(1234567, nejm)).toBe('1,234,567');
  });

  it('decimal precision 2 for non-integer', () => {
    expect(formatStatisticalNumber(12.345, precise)).toBe('12.35');
  });

  it('small decimal less than 1', () => {
    expect(formatStatisticalNumber(0.5, nejm)).toBe('0.5');
  });

  it('value that rounds to integer with trailing zero suppression', () => {
    expect(formatStatisticalNumber(29.6, nejm)).toBe('29.6');  // non-integer stays
  });

  it('value exactly 29.0 suppresses trailing zero', () => {
    expect(formatStatisticalNumber(29.0, nejm)).toBe('29');
  });

  it('suppressTrailingZero false keeps .0', () => {
    const opts: NumberFormatOptions = { thousandSeparator: false, suppressTrailingZero: false, decimalPrecision: 1 };
    expect(formatStatisticalNumber(1100, opts)).toBe('1100.0');
  });
});

describe('resolveRowPrecision', () => {
  it('suppresses decimals when every row value is integer-valued', () => {
    expect(resolveRowPrecision([60, 50, 65], nejm)).toBe(0);
    expect(resolveRowPrecision([263000, 219500, 302000], nejm)).toBe(0);
  });

  it('uses configured precision when any row value needs decimals', () => {
    expect(resolveRowPrecision([1.0, 0.9, 1.2], nejm)).toBe(1);
    expect(resolveRowPrecision([137, 135.5, 140], nejm)).toBe(1);
  });

  it('honors disabled trailing-zero suppression and empty fallback', () => {
    expect(resolveRowPrecision([60, 50, 65], { ...nejm, suppressTrailingZero: false })).toBe(1);
    expect(resolveRowPrecision([], nejm)).toBe(1);
  });

  it('ignores non-finite values when resolving row precision', () => {
    expect(resolveRowPrecision([NaN, 60, 65], nejm)).toBe(0);
  });
});

describe('formatStatisticalNumberAtPrecision', () => {
  it('formats with thousand separators at resolved precision', () => {
    expect(formatStatisticalNumberAtPrecision(263000, 0, { thousandSeparator: true })).toBe('263,000');
  });

  it('keeps forced decimal precision for integer-valued values', () => {
    expect(formatStatisticalNumberAtPrecision(1, 1, { thousandSeparator: false })).toBe('1.0');
  });
});
