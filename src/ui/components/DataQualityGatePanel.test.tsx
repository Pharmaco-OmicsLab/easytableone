import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DataQualityGatePanel } from "./DataQualityGatePanel";
import type { DataQualityFinding } from "../../core/types";
import { useStore } from "../../store";

describe("DataQualityGatePanel", () => {
  const mockFindings: DataQualityFinding[] = [
    {
      checkId: "noDataRows",
      tier: "blocking",
      category: "format",
      title: "No Data Rows",
      detail: "The sheet contains no data rows.",
      requirement: "Must contain at least one data row.",
      remedy: "Add rows and re-upload."
    },
    {
      checkId: "highMissingness_colA",
      tier: "review",
      category: "quality",
      variable: "colA",
      title: "Critical Missingness",
      detail: "Variable colA has 60% missingness.",
      remedy: "Acknowledge or exclude."
    },
    {
      checkId: "noDictionarySheet",
      tier: "advisory",
      category: "beautify",
      title: "No Dictionary Sheet Imported",
      detail: "No codebook detected.",
      remedy: "Import one for clean labels."
    }
  ];

  it("renders non-empty sections and renders empty ones as 'None'", () => {
    render(
      <DataQualityGatePanel
        findings={mockFindings}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );

    expect(screen.getByText("Blocking Issues (1)")).toBeDefined();
    expect(screen.getByText("Review Needed (1)")).toBeDefined();
    expect(screen.getByText("Advisory (1)")).toBeDefined();

    // Verify Definitions are present
    expect(screen.getByText("Blocking Issues (Critical)")).toBeDefined();
    expect(screen.getByText("Review Needed (Important)")).toBeDefined();
    expect(screen.getByText("Advisory")).toBeDefined();
  });

  it("renders empty sections as None with no chevron", () => {
    render(
      <DataQualityGatePanel
        findings={[]}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );

    expect(screen.getByText("Blocking Issues: None")).toBeDefined();
    expect(screen.getByText("Review Needed: None")).toBeDefined();
    expect(screen.getByText("Advisory Notes: None")).toBeDefined();
  });

  it("initial expansion: expands all non-empty sections by default", () => {
    render(
      <DataQualityGatePanel
        findings={mockFindings}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );

    // All sections are non-empty in mockFindings, so all should be expanded by default
    expect(screen.getByText("The sheet contains no data rows.")).toBeDefined();
    expect(screen.getByText("Variable colA has 60% missingness.")).toBeDefined();
    expect(screen.getByText("No codebook detected.")).toBeDefined();
  });

  it("expands Review Needed when findings arrive after the first render", () => {
    const props = {
      acknowledgedIds: new Set<string>(),
      dismissedIds: new Set<string>(),
      onAcknowledge: vi.fn(),
      onDismiss: vi.fn(),
      onReupload: vi.fn(),
    };
    const { rerender } = render(<DataQualityGatePanel findings={[]} {...props} />);

    expect(screen.getByText("Review Needed: None")).toBeDefined();

    rerender(<DataQualityGatePanel findings={mockFindings.filter((f) => f.tier === "review")} {...props} />);

    expect(screen.getByText("Review Needed (1)")).toBeDefined();
    expect(screen.getByText("Variable colA has 60% missingness.")).toBeDefined();
  });

  it("does not force Review Needed open after the user collapses it", () => {
    const props = {
      acknowledgedIds: new Set<string>(),
      dismissedIds: new Set<string>(),
      onAcknowledge: vi.fn(),
      onDismiss: vi.fn(),
      onReupload: vi.fn(),
    };
    const reviewOnly = mockFindings.filter((f) => f.tier === "review");
    const { rerender } = render(<DataQualityGatePanel findings={reviewOnly} {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /Review Needed/ }));
    expect(screen.queryByText("Variable colA has 60% missingness.")).toBeNull();

    rerender(<DataQualityGatePanel findings={[...reviewOnly]} {...props} />);

    expect(screen.queryByText("Variable colA has 60% missingness.")).toBeNull();
  });

  it("blocking/format finding renders requirement, remedy, and re-upload link", () => {
    const onReupload = vi.fn();
    render(
      <DataQualityGatePanel
        findings={mockFindings}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={onReupload}
      />
    );

    expect(screen.getByText("Must contain at least one data row.")).toBeDefined();
    expect(screen.getByText("Add rows and re-upload.")).toBeDefined();
    const link = screen.getByText("Re-upload your corrected file \u2192");
    expect(link).toBeDefined();
    fireEvent.click(link);
    expect(onReupload).toHaveBeenCalled();
  });

  it("shows appropriate remedy labels: How to fix it for blocking", () => {
    render(
      <DataQualityGatePanel
        findings={mockFindings.filter(f => f.tier === "blocking")}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );
    expect(screen.getByText("How to fix it:")).toBeDefined();
  });

  it("shows appropriate remedy labels: How to fix it for review", () => {
    render(
      <DataQualityGatePanel
        findings={mockFindings.filter(f => f.tier === "review")}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );
    expect(screen.getByText("How to fix it:")).toBeDefined();
  });

  it("shows appropriate remedy labels: What to check for advisory", () => {
    render(
      <DataQualityGatePanel
        findings={mockFindings.filter(f => f.tier === "advisory")}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );
    expect(screen.getByText("What to check:")).toBeDefined();
  });

  it("renders D43 advisory unit note, highlighted values, dismiss button, and advisory tier", () => {
    const d43Finding: DataQualityFinding = {
      checkId: "sanityBounds_age",
      tier: "advisory",
      category: "quality",
      variable: "age",
      title: "Potential implausible values in \"age\"",
      detail: "1 value in column \"age\" falls outside the plausible range for Age [0-130 years].",
      remedy: "Bounds assume metric units. If this column uses different units, dismiss this finding.",
      affectedCount: 1,
      highlightedValues: [999],
      assumedUnitNote: "Bounds assume metric units. If this column uses different units, dismiss this finding.",
    };

    render(
      <DataQualityGatePanel
        findings={[d43Finding]}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );

    expect(screen.getByText("Advisory (1)")).toBeDefined();
    expect(screen.getAllByText("Bounds assume metric units. If this column uses different units, dismiss this finding.").length).toBeGreaterThan(0);
    expect(screen.getByText("Values outside range:")).toBeDefined();
    expect(screen.getByText("999")).toBeDefined();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeDefined();
  });

  it("renders the variable portion of the detail string in bold", () => {
    const findingsWithVar: DataQualityFinding[] = [
      {
        checkId: "highMissingness_colA",
        tier: "advisory",
        category: "quality",
        variable: "colA",
        title: "High Missingness",
        detail: "Variable colA has 25% missingness.",
        remedy: "Check it."
      }
    ];

    render(
      <DataQualityGatePanel
        findings={findingsWithVar}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );

    // The detail should contain "colA" wrapped in strong tag
    const boldEl = screen.getByText("colA");
    expect(boldEl.tagName).toBe("STRONG");
  });

  it("renders findings without variable without any bold elements inside detail", () => {
    const findingsNoVar: DataQualityFinding[] = [
      {
        checkId: "noDictionarySheet",
        tier: "advisory",
        category: "beautify",
        title: "No Dictionary Sheet Imported",
        detail: "No dictionary sheet was imported.",
        remedy: "Check it."
      }
    ];

    render(
      <DataQualityGatePanel
        findings={findingsNoVar}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );

    const detailText = screen.getByText("No dictionary sheet was imported.");
    // Should not have any strong tags within the paragraph text
    const boldElements = detailText.getElementsByTagName("strong");
    expect(boldElements.length).toBe(0);
  });

  it("renders Exclude Column button for variable-specific blocking findings and handles click", () => {
    useStore.setState({
      schema: {
        columns: [
          { name: "colA", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" }
        ]
      }
    } as any);

    const findingsWithVar: DataQualityFinding[] = [
      {
        checkId: "highMissingness_colA",
        tier: "blocking",
        category: "quality",
        variable: "colA",
        title: "Critical Missingness",
        detail: "Variable colA has 60% missingness.",
        remedy: "Acknowledge or exclude."
      }
    ];

    render(
      <DataQualityGatePanel
        findings={findingsWithVar}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );

    const excludeBtn = screen.getByRole("button", { name: "Exclude Column" });
    expect(excludeBtn).toBeDefined();

    fireEvent.click(excludeBtn);

    const state = useStore.getState();
    expect(state.schema?.columns[0].exclusionReason).toBe("Manually excluded");
  });

  it("renders one acknowledgement and one exclusion action per review finding", () => {
    render(
      <DataQualityGatePanel
        findings={mockFindings.filter((finding) => finding.tier === "review")}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />,
    );

    expect(screen.getAllByRole("checkbox", { name: "I acknowledge this issue" })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: "Exclude Column" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Keep and document" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Exclude variable" })).toBeNull();
  });

  it("records acknowledgement from the checkbox and only then reveals the optional reason", () => {
    const onAcknowledge = vi.fn();
    const finding = mockFindings.find((item) => item.tier === "review")!;
    const view = render(<DataQualityGatePanel findings={[finding]} acknowledgedIds={new Set()} dismissedIds={new Set()} onAcknowledge={onAcknowledge} onDismiss={vi.fn()} onReupload={vi.fn()} />);
    expect(screen.queryByLabelText(`Acknowledgement reason for ${finding.title}`)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "I acknowledge this issue" }));
    expect(onAcknowledge).toHaveBeenCalledWith(finding.checkId, true);
    view.rerender(<DataQualityGatePanel findings={[finding]} acknowledgedIds={new Set([finding.checkId])} dismissedIds={new Set()} onAcknowledge={onAcknowledge} onDismiss={vi.fn()} onReupload={vi.fn()} />);
    expect(screen.getByLabelText(`Acknowledgement reason for ${finding.title}`)).toBeTruthy();
  });
});
