import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { PolishAdvisorPanel } from "./PolishAdvisorPanel";
import { useStore } from "../../store";
import type { DataFrame, Schema } from "../../core/types";

describe("PolishAdvisorPanel", () => {
  const mockData: DataFrame = {
    columns: [
      { originalName: "Name", name: "Name" },
      { originalName: "gender", name: "gender" },
      { originalName: "Age ", name: "Age " },
    ],
    rows: [
      ["John", "Male", "30"],
      ["Jane", "male", "25"],
      ["Bob", "MALE", "40"],
    ],
    meta: {
      sourceFile: "data.xlsx",
      parseWarnings: [],
      locale: { decimalSeparator: ".", thousandSeparator: "," },
      detectedHeaderRow: 0,
      confirmedHeaderRow: 0,
      encoding: "utf-8",
      missingSentinels: [],
    },
  };

  const mockSchema: Schema = {
    columns: [
      { name: "Name", inferredType: "unsupported", confirmedType: "unsupported", cardinalityTier: "ok" },
      {
        name: "gender",
        inferredType: "categorical_nominal",
        confirmedType: "categorical_nominal",
        cardinalityTier: "ok",
        levels: [
          { code: "Male", label: "Male" },
          { code: "male", label: "male" },
          { code: "MALE", label: "MALE" },
        ],
      },
      { name: "Age ", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
    ],
  };

  beforeEach(() => {
    useStore.setState({
      data: mockData,
      schema: mockSchema,
      dismissedPolishFindings: new Set(),
      auditLog: [],
      dataQualityRecords: [],
      stage: 5,
    });
  });

  it("renders nothing when there are no findings", () => {
    useStore.setState({ data: null, schema: null });
    const { container } = render(<PolishAdvisorPanel />);
    expect(container.firstChild).toBeNull();
  });

  it("renders findings and groups them by title", () => {
    render(<PolishAdvisorPanel />);

    expect(screen.getByText("Data Polish Advisor")).toBeDefined();
    expect(screen.getByText("Leading/Trailing Column Whitespace")).toBeDefined();
    expect(screen.getByText("Case Inconsistency")).toBeDefined();
  });

  it("defaults expanded when findings are present", () => {
    render(<PolishAdvisorPanel />);

    expect(screen.getByRole("button", { name: /Data Polish Advisor/i }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Leading/Trailing Column Whitespace")).toBeDefined();
  });

  it("allows dismissing a finding", () => {
    render(<PolishAdvisorPanel />);

    const dismissButtons = screen.getAllByText("Dismiss");
    expect(dismissButtons.length).toBeGreaterThan(0);

    fireEvent.click(dismissButtons[0]);

    const state = useStore.getState();
    expect(state.dismissedPolishFindings.size).toBe(1);
  });

  it("allows applying a finding", () => {
    render(<PolishAdvisorPanel />);

    const applyButtons = screen.getAllByText("Apply");
    expect(applyButtons.length).toBeGreaterThan(0);

    fireEvent.click(applyButtons[0]);

    const state = useStore.getState();
    expect(state.dataQualityRecords.length).toBeGreaterThan(0);
  });
});
