import type { DataFrame, PlotTheme, Schema } from "../core/types";
import { getWasmBytes } from "./memoryStats";
import { computeSchemaFingerprint, type EDAResults } from "../core/eda/types";
import type { DecisionCurve, LogisticResult, LogisticValidation, MlResult, ModelingDataExport, ModelingRegime, ModelingSetup, OddsRatioRow, SubgroupPerformance } from "../core/modeling/types";

const DEFAULT_PLOT_THEME: PlotTheme = {
  seaborn_style: "whitegrid",
  color_palette: ["#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F", "#EDC948", "#B07AA1", "#FF9DA7"],
  font_family: "DejaVu Sans",
  font_size_base: 9,
  despine: false,
  bar_edge_color: "white",
  bar_edge_linewidth: 0.5,
  line_width: 1.2,
  figure_dpi_screen: 150,
  figure_dpi_export: 300,
};

function proxyToPlain(value: any): any {
  if (value instanceof Map) {
    return Object.fromEntries(Array.from(value.entries()).map(([key, item]) => [key, proxyToPlain(item)]));
  }
  if (Array.isArray(value)) {
    return value.map((item) => proxyToPlain(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, proxyToPlain(item)]));
  }
  return value;
}

function toCamelEDAResult(rawResult: any, schema: Schema): EDAResults {
  const raw = proxyToPlain(rawResult);
  const spearmanByPair = new Map<string, number | undefined>(
    (raw.correlations?.spearman ?? []).map((pair: any) => [`${pair.col_a}|${pair.col_b}`, pair.rho ?? undefined])
  );
  return {
    missingness: {
      perVariable: (raw.missingness?.per_variable ?? []).map((item: any) => ({
        name: item.name,
        displayLabel: item.display_label,
        missingCount: item.missing_count,
        missingPct: item.missing_pct,
      })),
      indicatorCorrelations: (raw.missingness?.indicator_correlations ?? []).map((item: any) => ({
        colA: item.col_a,
        displayA: item.display_a,
        colB: item.col_b,
        displayB: item.display_b,
        correlation: item.correlation,
      })),
      heatmapPng: raw.missingness?.heatmap_png ?? null,
      mcar: raw.missingness?.mcar
        ? {
            statistic: raw.missingness.mcar.statistic ?? null,
            df: raw.missingness.mcar.df ?? 0,
            pValue: raw.missingness.mcar.p_value ?? null,
            nPatterns: raw.missingness.mcar.n_patterns ?? 0,
            note: raw.missingness.mcar.note ?? "",
            experimental: raw.missingness.mcar.experimental ?? undefined,
            verdict: raw.missingness.mcar.verdict ?? undefined,
            approximationNote: raw.missingness.mcar.approximation_note ?? undefined,
          }
        : null,
    },
    correlations: {
      pairs: (raw.correlations?.pearson ?? []).map((item: any) => ({
        colA: item.col_a,
        displayA: item.display_a,
        colB: item.col_b,
        displayB: item.display_b,
        r: item.r,
        rho: spearmanByPair.get(`${item.col_a}|${item.col_b}`),
      })),
      flagged: (raw.correlations?.flagged ?? []).map((item: any) => ({
        colA: item.col_a,
        displayA: item.display_a,
        colB: item.col_b,
        displayB: item.display_b,
        pearsonR: item.pearson_r,
        spearmanRho: item.spearman_rho ?? 0,
      })),
      nContinuous: raw.correlations?.n_continuous ?? 0,
      variableOrder: raw.correlations?.variable_order ?? [],
    },
    bivariate: raw.bivariate
      ? {
          groupingVariable: raw.bivariate.grouping_variable,
          groupingDisplayLabel: raw.bivariate.grouping_display_label,
          plots: (raw.bivariate.plots ?? []).map((item: any) => ({
            variable: item.variable,
            displayLabel: item.display_label,
            plotType: item.plot_type,
            png: item.png,
          })),
        }
      : null,
    mosaic: {
      pairs: (raw.mosaic?.pairs ?? []).map((item: any) => ({
        colA: item.col_a,
        displayA: item.display_a,
        colB: item.col_b,
        displayB: item.display_b,
        png: item.png,
      })),
    },
    vif: (raw.vif ?? []).map((item: any) => ({
      variable: item.variable,
      displayLabel: item.display_label,
      vif: item.vif ?? null,
      severity: item.severity,
    })),
    schemaFingerprint: computeSchemaFingerprint(schema),
    generatedAt: new Date().toISOString(),
  };
}

function toCamelRegime(raw: any): ModelingRegime {
  const sep = raw.separation
    ? {
        separated: raw.separation.separated,
        quasi: raw.separation.quasi,
        convergenceWarning: raw.separation.convergence_warning,
        culprits: raw.separation.culprits ?? [],
        detection: raw.separation.detection,
      }
    : undefined;
  return {
    n: raw.n,
    events: raw.events,
    nonevents: raw.nonevents,
    p: raw.p,
    epv: raw.epv,
    pGeN: raw.p_ge_n,
    recommendedModels: raw.recommended_models ?? [],
    plainMleAllowed: raw.plain_mle_allowed,
    rationale: raw.rationale,
    separation: sep,
  };
}

function toCamelOrRows(rows: any[]): OddsRatioRow[] {
  return (rows ?? []).map((row) => ({
    variable: row.variable,
    label: row.label,
    displayLabel: row.display_label,
    level: row.level,
    or: row.or,
    ciLow: row.ci_low,
    ciHigh: row.ci_high,
    p: row.p,
    ciMethod: row.ci_method,
    method: row.method,
    selectionFrequency: row.selection_frequency ?? null,
  }));
}

function toCamelValidation(raw: any): LogisticValidation {
  return {
    method: raw.method,
    bEffective: raw.b_effective,
    firthFallbackCount: raw.firth_fallback_count,
    ciMethod: raw.ci_method,
    ciLevel: raw.ci_level,
    curveBasis: raw.curve_basis,
    scalarBasis: raw.scalar_basis,
    aucApparent: raw.auc_apparent,
    aucOptimism: raw.auc_optimism,
    aucCorrected: raw.auc_corrected,
    aucCorrectedCi: raw.auc_corrected_ci ?? null,
    calibrationSlope: raw.calibration_slope,
    calibrationSlopeCi: raw.calibration_slope_ci ?? null,
    calibrationIntercept: raw.calibration_intercept,
    calibrationInterceptCi: raw.calibration_intercept_ci ?? null,
    brier: raw.brier,
    brierCi: raw.brier_ci ?? null,
    mcc: raw.mcc ?? null,
    mccCi: raw.mcc_ci ?? null,
    f1: raw.f1 ?? null,
    f1Ci: raw.f1_ci ?? null,
    unstableMetrics: raw.unstable_metrics ?? [],
    unstableReason: raw.unstable_reason ?? null,
    rocCurve: raw.roc_curve ?? [],
    calibrationCurve: raw.calibration_curve ?? [],
  };
}

function toCamelDecisionCurve(raw: any): DecisionCurve | null {
  if (!raw) return null;
  return {
    basis: raw.basis,
    prevalence: raw.prevalence,
    points: (raw.points ?? []).map((point: any) => ({
      threshold: point.threshold,
      netBenefit: point.net_benefit,
      netBenefitTreatAll: point.net_benefit_treat_all,
    })),
  };
}

function toCamelSubgroups(raw: any): SubgroupPerformance[] {
  return (raw ?? []).map((item: any) => ({
    variable: item.variable,
    basis: item.basis,
    levels: (item.levels ?? []).map((level: any) => ({
      level: level.level,
      n: level.n,
      events: level.events,
      auc: level.auc,
      calibrationSlope: level.calibration_slope,
      calibrationIntercept: level.calibration_intercept,
      brier: level.brier,
      reason: level.reason,
    })),
  }));
}

function toCamelModelingDataExport(rawResult: any): ModelingDataExport {
  const raw = typeof rawResult === "string" ? JSON.parse(rawResult) : proxyToPlain(rawResult);
  if (raw.error) {
    const unmatched = raw.unmatched?.length ? ` Unmatched: ${raw.unmatched.join(", ")}.` : "";
    const available = raw.available?.length ? ` Available columns include: ${raw.available.join(", ")}.` : "";
    throw new Error(`${raw.error}${unmatched}${available}`);
  }
  return {
    modelInputMatrix: raw.model_input_matrix ?? [],
    lrPredictedProbabilities: raw.lr_predicted_probabilities ?? [],
    mlOofPredictions: raw.ml_oof_predictions ?? [],
    mlRocCurve: raw.ml_roc_curve ?? [],
    mlCalibration: raw.ml_calibration ?? [],
    mlVariableImportance: raw.ml_variable_importance ?? [],
    mlMetrics: raw.ml_metrics ?? [],
    warnings: raw.warnings ?? [],
  };
}

function toCamelLogisticResult(rawResult: any): LogisticResult {
  const raw = typeof rawResult === "string" ? JSON.parse(rawResult) : proxyToPlain(rawResult);
  if (raw.error) {
    const unmatched = raw.unmatched?.length ? ` Unmatched: ${raw.unmatched.join(", ")}.` : "";
    const available = raw.available?.length ? ` Available columns include: ${raw.available.join(", ")}.` : "";
    throw new Error(`${raw.error}${unmatched}${available}`);
  }
  return {
    regime: toCamelRegime(raw.regime),
    univariate: toCamelOrRows(raw.univariate),
    adjusted: toCamelOrRows(raw.adjusted),
    equation: raw.equation,
    selected: raw.selected ?? [],
    model: raw.model,
    lambda: raw.lambda,
    lambdaRuleApplied: raw.lambda_rule_applied,
    outcomeEventLevel: raw.outcome_event_level,
    outcomeReferenceLevel: raw.outcome_reference_level,
    imputationMethod: raw.imputation_method,
    diagnostics: raw.diagnostics ?? {},
    unmatchedPredictors: raw.unmatched ?? raw.diagnostics?.unmatched_predictors ?? [],
    validation: raw.validation ? toCamelValidation(raw.validation) : null,
    decisionCurve: toCamelDecisionCurve(raw.decision_curve),
    subgroups: toCamelSubgroups(raw.subgroups),
  };
}

function toMetricSummary(raw: any) {
  return {
    mean: raw?.mean ?? null,
    sd: raw?.sd ?? null,
    ciLow: raw?.ci_low ?? null,
    ciHigh: raw?.ci_high ?? null,
    ciBasis: raw?.ci_basis,
  };
}

function toCamelMlResult(rawResult: any): MlResult {
  const raw = typeof rawResult === "string" ? JSON.parse(rawResult) : proxyToPlain(rawResult);
  if (raw.error) {
    const unmatched = raw.unmatched?.length ? ` Unmatched: ${raw.unmatched.join(", ")}.` : "";
    const available = raw.available?.length ? ` Available columns include: ${raw.available.join(", ")}.` : "";
    throw new Error(`${raw.error}${unmatched}${available}`);
  }
  const toMetrics = (metrics: any) => ({
    auc: toMetricSummary(metrics?.auc),
    sens: toMetricSummary(metrics?.sens),
    spec: toMetricSummary(metrics?.spec),
    balacc: toMetricSummary(metrics?.balacc),
    mcc: toMetricSummary(metrics?.mcc),
    f1: toMetricSummary(metrics?.f1),
  });
  return {
    models: (raw.models ?? []).map((model: any) => ({
      name: model.name,
      metrics: toMetrics(model.metrics),
      roc: {
        grid: model.roc?.grid ?? [],
        mean: model.roc?.mean ?? [],
        sd: model.roc?.sd ?? [],
      },
      varImportance: (model.var_importance ?? []).map((item: any) => ({ name: item.name, score: item.score })),
      importanceAvailable: model.importance_available ?? true,
      calibration: {
        slope: model.calibration?.slope ?? null,
        intercept: model.calibration?.intercept ?? null,
        curve: model.calibration?.curve ?? [],
        brier: model.calibration?.brier ?? null,
      },
      confusion: model.confusion ?? { tp: 0, fp: 0, fn: 0, tn: 0 },
      confusionBasis: model.confusion_basis,
      classificationThreshold: model.classification_threshold,
      cvFolds: model.cv_folds,
      cvRepeats: model.cv_repeats,
      decisionCurve: toCamelDecisionCurve(model.decision_curve),
      subgroups: toCamelSubgroups(model.subgroups),
      hyperparameters: model.hyperparameters ?? {},
    })),
    comparison: (raw.comparison ?? []).map((row: any) => ({
      model: row.model,
      ...toMetrics(row),
    })),
    folds: {
      nSplits: raw.folds?.n_splits ?? 0,
      nRepeats: raw.folds?.n_repeats ?? 0,
      seed: raw.folds?.seed ?? 0,
    },
    warnings: raw.warnings ?? [],
    imputationMethod: raw.imputation_method,
    nEvaluated: raw.n_evaluated,
    confusionBasis: raw.confusion_basis,
    classificationThreshold: raw.classification_threshold,
  };
}



/**
 * Client for the local scientific-Python engine. Browser calls use a dedicated Worker with request IDs;
 * Node/Vitest uses the in-process Pyodide fallback. Both paths resolve through the same Python function contract.
 */
export class PyodideClient {
  private worker: Worker | null = null;
  private callId = 0;
  private pendingCalls = new Map<
    number,
    { resolve: (val: any) => void; reject: (err: any) => void }
  >();
  private workerError: Error | null = null;

  private localPyodideReady: Promise<any> | null = null;
  private localPy: any = null;

  /** Creates a module worker when the browser Worker API is available; otherwise calls use the local fallback. */
  constructor() {
    if (typeof Worker !== "undefined") {
      this.createWorker();
    }
  }

  private createWorker() {
    this.worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });
    this.workerError = null;
    this.worker.onmessage = (e) => {
        const { id, result, error } = e.data;
        const deferred = this.pendingCalls.get(id);
        if (deferred) {
          if (error) {
            deferred.reject(new Error(error));
          } else {
            deferred.resolve(result);
          }
          this.pendingCalls.delete(id);
        }
    };
    const onFailure = (reason: string) => {
      const error = new Error(`Analysis engine stopped: ${reason}`);
      this.workerError = error;
      for (const deferred of this.pendingCalls.values()) deferred.reject(error);
      this.pendingCalls.clear();
      this.initializationPromise = null;
    };
    this.worker.onerror = (event) => { event.preventDefault(); onFailure(event.message || "worker error"); };
    this.worker.onmessageerror = () => onFailure("worker message could not be read");
  }

  private rejectPending(error: Error) {
    for (const deferred of this.pendingCalls.values()) deferred.reject(error);
    this.pendingCalls.clear();
  }



  /**
   * Calls a named Python function with positional arguments and returns its worker/fallback result.
   * The worker path correlates concurrent calls by request ID; Python errors reject the matching promise.
   */
  async call(fnName: string, args: any[] = []): Promise<any> {
    if (this.worker) {
      if (this.workerError) return Promise.reject(this.workerError);
      const id = ++this.callId;
      return new Promise((resolve, reject) => {
        this.pendingCalls.set(id, { resolve, reject });
        this.worker?.postMessage({ id, fnName, args });
      });
    } else {
      // Fallback for Node/Vitest environment
      if (!this.localPy) {
        if (!this.localPyodideReady) {
          this.localPyodideReady = (async () => {
            const { loadPyodide } = await import("pyodide");
            const py = await loadPyodide();
            await py.loadPackage(["scipy", "statsmodels", "numpy", "pandas", "matplotlib", "fonttools", "scikit-learn"]);
            // Offline load of Seaborn wheel from disk
            const path = await import("node:path");
            const fs = await import("node:fs");
            const wheelPath = path.resolve(process.cwd(), "public/pyodide-314.0.0a1/extra-wheels/seaborn-0.13.2-py3-none-any.whl");
            const wheelBuffer = fs.readFileSync(wheelPath);
            py.FS.writeFile("/seaborn-0.13.2-py3-none-any.whl", new Uint8Array(wheelBuffer));
            await py.runPythonAsync(`
              import sys
              import zipfile
              site_pkgs = [p for p in sys.path if 'site-packages' in p][0]
              with zipfile.ZipFile('/seaborn-0.13.2-py3-none-any.whl', 'r') as zf:
                  zf.extractall(site_pkgs)
            `);
            const scikitPosthocsWheelPath = path.resolve(process.cwd(), "public/pyodide-314.0.0a1/extra-wheels/scikit_posthocs-0.14.0-py3-none-any.whl");
            const scikitPosthocsWheelBuffer = fs.readFileSync(scikitPosthocsWheelPath);
            py.FS.writeFile("/scikit_posthocs-0.14.0-py3-none-any.whl", new Uint8Array(scikitPosthocsWheelBuffer));
            await py.runPythonAsync(`
              import sys
              import zipfile
              site_pkgs = [p for p in sys.path if 'site-packages' in p][0]
              with zipfile.ZipFile('/scikit_posthocs-0.14.0-py3-none-any.whl', 'r') as zf:
                  zf.extractall(site_pkgs)
            `);
            const tabulateWheelPath = path.resolve(process.cwd(), "public/pyodide-314.0.0a1/extra-wheels/tabulate-0.10.0-py3-none-any.whl");
            const tabulateWheelBuffer = fs.readFileSync(tabulateWheelPath);
            py.FS.writeFile("/tabulate-0.10.0-py3-none-any.whl", new Uint8Array(tabulateWheelBuffer));
            await py.runPythonAsync(`
              import sys
              import zipfile
              site_pkgs = [p for p in sys.path if 'site-packages' in p][0]
              with zipfile.ZipFile('/tabulate-0.10.0-py3-none-any.whl', 'r') as zf:
                  zf.extractall(site_pkgs)
            `);
            const firthlogistWheelPath = path.resolve(process.cwd(), "public/pyodide-314.0.0a1/extra-wheels/firthlogist-0.5.0-py3-none-any.whl");
            const firthlogistWheelBuffer = fs.readFileSync(firthlogistWheelPath);
            py.FS.writeFile("/firthlogist-0.5.0-py3-none-any.whl", new Uint8Array(firthlogistWheelBuffer));
            await py.runPythonAsync(`
              import sys
              import zipfile
              site_pkgs = [p for p in sys.path if 'site-packages' in p][0]
              with zipfile.ZipFile('/firthlogist-0.5.0-py3-none-any.whl', 'r') as zf:
                  zf.extractall(site_pkgs)
            `);

            // Offline load of DejaVu Sans font from disk
            const fontPath = path.resolve(process.cwd(), "public/pyodide-314.0.0a1/fonts/DejaVuSans.ttf");
            const fontBuffer = fs.readFileSync(fontPath);
            py.FS.writeFile("/DejaVuSans.ttf", new Uint8Array(fontBuffer));
            await py.runPythonAsync(`
              import matplotlib as mpl
              import matplotlib.font_manager as fm
              fm.fontManager.addfont('/DejaVuSans.ttf')
              mpl.rcParams['font.family'] = 'DejaVu Sans'
            `);

            this.localPy = py;
            return py;
          })();
        }
        await this.localPyodideReady;
      }

      const py = this.localPy;
      if (fnName === "check_ready") return true;
      if (fnName === "run_python") {
        return py.runPythonAsync(args[0]);
      }

      const fn = py.globals.get(fnName);
      if (fn) {
        let result = fn(...(args || []));
        if (result && typeof result.toJs === "function") {
          result = result.toJs();
        }
        return result;
      } else {
        throw new Error(`Function ${fnName} not found`);
      }
    }
  }



  /** Reports available WebAssembly and JavaScript heap byte counts; unsupported measurements are `null`. */
  async getMemoryStats(): Promise<{ wasmBytes: number | null; jsHeapBytes: number | null }> {
    const result = this.worker
      ? await this.call("getMemoryStats")
      : { wasmBytes: this.localPy ? getWasmBytes(this.localPy) : null };
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
    return { wasmBytes: result.wasmBytes, jsHeapBytes: memory?.usedJSHeapSize ?? null };
  }

  private initializationPromise: Promise<boolean> | null = null;



  /**
   * Checks engine readiness and, when ready, installs the bundled statistics, plot, EDA, and modeling modules once.
   * Concurrent callers share the initialization promise; the result reports the engine's readiness check.
   */
  async isReady(): Promise<boolean> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }
    const initialization = (async () => {
      const ready = await this.call("check_ready");
      if (ready) {
        // Inject the stats code
        const easytableStatsCode = (await import("./python/easytable_stats.py?raw")).default;
        await this.call("run_python", [easytableStatsCode]);
        // Inject the plots code
        const easytablePlotsCode = (await import("./python/easytable_plots.py?raw")).default;
        await this.call("run_python", [easytablePlotsCode]);
        const easytableEdaCode = (await import("./python/easytable_eda.py?raw")).default;
        await this.call("run_python", [easytableEdaCode]);
        const easytableModelingCode = (await import("./python/easytable_modeling.py?raw")).default;
        await this.call("run_python", [easytableModelingCode]);
      }
      return ready;
    })();
    this.initializationPromise = initialization;
    try {
      const ready = await initialization;
      if (!ready && this.initializationPromise === initialization) this.initializationPromise = null;
      return ready;
    } catch (error) {
      if (this.initializationPromise === initialization) this.initializationPromise = null;
      throw error;
    }
  }

  /** Restarts the worker after an initialization failure without changing its message protocol. */
  async restart(): Promise<boolean> {
    const error = new Error("Analysis engine stopped: restarting.");
    this.worker?.terminate();
    this.rejectPending(error);
    this.initializationPromise = null;
    if (typeof Worker !== "undefined") {
      this.createWorker();
    } else {
      this.localPy = null;
      this.localPyodideReady = null;
    }
    return this.isReady();
  }



  /**
   * Installs a wheel from the repository's vendored `extra-wheels` directory in the Node/Vitest fallback only.
   * Browser-worker calls reject because production wheels are bundled with the engine instead.
   * @returns The resolved local path of the installed wheel.
   */
  async loadLocalExtraWheel(wheelFileName: string): Promise<string> {
    await this.isReady();
    if (this.worker || !this.localPy) {
      throw new Error("Local extra-wheel loading is available only in the Node/Vitest Pyodide fallback.");
    }
    const path = await import("node:path");
    const fs = await import("node:fs");
    const wheelPath = path.resolve(process.cwd(), "public/pyodide-314.0.0a1/extra-wheels", wheelFileName);
    const wheelBuffer = fs.readFileSync(wheelPath);
    const pyPath = `/${wheelFileName}`;
    this.localPy.FS.writeFile(pyPath, new Uint8Array(wheelBuffer));
    await this.localPy.runPythonAsync(`
import sys
import zipfile
site_pkgs = [p for p in sys.path if 'site-packages' in p][0]
with zipfile.ZipFile(${JSON.stringify(pyPath)}, 'r') as zf:
    zf.extractall(site_pkgs)
`);
    return wheelPath;
  }



  /**
   * Renders a small PNG data URL from plot data using the selected plot theme and screen DPI defaults.
   * A numeric third argument is the legacy width shorthand; otherwise it is a `PlotTheme`.
   */
  async renderThumbnail(
    data: any,
    plotType: 'histogram' | 'qqplot' | 'barchart' | 'boxplot',
    plotThemeOrWidth: PlotTheme | number = DEFAULT_PLOT_THEME,
    widthIn = 3.0,
    heightIn = 2.0,
    dpi?: number
  ): Promise<string> {
    const plotTheme = typeof plotThemeOrWidth === "number" ? DEFAULT_PLOT_THEME : plotThemeOrWidth;
    const effectiveWidth = typeof plotThemeOrWidth === "number" ? plotThemeOrWidth : widthIn;
    const effectiveHeight = typeof plotThemeOrWidth === "number" ? widthIn : heightIn;
    const effectiveDpi = typeof plotThemeOrWidth === "number" ? (dpi ?? heightIn) : (dpi ?? plotTheme.figure_dpi_screen);
    return this.call("render_thumbnail", [JSON.stringify(data), plotType, JSON.stringify(plotTheme), effectiveWidth, effectiveHeight, effectiveDpi]);
  }



  /**
   * Renders a publication-size figure as a data URL in PNG, PDF, or SVG format.
   * Dimensions, DPI, and typography are passed to the local Python plot renderer; a numeric third argument is the legacy width shorthand.
   */
  async renderPublicationFigure(
    data: any,
    plotType: 'histogram' | 'qqplot' | 'barchart' | 'boxplot',
    plotThemeOrWidth: PlotTheme | number = DEFAULT_PLOT_THEME,
    widthIn = 6.0,
    heightIn = 4.0,
    dpi?: number,
    format: "png" | "pdf" | "svg" = "png",
    fontScale = 1.0,
  ): Promise<string> {
    const plotTheme = typeof plotThemeOrWidth === "number" ? DEFAULT_PLOT_THEME : plotThemeOrWidth;
    const effectiveWidth = typeof plotThemeOrWidth === "number" ? plotThemeOrWidth : widthIn;
    const effectiveHeight = typeof plotThemeOrWidth === "number" ? widthIn : heightIn;
    const effectiveDpi = typeof plotThemeOrWidth === "number" ? (dpi ?? heightIn) : (dpi ?? plotTheme.figure_dpi_export);
    return this.call("render_publication_figure", [JSON.stringify(data), plotType, JSON.stringify(plotTheme), effectiveWidth, effectiveHeight, effectiveDpi, format, fontScale]);
  }



  /** Computes EDA locally for the supplied frame/schema, then converts the Python payload to the typed camel-case result. */
  async computeEDA(
    data: DataFrame,
    schema: Schema,
    plotTheme: PlotTheme,
    groupingVariable: string | null,
  ): Promise<EDAResults> {
    await this.isReady();
    const rawResult = await this.call("compute_eda", [
      JSON.stringify(data),
      JSON.stringify(schema),
      JSON.stringify(plotTheme),
      groupingVariable,
    ]);
    return toCamelEDAResult(rawResult, schema);
  }



  /** Classifies the modeling regime from dataset metadata without returning row-level data. */
  async detectRegime(meta: Record<string, unknown>): Promise<ModelingRegime> {
    await this.isReady();
    const raw = await this.call("detect_regime", [JSON.stringify(meta)]);
    return toCamelRegime(typeof raw === "string" ? JSON.parse(raw) : proxyToPlain(raw));
  }



  /** Detects logistic separation for the configured outcome/predictors and returns its typed diagnostic, throwing Python errors. */
  async detectSeparation(data: DataFrame, schema: Schema, setup: ModelingSetup): Promise<NonNullable<ModelingRegime["separation"]>> {
    await this.isReady();
    const raw = await this.call("detect_separation", [
      JSON.stringify(data),
      JSON.stringify(schema),
      setup.outcome,
      JSON.stringify(setup.predictors),
      JSON.stringify(setup.referenceLevels),
      JSON.stringify(setup),
    ]);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : proxyToPlain(raw);
    if (parsed.error) throw new Error(parsed.error);
    return {
      separated: parsed.separated,
      quasi: parsed.quasi,
      convergenceWarning: parsed.convergence_warning,
      culprits: parsed.culprits ?? [],
      detection: parsed.detection,
    };
  }



  /** Fits the configured univariate logistic comparisons locally and maps Python rows into the public odds-ratio shape. */
  async computeUnivariateOR(data: DataFrame, schema: Schema, setup: ModelingSetup): Promise<OddsRatioRow[]> {
    await this.isReady();
    const raw = await this.call("univariate_or", [
      JSON.stringify(data),
      JSON.stringify(schema),
      setup.outcome,
      JSON.stringify(setup.predictors),
      JSON.stringify(setup.referenceLevels),
      JSON.stringify(setup),
    ]);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : proxyToPlain(raw);
    if (parsed.error) throw new Error(parsed.error);
    return toCamelOrRows(parsed);
  }



  /** Fits the configured logistic model and returns its validated/camel-case result, including regime and interval metadata. */
  async fitLogisticModel(data: DataFrame, schema: Schema, setup: ModelingSetup): Promise<LogisticResult> {
    await this.isReady();
    const raw = await this.call("run_logistic_model", [
      JSON.stringify(data),
      JSON.stringify(schema),
      JSON.stringify(setup),
    ]);
    return toCamelLogisticResult(raw);
  }



  /** Runs the configured machine-learning benchmark in the local engine and returns its typed validation results. */
  async runMlBenchmark(data: DataFrame, schema: Schema, setup: ModelingSetup): Promise<MlResult> {
    await this.isReady();
    const raw = await this.call("run_ml_benchmark", [
      JSON.stringify(data),
      JSON.stringify(schema),
      JSON.stringify(setup),
    ]);
    return toCamelMlResult(raw);
  }



  /**
   * Returns the modeling-data export: input matrix and prediction/curve/metric rows produced by the selected setup.
   * Some returned arrays are observation-level and are intended for the user's explicit modeling-data export; this is not
   * the aggregate-only reproducibility record governed by D105(a′).
   */
  async exportModelingData(data: DataFrame, schema: Schema, setup: ModelingSetup): Promise<ModelingDataExport> {
    await this.isReady();
    const raw = await this.call("export_modeling_data", [
      JSON.stringify(data),
      JSON.stringify(schema),
      JSON.stringify(setup),
    ]);
    return toCamelModelingDataExport(raw);
  }



  /** Runs logistic validation for the selected setup and maps Python errors to rejected promises and results to the typed contract. */
  async validateLogistic(data: DataFrame, schema: Schema, setup: ModelingSetup): Promise<LogisticValidation> {
    await this.isReady();
    const raw = await this.call("validate_lr", [
      JSON.stringify(data),
      JSON.stringify(schema),
      JSON.stringify(setup),
    ]);
    const parsed = typeof raw === "string" ? JSON.parse(raw) : proxyToPlain(raw);
    if (parsed.error) throw new Error(parsed.error);
    return toCamelValidation(parsed);
  }
}


/** Shared application client for all calls to the local Pyodide engine. */
export const pyodideClient = new PyodideClient();
