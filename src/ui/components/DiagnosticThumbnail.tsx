import { VegaPlot } from './VegaPlot';
import type { PlotTheme, SchemaColumn } from '../../core/types';

interface DiagnosticThumbnailProps {
  variable: SchemaColumn;
  plotData: any;
  plotTheme?: PlotTheme;
  /** Total height in px for the plot container. Controlled by slider in DiagnosticsPanel. */
  plotHeight?: number;
  plotWidth?: number;
}

const DEFAULT_PLOT_THEME: PlotTheme = {
  seaborn_style: 'whitegrid',
  color_palette: ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7'],
  font_family: 'DejaVu Sans',
  font_size_base: 9,
  despine: false,
  bar_edge_color: 'white',
  bar_edge_linewidth: 0.5,
  line_width: 1.2,
  figure_dpi_screen: 150,
  figure_dpi_export: 300,
};

export function DiagnosticThumbnail({ variable, plotData, plotTheme, plotHeight = 160, plotWidth = 150 }: DiagnosticThumbnailProps) {
  if (!plotData || !plotData.raw || plotData.raw.length === 0) {
    return (
      <div className="flex items-center justify-center h-[120px] bg-gray-50 border border-gray-100 rounded text-xs text-gray-400">
        No plot data available
      </div>
    );
  }

  const isContinuous = plotData.type === 'continuous';
  const isFaceted = plotData.raw.some((r: any) => r.group !== 'All');
  const numGroups = Array.from(new Set(plotData.raw.map((r: any) => r.group))).filter(g => g !== 'All').length || 1;

  /**
   * specHeight is the Vega-Lite `height` value (data area only).
   * We reserve headroom for axis labels:
   *   - Continuous: 30px for numeric x-axis labels
   *   - Categorical bar: 60px for angled x-axis labels (handled by config.padding.bottom)
   */
  const specHeight = Math.max(50, plotHeight - (isContinuous ? 30 : 85));

  const baseW = plotWidth;
  const theme = plotTheme ?? DEFAULT_PLOT_THEME;
  const palette = theme.color_palette;
  const barStroke = theme.bar_edge_color === 'none' ? undefined : theme.bar_edge_color;
  const barStrokeWidth = theme.bar_edge_color === 'none' ? 0 : theme.bar_edge_linewidth;
  const continuousFacetW = Math.max(60, Math.round(baseW * 0.65));
  const categoricalFacetW = Math.max(80, Math.round(baseW * 0.85));

  if (isContinuous) {
    // 1. Histogram Spec
    const histogramSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      data: { values: plotData.raw },
      width: isFaceted ? continuousFacetW : baseW,
      height: specHeight,
      autosize: { type: 'fit', contains: 'padding' },
      ...(isFaceted
        ? {
            facet: {
              column: { field: 'group', type: 'nominal', header: null }
            },
            spec: {
              width: continuousFacetW,
              height: specHeight,
              transform: [
                { bin: { maxbins: 15 }, field: 'val', as: 'bin_val' },
                { joinaggregate: [{ op: 'count', field: '*', as: 'total_count' }], groupby: ['group'] },
                { joinaggregate: [{ op: 'count', field: '*', as: 'bin_count' }], groupby: ['bin_val', 'group'] },
                { calculate: 'datum.bin_count / (datum.total_count * (datum.bin_val_end - datum.bin_val))', as: 'density' }
              ],
              mark: { type: 'bar', stroke: barStroke, strokeWidth: barStrokeWidth },
              encoding: {
                x: {
                  field: 'bin_val',
                  type: 'quantitative',
                  bin: { binned: true },
                  title: null,
                  axis: { titleFontSize: 9, labelFontSize: 8 }
                },
                x2: { field: 'bin_val_end' },
                y: {
                  field: 'density',
                  type: 'quantitative',
                  title: 'Density',
                  axis: { titleFontSize: 9, labelFontSize: 8 }
                },
                color: {
                  field: 'group',
                  type: 'nominal',
                  scale: {
                    range: palette
                  },
                  legend: null
                },
                tooltip: [
                  { field: 'bin_val', type: 'quantitative', title: 'Bin Start' },
                  { field: 'bin_val_end', type: 'quantitative', title: 'Bin End' },
                  { field: 'bin_count', type: 'quantitative', title: 'Count' }
                ]
              }
            }
          }
        : {
            transform: [
              { bin: { maxbins: 15 }, field: 'val', as: 'bin_val' },
              { joinaggregate: [{ op: 'count', field: '*', as: 'total_count' }] },
              { joinaggregate: [{ op: 'count', field: '*', as: 'bin_count' }], groupby: ['bin_val'] },
              { calculate: 'datum.bin_count / (datum.total_count * (datum.bin_val_end - datum.bin_val))', as: 'density' }
            ],
            mark: { type: 'bar', color: palette[0], stroke: barStroke, strokeWidth: barStrokeWidth },
            encoding: {
              x: {
                field: 'bin_val',
                type: 'quantitative',
                bin: { binned: true },
                title: null,
                axis: { titleFontSize: 9, labelFontSize: 8 }
              },
              x2: { field: 'bin_val_end' },
              y: {
                field: 'density',
                type: 'quantitative',
                title: 'Density',
                axis: { titleFontSize: 9, labelFontSize: 8 }
              },
              tooltip: [
                { field: 'bin_val', type: 'quantitative', title: 'Bin Start' },
                { field: 'bin_val_end', type: 'quantitative', title: 'Bin End' },
                { field: 'bin_count', type: 'quantitative', title: 'Count' }
              ]
            }
          })
    };

    // 2. QQ Plot Spec
    const pointsData = plotData.qq?.points || [];
    const linesData = plotData.qq?.lines || [];

    const qqSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      width: isFaceted ? continuousFacetW : baseW,
      height: specHeight,
      autosize: { type: 'fit', contains: 'padding' },
      ...(isFaceted
        ? {
            facet: {
              column: { field: 'group', type: 'nominal', header: null }
            },
            spec: {
              width: continuousFacetW,
              height: specHeight,
              resolve: { scale: { y: 'shared' } },
              layer: [
                {
                  data: { values: pointsData },
                  mark: { type: 'point', filled: true, size: 10 },
                  encoding: {
                    x: {
                      field: 'theoretical',
                      type: 'quantitative',
                      title: 'Theoretical',
                      axis: { titleFontSize: 9, labelFontSize: 8 }
                    },
                    y: {
                      field: 'sample',
                      type: 'quantitative',
                      title: 'Sample',
                      axis: { titleFontSize: 9, labelFontSize: 8 }
                    },
                    color: {
                      field: 'group',
                      type: 'nominal',
                      scale: {
                        range: palette
                      },
                      legend: null
                    },
                    tooltip: [
                      { field: 'theoretical', type: 'quantitative', title: 'Theoretical' },
                      { field: 'sample', type: 'quantitative', title: 'Sample' }
                    ]
                  }
                },
                {
                  data: { values: linesData },
                  mark: { type: 'line', color: palette[1 % palette.length], strokeDash: [3, 3], strokeWidth: theme.line_width },
                  encoding: {
                    x: { field: 'x', type: 'quantitative' },
                    y: { field: 'y', type: 'quantitative' }
                  }
                }
              ]
            }
          }
        : {
            resolve: { scale: { y: 'shared' } },
            layer: [
              {
                data: { values: pointsData },
                mark: { type: 'point', filled: true, color: palette[0], size: 10 },
                encoding: {
                  x: {
                    field: 'theoretical',
                    type: 'quantitative',
                    title: 'Theoretical',
                    axis: { titleFontSize: 9, labelFontSize: 8 }
                  },
                  y: {
                    field: 'sample',
                    type: 'quantitative',
                    title: 'Sample',
                    axis: { titleFontSize: 9, labelFontSize: 8 }
                  },
                  tooltip: [
                    { field: 'theoretical', type: 'quantitative', title: 'Theoretical' },
                    { field: 'sample', type: 'quantitative', title: 'Sample' }
                  ]
                }
              },
              {
                data: { values: linesData },
                mark: { type: 'line', color: palette[1 % palette.length], strokeDash: [3, 3], strokeWidth: theme.line_width },
                encoding: {
                  x: { field: 'x', type: 'quantitative' },
                  y: { field: 'y', type: 'quantitative' }
                }
              }
            ]
          })
    };

    const histWidth = isFaceted ? (numGroups * continuousFacetW + 40) : baseW + 40;
    const qqWidth = isFaceted ? (numGroups * continuousFacetW + 45) : baseW + 45;

    return (
      <div className="mx-auto w-fit flex gap-4 items-center justify-center flex-nowrap" style={{ height: `${plotHeight}px` }}>
        <div
          className="flex-shrink-0 min-w-0"
          style={{ width: `${histWidth}px`, height: `${plotHeight}px` }}
          data-testid="histogram-plot"
        >
          <VegaPlot spec={histogramSpec} />
        </div>
        <div
          className="flex-shrink-0 min-w-0"
          style={{ width: `${qqWidth}px`, height: `${plotHeight}px` }}
          data-testid="qq-plot"
        >
          <VegaPlot spec={qqSpec} />
        </div>
      </div>
    );
  } else {
    // 3. Bar Chart Spec (Categorical/Ordinal)
    // Map raw codes to display labels using variable.levels
    const mappedRawValues = plotData.raw.map((item: any) => {
      if (!variable.levels) return item;
      const valStr = String(item.val);
      const level = variable.levels.find(
        (l) =>
          String(l.code) === valStr ||
          String(l.code) === valStr.replace(/\.0$/, '') ||
          valStr === String(l.code).replace(/\.0$/, '')
      );
      return {
        ...item,
        val: level ? level.label : item.val
      };
    });

    const sortLevels = variable.levels
      ? variable.levels.map((l) => l.label)
      : undefined;

    /**
     * config.padding.bottom reserves space INSIDE the SVG for angled x-axis labels.
     * specHeight + padding.bottom = total SVG height ≈ plotHeight.
     * labelLimit: 110px prevents excessively long labels from overflowing;
     * the full text is always available via tooltip.
     */
    const barSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      data: { values: mappedRawValues },
      width: isFaceted ? Math.max(100, Math.round(baseW * 1.1)) : Math.max(120, Math.round(baseW * 1.8)),
      height: specHeight,
      autosize: { type: 'fit', contains: 'padding' },
      config: {
        padding: { top: 5, right: 15, bottom: 80, left: 55 },
        axis: { labelLimit: 110 },
      },
      ...(isFaceted
        ? {
            facet: {
              column: { field: 'group', type: 'nominal', header: null }
            },
            spec: {
              width: categoricalFacetW,
              height: specHeight,
              mark: { type: 'bar', color: palette[0], stroke: barStroke, strokeWidth: barStrokeWidth },
              encoding: {
                x: {
                  field: 'val',
                  type: 'nominal',
                  title: null,
                  sort: sortLevels,
                  axis: {
                    titleFontSize: 9,
                    labelFontSize: 8,
                    labelAngle: -45,
                    labelAlign: 'right',
                    labelLimit: 110,
                  }
                },
                y: {
                  aggregate: 'count',
                  type: 'quantitative',
                  title: 'Count',
                  axis: { titleFontSize: 9, labelFontSize: 8 }
                },
                color: {
                  field: 'group',
                  type: 'nominal',
                  scale: {
                    range: palette
                  },
                  legend: null
                },
                tooltip: [
                  { field: 'val', type: 'nominal', title: 'Value' },
                  { aggregate: 'count', type: 'quantitative', title: 'Count' }
                ]
              }
            }
          }
        : {
            mark: { type: 'bar', color: palette[0], stroke: barStroke, strokeWidth: barStrokeWidth },
            encoding: {
              x: {
                field: 'val',
                type: 'nominal',
                title: null,
                sort: sortLevels,
                axis: {
                  titleFontSize: 9,
                  labelFontSize: 8,
                  labelAngle: -45,
                  labelAlign: 'right',
                  labelLimit: 110,
                }
              },
              y: {
                aggregate: 'count',
                type: 'quantitative',
                title: 'Count',
                axis: { titleFontSize: 9, labelFontSize: 8 }
              },
              tooltip: [
                { field: 'val', type: 'nominal', title: 'Value' },
                { aggregate: 'count', type: 'quantitative', title: 'Count' }
              ]
            }
          })
    };

    const barWidth = isFaceted ? (numGroups * categoricalFacetW + 120) : Math.max(120, Math.round(baseW * 1.8)) + 120;

    return (
      <div
        className="mx-auto w-fit flex items-center justify-center min-w-0 overflow-hidden"
        style={{ height: `${plotHeight}px` }}
        data-testid="bar-plot"
      >
        <div style={{ width: `${barWidth}px`, height: `${plotHeight}px` }} className="flex-shrink-0">
          <VegaPlot spec={barSpec} />
        </div>
      </div>
    );
  }
}
