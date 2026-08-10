import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LARGE_N_NOTICE_THRESHOLD } from "../../core/performance/largeDatasetGuardrails";
import { PRIVACY_BLURB_SHORT } from "../../core/about/aboutContent";
import { useStore } from "../../store";
import UploadStage from "./UploadStage";

describe("UploadStage study configuration", () => {
  beforeEach(() => {
    useStore.setState({
      data: null,
      file: null,
      sheets: [],
      stage: 1,
      edaResults: { generatedAt: "stale" } as any,
      researchPopulation: "adult",
      unitSystem: "metric",
      error: null,
      aboutOpen: false,
    } as any);
  });

  it("renders the Study Configuration card with defaults selected", () => {
    render(<UploadStage />);

    expect(screen.getByText("Study Population")).toBeDefined();
    expect((screen.getByLabelText(/Adult/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/Metric/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByLabelText(/Pediatric/)).toBeDefined();
    expect(screen.getByLabelText(/Other \/ Non-human/)).toBeDefined();
    expect(useStore.getState().data).toBeNull();
  });

  it("places the tutorial card, dropzone, then Study Configuration", () => {
    render(<UploadStage />);

    const text = document.body.textContent ?? "";
    expect(text.indexOf("New here?")).toBeLessThan(text.indexOf("Drag and drop a CSV or XLSX file here"));
    expect(text.indexOf("Drag and drop a CSV or XLSX file here")).toBeLessThan(text.indexOf("Study Configuration"));
  });

  it("updates population, clears EDA, and shows the Other note conditionally", () => {
    render(<UploadStage />);

    fireEvent.click(screen.getByLabelText(/Pediatric/));
    expect(useStore.getState().researchPopulation).toBe("pediatric");
    expect(useStore.getState().edaResults).toBeNull();

    fireEvent.click(screen.getByLabelText(/Other \/ Non-human/));
    expect(useStore.getState().researchPopulation).toBe("other");
    expect(screen.getByText("Sanity bounds checking will be disabled for this study.")).toBeDefined();
  });

  it("updates unit system and clears EDA", () => {
    render(<UploadStage />);

    fireEvent.click(screen.getByLabelText(/Imperial/));
    expect(useStore.getState().unitSystem).toBe("imperial");
    expect(useStore.getState().edaResults).toBeNull();
  });

  it("keeps Stage 1 after file selection and proceeds only when the user clicks Proceed", async () => {
    render(<UploadStage />);

    const file = new File(["group,age\nA,10\nB,20\n"], "study.csv", { type: "text/csv" });
    const input = document.querySelector("#fileInput") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(useStore.getState().data?.rows.length).toBe(2));
    expect(useStore.getState().stage).toBe(1);

    const proceed = screen.getByRole("button", { name: "Proceed to Sheet & Header ->" });
    expect(proceed.getAttribute("disabled")).toBeNull();
    fireEvent.click(proceed);

    expect(useStore.getState().stage).toBe(2);
  });

  it("renders embedded upload without Study settings or a file confirmation button", async () => {
    render(<UploadStage embedded />);

    expect(screen.queryByText("Study Population")).toBeNull();
    expect(screen.queryByText("Measurement Units")).toBeNull();
    expect(screen.queryByText("Study Configuration")).toBeNull();

    const file = new File(["group,age\nA,10\nB,20\n"], "study.csv", { type: "text/csv" });
    const input = document.querySelector("#fileInput") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(useStore.getState().data?.rows.length).toBe(2));
    expect(screen.getByText("study.csv")).toBeDefined();
    expect(screen.getByText("2 data rows parsed.")).toBeDefined();
    expect(screen.queryByText("Drag and drop a CSV or XLSX file here")).toBeNull();
    expect(screen.getByRole("button", { name: "Choose a different file" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Confirm file ->" })).toBeNull();
  });

  it("returns from the uploaded card to the empty dropzone", () => {
    useStore.setState({
      file: { name: "ready.csv" },
      data: {
        columns: [{ name: "arm", originalName: "arm" }],
        rows: [["A"], ["B"]],
        meta: {} as any,
      },
      sheets: [],
    } as any);

    render(<UploadStage embedded />);

    expect(screen.getByText("ready.csv")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Choose a different file" }));
    expect(useStore.getState().file).toBeNull();
    expect(useStore.getState().data).toBeNull();
    expect(screen.getByText("Drag and drop a CSV or XLSX file here")).toBeDefined();
  });

  it("loads the sample workbook through the upload handler and advances to Stage 2", async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["group", "age"], ["A", 10]]), "Data");
    const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        blob: async () => new Blob([bytes]),
      })),
    );

    render(<UploadStage />);
    fireEvent.click(screen.getByRole("button", { name: "Try with sample data" }));

    await waitFor(() => expect(useStore.getState().stage).toBe(2));
    expect(useStore.getState().file?.name).toBe("easytableone_sample.xlsx");
    expect(useStore.getState().sheets[0]?.name).toBe("Data");
    vi.unstubAllGlobals();
  });

  it("single-sources the privacy line and opens About from Learn more", () => {
    render(<UploadStage />);

    expect(screen.getByText(new RegExp(PRIVACY_BLURB_SHORT))).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Learn more" }));
    expect(useStore.getState().aboutOpen).toBe(true);
  });

  it("shows the large-N notice for parsed CSV data above the threshold", () => {
    useStore.setState({
      file: { name: "large.csv" },
      data: {
        columns: [{ name: "arm", originalName: "arm" }],
        rows: Array.from({ length: LARGE_N_NOTICE_THRESHOLD + 1 }, () => ["A"]),
        meta: {} as any,
      },
      sheets: [],
    } as any);

    render(<UploadStage />);

    expect(screen.getByText(/50,001 rows/)).toBeDefined();
    expect(screen.getByText(/optional Modeling step/)).toBeDefined();
  });
});
