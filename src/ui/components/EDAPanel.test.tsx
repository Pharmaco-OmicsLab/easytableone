import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EDAPanel } from "./EDAPanel";
import type { DataFrame, Schema } from "../../core/types";
import type { EDAResults } from "../../core/eda/types";
import { useStore } from "../../store";
import { getDecisionBody } from "../../core/education/educationContent";

const computeEDAMock = vi.hoisted(() => vi.fn());
const isReadyMock = vi.hoisted(() => vi.fn(async () => true));

vi.mock("./VegaPlot", () => ({
  VegaPlot: ({ spec }: { spec: Record<string, any> }) => (
    <div data-testid="mock-vega-plot" data-spec={JSON.stringify(spec)} />
  ),
}));

vi.mock("../../workers/pyodide.client", () => ({
  pyodideClient: {
    computeEDA: computeEDAMock,
    isReady: isReadyMock,
    restart: vi.fn(async () => true),
  },
}));

const schema: Schema = {
  columns: [
    { name: "group", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok", displayLabel: "Group" },
    { name: "a", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok", displayLabel: "A" },
    { name: "b", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok", displayLabel: "B" },
  ],
};

const data: DataFrame = {
  columns: schema.columns.map((column) => ({ name: column.name, originalName: column.name })),
  rows: [["G1", 1, 2], ["G2", 2, 4]],
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

const mockResults: EDAResults = {
  missingness: {
    perVariable: [
      { name: "a", displayLabel: "A", missingCount: 1, missingPct: 50 },
      { name: "b", displayLabel: "B", missingCount: 0, missingPct: 0 },
    ],
    indicatorCorrelations: [{ colA: "a", displayA: "A", colB: "b", displayB: "B", correlation: 0.82 }],
    heatmapPng: "abc123",
    mcar: { statistic: 3.14, df: 2, pValue: 0.04, nPatterns: 3, note: "MCAR rejected.", experimental: true },
  },
  correlations: {
    pairs: [{ colA: "b", displayA: "B", colB: "a", displayB: "A", r: 0.91, rho: 0.89 }],
    flagged: [{ colA: "b", displayA: "B", colB: "a", displayB: "A", pearsonR: 0.91, spearmanRho: 0.89 }],
    nContinuous: 2,
    variableOrder: ["a", "b"],
  },
  bivariate: null,
  mosaic: {
    pairs: [{ colA: "group", displayA: "Group", colB: "b", displayB: "B", png: "mosaicb64" }],
  },
  vif: [{ variable: "a", displayLabel: "A", vif: 6.25, severity: "elevated" }],
  schemaFingerprint: "group:binary:|a:continuous:|b:continuous:",
  generatedAt: "2026-06-27T00:00:00.000Z",
};

function renderExpanded(results: EDAResults | null = mockResults, overrides: Partial<React.ComponentProps<typeof EDAPanel>> = {}) {
  const setEdaResults = vi.fn();
  render(
    <EDAPanel
      data={data}
      schema={schema}
      plan={null}
      edaResults={results}
      setEdaResults={setEdaResults}
      activeJournal="NEJM"
      {...overrides}
    />,
  );
  return { setEdaResults };
}

describe("EDAPanel", () => {
  beforeEach(() => {
    computeEDAMock.mockReset();
    isReadyMock.mockReset().mockResolvedValue(true);
    useStore.setState({ draftGroupingVariable: null, edaResults: null });
  });

  it("renders the generate button on first render", () => {
    renderExpanded(null);
    expect(screen.getByText("Generate EDA")).toBeDefined();
    expect(screen.queryByText("Expand")).toBeNull();
  });

  it("keeps Generate EDA disabled until the engine is ready", async () => {
    let resolveReady!: (value: boolean) => void;
    isReadyMock.mockReturnValueOnce(new Promise<boolean>((resolve) => { resolveReady = resolve; }));
    renderExpanded(null);
    const button = screen.getByRole("button", { name: "Generate EDA" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    resolveReady(true);
    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it("moves EDA tab focus with the arrow keys", () => {
    renderExpanded();
    const firstTab = screen.getByRole("tab", { name: "Missingness" });
    fireEvent.keyDown(firstTab, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Correlations" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Missingness" }).getAttribute("aria-selected")).toBe("false");
  });

  it("renders missingness, flagged pairs, and bivariate placeholder from results", () => {
    renderExpanded();
    expect(screen.getAllByTestId("mock-vega-plot").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/A and B: r = 0.82/)).toBeDefined();
    expect(screen.getByText(/B and A: r = 0.91/)).toBeDefined();
    expect(screen.getByRole("tab", { name: "Multicollinearity" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Categorical Associations" })).toBeDefined();
    expect(screen.getByLabelText("Grouping variable")).toBeDefined();
    expect(screen.getByText("This selection carries forward to Stage 6.")).toBeDefined();
  });

  it("renders Round 9 EDA decision explainers from the registry", () => {
    renderExpanded();
    expect(screen.getByTestId("decision-explainer-qa.eda-mcar")).toBeDefined();
    expect(screen.getByTestId("decision-explainer-qa.eda-correlation")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /^Multicollinearity/ }));
    expect(screen.getByTestId("decision-explainer-qa.eda-vif")).toBeDefined();
    expect(screen.queryByText(/VIF measures how much a predictor is explained by the others/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /^Categorical Associations/ }));
    expect(screen.getByTestId("decision-explainer-qa.eda-mosaic")).toBeDefined();

    expect(getDecisionBody("qa.eda-mcar", "concise").what).toContain("Experimental: R parity validation was not available");
  });

  it("renders no-missingness message when all variables are complete", () => {
    renderExpanded({
      ...mockResults,
      missingness: { perVariable: [{ name: "a", displayLabel: "A", missingCount: 0, missingPct: 0 }], indicatorCorrelations: [], heatmapPng: null },
    });
    expect(screen.getByText("No missing values detected across all variables.")).toBeDefined();
  });

  it("shows stale-results banner when schema fingerprint mismatches", () => {
    renderExpanded({ ...mockResults, schemaFingerprint: "old" });
    expect(screen.getByText(/Variable types have changed since EDA was generated/)).toBeDefined();
  });

  it("renders the bivariate image grid", () => {
    renderExpanded({
      ...mockResults,
      bivariate: {
        groupingVariable: "group",
        groupingDisplayLabel: "Group",
        plots: [{ variable: "a", displayLabel: "A", plotType: "boxplot", png: "plotb64" }],
      },
    });
    expect(screen.getByText("Bivariate distributions by Group")).toBeDefined();
    expect(screen.getByAltText("A (a) bivariate plot")).toBeDefined();
  });

  it("fires generation callback and shows loading state", async () => {
    const onGenerate = vi.fn(async () => mockResults);
    const { setEdaResults } = renderExpanded(null, { onGenerate });
    await waitFor(() => expect(screen.getByRole("button", { name: "Generate EDA" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByText("Generate EDA"));
    expect(screen.getByText("Computing...")).toBeDefined();
    await waitFor(() => expect(onGenerate).toHaveBeenCalled());
    await waitFor(() => expect(setEdaResults).toHaveBeenCalledWith(mockResults));
  });

  it("renders the grouping variable dropdown when categorical candidates exist", () => {
    renderExpanded();
    const select = screen.getByLabelText("Grouping variable") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect(screen.getByRole("option", { name: "Group (group)" })).toBeDefined();
  });

  it("shows the no-categorical note and hides the dropdown when no candidates exist", () => {
    renderExpanded(mockResults, {
      schema: {
        columns: schema.columns.map((column) =>
          column.name === "group"
            ? { ...column, confirmedType: "continuous" }
            : column,
        ),
      },
    });

    expect(screen.getByText("Add categorical variables to your dataset to enable bivariate plots.")).toBeDefined();
    expect(screen.queryByLabelText("Grouping variable")).toBeNull();
  });

  it("omits excluded columns from grouping candidates", () => {
    renderExpanded(mockResults, {
      schema: {
        columns: schema.columns.map((column) =>
          column.name === "group"
            ? { ...column, exclusionReason: "Manually excluded" }
            : column,
        ),
      },
    });

    expect(screen.queryByRole("option", { name: "Group (group)" })).toBeNull();
    expect(screen.queryByLabelText("Grouping variable")).toBeNull();
  });

  it("pre-populates the dropdown from the draft grouping variable", () => {
    useStore.setState({ draftGroupingVariable: "group" });
    renderExpanded();

    const select = screen.getByLabelText("Grouping variable") as HTMLSelectElement;
    expect(select.value).toBe("group");
  });

  it("writes dropdown changes to the store and re-computes EDA when results exist", async () => {
    const updatedResults: EDAResults = {
      ...mockResults,
      bivariate: {
        groupingVariable: "group",
        groupingDisplayLabel: "Group",
        plots: [{ variable: "a", displayLabel: "A", plotType: "boxplot", png: "plotb64" }],
      },
    };
    computeEDAMock.mockResolvedValue(updatedResults);
    const { setEdaResults } = renderExpanded();

    fireEvent.change(screen.getByLabelText("Grouping variable"), { target: { value: "group" } });

    expect(useStore.getState().draftGroupingVariable).toBe("group");
    expect(screen.getByText("Updating bivariate plots...")).toBeDefined();
    await waitFor(() => expect(computeEDAMock).toHaveBeenCalledWith(data, schema, expect.any(Object), "group"));
    await waitFor(() => expect(setEdaResults).toHaveBeenCalledWith(updatedResults));
  });

  it("uses the draft grouping variable when generating EDA", async () => {
    useStore.setState({ draftGroupingVariable: "group" });
    computeEDAMock.mockResolvedValue(mockResults);
    renderExpanded(null);

    await waitFor(() => expect(screen.getByRole("button", { name: "Generate EDA" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByText("Generate EDA"));

    await waitFor(() => expect(computeEDAMock).toHaveBeenCalledWith(data, schema, expect.any(Object), "group"));
  });
});
