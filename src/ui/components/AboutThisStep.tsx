import { getStageOverview } from "../../core/education/educationContent";
import type { StageId } from "../../core/education/educationTypes";

interface AboutThisStepProps {
  stage: StageId;
}

export default function AboutThisStep({ stage }: AboutThisStepProps) {
  const overview = getStageOverview(stage);

  return (
    <details data-testid={`about-this-step-${stage}`} className="group rounded-lg border border-blue-100 bg-blue-50/70 text-sm text-blue-950">
      <summary className="flex cursor-pointer select-none items-center justify-between gap-4 px-4 py-3 font-semibold">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="text-blue-800 transition-transform group-open:rotate-90">▶</span>
          <span>About this step</span>
        </span>
        <span className="font-normal text-blue-800">{overview.purpose}</span>
      </summary>
      <div className="space-y-3 border-t border-blue-100 px-4 py-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-blue-700">Purpose</div>
          <p>{overview.purpose}</p>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-blue-700">What to do</div>
          <p>{overview.whatToDo}</p>
        </div>
        <div>
          <div className="text-xs font-bold uppercase tracking-wide text-blue-700">Why it matters</div>
          <p>{overview.whyItMatters}</p>
        </div>
      </div>
    </details>
  );
}
