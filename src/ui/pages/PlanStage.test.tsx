import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PlanStage from './PlanStage';
import { useStore } from '../../store';
import { runTable1 } from '../../core/stats/runTable1';

vi.mock('../../core/stats/runTable1', () => ({
  runTable1: vi.fn().mockResolvedValue({}),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function seedPlanStore() {
  useStore.setState({
    stage: 6,
    schema: {
      columns: [
        { name: 'colA', inferredType: 'categorical', confirmedType: 'binary', cardinalityTier: 'ok' },
        { name: 'colB', inferredType: 'categorical', confirmedType: 'categorical_nominal', cardinalityTier: 'ok' },
        { name: 'colC', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' },
        { name: 'colID', inferredType: 'id', confirmedType: 'id_like', cardinalityTier: 'ok' }
      ]
    } as any,
    data: {
      columns: [{ name: 'colA' }, { name: 'colB' }, { name: 'colC' }, { name: 'colID' }],
      rows: [
        ['group1', 'cat1', 10, 'id1'],
        ['group2', 'cat2', 20, 'id2']
      ],
      meta: {
        sourceFile: 'test.xlsx'
      }
    } as any,
    dataQualityFindings: [],
    setDataQualityFindings: (findings: any) => useStore.setState({ dataQualityFindings: findings }),
    dataQualityRecords: [],
    setDataQualityRecords: (records: any) => useStore.setState({ dataQualityRecords: records }),
    plan: null,
    studyDesign: 'unspecified',
    draftGroupingVariable: null,
    setStage: (stage: any) => useStore.setState({ stage }),
    setPlan: (plan: any) => useStore.setState({ plan }),
    setStats: (stats: any) => useStore.setState({ stats }),
  } as any);
}

describe('PlanStage — Grouping Swap Logic (Step 8c.1)', () => {
  it('initializes default grouping and excludes it from included variables', () => {
    seedPlanStore();
    render(<PlanStage />);

    // Default grouping should be first eligible (colA)
    const select = screen.getByLabelText('Grouping Variable') as HTMLSelectElement;
    expect(select.value).toBe('colA');

    // colB and colC should be checked/included (colID is id_like, so excluded)
    const colBCheckbox = screen.getByLabelText('colB (categorical_nominal)') as HTMLInputElement;
    const colCCheckbox = screen.getByLabelText('colC (continuous)') as HTMLInputElement;
    const colIDCheckbox = screen.getByLabelText('colID (id_like)') as HTMLInputElement;

    expect(colBCheckbox.checked).toBe(true);
    expect(colCCheckbox.checked).toBe(true);
    expect(colIDCheckbox.checked).toBe(false);
  });

  it('restores previous grouping variable when swapped', () => {
    seedPlanStore();
    render(<PlanStage />);

    const select = screen.getByLabelText('Grouping Variable') as HTMLSelectElement;

    // Swap grouping from colA to colB
    fireEvent.change(select, { target: { value: 'colB' } });
    expect(select.value).toBe('colB');

    // colA should be restored to included and checked
    const colACheckbox = screen.getByLabelText('colA (binary)') as HTMLInputElement;
    expect(colACheckbox.checked).toBe(true);

    // colB should be hidden from checkboxes list since it is the grouping variable
    expect(screen.queryByLabelText('colB (categorical_nominal)')).toBeNull();
    expect(useStore.getState().draftGroupingVariable).toBe('colB');
  });

  it('moves a variable to the bottom of the table row order', () => {
    seedPlanStore();
    render(<PlanStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Move colB to bottom' }));

    const rowOrder = Array.from(document.querySelectorAll('[draggable="true"]'))
      .map((element) => element.textContent)
      .filter((text): text is string => Boolean(text));
    expect(rowOrder.at(-1)).toContain('colB');
  });

  it('initializes from a draft grouping variable when returning from Stage 5', () => {
    seedPlanStore();
    useStore.setState({ draftGroupingVariable: 'colB' });
    render(<PlanStage />);

    const select = screen.getByLabelText('Grouping Variable') as HTMLSelectElement;
    expect(select.value).toBe('colB');
  });

  it('renders Round 9 decision explainers for plan decisions', () => {
    seedPlanStore();
    render(<PlanStage />);
    expect(screen.getByTestId('decision-explainer-plan.grouping-variable')).toBeTruthy();
    expect(screen.getByTestId('decision-explainer-plan.group-order')).toBeTruthy();
    expect(screen.getByTestId('decision-explainer-plan.variable-order')).toBeTruthy();
  });

  it('supports selecting and clearing all analysis variables', () => {
    seedPlanStore();
    render(<PlanStage />);

    const colBCheckbox = screen.getByLabelText('colB (categorical_nominal)') as HTMLInputElement;
    const colCCheckbox = screen.getByLabelText('colC (continuous)') as HTMLInputElement;

    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(colBCheckbox.checked).toBe(false);
    expect(colCCheckbox.checked).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(colBCheckbox.checked).toBe(true);
    expect(colCCheckbox.checked).toBe(true);
  });

  it('resolves a draft grouping variable from a display label', () => {
    seedPlanStore();
    useStore.setState((state: any) => ({
      draftGroupingVariable: 'Outcome variable',
      schema: {
        columns: state.schema.columns.map((column: any) =>
          column.name === 'colB'
            ? { ...column, displayLabel: 'Outcome variable' }
            : column
        ),
      },
    }));
    render(<PlanStage />);

    const select = screen.getByLabelText('Grouping Variable') as HTMLSelectElement;
    expect(select.value).toBe('colB');
    expect(screen.getByRole('option', { name: 'Outcome variable' })).toBeTruthy();
  });

  it('does not offer schema-excluded columns for grouping or analysis variables', () => {
    seedPlanStore();
    useStore.setState((state: any) => ({
      schema: {
        columns: state.schema.columns.map((column: any) =>
          column.name === 'colB' ? { ...column, exclusionReason: 'Manually excluded' } : column
        ),
      },
    }));
    render(<PlanStage />);

    expect(screen.queryByRole('option', { name: 'colB' })).toBeNull();
    expect(screen.queryByLabelText('colB (categorical_nominal)')).toBeNull();
  });

  it('preserves user manual deselections on grouping swap', () => {
    seedPlanStore();
    render(<PlanStage />);

    const select = screen.getByLabelText('Grouping Variable') as HTMLSelectElement;

    // Manually deselect colC
    const colCCheckbox = screen.getByLabelText('colC (continuous)') as HTMLInputElement;
    expect(colCCheckbox.checked).toBe(true);
    fireEvent.click(colCCheckbox);
    expect(colCCheckbox.checked).toBe(false);

    // Swap grouping from colA to colB
    fireEvent.change(select, { target: { value: 'colB' } });
    expect(select.value).toBe('colB');

    // colC should STILL be unchecked (user choice preserved)
    const colCCheckboxAfterSwap = screen.getByLabelText('colC (continuous)') as HTMLInputElement;
    expect(colCCheckboxAfterSwap.checked).toBe(false);

    // colA should be restored and checked
    const colACheckbox = screen.getByLabelText('colA (binary)') as HTMLInputElement;
    expect(colACheckbox.checked).toBe(true);
  });

  it('allows reordering variables and saves that order to the plan', async () => {
    seedPlanStore();
    render(<PlanStage />);

    // By default, colB is first, colC is second.
    // Move colC up (index 1 of move up buttons)
    const moveUpButtons = screen.getAllByTitle('Move Up');
    fireEvent.click(moveUpButtons[1]);

    // Acknowledge the group imbalance warning to enable the Run button
    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);

    // Click run
    const runBtn = screen.getByRole('button', { name: 'Run Statistics' });
    fireEvent.click(runBtn);

    // Wait for store plan to be updated
    await waitFor(() => {
      const state = useStore.getState();
      expect(state.plan).toBeDefined();
      expect(state.plan?.includedVariables).toEqual(['colC', 'colB']);
    });
  });

  it('moves a variable directly to the top while preserving relative order', async () => {
    seedPlanStore();
    useStore.setState((state: any) => ({
      schema: {
        columns: [
          ...state.schema.columns.slice(0, 3),
          { name: 'colD', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' },
          { name: 'colE', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' },
          state.schema.columns[3],
        ],
      },
      data: {
        ...state.data,
        columns: [
          { name: 'colA' },
          { name: 'colB' },
          { name: 'colC' },
          { name: 'colD' },
          { name: 'colE' },
          { name: 'colID' },
        ],
        rows: [
          ['group1', 'cat1', 10, 100, 1000, 'id1'],
          ['group2', 'cat2', 20, 200, 2000, 'id2'],
        ],
      },
    }));
    render(<PlanStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Move colE to top' }));

    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));

    await waitFor(() => {
      expect(useStore.getState().plan?.includedVariables).toEqual(['colE', 'colB', 'colC', 'colD']);
    });
  });

  it('stores an explicit binary displayed-level override and clears default selections', async () => {
    seedPlanStore();
    useStore.setState((state: any) => ({
      schema: {
        columns: state.schema.columns.map((column: any) =>
          column.name === 'colB'
            ? {
                ...column,
                confirmedType: 'binary',
                levels: [
                  { code: 'cat1', label: 'No' },
                  { code: 'cat2', label: 'Yes' },
                ],
              }
            : column
        ),
      },
    }));
    render(<PlanStage />);

    const displayedLevel = screen.getByLabelText('Displayed level') as HTMLSelectElement;
    expect(displayedLevel.value).toBe('cat2');

    fireEvent.change(displayedLevel, { target: { value: 'cat1' } });

    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));

    await waitFor(() => {
      expect(useStore.getState().plan?.variableConfig.colB.displayLevel).toBe('cat1');
    });
  });

  it('stores display labels in variableConfig for downstream exports', async () => {
    seedPlanStore();
    useStore.setState((state: any) => ({
      schema: {
        columns: state.schema.columns.map((column: any) =>
          column.name === 'colC'
            ? { ...column, displayLabel: 'Age at enrollment' }
            : column
        ),
      },
    }));
    render(<PlanStage />);

    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));

    await waitFor(() => {
      expect(useStore.getState().plan?.variableConfig.colC.label).toBe('Age at enrollment');
    });
  });

  it('updates the table column preview when sorting groups by frequency', () => {
    seedPlanStore();
    useStore.setState((state: any) => ({
      schema: {
        columns: state.schema.columns.map((column: any) =>
          column.name === 'colA'
            ? {
                ...column,
                confirmedType: 'categorical_ordinal',
                levels: [
                  { code: 'group1', label: 'First group', order: 1 },
                  { code: 'group2', label: 'Second group', order: 2 },
                  { code: 'group3', label: 'Third group', order: 3 },
                ],
              }
            : column
        ),
      },
      data: {
        ...state.data,
        rows: [
          ['group1', 'cat1', 10, 'id1'],
          ['group2', 'cat2', 20, 'id2'],
          ['group3', 'cat1', 30, 'id3'],
          ['group3', 'cat2', 40, 'id4'],
          ['group3', 'cat1', 50, 'id5'],
          ['group1', 'cat2', 60, 'id6'],
        ],
      },
    }));
    render(<PlanStage />);

    expect(screen.getByText('Sort table columns by:')).toBeTruthy();
    expect(screen.getByText('Table Rows Order (Drag to Reorder)')).toBeTruthy();

    const preview = screen.getByText('Table Column Order Preview').parentElement as HTMLElement;
    let previewText = preview.textContent ?? '';
    expect(previewText.indexOf('First group')).toBeLessThan(previewText.indexOf('Third group'));

    fireEvent.click(screen.getByLabelText('Frequency (desc)'));

    previewText = preview.textContent ?? '';
    expect(previewText.indexOf('Third group')).toBeLessThan(previewText.indexOf('First group'));
    expect(previewText.indexOf('First group')).toBeLessThan(previewText.indexOf('Second group'));
  });

  it('previews the exact custom group order that Run sends to Table 1', async () => {
    seedPlanStore();
    useStore.setState((state: any) => ({
      schema: {
        columns: state.schema.columns.map((column: any) =>
          column.name === 'colA'
            ? {
                ...column,
                confirmedType: 'categorical_ordinal',
                levels: [
                  { code: 'group1', label: 'First group', order: 1 },
                  { code: 'group2', label: 'Second group', order: 2 },
                ],
              }
            : column
        ),
      },
    }));
    render(<PlanStage />);

    fireEvent.click(screen.getByLabelText('Custom…'));
    fireEvent.change(screen.getByPlaceholderText('Type one group label per line'), {
      target: { value: 'group2\nunknown-group\ngroup1' },
    });

    const preview = screen.getByText('Table Column Order Preview').parentElement as HTMLElement;
    const previewText = preview.textContent ?? '';
    expect(previewText.indexOf('Second group')).toBeLessThan(previewText.indexOf('unknown-group'));
    expect(previewText.indexOf('unknown-group')).toBeLessThan(previewText.indexOf('First group'));
    expect(preview.textContent).toContain('unknown-group (n = 0)');

    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));

    await waitFor(() => {
      expect(useStore.getState().plan?.groupOrder).toEqual(['group2', 'unknown-group', 'group1']);
      expect(vi.mocked(runTable1).mock.calls[0]?.[1].groupOrder).toEqual(['group2', 'unknown-group', 'group1']);
    });
  });

  it('explains binary displayed level with visible helper text and a title reminder', () => {
    seedPlanStore();
    useStore.setState((state: any) => ({
      schema: {
        columns: state.schema.columns.map((column: any) =>
          column.name === 'colB'
            ? {
                ...column,
                confirmedType: 'binary',
                levels: [
                  { code: 'cat1', label: 'No' },
                  { code: 'cat2', label: 'Yes' },
                ],
              }
            : column
        ),
      },
    }));
    render(<PlanStage />);

    expect(screen.getByText(/Rows appear in Table 1 in this order/)).toBeTruthy();
    expect(screen.getByText('Displayed level').closest('label')?.getAttribute('title')).toBe(
      'Which level of this binary variable is reported as the summarized row in Table 1.',
    );
  });

  it('shows baseline-testing advisory only for randomized trials', () => {
    seedPlanStore();
    useStore.setState({ studyDesign: 'randomized_trial' } as any);
    render(<PlanStage />);

    expect(screen.getByText(/You have declared a randomised design/)).toBeTruthy();
  });

  it('does not show baseline-testing advisory for observational designs', () => {
    seedPlanStore();
    useStore.setState({ studyDesign: 'observational' } as any);
    render(<PlanStage />);

    expect(screen.queryByText(/You have declared a randomised design/)).toBeNull();
  });

  it('writes hidePValueColumn when the Plan-stage advisory action is accepted', async () => {
    seedPlanStore();
    useStore.setState({ studyDesign: 'randomized_trial' } as any);
    render(<PlanStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Show SMD, hide P-values' }));
    expect(screen.queryByText(/You have declared a randomised design/)).toBeNull();

    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));

    await waitFor(() => {
      expect(useStore.getState().plan?.studyDesign).toBe('randomized_trial');
      expect(useStore.getState().plan?.showSMD).toBe(true);
      expect(useStore.getState().plan?.userOverrides?.hidePValueColumn).toBe(true);
    });
  });

  it('dismisses the Plan-stage advisory without writing an override', () => {
    seedPlanStore();
    useStore.setState({ studyDesign: 'randomized_trial' } as any);
    render(<PlanStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep P-values' }));

    expect(screen.queryByText(/You have declared a randomised design/)).toBeNull();
    expect(useStore.getState().plan?.userOverrides?.hidePValueColumn).toBeUndefined();
  });
});

describe('PlanStage — Phase 50 R1: SMD defaults, guidance, rehydration (D101)', () => {
  it('defaults SMD to unchecked and P-value to checked on fresh store', () => {
    seedPlanStore();
    render(<PlanStage />);

    const smdCheckbox = screen.getByLabelText(/Show SMD/) as HTMLInputElement;
    const pValueCheckbox = screen.getByLabelText(/Show P-value/) as HTMLInputElement;
    const mtcSelect = screen.getByLabelText('Multiple Testing Correction') as HTMLSelectElement;

    expect(smdCheckbox.checked).toBe(false);
    expect(pValueCheckbox.checked).toBe(true);
    expect(mtcSelect.value).toBe('none');
  });

  it('rehydrates showSMD, showPValue, and multipleTestingCorrection from plan', () => {
    seedPlanStore();
    useStore.setState({
      plan: {
        rulesetVersion: '1.0',
        appVersion: '1.0.0',
        researchPopulation: 'adult',
        studyDesign: 'unspecified',
        unitSystem: 'metric',
        groupingVariable: 'colA',
        includedVariables: ['colB', 'colC'],
        variableConfig: {},
        showSMD: true,
        showPValue: false,
        multipleTestingCorrection: 'holm',
        auditLog: [],
      } as any,
    });
    render(<PlanStage />);

    const smdCheckbox = screen.getByLabelText(/Show SMD/) as HTMLInputElement;
    const pValueCheckbox = screen.getByLabelText(/Show P-value/) as HTMLInputElement;
    const mtcSelect = screen.getByLabelText('Multiple Testing Correction') as HTMLSelectElement;

    expect(smdCheckbox.checked).toBe(true);
    expect(pValueCheckbox.checked).toBe(false);
    expect(mtcSelect.value).toBe('holm');
  });

  it('runs with SMD unchecked and submits showSMD: false', async () => {
    seedPlanStore();
    render(<PlanStage />);

    const smdCheckbox = screen.getByLabelText(/Show SMD/) as HTMLInputElement;
    expect(smdCheckbox.checked).toBe(false);

    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));

    await waitFor(() => {
      expect(useStore.getState().plan?.showSMD).toBe(false);
      expect(useStore.getState().plan?.showPValue).toBe(true);
    });
  });

  it('renders details summary text and does not render retired CONSORT-aligned copy', () => {
    seedPlanStore();
    render(<PlanStage />);

    expect(screen.getByText('When should I show SMD?')).toBeTruthy();
    expect(screen.queryByText(new RegExp(['CONSORT', 'aligned emphasis'].join('-')))).toBeNull();
  });

  it('renders observational nudge only when studyDesign is observational and SMD is off', () => {
    seedPlanStore();
    useStore.setState({ studyDesign: 'observational' } as any);
    render(<PlanStage />);

    expect(
      screen.getByText(
        'Comparing treatment or exposure groups in an observational study? SMD is the standard way to show group balance — see “When should I show SMD?”.',
      ),
    ).toBeTruthy();

    // Check SMD -> nudge disappears
    const smdCheckbox = screen.getByLabelText(/Show SMD/);
    fireEvent.click(smdCheckbox);
    expect(
      screen.queryByText(
        'Comparing treatment or exposure groups in an observational study? SMD is the standard way to show group balance — see “When should I show SMD?”.',
      ),
    ).toBeNull();
  });

  it('does not render observational nudge for other study designs', () => {
    for (const design of ['unspecified', 'randomized_trial', 'other'] as const) {
      seedPlanStore();
      useStore.setState({ studyDesign: design } as any);
      const { unmount } = render(<PlanStage />);
      expect(
        screen.queryByText(
          'Comparing treatment or exposure groups in an observational study? SMD is the standard way to show group balance — see “When should I show SMD?”.',
        ),
      ).toBeNull();
      unmount();
    }
  });

  it('shows stale stats banner when stats exist without SMD but showSMD is enabled', () => {
    seedPlanStore();
    useStore.setState({
      stats: {
        perVariable: [
          { variable: 'colB', smd: null },
        ],
      } as any,
      plan: {
        showSMD: true,
      } as any,
    });
    render(<PlanStage />);

    expect(screen.getByText('Display settings changed — re-run the analysis to update the table.')).toBeTruthy();
  });

  it('Phase 50 R5: advisory click, then uncheck SMD -> submitted plan has no hidePValueColumn and notice is shown', async () => {
    seedPlanStore();
    useStore.setState({ studyDesign: 'randomized_trial' } as any);
    render(<PlanStage />);

    // Click RCT advisory button
    const advisoryBtn = screen.getByRole('button', { name: 'Show SMD, hide P-values' });
    fireEvent.click(advisoryBtn);

    // Uncheck Show SMD
    const smdCheckbox = screen.getByLabelText(/Show SMD/) as HTMLInputElement;
    expect(smdCheckbox.checked).toBe(true);
    fireEvent.click(smdCheckbox);
    expect(smdCheckbox.checked).toBe(false);

    // Notice should be rendered
    expect(
      screen.getByText('P values will be shown, because standardised differences are switched off.'),
    ).toBeTruthy();

    // Run statistics
    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));

    await waitFor(() => {
      const plan = useStore.getState().plan;
      expect(plan?.userOverrides?.hidePValueColumn).toBeUndefined();
    });
  });

  it('Phase 50 R5: re-running from PlanStage preserves userOverrides and testOverrides for included variables (D107(d))', async () => {
    seedPlanStore();
    useStore.setState({
      plan: {
        rulesetVersion: '1.0',
        appVersion: '1.0',
        researchPopulation: 'adult',
        studyDesign: 'unspecified',
        unitSystem: 'metric',
        groupingVariable: 'colA',
        includedVariables: ['colB', 'colC'],
        variableConfig: {},
        showSMD: false,
        showPValue: true,
        multipleTestingCorrection: 'none',
        auditLog: [],
        userOverrides: {
          numberFormat: { style: 'nejm', decimalPlaces: 2 },
        },
        testOverrides: [
          { variable: 'colB', method: 'fisher', timestamp: '2026-09-28T00:00:00Z' },
          { variable: 'colExcluded', method: 'ordinal_rank', timestamp: '2026-09-28T00:00:00Z' },
        ],
      } as any,
    });

    render(<PlanStage />);

    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));

    await waitFor(() => {
      const submittedPlan = useStore.getState().plan;
      // userOverrides preserved
      expect(submittedPlan?.userOverrides?.numberFormat).toEqual({ style: 'nejm', decimalPlaces: 2 });
      // testOverrides for included variable preserved
      expect(submittedPlan?.testOverrides?.some((o) => o.variable === 'colB')).toBe(true);
      // testOverrides for excluded variable dropped
      expect(submittedPlan?.testOverrides?.some((o) => o.variable === 'colExcluded')).toBe(false);
    });
  });
});

describe('PlanStage — Phase 52 R5 analysis-plan controls', () => {
  it('uses the same row reorder for arrow buttons and dragging', () => {
    seedPlanStore();
    render(<PlanStage />);
    const rowOrder = screen.getByText('Table Rows Order (Drag to Reorder)').parentElement;
    const rows = () => Array.from(rowOrder!.querySelectorAll<HTMLElement>('[draggable="true"]')).map((row) => row.textContent?.match(/col[A-Z]/)?.[0]);
    expect(rows()).toEqual(['colB', 'colC']);

    fireEvent.click(screen.getByRole('button', { name: 'Move colC up' }));
    expect(rows()).toEqual(['colC', 'colB']);

    const firstRow = rowOrder!.querySelector<HTMLElement>('[draggable="true"]')!;
    const secondRow = rowOrder!.querySelectorAll<HTMLElement>('[draggable="true"]')[1];
    const dataTransfer = { effectAllowed: 'move' };
    fireEvent.dragStart(firstRow, { dataTransfer });
    fireEvent.drop(secondRow, { dataTransfer });
    expect(rows()).toEqual(['colB', 'colC']);
  });

  it('keeps the first applicable blocker visible ahead of engine readiness', () => {
    seedPlanStore();
    render(<PlanStage engineReady={false} />);
    fireEvent.change(screen.getByLabelText('Grouping Variable'), { target: { value: '' } });
    const run = screen.getByTestId('plan-run-statistics');
    expect(run.getAttribute('aria-disabled')).toBe('true');
    expect(run.getAttribute('title')).toBe('Choose a grouping variable');
    expect(screen.getByText('Choose a grouping variable')).toBeTruthy();
    fireEvent.click(run);
    expect(runTable1).not.toHaveBeenCalled();
  });

  it('uses the engine reason once the plan has no earlier blocker', () => {
    seedPlanStore();
    render(<PlanStage engineReady={false} />);
    const groupWarning = screen.queryByLabelText('I acknowledge this group size warning and want to proceed');
    if (groupWarning) fireEvent.click(groupWarning);
    const run = screen.getByTestId('plan-run-statistics');
    expect(run.getAttribute('aria-disabled')).toBe('true');
    expect(run.getAttribute('title')).toBe('Waiting for the analysis engine to finish starting…');
  });

  it.each(['none', 'bonferroni', 'holm', 'bh'] as const)('round-trips the %s multiple-testing choice', async (correction) => {
    seedPlanStore();
    render(<PlanStage />);
    fireEvent.change(screen.getByLabelText('Multiple Testing Correction'), { target: { value: correction } });
    const groupWarning = screen.queryByLabelText('I acknowledge this group size warning and want to proceed');
    if (groupWarning) fireEvent.click(groupWarning);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));
    await waitFor(() => expect(useStore.getState().plan?.multipleTestingCorrection).toBe(correction));
  });

  it('cancels an in-flight analysis when Back is clicked', async () => {
    seedPlanStore();
    vi.mocked(runTable1).mockReturnValueOnce(new Promise(() => {}));
    render(<PlanStage />);
    const groupWarning = screen.queryByLabelText('I acknowledge this group size warning and want to proceed');
    if (groupWarning) fireEvent.click(groupWarning);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));
    await screen.findByText('Computing Table 1 in your browser…');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(useStore.getState().stage).toBe(5);
  });
});
