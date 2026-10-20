import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatsPreviewStage from './StatsPreviewStage';
import { useStore } from '../../store';

function seedPreviewStore(perVariableStats: any[] = []) {
  useStore.setState({
    stage: 7,
    schema: {
      columns: [
        { name: 'Age', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok', displayLabel: 'Age' },
        { name: 'Symptom', inferredType: 'categorical', confirmedType: 'binary', cardinalityTier: 'ok', displayLabel: 'Symptom' }
      ]
    } as any,
    data: {
      columns: [{ name: 'Age' }, { name: 'Symptom' }],
      rows: [[10, 'yes'], [20, 'no']],
      meta: { sourceFile: 'test.xlsx' }
    } as any,
    stats: {
      perVariable: perVariableStats,
      groups: [{ name: 'GroupA', n: 10 }, { name: 'GroupB', n: 10 }],
      totalN: 20,
      computeMetadata: { libVersions: {}, seed: 42 }
    } as any,
    setStage: (stage: any) => useStore.setState({ stage }),
    setPlan: (plan: any) => useStore.setState({ plan }),
    plan: {
      rulesetVersion: '1.0',
      appVersion: '1.0',
      researchPopulation: 'adult',
      studyDesign: 'unspecified',
      unitSystem: 'metric',
      groupingVariable: 'Group',
      includedVariables: ['Age', 'Symptom'],
      variableConfig: {},
      showSMD: true,
      showPValue: true,
      multipleTestingCorrection: 'none',
      randomSeed: 42,
      auditLog: [],
    },
  } as any);
}

describe('StatsPreviewStage — Statistical Review', () => {
  it('renders the statistical glossary controls and explanatory text', () => {
    seedPreviewStore([]);
    render(<StatsPreviewStage />);

    expect(screen.getByRole('group', { name: 'Statistical glossary' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'P-value & 0.05 convention' }));
    expect(screen.getByRole('status').textContent).toContain('not a boundary between true and false');
    expect(screen.getByRole('button', { name: 'Chi-square vs. Fisher\'s exact' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Standardized Mean Difference (SMD)' })).toBeDefined();
  });

  it('renders the formatted Table 1 and selects diagnostic rows with the keyboard', () => {
    seedPreviewStore([{
      variable: 'Age',
      summaryByGroup: {
        GroupA: { mean: 12, sd: 2, n: 10 },
        GroupB: { mean: 14, sd: 1.5, n: 10 },
      },
      overallSummary: { mean: 13, sd: 1.8, n: 20 },
      test: { name: "Welch's t-test", statistic: 2.1, pValue: 0.04, auxiliary: { shapiroPValue: 0.02 } },
      notes: [],
    }]);
    render(<StatsPreviewStage />);

    const preview = screen.getByRole('region', { name: 'Table 1 preview' });
    expect(preview.querySelector('table')).toBeTruthy();
    expect(preview.textContent).toContain('Age');
    expect(preview.querySelector('table')?.className).not.toContain('bg-blue');

    const variableRow = screen.getByLabelText('Show test details for Age');
    fireEvent.keyDown(variableRow, { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'Table 1 preview' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Decision detail · Age' })).toBeDefined();
    expect(screen.getByText(/Histogram · Age · Q-Q plot · Shapiro-Wilk p = 0.02/)).toBeDefined();
    expect(screen.queryByText(/Shapiro-Wilk p = 0.02 \(not normal\)/)).toBeNull();
    expect(screen.getByTestId('enable-modeling')).toBeDefined();
  });

  it('shows engine rationale and observed counts without expected-count details for a categorical row', () => {
    seedPreviewStore([{
      variable: 'Symptom',
      summaryByGroup: {
        GroupA: { counts: { yes: 1, no: 9 }, percentages: { yes: 10, no: 90 }, n: 10 },
        GroupB: { counts: { yes: 5, no: 5 }, percentages: { yes: 50, no: 50 }, n: 10 },
      },
      overallSummary: { counts: { yes: 6, no: 14 }, percentages: { yes: 30, no: 70 }, n: 20 },
      test: { name: "Fisher's exact", statistic: null, pValue: 0.2 },
      notes: [],
    }]);
    render(<StatsPreviewStage />);

    fireEvent.click(screen.getByLabelText('Show test details for Symptom'));
    const observedTable = screen.getByRole('table', { name: 'Observed counts by group' });
    expect(observedTable.textContent).toContain('1');
    expect(observedTable.textContent).toContain('5');
    expect(screen.queryByText(/Expected counts/)).toBeNull();
    expect(screen.getAllByText(/Some expected cell counts were less than 5, so Fisher's exact test was used/).length).toBeGreaterThan(0);
  });

  it('renders Welch t-test rationale for continuous variable that passed normality check', () => {
    const varStats = [
      {
        variable: 'Age',
        summaryByGroup: {
          'GroupA': { mean: 12.0, sd: 2.0, n: 10 },
          'GroupB': { mean: 14.0, sd: 1.5, n: 10 }
        },
        overallSummary: { mean: 13.0, sd: 1.8, n: 20 },
        test: {
          name: "Welch's t-test",
          statistic: 2.1,
          pValue: 0.04
        },
        notes: []
      }
    ];

    seedPreviewStore(varStats);
    render(<StatsPreviewStage />);

    // Rationale should explain that the variable met normality (Shapiro-Wilk p >= 0.05) and Welch's t-test was chosen
    expect(screen.getAllByText(/Age met the normality assumption/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Shapiro–Wilk test p >= 0.05/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Welch's t-test was used/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/non-parametric Mann-Whitney U test would apply/).length).toBeGreaterThan(0);
  });

  it('renders Mann-Whitney rationale for continuous variable that failed normality check', () => {
    const varStats = [
      {
        variable: 'Age',
        summaryByGroup: {
          'GroupA': { median: 12.0, q25: 10, q75: 14, n: 10 },
          'GroupB': { median: 14.0, q25: 11, q75: 16, n: 10 }
        },
        overallSummary: { median: 13.0, q25: 10.5, q75: 15, n: 20 },
        test: {
          name: 'Mann-Whitney U',
          statistic: 25.0,
          pValue: 0.03
        },
        notes: []
      }
    ];

    seedPreviewStore(varStats);
    render(<StatsPreviewStage />);

    // Rationale should explain that it did not meet normality (Shapiro-Wilk p < 0.05) and Mann-Whitney U was used
    expect(screen.getAllByText(/Age did not meet the normality assumption/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Shapiro–Wilk test p < 0.05/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Mann-Whitney U was used/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/parametric Welch's t-test would apply/).length).toBeGreaterThan(0);
  });

  it('renders Chi-square rationale for categorical variable with all expected cell counts >= 5', () => {
    const varStats = [
      {
        variable: 'Symptom',
        summaryByGroup: {
          'GroupA': { counts: { yes: 5, no: 5 }, n: 10 },
          'GroupB': { counts: { yes: 6, no: 4 }, n: 10 }
        },
        overallSummary: { counts: { yes: 11, no: 9 }, n: 20 },
        test: {
          name: 'Chi-square',
          statistic: 0.2,
          pValue: 0.65
        },
        notes: []
      }
    ];

    seedPreviewStore(varStats);
    render(<StatsPreviewStage />);

    expect(screen.getAllByText(/All expected cell counts were 5 or more, so the chi-square test was used/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Fisher's exact test would apply/).length).toBeGreaterThan(0);
  });

  it("renders Fisher's exact rationale for categorical variable with some expected cell counts < 5", () => {
    const varStats = [
      {
        variable: 'Symptom',
        summaryByGroup: {
          'GroupA': { counts: { yes: 2, no: 8 }, n: 10 },
          'GroupB': { counts: { yes: 1, no: 9 }, n: 10 }
        },
        overallSummary: { counts: { yes: 3, no: 17 }, n: 20 },
        test: {
          name: "Fisher's exact",
          statistic: null,
          pValue: 0.45
        },
        notes: []
      }
    ];

    seedPreviewStore(varStats);
    render(<StatsPreviewStage />);

    expect(screen.getAllByText(/Some expected cell counts were less than 5, so Fisher's exact test was used/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/chi-square test would apply/).length).toBeGreaterThan(0);
  });

  it("renders Monte-Carlo Fisher rationale without claiming chi-square assumptions", () => {
    seedPreviewStore([
      {
        variable: 'Symptom',
        summaryByGroup: {
          GroupA: { counts: { yes: 1, no: 0, other: 0 }, n: 1 },
          GroupB: { counts: { yes: 0, no: 1, other: 1 }, n: 2 },
        },
        overallSummary: { counts: { yes: 1, no: 1, other: 1 }, n: 3 },
        test: {
          name: "Fisher's exact (Monte Carlo)",
          statistic: null,
          pValue: 0.45,
        },
        notes: [],
      },
    ]);
    render(<StatsPreviewStage />);

    expect(screen.getAllByText(/Fisher's exact test with seeded Monte-Carlo estimation was used/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/All expected cell counts were 5 or more/)).toBeNull();
  });

  it('renders baseline-testing advisory for randomized trials and writes the display override', () => {
    seedPreviewStore([
      {
        variable: 'Age',
        summaryByGroup: {
          GroupA: { mean: 12.0, sd: 2.0, n: 10 },
          GroupB: { mean: 14.0, sd: 1.5, n: 10 },
        },
        overallSummary: { mean: 13.0, sd: 1.8, n: 20 },
        test: { name: "Welch's t-test", statistic: 2.1, pValue: 0.04 },
        smd: 0.2,
        notes: [],
      },
    ]);
    useStore.setState((state: any) => ({ plan: { ...state.plan, studyDesign: 'randomized_trial' } }));
    render(<StatsPreviewStage />);

    expect(screen.getByText(/You have declared a randomized design/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show SMD, hide P-values' }));

    expect(useStore.getState().plan?.userOverrides?.hidePValueColumn).toBe(true);
    expect(screen.queryByText(/You have declared a randomized design/)).toBeNull();
  });

  it('dismisses the Stats-preview advisory without writing the override', () => {
    seedPreviewStore([
      {
        variable: 'Age',
        summaryByGroup: {
          GroupA: { mean: 12.0, sd: 2.0, n: 10 },
          GroupB: { mean: 14.0, sd: 1.5, n: 10 },
        },
        overallSummary: { mean: 13.0, sd: 1.8, n: 20 },
        test: { name: "Welch's t-test", statistic: 2.1, pValue: 0.04 },
        smd: 0.2,
        notes: [],
      },
    ]);
    useStore.setState((state: any) => ({ plan: { ...state.plan, studyDesign: 'randomized_trial' } }));
    render(<StatsPreviewStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep P-values' }));

    expect(screen.queryByText(/You have declared a randomized design/)).toBeNull();
    expect(useStore.getState().plan?.userOverrides?.hidePValueColumn).toBeUndefined();
  });

  it('offers to switch on SMD and return to Analysis Plan when SMD was not computed for an RCT', () => {
    seedPreviewStore([
      {
        variable: 'Age',
        summaryByGroup: {
          GroupA: { mean: 12.0, sd: 2.0, n: 10 },
          GroupB: { mean: 14.0, sd: 1.5, n: 10 },
        },
        overallSummary: { mean: 13.0, sd: 1.8, n: 20 },
        test: { name: "Welch's t-test", statistic: 2.1, pValue: 0.04 },
        smd: null,
        notes: [],
      },
    ]);
    useStore.setState((state: any) => ({
      stage: 7,
      plan: { ...state.plan, studyDesign: 'randomized_trial', showSMD: false },
    }));
    render(<StatsPreviewStage />);

    expect(screen.getByText(/You have declared a randomized design/)).toBeTruthy();
    expect(screen.getByText(/Standardized differences were not computed for this run/)).toBeTruthy();

    const switchBtn = screen.getByRole('button', { name: 'Switch on SMD and return to the Analysis Plan' });
    fireEvent.click(switchBtn);

    expect(useStore.getState().plan?.showSMD).toBe(true);
    expect(useStore.getState().plan?.userOverrides?.hidePValueColumn).toBe(true);
    expect(useStore.getState().stage).toBe(6);
  });
});
