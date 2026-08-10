import { describe, it, expect } from 'vitest';
import { detectDictionarySheets, parseDictionarySheet } from './sheetDetector';
import type { WorkbookSheets } from './sheetDetector';

// Simulate the fungi xlsx dictionary sheet structure:
// Sheet "data" has columns A, B, C (simplified)
// Sheet "coding" has Original_Var_InDATA, Report_variable_names_v2, Units

const DATA_COLUMNS = ['[b1]GA', '[b2]BW', '[c9]SkinColor', '[c10]Edema', '[d2]Species'];

const fungiWorkbook: WorkbookSheets = {
  sheets: {
    'data': [
      [{ }, '[b1]GA', '[b2]BW', '[c9]SkinColor', '[c10]Edema', '[d2]Species'],
      // rows omitted — only header needed here; sheetDetector works on the coding sheet
    ] as any,
    '250113_variablecoding': [
      ['Original_Var_InDATA', 'Report_variable_names_v2', 'ENG_Variable_v2'],
      ['[b1]GA', 'Gestational age (weeks)', 'Gestational age (weeks)'],
      ['[b2]BW', 'Birth weight (g)', 'Birth weight (g)'],
      ['[c9]SkinColor', 'Skin color', 'Skin color'],
      ['[c10]Edema', 'Edema', 'Edema'],
      ['[d2]Species', 'Candida species', 'Candida species'],
      ['extra_col', 'Not in data', 'Not in data'], // not in data → lowers score slightly
    ],
  },
};

const noDict: WorkbookSheets = {
  sheets: {
    'data': [['[b1]GA', '[b2]BW'], [1, 2]],
    'summary_stats': [
      ['Statistic', 'Value'],
      ['N', '137'],
      ['Mean', '30.6'],
    ],
  },
};

const twoDict: WorkbookSheets = {
  sheets: {
    'data': [['A', 'B', 'C', 'D']],
    'dict_good': [
      ['RawName', 'DisplayLabel'],
      ['A', 'Variable A'], ['B', 'Variable B'], ['C', 'Variable C'], ['D', 'Variable D'],
    ],
    'dict_ok': [
      ['Col', 'Name'],
      ['A', 'VarA'], ['B', 'VarB'], // only 2/4 = 0.5 → below threshold
    ],
  },
};

describe('detectDictionarySheets', () => {
  it('detects the fungi dictionary sheet with rawColumn and labelColumn', () => {
    const result = detectDictionarySheets(fungiWorkbook, 'data', DATA_COLUMNS);
    expect(result.length).toBeGreaterThanOrEqual(1);
    const best = result[0];
    expect(best.sheetName).toBe('250113_variablecoding');
    expect(best.rawColumn).toBe('Original_Var_InDATA');
    expect(best.labelColumn).toBe('Report_variable_names_v2');
    expect(best.matchScore).toBeGreaterThanOrEqual(0.8);
  });

  it('provides a mapping of raw→label', () => {
    const result = detectDictionarySheets(fungiWorkbook, 'data', DATA_COLUMNS);
    const mapping = result[0].mapping;
    expect(mapping['[b1]GA']?.label).toBe('Gestational age (weeks)');
    expect(mapping['[c10]Edema']?.label).toBe('Edema');
  });

  it('provides a preview of first 8 entries', () => {
    const result = detectDictionarySheets(fungiWorkbook, 'data', DATA_COLUMNS);
    expect(result[0].preview.length).toBeGreaterThan(0);
    expect(result[0].preview[0]).toHaveProperty('raw');
    expect(result[0].preview[0]).toHaveProperty('label');
  });

  it('returns [] when no sheet reaches score threshold 0.8', () => {
    const result = detectDictionarySheets(noDict, 'data', ['[b1]GA', '[b2]BW']);
    expect(result).toEqual([]);
  });

  it('returns both candidates above 0.8 threshold, ranked by score', () => {
    const result = detectDictionarySheets(twoDict, 'data', ['A', 'B', 'C', 'D']);
    // dict_good has 4/4 = 1.0; dict_ok has 2/4 = 0.5 (below threshold)
    expect(result.length).toBe(1);
    expect(result[0].sheetName).toBe('dict_good');
    expect(result[0].matchScore).toBe(1.0);
  });

  it('does not include data sheet in candidates', () => {
    const result = detectDictionarySheets(fungiWorkbook, 'data', DATA_COLUMNS);
    expect(result.every((r) => r.sheetName !== 'data')).toBe(true);
  });

  it('detects dict sheet when dict raw column uses bracket-stripped names (7c.6 regression)', () => {
    // Simulates the fungi workbook where the data sheet has "[b1]GA" etc.
    // but the dict sheet "Original_Var_InDATA" column has "GA", "BW" etc. (no brackets).
    const strippedWorkbook: WorkbookSheets = {
      sheets: {
        'data': [['[b1]GA', '[b2]BW', '[c9]SkinColor', '[c10]Edema']],
        '250113_variablecoding_250525': [
          ['Original_Var_InDATA', 'Report_variable_names_v2'],
          ['GA',        'Gestational age (weeks)'],
          ['BW',        'Birth weight (g)'],
          ['SkinColor', 'Skin color'],
          ['Edema',     'Edema'],
        ],
      },
    };
    const colNames = ['[b1]GA', '[b2]BW', '[c9]SkinColor', '[c10]Edema'];
    const result = detectDictionarySheets(strippedWorkbook, 'data', colNames);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].matchScore).toBeGreaterThanOrEqual(0.8);
    expect(result[0].sheetName).toBe('250113_variablecoding_250525');
  });

  it('mapping is keyed by original data column name after bracket normalization (7c.6)', () => {
    // After normalization, mapping['[b1]GA'] must exist so applyDetectedDictionary can look it up.
    const strippedWorkbook: WorkbookSheets = {
      sheets: {
        'data': [['[b1]GA', '[b2]BW']],
        'coding': [
          ['Var', 'Label'],
          ['GA', 'Gestational age'],
          ['BW', 'Birth weight'],
        ],
      },
    };
    const colNames = ['[b1]GA', '[b2]BW'];
    const result = detectDictionarySheets(strippedWorkbook, 'data', colNames);
    expect(result.length).toBe(1);
    expect(result[0].mapping['[b1]GA']?.label).toBe('Gestational age');
    expect(result[0].mapping['[b2]BW']?.label).toBe('Birth weight');
  });

  it('parses long-format variable/code/label dictionaries without using level labels as display labels', () => {
    const parsed = parseDictionarySheet(
      [
        ['variable', 'code', 'label'],
        ['treatment', '0', 'Placebo'],
        ['treatment', '1.0', 'Drug A'],
        ['smoker', '0', 'No'],
        ['smoker', '1', 'Yes'],
      ],
      ['treatment', 'smoker'],
    );

    expect(parsed?.isLongFormat).toBe(true);
    expect(parsed?.codeColumn).toBe('code');
    expect(parsed?.mapping.treatment?.label).toBe('');
    expect(parsed?.mapping.smoker?.label).toBe('');
    expect(parsed?.dictionaryMap?.treatment.levels).toEqual([
      { code: 0, label: 'Placebo' },
      { code: 1, label: 'Drug A' },
    ]);
    expect(parsed?.dictionaryMap?.smoker.levels).toEqual([
      { code: 0, label: 'No' },
      { code: 1, label: 'Yes' },
    ]);
  });

  it('parses wide dictionaries that name their level-definition column "coding"', () => {
    const parsed = parseDictionarySheet(
      [
        ['variable', 'label', 'units', 'coding'],
        ['hospdead', 'In-hospital outcome', '', '0: Survived to discharge; 1: In-hospital death'],
      ],
      ['hospdead'],
    );

    expect(parsed?.encodingColumn).toBe('coding');
    expect(parsed?.dictionaryMap?.hospdead).toEqual({
      label: 'In-hospital outcome',
      levels: [
        { code: 0, label: 'Survived to discharge' },
        { code: 1, label: 'In-hospital death' },
      ],
    });
  });
});
