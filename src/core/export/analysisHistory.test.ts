import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';
import { generateAnalysisHistory } from './analysisHistory';
import type { StatisticalResults, AnalysisPlan, Schema, DataQualityRecord } from '../types';
import type { ModelingResults } from '../modeling/types';
import { pyodideClient } from '../../workers/pyodide.client';

const results: StatisticalResults = {
  perVariable: [
    {
      variable: '[b1]Gestational age',
      summaryByGroup: {
        'Yes': { mean: 29.6, sd: 4.1, median: 29.6, q25: 27.0, q75: 34.0, n: 29 },
        'No':  { mean: 31.0, sd: 3.8, median: 31.0, q25: 28.0, q75: 36.0, n: 108 },
      },
      overallSummary: { mean: 30.6, sd: 3.9, n: 137 },
      test: { name: 'Mann-Whitney U', statistic: 1331.5, pValue: 0.22 },
      notes: [],
    },
    {
      variable: '[c9]SkinColor',
      summaryByGroup: {
        'Yes': { counts: { '1': 17, '2': 0 }, percentages: { '1': 58.6, '2': 0 }, n: 29 },
        'No':  { counts: { '1': 32, '2': 8 }, percentages: { '1': 29.6, '2': 7.4 }, n: 108 },
      },
      overallSummary: { counts: { '1': 49, '2': 8 }, percentages: { '1': 35.8, '2': 5.8 }, n: 137 },
      test: { name: 'Chi-square', statistic: 10.1, pValue: 0.006 },
      notes: [],
    },
  ],
  groups: [{ name: 'Yes', n: 29 }, { name: 'No', n: 108 }],
  totalN: 137,
  computeMetadata: { libVersions: { scipy: '1.17.0', numpy: '2.4.3', pandas: '2.2.3' }, seed: 42 },
};

const plan: AnalysisPlan = {
  rulesetVersion: '1.2',
  appVersion: '1.0',
  researchPopulation: 'adult',
  studyDesign: 'unspecified',
  unitSystem: 'metric',
  groupingVariable: '[c10]Edema',
  includedVariables: ['[b1]Gestational age', '[c9]SkinColor'],
  variableConfig: {},
  showSMD: false,
  showPValue: true,
  multipleTestingCorrection: 'none',
  randomSeed: 42,
  auditLog: [],
};

const schema: Schema = {
  columns: [
    {
      name: '[b1]Gestational age',
      inferredType: 'continuous',
      confirmedType: 'continuous',
      cardinalityTier: 'ok',
    },
    {
      name: '[c9]SkinColor',
      inferredType: 'categorical_nominal',
      confirmedType: 'categorical_nominal',
      cardinalityTier: 'ok',
      levels: [
        { code: 1, label: 'pallar' },
        { code: 2, label: 'cyanosis' },
      ],
    },
    {
      name: '[c10]Edema',
      inferredType: 'binary',
      confirmedType: 'binary',
      cardinalityTier: 'ok',
      levels: [{ code: 1, label: 'Yes' }, { code: 2, label: 'No' }],
    },
  ],
};

const FIXED_TIMESTAMP = '2026-05-10T00:00:00.000Z';
const MATERIALS_DIR = resolve(__dirname, '../../../_materials');

describe('generateAnalysisHistory', () => {
  it('produces exactly one block per variable', () => {
    const script = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    const contBlocks = (script.match(/# === .+ ===/g) ?? []).filter(
      (l) => !l.includes('Original data') && !l.includes('Variable recoding') && !l.includes('Per-variable')
    );
    expect(contBlocks.length).toBe(results.perVariable.length);
  });

  it('continuous variable gets Mann-Whitney U call', () => {
    const script = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    expect(script).toContain('mannwhitneyu');
  });

  it('categorical variable gets crosstab and chi2_contingency call', () => {
    const script = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    expect(script).toContain('crosstab');
    expect(script).toContain('chi2_contingency');
  });

  it("Fisher's exact uses scipy.stats.fisher_exact (not chi2_contingency)", () => {
    const fisherResults: StatisticalResults = {
      ...results,
      perVariable: [
        {
          variable: '[c9]SkinColor',
          summaryByGroup: {
            Yes: { counts: { '1': 17, '2': 0 }, percentages: { '1': 58.6, '2': 0 }, n: 29 },
            No:  { counts: { '1': 32, '2': 8 }, percentages: { '1': 29.6, '2': 7.4 }, n: 108 },
          },
          overallSummary: { counts: { '1': 49, '2': 8 }, n: 137 },
          test: { name: "Fisher's exact", statistic: null, pValue: 0.02 },
          notes: [],
        },
      ],
    };
    const script = generateAnalysisHistory(plan, fisherResults, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    expect(script).toContain('fisher_exact');
    expect(script).not.toContain('chi2_contingency(ct_');
  });

  it('empty filename produces a placeholder in the generated script', () => {
    const script = generateAnalysisHistory(plan, results, schema, { filename: '' }, FIXED_TIMESTAMP);
    expect(script).toContain('<source_file>');
    expect(script).toContain('<your_source_file>');
    expect(script).not.toMatch(/pd\.read_excel\(""\)/);
  });

  it('real filename is preserved verbatim in the generated script (7c.4)', () => {
    const script = generateAnalysisHistory(
      plan, results, schema,
      { filename: '250409_fungi_dataplus_master_file.xlsx' },
      FIXED_TIMESTAMP,
    );
    expect(script).toContain('pd.read_excel("250409_fungi_dataplus_master_file.xlsx"');
    expect(script).not.toContain('<your_source_file>');
    expect(script).not.toContain('<source_file>');
  });

  it('"workbook" filename emits the <your_source_file> placeholder (7c.4 regression)', () => {
    // xlsx parser defaults meta.sourceFile to "workbook" when no filename is passed.
    // After the 7c.4 fix the guard catches this sentinel and emits the placeholder.
    const script = generateAnalysisHistory(
      plan, results, schema, { filename: 'workbook' }, FIXED_TIMESTAMP,
    );
    expect(script).toContain('<source_file>');
    expect(script).toContain('<your_source_file>');
    expect(script).not.toContain('pd.read_excel("workbook"');
  });

  it('Mann-Whitney print uses live Python variable (not hardcoded statistic)', () => {
    const script = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    // The print f-string must reference the Python stat variable u_..., not a hardcoded float
    expect(script).toContain('stat={u_');
    // Must NOT contain the raw hardcoded statistic from TS (1331.5)
    expect(script).not.toContain('stat={1331');
  });

  it('includes library versions in header', () => {
    const script = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    expect(script).toContain('scipy 1.17.0');
    expect(script).toContain('numpy 2.4.3');
  });

  it('includes sheet name and sha256 when provided', () => {
    const script = generateAnalysisHistory(plan, results, schema, {
      filename: 'data.xlsx',
      sheetName: 'Sheet1',
      sha256: 'abc123',
    }, FIXED_TIMESTAMP);
    expect(script).toContain('Sheet: Sheet1');
    expect(script).toContain('SHA-256 of source file: abc123');
  });

  it('uses extension-aware readers and string-casts only categorical source columns', () => {
    const csv = generateAnalysisHistory(plan, results, schema, { filename: 'data.csv' }, FIXED_TIMESTAMP);
    const tsv = generateAnalysisHistory(plan, results, schema, { filename: 'data.tsv' }, FIXED_TIMESTAMP);
    const xlsx = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    expect(csv).toContain('pd.read_csv("data.csv")');
    expect(tsv).toContain('pd.read_csv("data.tsv", sep="\\t")');
    expect(xlsx).toContain('pd.read_excel("data.xlsx")');
    expect(csv).toContain('df["[c10]Edema"] = df["[c10]Edema"].astype(str)');
    expect(csv).toContain('df["[c9]SkinColor"] = df["[c9]SkinColor"].astype(str)');
    expect(csv).not.toContain('df["[b1]Gestational age"] = df["[b1]Gestational age"].astype(str)');
  });

  it('includes research population in the script header', () => {
    const script = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    expect(script).toContain('# Research population: adult');
  });

  it('includes unit system in the script header', () => {
    const script = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    expect(script).toContain('# Unit system: metric');
  });

  it("includes Dunn's test call and conditional scikit-posthocs requirement only when Dunn was used", () => {
    const dunnResults: StatisticalResults = {
      ...results,
      perVariable: [
        {
          variable: '[b1]Gestational age',
          summaryByGroup: {
            Yes: { median: 1, q25: 1, q75: 2, n: 3 },
            No: { median: 1, q25: 1, q75: 2, n: 3 },
            Maybe: { median: 8, q25: 7, q75: 9, n: 3 },
          },
          overallSummary: { mean: 3.7, median: 2, q25: 1, q75: 8, n: 9 },
          test: { name: 'Kruskal-Wallis', statistic: 8.1, pValue: 0.01 },
          postHoc: {
            reason: 'Kruskal-Wallis significant (p=0.01); 3 groups',
            correction: 'holm',
            method: 'dunn',
            pairs: [
              { groupA: 'Yes', groupB: 'Maybe', pValueRaw: 0.001, pValueCorrected: 0.003, significant: true },
            ],
          },
          notes: [],
        },
      ],
      groups: [{ name: 'Yes', n: 3 }, { name: 'No', n: 3 }, { name: 'Maybe', n: 3 }],
    };

    const dunnScript = generateAnalysisHistory(plan, dunnResults, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    expect(dunnScript).toContain('# Requires: pip install scikit-posthocs');
    expect(dunnScript).toContain('import scikit_posthocs');
    expect(dunnScript).toContain('scikit_posthocs.posthoc_dunn([_b1_Gestational_age_Yes, _b1_Gestational_age_No, _b1_Gestational_age_Maybe], p_adjust="holm")');

    const nonDunnScript = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    expect(nonDunnScript).not.toContain('scikit_posthocs');
    expect(nonDunnScript).not.toContain('pip install scikit-posthocs');
  });

  it('passes a basic regex sanity check for Python syntax', () => {
    const script = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    // Check there are no obvious Python syntax red flags
    expect(script).not.toMatch(/\bundefined\b/);
    expect(script).not.toMatch(/\bnull\b/);
    expect(script).not.toMatch(/\[object Object\]/);
    // Must have at least one import
    expect(script).toContain('import pandas');
    expect(script).toContain('import scipy');
  });

  it('includes DATA QUALITY NOTES in script header if active records are present', () => {
    const records: DataQualityRecord[] = [
      {
        finding: {
          checkId: "highMissingness_col",
          tier: "review",
          category: "quality",
          variable: "[b1]Gestational age",
          title: "Critical Missingness",
          detail: "Variable '[b1]Gestational age' had 55.0% missingness.",
          remedy: "Acknowledge.",
          affectedCount: 55,
        },
        response: "acknowledged",
        timestamp: FIXED_TIMESTAMP,
      },
      {
        finding: {
          checkId: "outliers_col",
          tier: "advisory",
          category: "quality",
          variable: "[b1]Gestational age",
          title: "Outliers",
          detail: "3 values were flagged as potential outliers in Gestational age.",
          remedy: "Review.",
          affectedCount: 3,
        },
        response: "acknowledged",
        timestamp: FIXED_TIMESTAMP,
      }
    ];

    const script = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP, records);

    expect(script).toContain("DATA QUALITY NOTES");
    expect(script).toContain("This analysis proceeded with the following acknowledged data");
    expect(script).toContain("- Variable Gestational age had 55.0% missingness");
    expect(script).toContain("- 3 values were flagged as potential outliers in Gestational age");
    expect(script).toContain("- Group sizes: Yes n=29, No n=108");
  });

  it('formats variable comments honoring plan userOverrides', () => {
    const planWithOverrides = {
      ...plan,
      userOverrides: {
        numberFormat: {
          decimalPlaces: 2,
          thousandSeparator: true,
        },
        iqrDelimiter: ' - ',
      },
    };
    const resultsWithBigValues: StatisticalResults = {
      ...results,
      perVariable: [
        {
          variable: '[b1]Gestational age',
          summaryByGroup: {
            'Yes': { mean: 2900.654, sd: 4.1, median: 2900.654, q25: 2700.123, q75: 3400.987, n: 29 },
            'No':  { mean: 3100.0, sd: 3.8, median: 3100.0, q25: 2800.0, q75: 3600.0, n: 108 },
          },
          overallSummary: { mean: 3000.6, sd: 3.9, n: 137 },
          test: { name: 'Mann-Whitney U', statistic: 1331.5, pValue: 0.22 },
          notes: [],
        },
      ],
    };
    const script = generateAnalysisHistory(planWithOverrides, resultsWithBigValues, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP, [], 'NEJM');
    
    // thousandSeparator: true, decimalPlaces: 2, iqrDelimiter: ' - '
    expect(script).toContain('# Yes: median=2,900.65, IQR=[2,700.12 - 3,400.99]');
  });

  it('uses row-level precision in formatted variable comments', () => {
    const precisionResults: StatisticalResults = {
      ...results,
      perVariable: [
        {
          variable: '[b1]Gestational age',
          summaryByGroup: {
            'Yes': { median: 1.0, q25: 0.9, q75: 1.2, n: 29 },
            'No': { median: 1.3, q25: 1.1, q75: 1.9, n: 108 },
          },
          overallSummary: { median: 1.1, q25: 0.9, q75: 1.4, n: 137 },
          test: { name: 'Mann-Whitney U', statistic: 1331.5, pValue: 0.22 },
          notes: [],
        },
      ],
    };
    const script = generateAnalysisHistory(plan, precisionResults, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);

    expect(script).toContain('# Yes: median=1.0, IQR=[0.9 to 1.2]');
  });

  it('includes a modeling trace only when modeling results are provided', () => {
    const modelingResults: ModelingResults = {
      schemaFingerprint: 'fp',
      generatedAt: FIXED_TIMESTAMP,
      setup: {
        outcome: '[c10]Edema',
        predictors: ['[b1]Gestational age'],
        referenceLevels: {},
        imputation: { policy: 'complete_case', m: 20 },
        goal: 'adjust',
        seed: 42,
        model: 'ridge',
        lambdaRule: 'lambda_1se',
        validationB: 200,
        ciBootstrapB: 200,
        fastMode: true,
      },
      logistic: null,
      ml: {
        folds: { nSplits: 5, nRepeats: 3, seed: 42 },
        warnings: [],
        comparison: [],
        models: [],
      },
    };

    const withoutModeling = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP);
    const withModeling = generateAnalysisHistory(plan, results, schema, { filename: 'data.xlsx' }, FIXED_TIMESTAMP, [], 'NEJM', modelingResults);

    expect(withoutModeling).not.toContain('# === Modeling analysis ===');
    expect(withModeling).toContain('# === Modeling analysis ===');
    expect(withModeling).toContain('# Requires: scikit-learn');
    expect(withModeling).toContain('RepeatedStratifiedKFold');
    expect(withModeling).not.toContain('cross_val_predict');
    expect(withModeling).toContain('CV MCC mean +/- SD');
    expect(withModeling).toContain('CV F1 mean +/- SD');
    expect(withModeling).toContain('Variable importance: Permutation importance');
  });

  it('emitted Heart Failure modeling section runs with a numeric event target', async () => {
    await pyodideClient.isReady();

    const heartSchema: Schema = {
      columns: [
        { name: 'DEATH_EVENT', inferredType: 'binary', confirmedType: 'binary', cardinalityTier: 'ok', levels: [{ code: 0, label: '0' }, { code: 1, label: '1' }] },
        { name: 'serum_creatinine', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' },
        { name: 'ejection_fraction', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' },
      ],
    };
    const heartPlan: AnalysisPlan = {
      ...plan,
      groupingVariable: 'DEATH_EVENT',
      includedVariables: ['serum_creatinine', 'ejection_fraction'],
      randomSeed: 20260229,
    };
    const heartResults: StatisticalResults = {
      perVariable: [
        {
          variable: 'serum_creatinine',
          summaryByGroup: {
            '0': { median: 1, q25: 0.9, q75: 1.2, n: 203 },
            '1': { median: 1.3, q25: 1.1, q75: 1.9, n: 96 },
          },
          overallSummary: { median: 1.1, q25: 0.9, q75: 1.4, n: 299 },
          test: { name: 'Mann-Whitney U', statistic: 6000, pValue: 0.0001 },
          notes: [],
        },
        {
          variable: 'ejection_fraction',
          summaryByGroup: {
            '0': { median: 38, q25: 30, q75: 45, n: 203 },
            '1': { median: 30, q25: 25, q75: 38, n: 96 },
          },
          overallSummary: { median: 38, q25: 30, q75: 45, n: 299 },
          test: { name: 'Mann-Whitney U', statistic: 6000, pValue: 0.0001 },
          notes: [],
        },
      ],
      groups: [{ name: '0', n: 203 }, { name: '1', n: 96 }],
      totalN: 299,
      computeMetadata: { libVersions: { scipy: '1.17.0', numpy: '2.4.3', pandas: '2.2.3' }, seed: 42 },
    };
    const modelingResults: ModelingResults = {
      schemaFingerprint: 'heart-failure',
      generatedAt: FIXED_TIMESTAMP,
      setup: {
        outcome: 'DEATH_EVENT',
        outcomePositiveLevel: '1',
        predictors: ['serum_creatinine', 'ejection_fraction'],
        referenceLevels: {},
        imputation: { policy: 'complete_case', m: 20 },
        goal: 'select',
        seed: 20260229,
        model: 'plain',
        lambdaRule: 'lambda_1se',
        validationB: 200,
        ciBootstrapB: 200,
        fastMode: true,
      },
      logistic: null,
      ml: {
        folds: { nSplits: 5, nRepeats: 10, seed: 20260229 },
        warnings: [],
        comparison: [],
        models: [],
      },
    };

    const script = generateAnalysisHistory(
      heartPlan,
      heartResults,
      heartSchema,
      { filename: 'heart_failure_clinical_records_dataset.csv' },
      FIXED_TIMESTAMP,
      [],
      'NEJM',
      modelingResults,
    );
    const csv = readFileSync(resolve(MATERIALS_DIR, 'samples/HF dataset/heart_failure_clinical_records_dataset.csv'), 'utf8');
    await pyodideClient.call('run_python', [`open("heart_failure_clinical_records_dataset.csv", "w", encoding="utf-8").write(${JSON.stringify(csv)})`]);
    const output = await pyodideClient.call('run_python', [`
import contextlib
import io

_buf = io.StringIO()
with contextlib.redirect_stdout(_buf):
    exec(${JSON.stringify(script)}, {})
_buf.getvalue()
`]) as string;
    const aucMatch = output.match(/CV AUC mean \+\/- SD: ([0-9.]+) \+\/- ([0-9.]+)/);

    expect(script).toContain('modeling_event_level = "1"');
    expect(script).toContain('y_model = (model_df[modeling_outcome].astype(str) == modeling_event_level).astype(int)');
    expect(output).toContain('CV Brier mean +/- SD');
    expect(output).toContain('CV MCC mean +/- SD');
    expect(output).toContain('CV F1 mean +/- SD');
    expect(aucMatch).not.toBeNull();
    expect(Number(aucMatch?.[1])).toBeGreaterThanOrEqual(0.74);
    expect(Number(aucMatch?.[1])).toBeLessThanOrEqual(0.78);
  }, 120000);
});
