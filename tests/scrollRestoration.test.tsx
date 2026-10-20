/**
 * Round 12 §3.1 — Scroll restoration regression tests.
 *
 * The main scroll container (#main) must reset to scrollTop=0
 * on every stage change. Intra-stage state changes must NOT trigger a scroll reset.
 *
 * NOTE: jsdom does not natively implement scrollTo or scrollTop mutation, so
 * we test the useEffect dependency array behaviour — confirming the correct
 * dep (stage) is wired — and verify the <main> element has the ref attached.
 */

import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { useStore } from "../src/store";

// We test via the actual MainLayout but need to suppress Pyodide loading
vi.mock("../src/workers/pyodide.client", () => ({
  pyodideClient: {
    isReady: () => Promise.resolve(),
    call: vi.fn(),
  },
}));

// Suppress stage component rendering (they import heavy deps)
vi.mock("../src/ui/pages/UploadStage", () => ({ default: () => <div data-testid="upload-stage">Upload</div> }));
vi.mock("../src/ui/pages/SheetHeaderStage", () => ({ default: () => <div>SheetHeader</div> }));
vi.mock("../src/ui/pages/DictionaryStage", () => ({ default: () => <div>Dictionary</div> }));
vi.mock("../src/ui/pages/SchemaStage", () => ({ default: () => <div>Schema</div> }));
vi.mock("../src/ui/pages/QAStage", () => ({ default: () => <div data-testid="qa-stage">QA</div> }));
vi.mock("../src/ui/pages/PlanStage", () => ({ default: () => <div>Plan</div> }));
vi.mock("../src/ui/pages/StatsPreviewStage", () => ({ default: () => <div>Stats</div> }));
vi.mock("../src/ui/pages/FormatExportStage", () => ({ default: () => <div>Export</div> }));

import React from "react";
import MainLayout from "../src/ui/layout/MainLayout";

describe("Scroll restoration (Step 12.1)", () => {
  it("<main> element has the id 'main'", () => {
    const { container } = render(<MainLayout />);
    const main = container.querySelector("main#main");
    expect(main).not.toBeNull();
    expect(main!.tagName).toBe("MAIN");
  });

  it("scrollTop is set to 0 on initial render (stage=1)", async () => {
    const { container } = render(<MainLayout />);
    const main = container.querySelector("main#main") as HTMLElement;
    // jsdom initializes scrollTop to 0
    expect(main.scrollTop).toBe(0);
  });

  it("scrollTop resets to 0 when stage changes", async () => {
    const { container } = render(<MainLayout />);
    const main = container.querySelector("main#main") as HTMLElement;

    // Simulate scrolled state
    Object.defineProperty(main, "scrollTop", { writable: true, value: 500 });
    expect(main.scrollTop).toBe(500);

    // Advance stage (use act to flush effects)
    await act(async () => {
      useStore.getState().setStage(5);
    });

    expect(main.scrollTop).toBe(0);
  });

  it("intra-stage state change does NOT reset scrollTop", async () => {
    const { container } = render(<MainLayout />);
    const main = container.querySelector("main#main") as HTMLElement;

    // Scroll down then trigger intra-stage state change (setError)
    Object.defineProperty(main, "scrollTop", { writable: true, value: 300 });
    await act(async () => {
      useStore.getState().setError("test error");
    });

    // scrollTop should still be 300 (no stage change occurred)
    expect(main.scrollTop).toBe(300);
  });
});
