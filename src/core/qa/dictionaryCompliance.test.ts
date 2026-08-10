import { describe, it, expect } from 'vitest';
import { scanDictionaryCompliance } from './dictionaryCompliance';

describe('scanDictionaryCompliance', () => {
  it('returns no violations when all data values are declared', () => {
    const schema = {
      columns: [{
        name: 'X', confirmedType: 'binary' as const, cardinalityTier: 'ok' as const,
        levels: [{ code: 1, label: 'Yes' }, { code: 2, label: 'No' }],
        inferredType: 'binary' as const,
      }],
      dictionarySource: 'imported' as const,
    };
    const df = {
      columns: [{ name: 'X', originalName: 'X' }],
      rows: [[1], [2], [1], [2]],
      meta: { sourceFile: 'test', parseWarnings: [], locale: { decimalSeparator: '.' as const, thousandSeparator: ',' as const }, detectedHeaderRow: 0, confirmedHeaderRow: 0, encoding: 'utf-8', missingSentinels: [] },
    };
    expect(scanDictionaryCompliance(schema as any, df as any)).toEqual([]);
  });

  it('flags undeclared values with row indices', () => {
    const schema = {
      columns: [{
        name: 'X', confirmedType: 'binary' as const, cardinalityTier: 'ok' as const,
        levels: [{ code: 1, label: 'Yes' }, { code: 2, label: 'No' }],
        inferredType: 'binary' as const,
      }],
      dictionarySource: 'imported' as const,
    };
    const df = {
      columns: [{ name: 'X', originalName: 'X' }],
      rows: [[1], [0], [2], [0], [3]],
      meta: {} as any,
    };
    const violations = scanDictionaryCompliance(schema as any, df as any);
    expect(violations).toHaveLength(1);
    const undec = violations[0].undeclaredValues;
    expect(undec.find((u) => String(u.value) === '0')?.rowIndices).toEqual([1, 3]);
    expect(undec.find((u) => String(u.value) === '3')?.rowIndices).toEqual([4]);
  });

  it('does not run when no dictionary was imported', () => {
    const schema = {
      columns: [],
      // dictionarySource undefined — not imported
    };
    expect(scanDictionaryCompliance(schema as any, {} as any)).toEqual([]);
  });

  it('treats numeric and string-numeric as equivalent (1 == "1.0")', () => {
    const schema = {
      columns: [{
        name: 'X', confirmedType: 'binary' as const, cardinalityTier: 'ok' as const,
        levels: [{ code: 1, label: 'Yes' }],
        inferredType: 'binary' as const,
      }],
      dictionarySource: 'imported' as const,
    };
    const df = {
      columns: [{ name: 'X', originalName: 'X' }],
      rows: [[1], ['1.0'], [1.0]],
      meta: {} as any,
    };
    expect(scanDictionaryCompliance(schema as any, df as any)).toEqual([]);
  });
});
