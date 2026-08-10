import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import SchemaStage from '../src/ui/pages/SchemaStage';
import { useStore } from '../src/store';
import { generateReproducibilityJson } from '../src/core/export/reproducibilityJson';
import type { AnalysisPlan } from '../src/core/types';

function seedStore() {
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
}

const basePlan: AnalysisPlan = {
  rulesetVersion: '1.2',
  appVersion: '1.0',
  researchPopulation: 'adult',
  unitSystem: 'metric',
  groupingVariable: 'g',
  includedVariables: [],
  variableConfig: {},
  showSMD: false,
  showPValue: true,
  multipleTestingCorrection: 'none',
  randomSeed: 42,
  auditLog: [],
};

const baseFormattedTable = {
  journal: 'NEJM',
  rulesetVersion: '1.2',
  title: 'Table 1',
  header: [],
  rows: [],
  footnotes: [],
  methodsParagraph: '',
};

describe('SchemaStage e2e — manual edit → repro JSON (7d.5)', () => {
  beforeEach(() => {
    seedStore();
  });

  it('manual displayLabel edit appears in repro JSON schema and audit log', () => {
    render(<SchemaStage />);
    const input = screen.getByLabelText('Display label for [b1]GA') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'GA (weeks)' } });
    fireEvent.blur(input);

    const state = useStore.getState();
    const json = generateReproducibilityJson({
      plan: { ...basePlan, auditLog: state.auditLog },
      schema: state.schema!,
      results: { perVariable: [], groups: [], totalN: 0, computeMetadata: { libVersions: {}, seed: 42 } },
      formattedTable: baseFormattedTable,
      appVersion: '1.0',
    });
    const parsed = JSON.parse(json);

    expect(parsed.schema.columns[0].displayLabel).toBe('GA (weeks)');
    expect(parsed.analysisPlan.auditLog).toHaveLength(1);
    expect(parsed.analysisPlan.auditLog[0].action).toMatch(/changed display label for '\[b1\]GA'/);
    expect(parsed.analysisPlan.auditLog[0].details.to).toBe('GA (weeks)');
  });

  it('manual units edit appears in repro JSON schema and audit log', () => {
    render(<SchemaStage />);
    const input = screen.getByLabelText('Units for [b1]GA') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'days' } });
    fireEvent.blur(input);

    const state = useStore.getState();
    const json = generateReproducibilityJson({
      plan: { ...basePlan, auditLog: state.auditLog },
      schema: state.schema!,
      results: { perVariable: [], groups: [], totalN: 0, computeMetadata: { libVersions: {}, seed: 42 } },
      formattedTable: baseFormattedTable,
      appVersion: '1.0',
    });
    const parsed = JSON.parse(json);

    expect(parsed.schema.columns[0].units).toBe('days');
    expect(parsed.analysisPlan.auditLog).toHaveLength(1);
    expect(parsed.analysisPlan.auditLog[0].action).toMatch(/changed units for '\[b1\]GA'/);
    expect(parsed.analysisPlan.auditLog[0].details.to).toBe('days');
  });
});
