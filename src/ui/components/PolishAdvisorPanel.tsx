import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { runPolishDetectors } from '../../core/qa/polishRegistry';
import type { PolishFinding } from '../../core/qa/polishRegistry';
import { getColumnDisplayLabel } from '../../core/format/columnLabel';

export function PolishAdvisorPanel() {
  const {
    data,
    schema,
    applyPolishFinding,
    dismissPolishFinding,
    dismissedPolishFindings,
    setStage,
  } = useStore();

  const [selectedCanonicals, setSelectedCanonicals] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const [userToggledOpen, setUserToggledOpen] = useState(false);

  // Re-run detectors on the working dataset
  const rawFindings = data && schema ? runPolishDetectors(data, schema) : [];

  // Filter out findings that are dismissed in the current session
  const findings = rawFindings.filter((f) => {
    const key = `${f.detectorId}:${f.variable}:${f.suggestedCanonical ?? ''}`;
    return !dismissedPolishFindings.has(key);
  });

  useEffect(() => {
    if (!userToggledOpen) {
      setOpen(findings.length > 0);
    }
  }, [findings.length, userToggledOpen]);

  if (!data || !schema) return null;
  if (findings.length === 0) return <section id="polish-advisor-panel" className="rounded-[14px] border border-gray-200 bg-white p-[18px] shadow-sm"><h3 className="text-sm font-semibold text-gray-900">Data Polish Advisor</h3><p className="mt-2 text-sm text-gray-600">No suggestions.</p></section>;

  const handleApply = (f: PolishFinding) => {
    const key = `${f.detectorId}:${f.variable}`;
    const userCanonical = selectedCanonicals[key] || f.suggestedCanonical;
    applyPolishFinding(f, userCanonical);

    // If ordinal, navigate to the Variable types step (internal stage 4)
    if (f.detectorId === 'ordinal_stored_as_string') {
      setStage(4);
    }
    // If mixed-type routes to schema (when no dictionary mapping is found)
    if (f.detectorId === 'mixed_type' && !schema.dictionarySource) {
      setStage(4);
    }
  };

  const handleDismiss = (f: PolishFinding) => {
    dismissPolishFinding(f, f.suggestedCanonical);
  };

  const getColDisplay = (varName: string) => {
    const col = schema.columns.find((c) => c.name === varName);
    return col ? getColumnDisplayLabel(col, 'stripped') : varName;
  };

  // Group findings by category/detector
  const grouped: Record<string, PolishFinding[]> = {};
  findings.forEach((f) => {
    const grpName = f.title;
    if (!grouped[grpName]) grouped[grpName] = [];
    grouped[grpName].push(f);
  });

  return (
    <div
      id="polish-advisor-panel"
      className="overflow-hidden rounded-[14px] border border-gray-200 bg-white shadow-sm"
    >
      <button
        type="button"
        onClick={() => {
          setUserToggledOpen(true);
          setOpen((value) => !value);
        }}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 bg-white px-4 py-3 text-left text-gray-900"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-white p-2 text-indigo-600 shadow-sm">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
          </span>
          <span>
            <span className="block text-lg font-bold text-gray-900">Data Polish Advisor</span>
            <span className="block text-xs text-gray-500">
              {findings.length} cosmetic or structural suggestion{findings.length === 1 ? "" : "s"} for the final output.
            </span>
          </span>
        </div>
        <span className="text-sm font-semibold text-indigo-700">{open ? '▲' : '▶'}</span>
      </button>

      {open && (
        <div className="space-y-6 p-6">
          <div className="border-b border-indigo-50 pb-4 text-xs text-gray-500">
            Cosmetic and structural suggestions to improve your final output.
          </div>

          <div className="space-y-6">
            {Object.entries(grouped).map(([title, grpFindings]) => (
              <div key={title} className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-indigo-500">
                  {title}
                </h4>
                <div className="grid gap-3 sm:grid-cols-1">
                  {grpFindings.map((f, idx) => {
                    const pickerKey = `${f.detectorId}:${f.variable}`;
                    const currentValue = selectedCanonicals[pickerKey] || f.suggestedCanonical || '';
                    const showPicker = f.confidence === 'low' && f.suggestedCanonical && f.variants.length > 0;

                    return (
                      <div
                        key={idx}
                        className="flex flex-col justify-between rounded-xl border border-indigo-100/50 bg-gradient-to-r from-indigo-50/30 to-white p-4 transition-all duration-200 hover:border-indigo-200 sm:flex-row sm:items-center"
                      >
                        <div className="max-w-xl space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm font-semibold text-gray-800">
                              {getColDisplay(f.variable)}
                            </span>
                            {f.confidence === 'high' ? (
                              <span className="rounded border border-green-200 bg-green-50 px-1.5 py-0.5 text-[10px] text-green-700">
                                Auto-fixable
                              </span>
                            ) : (
                              <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700">
                                Review needed
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600">
                            {f.detectorId === 'column_name_whitespace' && (
                              <>Column name contains trailing/leading spaces. Fix to: <span className="rounded bg-gray-100 px-1 font-mono">"{f.suggestedCanonical}"</span></>
                            )}
                            {f.detectorId === 'whitespace_inconsistency' && (
                              <>Mixes whitespace variants: {f.variants.map(v => `"${v}"`).join(', ')}. Merge to canonical.</>
                            )}
                            {f.detectorId === 'case_inconsistency' && (
                              <>Mixes casing variants: {f.variants.map(v => `"${v}"`).join(', ')}. Merge to canonical.</>
                            )}
                            {f.detectorId === 'near_duplicate' && (
                              <>Found highly similar values: {f.variants.map(v => `"${v}"`).join(', ')}.</>
                            )}
                            {f.detectorId === 'synonym_hints' && (
                              <>Mixes equivalent abbreviations: {f.variants.map(v => `"${v}"`).join(', ')}.</>
                            )}
                            {f.detectorId === 'mixed_type' && (
                              <>Mixes numeric codes and text strings. {schema.dictionarySource ? 'Map codes using dictionary labels.' : 'Requires mapping codes to strings in the Variable types step.'}</>
                            )}
                            {f.detectorId === 'ordinal_stored_as_string' && (
                              <>Column values form an ordinal sequence. Convert to ordinal and set sorting order.</>
                            )}
                          </p>
                          {f.affectedCount > 0 && f.detectorId !== 'ordinal_stored_as_string' && (
                            <p className="text-xs font-medium text-indigo-500">
                              ({f.affectedCount} values will be polished)
                            </p>
                          )}
                        </div>

                        <div className="mt-3 flex items-center space-x-3 self-end sm:mt-0 sm:self-center">
                          {showPicker && (
                            <select
                              aria-label={`Select canonical value for ${f.variable}`}
                              value={currentValue}
                              onChange={(e) =>
                                setSelectedCanonicals((prev) => ({
                                  ...prev,
                                  [pickerKey]: e.target.value,
                                }))
                              }
                              className="rounded border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              {f.variants.map((v) => (
                                <option key={v} value={v}>
                                  Use: {v}
                                </option>
                              ))}
                            </select>
                          )}

                          <button
                            onClick={() => handleApply(f)}
                            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95"
                          >
                            {f.detectorId === 'ordinal_stored_as_string'
                              ? 'Set Order →'
                              : f.detectorId === 'mixed_type' && !schema.dictionarySource
                              ? 'Resolve →'
                              : 'Apply'}
                          </button>
                          <button
                            onClick={() => handleDismiss(f)}
                            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-500 transition-all hover:bg-gray-100 hover:text-gray-700 active:scale-95"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
