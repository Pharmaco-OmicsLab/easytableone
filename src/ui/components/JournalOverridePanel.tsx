import { useState, useEffect, useRef } from "react";
import { useStore } from "../../store";
import { journalRulesets } from "../../core/format/formatTable";
import type { UserOverrides } from "../../core/types";

export default function JournalOverridePanel({ hideHeader = false, layout }: { hideHeader?: boolean; layout?: "narrow" | "wide" }) {
  const { plan, setPlan, journalId } = useStore();

  const journalConfig = journalRulesets.EasyTableOne_Ruleset.journals.find(
    (j) => j.journal_id === journalId
  );

  const defaultThousand = journalConfig?.number_format?.thousand_separator ?? false;
  const defaultDecimals = journalConfig?.number_format?.decimal_precision ?? 1;
  const defaultSuppressZeros = journalConfig?.number_format?.suppress_trailing_zero ?? true;
  const defaultIqrDelim = journalConfig?.summary_statistics.iqr_delimiter ?? " to ";
  const defaultPThreshold = journalConfig?.p_value_formatting.threshold_low ?? "<0.001";
  const defaultPSigDigits = journalConfig?.p_value_formatting.max_decimal_places ?? 3;
  const conditionalPValueDecimals = journalConfig?.p_value_formatting.conditional_decimals ?? [];
  const hasConditionalPValueDecimals = (journalConfig?.p_value_formatting.conditional_decimals?.length ?? 0) > 0;
  const conditionalPValueDefault = describeConditionalPValueDefault(conditionalPValueDecimals, defaultPSigDigits);
  const defaultTitleTemplate = journalConfig?.table_title_template ?? "";
  const defaultCodingTitle = journalConfig?.variable_coding_section_title ?? "";

  const [thousand, setThousand] = useState<boolean>(defaultThousand);
  const [decimals, setDecimals] = useState<number>(defaultDecimals);
  const [suppressZeros, setSuppressZeros] = useState<boolean>(defaultSuppressZeros);
  const [iqrDelim, setIqrDelim] = useState<string>(defaultIqrDelim);
  const [pThreshold, setPThreshold] = useState<string>(defaultPThreshold);
  const [pSigDigits, setPSigDigits] = useState<number>(defaultPSigDigits);
  const [titleTemplate, setTitleTemplate] = useState<string>(defaultTitleTemplate);
  const [codingTitle, setCodingTitle] = useState<string>(defaultCodingTitle);
  const [showZeroLevels, setShowZeroLevels] = useState<boolean>(false);
  const [showMissingRows, setShowMissingRows] = useState<boolean>(false);
  const [suppressCoding, setSuppressCoding] = useState<boolean>(
    journalConfig?.variable_coding_section_title === null
  );

  const [pValError, setPValError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isWide, setIsWide] = useState(layout === "wide");

  useEffect(() => {
    if (layout) {
      setIsWide(layout === "wide");
      return;
    }
    const panel = panelRef.current;
    if (!panel || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => setIsWide(entry.contentRect.width >= 640));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [layout]);

  // Sync state when journal changes
  useEffect(() => {
    if (!journalConfig) return;
    const overrides = plan?.userOverrides;

    setThousand(overrides?.numberFormat?.thousandSeparator ?? defaultThousand);
    setDecimals(overrides?.numberFormat?.decimalPlaces ?? defaultDecimals);
    setSuppressZeros(overrides?.numberFormat?.suppressTrailingZeros ?? defaultSuppressZeros);
    setIqrDelim(overrides?.iqrDelimiter ?? defaultIqrDelim);
    setPThreshold(overrides?.pValueThreshold ?? defaultPThreshold);
    setPSigDigits(overrides?.pValueSignificantDigits ?? defaultPSigDigits);
    setTitleTemplate(overrides?.titleTemplate ?? defaultTitleTemplate);
    setCodingTitle(overrides?.variableCodingSectionTitle ?? defaultCodingTitle);
    setShowZeroLevels(Boolean(overrides?.showPlannedZeroCountLevels));
    setShowMissingRows(Boolean(overrides?.showMissingDataRows));
    setSuppressCoding(
      overrides?.variableCodingSectionTitle === null ||
      (overrides?.variableCodingSectionTitle === undefined && journalConfig.variable_coding_section_title === null)
    );
    setPValError(null);
  }, [journalId, journalConfig]);

  if (!plan || !journalConfig) return null;

  const handleUpdate = (updated: Partial<UserOverrides>) => {
    const current = plan.userOverrides || {};
    const nextOverrides: UserOverrides = { ...current };

    if (updated.numberFormat !== undefined || thousand !== defaultThousand || decimals !== defaultDecimals || suppressZeros !== defaultSuppressZeros) {
      const nf = {
        ...(current.numberFormat || {}),
        ...(updated.numberFormat || {}),
      };
      // Only keep override values that differ from ruleset default
      const cleanNf: any = {};
      const newThousand = nf.thousandSeparator !== undefined ? nf.thousandSeparator : thousand;
      if (newThousand !== defaultThousand) cleanNf.thousandSeparator = newThousand;

      const newDecimals = nf.decimalPlaces !== undefined ? nf.decimalPlaces : decimals;
      if (newDecimals !== defaultDecimals) cleanNf.decimalPlaces = newDecimals;

      const newSuppress = nf.suppressTrailingZeros !== undefined ? nf.suppressTrailingZeros : suppressZeros;
      if (newSuppress !== defaultSuppressZeros) cleanNf.suppressTrailingZeros = newSuppress;

      if (Object.keys(cleanNf).length > 0) {
        nextOverrides.numberFormat = cleanNf;
      } else {
        delete nextOverrides.numberFormat;
      }
    }

    if (updated.iqrDelimiter !== undefined) {
      if (updated.iqrDelimiter !== defaultIqrDelim) {
        nextOverrides.iqrDelimiter = updated.iqrDelimiter;
      } else {
        delete nextOverrides.iqrDelimiter;
      }
    }

    if (updated.pValueThreshold !== undefined) {
      if (updated.pValueThreshold !== defaultPThreshold) {
        nextOverrides.pValueThreshold = updated.pValueThreshold;
      } else {
        delete nextOverrides.pValueThreshold;
      }
    }

    if (updated.pValueSignificantDigits !== undefined) {
      if (hasConditionalPValueDecimals || updated.pValueSignificantDigits !== defaultPSigDigits) {
        nextOverrides.pValueSignificantDigits = updated.pValueSignificantDigits;
      } else {
        delete nextOverrides.pValueSignificantDigits;
      }
    }

    if (updated.titleTemplate !== undefined) {
      if (updated.titleTemplate !== defaultTitleTemplate) {
        nextOverrides.titleTemplate = updated.titleTemplate;
      } else {
        delete nextOverrides.titleTemplate;
      }
    }

    if (updated.variableCodingSectionTitle !== undefined) {
      if (updated.variableCodingSectionTitle !== defaultCodingTitle) {
        nextOverrides.variableCodingSectionTitle = updated.variableCodingSectionTitle;
      } else {
        delete nextOverrides.variableCodingSectionTitle;
      }
    }

    if (updated.showPlannedZeroCountLevels !== undefined) {
      if (updated.showPlannedZeroCountLevels) {
        nextOverrides.showPlannedZeroCountLevels = true;
      } else {
        delete nextOverrides.showPlannedZeroCountLevels;
      }
    }

    if (updated.showMissingDataRows !== undefined) {
      if (updated.showMissingDataRows) {
        nextOverrides.showMissingDataRows = true;
      } else {
        delete nextOverrides.showMissingDataRows;
      }
    }

    setPlan({
      ...plan,
      userOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
    });
  };

  const resetToDefaults = () => {
    setThousand(defaultThousand);
    setDecimals(defaultDecimals);
    setSuppressZeros(defaultSuppressZeros);
    setIqrDelim(defaultIqrDelim);
    setPThreshold(defaultPThreshold);
    setPSigDigits(defaultPSigDigits);
    setTitleTemplate(defaultTitleTemplate);
    setCodingTitle(defaultCodingTitle);
    setShowZeroLevels(false);
    setShowMissingRows(false);
    setSuppressCoding(journalConfig.variable_coding_section_title === null);
    setPValError(null);

    setPlan({
      ...plan,
      userOverrides: undefined,
    });
  };

  const isThousandOverridden = plan.userOverrides?.numberFormat?.thousandSeparator !== undefined;
  const isDecimalsOverridden = plan.userOverrides?.numberFormat?.decimalPlaces !== undefined;
  const isSuppressZerosOverridden = plan.userOverrides?.numberFormat?.suppressTrailingZeros !== undefined;
  const isIqrDelimOverridden = plan.userOverrides?.iqrDelimiter !== undefined;
  const isPThresholdOverridden = plan.userOverrides?.pValueThreshold !== undefined;
  const isPSigDigitsOverridden = plan.userOverrides?.pValueSignificantDigits !== undefined;
  const isTitleTemplateOverridden = plan.userOverrides?.titleTemplate !== undefined;
  const isCodingTitleOverridden = plan.userOverrides?.variableCodingSectionTitle !== undefined;
  const isShowZeroLevelsOverridden = plan.userOverrides?.showPlannedZeroCountLevels !== undefined;
  const isShowMissingRowsOverridden = plan.userOverrides?.showMissingDataRows !== undefined;

  const hasAnyOverride = plan.userOverrides && Object.keys(plan.userOverrides).length > 0;

  return (
    <div ref={panelRef} data-testid="journal-override-panel" data-layout={isWide ? "wide" : "narrow"} className={hideHeader ? "space-y-6" : "bg-white border rounded-xl p-6 shadow-sm space-y-6"}>
      {!hideHeader && (
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">Journal Formatting Overrides</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Customize defaults for <strong>{journalConfig.display_name}</strong>. Settings apply to this session only.
            </p>
          </div>
          {hasAnyOverride && (
            <button
              onClick={resetToDefaults}
              className="text-xs text-red-600 hover:text-red-700 font-semibold border border-red-200 px-3 py-1.5 rounded-lg bg-red-50/50 hover:bg-red-50 transition"
            >
              Reset to Defaults
            </button>
          )}
        </div>
      )}
      {hideHeader && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-gray-500">
            Customize defaults for <strong>{journalConfig.display_name}</strong>. Settings apply to this session only.
          </p>
          {hasAnyOverride && (
            <button
              onClick={resetToDefaults}
              className="text-xs text-red-600 hover:text-red-700 font-semibold border border-red-200 px-3 py-1.5 rounded-lg bg-red-50/50 hover:bg-red-50 transition"
            >
              Reset to Defaults
            </button>
          )}
        </div>
      )}

      <div data-testid="override-settings-grid" className={`grid gap-6 ${isWide ? "grid-cols-2" : "grid-cols-1"}`}>
        {/* Left column: Number Formatting */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">Number Formatting</h4>
          
          <div className="flex flex-col items-stretch gap-2 p-2 rounded-lg hover:bg-gray-50">
            <div className="flex flex-col">
              <label htmlFor="thousand-separator" className="text-sm font-medium text-gray-800">Thousand Separator</label>
              <span className="text-xs text-gray-600">Default: {defaultThousand ? "Yes" : "No"}</span>
            </div>
            <div className="flex items-center space-x-2">
              {isThousandOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
              <input
                id="thousand-separator"
                type="checkbox"
                checked={thousand}
                onChange={(e) => {
                  const val = e.target.checked;
                  setThousand(val);
                  handleUpdate({ numberFormat: { thousandSeparator: val } });
                }}
                className="w-4.5 h-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 p-2 rounded-lg hover:bg-gray-50">
            <div className="flex flex-col">
              <label htmlFor="decimal-precision" className="text-sm font-medium text-gray-800">Decimal Precision</label>
              <span className="text-xs text-gray-600">Default: {defaultDecimals} places</span>
            </div>
            <div className="flex items-center gap-2 w-full">
              {isDecimalsOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
              <select
                id="decimal-precision"
                value={decimals}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setDecimals(val);
                  handleUpdate({ numberFormat: { decimalPlaces: val } });
                }}
                className="w-full border rounded-lg p-1.5 text-sm bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {[0, 1, 2, 3, 4].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 p-2 rounded-lg hover:bg-gray-50">
            <div className="flex flex-col">
              <label htmlFor="suppress-zeros" className="text-sm font-medium text-gray-800">Suppress Trailing Zeros</label>
              <span className="text-xs text-gray-600">Default: {defaultSuppressZeros ? "Yes" : "No"}</span>
            </div>
            <div className="flex items-center gap-2 w-full">
              {isSuppressZerosOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
              <input
                id="suppress-zeros"
                type="checkbox"
                checked={suppressZeros}
                onChange={(e) => {
                  const val = e.target.checked;
                  setSuppressZeros(val);
                  handleUpdate({ numberFormat: { suppressTrailingZeros: val } });
                }}
                className="w-4.5 h-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 p-2 rounded-lg hover:bg-gray-50">
            <div className="flex flex-col w-full">
              <label htmlFor="iqr-delimiter" className="text-sm font-medium text-gray-800">IQR Delimiter</label>
              <span className="text-xs text-gray-600">Default: "{defaultIqrDelim}"</span>
            </div>
            <div className="flex items-center gap-2 w-full">
              {isIqrDelimOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
              <input
                id="iqr-delimiter"
                type="text"
                value={iqrDelim}
                onChange={(e) => {
                  const val = e.target.value;
                  setIqrDelim(val);
                  handleUpdate({ iqrDelimiter: val });
                }}
                className="border rounded-lg p-1.5 text-sm w-full focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Right column: P-values & Metadata */}
        <div className="space-y-4">
          <h4 className="font-semibold text-sm text-gray-700 uppercase tracking-wider">P-values & Text Titles</h4>

          <div className="flex flex-col items-stretch gap-2 p-2 rounded-lg hover:bg-gray-50">
            <div className="flex flex-col w-full">
              <label htmlFor="p-value-threshold" className="text-sm font-medium text-gray-800">P-value Threshold</label>
              <span className="text-xs text-gray-600">Default: {defaultPThreshold}</span>
            </div>
            <div className="flex flex-col items-start space-y-1 w-full">
              <div className="flex items-center gap-2 w-full">
                {isPThresholdOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
                <input
                  id="p-value-threshold"
                  type="text"
                  value={pThreshold}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPThreshold(val);
                    if (/^<\d*\.?\d+$/.test(val)) {
                      setPValError(null);
                      handleUpdate({ pValueThreshold: val });
                    } else {
                      setPValError("Must start with '<' followed by decimal.");
                    }
                  }}
                  className={`border rounded-lg p-1.5 text-sm w-full focus:ring-blue-500 focus:border-blue-500 ${pValError ? "border-red-400" : ""}`}
                />
              </div>
              {pValError && <span className="text-xs text-red-600">{pValError}</span>}
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 p-2 rounded-lg hover:bg-gray-50">
            <div className="flex flex-col">
              <label htmlFor="p-sig-digits" className="text-sm font-medium text-gray-800">P-value Max Decimals</label>
              <span className="text-xs text-gray-600">{conditionalPValueDefault}</span>
              {hasConditionalPValueDecimals && (
                <details className="text-xs text-gray-600">
                  <summary className="cursor-pointer text-blue-700">Why?</summary>
                  <p className="mt-1">Overrides this journal's conditional P-value rounding rules and applies a fixed number of decimal places.</p>
                </details>
              )}
            </div>
            <div className="flex items-center gap-2 w-full">
              {isPSigDigitsOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
              <select
                id="p-sig-digits"
                value={pSigDigits}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setPSigDigits(val);
                  handleUpdate({ pValueSignificantDigits: val });
                }}
                className="w-full border rounded-lg p-1.5 text-sm bg-white shadow-sm focus:ring-blue-500 focus:border-blue-500"
              >
                {[1, 2, 3, 4].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col p-2 rounded-lg hover:bg-gray-50 space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="title-template" className="text-sm font-medium text-gray-800">Table Title Template</label>
              <div className="flex items-center space-x-2">
                {isTitleTemplateOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
              </div>
            </div>
            <input
              id="title-template"
              type="text"
              value={titleTemplate}
              onChange={(e) => {
                const val = e.target.value;
                setTitleTemplate(val);
                handleUpdate({ titleTemplate: val });
              }}
              className="border rounded-lg p-2 text-sm w-full focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g. Table 1: Baseline Characteristics, by {grouping_label}"
            />
            <span className="text-xs text-gray-600">Default: {defaultTitleTemplate}</span>
          </div>

          <div className="flex flex-col p-2 rounded-lg hover:bg-gray-50 space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="coding-title" className="text-sm font-medium text-gray-800">Coding Notes Section Title</label>
              <div className="flex items-center space-x-2">
                {isCodingTitleOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
                <label className="flex items-center space-x-1 text-xs text-gray-500">
                  <input
                    type="checkbox"
                    checked={suppressCoding}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setSuppressCoding(val);
                      if (val) {
                        handleUpdate({ variableCodingSectionTitle: null });
                      } else {
                        handleUpdate({ variableCodingSectionTitle: codingTitle || defaultCodingTitle || "Variable coding notes" });
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Suppress section</span>
                </label>
              </div>
            </div>
            {!suppressCoding && (
              <input
                id="coding-title"
                type="text"
                value={codingTitle || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setCodingTitle(val);
                  handleUpdate({ variableCodingSectionTitle: val });
                }}
                disabled={suppressCoding}
                className="border rounded-lg p-2 text-sm w-full focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
                placeholder="e.g. Coding Notes"
              />
            )}
            <span className="text-xs text-gray-600">
              Default: {defaultCodingTitle === null ? "Suppressed" : defaultCodingTitle || "None"}
            </span>
          </div>

          <div className="flex flex-col items-stretch gap-2 p-2 rounded-lg hover:bg-gray-50">
            <div className="flex flex-col">
              <label htmlFor="show-zero-levels" className="text-sm font-medium text-gray-800">
                Show planned levels with zero count
              </label>
              <span className="text-xs text-gray-600">Default: No</span>
            </div>
            <div className="flex items-center space-x-2">
              {isShowZeroLevelsOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
              <input
                id="show-zero-levels"
                type="checkbox"
                checked={showZeroLevels}
                onChange={(e) => {
                  const val = e.target.checked;
                  setShowZeroLevels(val);
                  handleUpdate({ showPlannedZeroCountLevels: val });
                }}
                className="w-4.5 h-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex flex-col items-stretch gap-2 p-2 rounded-lg hover:bg-gray-50">
            <div className="flex flex-col">
              <label htmlFor="show-missing-rows" className="text-sm font-medium text-gray-800">
                Show a per-variable missing-data row
              </label>
              <span className="text-xs text-gray-600">Default: No</span>
            </div>
            <div className="flex items-center space-x-2">
              {isShowMissingRowsOverridden && <span className="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">(overridden)</span>}
              <input
                id="show-missing-rows"
                type="checkbox"
                checked={showMissingRows}
                onChange={(e) => {
                  const val = e.target.checked;
                  setShowMissingRows(val);
                  handleUpdate({ showMissingDataRows: val });
                }}
                className="w-4.5 h-4.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function describeConditionalPValueDefault(
  rules: Array<{ range: string; decimals?: number }>,
  fallbackDecimals: number,
): string {
  const decimalRules = rules.filter((rule): rule is { range: string; decimals: number } => rule.decimals !== undefined);
  if (decimalRules.length === 0) return `Default: ${fallbackDecimals} places`;

  const decimalPlaces = decimalRules.map((rule) => rule.decimals);
  const min = Math.min(...decimalPlaces);
  const max = Math.max(...decimalPlaces);
  const range = min === max ? `${min} places` : `${min}–${max} places`;
  return `Default: ${range} (journal rule)`;
}
