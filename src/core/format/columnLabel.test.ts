import { describe, it, expect } from 'vitest';
import { getColumnDiagnosticLabel, getColumnDisplayLabel } from './columnLabel';

describe('getColumnDisplayLabel', () => {
  it('prefers displayLabel over label and raw', () => {
    expect(
      getColumnDisplayLabel({
        name: '[b1]GA',
        displayLabel: 'Gestational age',
        label: 'GA legacy',
      }),
    ).toBe('Gestational age');
  });

  it('falls back to label when displayLabel is missing', () => {
    expect(
      getColumnDisplayLabel({
        name: '[b1]GA',
        label: 'GA legacy',
      }),
    ).toBe('GA legacy');
  });

  it('strips bracket codes from raw name by default', () => {
    expect(getColumnDisplayLabel({ name: '[b1]GA' })).toBe('GA');
    expect(getColumnDisplayLabel({ name: 'Edema [c10]' })).toBe('Edema');
  });

  it('returns the raw name unchanged when fallback="raw"', () => {
    expect(getColumnDisplayLabel({ name: '[b1]GA' }, 'raw')).toBe('[b1]GA');
  });

  it('treats empty/whitespace-only displayLabel as missing', () => {
    expect(getColumnDisplayLabel({ name: '[b1]GA', displayLabel: '   ' })).toBe('GA');
  });
});

describe('getColumnDiagnosticLabel', () => {
  it('keeps the raw key alongside a distinct diagnostic display label (D98)', () => {
    expect(getColumnDiagnosticLabel({ name: 'Cholesterol_TP_T0', displayLabel: 'Total cholesterol at admission' } as any))
      .toBe('Total cholesterol at admission (Cholesterol_TP_T0)');
    expect(getColumnDiagnosticLabel({ name: 'Cholesterol_TP_T0' } as any)).toBe('Cholesterol_TP_T0');
    expect(getColumnDiagnosticLabel({ name: 'Cholesterol_TP_T0', displayLabel: 'Cholesterol_TP_T0' } as any))
      .toBe('Cholesterol_TP_T0');
  });
});
