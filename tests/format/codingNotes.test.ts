import { describe, it, expect } from 'vitest';
import { formatTable } from '../../src/core/format/formatTable';
import type { StatisticalResults, AnalysisPlan, Schema } from '../../src/core/types';

/** Stats fixture: one recoded binary + one multi-level nominal + one continuous */
const mixedStats: StatisticalResults = {
  perVariable: [
    {
      variable: 'GestationalAge',
      summaryByGroup: {
        'Yes': { mean: 29.6, sd: 4.1, median: 29.6, q25: 27.0, q75: 34.0, n: 29 },
        'No':  { mean: 31.0, sd: 3.8, median: 31.0, q25: 28.0, q75: 36.0, n: 108 },
      },
      overallSummary: { mean: 30.6, sd: 3.9, median: 30.5, q25: 28.0, q75: 35.0, n: 137 },
      test: { name: 'Mann-Whitney U', statistic: 1331.5, pValue: 0.22 },
      notes: [],
    },
    {
      variable: 'SkinColor',
      summaryByGroup: {
        'Yes': { counts: { '1': 17, '2': 0 }, percentages: { '1': 58.6, '2': 0 }, n: 29 },
        'No':  { counts: { '1': 32, '2': 8 }, percentages: { '1': 29.6, '2': 7.4 }, n: 108 },
      },
      overallSummary: { counts: { '1': 49, '2': 8 }, percentages: { '1': 35.8, '2': 5.8 }, n: 137 },
      test: { name: 'Chi-square', statistic: 10.1, pValue: 0.006 },
      notes: [],
    },
    {
      variable: 'SpeciesNoCoding',
      summaryByGroup: {
        'Yes': { counts: { 'TypeA': 10, 'TypeB': 5 }, percentages: { 'TypeA': 34.5, 'TypeB': 17.2 }, n: 29 },
        'No':  { counts: { 'TypeA': 30, 'TypeB': 20 }, percentages: { 'TypeA': 27.8, 'TypeB': 18.5 }, n: 108 },
      },
      overallSummary: { counts: { 'TypeA': 40, 'TypeB': 25 }, percentages: { 'TypeA': 29.2, 'TypeB': 18.2 }, n: 137 },
      test: { name: 'Chi-square', statistic: 0.6, pValue: 0.43 },
      notes: [],
    },
  ],
  groups: [{ name: 'Yes', n: 29 }, { name: 'No', n: 108 }],
  totalN: 137,
  computeMetadata: { libVersions: { scipy: '1.17.0' }, seed: 42 },
};

const mixedPlan: AnalysisPlan = {
  rulesetVersion: '1.2',
  appVersion: '1.0',
  researchPopulation: 'adult',
  unitSystem: 'metric',
  groupingVariable: 'Edema',
  includedVariables: ['GestationalAge', 'SkinColor', 'SpeciesNoCoding'],
  variableConfig: {},
  showSMD: false,
  showPValue: true,
  multipleTestingCorrection: 'none',
  randomSeed: 42,
  auditLog: [],
};

const mixedSchema: Schema = {
  columns: [
    {
      name: 'GestationalAge',
      inferredType: 'continuous',
      confirmedType: 'continuous',
      cardinalityTier: 'ok',
      // No levels — continuous variable should NOT appear in coding notes
    },
    {
      name: 'SkinColor',
      inferredType: 'categorical_nominal',
      confirmedType: 'categorical_nominal',
      cardinalityTier: 'ok',
      displayLabel: '[c9] Skin color',
      levels: [
        { code: 1, label: 'pallar' },
        { code: 2, label: 'cyanosis' },
      ],
      referenceLevel: 2,
    },
    {
      name: 'SpeciesNoCoding',
      inferredType: 'categorical_nominal',
      confirmedType: 'categorical_nominal',
      cardinalityTier: 'ok',
      // No levels — string-labelled categorical, no recoding → should NOT appear
    },
    {
      name: 'Edema',
      inferredType: 'binary',
      confirmedType: 'binary',
      cardinalityTier: 'ok',
      displayLabel: '[c10] Edema',
      levels: [
        { code: 1, label: 'Yes' },
        { code: 2, label: 'No' },
      ],
      referenceLevel: 2,
    },
  ],
};

describe('Variable coding notes (Step 4)', () => {
  it('includes exactly the recoded variables (levels present), in schema order', () => {
    const result = formatTable(mixedStats, 'NEJM', mixedPlan, mixedSchema, '1.0.0-test');
    expect(result.codingNotes).toBeDefined();
    // GestationalAge is continuous → no levels → NOT in notes
    // SkinColor has levels → IN notes
    // SpeciesNoCoding has no levels → NOT in notes
    // Edema (grouping) has levels → IN notes (appended at end)
    expect(result.codingNotes!.length).toBe(2);
    expect(result.codingNotes![0]).toContain('[c9] Skin color');
    expect(result.codingNotes![0]).toContain('1=pallar');
    expect(result.codingNotes![0]).toContain('2=cyanosis');
    expect(result.codingNotes![0]).toContain('Reference level: cyanosis');
    expect(result.codingNotes![1]).toContain('Edema (grouping variable)');
    expect(result.codingNotes![1]).toContain('1=Yes');
  });

  it('continuous-only schema → no codingNotes', () => {
    const contStats: StatisticalResults = {
      perVariable: [{
        variable: 'Age',
        summaryByGroup: { 'A': { mean: 45, sd: 5, n: 50 }, 'B': { mean: 47, sd: 6, n: 50 } },
        overallSummary: { mean: 46, sd: 5.5, n: 100 },
        test: { name: "Welch's t-test", statistic: -1.2, pValue: 0.23 },
        notes: [],
      }],
      groups: [{ name: 'A', n: 50 }, { name: 'B', n: 50 }],
      totalN: 100,
      computeMetadata: { libVersions: { scipy: '1.17.0' }, seed: 42 },
    };
    const contPlan: AnalysisPlan = { ...mixedPlan, groupingVariable: 'Group', includedVariables: ['Age'] };
    const contSchema: Schema = {
      columns: [
        { name: 'Age', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' },
      ],
    };
    const result = formatTable(contStats, 'NEJM', contPlan, contSchema, '1.0.0-test');
    // No levels anywhere → codingNotes undefined or empty
    expect(!result.codingNotes || result.codingNotes.length === 0).toBe(true);
  });

  it('title uses grouping variable display label with bracket prefix stripped', () => {
    const result = formatTable(mixedStats, 'NEJM', mixedPlan, mixedSchema, '1.0.0-test');
    expect(result.title).toBe('Table 1: Baseline Characteristics, by Edema');
  });
});
