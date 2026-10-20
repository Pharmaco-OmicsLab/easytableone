import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StepActionBar from "./StepActionBar";

describe("StepActionBar", () => {
  it("keeps disabled actions focusable, linked to the reason, and inert", () => {
    const onClick = vi.fn();
    render(<StepActionBar backLabel="Back" primary={{ label: "Continue", onClick, disabledReason: "Review the data first" }} />);
    const primary = screen.getByRole("button", { name: "Continue" });
    expect(primary.getAttribute("aria-disabled")).toBe("true");
    expect(primary.getAttribute("title")).toBe("Review the data first");
    expect(primary.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.getElementById(primary.getAttribute("aria-describedby")!)?.textContent).toBe("Review the data first");
    fireEvent.click(primary);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("shows the engine wait reason for an engine gated action", () => {
    const onClick = vi.fn();
    render(<StepActionBar backLabel="Back" engineReady={false} primary={{ label: "Run", onClick, needsEngine: true }} />);
    expect(screen.getByRole("button", { name: "Run" }).getAttribute("title")).toBe("Waiting for the analysis engine to finish starting…");
  });

  it("shows the Retry guidance when the engine has failed", () => {
    render(<StepActionBar backLabel="Back" engineError primary={{ label: "Run", onClick: vi.fn(), needsEngine: true }} />);
    expect(screen.getByRole("button", { name: "Run" }).getAttribute("title")).toBe("The analysis engine failed to start. Use Retry in the sidebar.");
  });
});
