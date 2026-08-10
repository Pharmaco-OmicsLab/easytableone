import { describe, it, expect } from 'vitest';
import { getColumnDisplayLabel } from './columnLabel';

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
