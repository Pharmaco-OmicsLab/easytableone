import { useState } from 'react';
import type { DetectedDictionarySheet } from '../../core/dictionary/sheetDetector';

interface DictionaryDetectModalProps {
  candidates: DetectedDictionarySheet[];
  onAccept: (sheet: DetectedDictionarySheet) => void;
  onPickDifferent: () => void;
  onSkip: () => void;
}

/**
 * DictionaryDetectModal — Step 7b.5.1
 *
 * Presents auto-detected dictionary candidates to the user for confirmation
 * (D39). User must always confirm before detected labels are applied.
 *
 * Pure render. State is the "show other candidates" disclosure toggle only.
 */
export function DictionaryDetectModal({
  candidates,
  onAccept,
  onPickDifferent,
  onSkip,
}: DictionaryDetectModalProps) {
  const [showOthers, setShowOthers] = useState(false);

  if (candidates.length === 0) return null;
  const top = candidates[0];
  const others = candidates.slice(1);
  const pct = Math.round(top.matchScore * 100);
  const matchedCount = Object.keys(top.mapping).length;
  const unknownCodeCount = Object.values(top.dictionaryMap ?? {}).reduce(
    (sum, entry) => sum + (entry.levels?.length ? 0 : 0),
    0,
  );
  const changeList = Object.entries(top.mapping)
    .filter(([, value]) => value.label || value.units)
    .slice(0, 5);

  return (
    <div
      data-testid="dictionary-detect-modal"
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
    >
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl">
        <h2 className="text-xl font-bold mb-2">Dictionary sheet detected</h2>
        <p className="text-sm text-gray-600 mb-4">
          EasyTableOne found a sheet that looks like a variable dictionary. Confirm
          to apply the display labels or level codes to your columns.
        </p>

        <div className="border border-blue-200 bg-blue-50 rounded-lg p-4 mb-4">
          <div className="flex justify-between items-center mb-3">
            <div>
              <div className="font-semibold text-gray-900">
                Sheet: <span className="font-mono">{top.sheetName}</span>
              </div>
              <div className="text-xs text-gray-600 mt-1">
                Source column: <span className="font-mono">{top.rawColumn}</span>
                {' · '}
                Display label column: <span className="font-mono">{top.labelColumn}</span>
                {top.unitsColumn ? (
                  <>
                    {' · '}
                    Units column: <span className="font-mono">{top.unitsColumn}</span>
                  </>
                ) : null}
                {top.isLongFormat && top.codeColumn ? (
                  <>
                    {' · '}
                    Level codes column: <span className="font-mono">{top.codeColumn}</span>
                  </>
                ) : null}
              </div>
            </div>
            <span className="text-sm font-semibold text-blue-700 whitespace-nowrap ml-3">
              {pct}% match
            </span>
          </div>

          <table className="min-w-full text-sm border-t border-blue-100">
            <thead>
              <tr>
                <th className="text-left py-2 px-2 font-medium text-gray-700">
                  Source column
                </th>
                <th className="text-left py-2 px-2 font-medium text-gray-700">
                  Display label
                </th>
                {top.isLongFormat ? (
                  <th className="text-left py-2 px-2 font-medium text-gray-700">
                    Level codes
                  </th>
                ) : null}
                {top.unitsColumn ? (
                  <th className="text-left py-2 px-2 font-medium text-gray-700">Units</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {top.preview.map((p) => (
                <tr key={p.raw} className="border-t border-blue-100">
                  <td className="py-1 px-2 font-mono text-xs text-gray-700">{p.raw}</td>
                  <td className="py-1 px-2 text-gray-900">{p.label}</td>
                  {top.isLongFormat ? (
                    <td className="py-1 px-2 text-gray-700">Imported from {top.codeColumn}</td>
                  ) : null}
                  {top.unitsColumn ? (
                    <td className="py-1 px-2 text-gray-700">{p.units ?? ''}</td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-4 grid gap-2 rounded border border-blue-100 bg-white p-3 text-xs text-gray-700 sm:grid-cols-3">
            <div><strong>{matchedCount}</strong> matched columns</div>
            <div><strong>{Math.max(0, Math.round(top.matchScore > 0 ? matchedCount / top.matchScore : matchedCount) - matchedCount)}</strong> unmatched columns</div>
            <div><strong>{unknownCodeCount}</strong> unknown codes detected</div>
          </div>
          <div className="mt-3 text-xs text-gray-700">
            <div className="font-semibold">What will change before applying:</div>
            {top.isLongFormat ? (
              <p className="mt-1">
                Level labels will be applied from the code rows. Variable display names will stay unchanged.
              </p>
            ) : (
              <ul className="mt-1 list-disc pl-5">
                {changeList.map(([raw, value]) => (
                  <li key={raw}>
                    <span className="font-mono">{raw}</span> gets label "{value.label}"{value.units ? ` and units "${value.units}"` : ""}.
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {others.length > 0 && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              className="text-sm text-blue-600 hover:underline"
            >
              {showOthers ? 'Hide' : 'Show'} other matches ({others.length})
            </button>
            {showOthers && (
              <ul className="mt-2 space-y-1 text-sm text-gray-700">
                {others.map((c) => (
                  <li key={c.sheetName} className="flex justify-between">
                    <span className="font-mono">{c.sheetName}</span>
                    <span className="text-gray-500">{Math.round(c.matchScore * 100)}% match</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onSkip}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded border border-gray-200"
          >
            Skip — use raw column names
          </button>
          <button
            type="button"
            onClick={onPickDifferent}
            className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded border border-gray-300"
          >
            Pick a different sheet
          </button>
          <button
            type="button"
            onClick={() => onAccept(top)}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Use this dictionary
          </button>
        </div>
      </div>
    </div>
  );
}
