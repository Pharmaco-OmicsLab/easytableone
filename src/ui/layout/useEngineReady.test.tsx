import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EngineStatus from "./EngineStatus";
import { useEngineReady } from "./useEngineReady";

const { isReady, restart } = vi.hoisted(() => ({ isReady: vi.fn(), restart: vi.fn() }));
vi.mock("../../workers/pyodide.client", () => ({ pyodideClient: { isReady, restart } }));

function EngineProbe() { const engine = useEngineReady(); return <EngineStatus {...engine} />; }
describe("useEngineReady", () => {
  beforeEach(() => { isReady.mockReset(); restart.mockReset(); });
  it("shows an error after failure and returns to ready after Retry", async () => {
    isReady.mockRejectedValueOnce(new Error("worker unavailable")); restart.mockResolvedValueOnce(true);
    render(<EngineProbe />);
    expect((await screen.findByRole("alert")).textContent).toContain("Analysis engine failed to start");
    expect(isReady).toHaveBeenCalledTimes(1);
    expect(screen.getByText("worker unavailable")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Analysis engine ready"));
    expect(restart).toHaveBeenCalledOnce();
  });

  it("recovers when the original initialization finishes after the timeout", async () => {
    vi.useFakeTimers();
    let resolveInitialization!: (ready: boolean) => void;
    isReady.mockReturnValueOnce(new Promise<boolean>((resolve) => { resolveInitialization = resolve; }));
    render(<EngineProbe />);

    await act(async () => { await vi.advanceTimersByTimeAsync(180_000); });
    expect(screen.getByRole("alert").textContent).toContain("Initialization timed out after 180 seconds");

    await act(async () => { resolveInitialization(true); });
    expect(screen.getByRole("status").textContent).toContain("Analysis engine ready");
    vi.useRealTimers();
  });
});
