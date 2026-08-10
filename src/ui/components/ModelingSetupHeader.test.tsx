import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ModelingSetup } from "../../core/modeling/types";
import type { DataFrame, Schema } from "../../core/types";
import { LARGE_N_NOTICE_THRESHOLD } from "../../core/performance/largeDatasetGuardrails";
import { useStore } from "../../store";
import { pyodideClient } from "../../workers/pyodide.client";
import ModelingSetupHeader from "./ModelingSetupHeader";

vi.mock("../../workers/pyodide.client", () => ({
  pyodideClient: {
    detectRegime: vi.fn().mockResolvedValue(null),
    detectSeparation: vi.fn().mockResolvedValue({ separated: false, quasi: false, culprits: [] }),
  },
}));

const schema: Schema = {
  columns: [
    { name: "outcome", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
    { name: "age", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
    { name: "marker", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok", displayLabel: "Marker value" },
    { name: "id", inferredType: "id_like", confirmedType: "id_like", cardinalityTier: "ok" },
  ],
};

const data: DataFrame = {
  columns: [
    { name: "outcome", originalName: "outcome" },
    { name: "age", originalName: "age" },
    { name: "marker", originalName: "marker" },
    { name: "id", originalName: "id" },
  ],
  rows: [
    [0, 20, 1.1, "a"],
    [1, 30, 2.2, "b"],
  ],
  meta: {
    sourceFile: "test.csv",
    parseWarnings: [],
    locale: { decimalSeparator: ".", thousandSeparator: "," },
    detectedHeaderRow: 0,
    confirmedHeaderRow: 0,
    encoding: "utf-8",
    missingSentinels: [],
  },
};

const setup: ModelingSetup = {
  outcome: "outcome",
  predictors: [],
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

const qaReport = {
  columns: [
    { name: "outcome", missingCount: 0, missingPercent: 0, cardinality: 2, isConstant: false, flags: [] },
    { name: "age", missingCount: 0, missingPercent: 0, cardinality: 2, isConstant: false, flags: [] },
    { name: "marker", missingCount: 1, missingPercent: 25, cardinality: 2, isConstant: false, flags: [] },
  ],
  overallCompletenessPercent: 90,
  blockingErrors: [],
};

describe("ModelingSetupHeader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.setState({ qaReport: null });
    vi.mocked(pyodideClient.detectRegime).mockResolvedValue(null as any);
    vi.mocked(pyodideClient.detectSeparation).mockResolvedValue({ separated: false, quasi: false, culprits: [] } as any);
  });

  it("selects and clears all candidate predictors", () => {
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={setup}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({ predictors: ["age", "marker"] }));

    onSetupChange.mockClear();
    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, predictors: ["age", "marker"] }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({ predictors: [] }));
  });

  it("shows and persists the modeled event level for binary outcomes", () => {
    const outcomeSchema: Schema = {
      columns: [
        {
          name: "disease",
          inferredType: "binary",
          confirmedType: "binary",
          levels: [{ code: "Yes", label: "Disease" }, { code: "No", label: "No disease" }],
          referenceLevel: "Yes",
          cardinalityTier: "ok",
        },
        { name: "age", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ],
    };
    const outcomeData: DataFrame = {
      ...data,
      columns: outcomeSchema.columns.map((c) => ({ name: c.name, originalName: c.name })),
      rows: [["Yes", 55], ["Yes", 60], ["No", 42], ["Yes", 61]],
    };
    const selectedSetup: ModelingSetup = {
      ...setup,
      outcome: "disease",
      predictors: ["age"],
      referenceLevels: { disease: "Yes" },
    };
    const onSetupChange = vi.fn();
    render(
      <ModelingSetupHeader
        data={outcomeData}
        schema={outcomeSchema}
        setup={selectedSetup}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    const eventSelect = screen.getByLabelText("Event to model") as HTMLSelectElement;
    expect(eventSelect.value).toBe("No");
    expect(screen.getByText(/Odds ratios and predicted probabilities describe/)).toBeDefined();
    expect(screen.getByText("P(No disease)")).toBeDefined();
    expect(screen.getByText(/vs Disease/)).toBeDefined();
    expect(screen.getByText(/Check this - your dictionary's reference level was set from frequency/)).toBeDefined();

    fireEvent.change(eventSelect, { target: { value: "Yes" } });
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({ outcomePositiveLevel: "Yes" }));
  });

  it("selects optional subgroup variables and excludes the outcome", () => {
    const schemaWithSubgroups: Schema = {
      columns: [
        ...schema.columns,
        { name: "sex", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok", displayLabel: "Sex" },
        { name: "site", inferredType: "categorical_nominal", confirmedType: "categorical_nominal", cardinalityTier: "ok" },
      ],
    };
    const dataWithSubgroups: DataFrame = {
      ...data,
      columns: [
        ...data.columns,
        { name: "sex", originalName: "sex" },
        { name: "site", originalName: "site" },
      ],
      rows: data.rows.map((row, index) => [...row, index % 2 === 0 ? "F" : "M", index % 2 === 0 ? "A" : "B"]),
    };
    const onSetupChange = vi.fn();
    render(
      <ModelingSetupHeader
        data={dataWithSubgroups}
        schema={schemaWithSubgroups}
        setup={setup}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    expect(screen.getByText("Fairness / subgroup performance (optional)")).toBeDefined();
    expect(screen.queryByLabelText("outcome")).toBeNull();
    const subgroupSection = screen.getByText("Fairness / subgroup performance (optional)").closest("div")?.parentElement?.parentElement as HTMLElement;
    fireEvent.click(within(subgroupSection).getByLabelText("Sex"));
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({ subgroupVars: ["sex"] }));
  });

  it("shows the large dataset advisory only above the notice threshold", () => {
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={{ ...data, rows: Array.from({ length: LARGE_N_NOTICE_THRESHOLD }, () => [0, 20, 1.1, "a"]) }}
        schema={schema}
        setup={setup}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    expect(screen.queryByText(/Large dataset:/)).toBeNull();

    rerender(
      <ModelingSetupHeader
        data={{ ...data, rows: Array.from({ length: LARGE_N_NOTICE_THRESHOLD + 1 }, () => [0, 20, 1.1, "a"]) }}
        schema={schema}
        setup={setup}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/Large dataset:/)).toBeDefined();
    expect(screen.getByText(/Fast validation is already on/)).toBeDefined();
  });

  it("uses plain-language model tooltips and a clear advanced settings label", () => {
    render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={setup}
        onSetupChange={vi.fn()}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Ridge" }).getAttribute("title")).toContain("Shrinks all predictor effects");
    expect(screen.getByRole("button", { name: "LASSO" }).getAttribute("title")).toContain("shrink weak predictors all the way to zero");

    const advanced = screen.getByRole("button", { name: "Advanced settings" });
    expect(advanced.getAttribute("title")).toContain("missing-data handling");
    expect(advanced.getAttribute("aria-expanded")).toBe("false");
  });

  it("updates imputation policies and reveals policy-specific inputs", () => {
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={setup}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    const imputation = screen.getByLabelText("Imputation");
    for (const policy of ["mean", "median", "mode", "constant", "knn", "rf", "mice"] as const) {
      fireEvent.change(imputation, { target: { value: policy } });
      expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
        imputation: expect.objectContaining({ policy }),
      }));
      expect(onSetupChange.mock.lastCall?.[0].imputation.includeOutcome).toBeUndefined();
    }

    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "constant", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText("MICE m")).toBeNull();
    fireEvent.change(screen.getByLabelText("Numeric fill"), { target: { value: "99" } });
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imputation: expect.objectContaining({ constantNumeric: 99 }),
    }));
    fireEvent.change(screen.getByLabelText("Category fill"), { target: { value: "Unknown" } });
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imputation: expect.objectContaining({ constantLabel: "Unknown" }),
    }));

    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "mice", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("MICE m")).toBeDefined();
    expect(screen.queryByLabelText("Numeric fill")).toBeNull();

    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "knn", m: 20, knnNeighbors: 7 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Neighbours")).toBeDefined();
    fireEvent.change(screen.getByLabelText("Neighbours"), { target: { value: "3" } });
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imputation: expect.objectContaining({ policy: "knn", knnNeighbors: 3 }),
    }));
  });

  it("shows dataset-aware imputation advice and applies the suggested policy", () => {
    useStore.setState({ qaReport });
    const onSetupChange = vi.fn();
    render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, predictors: ["age", "marker"] }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    expect(screen.getByText("Substantial missing data")).toBeDefined();
    expect(screen.getByText("Suggested policy: Multiple imputation by chained equations (m=20)")).toBeDefined();
    expect(screen.getByText(/not guaranteed to be correct/i)).toBeDefined();
    expect(screen.getByText(/Highest missingness among selected variables: marker 25.0%; average 8.3%/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imputation: expect.objectContaining({ policy: "mice" }),
    }));
  });

  it("omits dataset advice without qaReport but keeps selected-policy help", () => {
    render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, predictors: ["age"], imputation: { policy: "median", m: 20 } }}
        onSetupChange={vi.fn()}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    expect(screen.queryByText(/missing data in your selected variables/i)).toBeNull();
    expect(screen.getAllByText(/middle value/).length).toBeGreaterThan(0);
  });

  it("updates the selected-policy one-liner when imputation changes", () => {
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "mean", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    expect(screen.getAllByText(/column's average/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Imputation"), { target: { value: "knn" } });
    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "knn", m: 20, knnNeighbors: 5 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/most similar patients/).length).toBeGreaterThan(0);
  });

  it("shows selected and compare-list best-for positioning lines", () => {
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "knn", m: 20, knnNeighbors: 5 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    expect(screen.getAllByText(/Ideal for machine-learning pipelines and predictive modeling/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Compare all options"));
    expect(screen.getAllByText(/Best for statistical modeling where precise P-values and confidence intervals matter/).length).toBeGreaterThan(0);

    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "mice", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.getAllByText(/Best for statistical modeling where precise P-values and confidence intervals matter/).length).toBeGreaterThan(0);
  });

  it("shows a mean-only median nudge and switches to median on request", () => {
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "mean", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    expect(screen.getByText(/median is usually a safer fill/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "switching to median" }));
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imputation: expect.objectContaining({ policy: "median" }),
    }));

    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "median", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.queryByText(/median is usually a safer fill/)).toBeNull();
  });

  it("shows outcome-aware imputation control only for multivariate imputers", () => {
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "mice", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    const checkbox = screen.getByLabelText("Include the outcome when filling in missing values (recommended)") as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText(/To reduce bias, EasyTableOne uses your outcome variable/i)).toBeDefined();
    fireEvent.click(checkbox);
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imputation: expect.objectContaining({ includeOutcome: false }),
    }));

    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "mice", m: 20, includeOutcome: false } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/You've turned off using the outcome to fill in missing values/i)).toBeDefined();

    for (const policy of ["knn", "rf"] as const) {
      onSetupChange.mockClear();
      rerender(
        <ModelingSetupHeader
          data={data}
          schema={schema}
          setup={{ ...setup, imputation: { policy, m: 20, knnNeighbors: 5 } }}
          onSetupChange={onSetupChange}
          regime={null}
          onRegimeChange={vi.fn()}
        />,
      );
      expect(screen.queryByLabelText("Include the outcome when filling in missing values (recommended)")).toBeNull();
      const singleFillCheckbox = screen.getByLabelText("Use the outcome when filling in missing values (off by default for this method)") as HTMLInputElement;
      expect(singleFillCheckbox.checked).toBe(false);
      expect(screen.getByText(/For kNN and random-forest imputation, EasyTableOne fills each missing value with a single best guess/i)).toBeDefined();
      expect(screen.queryByText(/You've turned on using the outcome to fill in missing values for a single-fill method/i)).toBeNull();
      fireEvent.click(singleFillCheckbox);
      expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
        imputation: expect.objectContaining({ includeOutcome: true }),
      }));

      rerender(
        <ModelingSetupHeader
          data={data}
          schema={schema}
          setup={{ ...setup, imputation: { policy, m: 20, knnNeighbors: 5, includeOutcome: true } }}
          onSetupChange={onSetupChange}
          regime={null}
          onRegimeChange={vi.fn()}
        />,
      );
      expect(screen.getByText(/You've turned on using the outcome to fill in missing values for a single-fill method/i)).toBeDefined();
    }

    for (const policy of ["complete_case", "mean"] as const) {
      rerender(
        <ModelingSetupHeader
          data={data}
          schema={schema}
          setup={{ ...setup, imputation: { policy, m: 20 } }}
          onSetupChange={onSetupChange}
          regime={null}
          onRegimeChange={vi.fn()}
        />,
      );
      expect(screen.queryByLabelText("Include the outcome when filling in missing values (recommended)")).toBeNull();
      expect(screen.queryByLabelText("Use the outcome when filling in missing values (off by default for this method)")).toBeNull();
    }
  });

  it("resets outcome-inclusion to the method default when switching imputation policy", () => {
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "knn", m: 20, knnNeighbors: 5, includeOutcome: false } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    fireEvent.change(screen.getByLabelText("Imputation"), { target: { value: "mice" } });
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imputation: expect.not.objectContaining({ includeOutcome: expect.any(Boolean) }),
    }));

    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, imputation: { policy: "mice", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    const miceCheckbox = screen.getByLabelText("Include the outcome when filling in missing values (recommended)") as HTMLInputElement;
    expect(miceCheckbox.checked).toBe(true);

    fireEvent.change(screen.getByLabelText("Imputation"), { target: { value: "knn" } });
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({
      imputation: expect.not.objectContaining({ includeOutcome: expect.any(Boolean) }),
    }));
  });

  it("discloses constant categorical fills only when a categorical predictor is selected", () => {
    const schemaWithCategory: Schema = {
      columns: [
        ...schema.columns,
        { name: "sex", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
      ],
    };
    const dataWithCategory: DataFrame = {
      ...data,
      columns: [...data.columns, { name: "sex", originalName: "sex" }],
      rows: data.rows.map((row, index) => [...row, index % 2 === 0 ? "F" : "M"]),
    };
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={dataWithCategory}
        schema={schemaWithCategory}
        setup={{ ...setup, predictors: ["age"], imputation: { policy: "constant", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));
    expect(screen.queryByText(/For number variables, "constant" fills blanks/i)).toBeNull();

    rerender(
      <ModelingSetupHeader
        data={dataWithCategory}
        schema={schemaWithCategory}
        setup={{ ...setup, predictors: ["sex"], imputation: { policy: "constant", m: 20 } }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/For number variables, "constant" fills blanks/i)).toBeDefined();
    expect(screen.getByText(/creates a distinct "Missing" category/i)).toBeDefined();
  });

  it("pre-selects the recommended Firth model until the user overrides it", async () => {
    vi.mocked(pyodideClient.detectSeparation).mockResolvedValue({ separated: true, quasi: false, culprits: ["age"] } as any);
    vi.mocked(pyodideClient.detectRegime).mockResolvedValue({
      n: 2,
      events: 1,
      nonevents: 1,
      p: 1,
      epv: 1,
      pGeN: false,
      recommendedModels: ["firth"],
      plainMleAllowed: false,
      rationale: "n=2, 1 events, 1 predictors -> EPV≈1.0; using Firth logistic regression because separation was detected.",
    });
    const onSetupChange = vi.fn();
    const onRegimeChange = vi.fn();
    const selectedSetup = { ...setup, predictors: ["age"] };
    const { rerender } = render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={selectedSetup}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={onRegimeChange}
      />,
    );

    await waitFor(() => expect(onRegimeChange).toHaveBeenCalled());
    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={selectedSetup}
        onSetupChange={onSetupChange}
        regime={onRegimeChange.mock.calls.at(-1)?.[0]}
        onRegimeChange={onRegimeChange}
      />,
    );

    await waitFor(() => expect(onSetupChange).toHaveBeenCalledWith(expect.objectContaining({ model: "firth" })));

    const firthSetup = { ...selectedSetup, model: "firth" as const };
    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={firthSetup}
        onSetupChange={onSetupChange}
        regime={onRegimeChange.mock.calls.at(-1)?.[0]}
        onRegimeChange={onRegimeChange}
      />,
    );
    expect(screen.getByText(/Recommended: Firth - selected; you can override below/)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Ridge" }));
    expect(onSetupChange).toHaveBeenLastCalledWith(expect.objectContaining({ model: "ridge" }));
    onSetupChange.mockClear();
    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...selectedSetup, model: "ridge" }}
        onSetupChange={onSetupChange}
        regime={onRegimeChange.mock.calls.at(-1)?.[0]}
        onRegimeChange={onRegimeChange}
      />,
    );
    expect(onSetupChange).not.toHaveBeenCalledWith(expect.objectContaining({ model: "firth" }));
  });

  it("passes the pre-run separation signal into regime detection", async () => {
    vi.mocked(pyodideClient.detectSeparation).mockResolvedValue({ separated: true, quasi: false, culprits: ["age"] } as any);
    render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, predictors: ["age"] }}
        onSetupChange={vi.fn()}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    await waitFor(() => expect(pyodideClient.detectRegime).toHaveBeenCalled());
    expect(vi.mocked(pyodideClient.detectRegime).mock.calls.at(-1)?.[0]).toEqual(expect.objectContaining({ separation: true }));
  });

  it("discloses all tradeoffs for Fast validation and switches helper text for each Validation CI method", () => {
    const onSetupChange = vi.fn();
    const { rerender } = render(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={setup}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );

    // Fast validation tooltip
    const fastLabel = screen.getByText("Fast validation").closest("label");
    expect(fastLabel).not.toBeNull();
    const title = fastLabel!.getAttribute("title");
    expect(title).toContain("keeps the app responsive");
    expect(title).toContain("reuses one penalty strength");
    expect(title).toContain("repeats the whole cross-validation 3 times instead of 10");
    expect(title).toContain("Your odds ratios are identical either way");
    expect(title).toContain("Validation results (AUC, calibration, and their intervals)");
    expect(title).not.toContain("come out the same");

    // Open advanced settings to see Validation CI method helper text
    fireEvent.click(screen.getByRole("button", { name: "Advanced settings" }));

    // Default or oob method explanation
    expect(screen.getByText(/Scores each practice model on the patients it did/)).toBeDefined();
    expect(screen.getByText(/train on — like testing a student on questions they haven't seen/)).toBeDefined();

    // Switch to nested
    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, validationCiMethod: "nested" }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Runs a full re-check/)).toBeDefined();
    expect(screen.getByText(/every re-check \(a loop within a loop\) to capture every source of uncertainty/)).toBeDefined();
    expect(screen.getByText(/Warning: Nested bootstrap runs/)).toBeDefined(); // Amber warning is also present

    // Switch to full_sample
    rerender(
      <ModelingSetupHeader
        data={data}
        schema={schema}
        setup={{ ...setup, validationCiMethod: "full_sample" }}
        onSetupChange={onSetupChange}
        regime={null}
        onRegimeChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Scores each model on the same patients it was trained on/)).toBeDefined();
    expect(screen.getByText(/tends to look more confident than it really should be/)).toBeDefined();
  });
});
