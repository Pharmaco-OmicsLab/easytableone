import { describe, expect, it } from 'vitest';
import { runPolishDetectors, POLISH_REGISTRY } from './polishRegistry';
import type { DataFrame, Schema } from '../types';

describe('runPolishDetectors & POLISH_REGISTRY', () => {
  it('returns empty list for clean data', () => {
    const cleanDf: DataFrame = {
      columns: [{ originalName: 'Outcome', name: 'Outcome' }],
      rows: [['Survival'], ['Non-survival']],
      meta: {
        sourceFile: 'data.xlsx',
        parseWarnings: [],
        locale: { decimalSeparator: '.', thousandSeparator: ',' },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: 'utf-8',
        missingSentinels: [],
      },
    };

    const schema: Schema = {
      columns: [
        {
          name: 'Outcome',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
        },
      ],
    };

    const findings = runPolishDetectors(cleanDf, schema);
    expect(findings).toEqual([]);
  });

  it('whitespace_inconsistency: detects and merges whitespace variations', () => {
    const dirtyDf: DataFrame = {
      columns: [{ originalName: 'SkinColor', name: 'SkinColor' }],
      rows: [['pallar '], ['pallar'], ['pallar '], ['cyanosis']],
      meta: {
        sourceFile: 'data.xlsx',
        parseWarnings: [],
        locale: { decimalSeparator: '.', thousandSeparator: ',' },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: 'utf-8',
        missingSentinels: [],
      },
    };

    const schema: Schema = {
      columns: [
        {
          name: 'SkinColor',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
        },
      ],
    };

    const detector = POLISH_REGISTRY.find((d) => d.id === 'whitespace_inconsistency')!;
    const findings = detector.detect(dirtyDf, schema);
    expect(findings.length).toBe(1);
    expect(findings[0].suggestedCanonical).toBe('pallar '); // 'pallar ' has freq 2, 'pallar' has freq 1.
    expect(findings[0].variants).toContain('pallar');
    expect(findings[0].variants).toContain('pallar ');

    const applied = detector.apply(dirtyDf, schema, findings[0]) as any;
    expect(applied.df.rows).toEqual([['pallar '], ['pallar '], ['pallar '], ['cyanosis']]);
    expect(applied.recode.mapping).toEqual({ 'pallar': 'pallar ' });
  });

  it('case_inconsistency: detects case issues and respects tiebreak', () => {
    const dirtyDf: DataFrame = {
      columns: [{ originalName: 'Sex', name: 'Sex' }],
      rows: [['male'], ['Male'], ['Male']],
      meta: {
        sourceFile: 'data.xlsx',
        parseWarnings: [],
        locale: { decimalSeparator: '.', thousandSeparator: ',' },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: 'utf-8',
        missingSentinels: [],
      },
    };

    const schema: Schema = {
      columns: [
        {
          name: 'Sex',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
        },
      ],
    };

    const detector = POLISH_REGISTRY.find((d) => d.id === 'case_inconsistency')!;
    const findings = detector.detect(dirtyDf, schema);
    expect(findings.length).toBe(1);
    expect(findings[0].suggestedCanonical).toBe('Male'); // 'Male' has freq 2, 'male' has freq 1.

    const applied = detector.apply(dirtyDf, schema, findings[0]) as any;
    expect(applied.df.rows).toEqual([['Male'], ['Male'], ['Male']]);
  });

  it('column_name_whitespace: trims column names and preserves originalName', () => {
    const dirtyDf: DataFrame = {
      columns: [{ originalName: ' Age  ', name: ' Age  ' }],
      rows: [[20], [30]],
      meta: {
        sourceFile: 'data.xlsx',
        parseWarnings: [],
        locale: { decimalSeparator: '.', thousandSeparator: ',' },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: 'utf-8',
        missingSentinels: [],
      },
    };

    const schema: Schema = {
      columns: [
        {
          name: ' Age  ',
          inferredType: 'continuous',
          confirmedType: 'continuous',
          cardinalityTier: 'ok',
        },
      ],
    };

    const detector = POLISH_REGISTRY.find((d) => d.id === 'column_name_whitespace')!;
    const findings = detector.detect(dirtyDf, schema);
    expect(findings.length).toBe(1);
    expect(findings[0].suggestedCanonical).toBe('Age');

    const applied = detector.apply(dirtyDf, schema, findings[0]) as any;
    expect(applied.df.columns[0].name).toBe('Age');
    expect(applied.df.columns[0].originalName).toBe(' Age  ');
    expect(applied.schema.columns[0].name).toBe('Age');
  });

  it('near_duplicate: detects Levenshtein typos but applies guardrails', () => {
    const dirtyDf: DataFrame = {
      columns: [
        { originalName: 'Pathogen', name: 'Pathogen' },
        { originalName: 'Stage', name: 'Stage' },
      ],
      rows: [
        ['parapsilosis', 'T1'],
        ['parapsilsis', 'T2'],
        ['parapsilosis', 'T1'],
      ],
      meta: {
        sourceFile: 'data.xlsx',
        parseWarnings: [],
        locale: { decimalSeparator: '.', thousandSeparator: ',' },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: 'utf-8',
        missingSentinels: [],
      },
    };

    const schema: Schema = {
      columns: [
        {
          name: 'Pathogen',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
        },
        {
          name: 'Stage',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
        },
      ],
    };

    const detector = POLISH_REGISTRY.find((d) => d.id === 'near_duplicate')!;
    const findings = detector.detect(dirtyDf, schema);
    
    // Pathogen has 'parapsilosis' (dist 1), Stage has short codes 'T1'/'T2' (suppressed).
    expect(findings.length).toBe(1);
    expect(findings[0].variable).toBe('Pathogen');
    expect(findings[0].suggestedCanonical).toBe('parapsilosis');

    const applied = detector.apply(dirtyDf, schema, findings[0]) as any;
    expect(applied.df.rows[1][0]).toBe('parapsilosis');
  });

  it('near_duplicate: suppresses short clinical acronyms such as TB and NTM', () => {
    const dirtyDf: DataFrame = {
      columns: [{ originalName: 'Group', name: 'Group' }],
      rows: [['TB'], ['NTM'], ['TB']],
      meta: {
        sourceFile: 'data.xlsx',
        parseWarnings: [],
        locale: { decimalSeparator: '.', thousandSeparator: ',' },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: 'utf-8',
        missingSentinels: [],
      },
    };

    const schema: Schema = {
      columns: [
        {
          name: 'Group',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
        },
      ],
    };

    const detector = POLISH_REGISTRY.find((d) => d.id === 'near_duplicate')!;
    expect(detector.detect(dirtyDf, schema)).toEqual([]);
  });

  it('synonym_hints: detects equivalent synonyms', () => {
    const dirtyDf: DataFrame = {
      columns: [{ originalName: 'Outcome', name: 'Outcome' }],
      rows: [['Y'], ['Yes'], ['Yes']],
      meta: {
        sourceFile: 'data.xlsx',
        parseWarnings: [],
        locale: { decimalSeparator: '.', thousandSeparator: ',' },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: 'utf-8',
        missingSentinels: [],
      },
    };

    const schema: Schema = {
      columns: [
        {
          name: 'Outcome',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
        },
      ],
    };

    const detector = POLISH_REGISTRY.find((d) => d.id === 'synonym_hints')!;
    const findings = detector.detect(dirtyDf, schema);
    expect(findings.length).toBe(1);
    expect(findings[0].suggestedCanonical).toBe('Yes');

    const applied = detector.apply(dirtyDf, schema, findings[0]) as any;
    expect(applied.df.rows).toEqual([['Yes'], ['Yes'], ['Yes']]);
  });

  it('mixed_type: detects and maps mixed numeric + string columns if dict is available', () => {
    const dirtyDf: DataFrame = {
      columns: [{ originalName: 'Edema', name: 'Edema' }],
      rows: [[1], ['Yes'], [2], ['No']],
      meta: {
        sourceFile: 'data.xlsx',
        parseWarnings: [],
        locale: { decimalSeparator: '.', thousandSeparator: ',' },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: 'utf-8',
        missingSentinels: [],
      },
    };

    const schema: Schema = {
      columns: [
        {
          name: 'Edema',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
          levels: [
            { code: 1, label: 'Yes' },
            { code: 2, label: 'No' },
          ],
        },
      ],
      dictionarySource: 'imported',
    };

    const detector = POLISH_REGISTRY.find((d) => d.id === 'mixed_type')!;
    const findings = detector.detect(dirtyDf, schema);
    expect(findings.length).toBe(1);

    const applied = detector.apply(dirtyDf, schema, findings[0]) as any;
    expect(applied.applyKind).toBe('merge');
    expect(applied.df.rows).toEqual([['Yes'], ['Yes'], ['No'], ['No']]);

    // Test without dict -> routes to schema
    const schemaNoDict = { ...schema, dictionarySource: undefined };
    const appliedNoDict = detector.apply(dirtyDf, schemaNoDict, findings[0]);
    expect(appliedNoDict.applyKind).toBe('route-to-schema');
  });

  it('ordinal_stored_as_string: detects ordinal patterns and suggests reorder UI without mutating', () => {
    const dirtyDf: DataFrame = {
      columns: [{ originalName: 'Severity', name: 'Severity' }],
      rows: [['Moderate'], ['Severe'], ['Mild']],
      meta: {
        sourceFile: 'data.xlsx',
        parseWarnings: [],
        locale: { decimalSeparator: '.', thousandSeparator: ',' },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: 'utf-8',
        missingSentinels: [],
      },
    };

    const schema: Schema = {
      columns: [
        {
          name: 'Severity',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
        },
      ],
    };

    const detector = POLISH_REGISTRY.find((d) => d.id === 'ordinal_stored_as_string')!;
    const findings = detector.detect(dirtyDf, schema);
    expect(findings.length).toBe(1);
    expect(findings[0].variants).toEqual(['Moderate', 'Severe', 'Mild']); // observed order

    const applied = detector.apply(dirtyDf, schema, findings[0]) as any;
    expect(applied.applyKind).toBe('open-ordinal-ui');
    expect(applied.df).toBeUndefined(); // returns open-ordinal-ui parameters, no DataFrame mutation!
  });
});
