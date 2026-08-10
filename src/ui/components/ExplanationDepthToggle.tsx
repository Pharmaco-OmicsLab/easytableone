import { useStore } from "../../store";

export default function ExplanationDepthToggle() {
  const explanationDepth = useStore((state) => state.explanationDepth);
  const setExplanationDepth = useStore((state) => state.setExplanationDepth);

  return (
    <div className="flex items-center gap-2 text-xs text-gray-600">
      <span className="font-medium text-gray-700">Explanations</span>
      <div className="flex rounded border border-gray-300 bg-gray-50 p-0.5">
        {(["concise", "deep"] as const).map((depth) => (
          <button
            key={depth}
            type="button"
            onClick={() => setExplanationDepth(depth)}
            className={`px-2.5 py-1 font-semibold capitalize ${explanationDepth === depth ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-white"}`}
          >
            {depth === "deep" ? "Detailed" : "Concise"}
          </button>
        ))}
      </div>
    </div>
  );
}
