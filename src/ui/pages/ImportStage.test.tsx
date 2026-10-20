import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../../store";
import type { DataFrame } from "../../core/types";
import { LARGE_N_NOTICE_THRESHOLD } from "../../core/performance/largeDatasetGuardrails";
import ImportStage from "./ImportStage";

function dataFrame(sourceFile = "cohort.csv", sheetName?: string): DataFrame {
  return {
    columns: [
      { name: "arm", originalName: "arm" },
      { name: "age", originalName: "age" },
    ],
    rows: [
      ["A", 34],
      ["B", 48],
      ["A", 41],
    ],
    meta: {
      sourceFile,
      sheetName,
      parseWarnings: [],
      locale: { decimalSeparator: ".", thousandSeparator: "," },
      detectedHeaderRow: 0,
      confirmedHeaderRow: 0,
      encoding: "utf-8",
      missingSentinels: [],
    },
  };
}

function makeWorkbookFile(name: string, sheets: Record<string, any[][]>): File {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([bytes], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("ImportStage", () => {
  beforeEach(() => {
    useStore.setState({
      stage: 1,
      file: null,
      data: null,
      sheets: [],
      selectedSheet: null,
      headerRowIndex: 0,
      schema: null,
      researchPopulation: "adult",
      studyDesign: "unspecified",
      unitSystem: "metric",
      error: null,
      auditLog: [],
    } as any);
  });

  it("mounts at stage 1 with only Upload expanded", () => {
    render(<ImportStage />);

    expect(screen.getAllByTestId("import-active-panel")).toHaveLength(1);
    expect(screen.getByText("Drop your spreadsheet here")).toBeDefined();
    expect(screen.getByTestId("import-section-file").getAttribute("data-state")).toBe("active");
    expect(screen.queryByText("Study Population")).toBeNull();
    expect(screen.queryByText("Measurement Units")).toBeNull();
    expect(screen.queryByText("Confirm Header Row")).toBeNull();
    expect(screen.queryByText("Upload separate dictionary file")).toBeNull();
  });

  it("shows Study settings as the active step after a parsed CSV file", () => {
    useStore.setState({
      stage: 1,
      file: new File(["arm,age\nA,34\n"], "cohort.csv", { type: "text/csv" }),
      data: dataFrame(),
    } as any);

    render(<ImportStage />);

    expect(screen.getAllByTestId("import-active-panel")).toHaveLength(1);
    expect(screen.getByText(/cohort\.csv · 3 rows × 2 columns/)).toBeDefined();
    expect(screen.getByText("Study settings")).toBeDefined();
    expect(screen.getByLabelText(/Adult/)).toBeDefined();
    expect(screen.getByLabelText(/Metric/)).toBeDefined();
    expect((screen.getByRole("radio", { name: /Not specified/ }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
    expect(screen.getByText("Optional · add labels and units")).toBeDefined();
    expect(screen.queryByText("Confirm file ->")).toBeNull();
  });

  it("shows SMD suggested for a randomized trial when population is other", () => {
    useStore.setState({
      stage: 1,
      file: new File(["arm,age\nA,34\n"], "cohort.csv", { type: "text/csv" }),
      data: dataFrame(),
      researchPopulation: "other",
      studyDesign: "randomized_trial",
    } as any);
    render(<ImportStage />);
    expect(screen.getByText("Off").previousElementSibling?.textContent).toBe("Plausibility");
    expect(screen.getByText("SMD suggested")).toBeTruthy();
  });


  it("shows Study settings as the active step after a parsed XLSX file", () => {
    useStore.setState({
      stage: 1,
      file: makeWorkbookFile("patients.xlsx", {
        Data: [
          ["arm", "age"],
          ["A", 34],
        ],
      }),
      sheets: [{ name: "Data", rowCount: 2, colCount: 2, isLikelyDictionary: false }],
    } as any);

    render(<ImportStage />);

    expect(screen.getAllByTestId("import-active-panel")).toHaveLength(1);
    expect(screen.getByText(/patients\.xlsx · 2 rows × 2 columns/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
    expect(screen.getByLabelText(/Adult/)).toBeDefined();
  });

  it("continues from Study settings to Sheet & header and collapses settings", () => {
    useStore.setState({
      stage: 1,
      file: new File(["arm,age\nA,34\n"], "cohort.csv", { type: "text/csv" }),
      data: dataFrame(),
    } as any);

    render(<ImportStage />);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(useStore.getState().stage).toBe(2);
    expect(screen.getByText(/Adult · Metric units · Design not specified/)).toBeDefined();
    expect(screen.getByRole("heading", { level: 2, name: "Header row" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Looks right" })).toBeDefined();
  });

  it("keeps the dictionary section active and skippable after one-click CSV header confirm", () => {
    useStore.setState({
      stage: 2,
      file: new File(["arm,age\nA,34\n"], "cohort.csv", { type: "text/csv" }),
      data: dataFrame(),
    } as any);

    render(<ImportStage />);
    expect(screen.queryByText("1. Select Data Sheet")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Looks right" }));

    expect(useStore.getState().stage).toBe(3);
    expect(screen.getByText("Upload a separate dictionary file (optional)")).toBeDefined();
    expect(screen.queryByTestId("dictionary-detect-modal")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Skip - continue to variable types" }));
    expect(useStore.getState().stage).toBe(4);
  });

  it("lets Study settings expand inline and update the summary", () => {
    useStore.setState({
      stage: 2,
      file: new File(["arm,age\nA,34\n"], "cohort.csv", { type: "text/csv" }),
      data: dataFrame(),
    } as any);

    render(<ImportStage />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getAllByTestId("import-active-panel")).toHaveLength(1);
    expect(screen.getByTestId("import-section-study").getAttribute("data-state")).toBe("active");
    fireEvent.click(screen.getByRole("radio", { name: /Pediatric/ }));
    fireEvent.click(screen.getByRole("radio", { name: /Imperial/ }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(useStore.getState().researchPopulation).toBe("pediatric");
    expect(useStore.getState().unitSystem).toBe("imperial");
    expect(screen.getByText(/Pediatric · Imperial units/)).toBeDefined();
  });

  it("renders Study Design options and records a randomized trial selection", () => {
    useStore.setState({
      stage: 1,
      file: new File(["arm,age\nA,34\n"], "cohort.csv", { type: "text/csv" }),
      data: dataFrame(),
    } as any);

    render(<ImportStage />);

    const group = screen.getByRole("radiogroup", { name: "Study Design" });
    expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(4);
    expect((screen.getByRole("radio", { name: /Not specified/ }) as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole("radio", { name: /Randomized trial/ }));

    expect(useStore.getState().studyDesign).toBe("randomized_trial");
  });

  it("supports arrow-key selection within a native choice group", async () => {
    useStore.setState({ stage: 1, file: new File(["arm,age\nA,34\n"], "cohort.csv"), data: dataFrame() } as any);
    render(<ImportStage />);
    const adult = screen.getByRole("radio", { name: /Adult/ });
    adult.focus();
    fireEvent.keyDown(adult, { key: "ArrowDown" });
    expect((screen.getByRole("radio", { name: /Pediatric/ }) as HTMLInputElement).checked).toBe(true);
    expect(useStore.getState().researchPopulation).toBe("pediatric");
  });

  it("keeps the Study settings summary byte-identical when study design is unspecified", () => {
    useStore.setState({
      stage: 2,
      file: new File(["arm,age\nA,34\n"], "cohort.csv", { type: "text/csv" }),
      data: dataFrame(),
      studyDesign: "unspecified",
    } as any);

    render(<ImportStage />);

    expect(screen.getByText(/Adult · Metric units · Design not specified/)).toBeDefined();
  });

  it("keeps large-N notices visible after File collapses", () => {
    useStore.setState({
      stage: 1,
      file: new File(["arm\nA\n"], "large.csv", { type: "text/csv" }),
      data: {
        ...dataFrame(),
        rows: Array.from({ length: LARGE_N_NOTICE_THRESHOLD + 1 }, () => ["A", 34]),
      },
    } as any);

    render(<ImportStage />);

    expect(screen.getByText(/^This file has 50,001 rows/)).toBeDefined();
    expect(screen.queryByText(/optional Modeling step/)).toBeNull();
    expect(screen.getByText(/large\.csv · 50,001 rows × 2 columns/)).toBeDefined();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDefined();
  });

  it("Replace returns to stage 1 and clears the file", () => {
    useStore.setState({
      stage: 3,
      file: new File(["arm,age\nA,34\n"], "cohort.csv", { type: "text/csv" }),
      data: dataFrame(),
    } as any);

    render(<ImportStage />);
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));

    expect(useStore.getState().stage).toBe(1);
    expect(useStore.getState().file).toBeNull();
    expect(useStore.getState().data).toBeNull();
  });

  it("shows D39 detection for a multi-sheet XLSX dictionary without opening another accordion panel", async () => {
    const file = makeWorkbookFile("patients.xlsx", {
      Data: [
        ["arm", "age"],
        ["A", 34],
        ["B", 48],
      ],
      Dictionary: [
        ["Variable", "Label", "Encoding"],
        ["arm", "Treatment arm", "A: Active, B: Control"],
        ["age", "Age in years", ""],
      ],
    });
    useStore.setState({
      stage: 3,
      file,
      data: dataFrame("patients.xlsx", "Data"),
      sheets: [
        { name: "Data", rowCount: 3, colCount: 2, isLikelyDictionary: false },
        { name: "Dictionary", rowCount: 3, colCount: 3, isLikelyDictionary: true },
      ],
      selectedSheet: "Data",
    } as any);

    render(<ImportStage />);

    await waitFor(() => expect(screen.getByTestId("dictionary-detect-banner")).toBeDefined());
    expect(screen.getByText(/We found a dictionary on the “Dictionary” sheet/)).toBeDefined();
    expect(screen.queryByText("Upload separate dictionary file")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Skip/ })).toHaveLength(1);
    expect(screen.getAllByTestId("import-active-panel")).toHaveLength(1);
  });

  it("progresses section state from File through Study, Header, and Dictionary", async () => {
    useStore.setState({ stage: 1, file: new File(["arm,age\nA,34\n"], "cohort.csv"), data: dataFrame(), sheets: [] } as any);
    render(<ImportStage />);
    const states = () => ["file", "study", "header", "dictionary"].map((key) => screen.getByTestId(`import-section-${key}`).getAttribute("data-state"));
    expect(states()).toEqual(["done", "active", "pending", "pending"]);
    fireEvent.click(screen.getByTestId("study-settings-continue"));
    expect(states()).toEqual(["done", "done", "active", "pending"]);
    useStore.setState({ stage: 3 } as any);
    await waitFor(() => expect(states()).toEqual(["done", "done", "done", "active"]));
  });

  it("binds the study aside to randomized and non-human settings", () => {
    useStore.setState({ stage: 1, file: new File(["x"], "cohort.csv"), data: dataFrame(), researchPopulation: "adult", studyDesign: "unspecified" } as any);
    render(<ImportStage />);
    fireEvent.click(screen.getByRole("radio", { name: /Randomized trial/ }));
    expect(screen.getByText("SMD suggested")).toBeDefined();
    fireEvent.click(screen.getByRole("radio", { name: /Other \/ non-human/ }));
    expect(screen.getAllByText("Off")).toHaveLength(1);
    expect(screen.getByText("SMD suggested")).toBeDefined();
  });

  it("uses the real sample workbook dimensions in the sample card", () => {
    const workbook = XLSX.read(readFileSync(path.resolve(process.cwd(), "public/samples/easytableone_sample.xlsx")), { type: "buffer" });
    const dataSheet = XLSX.utils.sheet_to_json(workbook.Sheets.Data, { header: 1 }) as unknown[][];
    expect(dataSheet.length - 1).toBe(25);
    expect((dataSheet[0] as unknown[]).length).toBe(8);
    expect(workbook.Sheets.Dictionary).toBeDefined();
    render(<ImportStage />);
    expect(screen.getByText("Sample workbook — 25 participants · 8 variables · includes a dictionary sheet")).toBeDefined();
  });

  it("moves focus to the Header heading after Study continues", async () => {
    useStore.setState({ stage: 1, file: new File(["arm,age\nA,34\n"], "cohort.csv"), data: dataFrame(), sheets: [] } as any);
    render(<ImportStage />);
    fireEvent.click(screen.getByTestId("study-settings-continue"));
    await waitFor(() => expect(document.activeElement?.textContent).toContain("Header row"));
  });
});
