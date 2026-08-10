import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MlResult, ModelingSetup } from "../../core/modeling/types";
import { estimateModelingRuntime } from "../../core/modeling/runtimeEstimate";
import MachineLearningTab from "./MachineLearningTab";

vi.mock("./VegaPlot", () => ({
  VegaPlot: ({ spec }: { spec: Record<string, any> }) => (
    <div data-testid="mock-vega-plot" data-spec={JSON.stringify(spec)} />
  ),
}));

const setup: ModelingSetup = {
  outcome: "outcome",
  predictors: ["age", "marker"],
  referenceLevels: {},
  imputation: { policy: "complete_case", m: 20 },
  goal: "adjust",
  seed: 42,
  model: "ridge",
  lambdaRule: "lambda_1se",
  validationB: 200,
  ciBootstrapB: 200,
  fastMode: true,
};

const result: MlResult = {
  folds: { nSplits: 5, nRepeats: 3, seed: 42 },
  warnings: ["Reduced CV folds from 5 to 4 because the minority outcome class has 4 observations."],
  classificationThreshold: 0.5,
  comparison: [
    {
      model: "Random Forest",
      auc: { mean: 0.91, sd: 0.04, ciLow: 0.86, ciHigh: 0.96, ciBasis: "logit" },
      sens: { mean: 0.82, sd: 0.08, ciLow: 0.74, ciHigh: 0.9 },
      spec: { mean: 0.88, sd: 0.06, ciLow: 0.82, ciHigh: 0.94 },
      balacc: { mean: 0.85, sd: 0.05, ciLow: 0.8, ciHigh: 0.9 },
    },
  ],
  models: [
    {
      name: "Random Forest",
      metrics: {
        auc: { mean: 0.91, sd: 0.04, ciLow: 0.86, ciHigh: 0.96 },
        sens: { mean: 0.82, sd: 0.08, ciLow: 0.74, ciHigh: 0.9 },
        spec: { mean: 0.88, sd: 0.06, ciLow: 0.82, ciHigh: 0.94 },
        balacc: { mean: 0.85, sd: 0.05, ciLow: 0.8, ciHigh: 0.9 },
      },
      roc: { grid: [0, 0.5, 1], mean: [0, 0.8, 1], sd: [0, 0.1, 0] },
      varImportance: [{ name: "marker", score: 100 }, { name: "age", score: 42 }],
      calibration: {
        slope: 0.97,
        intercept: 0.02,
        brier: 0.12,
        curve: [{ predicted: 0.2, observed: 0.25, n: 8 }],
      },
      confusion: { tp: 8, fp: 2, fn: 1, tn: 9 },
      classificationThreshold: 0.5,
      decisionCurve: {
        basis: "pooled_repeated_cv",
        prevalence: 0.45,
        points: [
          { threshold: 0.1, netBenefit: 0.3, netBenefitTreatAll: 0.389 },
          { threshold: 0.2, netBenefit: 0.22, netBenefitTreatAll: 0.313 },
        ],
      },
      subgroups: [
        {
          variable: "site",
          basis: "pooled_repeated_cv",
          levels: [
            { level: "A", n: 30, events: 12, auc: 0.9, calibrationSlope: 0.92, brier: 0.11 },
            { level: "B", n: 28, events: 11, auc: 0.81, calibrationSlope: 0.84, brier: 0.15 },
            { level: "C", n: 3, events: 1, auc: null, calibrationSlope: null, brier: null, reason: "insufficient_events" },
          ],
        },
      ],
    },
  ],
};

describe("MachineLearningTab", () => {
  it("renders comparison, ROC, importance, calibration, warning, and confusion output", () => {
    render(<MachineLearningTab setup={setup} result={result} running={false} error={null} onRun={vi.fn()} confirmedLargeRun={true} runtimeEstimate={estimateModelingRuntime(setup, 80, 2)} />);

    expect(screen.getByText("Model comparison")).toBeDefined();
    expect(screen.getAllByText("Random Forest").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0.910 +/- 0.040")).toBeDefined();
    expect(screen.getByText("0.860-0.960")).toBeDefined();
    expect(screen.getByText("AUC 95% interval across CV repetitions")).toBeDefined();
    expect(screen.getByText(/The \+\/- SD value is per-repeat spread/)).toBeDefined();
    expect(screen.getByText(/Intervals are computed on the logit scale \(Fisher z for MCC\)/)).toBeDefined();
    expect(screen.getByText(/not a confidence interval for performance on new patients/)).toBeDefined();
    expect(screen.getByText("Why performance intervals?")).toBeDefined();
    expect(screen.getByText(/classification threshold of 0.50/)).toBeDefined();
    expect(screen.getByText(/AUC and ROC curves are threshold-independent/)).toBeDefined();
    expect(screen.getByText(/Reduced CV folds/)).toBeDefined();
    expect(screen.getByText("Mean ROC with SD band")).toBeDefined();
    expect(screen.getByText("Permutation importance")).toBeDefined();
    expect(screen.getByText(/same definition can be applied across/)).toBeDefined();
    expect(screen.getByText("Calibration")).toBeDefined();
    expect(screen.getByText("Clinical utility: decision curve")).toBeDefined();
    expect(screen.getAllByText(/Basis: pooled_repeated_cv/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("How do I read this curve?")).toBeDefined();
    expect(screen.getByText("Performance by subgroup")).toBeDefined();
    expect(screen.getByText("Largest AUC difference across site: 0.090")).toBeDefined();
    expect(screen.getByText("Too few events to estimate reliably")).toBeDefined();
    expect(screen.getByText("TP 8")).toBeDefined();
    expect(screen.getByText(/threshold 0.50/)).toBeDefined();
    expect(screen.getAllByTestId("mock-vega-plot")).toHaveLength(4);
  });

  it("disables run until outcome and at least one predictor are selected", () => {
    const emptySetup = { ...setup, outcome: "", predictors: [] };
    render(<MachineLearningTab setup={emptySetup} result={null} running={false} error={null} onRun={vi.fn()} confirmedLargeRun={true} runtimeEstimate={estimateModelingRuntime(emptySetup, 80, 1)} />);
    expect(screen.getByRole("button", { name: "Run benchmark" })).toHaveProperty("disabled", true);
  });

  it("runs only on explicit click", () => {
    const onRun = vi.fn();
    render(<MachineLearningTab setup={setup} result={null} running={false} error={null} onRun={onRun} confirmedLargeRun={true} runtimeEstimate={estimateModelingRuntime(setup, 80, 2)} />);
    expect(onRun).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Run benchmark" }));
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("requires large-dataset acknowledgement before running", () => {
    render(<MachineLearningTab setup={setup} result={null} running={false} error={null} onRun={vi.fn()} confirmedLargeRun={false} runtimeEstimate={estimateModelingRuntime(setup, 80, 2)} />);

    const button = screen.getByRole("button", { name: "Run benchmark" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("title")).toBe("Acknowledge the large-dataset risk above to run Modeling.");
  });

  it("shows running progress with an elapsed counter", () => {
    vi.useFakeTimers();
    render(<MachineLearningTab setup={setup} result={null} running={true} error={null} onRun={vi.fn()} confirmedLargeRun={true} runtimeEstimate={estimateModelingRuntime(setup, 80, 2)} />);

    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText("0s elapsed")).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("1s elapsed")).toBeDefined();
    vi.useRealTimers();
  });
});
