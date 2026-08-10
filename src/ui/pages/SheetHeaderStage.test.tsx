import { render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it } from "vitest";
import { LARGE_N_NOTICE_THRESHOLD } from "../../core/performance/largeDatasetGuardrails";
import { useStore } from "../../store";
import SheetHeaderStage from "./SheetHeaderStage";

function makeWorkbookFile(name: string, rows: any[][]): File {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "Data");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  return new File([bytes], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("SheetHeaderStage", () => {
  beforeEach(() => {
    useStore.setState({
      stage: 2,
      file: { name: "single.xlsx" } as any,
      sheets: [{ name: "Data", rowCount: 3, colCount: 2, isLikelyDictionary: false }],
      selectedSheet: null,
      headerRowIndex: 0,
      data: null,
      error: null,
    } as any);
  });

  it("auto-selects a single XLSX sheet and hides the picker", async () => {
    render(<SheetHeaderStage />);

    await waitFor(() => expect(useStore.getState().selectedSheet).toBe("Data"));
    expect(screen.queryByText("1. Select Data Sheet")).toBeNull();
    expect(screen.getByText("2. Confirm Header Row")).toBeDefined();
  });

  it("reloads missing workbook sheets and still hides the picker for one-sheet workbooks", async () => {
    useStore.setState({
      file: makeWorkbookFile("single.xlsx", [
        ["age", "sex"],
        [42, "F"],
      ]),
      sheets: [],
      selectedSheet: null,
    } as any);

    render(<SheetHeaderStage />);

    expect(screen.getByText("1. Select Data Sheet")).toBeDefined();
    expect(screen.getByText("Reading workbook sheets...")).toBeDefined();

    await waitFor(() => expect(useStore.getState().selectedSheet).toBe("Data"));
    expect(screen.getByText("Preview using row 1 as headers")).toBeDefined();
    expect(screen.queryByText("Reading workbook sheets...")).toBeNull();
  });

  it("shows a real XLSX preview with counts and likely grouping candidates", async () => {
    useStore.setState({
      file: makeWorkbookFile("single.xlsx", [
        ["group", "age", "sex"],
        ["A", 42, "F"],
        ["B", 51, "M"],
        ["A", 39, "F"],
      ]),
      sheets: [{ name: "Data", rowCount: 4, colCount: 3, isLikelyDictionary: false }],
      selectedSheet: "Data",
      headerRowIndex: 0,
      data: null,
    } as any);

    render(<SheetHeaderStage />);

    await waitFor(() => expect(screen.getByText("Preview using row 1 as headers")).toBeDefined());
    expect(screen.getByText("3 rows x 3 columns")).toBeDefined();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText(/Likely grouping candidates:/).parentElement?.textContent).toContain("group");
    expect(document.body.textContent).not.toContain("0-indexed");
  });

  it("shows a real CSV preview with counts", async () => {
    useStore.setState({
      file: { name: "study.csv" } as any,
      sheets: [],
      selectedSheet: null,
      headerRowIndex: 0,
      data: {
        columns: [{ originalName: "arm", name: "arm" }, { originalName: "age", name: "age" }],
        rows: [["A", 10], ["B", 20], ["A", 30]],
        meta: {} as any,
      },
    } as any);

    render(<SheetHeaderStage />);

    expect(screen.getByText("3 rows x 2 columns")).toBeDefined();
    expect(screen.getByText("10")).toBeDefined();
    expect(screen.getByText(/Likely grouping candidates:/).parentElement?.textContent).toContain("arm");
  });

  it("shows the large-N notice from the preview row count", async () => {
    useStore.setState({
      file: { name: "study.csv" } as any,
      sheets: [],
      selectedSheet: null,
      headerRowIndex: 0,
      data: {
        columns: [{ originalName: "arm", name: "arm" }],
        rows: Array.from({ length: LARGE_N_NOTICE_THRESHOLD + 1 }, () => ["A"]),
        meta: {} as any,
      },
    } as any);

    render(<SheetHeaderStage />);

    expect(screen.getByText(/50,001 rows/)).toBeDefined();
    expect(screen.getByText(/Table 1 and EDA/)).toBeDefined();
  });
});
