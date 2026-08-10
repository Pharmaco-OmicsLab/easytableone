import { useEffect, useState } from "react";
import type { RuntimeEstimate } from "../../core/modeling/runtimeEstimate";

interface RunProgressProps {
  running: boolean;
  estimate: RuntimeEstimate;
  label: string;
}

export default function RunProgress({ running, estimate, label }: RunProgressProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const id = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [running]);

  if (!running) return null;

  return (
    <div className="rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>{label}</span>
        <span className="font-mono">{elapsed}s elapsed</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded bg-blue-100">
        <div className="h-full w-1/2 animate-pulse rounded bg-blue-600" />
      </div>
      <p className="mt-2 text-xs text-blue-800">
        Estimated runtime: {estimate.label}.{estimate.isLongRun ? " Large run - the browser tab stays responsive; results appear when finished." : ""}
      </p>
    </div>
  );
}
