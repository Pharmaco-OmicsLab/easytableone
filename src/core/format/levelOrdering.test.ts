import { describe, it, expect } from 'vitest';
import { isTailLabel, reorderLevelsTailLast } from './levelOrdering';

describe('isTailLabel', () => {
  it.each([
    ['other', true],
    ['Other', true],
    ['OTHER', true],
    ['others', true],
    ['Others', true],
    ['unknown', true],
    ['Unknown', true],
    ['N/A', true],
    ['n/a', true],
    ['NA', true],
    ['na', true],
    ['none', true],
    ['None', true],
    ['missing', true],
    ['Missing', true],
    ['not specified', true],
    ['Not Specified', true],
    ['not reported', true],
    ['Not Reported', true],
    ['not applicable', true],
    ['Not Applicable', true],
    // Should NOT match (not tail labels)
    ['cyanosis', false],
    ['pallar', false],
    ['C. tropicalis', false],
    ['otherwise healthy', false],   // contains "other" but doesn't match ^other$
    ['another', false],              // contains "other" but doesn't match ^other$
    ['C.guili', false],
    ['Mild', false],
    ['Severe', false],
    ['', false],
    ['0', false],
    ['1', false],
  ])('isTailLabel("%s") === %s', (label, expected) => {
    expect(isTailLabel(label)).toBe(expected);
  });

  it('trims leading/trailing whitespace before matching', () => {
    expect(isTailLabel('  other  ')).toBe(true);
    expect(isTailLabel('\tunknown\n')).toBe(true);
  });
});

describe('reorderLevelsTailLast', () => {
  it('moves tail labels to end, preserving head order', () => {
    const levels = ['A', 'other', 'B', 'unknown', 'C'];
    const result = reorderLevelsTailLast(levels, (l) => l);
    expect(result).toEqual(['A', 'B', 'C', 'other', 'unknown']);
  });

  it('is stable within head group', () => {
    const levels = ['C.parapsilosis', 'C.albicans', 'other'];
    const result = reorderLevelsTailLast(levels, (l) => l);
    expect(result).toEqual(['C.parapsilosis', 'C.albicans', 'other']);
  });

  it('is stable within tail group when multiple tail labels exist', () => {
    const levels = ['A', 'unknown', 'B', 'other', 'C'];
    const result = reorderLevelsTailLast(levels, (l) => l);
    expect(result).toEqual(['A', 'B', 'C', 'unknown', 'other']);
  });

  it('no-ops when no tail labels present', () => {
    const levels = ['Mild', 'Moderate', 'Severe'];
    const result = reorderLevelsTailLast(levels, (l) => l);
    expect(result).toEqual(['Mild', 'Moderate', 'Severe']);
  });

  it('works when all levels are tail labels', () => {
    const levels = ['other', 'unknown'];
    const result = reorderLevelsTailLast(levels, (l) => l);
    expect(result).toEqual(['other', 'unknown']);
  });

  it('works with object levels using getLabel accessor', () => {
    const levels = [
      { code: 1, label: 'C.parapsilosis' },
      { code: 2, label: 'other' },
      { code: 3, label: 'C.albicans' },
    ];
    const result = reorderLevelsTailLast(levels, (l) => l.label);
    expect(result).toEqual([
      { code: 1, label: 'C.parapsilosis' },
      { code: 3, label: 'C.albicans' },
      { code: 2, label: 'other' },
    ]);
  });
});
