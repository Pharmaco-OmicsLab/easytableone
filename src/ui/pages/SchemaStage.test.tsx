import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SchemaStage from './SchemaStage';
import { useStore } from '../../store';

function seedStoreWithSchema() {
  useStore.setState({
    stage: 4,
    file: null,
    sheets: [],
    selectedSheet: null,
    headerRowIndex: 0,
    data: null,
    schema: {
      columns: [
        {
          name: '[b1]GA',
          inferredType: 'continuous',
          confirmedType: 'continuous',
          cardinalityTier: 'ok',
          displayLabel: 'Gestational age',
          units: 'weeks',
        },
        {
          name: 'plain_col',
          inferredType: 'continuous',
          confirmedType: 'continuous',
          cardinalityTier: 'ok',
        },
      ],
    },
    qaReport: null,
    outlierActions: {},
    plan: null,
    stats: null,
    journalId: 'NEJM',
    error: null,
    includeInputDataHashInRepro: false,
    auditLog: [],
  });
}

describe('SchemaStage — display label & units (Step 7b.5.4)', () => {
  it('renders a prefilled display label input', () => {
    seedStoreWithSchema();
    render(<SchemaStage />);
    const input = screen.getByLabelText('Display label for [b1]GA') as HTMLInputElement;
    expect(input.value).toBe('Gestational age');
  });

  it('shows the bracket-stripped fallback as a placeholder hint when no displayLabel', () => {
    seedStoreWithSchema();
    render(<SchemaStage />);
    const input = screen.getByLabelText('Display label for plain_col') as HTMLInputElement;
    expect(input.value).toBe('');
    expect(input.placeholder).toBe('plain_col');
  });

  it('updates the store and records an audit entry when display label is changed', () => {
    seedStoreWithSchema();
    render(<SchemaStage />);
    const input = screen.getByLabelText('Display label for [b1]GA') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'Gestational age (wk)' } });
    fireEvent.blur(input);
    const state = useStore.getState();
    expect(state.schema?.columns[0].displayLabel).toBe('Gestational age (wk)');
    const audit = state.auditLog[state.auditLog.length - 1];
    expect(audit.action).toMatch(/changed display label for '\[b1\]GA'/);
    expect(audit.details.to).toBe('Gestational age (wk)');
    expect(audit.details.from).toBe('Gestational age');
  });

  it('records an audit entry when units are changed', () => {
    seedStoreWithSchema();
    render(<SchemaStage />);
    const input = screen.getByLabelText('Units for [b1]GA') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'days' } });
    fireEvent.blur(input);
    const state = useStore.getState();
    expect(state.schema?.columns[0].units).toBe('days');
    const audit = state.auditLog[state.auditLog.length - 1];
    expect(audit.action).toMatch(/changed units for '\[b1\]GA' from 'weeks' to 'days'/);
  });

  it('skips audit entry when value is unchanged', () => {
    seedStoreWithSchema();
    render(<SchemaStage />);
    const input = screen.getByLabelText('Display label for [b1]GA') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.blur(input);
    expect(useStore.getState().auditLog).toHaveLength(0);
  });

  it('table container has overflow-x-auto class to prevent row overflow (7d.3)', () => {
    seedStoreWithSchema();
    const { container } = render(<SchemaStage />);
    const tableWrapper = container.querySelector('table')?.parentElement;
    expect(tableWrapper?.className).toMatch(/overflow-x-auto/);
    expect(tableWrapper?.className).toMatch(/overflow-y-visible/);
    expect(tableWrapper?.className).not.toMatch(/max-h-\[62vh\]|overflow-auto/);
  });

  it('does not render "defaults to" helper text under Display Label inputs (7e.2)', () => {
    seedStoreWithSchema();
    render(<SchemaStage />);
    expect(document.body.textContent).not.toMatch(/defaults to/);
  });

  it('renders all six column headers (7e.2)', () => {
    seedStoreWithSchema();
    const { container } = render(<SchemaStage />);
    const ths = container.querySelectorAll('th');
    const headerTexts = Array.from(ths).map((th) => th.textContent?.trim().toLowerCase());
    expect(headerTexts.some((t) => t?.includes('raw column'))).toBe(true);
    expect(headerTexts.some((t) => t?.includes('display label'))).toBe(true);
    expect(headerTexts.some((t) => t?.includes('units'))).toBe(true);
    expect(headerTexts.some((t) => t?.includes('type'))).toBe(true);
    expect(headerTexts.some((t) => t?.includes('levels'))).toBe(true);
    expect(headerTexts.some((t) => t?.includes('status'))).toBe(true);
  });

  it('Raw Column cell has a title attribute for full-text tooltip (7e.2)', () => {
    seedStoreWithSchema();
    const { container } = render(<SchemaStage />);
    const rawTd = container.querySelector('td[title="[b1]GA"]');
    expect(rawTd).toBeTruthy();
  });

  it('renders Round 9 decision explainers for schema decisions', () => {
    seedStoreWithSchema();
    render(<SchemaStage />);
    expect(screen.getByTestId('decision-explainer-schema.type-inference')).toBeTruthy();
    expect(screen.getByTestId('decision-explainer-schema.reference-level')).toBeTruthy();
    expect(screen.getByTestId('decision-explainer-schema.ordinal-order')).toBeTruthy();
    expect(screen.getByTestId('decision-explainer-schema.exclusions')).toBeTruthy();
  });

  it('Type dropdown for ambiguous-numeric shows all leaf types (no cascade — 7f.5)', () => {
    useStore.setState({
      stage: 4,
      file: null, sheets: [], selectedSheet: null, headerRowIndex: 0, data: null,
      schema: {
        columns: [
          {
            name: '[h3]NEC',
            inferredType: 'numeric_encoded_categorical_ambiguous',
            confirmedType: 'numeric_encoded_categorical_ambiguous',
            cardinalityTier: 'ok',
          },
        ],
      },
      qaReport: null, outlierActions: {}, plan: null, stats: null,
      journalId: 'NEJM', error: null, includeInputDataHashInRepro: false, auditLog: [],
    } as any);
    const { container } = render(<SchemaStage />);
    // The ambiguous select is the one in the red-bg cell
    const ambiguousSelect = container.querySelector('select.bg-red-50') as HTMLSelectElement;
    expect(ambiguousSelect).toBeTruthy();
    const optionValues = Array.from(ambiguousSelect.options).map((o) => o.value);
    // Must include all leaf types — no two-step cascade
    expect(optionValues).toContain('continuous');
    expect(optionValues).toContain('binary');
    expect(optionValues).toContain('categorical_nominal');
    expect(optionValues).toContain('categorical_ordinal');
    expect(optionValues).toContain('id_like');
  });

  it('supports bulk assignment of ambiguous columns, revert, and reset to default', () => {
    useStore.setState({
      stage: 4,
      file: null, sheets: [], selectedSheet: null, headerRowIndex: 0, data: null,
      schema: {
        columns: [
          {
            name: '[h3]NEC',
            inferredType: 'numeric_encoded_categorical_ambiguous',
            confirmedType: 'numeric_encoded_categorical_ambiguous',
            cardinalityTier: 'ok',
          },
          {
            name: '[b1]GA',
            inferredType: 'continuous',
            confirmedType: 'continuous',
            cardinalityTier: 'ok',
          }
        ],
      },
      qaReport: null, outlierActions: {}, plan: null, stats: null,
      journalId: 'NEJM', error: null, includeInputDataHashInRepro: false, auditLog: [],
    } as any);

    render(<SchemaStage />);

    // Check that we can click the "Set all to Binary" button
    const setAllBinaryBtn = screen.getByRole('button', { name: 'Set all to Yes/No category (binary)' }) as HTMLButtonElement;
    expect(setAllBinaryBtn.disabled).toBe(false);

    fireEvent.click(setAllBinaryBtn);
    expect(screen.getByText(/Apply Yes\/No category \(binary\) to 1 unresolved column/)).toBeDefined();
    expect(screen.getAllByText('[h3]NEC').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Apply bulk change' }));

    // Verify type was updated in store
    expect(useStore.getState().schema?.columns[0].confirmedType).toBe('binary');
    expect(useStore.getState().schema?.columns[1].confirmedType).toBe('continuous'); // untouched

    // Check Revert button is now present
    const revertBtn = screen.getByRole('button', { name: 'Revert Bulk Action' });
    expect(revertBtn).toBeTruthy();

    // Click Revert
    fireEvent.click(revertBtn);
    expect(useStore.getState().schema?.columns[0].confirmedType).toBe('numeric_encoded_categorical_ambiguous');

    // Click Binary bulk again
    fireEvent.click(setAllBinaryBtn);
    fireEvent.click(screen.getByRole('button', { name: 'Apply bulk change' }));
    expect(useStore.getState().schema?.columns[0].confirmedType).toBe('binary');

    // Click Reset to Default
    const resetBtn = screen.getByRole('button', { name: 'Reset to Default' });
    fireEvent.click(resetBtn);
    expect(useStore.getState().schema?.columns[0].confirmedType).toBe('numeric_encoded_categorical_ambiguous');
  });

  it('renders Exclude button for all columns', () => {
    seedStoreWithSchema();
    render(<SchemaStage />);
    const excludeBtns = screen.getAllByRole('button', { name: "Exclude this variable" });
    // Expect Exclude button for both columns since they are not excluded
    expect(excludeBtns).toHaveLength(2);

    // Click exclude on the first column
    fireEvent.click(excludeBtns[0]);
    expect(useStore.getState().schema?.columns[0].exclusionReason).toBe('Manually excluded');

    // Click restore
    const restoreBtn = screen.getByRole('button', { name: 'Restore' });
    fireEvent.click(restoreBtn);
    expect(useStore.getState().schema?.columns[0].exclusionReason).toBeUndefined();
  });

  it('renders status guidance before the table action button', () => {
    seedStoreWithSchema();
    useStore.setState({
      schema: {
        columns: [
          {
            name: 'patient_id',
            inferredType: 'id_like',
            confirmedType: 'id_like',
            cardinalityTier: 'flag',
            distinctCount: 25,
          },
        ],
      },
    } as any);

    render(<SchemaStage />);

    const message = screen.getAllByText(/exceeds the 20-level threshold/).find((el) =>
      el.className.includes('text-gray-600'),
    ) as HTMLElement;
    const action = screen.getByRole('button', { name: "Exclude this variable" });
    expect(message.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(action.className).toContain('rounded');
    expect(action.className).toContain('border');
  });

  it('uses friendly type labels and recommended action without changing enum values', () => {
    useStore.setState({
      stage: 4,
      file: null, sheets: [], selectedSheet: null, headerRowIndex: 0, data: null,
      schema: {
        columns: [
          {
            name: 'coded_status',
            inferredType: 'categorical_nominal',
            confirmedType: 'numeric_encoded_categorical_ambiguous',
            cardinalityTier: 'flag',
          },
        ],
      },
      qaReport: null, outlierActions: {}, plan: null, stats: null,
      journalId: 'NEJM', error: null, includeInputDataHashInRepro: false, auditLog: [],
    } as any);

    render(<SchemaStage />);
    expect(screen.getByText('Recommended: Category (no order)')).toBeDefined();
    expect(screen.getByText(/blood type: A\/B\/O/)).toBeDefined();
    expect(document.body.textContent).not.toContain('CATEGORICAL_NOMINAL');
    fireEvent.click(screen.getByRole('button', { name: 'Use recommended' }));
    expect(useStore.getState().schema?.columns[0].confirmedType).toBe('categorical_nominal');
  });

  it('uses row-specific binary type examples instead of a static smoker example', () => {
    useStore.setState({
      stage: 4,
      file: null, sheets: [], selectedSheet: null, headerRowIndex: 0, data: null,
      schema: {
        columns: [
          {
            name: 'treatment',
            inferredType: 'binary',
            confirmedType: 'binary',
            cardinalityTier: 'ok',
            levels: [
              { code: 0, label: 'Placebo' },
              { code: 1, label: 'Drug A' },
            ],
          },
        ],
      },
      qaReport: null, outlierActions: {}, plan: null, stats: null,
      journalId: 'NEJM', error: null, includeInputDataHashInRepro: false, auditLog: [],
    } as any);

    render(<SchemaStage />);

    expect(screen.getByText(/treatment: Placebo\/Drug A/)).toBeDefined();
    expect(document.body.textContent).not.toContain('smoker: yes/no');
  });

  it('explains cardinality and excludes with a non-color cue', () => {
    seedStoreWithSchema();
    useStore.setState({
      schema: {
        columns: [
          {
            name: 'patient_id',
            inferredType: 'id_like',
            confirmedType: 'id_like',
            cardinalityTier: 'flag',
            exclusionReason: 'Manually excluded',
          },
        ],
      },
    } as any);
    render(<SchemaStage />);
    expect(screen.getByText(/excluded from Table 1/)).toBeDefined();
    expect(screen.queryByTitle(/No variable-type review issue/)).toBeNull();
  });

  it('derives the review badge/message and restores it after a type round trip', () => {
    useStore.setState({
      stage: 4,
      file: null,
      sheets: [],
      selectedSheet: null,
      headerRowIndex: 0,
      data: {
        columns: [{ originalName: 'ENVHOXY', name: 'ENVHOXY' }],
        rows: [[92], [93]],
        meta: {
          sourceFile: 'study.csv',
          parseWarnings: [],
          locale: { decimalSeparator: '.', thousandSeparator: ',' },
          detectedHeaderRow: 0,
          confirmedHeaderRow: 0,
          encoding: 'utf-8',
          missingSentinels: [],
        },
      },
      schema: {
        columns: [
          {
            name: 'ENVHOXY',
            inferredType: 'categorical_nominal',
            confirmedType: 'categorical_nominal',
            cardinalityTier: 'warn',
            distinctCount: 9,
            isWholeNumberNumeric: true,
            levels: [{ code: 92, label: '92' }, { code: 93, label: '93' }],
          },
        ],
      },
      qaReport: null,
      outlierActions: {},
      plan: null,
      stats: null,
      journalId: 'NEJM',
      error: null,
      includeInputDataHashInRepro: false,
      auditLog: [],
    } as any);

    const { container } = render(<SchemaStage />);

    expect(screen.getByText('Needs review')).toBeDefined();
    expect(screen.getAllByText(/confirm this is a category, not a measurement/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Variable type status Check/)).toBeDefined();
    expect(document.body.textContent).not.toContain('Continuous');
    expect(document.body.textContent).not.toContain('SpO2');
    expect((screen.getByRole('button', { name: 'Proceed' }) as HTMLButtonElement).disabled).toBe(false);

    const typeSelect = Array.from(container.querySelectorAll('select')).find(
      (select) => (select as HTMLSelectElement).value === 'categorical_nominal',
    ) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'continuous' } });

    expect(useStore.getState().schema?.columns[0].confirmedType).toBe('continuous');
    expect(screen.queryByText('Needs review')).toBeNull();
    expect(screen.queryByLabelText(/Variable type status Check/)).toBeNull();
    expect(screen.queryByLabelText(/Variable type status OK/)).toBeNull();

    fireEvent.change(typeSelect, { target: { value: 'categorical_nominal' } });
    expect(useStore.getState().schema?.columns[0].confirmedType).toBe('categorical_nominal');
    expect(screen.getByText('Needs review')).toBeDefined();
    expect(screen.getByLabelText(/Variable type status Check/)).toBeDefined();
  });
});
