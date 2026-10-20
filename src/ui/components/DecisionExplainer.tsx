import { getDecisionBody } from "../../core/education/educationContent";
import type { EducationContext, ExplanationDepth } from "../../core/education/educationTypes";
import { useStore } from "../../store";
import type React from "react";
import { useState } from "react";

interface DecisionExplainerProps {
  decisionId: string;
  label?: string;
  context?: EducationContext;
  depth?: ExplanationDepth;
  open?: boolean;
  onToggle?: () => void;
}

export function ExplainerDetails({
  label,
  children,
  className = "mt-2",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={`${className} rounded border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-950`}>
      <summary className="cursor-pointer select-none font-semibold text-sky-800">{label}</summary>
      <div className="mt-2 space-y-1 text-sky-950">{children}</div>
    </details>
  );
}

export default function DecisionExplainer({ decisionId, label = "Why this?", context, depth, open: controlledOpen, onToggle }: DecisionExplainerProps) {
  const explanationDepth = useStore((state) => state.explanationDepth);
  const body = getDecisionBody(decisionId, depth ?? explanationDepth, context);
  const [localOpen, setLocalOpen] = useState(false);
  const open = controlledOpen ?? localOpen;

  return (
    <details
      data-testid={`decision-explainer-${decisionId}`}
      open={open}
      className="mt-2 self-start rounded border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-950"
    >
      <summary
        onClick={(event) => {
          event.preventDefault();
          if (onToggle) onToggle();
          else setLocalOpen((value) => !value);
        }}
        className="cursor-pointer select-none font-semibold text-sky-800"
      >
        {label}
      </summary>
      {open && (
        <div className="mt-2 grid gap-2 md:grid-cols-3">
          <div>
            <div className="font-semibold text-sky-900">What</div>
            <p>{body.what}</p>
          </div>
          <div>
            <div className="font-semibold text-sky-900">Why</div>
            <p>{body.why}</p>
          </div>
          <div>
            <div className="font-semibold text-sky-900">Alternatives</div>
            <p>{body.alternatives}</p>
          </div>
        </div>
      )}
    </details>
  );
}
