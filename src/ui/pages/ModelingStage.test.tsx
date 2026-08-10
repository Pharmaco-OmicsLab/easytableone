import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LARGE_N_CONFIRM_THRESHOLD } from "../../core/performance/largeDatasetGuardrails";
import type { DataFrame, Schema } from "../../core/types";
import { useStore } from "../../store";
import ModelingStage from "./ModelingStage";

vi.mock("../../workers/pyodide.client", () => ({
  pyodideClient: {
    detectRegime: vi.fn().mockResolvedValue(null),
    detectSeparation: vi.fn().mockResolvedValue({ separated: false, quasi: false, culprits: [] }),
    fitLogisticModel: vi.fn(),
    runMlBenchmark: vi.fn(),
  },
}));

const schema: Schema = {
  columns: [
    { name: "outcome", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
    { name: "age", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
  ],
};

function makeData(n: number): DataFrame {
  return {
    columns: [
      { name: "outcome", originalName: "outcome" },
      { name: "age", originalName: "age" },
    ],
    rows: Array.from({ length: n }, (_, index) => [index % 2, 40 + (index % 10)]),
    meta: {
      sourceFile: "modeling.csv",
      parseWarnings: [],
      locale: { decimalSeparator: ".", thousandSeparator: "," },
      detectedHeaderRow: 0,
      confirmedHeaderRow: 0,
      encoding: "utf-8",
      missingSentinels: [],
    },
  };
}

describe("ModelingStage large-N gate", () => {
  beforeEach(() => {
    useStore.setState({
      data: makeData(LARGE_N_CONFIRM_THRESHOLD + 1),
      schema,
      plan: { groupingVariable: "outcome", randomSeed: 42 } as any,
      modelingSetup: null,
      modelingResults: null,
      stage: 8,
    } as any);
  });

  it("blocks both run buttons until the large-dataset risk is acknowledged", () => {
    render(<ModelingStage />);

    expect(screen.getByText(/above the 150,000-row threshold/)).toBeDefined();
    const logisticRun = screen.getByRole("button", { name: "Run logistic regression" });
    expect(logisticRun).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByRole("button", { name: "Machine Learning" }));
    const mlRun = screen.getByRole("button", { name: "Run benchmark" });
    expect(mlRun).toHaveProperty("disabled", true);

    fireEvent.click(screen.getByLabelText(/I understand this may be slow/));

    expect(screen.getByRole("button", { name: "Run benchmark" })).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "Logistic Regression" }));
    expect(screen.getByRole("button", { name: "Run logistic regression" })).toHaveProperty("disabled", false);
  });

  it("does not show the hard gate at the threshold boundary", () => {
    useStore.setState({ data: makeData(LARGE_N_CONFIRM_THRESHOLD) } as any);
    render(<ModelingStage />);

    expect(screen.queryByText(/above the 150,000-row threshold/)).toBeNull();
    expect(screen.getByRole("button", { name: "Run logistic regression" })).toHaveProperty("disabled", false);
  });

  it("renders the TRIPOD+AI reporting panel from the shared mapping", () => {
    render(<ModelingStage />);

    expect(screen.getByText("TRIPOD+AI reporting")).toBeDefined();
    expect(screen.getByText(/does not by itself make a study TRIPOD\+AI compliant/)).toBeDefined();
    expect(screen.getAllByText("Supported by app output").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Author-owned / planned").length).toBeGreaterThan(0);
  });
});
