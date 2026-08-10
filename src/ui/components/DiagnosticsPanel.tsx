import React, { useState, useEffect, useRef } from 'react';
import type { PlotTheme, Schema, StatisticalResults, TestMethod, SchemaColumn } from '../../core/types';
import { getColumnDisplayLabel, resolveLevelLabel } from '../../core/format/columnLabel';
import { getContinuousFormatter } from '../../core/format/diagnosticsCsv';
import { useStore } from '../../store';
import { recomputeVariableWithAdjustments } from '../../core/stats/runTable1';
import { applyRecomputeResult } from '../../core/stats/applyRecomputeResult';
import { isFisherLike } from '../../core/format/testName';
import { DiagnosticThumbnail } from './DiagnosticThumbnail';
import { journalRulesets } from '../../core/format/formatTable';
import { getEffectiveJournalSettings } from '../../core/format/getEffectiveJournalSettings';
import { buildStatMeaning } from '../../core/format/statMeaning';

/** Measure natural text width using an offscreen canvas (reliable in fixed-layout tables). */
function measureText(text: string): number {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return Math.ceil(text.length * 7.5);
    ctx.font = '500 13px ui-sans-serif, system-ui, -apple-system, sans-serif';
    return Math.ceil(ctx.measureText(text).width);
  } catch {
    return Math.ceil(text.length * 7.5);
  }
}

interface LazyPlotWrapperProps {
  variable: SchemaColumn;
  plotData: any;
  plotTheme: PlotTheme;
  plotHeight: number;
  plotWidth: number;
}

function LazyPlotWrapper({ variable, plotData, plotTheme, plotHeight, plotWidth }: LazyPlotWrapperProps) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.disconnect();
          }
        }
      },
      { rootMargin: '200px 0px' }
    );
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full flex items-center"
      style={{ height: `${plotHeight}px` }}
    >
      {visible ? (
        <DiagnosticThumbnail variable={variable} plotData={plotData} plotTheme={plotTheme} plotHeight={plotHeight} plotWidth={plotWidth} />
      ) : (
        <div className="mx-auto text-xs text-gray-400">Loading plot...</div>
      )}
    </div>
  );
}

function postHocLabel(method: NonNullable<StatisticalResults['perVariable'][number]['postHoc']>['method']): string {
  if (method === 'tukey_hsd') return 'Tukey';
  if (method === 'dunn') return 'Dunn';
  return 'Holm';
}

interface DiagnosticsPanelProps {
  results: StatisticalResults;
  /** Optional schema — when provided, variable column uses display labels. */
  schema?: Schema;
  groupingVariable?: string;
  journalId?: string;
}

/**
 * DiagnosticsPanel — Stage 7 Statistical Review
 * Per-variable diagnostics with interactive Vega-Lite plots, test overrides,
 * and rationale tooltips. Supports:
 *  - Per-row height resizing (Wrap Text OFF mode)
 *  - Decoupled plot height (slider)
 *  - Column auto-fit (double-click edge) and drag-resize
 *  - Sticky Variable column + sticky header
 *  - Column visibility toggle
 *  - Horizontal scroll indicator with always-visible scrollbar
 */
export function DiagnosticsPanel({ results, schema, groupingVariable, journalId }: DiagnosticsPanelProps) {
  const { data, plan, setPlan, setStats } = useStore();
  const { fmt, iqrDelimiter, normalTemplate } = getContinuousFormatter(journalId);
  const plotTheme = getEffectiveJournalSettings(journalId ?? 'NEJM', plan?.userOverrides).plot_theme;
  const numGroups = results.groups.length;

  // ─── State ────────────────────────────────────────────────────────────────
  const [plotHeight, setPlotHeight] = useState(177);
  const [plotWidth, setPlotWidth] = useState(150);
  /** Per-variable row heights (Wrap Text OFF only). undefined = auto-height. */
  const [rowHeights, setRowHeights] = useState<Record<string, number>>({});
  const [wrapText, setWrapText] = useState(true);
  const [showWrapTooltip, setShowWrapTooltip] = useState(false);
  /** Key-based column widths overriding defaults. */
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  /** Hide 'notes' by default when no variable has any notes. */
  const [hiddenCols, setHiddenCols] = useState<Set<string>>(() => {
    const s = new Set<string>();
    if (results.perVariable.every((v) => v.notes.length === 0)) s.add('notes');
    return s;
  });
  const [showColMenu, setShowColMenu] = useState(false);
  const [hasScrollRight, setHasScrollRight] = useState(false);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // ─── Scroll detection ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = tableContainerRef.current;
    if (!el) return;
    const check = () => {
      const remaining = el.scrollWidth - Math.round(el.scrollLeft) - el.clientWidth;
      setHasScrollRight(remaining > 1);
    };
    el.addEventListener('scroll', check, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(check);
      ro.observe(el);
    }
    check();
    return () => {
      el.removeEventListener('scroll', check);
      ro?.disconnect();
    };
  }, []);

  // Close column menu on outside click
  useEffect(() => {
    if (!showColMenu) return;
    const handle = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('[data-col-menu]')) setShowColMenu(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showColMenu]);

  // ─── Resolvers ────────────────────────────────────────────────────────────
  const groupingSchemaCol = schema?.columns.find((c) => c.name === groupingVariable);
  const resolveGroupName = (raw: string) => resolveLevelLabel(raw, groupingSchemaCol);

  const continuousMethods = new Set<TestMethod>(['welch_t_test', 't_test', 'mann_whitney_u', 'oneway_anova', 'kruskal_wallis']);
  const categoricalMethods = new Set<TestMethod>(['chi_square', 'fishers_exact']);
  const methodLabel = (method: TestMethod): string => {
    if (method === 'welch_t_test') return "Welch's t-test";
    if (method === 't_test') return 'Student t-test';
    if (method === 'mann_whitney_u') return 'Mann-Whitney U';
    if (method === 'oneway_anova') return 'ANOVA';
    if (method === 'kruskal_wallis') return 'Kruskal-Wallis';
    if (method === 'chi_square') return 'Chi-square';
    return "Fisher's exact";
  };
  const getOverrideMismatch = (variable: string, method: TestMethod, inferredContinuous: boolean, inferredCategorical: boolean) => {
    const treatAs = plan?.variableConfig?.[variable]?.treatAs ?? schema?.columns.find((c) => c.name === variable)?.confirmedType;
    const effectiveContinuous = treatAs === 'continuous' || (!treatAs && inferredContinuous);
    const effectiveCategorical = treatAs === 'binary' || treatAs === 'categorical_nominal' || treatAs === 'categorical_ordinal' || (!treatAs && inferredCategorical);
    if (effectiveContinuous && categoricalMethods.has(method)) {
      return `Override warning: ${methodLabel(method)} is a categorical test, but this variable is treated as continuous. The automatic continuous test would normally apply.`;
    }
    if (effectiveCategorical && continuousMethods.has(method)) {
      return `Override warning: ${methodLabel(method)} is a continuous-variable test, but this variable is treated as categorical. The automatic categorical test would normally apply.`;
    }
    return null;
  };

  // ─── Column definitions ───────────────────────────────────────────────────
  const hasContinuous = results.perVariable.some(
    (v) => v.overallSummary['mean'] !== undefined || v.overallSummary['median'] !== undefined
  );
  const isFaceted = numGroups > 1 && !!groupingVariable;

  const baseW = plotWidth;
  const continuousFacetW = Math.max(60, Math.round(baseW * 0.65));
  const categoricalFacetW = Math.max(80, Math.round(baseW * 0.85));

  const totalContW = isFaceted
    ? (continuousFacetW * numGroups + 40 + 16 + continuousFacetW * numGroups + 45)
    : (baseW + 40 + 16 + baseW + 45);

  const totalCatW = isFaceted
    ? (categoricalFacetW * numGroups + 60)
    : (Math.max(120, Math.round(baseW * 1.8)) + 60);

  const defaultPlotW = hasContinuous
    ? totalContW + 24
    : totalCatW + 24;

  const columnDefs = [
    { key: 'variable',  label: 'Variable',       defaultW: 180,         sticky: true,  alwaysVisible: true  },
    { key: 'plot',      label: 'Diagnostic Plot', defaultW: defaultPlotW,sticky: false, alwaysVisible: false },
    { key: 'type',      label: 'Type',            defaultW: 180,         sticky: false, alwaysVisible: false },
    { key: 'test',      label: 'Test',            defaultW: 220,         sticky: false, alwaysVisible: false },
    { key: 'meaning',   label: 'Statistical Meaning', defaultW: 320,     sticky: false, alwaysVisible: false },
    { key: 'statistic', label: 'Statistic',       defaultW: 100,         sticky: false, alwaysVisible: false },
    { key: 'pvalue',    label: 'P-value',         defaultW: 100,         sticky: false, alwaysVisible: false },
    { key: 'smd',       label: 'SMD',             defaultW: 110,         sticky: false, alwaysVisible: false },
    { key: 'ntotal',    label: 'N (total)',        defaultW: 80,          sticky: false, alwaysVisible: false },
    ...results.groups.map((g) => ({
      key: `grp_${g.name}`,
      label: `${resolveGroupName(g.name)} (n=${g.n})`,
      defaultW: 140,
      sticky: false,
      alwaysVisible: false,
    })),
    { key: 'notes',     label: 'Notes',           defaultW: 120,         sticky: false, alwaysVisible: false },
  ];

  const visibleCols = columnDefs.filter((c) => !hiddenCols.has(c.key));

  const getW  = (key: string, def: number) => colWidths[key] ?? def;
  const getCS = (key: string, def: number) => ({
    width:    `${getW(key, def)}px`,
    minWidth: `${getW(key, def)}px`,
    maxWidth: `${getW(key, def)}px`,
  });

  // ─── Column drag-resize ───────────────────────────────────────────────────
  const handleColMouseDown = (key: string, def: number, e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = getW(key, def);
    // Plot column: enforce min width so left edge of plots isn't clipped.
    const minW = key === 'plot' ? 180 : 60;
    const onMove = (ev: MouseEvent) => {
      setColWidths((p) => ({ ...p, [key]: Math.max(minW, startW + (ev.clientX - startX)) }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ─── Column double-click auto-fit (canvas measurement) ───────────────────
  const autoFitCol = (colKey: string) => {
    if (colKey === 'plot') {
      // Double-click plot column header edge → reset to natural default width.
      setColWidths((p) => ({ ...p, [colKey]: defaultPlotW }));
      return;
    }
    const colDef = columnDefs.find((c) => c.key === colKey);
    if (!colDef) return;

    // Start with header label + sort icon space
    let maxW = measureText(colDef.label) + 40;

    for (const v of results.perVariable) {
      const varSchemaCol = schema?.columns.find((c) => c.name === v.variable);
      const varDisplay = varSchemaCol ? getColumnDisplayLabel(varSchemaCol, 'stripped') : v.variable;
      const isCont = v.overallSummary['mean'] !== undefined;
      const isCat  = v.overallSummary['counts'] !== undefined;
      const isNonNorm = v.test.name === 'Mann-Whitney U' || v.test.name === 'Kruskal-Wallis';

      let text = '';
      if (colKey === 'variable') {
        text = varDisplay;
      } else if (colKey === 'type') {
        text = isCont ? (isNonNorm ? 'Continuous (non-normal)' : 'Continuous (normal)') : 'Categorical';
      } else if (colKey === 'test') {
        text = v.test.name;
      } else if (colKey === 'meaning') {
        text = buildStatMeaning(v, { results, schema, groupingVariable, journalId, userOverrides: plan?.userOverrides });
      } else if (colKey === 'statistic') {
        text = v.test.statistic === null ? '—' : v.test.statistic.toFixed(2);
      } else if (colKey === 'pvalue') {
        text = v.test.pValue === null ? '—' : (v.test.pValue < 0.001 ? '<0.001' : v.test.pValue.toFixed(3));
      } else if (colKey === 'ntotal') {
        text = String(v.overallSummary['n'] ?? '—');
      } else if (colKey === 'notes') {
        text = v.notes.join('; ');
      } else if (colKey.startsWith('grp_')) {
        const gName = colKey.slice(4);
        const gs = v.summaryByGroup[gName];
        if (gs) {
          if (isCont) {
            if (isNonNorm) {
              const med = gs['median'], q25 = gs['q25'], q75 = gs['q75'];
              if (med !== undefined && q25 !== undefined && q75 !== undefined)
                text = `${fmt(med as number)} (${fmt(q25 as number)}${iqrDelimiter}${fmt(q75 as number)})`;
            } else {
              const m = gs['mean'], s = gs['sd'];
              if (m !== undefined && s !== undefined)
                text = normalTemplate.includes('±') ? `${fmt(m as number)} ± ${fmt(s as number)}` : `${fmt(m as number)} (${fmt(s as number)})`;
            }
          } else if (isCat) {
            const counts = gs['counts'] as Record<string, number> | undefined;
            const pcts   = gs['percentages'] as Record<string, number> | undefined;
            if (counts) {
              text = Object.entries(counts)
                .map(([k, n]) => `${resolveLevelLabel(k, varSchemaCol)}: ${n} (${(pcts?.[k] ?? 0).toFixed(1)}%)`)
                .join('; ');
            }
          }
        }
      }

      const w = measureText(text) + 32;
      if (w > maxW) maxW = w;
    }

    setColWidths((p) => ({ ...p, [colKey]: Math.min(600, Math.max(80, maxW)) }));
  };

  const handleFitAll = () => {
    for (const col of visibleCols) {
      if (col.key !== 'plot') autoFitCol(col.key);
    }
  };

  // ─── Per-row resize (Wrap Text OFF only) ──────────────────────────────────
  const handleRowResizeMouseDown = (varName: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const rowEl = (e.target as HTMLElement).closest('tr');
    const startH = rowEl ? rowEl.getBoundingClientRect().height : (rowHeights[varName] ?? (plotHeight + 50));
    const onMove = (ev: MouseEvent) => {
      const newH = Math.max(plotHeight + 12, startH + (ev.clientY - startY));
      setRowHeights((p) => ({ ...p, [varName]: newH }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  /** Double-click row edge = reset that row to auto-height. */
  const handleRowDoubleClick = (varName: string) => {
    setRowHeights((p) => {
      const next = { ...p };
      delete next[varName];
      return next;
    });
  };

  // ─── Test override handlers ───────────────────────────────────────────────
  const handleOverrideChange = async (varName: string, method: TestMethod) => {
    if (!plan || !data) return;
    const filtered = (plan.testOverrides || []).filter((o) => o.variable !== varName);
    const nextPlan = { ...plan, testOverrides: [...filtered, { variable: varName, method, timestamp: new Date().toISOString() }] };
    try {
      const recomputed = await recomputeVariableWithAdjustments(data, nextPlan, results, varName, method);
      setPlan(nextPlan);
      setStats(applyRecomputeResult(results, recomputed));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  const handleResetOverride = async (varName: string) => {
    if (!plan || !data) return;
    const nextOverrides = (plan.testOverrides || []).filter((o) => o.variable !== varName);
    const nextPlan = { ...plan, testOverrides: nextOverrides.length > 0 ? nextOverrides : undefined };
    try {
      const recomputed = await recomputeVariableWithAdjustments(data, nextPlan, results, varName, undefined);
      setPlan(nextPlan);
      setStats(applyRecomputeResult(results, recomputed));
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : String(err));
    }
  };

  // ─── Test rationale text ──────────────────────────────────────────────────
  const getRationaleText = (v: any): string => {
    const ruleset = journalRulesets.EasyTableOne_Ruleset;
    const logic = ruleset.global_defaults.normality_logic;
    const col = schema?.columns.find((c) => c.name === v.variable);
    const isContinuous = col?.confirmedType === 'continuous' || v.overallSummary['mean'] !== undefined || v.overallSummary['median'] !== undefined;
    const isCategorical = col?.confirmedType === 'binary' || col?.confirmedType === 'categorical_nominal' || col?.confirmedType === 'categorical_ordinal' || v.overallSummary['counts'] !== undefined;
    const varSchemaCol = schema?.columns.find((c) => c.name === v.variable);
    const varDisplay = varSchemaCol ? getColumnDisplayLabel(varSchemaCol, 'stripped') : v.variable;

    if (v.test.name === 'None') return `No statistical test was run for ${varDisplay}. ${v.notes.join('; ')}`;

    if (isContinuous) {
      const groupSizes = results.groups.map((g) => v.summaryByGroup[g.name]?.n ?? 0);
      const nMin = Math.min(...groupSizes);
      const isNormal = ["Welch's t-test", 'ANOVA'].includes(v.test.name);
      const alternative = results.groups.length === 2
        ? (isNormal ? "Mann-Whitney U test" : "Welch's t-test")
        : (isNormal ? "Kruskal-Wallis test" : "one-way ANOVA");
      const normalityMethod = v.test.auxiliary?.normalityMethod;
      if (normalityMethod === 'mixed') {
        return isNormal
          ? `${varDisplay} met the normality assumption using Shapiro-Wilk for groups with n <= ${logic.large_n_threshold_n} and skewness/kurtosis for groups with n > ${logic.large_n_threshold_n}, so the parametric ${v.test.name} was used. If the data had not been approximately normal, the non-parametric ${alternative} would apply.`
          : `${varDisplay} did not meet the normality assumption using Shapiro-Wilk for groups with n <= ${logic.large_n_threshold_n} and skewness/kurtosis for groups with n > ${logic.large_n_threshold_n}, so the non-parametric ${v.test.name} was used. If the data had been approximately normal, the parametric ${alternative} would apply.`;
      }
      if (normalityMethod === 'shapiro' || (!normalityMethod && nMin <= logic.large_n_threshold_n)) {
        return isNormal
          ? `${varDisplay} met the normality assumption (Shapiro–Wilk test p >= ${logic.small_n_threshold_p} for all groups), so the parametric ${v.test.name} was used. If the data had not been approximately normal, the non-parametric ${alternative} would apply.`
          : `${varDisplay} did not meet the normality assumption (Shapiro–Wilk test p < ${logic.small_n_threshold_p} in at least one group), so the non-parametric ${v.test.name} was used. If the data had been approximately normal, the parametric ${alternative} would apply.`;
      }
      return isNormal
        ? `${varDisplay} met the normality assumption (group skewness within ±${logic.large_n_skew_max} and excess kurtosis within ±${logic.large_n_kurt_max}), so the parametric ${v.test.name} was used. If the data had not been approximately normal, the non-parametric ${alternative} would apply.`
        : `${varDisplay} did not meet the normality assumption (group skewness outside ±${logic.large_n_skew_max} or excess kurtosis outside ±${logic.large_n_kurt_max}), so the non-parametric ${v.test.name} was used. If the data had been approximately normal, the parametric ${alternative} would apply.`;
    }

    if (isCategorical) {
      if (isFisherLike(v.test.name) && v.test.name.includes('Monte Carlo')) {
        return `Some expected cell counts were less than 5 and the table is larger than 2x2, so Fisher's exact test with seeded Monte-Carlo estimation was used. If expected cell counts had been 5 or more, the chi-square test would apply.`;
      }
      return isFisherLike(v.test.name)
        ? `Some expected cell counts were less than 5, so Fisher's exact test was used. If expected cell counts had been 5 or more, the chi-square test would apply.`
        : `All expected cell counts were 5 or more, so the chi-square test was used. If expected cell counts had been less than 5, Fisher's exact test would apply.`;
    }

    return '';
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* ── Control Bar ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-start bg-gray-50 border border-gray-200 rounded-lg p-3">
        {/* Left: Plot legend */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Plots Legend:</span>
          {numGroups > 1 ? (
            <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500">
              {results.groups.map((g, idx) => (
                <div key={g.name} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: plotTheme.color_palette[idx % plotTheme.color_palette.length] }} />
                  <span>{resolveGroupName(g.name)}</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-xs text-gray-500">All data combined</span>
          )}
        </div>

        {/* Middle: Plot height & width sliders + Reset */}
        <div className="flex items-center gap-4 justify-center">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Plot Height:</span>
            <input
              type="range" min="100" max="280" value={plotHeight}
              onChange={(e) => setPlotHeight(Number(e.target.value))}
              className="w-20 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <span className="text-xs text-gray-600 font-mono w-10 text-right">{plotHeight}px</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-700 whitespace-nowrap">Plot Width:</span>
            <input
              type="range" min="100" max="300" value={plotWidth}
              onChange={(e) => setPlotWidth(Number(e.target.value))}
              className="w-20 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
            <span className="text-xs text-gray-600 font-mono w-10 text-right">{plotWidth}px</span>
          </div>
          <button
            onClick={() => {
              setPlotHeight(177);
              setPlotWidth(150);
            }}
            title="Reset plot height and width to defaults"
            className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white transition-colors whitespace-nowrap"
          >
            Reset
          </button>
        </div>

        {/* Right: Wrap Text + Fit All + Columns toggle */}
        <div className="flex items-center gap-3 justify-end flex-wrap">
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold text-gray-700">
              <input
                type="checkbox" checked={wrapText}
                onChange={(e) => setWrapText(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300 focus:ring-blue-500"
              />
              Wrap Text
            </label>
            <div className="relative flex items-center">
              <span
                onMouseEnter={() => setShowWrapTooltip(true)}
                onMouseLeave={() => setShowWrapTooltip(false)}
                className="text-blue-400 hover:text-blue-600 cursor-help text-xs select-none leading-none px-1 py-0.5"
              >
                ⓘ
              </span>
              {showWrapTooltip && (
                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 w-64 p-2 bg-gray-900 text-white text-[11px] rounded shadow-xl z-50 text-center pointer-events-none transition-opacity duration-75 leading-relaxed">
                  Disable Wrap Text to enable per-row height resizing by dragging the bottom edge of each row.
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                </div>
              )}
            </div>
          </div>

          <button
            onClick={handleFitAll}
            title="Auto-fit all column widths to their content"
            className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 rounded px-2 py-1 bg-white transition-colors whitespace-nowrap"
          >
            Fit All
          </button>

          <div className="relative" data-col-menu>
            <button
              onClick={() => setShowColMenu((v) => !v)}
              className="text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-200 hover:border-gray-400 rounded px-2 py-1 bg-white transition-colors whitespace-nowrap"
            >
              Columns ▾
            </button>
            {showColMenu && (
              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-xl z-50 py-1 min-w-[170px]">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100">
                  Show / Hide Columns
                </div>
                {columnDefs
                  .filter((c) => !c.alwaysVisible)
                  .map((col) => (
                    <label key={col.key} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={!hiddenCols.has(col.key)}
                        onChange={(e) => {
                          setHiddenCols((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.delete(col.key);
                            else next.add(col.key);
                            return next;
                          });
                        }}
                        className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300"
                      />
                      {col.label}
                    </label>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Table Container Wrapper ────────────────────────────────────────── */}
      <div className="relative">
        <div
          ref={tableContainerRef}
          id="diagnostics-panel"
          style={{ maxHeight: 'calc(100vh - 260px)', minHeight: '220px' }}
          className={[
            // overflow-auto on both axes: x-scroll shows when content overflows,
            // y-scroll bounded by max-height — this also makes `thead sticky top-0` work.
            'overflow-auto rounded-lg border border-gray-200 bg-white shadow-sm',
            '[&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar]:w-2',
            '[&::-webkit-scrollbar-track]:bg-gray-100 [&::-webkit-scrollbar-track]:rounded-full',
            '[&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-thumb]:rounded-full',
            '[&::-webkit-scrollbar-thumb:hover]:bg-gray-600',
            '[&::-webkit-scrollbar-corner]:bg-gray-100',
          ].join(' ')}
        >

        <table
          id="diagnostics-panel-table"
          className="min-w-full divide-y divide-gray-200 text-sm"
          style={{ tableLayout: 'fixed' }}
        >
          {/* ── Sticky header ───────────────────────────────────────────── */}
          <thead className="bg-gray-50 sticky top-0 z-20">
            <tr>
              {visibleCols.map((col) => (
                <th
                  key={col.key}
                  className={[
                    'relative px-4 py-3 text-center font-semibold text-gray-700 whitespace-nowrap select-none',
                    'border-r border-gray-200 last:border-r-0',
                    col.sticky ? 'sticky left-0 z-30 bg-gray-50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.12)]' : '',
                  ].join(' ')}
                  style={getCS(col.key, col.defaultW)}
                >
                  <div className="truncate pr-1" title={col.label}>{col.label}</div>
                  {/* Show resize handle on all columns including the last one */}
                  <div
                    onMouseDown={(e) => handleColMouseDown(col.key, col.defaultW, e)}
                    onDoubleClick={() => autoFitCol(col.key)}
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize group select-none z-10"
                    style={{ touchAction: 'none', transform: 'translateX(50%)' }}
                    title="Drag to resize · Double-click to auto-fit"
                  >
                    <div className="w-[1px] h-full bg-gray-300 group-hover:bg-blue-500 group-hover:w-[2px] group-active:bg-blue-600 transition-all mx-auto" />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* ── Body ────────────────────────────────────────────────────── */}
          <tbody className="divide-y divide-gray-100">
            {results.perVariable.map((v, rowIdx) => {
              const isContinuous = v.overallSummary['mean'] !== undefined;
              const isCategorical = v.overallSummary['counts'] !== undefined;
              const isNonNormal = v.test.name === 'Mann-Whitney U' || v.test.name === 'Kruskal-Wallis';
              const typeLabel = isContinuous
                ? (isNonNormal ? 'Continuous (non-normal)' : 'Continuous (normal)')
                : isCategorical ? 'Categorical' : 'Unknown';
              const pFormatted = v.test.pValue === null ? '—' : v.test.pValue < 0.001 ? '<0.001' : v.test.pValue.toFixed(3);
              const statFormatted = v.test.statistic === null ? '—' : v.test.statistic.toFixed(2);
              const varSchemaCol = schema?.columns.find((c) => c.name === v.variable);
              const varDisplay = varSchemaCol ? getColumnDisplayLabel(varSchemaCol, 'stripped') : v.variable;
              const fallbackSchemaCol: SchemaColumn = varSchemaCol || {
                name: v.variable,
                inferredType: isContinuous ? 'continuous' : 'categorical_nominal',
                confirmedType: isContinuous ? 'continuous' : 'categorical_nominal',
                cardinalityTier: 'ok',
              };
              const is2x2 = results.groups.length === 2 && Object.keys(v.overallSummary.counts || {}).length === 2;

              let options: { value: TestMethod; label: string }[] = [];
              if (isContinuous) {
                options = numGroups === 2
                  ? [{ value: 'welch_t_test', label: "Welch's t-test" }, { value: 'mann_whitney_u', label: 'Mann-Whitney U' }]
                  : [{ value: 'oneway_anova', label: 'ANOVA' }, { value: 'kruskal_wallis', label: 'Kruskal-Wallis' }];
              } else if (isCategorical) {
                options = [
                  { value: 'chi_square', label: 'Chi-square' },
                  { value: 'fishers_exact', label: is2x2 ? "Fisher's exact" : "Fisher's exact (Monte Carlo)" },
                ];
              }

              const getMethodKey = (name: string): TestMethod => {
                if (name === "Welch's t-test" || name === 'Student t-test') return 'welch_t_test';
                if (name === 'ANOVA') return 'oneway_anova';
                if (name === 'Mann-Whitney U') return 'mann_whitney_u';
                if (name === 'Kruskal-Wallis') return 'kruskal_wallis';
                if (isFisherLike(name)) return 'fishers_exact';
                if (name === 'Chi-square') return 'chi_square';
                return 't_test';
              };

              const override = plan?.testOverrides?.find((o) => o.variable === v.variable);
              const autoMethodKey = getMethodKey(String(v.test.auxiliary?.autoMethod ?? v.test.name));
              const selectedMethodKey = override ? override.method : autoMethodKey;
              const overrideMismatch = override ? getOverrideMismatch(v.variable, override.method, isContinuous, isCategorical) : null;
              const hasContradiction = v.test.auxiliary?.assumptionCheckContradicted === 'true';
              const shapiroP = v.test.auxiliary?.shapiroPValue;
              const shapiroPNum = typeof shapiroP === 'number' ? shapiroP : typeof shapiroP === 'string' ? parseFloat(shapiroP) : undefined;
              const pValStr = shapiroPNum !== undefined ? (shapiroPNum < 0.001 ? '< 0.001' : shapiroPNum.toFixed(2)) : '';
              const meaningText = buildStatMeaning(v, { results, schema, groupingVariable, journalId, userOverrides: plan?.userOverrides });
              const smdFormatted = v.smd === null || v.smd === undefined ? 'â€”' : v.smd.toFixed(3);
              const postHoc = v.postHoc;
              const significantPosthocPairs = postHoc?.pairs.filter((pair) => pair.significant) ?? [];
              const allPosthocPairs = postHoc?.pairs ?? [];
              const smdTooltip = results.groups.length === 2
                ? `SMD is the absolute standardized difference between ${resolveGroupName(results.groups[1]?.name ?? '')} and ${resolveGroupName(results.groups[0]?.name ?? '')}; it has no sign — magnitude indicates imbalance (SMD > 0.1 is conventionally considered imbalanced).`
                : `Shown is the largest pairwise SMD across groups; magnitude, not sign, indicates imbalance (SMD > 0.1 is conventionally considered imbalanced).`;
              const warningText = isContinuous
                ? `Shapiro–Wilk p = ${pValStr} indicates the data are not normally distributed; a t-test assumes normality, so its P-value may be unreliable. Mann–Whitney U is recommended.`
                : `Some expected cell counts are < 5; the chi-square approximation is unreliable, so Fisher's exact test is recommended.`;

              // Per-row height (Wrap Text OFF only)
              const rowH = (!wrapText && rowHeights[v.variable]) ? rowHeights[v.variable] : undefined;
              const rowBg = rowIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50';
              const cellBase = 'px-4 py-2 border-r border-gray-100 last:border-r-0 align-middle';
              const cellWrap = wrapText ? 'whitespace-normal break-words' : 'whitespace-nowrap overflow-hidden';

              // ── Per-column cell renderer ────────────────────────────────
              const renderCell = (col: typeof columnDefs[0]) => {
                const cs = getCS(col.key, col.defaultW);
                const heightStyle = rowH ? { height: `${rowH}px` } : {};

                switch (col.key) {
                  case 'variable':
                    return (
                      <td
                        key={col.key}
                        className={[
                          'relative',
                          cellBase,
                          cellWrap,
                          'font-medium text-gray-900',
                          'sticky left-0 z-10',
                          rowBg,
                          'shadow-[2px_0_5px_-2px_rgba(0,0,0,0.07)]',
                        ].join(' ')}
                        style={{ ...cs, ...heightStyle }}
                        title={varDisplay}
                      >
                        {varDisplay}
                        {!wrapText && (
                          <div
                            onMouseDown={(e) => handleRowResizeMouseDown(v.variable, e)}
                            onDoubleClick={() => handleRowDoubleClick(v.variable)}
                            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize group/rr select-none z-10"
                            style={{ touchAction: 'none' }}
                            title="Drag to resize row · Double-click to reset"
                          >
                            <div className="w-full h-[1px] bg-transparent group-hover/rr:bg-blue-400/70 group-active/rr:bg-blue-600 transition-colors" />
                          </div>
                        )}
                      </td>
                    );

                  case 'plot':
                    return (
                      <td
                        key={col.key}
                        className={`relative ${cellBase} overflow-hidden`}
                        style={{ ...cs, ...heightStyle, padding: '4px 8px' }}
                      >
                        <LazyPlotWrapper variable={fallbackSchemaCol} plotData={v.plotData} plotTheme={plotTheme} plotHeight={plotHeight} plotWidth={plotWidth} />
                        {!wrapText && (
                          <div
                            onMouseDown={(e) => handleRowResizeMouseDown(v.variable, e)}
                            onDoubleClick={() => handleRowDoubleClick(v.variable)}
                            className="absolute bottom-0 left-0 right-0 h-1.5 cursor-row-resize group/rr select-none z-10"
                            style={{ touchAction: 'none' }}
                          >
                            <div className="w-full h-[1px] bg-transparent group-hover/rr:bg-blue-400/70 group-active/rr:bg-blue-600 transition-colors" />
                          </div>
                        )}
                      </td>
                    );

                  case 'type':
                    return (
                      <td key={col.key} className={`${cellBase} ${cellWrap} text-center text-gray-600`} style={{ ...cs, ...heightStyle }} title={typeLabel}>
                        {typeLabel}
                      </td>
                    );

                  case 'test':
                    return (
                      // relative + hover:z-[100] ensures the tooltip floats above the sticky
                      // thead (z-20) even for the first row.
                      <td key={col.key} className={`${cellBase} text-center relative hover:z-[100]`} style={{ ...cs, ...heightStyle }}>
                        <div className="flex flex-col items-center gap-1 w-full">
                          {options.length > 0 ? (
                            <div className="flex flex-col gap-1 w-full items-center">
                              <select
                                value={selectedMethodKey}
                                onChange={(e) => handleOverrideChange(v.variable, e.target.value as TestMethod)}
                                className="text-xs border rounded px-1.5 py-1 bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 w-full"
                                style={{ textAlign: 'center', textAlignLast: 'center' }}
                              >
                                {options.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                              {override && (
                                <button onClick={() => handleResetOverride(v.variable)} className="text-[10px] text-blue-600 hover:text-blue-800 underline">
                                  Reset to default
                                </button>
                              )}
                            </div>
                          ) : (
                            <span className={`text-xs text-center w-full ${wrapText ? 'break-words' : 'truncate'}`} title={v.test.name}>{v.test.name}</span>
                          )}
                          <div className="relative group/tooltip mt-1 flex-shrink-0">
                            <button
                              type="button"
                              className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm cursor-help focus:outline-none select-none transition-colors"
                              tabIndex={-1}
                            >
                              ?
                            </button>
                            <div className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 w-64 bg-gray-900 text-white text-[11px] rounded p-2.5 opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity duration-200 z-50 shadow-lg leading-relaxed text-left">
                              {getRationaleText(v)}
                              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                            </div>
                          </div>
                          {postHoc && (
                            <details className="mt-1 w-full text-left text-[11px] text-gray-700">
                              <summary className="cursor-pointer text-blue-700">Post-hoc</summary>
                              <div className="mt-1 space-y-1">
                                {postHoc.error && (
                                  <div className="text-amber-700">{postHoc.error}</div>
                                )}
                                {!postHoc.error && allPosthocPairs.length === 0 && (
                                  <div className="text-gray-500">No post-hoc pairs were returned.</div>
                                )}
                                {(significantPosthocPairs.length > 0 ? significantPosthocPairs : allPosthocPairs).map((pair) => {
                                      const p = pair.pValueCorrected;
                                      const pText = p === null ? 'NA' : p < 0.001 ? '<0.001' : p.toFixed(3);
                                      return (
                                        <div key={`${pair.groupA}-${pair.groupB}`}>
                                          {resolveGroupName(pair.groupA)} vs {resolveGroupName(pair.groupB)}: p = {pText} ({postHocLabel(postHoc.method)})
                                        </div>
                                  );
                                })}
                                {significantPosthocPairs.length > 0 && significantPosthocPairs.length < allPosthocPairs.length && (
                                  <details>
                                    <summary className="cursor-pointer text-gray-500">show all pairs</summary>
                                    {allPosthocPairs.filter((pair) => !pair.significant).map((pair) => {
                                      const p = pair.pValueCorrected;
                                      const pText = p === null ? 'NA' : p < 0.001 ? '<0.001' : p.toFixed(3);
                                      return (
                                        <div key={`${pair.groupA}-${pair.groupB}`}>
                                          {resolveGroupName(pair.groupA)} vs {resolveGroupName(pair.groupB)}: p = {pText} ({postHocLabel(postHoc.method)})
                                        </div>
                                      );
                                    })}
                                  </details>
                                )}
                              </div>
                            </details>
                          )}
                        </div>
                      </td>
                    );

                  case 'meaning':
                    return (
                      <td key={col.key} className={`${cellBase} ${cellWrap} text-left text-gray-700 text-xs leading-relaxed`} style={{ ...cs, ...heightStyle }} title={meaningText}>
                        {meaningText}
                      </td>
                    );

                  case 'statistic':
                    return (
                      <td key={col.key} className={`${cellBase} ${cellWrap} text-center text-gray-700 font-mono`} style={{ ...cs, ...heightStyle }} title={statFormatted}>
                        {statFormatted}
                      </td>
                    );

                  case 'pvalue':
                    return (
                      <td key={col.key} className={`${cellBase} ${cellWrap} text-center font-mono`} style={{ ...cs, ...heightStyle }} title={pFormatted}>
                        <span className={v.test.pValue !== null && v.test.pValue < 0.05 ? 'text-red-600 font-semibold' : 'text-gray-700'}>
                          {pFormatted}
                        </span>
                      </td>
                    );

                  case 'smd':
                    return (
                      <td key={col.key} className={`${cellBase} ${cellWrap} text-center font-mono text-gray-700`} style={{ ...cs, ...heightStyle }} title={smdTooltip}>
                        {smdFormatted}
                      </td>
                    );

                  case 'ntotal':
                    return (
                      <td key={col.key} className={`${cellBase} ${cellWrap} text-center text-gray-700`} style={{ ...cs, ...heightStyle }}>
                        {String(v.overallSummary['n'] ?? '—')}
                      </td>
                    );

                  case 'notes':
                    return (
                      <td key={col.key} className={`${cellBase} ${cellWrap} text-center text-gray-500 text-xs`} style={{ ...cs, ...heightStyle }} title={v.notes.join('; ')}>
                        {v.notes.join('; ')}
                      </td>
                    );

                  default: {
                    if (!col.key.startsWith('grp_')) return null;
                    const gName = col.key.slice(4);
                    const gs = v.summaryByGroup[gName];
                    if (!gs) {
                      return (
                        <td key={col.key} className={`${cellBase} text-center text-gray-400`} style={{ ...cs, ...heightStyle }}>—</td>
                      );
                    }
                    let summaryText = '—';
                    if (isContinuous) {
                      if (isNonNormal) {
                        const med = gs['median'], q25 = gs['q25'], q75 = gs['q75'];
                        if (med !== undefined && q25 !== undefined && q75 !== undefined)
                          summaryText = `${fmt(med as number)} (${fmt(q25 as number)}${iqrDelimiter}${fmt(q75 as number)})`;
                      } else {
                        const m = gs['mean'], s = gs['sd'];
                        if (m !== undefined && s !== undefined) {
                          summaryText = normalTemplate.includes('±')
                            ? `${fmt(m as number)} ± ${fmt(s as number)}`
                            : `${fmt(m as number)} (${fmt(s as number)})`;
                        }
                      }
                    } else if (isCategorical) {
                      const counts = gs['counts'] as Record<string, number> | undefined;
                      const pcts   = gs['percentages'] as Record<string, number> | undefined;
                      if (counts) {
                        summaryText = Object.entries(counts)
                          .map(([k, n]) => {
                            const lbl = resolveLevelLabel(k, varSchemaCol);
                            return `${lbl}: ${n} (${(pcts?.[k] ?? 0).toFixed(1)}%)`;
                          })
                          .join('; ');
                      }
                    }
                    return (
                      <td key={col.key} className={`${cellBase} ${cellWrap} text-center text-gray-700 font-mono text-xs`} style={{ ...cs, ...heightStyle }} title={summaryText}>
                        {summaryText}
                      </td>
                    );
                  }
                }
              };

              return (
                <React.Fragment key={v.variable}>
                  <tr
                    data-varname={v.variable}
                    className={`${rowBg} hover:bg-blue-50/20 transition-colors`}
                  >
                    {visibleCols.map((col) => renderCell(col))}
                  </tr>
                  {hasContradiction && (
                    <tr className="bg-amber-50">
                      <td colSpan={visibleCols.length} className="px-4 py-2 border border-amber-200">
                        <div className="text-amber-800 font-medium text-xs flex items-center gap-1">
                          <span className="font-bold">⚠️ Warning:</span>
                          <span>{warningText}</span>
                        </div>
                      </td>
                    </tr>
                  )}
                  {overrideMismatch && (
                    <tr className="bg-amber-50">
                      <td colSpan={visibleCols.length} className="px-4 py-2 border border-amber-200">
                        <div className="text-amber-800 font-medium text-xs">
                          {overrideMismatch}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Scroll-right fade indicator (static overlay on right edge, disappears on scroll end) */}
      {hasScrollRight && (
        <div className="pointer-events-none absolute right-[1px] top-[1px] bottom-[9px] w-16 bg-gradient-to-l from-white/95 to-transparent z-40 rounded-r-lg" />
      )}
    </div>
  </div>
  );
}
