import { useStore } from "../../store";

export default function ExplanationDepthToggle() {
  const explanationDepth = useStore((state) => state.explanationDepth);
  const setExplanationDepth = useStore((state) => state.setExplanationDepth);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span className="font-medium text-gray-700">Explanations</span>
      <div className="flex rounded-lg border border-gray-300 bg-gray-100 p-0.5">
        {(["concise", "deep"] as const).map((depth) => (
          <button
            key={depth}
            type="button"
            aria-pressed={explanationDepth === depth}
            onClick={() => setExplanationDepth(depth)}
            className={`min-h-8 rounded-md px-2.5 py-1 font-semibold capitalize focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${explanationDepth === depth ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-white"}`}
          >
            {depth === "deep" ? "Detailed" : "Concise"}
          </button>
        ))}
      </div>
    </div>
  );
}
