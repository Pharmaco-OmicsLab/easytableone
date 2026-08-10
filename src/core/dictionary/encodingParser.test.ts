import { describe, it, expect } from 'vitest';
import { parseEncodingString } from './encodingParser';

describe('parseEncodingString', () => {
  it('parses "1: Yes, 2: No"', () => {
    const r = parseEncodingString('1: Yes, 2: No');
    expect(r.levels).toEqual([
      { code: 1, label: 'Yes' },
      { code: 2, label: 'No' },
    ]);
    expect(r.warnings).toEqual([]);
  });

  it('parses "1.pallar, 2. cyanosis, 3.No" (period separator + spaces)', () => {
    const r = parseEncodingString('1.pallar, 2. cyanosis, 3.No');
    expect(r.levels).toEqual([
      { code: 1, label: 'pallar' },
      { code: 2, label: 'cyanosis' },
      { code: 3, label: 'No' },
    ]);
  });

  it('parses "1.C.albicans  2 C.tropicalis 3. C.parapsilosis 4. C.guili 5. C. haemolunii 6. other"', () => {
    const r = parseEncodingString('1.C.albicans  2 C.tropicalis 3. C.parapsilosis 4. C.guili 5. C. haemolunii 6. other');
    expect(r.levels).toEqual([
      { code: 1, label: 'C.albicans' },
      { code: 2, label: 'C.tropicalis' },
      { code: 3, label: 'C.parapsilosis' },
      { code: 4, label: 'C.guili' },
      { code: 5, label: 'C. haemolunii' },
      { code: 6, label: 'other' },
    ]);
  });

  it('parses "1: Non-survival 2: Survival" (no comma between items)', () => {
    const r = parseEncodingString('1: Non-survival 2: Survival');
    expect(r.levels).toEqual([
      { code: 1, label: 'Non-survival' },
      { code: 2, label: 'Survival' },
    ]);
  });

  it('parses "1=Yes; 2=No"', () => {
    const r = parseEncodingString('1=Yes; 2=No');
    expect(r.levels).toEqual([
      { code: 1, label: 'Yes' },
      { code: 2, label: 'No' },
    ]);
  });

  it('parses "1 Y, 2 N"', () => {
    const r = parseEncodingString('1 Y, 2 N');
    expect(r.levels).toEqual([
      { code: 1, label: 'Y' },
      { code: 2, label: 'N' },
    ]);
  });

  it('returns empty levels for empty input', () => {
    expect(parseEncodingString('').levels).toEqual([]);
    expect(parseEncodingString('   ').levels).toEqual([]);
  });

  it('strips surrounding quotes', () => {
    expect(parseEncodingString('"1: Yes, 2: No"').levels).toEqual([
      { code: 1, label: 'Yes' },
      { code: 2, label: 'No' },
    ]);
  });

  it('warns on unparseable token without synthesizing a phantom level', () => {
    const r = parseEncodingString('1: Yes, garbage, 2: No');
    expect(r.levels.map((l) => l.code)).toEqual([1, 2]);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('deduplicates repeated codes, keeping first', () => {
    const r = parseEncodingString('1: Yes, 1: No');
    expect(r.levels).toEqual([{ code: 1, label: 'Yes' }]);
    expect(r.warnings.some((w) => w.toLowerCase().includes('duplicate'))).toBe(true);
  });
});
