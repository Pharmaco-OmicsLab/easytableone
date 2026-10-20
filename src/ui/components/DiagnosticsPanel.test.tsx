import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import type { Schema, StatisticalResults } from '../../core/types';
import { useStore } from '../../store';

describe('DiagnosticsPanel (Round 8e)', () => {
  beforeEach(() => {
    useStore.setState({ plan: null } as any);
  });

  const mockSchema: Schema = {
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

  const mockResults: StatisticalResults = {
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

  it('maps group headers to labels and maps categorical codes to level labels in cell summaries', () => {
    render(
      <DiagnosticsPanel
        results={mockResults}
        schema={mockSchema}
        groupingVariable="GroupVar"
      />
    );

    // Group headers should show "Non-survival (n=48)" and "Survival (n=89)"
    expect(screen.getByText('Non-survival (n=48)')).toBeDefined();
    expect(screen.getByText('Survival (n=89)')).toBeDefined();

    // Categorical cell summaries should render level labels and percentages
    expect(screen.getByTitle('No: 20 (41.7%); Pallar: 25 (52.1%); Cyanosis: 3 (6.3%)')).toBeDefined();
    expect(screen.getByTitle('No: 70 (78.7%); Pallar: 10 (11.2%); Cyanosis: 9 (10.1%)')).toBeDefined();
  });

  it('formats integer fallback codes as integers in summaries when no label/schema exists', () => {
    const rawResults: StatisticalResults = {
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

    render(
      <DiagnosticsPanel
        results={rawResults}
      />
    );

    // Group header should show raw code formatted as integer fallback "1 (n=25)", not "1.0 (n=25)"
    expect(screen.getByText('1 (n=25)')).toBeDefined();

    // Summary should format code "1.0" to fallback "1"
    expect(screen.getByTitle('1: 25 (100.0%)')).toBeDefined();
  });

  it("labels Dunn post-hoc pairs by method, not just by correction", () => {
    const dunnResults: StatisticalResults = {
      perVariable: [
        {
          variable: 'Value',
          summaryByGroup: {
            A: { median: 1, q25: 1, q75: 2, n: 3 },
            B: { median: 1, q25: 1, q75: 2, n: 3 },
            C: { median: 9, q25: 8, q75: 10, n: 3 },
          },
          overallSummary: { median: 2, q25: 1, q75: 9, n: 9 },
          test: { name: 'Kruskal-Wallis', statistic: 7.2, pValue: 0.01 },
          postHoc: {
            reason: 'Kruskal-Wallis significant (p=0.01); 3 groups',
            correction: 'holm',
            method: 'dunn',
            pairs: [
              { groupA: 'A', groupB: 'C', pValueRaw: 0.001, pValueCorrected: 0.003, significant: true },
            ],
          },
          notes: [],
        },
      ],
      groups: [{ name: 'A', n: 3 }, { name: 'B', n: 3 }, { name: 'C', n: 3 }],
      totalN: 9,
      computeMetadata: { libVersions: {}, seed: 42 }
    };

    render(<DiagnosticsPanel results={dunnResults} groupingVariable="GroupVar" />);
    expect(screen.getByText(/A vs C: p = 0.003 \(Dunn\)/)).toBeDefined();
  });

  it('warns when a restored test override is incompatible with treatAs', () => {
    useStore.setState({
      plan: {
        variableConfig: {
          Symptom: { treatAs: 'categorical_nominal' },
        },
        testOverrides: [{ variable: 'Symptom', method: 'welch_t_test', timestamp: '2026-06-29T00:00:00.000Z' }],
      },
    } as any);

    render(
      <DiagnosticsPanel
        results={mockResults}
        schema={mockSchema}
        groupingVariable="GroupVar"
      />
    );

    expect(screen.getByText(/Override warning: Welch's t-test is a continuous-variable test/)).toBeDefined();
    expect(screen.getByText(/automatic categorical test would normally apply/)).toBeDefined();
  });

  it("treats Monte-Carlo Fisher as the Fisher override method", () => {
    const mcResults: StatisticalResults = {
      ...mockResults,
      perVariable: [{
        ...mockResults.perVariable[0],
        test: {
          name: "Fisher's exact (Monte Carlo)",
          statistic: null,
          pValue: 0.2,
          auxiliary: { autoMethod: "Fisher's exact (Monte Carlo)", minExpectedCount: 1 },
        },
      }],
    };
    useStore.setState({
      plan: {
        variableConfig: {
          Symptom: { treatAs: 'categorical_nominal' },
        },
        testOverrides: [],
      },
    } as any);

    render(<DiagnosticsPanel results={mcResults} schema={mockSchema} groupingVariable="GroupVar" />);

    expect(screen.getByDisplayValue("Fisher's exact (Monte Carlo)")).toBeDefined();
  });

  it('renders a de-directionalized SMD tooltip containing absolute difference details', () => {
    const smdResults: StatisticalResults = {
      ...mockResults,
      perVariable: [{
        ...mockResults.perVariable[0],
        smd: 0.15,
      }],
    };
    render(
      <DiagnosticsPanel
        results={smdResults}
        schema={mockSchema}
        groupingVariable="GroupVar"
      />
    );
    const smdCell = screen.getByText('0.150').closest('td');
    expect(smdCell).toBeDefined();
    const tooltipText = smdCell?.getAttribute('title');
    expect(tooltipText).toBeDefined();
    expect(tooltipText).not.toContain("positive value means");
    expect(tooltipText).toContain("SMD is the absolute standardized difference");
    expect(tooltipText).toContain("conventionally considered imbalanced");
  });

  it('Phase 50 R3: renders post-hoc caveat under post-hoc pairs', () => {
    const caveatResults: StatisticalResults = {
      ...mockResults,
      perVariable: [{
        ...mockResults.perVariable[0],
        test: { name: 'ANOVA', statistic: 12.5, pValue: 0.001 },
        postHoc: {
          reason: 'ANOVA significant (p=0.001); 3 groups',
          correction: 'tukey',
          method: 'tukey_hsd',
          pairs: [{ groupA: '1.0', groupB: '2', pValueRaw: 0.002, pValueCorrected: 0.002, significant: true }],
          caveat: 'Tukey HSD assumes equal variances, which the Levene/Brown-Forsythe check did not support for this variable; pairwise P values should be interpreted with caution.',
        },
      }],
      groups: [{ name: '1.0', n: 48 }, { name: '2', n: 89 }, { name: '3', n: 50 }],
    };

    render(
      <DiagnosticsPanel
        results={caveatResults}
        schema={mockSchema}
        groupingVariable="GroupVar"
      />
    );

    expect(screen.getByText(/Tukey HSD assumes equal variances, which the Levene\/Brown-Forsythe check did not support/)).toBeDefined();
  });

  it('Phase 50 R3: renders unequal-variance warning when contradictionReason is unequal_variance', () => {
    const unequalVarianceResults: StatisticalResults = {
      ...mockResults,
      perVariable: [{
        ...mockResults.perVariable[0],
        test: {
          name: 'ANOVA',
          statistic: 2.1,
          pValue: 0.12,
          auxiliary: {
            assumptionCheckContradicted: 'true',
            contradictionReason: 'unequal_variance',
            levenePValue: 0.004,
          },
        },
      }],
      groups: [{ name: '1.0', n: 48 }, { name: '2', n: 89 }, { name: '3', n: 50 }],
    };

    useStore.setState({
      plan: {
        variableConfig: { Symptom: { label: 'Symptom', treatAs: 'continuous' } },
        testOverrides: [{ variable: 'Symptom', method: 'oneway_anova', timestamp: '2026-09-28T00:00:00.000Z' }],
      },
    } as any);

    render(
      <DiagnosticsPanel
        results={unequalVarianceResults}
        schema={mockSchema}
        groupingVariable="GroupVar"
      />
    );

    expect(screen.getByText(/Levene\/Brown-Forsythe p = 0.00 indicates unequal group variances/)).toBeDefined();
    expect(screen.getByText(/Welch's ANOVA is the indicated alternative but is not available in this release/)).toBeDefined();
    expect(screen.queryByText(/Shapiro–Wilk/)).toBeNull();
  });

  it('Phase 50 R4: ordinal rank option appears only for categorical_ordinal rows with >= 3 levels (D104(b))', () => {
    const ordinalSchema: Schema = {
      columns: [
        mockSchema.columns[0],
        {
          name: 'NYHA',
          inferredType: 'categorical_ordinal',
          confirmedType: 'categorical_ordinal',
          cardinalityTier: 'ok',
          levels: [
            { code: 1, label: 'I' },
            { code: 2, label: 'II' },
            { code: 3, label: 'III' },
          ],
        },
        {
          name: 'NominalVar',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
          levels: [
            { code: 1, label: 'A' },
            { code: 2, label: 'B' },
            { code: 3, label: 'C' },
          ],
        },
        {
          name: 'TwoLevelOrdinal',
          inferredType: 'categorical_ordinal',
          confirmedType: 'categorical_ordinal',
          cardinalityTier: 'ok',
          levels: [
            { code: 1, label: 'Low' },
            { code: 2, label: 'High' },
          ],
        },
      ],
    };

    const ordinalResults: StatisticalResults = {
      perVariable: [
        {
          variable: 'NYHA',
          summaryByGroup: {
            '1.0': { counts: { '1': 10, '2': 15, '3': 23 }, percentages: { '1': 20.8, '2': 31.3, '3': 47.9 }, n: 48 },
            '2': { counts: { '1': 30, '2': 30, '3': 29 }, percentages: { '1': 33.7, '2': 33.7, '3': 32.6 }, n: 89 },
          },
          overallSummary: { counts: { '1': 40, '2': 45, '3': 52 }, percentages: { '1': 29.2, '2': 32.8, '3': 38.0 }, n: 137 },
          test: { name: 'Chi-square', statistic: 2.5, pValue: 0.28 },
          notes: [],
        },
        {
          variable: 'NominalVar',
          summaryByGroup: {
            '1.0': { counts: { '1': 10, '2': 15, '3': 23 }, percentages: { '1': 20.8, '2': 31.3, '3': 47.9 }, n: 48 },
            '2': { counts: { '1': 30, '2': 30, '3': 29 }, percentages: { '1': 33.7, '2': 33.7, '3': 32.6 }, n: 89 },
          },
          overallSummary: { counts: { '1': 40, '2': 45, '3': 52 }, percentages: { '1': 29.2, '2': 32.8, '3': 38.0 }, n: 137 },
          test: { name: 'Chi-square', statistic: 2.5, pValue: 0.28 },
          notes: [],
        },
        {
          variable: 'TwoLevelOrdinal',
          summaryByGroup: {
            '1.0': { counts: { '1': 20, '2': 28 }, percentages: { '1': 41.7, '2': 58.3 }, n: 48 },
            '2': { counts: { '1': 45, '2': 44 }, percentages: { '1': 50.6, '2': 49.4 }, n: 89 },
          },
          overallSummary: { counts: { '1': 65, '2': 72 }, percentages: { '1': 47.4, '2': 52.6 }, n: 137 },
          test: { name: 'Chi-square', statistic: 1.0, pValue: 0.32 },
          notes: [],
        },
      ],
      groups: [{ name: '1.0', n: 48 }, { name: '2', n: 89 }],
      totalN: 137,
      computeMetadata: { libVersions: {}, seed: 42 },
    };

    useStore.setState({
      plan: {
        variableConfig: {
          NYHA: { label: 'NYHA', treatAs: 'categorical_ordinal', levelOrder: [1, 2, 3] },
          NominalVar: { label: 'NominalVar', treatAs: 'categorical_nominal' },
          TwoLevelOrdinal: { label: 'TwoLevelOrdinal', treatAs: 'categorical_ordinal', levelOrder: [1, 2] },
        },
      },
    } as any);

    const { container } = render(
      <DiagnosticsPanel
        results={ordinalResults}
        schema={ordinalSchema}
        groupingVariable="GroupVar"
      />
    );

    const selects = container.querySelectorAll('select');
    // NYHA select should have ordinal_rank
    const nyhaSelect = selects[0];
    const nyhaOptions = Array.from(nyhaSelect.options).map((o) => o.value);
    expect(nyhaOptions).toContain('ordinal_rank');
    expect(screen.getByText('Mann-Whitney U (ordered categories)')).toBeDefined();

    // NominalVar select should NOT have ordinal_rank
    const nominalSelect = selects[1];
    const nominalOptions = Array.from(nominalSelect.options).map((o) => o.value);
    expect(nominalOptions).not.toContain('ordinal_rank');

    // TwoLevelOrdinal select should NOT have ordinal_rank
    const twoLevelSelect = selects[2];
    const twoLevelOptions = Array.from(twoLevelSelect.options).map((o) => o.value);
    expect(twoLevelOptions).not.toContain('ordinal_rank');
  });
});
