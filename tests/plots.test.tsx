import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import { VegaPlot } from '../src/ui/components/VegaPlot';
import { DiagnosticThumbnail } from '../src/ui/components/DiagnosticThumbnail';
import { DiagnosticsPanel } from '../src/ui/components/DiagnosticsPanel';
import type { Schema, StatisticalResults } from '../src/core/types';

// Mock vega-embed to avoid loading canvas/svg rendering in jsdom
vi.mock('vega-embed', () => {
  return {
    default: vi.fn().mockImplementation((container, spec, options) => {
      const mockView = {
        finalize: vi.fn(),
      };
      container.innerHTML = `<div data-testid="mock-vega-plot" data-spec='${JSON.stringify(spec)}'></div>`;
      return Promise.resolve({ view: mockView });
    })
  };
});

describe('Plots Toolchain UI Components', () => {
  beforeAll(() => {
    class MockIntersectionObserver {
      observe = vi.fn((el) => {
        // Automatically trigger intersection to simulate elements coming into view
        this.callback([{ isIntersecting: true, target: el }]);
      });
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(private callback: any) {}
    }
    vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
  });

  describe('VegaPlot', () => {
    it('renders a simple spec successfully', async () => {
      const mockSpec = { mark: 'bar', encoding: { x: { field: 'a', type: 'nominal' } } };
      
      await act(async () => {
        render(<VegaPlot spec={mockSpec} />);
      });

      const element = screen.getByTestId('mock-vega-plot');
      expect(element).toBeDefined();
      expect(JSON.parse(element.getAttribute('data-spec')!)).toEqual(mockSpec);
    });

    it('re-embeds when spec changes', async () => {
      const mockSpec1 = { mark: 'bar' };
      const mockSpec2 = { mark: 'line' };
      
      const { rerender } = render(<VegaPlot spec={mockSpec1} />);
      
      let element = screen.getByTestId('mock-vega-plot');
      expect(JSON.parse(element.getAttribute('data-spec')!)).toEqual(mockSpec1);

      await act(async () => {
        rerender(<VegaPlot spec={mockSpec2} />);
      });

      element = screen.getByTestId('mock-vega-plot');
      expect(JSON.parse(element.getAttribute('data-spec')!)).toEqual(mockSpec2);
    });
  });

  describe('DiagnosticThumbnail', () => {
    const mockContinuousVariable = {
      name: 'Age',
      inferredType: 'continuous' as const,
      confirmedType: 'continuous' as const,
      cardinalityTier: 'ok' as const,
      displayLabel: 'Patient Age',
    };

    const mockCategoricalVariable = {
      name: 'Gender',
      inferredType: 'categorical_nominal' as const,
      confirmedType: 'categorical_nominal' as const,
      cardinalityTier: 'ok' as const,
      displayLabel: 'Patient Gender',
    };

    it('renders histogram and QQ plots for continuous variables', async () => {
      const plotData = {
        type: 'continuous',
        raw: [
          { val: 25, group: 'All' },
          { val: 30, group: 'All' },
        ],
        qq: {
          points: [{ theoretical: -1, sample: 25 }, { theoretical: 1, sample: 30 }],
          lines: [{ x: -2, y: 20 }, { x: 2, y: 35 }]
        }
      };

      await act(async () => {
        render(<DiagnosticThumbnail variable={mockContinuousVariable} plotData={plotData} />);
      });

      expect(screen.getByTestId('histogram-plot')).toBeDefined();
      expect(screen.getByTestId('qq-plot')).toBeDefined();
    });

    it('renders bar plot for categorical variables', async () => {
      const plotData = {
        type: 'categorical',
        raw: [
          { val: 'Male', group: 'All' },
          { val: 'Female', group: 'All' },
        ],
      };

      await act(async () => {
        render(<DiagnosticThumbnail variable={mockCategoricalVariable} plotData={plotData} />);
      });

      expect(screen.getByTestId('bar-plot')).toBeDefined();
    });

    it('displays placeholder when plotData is missing or empty', () => {
      render(<DiagnosticThumbnail variable={mockContinuousVariable} plotData={null} />);
      expect(screen.getByText('No plot data available')).toBeDefined();
    });
  });

  describe('DiagnosticsPanel with Lazy Loading', () => {
    const mockSchema: Schema = {
      columns: [
        {
          name: 'GroupVar',
          inferredType: 'categorical_nominal',
          confirmedType: 'categorical_nominal',
          cardinalityTier: 'ok',
          levels: [
            { code: 1, label: 'Placebo' },
            { code: 2, label: 'Treatment' }
          ]
        },
        {
          name: 'Age',
          inferredType: 'continuous',
          confirmedType: 'continuous',
          cardinalityTier: 'ok',
          displayLabel: 'Age (Years)'
        }
      ]
    };

    const mockResults: StatisticalResults = {
      perVariable: [
        {
          variable: 'Age',
          summaryByGroup: {
            '1': { mean: 45.2, sd: 8.5, n: 50 },
            '2': { mean: 47.1, sd: 9.1, n: 52 },
          },
          overallSummary: { mean: 46.1, sd: 8.8, n: 102 },
          test: { name: 'Student t-test', statistic: 1.1, pValue: 0.27 },
          notes: [],
          plotData: {
            type: 'continuous',
            raw: [
              { val: 40, group: 'Placebo' },
              { val: 50, group: 'Treatment' },
            ],
            qq: {
              points: [{ theoretical: -0.5, sample: 40 }, { theoretical: 0.5, sample: 50 }],
              lines: [{ x: -1, y: 35 }, { x: 1, y: 55 }]
            }
          }
        }
      ],
      groups: [{ name: '1', n: 50 }, { name: '2', n: 52 }],
      totalN: 102,
      computeMetadata: { libVersions: {}, seed: 42 }
    };

    it('renders Diagnostic Plot column header and lazy loads the plots', async () => {
      await act(async () => {
        render(
          <DiagnosticsPanel
            results={mockResults}
            schema={mockSchema}
            groupingVariable="GroupVar"
          />
        );
      });

      // Assert header
      expect(screen.getByText('Diagnostic Plot')).toBeDefined();

      // Assert that lazy loading occurred (IntersectionObserver triggered render)
      expect(screen.getByTestId('histogram-plot')).toBeDefined();
      expect(screen.getByTestId('qq-plot')).toBeDefined();
    });
  });
});
