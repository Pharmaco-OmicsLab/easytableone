import { describe, it, expect } from 'vitest';
import { generateMethodsParagraph } from './methodsParagraph';
import type { JournalRuleset, StatisticalResults, AnalysisPlan } from '../types';
import { APP_VERSION } from '../appVersion';
import pyodideLock from "../../../public/pyodide-314.0.0a1/pyodide-lock.json";

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
    expect(para).toContain(`Pyodide ${pyodideLock.info.version}`);
    expect(para).toContain(`CPython ${pyodideLock.info.python}`);
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
    const para = generateMethodsParagraph(results, sentinelRuleset, planWithOverride, '1.0');

    expect(para).toContain('Between-group baseline differences are displayed as standardized mean differences (SMD) rather than as a P-value column; SMD > 0.1 is conventionally interpreted as imbalanced.');
    expect(para).not.toContain('tests were not performed');
    expect(para).not.toContain('no tests were run');
  });
});
