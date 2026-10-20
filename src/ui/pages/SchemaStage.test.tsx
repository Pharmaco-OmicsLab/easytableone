import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import SchemaStage from './SchemaStage';
import { useStore } from '../../store';
import { SchemaColumnSchema } from '../../core/types';
import { generateReproducibilityJson } from '../../core/export/reproducibilityJson';
import { dismissedMissingCodesFingerprints } from '../components/MissingCodesPanel';

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
  it('search filters rendered rows by display label without changing the store', () => {
    seedStoreWithSchema();
    const before = JSON.stringify(useStore.getState().schema);
    render(<SchemaStage />);
    fireEvent.change(screen.getByTestId('schema-search'), { target: { value: 'gestational' } });
    expect(screen.getByLabelText('Display label for [b1]GA')).toBeTruthy();
    expect(screen.queryByLabelText('Display label for plain_col')).toBeNull();
    expect(JSON.stringify(useStore.getState().schema)).toBe(before);
  });

  it('filter hides excluded rows without changing the store', () => {
    seedStoreWithSchema();
    useStore.getState().updateSchemaColumn('plain_col', { exclusionReason: 'Manually excluded' });
    const before = JSON.stringify(useStore.getState().schema);
    render(<SchemaStage />);
    fireEvent.click(screen.getByRole('button', { name: /Excluded/ }));
    expect(screen.getByLabelText('Display label for plain_col')).toBeTruthy();
    expect(screen.queryByLabelText('Display label for [b1]GA')).toBeNull();
    expect(JSON.stringify(useStore.getState().schema)).toBe(before);
  });

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
    const excludeBtns = screen.getAllByRole('button', { name: "Exclude" });
    // Expect Exclude button for both columns since they are not excluded
    expect(excludeBtns).toHaveLength(2);

    // Click exclude on the first column
    fireEvent.click(excludeBtns[0]);
    expect(useStore.getState().schema?.columns[0].exclusionReason).toBe('Manually excluded');

    // Click restore
    const restoreBtn = screen.getByRole('button', { name: 'Re-include' });
    fireEvent.click(restoreBtn);
    expect(useStore.getState().schema?.columns[0].exclusionReason).toBeUndefined();
  });

  it('renders a high-cardinality review message once while preserving badge accessibility (D98)', () => {
    seedStoreWithSchema();
    useStore.setState({
      schema: {
        columns: [
          {
            name: 'free_text_category',
            inferredType: 'categorical_nominal',
            confirmedType: 'categorical_nominal',
            cardinalityTier: 'flag',
            distinctCount: 25,
          },
        ],
      },
    } as any);

    render(<SchemaStage />);

    const message = '25 distinct values exceeds the 20-level threshold for a category. If this is a measurement, switch the type to "Numeric"; if it is an identifier or free text, exclude it.';
    expect(screen.getAllByText(message)).toHaveLength(1);
    const badge = screen.getByLabelText(/Variable type status Needs review/);
    expect(badge.getAttribute('title')).toContain(message);
    expect(badge.getAttribute('aria-label')).toContain(message);
    expect(document.body.textContent).not.toContain('High');
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

  it('uses continuous-column values and units without persisting them in the schema', () => {
    useStore.setState({
      stage: 4,
      file: null, sheets: [], selectedSheet: null, headerRowIndex: 0,
      data: {
        columns: [{ originalName: 'bilirubin', name: 'bilirubin' }],
        rows: [[2.1], [5.9], [12.4]],
        meta: { sourceFile: 'study.csv', parseWarnings: [], locale: { decimalSeparator: '.', thousandSeparator: ',' }, detectedHeaderRow: 0, confirmedHeaderRow: 0, encoding: 'utf-8', missingSentinels: [] },
      },
      schema: { columns: [{ name: 'bilirubin', displayLabel: 'Total bilirubin at admission', units: 'µmol/L', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' }] },
      qaReport: null, outlierActions: {}, plan: null, stats: null, journalId: 'NEJM', error: null, includeInputDataHashInRepro: false, auditLog: [],
    } as any);

    render(<SchemaStage />);

    expect(screen.getByText(/Total bilirubin at admission: e.g. 2.1, 5.9, 12.4 µmol\/L/)).toBeDefined();
    expect(document.body.textContent).not.toContain('age in years');
    expect(SchemaColumnSchema.keyof().options).not.toEqual(expect.arrayContaining(['exampleValues', 'sampleValues', 'uniqueValues']));

    const reproducibilityJson = generateReproducibilityJson({
      plan: { groupingVariable: 'group' } as any,
      schema: useStore.getState().schema as any,
      results: { computeMetadata: { libVersions: {} }, perVariable: [] } as any,
      formattedTable: { journal: 'NEJM', rulesetVersion: 'test' } as any,
      appVersion: 'test', timestamp: '2026-08-20T00:00:00.000Z',
    });
    expect(reproducibilityJson).not.toContain('2.1');
    expect(reproducibilityJson).not.toContain('5.9');
    expect(reproducibilityJson).not.toContain('12.4');
  });

  it('falls back to the static continuous example when a column has no non-null values', () => {
    useStore.setState({
      stage: 4,
      file: null, sheets: [], selectedSheet: null, headerRowIndex: 0,
      data: {
        columns: [{ originalName: 'empty_measurement', name: 'empty_measurement' }],
        rows: [[null], [null]],
        meta: { sourceFile: 'study.csv', parseWarnings: [], locale: { decimalSeparator: '.', thousandSeparator: ',' }, detectedHeaderRow: 0, confirmedHeaderRow: 0, encoding: 'utf-8', missingSentinels: [] },
      },
      schema: { columns: [{ name: 'empty_measurement', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' }] },
      qaReport: null, outlierActions: {}, plan: null, stats: null, journalId: 'NEJM', error: null, includeInputDataHashInRepro: false, auditLog: [],
    } as any);

    render(<SchemaStage />);
    expect(screen.getByText(/age in years/)).toBeDefined();
  });

  it('does not render the static age example for the 79-column study schema', () => {
    const columns = Array.from({ length: 79 }, (_, index) => ({
      name: `measurement_${index + 1}`,
      inferredType: 'continuous' as const,
      confirmedType: 'continuous' as const,
      cardinalityTier: 'ok' as const,
    }));
    useStore.setState({
      stage: 4,
      file: null, sheets: [], selectedSheet: null, headerRowIndex: 0,
      data: {
        columns: columns.map((column) => ({ originalName: column.name, name: column.name })),
        rows: [columns.map((_, index) => index + 0.1)],
        meta: { sourceFile: 'study.csv', parseWarnings: [], locale: { decimalSeparator: '.', thousandSeparator: ',' }, detectedHeaderRow: 0, confirmedHeaderRow: 0, encoding: 'utf-8', missingSentinels: [] },
      },
      schema: { columns }, qaReport: null, outlierActions: {}, plan: null, stats: null, journalId: 'NEJM', error: null, includeInputDataHashInRepro: false, auditLog: [],
    } as any);

    render(<SchemaStage />);
    expect(document.body.textContent).not.toContain('age in years');
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
    expect(screen.getByText(/Excluded from Table 1/)).toBeDefined();
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

    expect(screen.getAllByText(/confirm this is a category, not a measurement/).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/Variable type status Check/)).toBeDefined();
    expect(document.body.textContent).not.toContain('Continuous');
    expect(document.body.textContent).not.toContain('SpO2');
    expect(screen.getByRole('button', { name: 'Proceed' }).getAttribute('aria-disabled')).toBeNull();

    const typeSelect = Array.from(container.querySelectorAll('select')).find(
      (select) => (select as HTMLSelectElement).value === 'categorical_nominal',
    ) as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'continuous' } });

    expect(useStore.getState().schema?.columns[0].confirmedType).toBe('continuous');
    expect(screen.queryByLabelText(/Variable type status Check/)).toBeNull();
    expect(screen.queryByLabelText(/Variable type status OK/)).toBeNull();

    fireEvent.change(typeSelect, { target: { value: 'categorical_nominal' } });
    expect(useStore.getState().schema?.columns[0].confirmedType).toBe('categorical_nominal');
    expect(screen.getByLabelText(/Variable type status Check/)).toBeDefined();
  });

  it('blocks Proceed accessibly for ambiguous columns and advances after resolution', () => {
    const setStage = vi.fn((stage: number) => useStore.setState({ stage }));
    useStore.setState({
      stage: 4,
      data: { columns: [{ originalName: 'risk_code', name: 'risk_code' }], rows: [[1], [2]], meta: { sourceFile: 'x.csv', parseWarnings: [], locale: { decimalSeparator: '.', thousandSeparator: ',' }, detectedHeaderRow: 0, confirmedHeaderRow: 0, encoding: 'utf-8', missingSentinels: [] } },
      schema: { columns: [{ name: 'risk_code', inferredType: 'numeric_encoded_categorical_ambiguous', confirmedType: 'numeric_encoded_categorical_ambiguous', cardinalityTier: 'ok' }] },
      setStage,
    } as any);
    render(<SchemaStage />);
    const proceed = screen.getByTestId('schema-proceed');
    expect(proceed.getAttribute('aria-disabled')).toBe('true');
    const status = document.getElementById(proceed.getAttribute('aria-describedby')!);
    expect(status?.textContent).toContain('risk_code');
    fireEvent.click(proceed);
    expect(setStage).not.toHaveBeenCalled();
    expect(useStore.getState().stage).toBe(4);
    const typeSelect = document.querySelector('select.bg-red-50') as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'continuous' } });
    expect(proceed.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(proceed);
    expect(setStage).toHaveBeenCalledWith(5);
    expect(useStore.getState().stage).toBe(5);
  });

  it('bulk Cancel leaves every confirmed type unchanged and closes the dialog', () => {
    useStore.setState({ stage: 4, schema: { columns: [
      { name: 'a', inferredType: 'numeric_encoded_categorical_ambiguous', confirmedType: 'numeric_encoded_categorical_ambiguous', cardinalityTier: 'ok' },
      { name: 'b', inferredType: 'numeric_encoded_categorical_ambiguous', confirmedType: 'numeric_encoded_categorical_ambiguous', cardinalityTier: 'ok' },
    ] } } as any);
    render(<SchemaStage />);
    fireEvent.click(screen.getByRole('button', { name: 'Set all to Yes/No category (binary)' }));
    expect(screen.getByText(/Apply Yes\/No category \(binary\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(useStore.getState().schema?.columns.map((c) => c.confirmedType)).toEqual(['numeric_encoded_categorical_ambiguous', 'numeric_encoded_categorical_ambiguous']);
    expect(screen.queryByText(/Apply Yes\/No category \(binary\)/)).toBeNull();
  });

  it('ordinal Move up/down buttons produce the expected level order and disable boundaries', () => {
    useStore.setState({ stage: 4, schema: { columns: [{ name: 'severity', inferredType: 'categorical_ordinal', confirmedType: 'categorical_ordinal', cardinalityTier: 'ok', levels: [
      { code: 1, label: 'Mild', order: 0 }, { code: 2, label: 'Moderate', order: 1 }, { code: 3, label: 'Severe', order: 2 },
    ] }] } } as any);
    render(<SchemaStage />);
    expect((screen.getByRole('button', { name: 'Move Mild up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move Severe down' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Move Severe up' }));
    expect(useStore.getState().schema?.columns[0].levels?.map((l) => l.label)).toEqual(['Mild', 'Severe', 'Moderate']);
    fireEvent.click(screen.getByRole('button', { name: 'Move Mild down' }));
    expect(useStore.getState().schema?.columns[0].levels?.map((l) => l.label)).toEqual(['Severe', 'Mild', 'Moderate']);
  });

  describe('Possible missing-value codes panel (Step 4 - D102c)', () => {
    it('the panel is absent with no candidates', () => {
      dismissedMissingCodesFingerprints.clear();
      const df = {
        columns: [{ originalName: 'age', name: 'age' }],
        rows: [[20], [30], [40]],
        meta: {
          sourceFile: 'clean.csv',
          parseWarnings: [],
          locale: { decimalSeparator: '.' as const, thousandSeparator: ',' as const },
          detectedHeaderRow: 0,
          confirmedHeaderRow: 0,
          encoding: 'utf-8',
          missingSentinels: [],
        },
      };
      useStore.setState({
        stage: 4,
        data: df as any,
        schema: {
          columns: [
            {
              name: 'age',
              inferredType: 'continuous',
              confirmedType: 'continuous',
              cardinalityTier: 'ok',
            },
          ],
        } as any,
      });

      render(<SchemaStage />);
      expect(screen.queryByText('Possible missing-value codes')).toBeNull();
    });

    it('renders panel when candidates exist and nothing is pre-checked', () => {
      dismissedMissingCodesFingerprints.clear();
      const ages: any[] = [];
      for (let i = 0; i < 50; i++) ages.push([20 + Math.floor((i * 70) / 49)]);
      ages.push([999], [999]);

      const df = {
        columns: [{ originalName: 'age', name: 'age' }],
        rows: ages,
        meta: {
          sourceFile: 'ages.csv',
          parseWarnings: [],
          locale: { decimalSeparator: '.' as const, thousandSeparator: ',' as const },
          detectedHeaderRow: 0,
          confirmedHeaderRow: 0,
          encoding: 'utf-8',
          missingSentinels: [],
        },
      };
      useStore.setState({
        stage: 4,
        data: df as any,
        schema: {
          columns: [
            {
              name: 'age',
              inferredType: 'continuous',
              confirmedType: 'continuous',
              cardinalityTier: 'ok',
            },
          ],
        } as any,
      });

      render(<SchemaStage />);
      expect(screen.getByText('Possible missing-value codes')).toBeDefined();
      expect(screen.getByText(/Clinical datasets often record missing data as a code/)).toBeDefined();

      const checkbox = screen.getByRole('checkbox', { name: /999 — 2 rows/ }) as HTMLInputElement;
      expect(checkbox.checked).toBe(false);

      const btn = screen.getByRole('button', { name: 'Treat selected as missing' }) as HTMLButtonElement;
      expect(btn.disabled).toBe(true);
    });

    it("applying updates the row's type badge in place", () => {
      dismissedMissingCodesFingerprints.clear();
      const crValues: any[] = [];
      for (let i = 1; i <= 25; i++) {
        crValues.push([(0.6 + i * 0.1).toFixed(1)]);
        crValues.push([(0.6 + i * 0.1).toFixed(1)]);
      }
      crValues.push(['Unknown']);

      const df = {
        columns: [{ originalName: 'creatinine', name: 'creatinine' }],
        rows: crValues,
        meta: {
          sourceFile: 'cr.csv',
          parseWarnings: [],
          locale: { decimalSeparator: '.' as const, thousandSeparator: ',' as const },
          detectedHeaderRow: 0,
          confirmedHeaderRow: 0,
          encoding: 'utf-8',
          missingSentinels: [],
        },
      };
      useStore.setState({
        stage: 4,
        data: df as any,
        schema: {
          columns: [
            {
              name: 'creatinine',
              inferredType: 'unsupported',
              confirmedType: 'unsupported',
              cardinalityTier: 'flag',
              exclusionReason: 'Excluded by default - 26 unique values exceeds the 20-level threshold.',
            },
          ],
        } as any,
      });

      const { container } = render(<SchemaStage />);
      expect(screen.getByText('Possible missing-value codes')).toBeDefined();

      const selectBefore = container.querySelector('[data-testid="schema-type-select"]') as HTMLSelectElement;
      expect(selectBefore.value).toBe('unsupported');

      const checkbox = screen.getByRole('checkbox', { name: /Unknown — 1 row/ });
      fireEvent.click(checkbox);

      const btn = screen.getByRole('button', { name: 'Treat selected as missing' });
      expect((btn as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(btn);

      expect(screen.getByText(/✓ Unknown \(1 row\) recoded as missing/)).toBeDefined();

      const selectAfter = container.querySelector('[data-testid="schema-type-select"]') as HTMLSelectElement;
      expect(selectAfter.value).toBe('continuous');
    });

    it('after Dismiss all, the panel stays hidden when Stage 4 is revisited in the session', () => {
      dismissedMissingCodesFingerprints.clear();
      const df = {
        columns: [{ originalName: 'sex', name: 'sex' }],
        rows: [[1], [2], [9]],
        meta: {
          sourceFile: 'sex.csv',
          parseWarnings: [],
          locale: { decimalSeparator: '.' as const, thousandSeparator: ',' as const },
          detectedHeaderRow: 0,
          confirmedHeaderRow: 0,
          encoding: 'utf-8',
          missingSentinels: [],
        },
      };
      useStore.setState({
        stage: 4,
        data: df as any,
        schema: {
          columns: [
            {
              name: 'sex',
              inferredType: 'categorical_nominal',
              confirmedType: 'categorical_nominal',
              cardinalityTier: 'ok',
            },
          ],
        } as any,
      });

      const { unmount } = render(<SchemaStage />);
      expect(screen.getByText('Possible missing-value codes')).toBeDefined();

      const dismissLink = screen.getByText('Dismiss all');
      fireEvent.click(dismissLink);

      expect(screen.queryByText('Possible missing-value codes')).toBeNull();

      unmount();
      render(<SchemaStage />);
      expect(screen.queryByText('Possible missing-value codes')).toBeNull();
    });

    it('Phase 50 R5: units input has title="Shown in Table 1 row labels" unconditionally (Step 10)', () => {
      useStore.setState({
        stage: 4,
        schema: {
          columns: [
            {
              name: 'serum_creatinine',
              inferredType: 'continuous',
              confirmedType: 'continuous',
              cardinalityTier: 'ok',
              units: 'mg/dL',
            },
            {
              name: 'age',
              inferredType: 'continuous',
              confirmedType: 'continuous',
              cardinalityTier: 'ok',
            },
          ],
        } as any,
      });

      render(<SchemaStage />);
      const creatInput = screen.getByLabelText('Units for serum_creatinine') as HTMLInputElement;
      expect(creatInput.title).toBe('Shown in Table 1 row labels');
      expect(creatInput.value).toBe('mg/dL');

      const ageInput = screen.getByLabelText('Units for age') as HTMLInputElement;
      expect(ageInput.title).toBe('Shown in Table 1 row labels');
      expect(ageInput.value).toBe('');
    });
  });
});
