import type { ReactNode } from "react";
export type RailState = "current" | "done" | "upcoming" | "optin";
export default function RailItem({ n, title, meta, state, gateHint, onClick, children, variant = "rail" }: { n: number; title: string; meta: string; state: RailState; gateHint?: string; onClick: () => void; children?: ReactNode; variant?: "rail" | "drawer" }) {
  const hintId = `workflow-gate-${variant}-${n}`;
  const locked = state === "upcoming";
  return <li><button type="button" onClick={onClick} disabled={locked} aria-current={state === "current" ? "step" : undefined} aria-describedby={gateHint && locked ? hintId : undefined} title={locked ? gateHint : undefined}
    className={`group w-full rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${state === "current" ? "border-blue-200 bg-blue-50 text-blue-700" : state === "done" ? "border-transparent text-gray-700 hover:bg-gray-100" : state === "optin" ? "border-dashed border-gray-300 text-gray-600 hover:bg-gray-50" : "border-transparent cursor-not-allowed text-gray-400"}`}>
    <span className="flex items-start gap-3"><span aria-hidden="true" className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-xs font-bold ${state === "current" ? "bg-blue-600 text-white" : state === "done" ? "bg-green-50 text-green-700" : state === "optin" ? "border border-dashed border-gray-400" : "border border-gray-300"}`}>{state === "done" ? "✓" : n}</span><span className="min-w-0"><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block text-xs text-gray-600">{state === "optin" ? "Enable modeling" : meta}</span>{children}</span></span>
    <span className="sr-only">{state === "done" ? "completed" : state === "upcoming" ? "locked" : state === "optin" ? "optional" : "current"}</span>
    {gateHint && locked && <span id={hintId} className="sr-only">{gateHint}</span>}
  </button></li>;
}
