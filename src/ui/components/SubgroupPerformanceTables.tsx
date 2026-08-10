import type { SubgroupPerformance } from "../../core/modeling/types";

export interface SubgroupOverall {
  auc: number | null;
  calibrationSlope: number | null;
  brier: number | null;
  n?: number;
  events?: number;
}

function fmt(value: number | null | undefined, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(value)) return "-";
  return value.toFixed(digits);
}

function largestAucGap(group: SubgroupPerformance): number | null {
  const values = group.levels.map((level) => level.auc).filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
  if (values.length < 2) return null;
  return Math.max(...values) - Math.min(...values);
}

export default function SubgroupPerformanceTables({
  title = "Performance by subgroup",
  subgroups,
  overall,
}: {
  title?: string;
  subgroups?: SubgroupPerformance[];
  overall?: SubgroupOverall;
}) {
  if (!subgroups || subgroups.length === 0) return null;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <p className="mt-1 text-xs text-gray-500">
          Subgroup metrics re-score the same validation predictions by selected group. The app reports differences for review; it does not decide whether the model is fair or apply mitigation.
        </p>
      </div>
      {subgroups.map((group) => {
        const gap = largestAucGap(group);
        return (
          <div key={`${group.variable}-${group.basis}`} className="overflow-hidden rounded border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
              <div className="text-sm font-semibold text-gray-900">{group.variable}</div>
              <div className="text-xs text-gray-500">Basis: {group.basis}</div>
              {gap !== null && <div className="mt-1 text-xs text-gray-600">Largest AUC difference across {group.variable}: {fmt(gap)}</div>}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2">Level</th>
                    <th className="px-3 py-2">n</th>
                    <th className="px-3 py-2">Events</th>
                    <th className="px-3 py-2">AUC</th>
                    <th className="px-3 py-2">Calibration slope</th>
                    <th className="px-3 py-2">Brier</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overall && (
                    <tr>
                      <td className="px-3 py-2 font-medium text-gray-800">Overall</td>
                      <td className="px-3 py-2 text-gray-700">{overall.n ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-700">{overall.events ?? "-"}</td>
                      <td className="px-3 py-2 text-gray-700">{fmt(overall.auc)}</td>
                      <td className="px-3 py-2 text-gray-700">{fmt(overall.calibrationSlope)}</td>
                      <td className="px-3 py-2 text-gray-700">{fmt(overall.brier)}</td>
                    </tr>
                  )}
                  {group.levels.map((level) => (
                    <tr key={level.level}>
                      <td className="px-3 py-2 font-medium text-gray-800">{level.level}</td>
                      <td className="px-3 py-2 text-gray-700">{level.n}</td>
                      <td className="px-3 py-2 text-gray-700">{level.events}</td>
                      {level.reason === "insufficient_events" ? (
                        <td className="px-3 py-2 text-amber-700" colSpan={3}>Too few events to estimate reliably</td>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-gray-700">{fmt(level.auc)}</td>
                          <td className="px-3 py-2 text-gray-700">{fmt(level.calibrationSlope)}</td>
                          <td className="px-3 py-2 text-gray-700">{fmt(level.brier)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
