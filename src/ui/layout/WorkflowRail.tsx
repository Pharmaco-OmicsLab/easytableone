import EngineStatus from "./EngineStatus";
import RailItem, { type RailState } from "./RailItem";
import type { EngineState } from "./useEngineReady";
import { APP_VERSION } from "../../core/appVersion";

export const RAIL_GROUPS = [
  { title: "Import data", meta: "File, study, header", stages: [1, 2, 3], target: 1 },
  { title: "Variable types", meta: "Continuous, categorical", stages: [4], target: 4 },
  { title: "Data checks", meta: "Missing, outliers, bounds", stages: [5], target: 5 },
  { title: "Analysis plan", meta: "Grouping and tests", stages: [6], target: 6 },
  { title: "Statistical review", meta: "Table 1 and tests", stages: [7], target: 7 },
  { title: "Modeling (optional)", meta: "Optional", stages: [8], target: 8 },
  { title: "Format & export", meta: "Journal style, files", stages: [9], target: 9 },
];
const HINTS: Record<number, string> = { 4: "Review the data dictionary first", 5: "Confirm variable types first", 6: "Run the data checks before planning", 7: "Set up your plan first", 8: "Complete statistical review first", 9: "Complete statistical review first" };
export function groupIndexForStage(stage: number) { return Math.max(0, RAIL_GROUPS.findIndex((group) => group.stages.includes(stage))); }

export default function WorkflowRail({ stage, statsAvailable, modelingEnabled, setModelingEnabled, setStage, setSettingsOpen, engine, closeAfterNavigate = false, closeDrawer, variant = "rail" }: {
  stage: number; statsAvailable: boolean; modelingEnabled: boolean; setModelingEnabled: (enabled: boolean) => void; setStage: (stage: number) => void; setSettingsOpen: (open: boolean) => void;
  engine: { state: EngineState; message?: string; retry: () => void }; closeAfterNavigate?: boolean; closeDrawer?: () => void; variant?: "rail" | "drawer";
}) {
  return <aside className="flex min-h-0 flex-col bg-white">
    <div className="border-b border-gray-200 p-5"><div className="flex items-baseline justify-between"><h2 className="text-lg font-bold text-gray-900">EasyTableOne</h2><span className="text-xs text-gray-500">v{APP_VERSION}</span></div><div className="mt-3"><EngineStatus {...engine} /></div></div>
    <nav aria-label="Workflow" className="min-h-0 flex-1 overflow-y-auto p-3"><ol className="space-y-1">
      {RAIL_GROUPS.map((group, index) => {
        const active = group.stages.includes(stage);
        const future = stage < Math.min(...group.stages);
        const isOptin = group.target === 8 && statsAvailable && !modelingEnabled;
        const blocked = (!statsAvailable && group.target === 8) || (future && !isOptin);
        const state: RailState = active ? "current" : isOptin ? "optin" : blocked ? "upcoming" : "done";
        const gate = blocked ? HINTS[group.target] : undefined;
        return <RailItem key={group.target} n={index + 1} title={`${index + 1}. ${group.title}`} meta={group.meta} state={state} gateHint={gate} variant={variant} onClick={() => {
          if (isOptin) { setModelingEnabled(true); setStage(8); } else if (!blocked) setStage(group.target);
          if (closeAfterNavigate && (!blocked || isOptin)) closeDrawer?.();
        }}>{active && group.target === 1 && <span className="mt-2 block text-xs text-blue-700">{[1, 2, 3].map((n) => <span key={n} className={`mr-2 ${stage === n ? "font-bold" : stage > n ? "text-green-700" : "text-gray-500"}`}>{n === 1 ? "File" : n === 2 ? "Sheet & header" : "Data dictionary"}</span>)}</span>}</RailItem>;
      })}
    </ol></nav>
    <div className="border-t border-gray-200 p-4"><p className="mb-3 text-xs leading-relaxed text-gray-600">Runs 100% in your browser. Files are never uploaded to a server.</p><div data-testid="stage-rail-bottom" className="flex items-center"><button type="button" onClick={() => { setSettingsOpen(true); if (closeAfterNavigate) closeDrawer?.(); }} className="min-h-9 rounded px-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">⚙ Settings</button></div></div>
  </aside>;
}
