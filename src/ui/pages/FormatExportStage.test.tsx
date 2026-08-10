import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FormatExportStage from './FormatExportStage';
import { useStore } from '../../store';
import { pyodideClient } from '../../workers/pyodide.client';
import { exportDocx } from '../../core/export/docx';
import { vegaLiteSpecToPng } from '../../core/export/vegaRender';
import { APP_VERSION } from '../../core/appVersion';

vi.mock('../../core/export/docx', () => ({
  exportDocx: vi.fn(async () => new Blob(['docx'])),
}));

vi.mock('../../core/export/vegaRender', () => ({
  vegaLiteSpecToPng: vi.fn(async () => 'dmVnYQ=='),
}));

vi.mock('../../workers/pyodide.client', () => ({
  pyodideClient: {
    isReady: vi.fn(async () => true),
    renderPublicationFigure: vi.fn(async () => 'cGxvdA=='),
    exportModelingData: vi.fn(async () => ({
      modelInputMatrix: [{ row_index: 0, outcome: 1, age: 2 }],
      lrPredictedProbabilities: [],
      mlOofPredictions: [],
      mlRocCurve: [],
      mlCalibration: [],
      mlVariableImportance: [],
      mlMetrics: [],
    })),
  },
}));

function seedExportStore() {
  useStore.setState({
    stage: 8,
    schema: {
      columns: [
        { name: 'colA', inferredType: 'categorical_nominal', confirmedType: 'binary', cardinalityTier: 'ok' },
        { name: 'age', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' },
      ]
    } as any,
    data: {
      columns: [{ name: 'colA' }, { name: 'age' }],
      rows: [['group1', 1], ['group2', 2]],
      meta: { sourceFile: 'test.xlsx' }
    } as any,
    stats: {
      perVariable: [
        {
          variable: 'age',
          summaryByGroup: {},
          overallSummary: { mean: 10, median: 10, n: 2 },
          test: { name: 'Student t-test', statistic: 1, pValue: 0.5 },
          notes: [],
          plotData: {
            type: 'continuous',
            raw: [{ group: 'group1', val: 1 }, { group: 'group2', val: 2 }],
            qq: { points: [{ group: 'group1', theoretical: 0, sample: 1 }], lines: [] },
          },
        },
      ],
      groups: [{ name: 'group1', n: 1 }, { name: 'group2', n: 1 }],
      totalN: 2,
      computeMetadata: { libVersions: {}, seed: 42 }
    } as any,
    plan: {
      rulesetVersion: '1.3',
      appVersion: '1.0',
      groupingVariable: 'colA',
      includedVariables: ['age'],
      variableConfig: {},
      showSMD: false,
      showPValue: true,
      multipleTestingCorrection: 'none',
      randomSeed: 42,
      auditLog: []
    } as any,
    journalId: 'NEJM',
    dataQualityRecords: [],
    qaReport: {
      overallCompletenessPercent: 100,
      blockingErrors: [],
      columns: [{ name: 'age', missingCount: 0, missingPercent: 0, cardinality: 2, isConstant: false, flags: [] }],
    } as any,
    edaResults: {
      missingness: { perVariable: [{ name: 'age', displayLabel: 'Age', missingCount: 0, missingPct: 0 }], indicatorCorrelations: [], heatmapPng: null },
      correlations: { pairs: [], flagged: [], nContinuous: 1, variableOrder: ['age'] },
      bivariate: null,
      schemaFingerprint: 'age:continuous:',
      generatedAt: '2026-06-27T00:00:00.000Z',
    } as any,
    modelingResults: {
      schemaFingerprint: 'fp',
      generatedAt: '2026-06-29T00:00:00.000Z',
      setup: {
        outcome: 'colA',
        predictors: ['age'],
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
        comparison: [
          {
            model: 'RandomForest',
            auc: { mean: 0.7, sd: 0.02 },
            sens: { mean: 0.6, sd: 0.03 },
            spec: { mean: 0.8, sd: 0.04 },
            balacc: { mean: 0.7, sd: 0.02 },
          },
        ],
        models: [
          {
            name: 'RandomForest',
            metrics: {
              auc: { mean: 0.7, sd: 0.02 },
              sens: { mean: 0.6, sd: 0.03 },
              spec: { mean: 0.8, sd: 0.04 },
              balacc: { mean: 0.7, sd: 0.02 },
            },
            roc: { grid: [0, 1], mean: [0, 1], sd: [0, 0] },
            varImportance: [{ name: 'Age', score: 12 }],
            calibration: {
              slope: 0.9,
              intercept: 0.1,
              curve: [{ predicted: 0.2, observed: 0.25, n: 10 }],
              brier: 0.12,
            },
            confusion: { tp: 8, fp: 2, fn: 1, tn: 9 },
          },
        ],
      },
    } as any,
    setStage: (stage: any) => useStore.setState({ stage }),
  } as any);
}

function seedDictionaryFigureStore() {
  seedExportStore();
  useStore.setState({
    schema: {
      columns: [
        {
          name: 'colA',
          inferredType: 'categorical_nominal',
          confirmedType: 'binary',
          cardinalityTier: 'ok',
          levels: [
            { code: 'group1', label: 'Treatment' },
            { code: 'group2', label: 'Control' },
          ],
        },
        { name: 'age', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' },
        {
          name: 'severity',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
          levels: [
            { code: 0, label: 'Mild' },
            { code: '1.0', label: 'Severe' },
          ],
        },
      ],
    } as any,
    stats: {
      ...(useStore.getState().stats as any),
      perVariable: [
        ...(useStore.getState().stats as any).perVariable,
        {
          variable: 'severity',
          summaryByGroup: {},
          overallSummary: { counts: { 0: 1, 1: 1 }, n: 2 },
          test: { name: 'Chi-square', statistic: 1, pValue: 0.5 },
          notes: [],
          plotData: {
            type: 'categorical',
            raw: [
              { group: 'group1', val: '0.0' },
              { group: 'group2', val: '1' },
            ],
          },
        },
      ],
    } as any,
    plan: {
      ...(useStore.getState().plan as any),
      includedVariables: ['age', 'severity'],
    } as any,
  } as any);
}

describe('FormatExportStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => 'blob:mock') as any;
    URL.revokeObjectURL = vi.fn();
  });

  it('renders a Back button that returns to Stage 7', () => {
    seedExportStore();
    render(<FormatExportStage />);

    const backBtn = screen.getByRole('button', { name: 'Back' });
    expect(backBtn).toBeDefined();

    fireEvent.click(backBtn);

    const state = useStore.getState();
    expect(state.stage).toBe(7);
  });

  it('renders journal selection, preview, checkbox-model downloads, but not diagnostics review panel', () => {
    seedExportStore();
    render(<FormatExportStage />);

    expect(screen.getByLabelText('Select Journal Style')).toBeDefined();

    const checkbox = screen.getByRole('checkbox', { name: /Diagnostic plots as supplementary figures/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.getByRole('checkbox', { name: /EDA report appendix/i })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Download Word (.docx)' })).toBeDefined();
    expect(screen.queryByText('Download Word with plots (.docx)')).toBeNull();
    expect(screen.getByText(/Download All/)).toBeDefined();
    expect(screen.getByText('Download CSV')).toBeDefined();
    expect(screen.getByText('Download Excel (.xlsx)')).toBeDefined();
    expect(screen.getByText('Full report (single document)')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Download report (.html)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Download source (.md + figures)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Print / Save PDF' })).toBeDefined();
    expect(screen.getByText('Diagnostics (CSV/JSON)')).toBeDefined();
    expect(screen.getByText('Reproducible Python (.py)')).toBeDefined();
    expect(screen.getByText('Data quality report (.md)')).toBeDefined();
    expect(screen.getByText('Data quality report (.docx)')).toBeDefined();
    expect(screen.getByText('Data quality report (PDF)')).toBeDefined();
    expect(screen.getByText('EDA report (.html)')).toBeDefined();
    expect(screen.getByRole('checkbox', { name: /Modeling report appendix/i })).toBeDefined();
    expect(screen.getByText('Modeling report (.md)')).toBeDefined();
    expect(screen.getByText('Modeling report (.docx)')).toBeDefined();
    expect(screen.getByText('Download all modeling data (.zip)')).toBeDefined();
    expect(screen.getByText(/row-level modeling data/)).toBeDefined();
    const manuscriptSection = screen.getByTestId('manuscript-table-export');
    expect(within(manuscriptSection).getByText('Manuscript Word export')).toBeDefined();
    expect(within(manuscriptSection).getByRole('button', { name: 'Download Word (.docx)' })).toBeDefined();

    expect(screen.getByText('Live Preview')).toBeDefined();
    expect(screen.queryByText('Statistical Diagnostics')).toBeNull();
    expect(screen.queryByText('Per-variable details')).toBeNull();
    expect(screen.queryByText('toggle-diagnostics')).toBeNull();
  });

  it('renders Live Preview before Export Options', () => {
    seedExportStore();
    render(<FormatExportStage />);

    const preview = screen.getByText('Live Preview');
    const options = screen.getByText('Export Options');
    expect(
      Boolean(preview.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
  });

  it('renders Results Summary between Live Preview and Export Options', () => {
    seedExportStore();
    render(<FormatExportStage />);

    const preview = screen.getByText('Live Preview');
    const summary = screen.getByText('Results Summary');
    const options = screen.getByText('Export Options');

    expect(Boolean(preview.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
    expect(Boolean(summary.compareDocumentPosition(options) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });

  it('lets all Format and export sections collapse and expand', () => {
    seedExportStore();
    render(<FormatExportStage />);

    const sections = [
      { name: 'Select Journal Style', testId: 'select-journal-style-content' },
      { name: 'Journal Formatting Overrides', testId: 'journal-formatting-overrides-content' },
      { name: 'Live Preview', testId: 'live-preview-content' },
      { name: 'Export Options', testId: 'export-options-content' },
      { name: 'Results Summary', testId: 'results-summary-content' },
    ];

    for (const section of sections) {
      const button = screen.getByRole('button', { name: new RegExp(section.name) });
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(screen.queryByTestId(section.testId)).toBeDefined();

      fireEvent.click(button);
      expect(button.getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByTestId(section.testId)).toBeNull();

      fireEvent.click(button);
      expect(button.getAttribute('aria-expanded')).toBe('true');
      expect(screen.queryByTestId(section.testId)).toBeDefined();
    }
  });

  it('bypasses plot rendering when the checkbox is unchecked', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    expect(screen.queryByText('Supplementary Figures')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download Word (.docx)' }));

    await waitFor(() => {
      expect(pyodideClient.renderPublicationFigure).not.toHaveBeenCalled();
    });
  });

  it('renders supplementary preview and uses the themed plot export path when checkbox is checked', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Diagnostic plots as supplementary figures/i }));
    expect(screen.getByText('Supplementary Figures')).toBeDefined();
    expect(screen.getByText(/1 diagnostic plots will be appended/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Download Word (.docx)' }));

    await waitFor(() => {
      expect(pyodideClient.renderPublicationFigure).toHaveBeenCalled();
    });
    expect(pyodideClient.renderPublicationFigure).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'continuous' }),
      'histogram',
      expect.objectContaining({ color_palette: expect.arrayContaining(['#BC3C29']) })
    );
  });

  it('resolves dictionary labels before rendering DOCX diagnostic plots', async () => {
    seedDictionaryFigureStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Diagnostic plots as supplementary figures/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Word (.docx)' }));

    await waitFor(() => expect(pyodideClient.renderPublicationFigure).toHaveBeenCalled());
    expect(pyodideClient.renderPublicationFigure).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'continuous',
        raw: [
          { group: 'Treatment', val: 1 },
          { group: 'Control', val: 2 },
        ],
        qq: expect.objectContaining({
          points: [expect.objectContaining({ group: 'Treatment' })],
        }),
      }),
      'histogram',
      expect.anything(),
    );
    expect(pyodideClient.renderPublicationFigure).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'categorical',
        raw: [
          { group: 'Treatment', val: 'Mild' },
          { group: 'Control', val: 'Severe' },
        ],
      }),
      'barchart',
      expect.anything(),
    );
  });

  it('passes EDA results to Word export when EDA report appendix is checked', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /EDA report appendix/i }));
    expect(screen.getByText('Exploratory Data Analysis Report')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Download Word (.docx)' }));

    await waitFor(() => {
      expect(exportDocx).toHaveBeenCalledWith(
        expect.anything(),
        { appVersion: APP_VERSION },
        undefined,
        expect.objectContaining({ generatedAt: '2026-06-27T00:00:00.000Z' }),
        null,
        null
      );
    });
  });

  it('passes modeling results to Word export when modeling report appendix is checked', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Modeling report appendix/i }));
    expect(screen.getByText('Modeling Report')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Download Word (.docx)' }));

    await waitFor(() => {
      expect(exportDocx).toHaveBeenCalledWith(
        expect.anything(),
        { appVersion: APP_VERSION },
        undefined,
        null,
        expect.objectContaining({ generatedAt: '2026-06-29T00:00:00.000Z' }),
        null
      );
    });
  });

  it('passes methods summary inputs to Word export when methods summary appendix is checked', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Methods summary appendix/i }));
    expect(screen.getByText('Per-variable Methods Summary')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Download Word (.docx)' }));

    await waitFor(() => {
      expect(exportDocx).toHaveBeenCalledWith(
        expect.anything(),
        { appVersion: APP_VERSION },
        undefined,
        null,
        null,
        expect.objectContaining({
          stats: expect.anything(),
          schema: expect.anything(),
          plan: expect.anything(),
        })
      );
    });
  });

  it('keeps full report section toggles separate from manuscript Word appendix toggles', () => {
    seedExportStore();
    render(<FormatExportStage />);

    const fullMethods = screen.getByRole('checkbox', { name: 'Methods summary section' }) as HTMLInputElement;
    const wordMethods = screen.getByRole('checkbox', { name: /Methods summary appendix/i }) as HTMLInputElement;
    const fullRationale = screen.getByRole('checkbox', { name: 'Methods & rationale section' }) as HTMLInputElement;
    const wordRationale = screen.getByRole('checkbox', { name: /Methods & rationale explainer appendix/i }) as HTMLInputElement;

    fireEvent.click(fullMethods);
    fireEvent.click(fullRationale);

    expect(fullMethods.checked).toBe(true);
    expect(fullRationale.checked).toBe(true);
    expect(wordMethods.checked).toBe(false);
    expect(wordRationale.checked).toBe(false);
    expect(screen.queryByText('Per-variable Methods Summary')).toBeNull();
    expect(screen.queryByText('Methods & Rationale Explainer')).toBeNull();
  });

  it('selects and clears all enabled full-report checkboxes without changing the always-on Table 1 box', () => {
    seedExportStore();
    render(<FormatExportStage />);

    const fullReportCard = screen.getByText('Full report (single document)').closest('div.mb-5') as HTMLElement;
    const table1 = within(fullReportCard).getByRole('checkbox', { name: 'Table 1 section' }) as HTMLInputElement;
    const dataQuality = within(fullReportCard).getByRole('checkbox', { name: 'Data quality section' }) as HTMLInputElement;
    const eda = within(fullReportCard).getByRole('checkbox', { name: 'EDA section' }) as HTMLInputElement;
    const modeling = within(fullReportCard).getByRole('checkbox', { name: 'Modeling section' }) as HTMLInputElement;
    const methods = within(fullReportCard).getByRole('checkbox', { name: 'Methods summary section' }) as HTMLInputElement;
    const education = within(fullReportCard).getByRole('checkbox', { name: 'Methods & rationale section' }) as HTMLInputElement;

    fireEvent.click(within(fullReportCard).getByRole('button', { name: 'Select all' }));
    expect(table1.checked).toBe(true);
    expect(table1.disabled).toBe(true);
    expect(dataQuality.checked).toBe(true);
    expect(eda.checked).toBe(true);
    expect(modeling.checked).toBe(true);
    expect(methods.checked).toBe(true);
    expect(education.checked).toBe(true);

    fireEvent.click(within(fullReportCard).getByRole('button', { name: 'Clear all' }));
    expect(table1.checked).toBe(true);
    expect(dataQuality.checked).toBe(false);
    expect(eda.checked).toBe(false);
    expect(modeling.checked).toBe(false);
    expect(methods.checked).toBe(false);
    expect(education.checked).toBe(false);
  });

  it('selects and clears enabled manuscript Word checkboxes while skipping disabled options', () => {
    seedExportStore();
    useStore.setState({ edaResults: null, modelingResults: null } as any);
    render(<FormatExportStage />);

    const manuscriptSection = screen.getByTestId('manuscript-table-export');
    const plots = within(manuscriptSection).getByRole('checkbox', { name: /Diagnostic plots as supplementary figures/i }) as HTMLInputElement;
    const methods = within(manuscriptSection).getByRole('checkbox', { name: /Methods summary appendix/i }) as HTMLInputElement;
    const education = within(manuscriptSection).getByRole('checkbox', { name: /Methods & rationale explainer appendix/i }) as HTMLInputElement;
    const eda = within(manuscriptSection).getByRole('checkbox', { name: /EDA report appendix/i }) as HTMLInputElement;

    fireEvent.click(within(manuscriptSection).getByRole('button', { name: 'Select all' }));
    expect(plots.checked).toBe(true);
    expect(methods.checked).toBe(true);
    expect(education.checked).toBe(true);
    expect(eda.disabled).toBe(true);
    expect(eda.checked).toBe(false);
    expect(within(manuscriptSection).queryByRole('checkbox', { name: /Modeling report appendix/i })).toBeNull();

    fireEvent.click(within(manuscriptSection).getByRole('button', { name: 'Clear all' }));
    expect(plots.checked).toBe(false);
    expect(methods.checked).toBe(false);
    expect(education.checked).toBe(false);
    expect(eda.checked).toBe(false);
  });

  it('renders publication figure ZIP controls and uses selected format settings', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    expect(screen.getByText('Figure export')).toBeDefined();
    fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'svg' } });
    fireEvent.change(screen.getByLabelText('DPI'), { target: { value: '600' } });
    fireEvent.change(screen.getByLabelText('Font scale'), { target: { value: '1.4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download figures (.zip)' }));

    await waitFor(() => expect(pyodideClient.renderPublicationFigure).toHaveBeenCalled());
    expect(pyodideClient.renderPublicationFigure).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'continuous' }),
      'histogram',
      expect.anything(),
      6,
      4,
      600,
      'svg',
      1.4
    );
  });

  it('resolves dictionary labels before rendering figure ZIP and unified-report assets', async () => {
    seedDictionaryFigureStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Download figures (.zip)' }));

    await waitFor(() => expect(pyodideClient.renderPublicationFigure).toHaveBeenCalled());
    expect(pyodideClient.renderPublicationFigure).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'categorical',
        raw: [
          { group: 'Treatment', val: 'Mild' },
          { group: 'Control', val: 'Severe' },
        ],
      }),
      'barchart',
      expect.anything(),
      6,
      4,
      expect.any(Number),
      'png',
      1,
    );
  });

  it('keeps raw plot-data codes when no dictionary is present', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Download figures (.zip)' }));

    await waitFor(() => expect(pyodideClient.renderPublicationFigure).toHaveBeenCalled());
    expect(pyodideClient.renderPublicationFigure).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'continuous',
        raw: [{ group: 'group1', val: 1 }, { group: 'group2', val: 2 }],
      }),
      'histogram',
      expect.anything(),
      6,
      4,
      expect.any(Number),
      'png',
      1,
    );
  });

  it('keeps Download All available', () => {
    seedExportStore();
    render(<FormatExportStage />);

    expect(screen.getByRole('button', { name: /Download All/ })).toBeDefined();
  });

  it('toggles per-variable missing-data rows into the live preview', () => {
    seedExportStore();
    useStore.setState({
      stats: {
        ...useStore.getState().stats!,
        perVariable: [
          {
            ...useStore.getState().stats!.perVariable[0],
            summaryByGroup: {
              group1: { mean: 10, median: 10, n: 1 },
            },
          },
        ],
      } as any,
      qaReport: {
        overallCompletenessPercent: 50,
        blockingErrors: [],
        columns: [{ name: 'age', missingCount: 1, missingPercent: 50, cardinality: 2, isConstant: false, flags: [] }],
      } as any,
    } as any);
    render(<FormatExportStage />);

    expect(screen.queryByText('Missing, n (%)')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: /Show a per-variable missing-data row/i }));

    expect(useStore.getState().plan?.userOverrides?.showMissingDataRows).toBe(true);
    expect(screen.getByText('Missing, n (%)')).toBeDefined();
    expect(screen.getByText('1 (100%)')).toBeDefined();
  });

  it('hides modeling data download controls when modeling has not run', () => {
    seedExportStore();
    useStore.setState({ modelingResults: null } as any);
    render(<FormatExportStage />);

    expect(screen.queryByText('Download all modeling data (.zip)')).toBeNull();
    expect(screen.queryByText(/row-level modeling data/)).toBeNull();
  });

  it('downloads modeling data zip on demand', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Download all modeling data (.zip)' }));

    await waitFor(() => {
      expect(pyodideClient.exportModelingData).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
    });
  });

  it('downloads the unified HTML report from the selected full-report sections', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Data quality section' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'EDA section' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download report (.html)' }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const blob = (URL.createObjectURL as any).mock.calls.at(-1)[0] as Blob;
    const html = await blob.text();
    expect(html).toContain('Unified EasyTableOne final report');
    expect(html).toContain('Data Quality Report');
    expect(html).toContain('Exploratory Data Analysis');
    expect(html).toContain('Formal Table 1');
    expect(html).toContain('Diagnostic and publication figures');
    expect(html).toContain('data:image/png;base64,cGxvdA==');
    expect(html).toContain('toc-rail');
  });

  it('downloads unified Markdown source with EDA, diagnostic, and modeling figure files in a zip', async () => {
    seedExportStore();
    useStore.setState({
      edaResults: {
        ...(useStore.getState().edaResults as any),
        missingness: {
          ...(useStore.getState().edaResults as any).missingness,
          heatmapPng: 'aGVhdG1hcA==',
        },
      },
    } as any);
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'EDA section' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Modeling section' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download source (.md + figures)' }));

    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const blob = (URL.createObjectURL as any).mock.calls.at(-1)[0] as Blob;
    const zip = await JSZip.loadAsync(blob);
    const markdown = await zip.file('report.md')?.async('string');

    expect(markdown).toContain('figures/eda-missingness.png');
    expect(markdown).toContain('figures/diagnostic-age_histogram.png');
    expect(markdown).toContain('figures/modeling-roc.png');
    expect(markdown).toContain('figures/modeling-RandomForest-calibration.png');
    expect(markdown).not.toContain('asset:eda-missingness');
    expect(zip.file('figures/eda-missingness.png')).toBeDefined();
    expect(zip.file('figures/diagnostic-age_histogram.png')).toBeDefined();
    expect(zip.file('figures/modeling-roc.png')).toBeDefined();
    expect(zip.file('figures/modeling-RandomForest-calibration.png')).toBeDefined();
  });

  it('caches unified report diagnostic figures across repeat exports and invalidates on journal change', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('button', { name: 'Download report (.html)' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(pyodideClient.renderPublicationFigure).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Download report (.html)' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
    expect(pyodideClient.renderPublicationFigure).toHaveBeenCalledTimes(2);

    fireEvent.change(screen.getByLabelText('Select Journal Style'), { target: { value: 'JAMA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Download report (.html)' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(3));
    expect(pyodideClient.renderPublicationFigure).toHaveBeenCalledTimes(4);
  });

  it('caches modeling figure rendering across repeat unified report exports', async () => {
    seedExportStore();
    render(<FormatExportStage />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Modeling section' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download report (.html)' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(vegaLiteSpecToPng).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('button', { name: 'Download report (.html)' }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(2));
    expect(vegaLiteSpecToPng).toHaveBeenCalledTimes(3);
  });
});
