/**
 * tests/dictionary/sheetDetector.smoke.test.ts
 *
 * Regression tests for detectDictionarySheets — specifically the column-ordering
 * issue where a column named "Definition_categorical_variables_or_Units" was
 * incorrectly claimed by findUnitsColumn (before findEncodingColumn ran),
 * leaving dictionaryMap without any levels.
 *
 * 7h.1 regression: encoding column must be detected before units column.
 *
 * Fixture design note:
 * findLabelColumn uses avgLen * uniqueness scoring. For the encoding column NOT to
 * be mistakenly claimed as the label column, the fixture must have enough continuous
 * rows (short/empty encoding values) so that the label column outscores the encoding
 * column — matching the real fungi sheet where most variables are continuous.
 */

import { describe, it, expect } from 'vitest';
import { detectDictionarySheets } from '../../src/core/dictionary/sheetDetector';

// Simulate the fungi coding sheet layout — realistic mix of categorical and
// continuous variables. Continuous variables have short/empty encoding cells,
// which lowers the average length of the encoding column so findLabelColumn
// correctly picks the label column (not the encoding column).
//
// Column header "Definition_categorical_variables_or_Units" matches BOTH:
//   - /unit/i  → findUnitsColumn would (wrongly) claim it without the 7h.1 fix
//   - /defin|categ/i → findEncodingColumn should claim it first
const fungiSheetRows = [
  // Header row
  ['Variable', 'Variable_label', 'Definition_categorical_variables_or_Units'],
  // Categorical variables (have encoding strings)
  ['edema',     'Edema',             '1: Yes, 2: No'],
  ['survival',  'Survival outcome',   '1: Survival, 2: Non-survival'],
  ['candida',   'Candida species',    '1: C.albicans, 2: C.tropicalis, 3: C.glabrata'],
  // Continuous variables — empty or unit-only definition cells (realistic proportion)
  ['age',       'Age at diagnosis',   'years'],
  ['weight',    'Body weight',        'kg'],
  ['height',    'Height',             'cm'],
  ['creatinine','Serum creatinine',   'mg/dL'],
  ['albumin',   'Serum albumin',      'g/dL'],
  ['wbc',       'White blood cell count', '10^9/L'],
  ['platelet',  'Platelet count',     '10^9/L'],
];

const dataColumns = [
  'edema', 'survival', 'candida',
  'age', 'weight', 'height', 'creatinine', 'albumin', 'wbc', 'platelet',
];

describe('detectDictionarySheets — encoding-before-units ordering (7h.1 regression)', () => {
  it('detects the sheet as a dictionary candidate', () => {
    const result = detectDictionarySheets(
      { sheets: { Data: [], Coding: fungiSheetRows } },
      'Data',
      dataColumns,
    );
    expect(result).toHaveLength(1);
    expect(result[0].sheetName).toBe('Coding');
  });

  it('identifies the encoding column (not the label column)', () => {
    const result = detectDictionarySheets(
      { sheets: { Data: [], Coding: fungiSheetRows } },
      'Data',
      dataColumns,
    );
    const sheet = result[0];
    expect(sheet.encodingColumn).toBe('Definition_categorical_variables_or_Units');
    expect(sheet.labelColumn).toBe('Variable_label');
  });

  it('does NOT flag the encoding column as unitsColumn', () => {
    const result = detectDictionarySheets(
      { sheets: { Data: [], Coding: fungiSheetRows } },
      'Data',
      dataColumns,
    );
    // The column matched encoding heuristic first; units column should be absent
    expect(result[0].unitsColumn).toBeUndefined();
  });

  it('builds dictionaryMap with human-readable levels for edema', () => {
    const result = detectDictionarySheets(
      { sheets: { Data: [], Coding: fungiSheetRows } },
      'Data',
      dataColumns,
    );
    const dm = result[0].dictionaryMap;
    expect(dm).toBeDefined();
    expect(dm!['edema']?.levels).toHaveLength(2);
    expect(dm!['edema']!.levels![0]).toMatchObject({ code: 1, label: 'Yes' });
    expect(dm!['edema']!.levels![1]).toMatchObject({ code: 2, label: 'No' });
  });

  it('builds dictionaryMap with human-readable levels for survival', () => {
    const result = detectDictionarySheets(
      { sheets: { Data: [], Coding: fungiSheetRows } },
      'Data',
      dataColumns,
    );
    const dm = result[0].dictionaryMap!;
    expect(dm['survival']?.levels).toHaveLength(2);
    expect(dm['survival']!.levels![0]).toMatchObject({ code: 1, label: 'Survival' });
    expect(dm['survival']!.levels![1]).toMatchObject({ code: 2, label: 'Non-survival' });
  });

  it('builds dictionaryMap with 3 levels for candida species', () => {
    const result = detectDictionarySheets(
      { sheets: { Data: [], Coding: fungiSheetRows } },
      'Data',
      dataColumns,
    );
    const dm = result[0].dictionaryMap!;
    expect(dm['candida']?.levels).toHaveLength(3);
    expect(dm['candida']!.levels![0]).toMatchObject({ code: 1, label: 'C.albicans' });
    expect(dm['candida']!.levels![2]).toMatchObject({ code: 3, label: 'C.glabrata' });
  });

  it('continuous variables have no levels in dictionaryMap', () => {
    const result = detectDictionarySheets(
      { sheets: { Data: [], Coding: fungiSheetRows } },
      'Data',
      dataColumns,
    );
    const dm = result[0].dictionaryMap!;
    // "years" is not an encoding string — should not produce levels
    expect(dm['age']?.levels).toBeUndefined();
    expect(dm['weight']?.levels).toBeUndefined();
  });
});
