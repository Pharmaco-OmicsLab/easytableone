import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useStore } from "../../store";
import JournalOverridePanel from "./JournalOverridePanel";

function renderPanel(journalId: string, layout?: "narrow" | "wide") {
  useStore.setState({
    journalId,
    plan: { groupingVariable: "group" } as any,
  });
  return render(<JournalOverridePanel layout={layout} />);
}

describe("JournalOverridePanel D99 P-value decimal override", () => {
  it("describes the effective conditional default and preserves plain defaults for journals without conditions", () => {
    const nejm = renderPanel("NEJM");
    expect(screen.getByText("Default: 2–3 places (journal rule)")).toBeTruthy();
    expect(screen.getByText("Why?")).toBeTruthy();
    nejm.unmount();

    const nature = renderPanel("NATURE_MED");
    expect(screen.getByText("Default: 3 places")).toBeTruthy();
    nature.unmount();

    const lancet = renderPanel("LANCET");
    expect(screen.getByText("Default: 4 places")).toBeTruthy();
    lancet.unmount();
  });

  it("records an explicit default-decimal choice when the journal has conditional P-value rounding", () => {
    renderPanel("NEJM");

    fireEvent.change(screen.getByLabelText("P-value Max Decimals"), { target: { value: "3" } });

    expect(useStore.getState().plan?.userOverrides?.pValueSignificantDigits).toBe(3);
    fireEvent.click(screen.getByText("Why?"));
    expect(screen.getByText("Overrides this journal's conditional P-value rounding rules and applies a fixed number of decimal places.")).toBeTruthy();
  });

  it("uses one or two settings columns from the panel layout and retains all controls and updates", () => {
    const narrow = renderPanel("NEJM", "narrow");
    expect(screen.getByTestId("override-settings-grid").className).toContain("grid-cols-1");
    for (const id of ["thousand-separator", "decimal-precision", "suppress-zeros", "iqr-delimiter", "p-value-threshold", "p-sig-digits", "title-template", "coding-title", "show-zero-levels", "show-missing-rows"]) {
      expect(document.getElementById(id)).toBeTruthy();
    }
    fireEvent.change(screen.getByLabelText("P-value Threshold"), { target: { value: "<0.005" } });
    expect(useStore.getState().plan?.userOverrides?.pValueThreshold).toBe("<0.005");
    narrow.unmount();

    renderPanel("NEJM", "wide");
    expect(screen.getByTestId("override-settings-grid").className).toContain("grid-cols-2");
  });

  it("keeps the no-override default behavior for a journal without conditional P-value rounding", () => {
    renderPanel("NATURE_MED");

    fireEvent.change(screen.getByLabelText("P-value Max Decimals"), { target: { value: "3" } });

    expect(useStore.getState().plan?.userOverrides?.pValueSignificantDigits).toBeUndefined();
    expect(screen.queryByText("Overrides this journal's conditional P-value rounding rules and applies a fixed number of decimal places.")).toBeNull();
  });

  it("resets the selected P-value decimals to the ruleset default for conditional and plain journals", () => {
    for (const [journalId, selected] of [["NEJM", "2"], ["NATURE_MED", "2"], ["LANCET", "3"]] as const) {
      const panel = renderPanel(journalId);
      fireEvent.change(screen.getByLabelText("P-value Max Decimals"), { target: { value: selected } });
      fireEvent.click(screen.getByText("Reset to Defaults"));
      expect((screen.getByLabelText("P-value Max Decimals") as HTMLSelectElement).value).toBe(
        journalId === "LANCET" ? "4" : "3",
      );
      panel.unmount();
    }
  });
});
