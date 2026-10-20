import type { ReactNode } from "react";

export type SectionStatus = "pending" | "active" | "done";
export function SectionCard({ n, title, status, optional, summary, action, onAction, footer, children, activePanel = false }: {
  n: number; title: string; status: SectionStatus; optional?: boolean; summary?: string; action?: string; onAction?: () => void; footer?: ReactNode; children?: ReactNode; activePanel?: boolean;
}) {
  const headingId = `import-section-heading-${n}`;
  return <section aria-labelledby={headingId} data-testid={activePanel ? "import-active-panel" : undefined}
    className={`rounded-xl border px-4 py-4 ${status === "active" ? "border-blue-200 bg-white ring-4 ring-blue-50" : status === "done" ? "border-gray-200 bg-white" : "border-dashed border-gray-300 bg-transparent"}`}>
    <div className="flex items-start gap-3">
      <span aria-hidden="true" className={`flex h-7 w-7 flex-none items-center justify-center rounded-full text-sm font-bold ${status === "done" ? "bg-green-50 text-green-700" : status === "active" ? "bg-blue-600 text-white" : "border border-gray-300 text-gray-400"}`}>{status === "done" ? "✓" : n}</span>
      <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 id={headingId} tabIndex={status === "active" ? -1 : undefined} className="text-base font-semibold text-gray-900">{title}</h2>{optional && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">optional</span>}</div>
        {status !== "active" && summary && <p className="mt-1 truncate text-sm text-gray-600">{summary}</p>}</div>
      {status === "done" && action && <button type="button" onClick={onAction} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">{action}</button>}
    </div>
    {status === "active" && <div className="mt-4">{children}{footer && <div className="mt-5 border-t border-gray-100 pt-4">{footer}</div>}</div>}
  </section>;
}
