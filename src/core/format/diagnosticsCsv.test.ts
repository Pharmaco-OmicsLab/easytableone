import { describe, it, expect } from 'vitest';
import { generateDiagnosticsCsv } from './diagnosticsCsv';
import type { Schema, StatisticalResults } from '../types';

const results: StatisticalResults = {
  perVariable: [
    {
      variable: 'Age',
      summaryByGroup: {
        'Yes': { mean: 29.6, sd: 4.1, median: 29.6, q25: 27.0, q75: 34.0, n: 29 },
        'No':  { mean: 31.0, sd: 3.8, median: 31.0, q25: 28.0, q75: 36.0, n: 108 },
      },
      overallSummary: { mean: 30.6, sd: 3.9, n: 137 },
      test: { name: 'Mann-Whitney U', statistic: 1331.5, pValue: 0.22 },
      notes: [],
    },
    {
      variable: 'Gender, reported',
      summaryByGroup: {
        'Yes': { counts: { 'Female': 17, 'Male': 12 }, percentages: { 'Female': 58.6, 'Male': 41.4 }, n: 29 },
        'No':  { counts: { 'Female': 60, 'Male': 48 }, percentages: { 'Female': 55.6, 'Male': 44.4 }, n: 108 },
      },
      overallSummary: { counts: { 'Female': 77, 'Male': 60 }, percentages: { 'Female': 56.2, 'Male': 43.8 }, n: 137 },
      test: { name: 'Chi-square', statistic: 0.1, pValue: 0.75 },
      notes: [],
    },
  ],
  groups: [{ name: 'Yes', n: 29 }, { name: 'No', n: 108 }],
  totalN: 137,
  computeMetadata: { libVersions: { scipy: '1.17.0' }, seed: 42 },
};

describe('generateDiagnosticsCsv', () => {
  it('produces a header row with expected columns', () => {
    const csv = generateDiagnosticsCsv(results);
    const lines = csv.split('\r\n');
    const header = lines[0];
    expect(header).toContain('variable');
    expect(header).toContain('test_name');
    expect(header).toContain('p_value');
    expect(header).toContain('n_Yes');
    expect(header).toContain('n_No');
  });

  it('one data row per variable', () => {
    const csv = generateDiagnosticsCsv(results);
    const lines = csv.split('\r\n').filter((l) => l.trim().length > 0);
    expect(lines.length).toBe(3); // header + 2 data rows
  });

  it('comma in variable name is properly quoted (RFC 4180)', () => {
    const csv = generateDiagnosticsCsv(results);
    expect(csv).toContain('"Gender, reported"');
  });

  it('null p-value renders as empty string not NaN/null', () => {
    const r: StatisticalResults = {
      ...results,
      perVariable: [{
        ...results.perVariable[0],
        test: { name: 'None', statistic: null, pValue: null },
      }],
    };
    const csv = generateDiagnosticsCsv(r);
    const lines = csv.split('\r\n');
    const dataRow = lines[1];
    expect(dataRow).not.toContain('null');
    expect(dataRow).not.toContain('NaN');
  });

  it('emits display_label column populated from schema (Step 7b.5.5)', () => {
    const schema: Schema = {
      columns: [
        {
          name: 'Age',
          inferredType: 'continuous',
          confirmedType: 'continuous',
          cardinalityTier: 'ok',
          displayLabel: 'Gestational age',
        },
        {
          name: 'Gender, reported',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
        },
      ],
    };
    const csv = generateDiagnosticsCsv(results, schema);
    const header = csv.split('\r\n')[0];
    expect(header).toContain('display_label');
    expect(csv).toContain('Gestational age');
  });

  it('uses CRLF line endings per RFC 4180', () => {
    const csv = generateDiagnosticsCsv(results);
    expect(csv).toContain('\r\n');
    expect(csv.split('\r\n').length).toBeGreaterThan(1);
  });

  it('maps group headers to labels and maps categorical codes to level labels in cell summaries (Round 8e)', () => {
    const schemaWithLevels: Schema = {
      columns: [
        {
          name: 'GroupVar',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
          levels: [
            { code: 1, label: 'Non-survival' },
            { code: 2, label: 'Survival' }
          ]
        },
        {
          name: 'Symptom',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
          levels: [
            { code: '1.0', label: 'Pallar' },
            { code: '2.0', label: 'Cyanosis' },
            { code: '3', label: 'No' }
          ]
        }
      ]
    };

    const localResults: StatisticalResults = {
      perVariable: [
        {
          variable: 'Symptom',
          summaryByGroup: {
            '1.0': { counts: { '1.0': 25, '3': 20, '2.0': 3 }, percentages: { '1.0': 52.1, '3': 41.7, '2.0': 6.3 }, n: 48 },
            '2':  { counts: { '1.0': 10, '3': 70, '2.0': 9 }, percentages: { '1.0': 11.2, '3': 78.7, '2.0': 10.1 }, n: 89 },
          },
          overallSummary: { counts: { '1.0': 35, '3': 90, '2.0': 12 }, percentages: { '1.0': 25.5, '3': 65.7, '2.0': 8.8 }, n: 137 },
          test: { name: 'Chi-square', statistic: 1.5, pValue: 0.45 },
          notes: []
        }
      ],
      groups: [{ name: '1.0', n: 48 }, { name: '2', n: 89 }],
      totalN: 137,
      computeMetadata: { libVersions: {}, seed: 42 }
    };

    const csv = generateDiagnosticsCsv(localResults, schemaWithLevels, 'GroupVar');
    const lines = csv.split('\r\n');
    const header = lines[0];

    // Assert that group column headers are resolved to labels
    expect(header).toContain('n_Non-survival');
    expect(header).toContain('summary_Non-survival');
    expect(header).toContain('n_Survival');
    expect(header).toContain('summary_Survival');

    const dataRow = lines[1];
    // Assert categorical cell summaries resolve level codes to labels with proper spacing
    expect(dataRow).toContain('Pallar: 25 (52.1%)');
    expect(dataRow).toContain('No: 20 (41.7%)');
    expect(dataRow).toContain('Cyanosis: 3 (6.3%)');
  });

  it('formats integer fallback codes as integers in summaries when no label exists (Round 8e)', () => {
    const localResults: StatisticalResults = {
      perVariable: [
        {
          variable: 'Symptom',
          summaryByGroup: {
            '1.0': { counts: { '1.0': 25 }, percentages: { '1.0': 100.0 }, n: 25 },
          },
          overallSummary: { counts: { '1.0': 25 }, percentages: { '1.0': 100.0 }, n: 25 },
          test: { name: 'Chi-square', statistic: 1.5, pValue: 0.45 },
          notes: []
        }
      ],
      groups: [{ name: '1.0', n: 25 }],
      totalN: 25,
      computeMetadata: { libVersions: {}, seed: 42 }
    };

    // No schema provided, so fallback is raw code but integer-formatted
    const csv = generateDiagnosticsCsv(localResults);
    const lines = csv.split('\r\n');
    const header = lines[0];

    expect(header).toContain('n_1'); // "1.0" -> "1"
    expect(header).toContain('summary_1'); // "1.0" -> "1"

    const dataRow = lines[1];
    expect(dataRow).toContain('1: 25 (100.0%)'); // "1.0" -> "1"
  });

  it('formats continuous median/IQR and mean/SD summaries using D40 formatting rules (Round 8 Session B)', () => {
    const localResults: StatisticalResults = {
      perVariable: [
        {
          variable: 'CRP',
          summaryByGroup: {
            '1.0': { median: 16.3, q25: 5.5249999999999995, q75: 35.2, n: 48 },
            '2':  { median: 1005.12, q25: 967.5, q75: 1725.0, n: 89 },
          },
          overallSummary: { mean: 13.0, sd: 5.0, median: 13.0, q25: 10.5, q75: 15, n: 137 },
          test: { name: 'Mann-Whitney U', statistic: 1.5, pValue: 0.45 },
          notes: []
        },
        {
          variable: 'Age',
          summaryByGroup: {
            '1.0': { mean: 45.1234, sd: 5.6789, n: 48 },
            '2':  { mean: 52.0, sd: 10.1, n: 89 },
          },
          overallSummary: { mean: 49.0, sd: 8.5, n: 137 },
          test: { name: 'Welch\'s t-test', statistic: 1.5, pValue: 0.45 },
          notes: []
        }
      ],
      groups: [{ name: '1.0', n: 48 }, { name: '2', n: 89 }],
      totalN: 137,
      computeMetadata: { libVersions: {}, seed: 42 }
    };

    // Format under NEJM (uses " to " as delimiter, thousand separator, and 1-decimal precision)
    const csvNEJM = generateDiagnosticsCsv(localResults, undefined, undefined, 'NEJM');
    const linesNEJM = csvNEJM.split('\r\n');
    
    // Non-normal (median/IQR) for CRP row under NEJM
    const crpRowNEJM = linesNEJM[1];
    // "16.3 (5.5249999999999995 to 35.2)" -> "16.3 (5.5 to 35.2)"
    expect(crpRowNEJM).toContain('16.3 (5.5 to 35.2)');
    expect(crpRowNEJM).toContain('1,005.1 (967.5 to 1,725.0)');

    // Normal (Mean/SD) for Age under NEJM (which uses Mean (SD))
    const ageRowNEJM = linesNEJM[2];
    expect(ageRowNEJM).toContain('45.1 (5.7)');
    expect(ageRowNEJM).toContain('52.0 (10.1)');

    // Format under JAMA (uses "-" as delimiter and Mean (SD))
    const csvJAMA = generateDiagnosticsCsv(localResults, undefined, undefined, 'JAMA');
    const linesJAMA = csvJAMA.split('\r\n');

    const crpRowJAMA = linesJAMA[1];
    expect(crpRowJAMA).toContain('16.3 (5.5-35.2)');

    const ageRowJAMA = linesJAMA[2];
    expect(ageRowJAMA).toContain('45.1 (5.7)');

    // Format under Lancet (uses "–" en-dash as delimiter)
    const csvLancet = generateDiagnosticsCsv(localResults, undefined, undefined, 'Lancet');
    const linesLancet = csvLancet.split('\r\n');

    const crpRowLancet = linesLancet[1];
    expect(crpRowLancet).toContain('16·3 (5·5–35·2)');

    // Format under Nature Medicine (uses ", " as delimiter and Mean ± SD)
    const csvNatureMed = generateDiagnosticsCsv(localResults, undefined, undefined, 'NATURE_MED');
    const linesNatureMed = csvNatureMed.split('\r\n');

    const crpRowNatureMed = linesNatureMed[1];
    expect(crpRowNatureMed).toContain('16.3 (5.5, 35.2)');

    const ageRowNatureMed = linesNatureMed[2];
    expect(ageRowNatureMed).toContain('45.1 ± 5.7');
  });
  it('uses row-level precision for diagnostics continuous summaries', () => {
    const localResults: StatisticalResults = {
      perVariable: [
        {
          variable: 'Serum creatinine',
          summaryByGroup: {
            '0': { median: 1.0, q25: 0.9, q75: 1.2, n: 10 },
            '1': { median: 1.3, q25: 1.1, q75: 1.9, n: 10 },
          },
          overallSummary: { median: 1.1, q25: 0.9, q75: 1.4, n: 20 },
          test: { name: 'Mann-Whitney U', statistic: 1.5, pValue: 0.45 },
          notes: []
        }
      ],
      groups: [{ name: '0', n: 10 }, { name: '1', n: 10 }],
      totalN: 20,
      computeMetadata: { libVersions: {}, seed: 42 }
    };

    const csv = generateDiagnosticsCsv(localResults, undefined, undefined, 'NEJM');
    expect(csv).toContain('1.0 (0.9 to 1.2)');
  });
});
