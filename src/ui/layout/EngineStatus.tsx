import type { EngineState } from "./useEngineReady";

export default function EngineStatus({ state, message, retry }: { state: EngineState; message?: string; retry?: () => void }) {
  const copy = state === "ready" ? "Analysis engine ready" : state === "error" ? "Analysis engine failed to start" : "Starting analysis engine…";
  const dot = state === "ready" ? "bg-green-600" : state === "error" ? "bg-red-600" : "bg-amber-500 motion-safe:animate-pulse";
  return <div role={state === "error" ? "alert" : "status"} className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-sm ${state === "error" ? "text-red-700" : "text-gray-600"}`}>
    <span aria-hidden="true" className={`h-2.5 w-2.5 flex-none rounded-full ${dot}`} />
    <span>{copy}</span>
    {state === "error" && <><span className="basis-full pl-[18px] text-xs text-red-700">{message}</span><button type="button" onClick={retry} className="ml-[18px] min-h-9 rounded-md border border-red-200 bg-white px-3 text-sm font-semibold text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Retry</button></>}
  </div>;
}
