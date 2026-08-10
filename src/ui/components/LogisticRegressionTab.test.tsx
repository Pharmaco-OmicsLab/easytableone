import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LogisticResult, ModelingSetup } from "../../core/modeling/types";
import LogisticRegressionTab from "./LogisticRegressionTab";
import { estimateModelingRuntime } from "../../core/modeling/runtimeEstimate";

vi.mock("./VegaPlot", () => ({
  VegaPlot: ({ spec }: { spec: Record<string, any> }) => (
    <div data-testid="mock-vega-plot" data-spec={JSON.stringify(spec)} />
  ),
}));

const setup: ModelingSetup = {
  outcome: "outcome",
  predictors: ["age"],
  referenceLevels: {},
  imputation: { policy: "complete_case", m: 20 },
  goal: "adjust",
  seed: 42,
  model: "ridge",
  lambdaRule: "lambda_1se",
  validationB: 200,
  ciBootstrapB: 200,
  fastMode: true,
  validationCiMethod: "oob",
};

const result: LogisticResult = {
  model: "ridge",
  lambda: 0.12,
  selected: ["age"],
  equation: "logit(p) = -1 + 0.2*age",
  diagnostics: {},
  regime: {
    n: 80,
    events: 20,
    nonevents: 60,
    p: 4,
    epv: 5,
    pGeN: false,
    recommendedModels: ["ridge"],
    plainMleAllowed: false,
    rationale: "EPV was limited, so ridge was recommended over plain MLE.",
  },
  univariate: [{ label: "Age", or: 1.2, ciLow: 1.01, ciHigh: 1.5, p: 0.03 }],
  adjusted: [{ label: "Age", or: 1.1, ciLow: 0.98, ciHigh: 1.3, p: 0.08 }],
  validation: {
    aucApparent: 0.82,
    aucOptimism: 0.04,
    aucCorrected: 0.78,
    aucCorrectedCi: [0.71, 0.84],
    calibrationSlope: 0.9,
    calibrationSlopeCi: [0.7, 1.1],
    calibrationIntercept: 0.02,
    calibrationInterceptCi: [-0.1, 0.14],
    brier: 0.16,
    brierCi: [0.12, 0.2],
    ciMethod: "bootstrap_oob",
    ciLevel: 0.95,
    rocCurve: [],
    calibrationCurve: [],
  },
  decisionCurve: {
    basis: "apparent",
    prevalence: 0.25,
    points: [
      { threshold: 0.1, netBenefit: 0.18, netBenefitTreatAll: 0.167 },
      { threshold: 0.2, netBenefit: 0.12, netBenefitTreatAll: 0.063 },
    ],
  },
  subgroups: [
    {
      variable: "sex",
      basis: "apparent",
      levels: [
        { level: "F", n: 40, events: 10, auc: 0.82, calibrationSlope: 0.95, brier: 0.14 },
        { level: "M", n: 38, events: 9, auc: 0.73, calibrationSlope: 0.81, brier: 0.18 },
        { level: "Unknown", n: 2, events: 1, auc: null, calibrationSlope: null, brier: null, reason: "insufficient_events" },
      ],
    },
  ],
};

describe("LogisticRegressionTab", () => {
  it("shows model, lambda, and validation method rationales beside results", () => {
    render(<LogisticRegressionTab setup={setup} result={result} running={false} error={null} onRun={vi.fn()} confirmedLargeRun={true} runtimeEstimate={estimateModelingRuntime(setup, 80, 1)} />);

    expect(screen.getByText(/Ridge-penalized logistic regression/)).toBeDefined();
    expect(screen.getByText(/EPV was limited/)).toBeDefined();
    expect(screen.getByText(/Lambda rule applied: lambda_1se/)).toBeDefined();
    expect(screen.getByText(/Optimism-corrected bootstrap validation/)).toBeDefined();
    expect(screen.getByText("95% CI 0.710 to 0.840")).toBeDefined();
    expect(screen.getByText("95% CI 0.120 to 0.200")).toBeDefined();
    expect(screen.getByText("Why performance CIs?")).toBeDefined();
    expect(screen.getByText("Clinical utility: decision curve")).toBeDefined();
    expect(screen.getAllByText(/Basis: apparent/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("How do I read this curve?")).toBeDefined();
    expect(screen.getByTestId("mock-vega-plot")).toBeDefined();
    expect(screen.getByText("Performance by subgroup")).toBeDefined();
    expect(screen.getByText("Largest AUC difference across sex: 0.090")).toBeDefined();
    expect(screen.getByText("Too few events to estimate reliably")).toBeDefined();
  });

  it("requires large-dataset acknowledgement before running", () => {
    render(<LogisticRegressionTab setup={setup} result={null} running={false} error={null} onRun={vi.fn()} confirmedLargeRun={false} runtimeEstimate={estimateModelingRuntime(setup, 80, 1)} />);

    const button = screen.getByRole("button", { name: "Run logistic regression" });
    expect(button).toHaveProperty("disabled", true);
    expect(button.getAttribute("title")).toBe("Acknowledge the large-dataset risk above to run Modeling.");
  });

  it("shows running progress with an elapsed counter", () => {
    vi.useFakeTimers();
    render(<LogisticRegressionTab setup={setup} result={null} running={true} error={null} onRun={vi.fn()} confirmedLargeRun={true} runtimeEstimate={estimateModelingRuntime(setup, 80, 1)} />);

    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText("0s elapsed")).toBeDefined();
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("2s elapsed")).toBeDefined();
  });

  it("renders displayLabel and collapsed-by-default equation accordion", () => {
    const customResult: LogisticResult = {
      ...result,
      univariate: [{ label: "sex=2.0", displayLabel: "Sex: Male (vs Female)", or: 1.2, ciLow: 1.01, ciHigh: 1.5, p: 0.03 }],
      adjusted: [{ label: "sex=2.0", displayLabel: "Sex: Male (vs Female)", or: 1.1, ciLow: 0.98, ciHigh: 1.3, p: 0.08 }],
      equation: "logit(p) = -1 + 0.2*(sex=2.0)",
      displayEquation: "ln(odds) = -1 + 0.2*(Sex: Male (vs Female))",
    };

    render(<LogisticRegressionTab setup={setup} result={customResult} running={false} error={null} onRun={vi.fn()} confirmedLargeRun={true} runtimeEstimate={estimateModelingRuntime(setup, 80, 1)} />);

    expect(screen.queryByText("sex=2.0")).toBeNull();
    expect(screen.getAllByText("Sex: Male (vs Female)").length).toBeGreaterThanOrEqual(1);

    expect(screen.getByText("Show the fitted model equation")).toBeDefined();
    expect(screen.getByText(/This is the fitted logistic model written out/)).toBeDefined();

    const details = screen.getByText("Show the fitted model equation").closest("details");
    expect(details).toBeDefined();
    expect(details?.open).toBe(false);
  });

  it("renders not estimable when CI bounds are null or NaN", () => {
    const customResult: LogisticResult = {
      ...result,
      univariate: [{ label: "age", or: 1.2, ciLow: null, ciHigh: null, p: 0.03 }],
      adjusted: [{ label: "age", or: 1.1, ciLow: NaN, ciHigh: NaN, p: 0.08 }],
    };

    render(<LogisticRegressionTab setup={setup} result={customResult} running={false} error={null} onRun={vi.fn()} confirmedLargeRun={true} runtimeEstimate={estimateModelingRuntime(setup, 80, 1)} />);

    expect(screen.getAllByText("not estimable").length).toBe(2);
  });

  it("renders unstable validation metrics as not reportable with a disclosed reason", () => {
    const customResult: LogisticResult = {
      ...result,
      validation: result.validation && {
        ...result.validation,
        calibrationSlope: null,
        calibrationSlopeCi: null,
        unstableMetrics: ["calibration_slope"],
        unstableReason: "One or more validation metrics could not be reliably estimated - this is typically caused by separation.",
      },
    };

    render(<LogisticRegressionTab setup={setup} result={customResult} running={false} error={null} onRun={vi.fn()} confirmedLargeRun={true} runtimeEstimate={estimateModelingRuntime(setup, 80, 1)} />);

    expect(screen.getByText("not reportable")).toBeDefined();
    expect(screen.getAllByText("0.780").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Not reportable: calibration_slope/)).toBeDefined();
    expect(screen.getByText(/typically caused by separation/)).toBeDefined();
  });
});
