import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WorkflowRail from "./WorkflowRail";

function setup(stage: number, statsAvailable = true, modelingEnabled = true) {
  const setStage = vi.fn(); const setModelingEnabled = vi.fn(); const setSettingsOpen = vi.fn();
  render(<WorkflowRail stage={stage} statsAvailable={statsAvailable} modelingEnabled={modelingEnabled} setStage={setStage} setModelingEnabled={setModelingEnabled} setSettingsOpen={setSettingsOpen} engine={{ state: "ready", retry: vi.fn() }} />);
  return { setStage, setModelingEnabled };
}

describe("WorkflowRail", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])("marks the proper group current at stage %s and exposes the rail states", (stage: number) => {
    setup(stage, true, true);
    const nav = screen.getByRole("navigation", { name: "Workflow" });
    const activeNumber = stage <= 3 ? 1 : stage - 2;
    expect(within(nav).getByRole("button", { name: new RegExp(`^${activeNumber}\\.`) }).getAttribute("aria-current")).toBe("step");
    expect(within(nav).getAllByRole("button")).toHaveLength(7);
  });

  it("locks upcoming items with the gate hint", () => {
    setup(1);
    const item = screen.getByRole("button", { name: /2\. Variable types/ });
    expect(item.hasAttribute("disabled")).toBe(true);
    expect(item.getAttribute("title")).toBe("Review the data dictionary first");
    expect(item.getAttribute("aria-describedby")).toBeTruthy();
  });

  it("uses the Modeling opt-in and enables the existing store flag", () => {
    const { setStage, setModelingEnabled } = setup(7, true, false);
    fireEvent.click(screen.getByRole("button", { name: /6\. Modeling \(optional\)/ }));
    expect(setModelingEnabled).toHaveBeenCalledWith(true);
    expect(setStage).toHaveBeenCalledWith(8);
  });
});
