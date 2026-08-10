import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import QAStage from './QAStage';
import { useStore } from '../../store';
import type { DataQualityFinding } from '../../core/types';
import { TABLE1_MISSING_DATA_SIGNPOST } from '../../core/education/educationContent';

let mockedFindings: DataQualityFinding[] = [];

vi.mock('../../core/qa/checkRegistry', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    runChecks: vi.fn((stage) => {
      if (stage === "data-review") {
        return mockedFindings;
      }
      return [];
    })
  };
});

function seedStoreWithQAReport(findings: DataQualityFinding[] = []) {
  mockedFindings = findings;
  useStore.setState({
    stage: 5,
    file: { name: 'test.xlsx' } as any,
    sheets: [{ name: 'Sheet1' }],
    selectedSheet: 'Sheet1',
    headerRowIndex: 0,
    data: {
      columns: [{ name: 'colA' }],
      rows: [[1], [2]],
      meta: {
        sourceFile: "test.xlsx",
        parseWarnings: [],
        locale: { decimalSeparator: "." as const, thousandSeparator: "," as const },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        confirmedType: 'continuous',
        encoding: "utf-8",
        missingSentinels: []
      }
    } as any,
    schema: {
      columns: [
        {
          name: 'colA',
          inferredType: 'continuous',
          confirmedType: 'continuous',
          cardinalityTier: 'ok',
        }
      ]
    } as any,
    qaReport: {
      blockingErrors: [],
      columns: [
        {
          name: 'colA',
          missingCount: 0,
          missingPercent: 0,
          cardinality: 2,
          flags: [],
        }
      ]
    } as any,
    outlierActions: {},
    plan: null,
    stats: null,
    journalId: 'NEJM',
    error: null,
    includeInputDataHashInRepro: false,
    auditLog: [],
    dataQualityFindings: findings,
    setDataQualityFindings: (findings: any) => useStore.setState({ dataQualityFindings: findings }),
    dataQualityRecords: [],
    setDataQualityRecords: (records: any) => useStore.setState({ dataQualityRecords: records }),
    setStage: (stage: any) => useStore.setState({ stage }),
  } as any);
}

describe('QAStage — Layout & Actions (Round 8b)', () => {
  it('details section is expanded by default when QA content exists and can be toggled closed', () => {
    seedStoreWithQAReport([]);
    render(<QAStage />);

    expect(screen.getByText("Column")).toBeDefined();

    const toggleBtn = screen.getByText("QA / QC Details");
    fireEvent.click(toggleBtn);

    expect(screen.queryByText("Column")).toBeNull();
  });

  it('Proceed button is disabled if a blocking finding is present', () => {
    const blockingFinding: DataQualityFinding = {
      checkId: "noDataRows",
      tier: "blocking",
      category: "format",
      title: "No Data Rows",
      detail: "The sheet contains no data rows.",
      remedy: "Add rows."
    };

    seedStoreWithQAReport([blockingFinding]);
    render(<QAStage />);

    const proceedText = screen.getByText("Resolve blocking issues to proceed");
    expect(proceedText).toBeDefined();
    const actionBtn = screen.getByText("Acknowledge all and proceed");
    expect(actionBtn.getAttribute("disabled")).toBe("");
  });

  it('shows unresolved date columns only in the actionable Data Quality Gate panel', () => {
    const dateFinding: DataQualityFinding = {
      checkId: "unresolvedDateColumn_colA",
      tier: "blocking",
      category: "format",
      variable: "colA",
      title: "Unresolved Date Column",
      detail: "Column 'colA' contains date values.",
      requirement: "EasyTableOne requires pre-processed inputs.",
      remedy: "Exclude this column in the Variable types step, or pre-process and re-upload.",
    };

    seedStoreWithQAReport([dateFinding]);
    render(<QAStage />);

    expect(screen.getByText("Blocking Issues (1)")).toBeDefined();
    expect(screen.getByText("Exclude Column")).toBeDefined();
    expect(screen.getByText("Re-upload your corrected file →")).toBeDefined();
    expect(screen.queryByText("Blocking Errors")).toBeNull();
  });

  it('renders the EDA panel after the Polish Advisor slot and before QA details', () => {
    const polishFinding: DataQualityFinding = {
      checkId: "highMissingness_colA",
      tier: "review",
      category: "quality",
      variable: "colA",
      title: "Critical Missingness",
      detail: "Variable colA has 60% missingness.",
      remedy: "Acknowledge."
    };

    seedStoreWithQAReport([polishFinding]);
    render(<QAStage />);

    const text = document.body.textContent ?? "";
    expect(text.indexOf("Data Quality Gate")).toBeLessThan(text.indexOf("Exploratory Data Analysis"));
    expect(text.indexOf("Exploratory Data Analysis")).toBeLessThan(text.indexOf("QA / QC Details"));
  });

  it('renders Round 9 decision explainers for QA gates and sanity bounds', () => {
    seedStoreWithQAReport([]);
    render(<QAStage />);
    expect(screen.getByTestId('decision-explainer-qa.gates')).toBeTruthy();
    expect(screen.getByTestId('decision-explainer-qa.sanity-bounds')).toBeTruthy();
  });

  it('renders the canonical Table 1 missing-data signpost', () => {
    seedStoreWithQAReport([]);
    render(<QAStage />);

    expect(screen.getByLabelText(TABLE1_MISSING_DATA_SIGNPOST)).toBeDefined();
    expect(screen.getByText('available-case')).toBeDefined();
    expect(screen.getByText('complete-case')).toBeDefined();
    expect(screen.getByText('imputation')).toBeDefined();
  });

  it('Acknowledge button is shown and can proceed when review finding is present', () => {
    const reviewFinding: DataQualityFinding = {
      checkId: "highMissingness_colA",
      tier: "review",
      category: "quality",
      variable: "colA",
      title: "Critical Missingness",
      detail: "Variable colA has 60% missingness.",
      remedy: "Acknowledge."
    };

    seedStoreWithQAReport([reviewFinding]);
    render(<QAStage />);

    // Proceed button shows "I acknowledge these issues..."
    const ackBtn = screen.getByText("I acknowledge these issues and want to proceed");
    expect(ackBtn).toBeDefined();

    // Click it to acknowledge
    fireEvent.click(ackBtn);
    
    // Now the button should transition to "Proceed"
    const proceedBtn = screen.getByText("Proceed");
    expect(proceedBtn).toBeDefined();
    
    // Click Proceed
    fireEvent.click(proceedBtn);

    // Check stage changes to 6 (PlanStage)
    const state = useStore.getState();
    expect(state.stage).toBe(6);
  });
});
