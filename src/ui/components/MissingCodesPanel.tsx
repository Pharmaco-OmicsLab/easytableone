import { useState, useMemo } from "react";
import { useStore, computeDataFingerprint } from "../../store";
import { detectMissingCodes, type MissingCodeCandidate } from "../../core/qa/missingCodes";

export const dismissedMissingCodesFingerprints = new Set<string>();

export function MissingCodesPanel() {
  const { data, schema, applyMissingCodeRecode } = useStore();
  const [isOpen, setIsOpen] = useState(true);
  const [checkedCodes, setCheckedCodes] = useState<Record<string, Set<string>>>({});
  const [appliedRecodes, setAppliedRecodes] = useState<Record<string, string>>({});
  const [dismissed, setDismissed] = useState(false);

  const fingerprint = useMemo(() => computeDataFingerprint(data), [data]);

  const candidates = useMemo(() => {
    if (!data || !schema) return [];
    return detectMissingCodes(data, schema);
  }, [data, schema]);

  // Group candidates by column
  const candidatesByCol = useMemo(() => {
    const map = new Map<string, MissingCodeCandidate[]>();
    for (const cand of candidates) {
      const list = map.get(cand.column) ?? [];
      list.push(cand);
      map.set(cand.column, list);
    }
    return map;
  }, [candidates]);

  // All columns that either have candidates or have applied recodes
  const allColumns = useMemo(() => {
    const cols = new Set<string>();
    for (const col of candidatesByCol.keys()) cols.add(col);
    for (const col of Object.keys(appliedRecodes)) cols.add(col);
    return Array.from(cols);
  }, [candidatesByCol, appliedRecodes]);

  if (dismissed || dismissedMissingCodesFingerprints.has(fingerprint)) {
    return null;
  }

  if (allColumns.length === 0) {
    return null;
  }

  const handleToggleCode = (column: string, code: string) => {
    setCheckedCodes((prev) => {
      const current = new Set(prev[column] ?? []);
      if (current.has(code)) {
        current.delete(code);
      } else {
        current.add(code);
      }
      return { ...prev, [column]: current };
    });
  };

  const handleApply = (column: string) => {
    const selected = Array.from(checkedCodes[column] ?? []);
    if (selected.length === 0) return;

    const colCands = candidatesByCol.get(column) ?? [];
    const totalCount = colCands
      .filter((c) => selected.includes(c.code))
      .reduce((sum, c) => sum + c.count, 0);

    applyMissingCodeRecode(column, selected);

    const summary = `${selected.join(", ")} (${totalCount} ${totalCount === 1 ? "row" : "rows"})`;
    setAppliedRecodes((prev) => ({ ...prev, [column]: summary }));

    // Clear checked codes for this column
    setCheckedCodes((prev) => ({ ...prev, [column]: new Set() }));
  };

  const handleDismissAll = () => {
    dismissedMissingCodesFingerprints.add(fingerprint);
    setDismissed(true);
  };

  return (
    <section
      aria-label="Possible missing-value codes"
      data-testid="missing-codes-panel"
      className="mb-4 rounded-[14px] border-2 border-amber-400 bg-amber-50 p-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-amber-900">Possible missing-value codes</h3>
        <button type="button" aria-expanded={isOpen} onClick={() => setIsOpen(!isOpen)} className="rounded px-2 py-1 text-sm font-semibold text-amber-800">{isOpen ? "Collapse" : "Expand"}</button>
      </div>

      {isOpen && (
        <div className="mt-3" id="missing-codes-content">
          <p className="text-sm text-amber-900 mb-4">
            Clinical datasets often record missing data as a code such as 999, -9 or "Unknown".
            These values are currently treated as real data. Review each one: recode it as missing
            only if that is what it means in your dataset.
          </p>

          <div className="space-y-4 divide-y divide-amber-200">
            {allColumns.map((colName) => {
              const colCands = candidatesByCol.get(colName) ?? [];
              const appliedSummary = appliedRecodes[colName];
              const schemaCol = schema?.columns.find((c) => c.name === colName);
              const label = schemaCol?.displayLabel || colName;
              const selected = checkedCodes[colName] ?? new Set();

              return (
                <div key={colName} className="pt-3 first:pt-0">
                  <div className="font-semibold text-sm text-gray-900 mb-2">{label}</div>

                  {appliedSummary && (
                    <div
                      data-testid={`missing-code-applied-${colName}`}
                      className="mb-2 text-sm text-emerald-800 font-medium"
                    >
                      ✓ {appliedSummary} recoded as missing
                    </div>
                  )}

                  {colCands.length > 0 && (
                    <div className="space-y-2">
                      {colCands.map((cand) => {
                        const isChecked = selected.has(cand.code);
                        const declaredText = cand.declaredLabel
                          ? ` — declared in your dictionary as "${cand.declaredLabel}"`
                          : "";
                        const rowWord = cand.count === 1 ? "row" : "rows";
                        const labelText = `${cand.code} — ${cand.count} ${rowWord} — ${cand.reason}${declaredText}`;

                        return (
                          <label
                            key={cand.code}
                            className="flex items-start gap-2 text-sm text-gray-800 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleCode(colName, cand.code)}
                              className="mt-0.5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                            <span>{labelText}</span>
                          </label>
                        );
                      })}

                      <div className="pt-1">
                        <button
                          type="button"
                          disabled={selected.size === 0}
                          onClick={() => handleApply(colName)}
                          className="rounded border border-amber-600 bg-amber-600 px-3 py-1 text-xs font-medium text-white shadow-sm hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                        >
                          Treat selected as missing
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-4 pt-3 border-t border-amber-200 flex justify-end">
            <button
              type="button"
              onClick={handleDismissAll}
              className="text-xs text-amber-800 hover:text-amber-950 underline font-medium cursor-pointer"
            >
              Dismiss all
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
