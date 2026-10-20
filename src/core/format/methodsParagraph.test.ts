import { describe, it, expect } from 'vitest';
import { generateMethodsParagraph } from './methodsParagraph';
import type { JournalRuleset, StatisticalResults, AnalysisPlan, DataQualityRecord } from '../types';
import { APP_VERSION } from '../appVersion';
import { PYODIDE_VERSION, PYTHON_RUNTIME_VERSION } from '../runtimeEnvironment';

// Minimal ruleset with a sentinel version to guard dynamic reading
const sentinelRuleset = {
  EasyTableOne_Ruleset: {
    version: '9.9',
    global_defaults: {
      missing_data_label: 'Missing',
      normality_logic: {
        small_n_test: 'shapiro',
        small_n_threshold_p: 0.05,
        large_n_threshold_n: 2000,
        large_n_skew_max: 1.0,
        large_n_kurt_max: 1.0,
      },
      test_selection_logic: {},
    },
    journals: [],
    logic_mapping: [],
  },
} as unknown as JournalRuleset;

const results: StatisticalResults = {
  perVariable: [
    {
      variable: 'age',
      summaryByGroup: {
        A: { mean: 30, sd: 5, median: 29, q25: 25, q75: 35, n: 50 },
        B: { mean: 32, sd: 5, median: 31, q25: 27, q75: 37, n: 50 },
      },
      overallSummary: { mean: 31, sd: 5, n: 100 },
      test: { name: 'Mann-Whitney U', statistic: 1200, pValue: 0.3 },
      notes: [],
    },
  ],
  groups: [{ name: 'A', n: 50 }, { name: 'B', n: 50 }],
  totalN: 100,
  computeMetadata: {
    libVersions: { scipy: '1.17.0', numpy: '2.4.3', pandas: '2.2.3' },
    seed: 42,
  },
};

const plan: AnalysisPlan = {
  rulesetVersion: '9.9',
  appVersion: '1.0',
  researchPopulation: 'adult',
  studyDesign: 'unspecified',
  unitSystem: 'metric',
  groupingVariable: 'group',
  includedVariables: ['age'],
  variableConfig: {},
  showSMD: false,
  showPValue: true,
  multipleTestingCorrection: 'none',
  randomSeed: 42,
  auditLog: [],
};

describe('generateMethodsParagraph', () => {
  it('reads ruleset version dynamically — not hardcoded', () => {
    const para = generateMethodsParagraph(results, sentinelRuleset, plan, '1.0');
    // Must contain the sentinel version from the ruleset argument
    expect(para).toContain('ruleset v9.9');
    // Must NOT contain the production version literal — that would mean it is hardcoded
    expect(para).not.toContain('ruleset v1.2');
  });

  it('reads normality thresholds from ruleset (large_n_threshold_n)', () => {
    const para = generateMethodsParagraph(results, sentinelRuleset, plan, '1.0');
    expect(para).toContain('2000');
  });

  it('includes library versions from computeMetadata', () => {
    const para = generateMethodsParagraph(results, sentinelRuleset, plan, '1.0');
    expect(para).toContain('scipy v1.17.0');
    expect(para).toContain('numpy v2.4.3');
    expect(para).toContain(`Pyodide ${PYODIDE_VERSION}`);
    expect(para).toContain(`CPython ${PYTHON_RUNTIME_VERSION}`);
    expect(para).toContain('WebAssembly');
  });

  it('uses real app and runtime versions in generated export text', () => {
    const para = generateMethodsParagraph(results, sentinelRuleset, plan, APP_VERSION);
    expect(para).toContain(`EasyTableOne v${APP_VERSION}`);
    expect(para).not.toContain('EasyTableOne v1.0');
    expect(para).not.toContain('314.0.0a1');
    expect(para).not.toContain('314.0.0-alpha.1');
  });

  it('mentions Mann-Whitney U when non-normal continuous ran', () => {
    const para = generateMethodsParagraph(results, sentinelRuleset, plan, '1.0');
    expect(para).toContain('Mann-Whitney U');
  });

  it("recognizes Monte-Carlo Fisher as a categorical Fisher test and discloses seeded simulation", () => {
    const fisherResults: StatisticalResults = {
      ...results,
      perVariable: [{
        variable: 'cat',
        summaryByGroup: {
          A: { counts: { x: 1, y: 0, z: 0 }, n: 1 },
          B: { counts: { x: 0, y: 1, z: 1 }, n: 2 },
        },
        overallSummary: { counts: { x: 1, y: 1, z: 1 }, n: 3 },
        test: { name: "Fisher's exact (Monte Carlo)", statistic: null, pValue: 0.2 },
        notes: [],
      }],
    };
    const para = generateMethodsParagraph(fisherResults, sentinelRuleset, plan, '1.0');
    expect(para).toContain("Fisher's exact test when expected cell counts were less than 5");
    expect(para).toContain("seeded Monte Carlo simulation");
  });

  it('appends customization sentence if overrides are present', () => {
    const planWithOverrides = {
      ...plan,
      userOverrides: { iqrDelimiter: '-' },
    };
    const para = generateMethodsParagraph(results, sentinelRuleset, planWithOverrides, '1.0');
    expect(para).toContain('Some journal-default formatting options were customized; see reproducibility.json for details.');
  });

  it('describes the hidePValueColumn override as SMD display rather than absent testing', () => {
    const planWithOverride = {
      ...plan,
      showSMD: true,
      userOverrides: { hidePValueColumn: true },
    };
    const resultsWithSmd: StatisticalResults = {
      ...results,
      perVariable: [{ ...results.perVariable[0], smd: 0.2 }],
    };
    const para = generateMethodsParagraph(resultsWithSmd, sentinelRuleset, planWithOverride, '1.0');

    expect(para).toContain('Between-group baseline differences are displayed as standardized mean differences (SMD) rather than as a P-value column; SMD > 0.1 is conventionally interpreted as imbalanced.');
    expect(para).not.toContain('tests were not performed');
    expect(para).not.toContain('no tests were run');
  });

  it('covers presence and absence of missing-data codes sentence in methods paragraph', () => {
    // Absence
    const paraWithout = generateMethodsParagraph(results, sentinelRuleset, plan, '1.0');
    expect(paraWithout).not.toContain('missing-data codes');

    // Presence with 2 codes (999 and Unknown)
    const records: DataQualityRecord[] = [
      {
        finding: {
          checkId: 'missing_code_age',
          tier: 'advisory',
          category: 'quality',
          title: 'Missing-value codes recoded',
          detail: '1 value in age',
          remedy: '',
          sampleValues: ['999'],
        },
        response: 'applied',
        timestamp: '2026-09-28T00:00:00Z',
      },
      {
        finding: {
          checkId: 'missing_code_creatinine',
          tier: 'advisory',
          category: 'quality',
          title: 'Missing-value codes recoded',
          detail: '1 value in creatinine',
          remedy: '',
          sampleValues: ['Unknown'],
        },
        response: 'applied',
        timestamp: '2026-09-28T00:00:00Z',
      },
    ];

    const paraWith = generateMethodsParagraph(results, sentinelRuleset, plan, '1.0', undefined, records);
    expect(paraWith).toContain(
      'Values recorded as missing-data codes (for example 999 or "Unknown") were set to missing before analysis at user direction.',
    );
  });

  it('Phase 50 R3: postHoc.caveat presence and absence in methods paragraph', () => {
    const postHocResults: StatisticalResults = {
      ...results,
      perVariable: [{
        ...results.perVariable[0],
        postHoc: {
          reason: 'ANOVA significant (p=0.01); 3 groups',
          correction: 'tukey',
          method: 'tukey_hsd',
          pairs: [{ groupA: 'A', groupB: 'B', pValueRaw: 0.01, pValueCorrected: 0.01, significant: true }],
        },
      }],
    };
    const paraWithout = generateMethodsParagraph(postHocResults, sentinelRuleset, plan, '1.0');
    expect(paraWithout).toContain('pairwise post-hoc comparisons were performed');
    expect(paraWithout).not.toContain('Where the equal-variance check was not met, Tukey HSD results were flagged for cautious interpretation.');

    const postHocWithCaveatResults: StatisticalResults = {
      ...results,
      perVariable: [{
        ...results.perVariable[0],
        postHoc: {
          reason: 'ANOVA significant (p=0.01); 3 groups',
          correction: 'tukey',
          method: 'tukey_hsd',
          pairs: [{ groupA: 'A', groupB: 'B', pValueRaw: 0.01, pValueCorrected: 0.01, significant: true }],
          caveat: 'Tukey HSD assumes equal variances, which the Levene/Brown-Forsythe check did not support for this variable; pairwise P values should be interpreted with caution.',
        },
      }],
    };
    const paraWith = generateMethodsParagraph(postHocWithCaveatResults, sentinelRuleset, plan, '1.0');
    expect(paraWith).toContain('Where the equal-variance check was not met, Tukey HSD results were flagged for cautious interpretation.');
  });

  it('Phase 50 R3: contradictionReason drives override sentences in methods paragraph', () => {
    const overridePlan: AnalysisPlan = {
      ...plan,
      testOverrides: [{ variable: 'age', method: 'oneway_anova', timestamp: '2026-09-28T00:00:00Z' }],
      variableConfig: { age: { label: 'Age', treatAs: 'continuous', missingness: 'drop_row' } },
    };

    // unequal_variance
    const anovaResults: StatisticalResults = {
      ...results,
      perVariable: [{
        ...results.perVariable[0],
        test: {
          name: 'ANOVA',
          statistic: 4.2,
          pValue: 0.02,
          auxiliary: {
            assumptionCheckContradicted: 'true',
            contradictionReason: 'unequal_variance',
          },
        },
      }],
    };
    const paraUnequal = generateMethodsParagraph(anovaResults, sentinelRuleset, overridePlan, '1.0');
    expect(paraUnequal).toContain('Age was compared using one-way ANOVA at user selection despite an unequal-variance flag.');

    // non_normality
    const nonNormResults: StatisticalResults = {
      ...results,
      perVariable: [{
        ...results.perVariable[0],
        test: {
          name: 'ANOVA',
          statistic: 4.2,
          pValue: 0.02,
          auxiliary: {
            assumptionCheckContradicted: 'true',
            contradictionReason: 'non_normality',
          },
        },
      }],
    };
    const paraNonNorm = generateMethodsParagraph(nonNormResults, sentinelRuleset, overridePlan, '1.0');
    expect(paraNonNorm).toContain('Age was compared using one-way ANOVA at user selection despite a non-normality flag.');
  });

  it('Phase 50 R3: mixed normalityMethod triggers extra sentence in methods paragraph', () => {
    // without mixed
    const paraWithout = generateMethodsParagraph(results, sentinelRuleset, plan, '1.0');
    expect(paraWithout).not.toContain('Each group was assessed by the criterion corresponding to its own size.');

    // with mixed
    const mixedResults: StatisticalResults = {
      ...results,
      perVariable: [{
        ...results.perVariable[0],
        test: {
          ...results.perVariable[0].test,
          auxiliary: { normalityMethod: 'mixed' },
        },
      }],
    };
    const paraWith = generateMethodsParagraph(mixedResults, sentinelRuleset, plan, '1.0');
    expect(paraWith).toContain('Each group was assessed by the criterion corresponding to its own size.');
  });

  it('Phase 50 R4: ordinal rank test produces rank sentence without continuous sentence (D104(b))', () => {
    const ordinalResults: StatisticalResults = {
      perVariable: [
        {
          variable: 'nyha',
          summaryByGroup: {
            A: { counts: { '1': 10, '2': 20, '3': 20 }, percentages: { '1': 20, '2': 40, '3': 40 }, n: 50 },
            B: { counts: { '1': 5, '2': 15, '3': 30 }, percentages: { '1': 10, '2': 30, '3': 60 }, n: 50 },
          },
          overallSummary: { counts: { '1': 15, '2': 35, '3': 50 }, percentages: { '1': 15, '2': 35, '3': 50 }, n: 100 },
          test: { name: 'Mann-Whitney U (ordinal)', statistic: 850, pValue: 0.003 },
          notes: [],
        },
      ],
      groups: [{ name: 'A', n: 50 }, { name: 'B', n: 50 }],
      totalN: 100,
      computeMetadata: {
        libVersions: { scipy: '1.17.0', numpy: '2.4.3', pandas: '2.2.3' },
        seed: 42,
      },
    };

    const ordinalPlan: AnalysisPlan = {
      ...plan,
      includedVariables: ['nyha'],
      variableConfig: {
        nyha: { label: 'NYHA Class', treatAs: 'categorical_ordinal', missingness: 'drop_row', levelOrder: [1, 2, 3] },
      },
      testOverrides: [{ variable: 'nyha', method: 'ordinal_rank', timestamp: '2026-09-28T00:00:00Z' }],
    };

    const para = generateMethodsParagraph(ordinalResults, sentinelRuleset, ordinalPlan, '1.0');
    expect(para).toContain('Ordered categorical variables selected by the user were compared using the Mann-Whitney U test on level ranks.');
    expect(para).toContain('NYHA Class was compared using the Mann-Whitney U test on ordered categories at user selection.');
    // Ensure continuous sentence did NOT fire
    expect(para).not.toContain('Continuous variables that did not meet');
    expect(para).not.toContain('Continuous variables that met');
  });

  it('Phase 50 R4: Kruskal-Wallis ordinal test in 3 groups produces Kruskal rank sentence (D104(b))', () => {
    const ordinalResults3: StatisticalResults = {
      perVariable: [
        {
          variable: 'stage',
          summaryByGroup: {
            A: { counts: { '1': 10, '2': 20, '3': 20 }, percentages: { '1': 20, '2': 40, '3': 40 }, n: 50 },
            B: { counts: { '1': 5, '2': 15, '3': 30 }, percentages: { '1': 10, '2': 30, '3': 60 }, n: 50 },
            C: { counts: { '1': 2, '2': 8, '3': 40 }, percentages: { '1': 4, '2': 16, '3': 80 }, n: 50 },
          },
          overallSummary: { counts: { '1': 17, '2': 43, '3': 90 }, percentages: { '1': 11.3, '2': 28.7, '3': 60 }, n: 150 },
          test: { name: 'Kruskal-Wallis (ordinal)', statistic: 14.5, pValue: 0.0007 },
          notes: [],
        },
      ],
      groups: [{ name: 'A', n: 50 }, { name: 'B', n: 50 }, { name: 'C', n: 50 }],
      totalN: 150,
      computeMetadata: {
        libVersions: { scipy: '1.17.0', numpy: '2.4.3', pandas: '2.2.3' },
        seed: 42,
      },
    };

    const ordinalPlan3: AnalysisPlan = {
      ...plan,
      includedVariables: ['stage'],
      variableConfig: {
        stage: { label: 'Stage', treatAs: 'categorical_ordinal', missingness: 'drop_row', levelOrder: [1, 2, 3] },
      },
      testOverrides: [{ variable: 'stage', method: 'ordinal_rank', timestamp: '2026-09-28T00:00:00Z' }],
    };

    const para = generateMethodsParagraph(ordinalResults3, sentinelRuleset, ordinalPlan3, '1.0');
    expect(para).toContain('Ordered categorical variables selected by the user were compared using the Kruskal-Wallis test on level ranks.');
    expect(para).toContain('Stage was compared using the Kruskal-Wallis test on ordered categories at user selection.');
    expect(para).not.toContain('Continuous variables that did not meet');
  });

  it('Phase 50 R5: SMD methods sentence matches what table shows (D101(c), D107(c))', () => {
    // 1. hide=true with no SMD -> no SMD sentence
    const planHideNoSmd: AnalysisPlan = {
      ...plan,
      showSMD: false,
      userOverrides: { hidePValueColumn: true },
    };
    const resultsNoSmd: StatisticalResults = {
      ...results,
      perVariable: [{ ...results.perVariable[0], smd: undefined }],
    };
    const paraHideNoSmd = generateMethodsParagraph(resultsNoSmd, sentinelRuleset, planHideNoSmd, '1.0');
    expect(paraHideNoSmd).not.toContain('standardized mean differences');
    expect(paraHideNoSmd).not.toContain('Standardized mean differences');

    // 2. hide=true with SMD -> the "rather than" sentence
    const planHideWithSmd: AnalysisPlan = {
      ...plan,
      showSMD: true,
      userOverrides: { hidePValueColumn: true },
    };
    const resultsWithSmd: StatisticalResults = {
      ...results,
      perVariable: [{ ...results.perVariable[0], smd: 0.25 }],
    };
    const paraHideWithSmd = generateMethodsParagraph(resultsWithSmd, sentinelRuleset, planHideWithSmd, '1.0');
    expect(paraHideWithSmd).toContain(
      'Between-group baseline differences are displayed as standardized mean differences (SMD) rather than as a P-value column; SMD > 0.1 is conventionally interpreted as imbalanced.'
    );

    // 3. hide=false with SMD -> "alongside" sentence
    const planShowWithSmd: AnalysisPlan = {
      ...plan,
      showSMD: true,
      userOverrides: {},
    };
    const paraShowWithSmd = generateMethodsParagraph(resultsWithSmd, sentinelRuleset, planShowWithSmd, '1.0');
    expect(paraShowWithSmd).toContain(
      'Standardized mean differences (SMD) are reported alongside P-values; SMD > 0.1 is conventionally interpreted as imbalanced.'
    );
  });
});
