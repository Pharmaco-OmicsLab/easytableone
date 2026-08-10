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

    fireEvent.click(screen.getByLabelText('Custom...'));
    fireEvent.change(screen.getByPlaceholderText('Type one group label per line'), {
      target: { value: 'group2\nunknown-group\ngroup1' },
    });

    const preview = screen.getByText('Table Column Order Preview').parentElement as HTMLElement;
    const previewText = preview.textContent ?? '';
    expect(previewText.indexOf('Second group')).toBeLessThan(previewText.indexOf('unknown-group'));
    expect(previewText.indexOf('unknown-group')).toBeLessThan(previewText.indexOf('First group'));
    expect(preview.textContent).toContain('unknown-group (n=0)');

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

    expect(screen.getByText(/For binary variables, "Displayed level" chooses which of the two levels/)).toBeTruthy();
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

    fireEvent.click(screen.getByRole('button', { name: 'Report standardised differences only' }));
    expect(screen.queryByText(/You have declared a randomised design/)).toBeNull();

    const ackCheckbox = screen.getByLabelText('I acknowledge this group size warning and want to proceed');
    fireEvent.click(ackCheckbox);
    fireEvent.click(screen.getByRole('button', { name: 'Run Statistics' }));

    await waitFor(() => {
      expect(useStore.getState().plan?.studyDesign).toBe('randomized_trial');
      expect(useStore.getState().plan?.userOverrides?.hidePValueColumn).toBe(true);
    });
  });

  it('dismisses the Plan-stage advisory without writing an override', () => {
    seedPlanStore();
    useStore.setState({ studyDesign: 'randomized_trial' } as any);
    render(<PlanStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Keep P values' }));

    expect(screen.queryByText(/You have declared a randomised design/)).toBeNull();
    expect(useStore.getState().plan?.userOverrides?.hidePValueColumn).toBeUndefined();
  });
});
