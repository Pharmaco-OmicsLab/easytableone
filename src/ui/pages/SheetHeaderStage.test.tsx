import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStore } from "../../store";

const xlsxMocks = vi.hoisted(() => ({
  read: vi.fn(),
  sheetToJson: vi.fn(),
  parseXLSXSheet: vi.fn(),
}));

vi.mock("xlsx", () => ({
  read: xlsxMocks.read,
  utils: { sheet_to_json: xlsxMocks.sheetToJson },
}));

vi.mock("../../core/parser/xlsx", () => ({
  enumerateSheets: vi.fn(),
  parseXLSXSheet: xlsxMocks.parseXLSXSheet,
}));

import SheetHeaderStage from "./SheetHeaderStage";

describe("SheetHeaderStage row limit", () => {
  beforeEach(() => {
    const file = new File([""], "large.xlsx");
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
    useStore.setState({
      stage: 2,
      file,
      sheets: [{ name: "Data", rowCount: 100_002, colCount: 1, isLikelyDictionary: false }],
      selectedSheet: "Data",
      headerRowIndex: 0,
      data: null,
      error: null,
    } as any);
    xlsxMocks.read.mockReset().mockReturnValue({ Sheets: { Data: {} } });
    xlsxMocks.sheetToJson.mockReset().mockReturnValue([
      ["id"],
      ...Array.from({ length: 100_001 }, (_, index) => [index + 1]),
    ]);
    xlsxMocks.parseXLSXSheet.mockReset();
  });

  it("rejects an oversized sheet before parsing or storing it", async () => {
    render(<SheetHeaderStage />);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("100,001 data rows"));
    const confirm = screen.getByTestId("header-row-confirm") as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(useStore.getState().data).toBeNull();
    expect(xlsxMocks.parseXLSXSheet).not.toHaveBeenCalled();
    fireEvent.click(confirm);
    expect(useStore.getState().stage).toBe(2);
  });

  it("changes the selected header through row buttons and the stepper", async () => {
    useStore.setState({
      stage: 2,
      file: new File([""], "small.xlsx"),
      sheets: [{ name: "Data", rowCount: 3, colCount: 2, isLikelyDictionary: false }],
      selectedSheet: "Data",
      headerRowIndex: 0,
      data: null,
      error: null,
    } as any);
    xlsxMocks.read.mockReturnValue({ Sheets: { Data: {} } });
    xlsxMocks.sheetToJson.mockReturnValue([["Report title", ""], ["arm", "age"], ["A", 34]]);
    render(<SheetHeaderStage embedded />);
    const rowTwo = await screen.findByRole("button", { name: "Use row 2 as header" });
    fireEvent.click(rowTwo);
    expect(useStore.getState().headerRowIndex).toBe(1);
    fireEvent.click(screen.getByRole("button", { name: "Next row" }));
    expect(useStore.getState().headerRowIndex).toBe(2);
    expect(screen.getByTestId("header-row-selector").textContent).toBe("3");
  });
});
