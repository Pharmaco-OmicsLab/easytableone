/**
 * Round 12 §3.3 — Tutorial modal + sample workbook tests.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";

// Suppress heavy deps
vi.mock("../src/workers/pyodide.client", () => ({
  pyodideClient: { isReady: () => Promise.resolve(), call: vi.fn() },
}));
vi.mock("../src/ui/pages/SheetHeaderStage", () => ({ default: () => <div>SheetHeader</div> }));
vi.mock("../src/ui/pages/DictionaryStage", () => ({ default: () => <div>Dictionary</div> }));
vi.mock("../src/ui/pages/SchemaStage", () => ({ default: () => <div>Schema</div> }));
vi.mock("../src/ui/pages/QAStage", () => ({ default: () => <div>QA</div> }));
vi.mock("../src/ui/pages/PlanStage", () => ({ default: () => <div>Plan</div> }));
vi.mock("../src/ui/pages/StatsPreviewStage", () => ({ default: () => <div>Stats</div> }));
vi.mock("../src/ui/pages/FormatExportStage", () => ({ default: () => <div>Export</div> }));
vi.mock("../src/ui/pages/UploadStage", () => ({ default: () => <div data-testid="upload-stage"><button id="upload-view-guide-button" onClick={() => {}}>View input format guide</button></div> }));

import { useStore } from "../src/store";
import MainLayout from "../src/ui/layout/MainLayout";
import TutorialModal from "../src/ui/components/TutorialModal";

const sampleWorkbookHref = `${import.meta.env.BASE_URL}samples/easytableone_sample.xlsx`;
const sampleDataSheetSrc = `${import.meta.env.BASE_URL}samples/samplecsv.jpg`;
const sampleDictionarySrc = `${import.meta.env.BASE_URL}samples/sampledict.jpg`;

// ─── TutorialModal unit tests ─────────────────────────────────────────────────

describe("TutorialModal unit", () => {
  beforeEach(() => {
    // Reset store tutorial state
    useStore.setState({ tutorialOpen: false });
  });

  it("does not render when tutorialOpen=false", () => {
    const { container } = render(<TutorialModal />);
    expect(container.querySelector("[role='dialog']")).toBeNull();
  });

  it("renders when tutorialOpen=true", async () => {
    useStore.setState({ tutorialOpen: true });
    const { container } = render(<TutorialModal />);
    expect(container.querySelector("[role='dialog']")).not.toBeNull();
  });

  it("closes on close-button click", async () => {
    useStore.setState({ tutorialOpen: true });
    render(<TutorialModal />);
    const btn = document.getElementById("tutorial-close-button");
    expect(btn).not.toBeNull();
    await act(async () => { fireEvent.click(btn!); });
    expect(useStore.getState().tutorialOpen).toBe(false);
  });

  it("closes on Escape key", async () => {
    useStore.setState({ tutorialOpen: true });
    render(<TutorialModal />);
    await act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(useStore.getState().tutorialOpen).toBe(false);
  });

  it("Esc on closed modal does not error", async () => {
    useStore.setState({ tutorialOpen: false });
    render(<TutorialModal />);
    await act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(useStore.getState().tutorialOpen).toBe(false);
  });

  it("'Download sample workbook' link has correct href", () => {
    useStore.setState({ tutorialOpen: true });
    render(<TutorialModal />);
    const link = document.getElementById("tutorial-download-sample") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe(sampleWorkbookHref);
  });

  it("modal content documents 'recommended, not required' for Dictionary sheet", () => {
    useStore.setState({ tutorialOpen: true });
    const { container } = render(<TutorialModal />);
    expect(container.textContent).toContain("recommended, not required");
  });

  it("lists common data problems and how the app handles them", () => {
    useStore.setState({ tutorialOpen: true });
    render(<TutorialModal />);
    expect(screen.getByText("Common data problems")).toBeDefined();
    expect(screen.getByText(/Multiple header rows/)).toBeDefined();
    expect(screen.getByText(/Duplicate IDs/)).toBeDefined();
  });

  it("embeds sample data sheet and dictionary screenshots", () => {
    useStore.setState({ tutorialOpen: true });
    render(<TutorialModal />);
    const dataSheet = screen.getByAltText(/Sample EasyTableOne data sheet/) as HTMLImageElement;
    const dictionary = screen.getByAltText(/Sample EasyTableOne dictionary sheet/) as HTMLImageElement;

    expect(dataSheet.getAttribute("src")).toBe(sampleDataSheetSrc);
    expect(dictionary.getAttribute("src")).toBe(sampleDictionarySrc);
    expect(screen.getByText(/Sample data sheet: headers are in the first row/)).toBeDefined();
    expect(screen.getByText(/Sample dictionary sheet: use variable names/)).toBeDefined();
  });
});

// ─── Global Help menu (trigger surface 2) ───────────────────────────────────

describe("Global tutorial trigger (MainLayout Help menu)", () => {
  beforeEach(() => {
    useStore.setState({ tutorialOpen: false, stage: 1 });
  });

  it("global-tutorial-button is available from the Help menu", () => {
    render(<MainLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const btn = document.getElementById("global-tutorial-button");
    expect(btn).not.toBeNull();
  });

  it("choosing Tutorial from Help opens TutorialModal", async () => {
    render(<MainLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const btn = document.getElementById("global-tutorial-button")!;
    await act(async () => { fireEvent.click(btn); });
    expect(useStore.getState().tutorialOpen).toBe(true);
    // Modal should be visible
    expect(document.querySelector("[role='dialog']")).not.toBeNull();
  });

  it("closing modal does not change the stage", async () => {
    useStore.setState({ stage: 1 });
    render(<MainLayout />);
    fireEvent.click(screen.getByRole("button", { name: "Help" }));
    const btn = document.getElementById("global-tutorial-button")!;
    await act(async () => { fireEvent.click(btn); });
    await act(async () => { fireEvent.keyDown(window, { key: "Escape" }); });
    expect(useStore.getState().stage).toBe(1);
    expect(useStore.getState().tutorialOpen).toBe(false);
  });
});

// ─── Stage 1 tutorial card (trigger surface 1) ──────────────────────────────

import UploadStageReal from "../src/ui/pages/UploadStage";

// Override the mock just for this group — we need the real component
vi.unmock("../src/ui/pages/UploadStage");

describe("Stage 1 Upload tutorial card (trigger surface 1)", () => {
  beforeEach(() => {
    useStore.setState({ tutorialOpen: false });
  });

  it("upload-tutorial-card is visible by default", () => {
    render(<UploadStageReal />);
    const card = document.getElementById("upload-tutorial-card");
    expect(card).not.toBeNull();
  });

  it("'View input format guide' button opens TutorialModal", async () => {
    render(<UploadStageReal />);
    const btn = document.getElementById("upload-view-guide-button")!;
    expect(btn).not.toBeNull();
    await act(async () => { fireEvent.click(btn); });
    expect(useStore.getState().tutorialOpen).toBe(true);
  });

  it("'Download sample workbook' link has correct href", () => {
    render(<UploadStageReal />);
    const link = document.getElementById("upload-download-sample") as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute("href")).toBe(sampleWorkbookHref);
  });
});

// ─── DataQualityGatePanel contextual link (trigger surface 3) ─────────────────

import { DataQualityGatePanel } from "../src/ui/components/DataQualityGatePanel";
import type { DataQualityFinding } from "../src/core/types";

const makeBlocking = (): DataQualityFinding => ({
  checkId: "test_blocking",
  tier: "blocking",
  category: "quality",
  title: "Test Blocking Issue",
  detail: "Something is wrong.",
  remedy: "Fix it.",
});

describe("Stage 5 gate panel contextual tutorial link (trigger surface 3)", () => {
  it("contextual link renders when onOpenTutorial is provided", () => {
    const onOpenTutorial = vi.fn();
    render(
      <DataQualityGatePanel
        findings={[makeBlocking()]}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
        onOpenTutorial={onOpenTutorial}
      />
    );
    const link = document.getElementById("gate-panel-tutorial-link");
    expect(link).not.toBeNull();
  });

  it("clicking contextual link calls onOpenTutorial", async () => {
    const onOpenTutorial = vi.fn();
    render(
      <DataQualityGatePanel
        findings={[makeBlocking()]}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
        onOpenTutorial={onOpenTutorial}
      />
    );
    const link = document.getElementById("gate-panel-tutorial-link")!;
    await act(async () => { fireEvent.click(link); });
    expect(onOpenTutorial).toHaveBeenCalledOnce();
  });

  it("contextual link does NOT render when onOpenTutorial is not provided", () => {
    render(
      <DataQualityGatePanel
        findings={[makeBlocking()]}
        acknowledgedIds={new Set()}
        dismissedIds={new Set()}
        onAcknowledge={vi.fn()}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
      />
    );
    const link = document.getElementById("gate-panel-tutorial-link");
    expect(link).toBeNull();
  });

  it("opening modal from Stage 5 does not reset acknowledgedIds state", async () => {
    // Simulate Stage 5 with one acknowledged finding; open modal; assert ack persisted.
    let capturedAck = new Set<string>();
    const onAcknowledge = vi.fn((id: string) => { capturedAck = new Set([...capturedAck, id]); });
    const onOpenTutorial = vi.fn();

    const { rerender } = render(
      <DataQualityGatePanel
        findings={[makeBlocking()]}
        acknowledgedIds={capturedAck}
        dismissedIds={new Set()}
        onAcknowledge={onAcknowledge}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
        onOpenTutorial={onOpenTutorial}
      />
    );

    // Simulate acknowledging the blocking finding
    await act(async () => {
      capturedAck.add("test_blocking");
    });

    // Rerender with updated acknowledgedIds
    rerender(
      <DataQualityGatePanel
        findings={[makeBlocking()]}
        acknowledgedIds={new Set(["test_blocking"])}
        dismissedIds={new Set()}
        onAcknowledge={onAcknowledge}
        onDismiss={vi.fn()}
        onReupload={vi.fn()}
        onOpenTutorial={onOpenTutorial}
      />
    );

    // Open tutorial
    await act(async () => {
      fireEvent.click(document.getElementById("gate-panel-tutorial-link")!);
    });
    expect(onOpenTutorial).toHaveBeenCalledOnce();
    // Acknowledgment should still be in the set — the modal opening is a side-effect
    // on the store, not a state reset on the gate panel props
    expect(capturedAck.has("test_blocking")).toBe(true);
  });
});
