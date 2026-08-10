import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import * as XLSX from "xlsx";
import { beforeEach, describe, expect, it } from "vitest";
import { useStore } from "../../store";
import type { DataFrame } from "../../core/types";
import DictionaryStage from "./DictionaryStage";

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

describe("DictionaryStage", () => {
  beforeEach(() => {
    const data: DataFrame = {
      columns: [
        { name: "age", originalName: "age" },
        { name: "sex", originalName: "sex" },
      ],
      rows: [
        [34, 1],
        [48, 2],
        [41, 1],
      ],
      meta: {
        sourceFile: "study.xlsx",
        sheetName: "Data",
        parseWarnings: [],
        locale: { decimalSeparator: ".", thousandSeparator: "," },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: "utf-8",
        missingSentinels: [],
      },
    };

    useStore.setState({
      stage: 3,
      file: new File(["age,sex\n34,1\n48,2\n"], "study.csv", { type: "text/csv" }),
      sheets: [{ name: "Data", rowCount: 4, colCount: 2, isLikelyDictionary: false }],
      data,
      schema: null,
      auditLog: [],
    } as any);
  });

  it("allows importing a dictionary from a separate one-sheet workbook", async () => {
    render(<DictionaryStage />);

    const dictionaryFile = makeWorkbookFile("dictionary.xlsx", {
      Codebook: [
        ["Variable", "Label", "Encoding"],
        ["age", "Age in years", ""],
        ["sex", "Biological sex", "1: Female, 2: Male"],
      ],
    });

    fireEvent.change(screen.getByLabelText("Upload separate dictionary file"), {
      target: { files: [dictionaryFile] },
    });

    await waitFor(() => {
      expect(useStore.getState().stage).toBe(3);
      expect(screen.getByText(/dictionary\.xlsx loaded/)).toBeDefined();
    });

    expect(screen.getByText("Select Dictionary Sheet")).toBeDefined();
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("uploaded:Codebook");
    await waitFor(() => expect(screen.getByText("2 of 2 data columns matched this dictionary.")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Import dictionary" }));

    await waitFor(() => expect(useStore.getState().stage).toBe(4));
    const schema = useStore.getState().schema;
    expect(schema?.dictionarySource).toBe("imported");
    expect(schema?.columns.find((c) => c.name === "age")?.displayLabel).toBe("Age in years");
    expect(schema?.columns.find((c) => c.name === "sex")?.levels?.map((lv) => lv.label)).toEqual([
      "Female",
      "Male",
    ]);
  });

  it("allows importing a dictionary from a separate CSV file", async () => {
    render(<DictionaryStage />);

    const dictionaryFile = new File(
      ["Variable,Label,Encoding\nage,Age in years,\nsex,Biological sex,\"1: Female, 2: Male\"\n"],
      "dictionary.csv",
      { type: "text/csv" },
    );

    fireEvent.change(screen.getByLabelText("Upload separate dictionary file"), {
      target: { files: [dictionaryFile] },
    });

    await waitFor(() => {
      expect(screen.getByText(/dictionary\.csv loaded/)).toBeDefined();
    });

    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("uploaded:CSV dictionary");
    await waitFor(() => expect(screen.getByText("2 of 2 data columns matched this dictionary.")).toBeDefined());

    fireEvent.click(screen.getByRole("button", { name: "Import dictionary" }));

    await waitFor(() => expect(useStore.getState().stage).toBe(4));
    const schema = useStore.getState().schema;
    expect(schema?.dictionarySource).toBe("imported");
    expect(schema?.columns.find((c) => c.name === "age")?.displayLabel).toBe("Age in years");
    expect(schema?.columns.find((c) => c.name === "sex")?.levels?.map((lv) => lv.label)).toEqual([
      "Female",
      "Male",
    ]);
  });

  it("preserves variable-type choices while replacing dictionary labels and levels", async () => {
    useStore.setState({
      schema: {
        columns: [
          { name: "age", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok", exclusionReason: "Not for this table" },
          { name: "sex", inferredType: "categorical", confirmedType: "categorical_ordinal", cardinalityTier: "ok" },
        ],
        dictionarySource: "imported",
      },
    } as any);
    render(<DictionaryStage />);

    const dictionaryFile = makeWorkbookFile("revised_dictionary.xlsx", {
      Codebook: [
        ["variable", "label", "coding"],
        ["age", "Age at admission", ""],
        ["sex", "Sex at admission", "1: Female; 2: Male"],
      ],
    });
    fireEvent.change(screen.getByLabelText("Upload separate dictionary file"), {
      target: { files: [dictionaryFile] },
    });
    await waitFor(() => expect(screen.getByText("2 of 2 data columns matched this dictionary.")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Import dictionary" }));

    await waitFor(() => expect(useStore.getState().stage).toBe(4));
    const columns = useStore.getState().schema!.columns;
    expect(columns.find((column) => column.name === "age")).toMatchObject({
      confirmedType: "continuous",
      exclusionReason: "Not for this table",
      displayLabel: "Age at admission",
    });
    expect(columns.find((column) => column.name === "sex")).toMatchObject({
      confirmedType: "categorical_ordinal",
      displayLabel: "Sex at admission",
      levels: [{ code: 1, label: "Female" }, { code: 2, label: "Male" }],
    });
  });

  it("progressively discloses detected dictionaries in embedded mode", async () => {
    const file = makeWorkbookFile("study.xlsx", {
      Data: [
        ["age", "sex"],
        [34, 1],
        [48, 2],
      ],
      Dictionary: [
        ["Variable", "Label", "Encoding"],
        ["age", "Age in years", ""],
        ["sex", "Biological sex", "1: Female, 2: Male"],
      ],
    });
    useStore.setState({
      file,
      sheets: [
        { name: "Data", rowCount: 3, colCount: 2, isLikelyDictionary: false },
        { name: "Dictionary", rowCount: 3, colCount: 3, isLikelyDictionary: true },
      ],
    } as any);

    render(<DictionaryStage embedded />);

    await waitFor(() => expect(screen.getByTestId("dictionary-detect-banner")).toBeDefined());
    expect(screen.queryByLabelText("Upload separate dictionary file")).toBeNull();
    expect(screen.queryByText("Select Dictionary Sheet")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Skip/ })).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Use this dictionary" }));
    await waitFor(() => expect(useStore.getState().stage).toBe(4));
    expect(useStore.getState().schema?.dictionarySource).toBe("imported");
  });

  it("reveals manual dictionary controls from the embedded detected state", async () => {
    const file = makeWorkbookFile("study.xlsx", {
      Data: [
        ["age", "sex"],
        [34, 1],
        [48, 2],
      ],
      Dictionary: [
        ["Variable", "Label", "Encoding"],
        ["age", "Age in years", ""],
        ["sex", "Biological sex", "1: Female, 2: Male"],
      ],
    });
    useStore.setState({
      file,
      sheets: [
        { name: "Data", rowCount: 3, colCount: 2, isLikelyDictionary: false },
        { name: "Dictionary", rowCount: 3, colCount: 3, isLikelyDictionary: true },
      ],
    } as any);

    render(<DictionaryStage embedded />);

    await waitFor(() => expect(screen.getByTestId("dictionary-detect-banner")).toBeDefined());
    fireEvent.click(screen.getByRole("button", { name: "Use a different dictionary" }));

    expect(screen.getByLabelText("Upload separate dictionary file")).toBeDefined();
    expect(screen.getByText("Select Dictionary Sheet")).toBeDefined();
    expect(screen.getByRole("button", { name: "Back to detected" })).toBeDefined();
    expect(screen.getAllByRole("button", { name: /Skip/ })).toHaveLength(1);
  });

  it("does not offer the active data sheet as a current-workbook dictionary option", () => {
    useStore.setState({
      file: makeWorkbookFile("study.xlsx", {
        Data: [["age", "sex"], [34, 1]],
        Dictionary: [["Variable", "Label"], ["age", "Age"]],
      }),
      sheets: [
        { name: "Data", rowCount: 2, colCount: 2, isLikelyDictionary: false },
        { name: "Dictionary", rowCount: 2, colCount: 2, isLikelyDictionary: true },
      ],
    } as any);

    render(<DictionaryStage embedded />);

    const optionTexts = Array.from(screen.getByRole("combobox").querySelectorAll("option")).map((option) => option.textContent ?? "");
    expect(optionTexts.some((text) => text.includes("Data - current workbook"))).toBe(false);
    expect(optionTexts.some((text) => text.includes("Dictionary"))).toBe(true);
  });

  it("renders one skip control in embedded manual mode without a detected candidate", () => {
    render(<DictionaryStage embedded />);

    expect(screen.getByLabelText("Upload separate dictionary file")).toBeDefined();
    expect(screen.queryByTestId("dictionary-detect-banner")).toBeNull();
    expect(screen.getAllByRole("button", { name: /Skip/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Skip - continue to variable types" })).toBeDefined();
  });

  it("warns and skips without imported source for a zero-match dictionary", async () => {
    render(<DictionaryStage embedded />);

    const dictionaryFile = makeWorkbookFile("wrong_dictionary.xlsx", {
      Codebook: [
        ["Variable", "Label", "Encoding"],
        ["height", "Height", ""],
        ["weight", "Weight", ""],
      ],
    });

    fireEvent.change(screen.getByLabelText("Upload separate dictionary file"), {
      target: { files: [dictionaryFile] },
    });

    await waitFor(() => expect(screen.getByText("0 of 2 data columns matched this dictionary.")).toBeDefined());
    expect(screen.getByText(/This dictionary doesn't match your dataset/)).toBeDefined();
    expect(screen.queryByRole("button", { name: "Import dictionary" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Skip - continue without a dictionary" }));

    await waitFor(() => expect(useStore.getState().stage).toBe(4));
    const schema = useStore.getState().schema;
    expect(schema?.dictionarySource).not.toBe("imported");
    expect(schema?.columns.find((c) => c.name === "age")?.displayLabel).toBeUndefined();
    expect(schema?.columns.find((c) => c.name === "sex")?.displayLabel).toBeUndefined();
  });

  it("cautions but allows a partial-match dictionary", async () => {
    render(<DictionaryStage embedded />);

    const dictionaryFile = makeWorkbookFile("partial_dictionary.xlsx", {
      Codebook: [
        ["Variable", "Label", "Encoding"],
        ["age", "Age in years", ""],
        ["height", "Height", ""],
      ],
    });

    fireEvent.change(screen.getByLabelText("Upload separate dictionary file"), {
      target: { files: [dictionaryFile] },
    });

    await waitFor(() => expect(screen.getByText("1 of 2 data columns matched this dictionary.")).toBeDefined());
    expect(screen.getByText(/Only 1 of 2 columns matched/)).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Import dictionary" }));

    await waitFor(() => expect(useStore.getState().stage).toBe(4));
    const schema = useStore.getState().schema;
    expect(schema?.dictionarySource).toBe("imported");
    expect(schema?.columns.find((c) => c.name === "age")?.displayLabel).toBe("Age in years");
    expect(schema?.columns.find((c) => c.name === "sex")?.displayLabel).toBeUndefined();
    const audit = useStore.getState().auditLog.at(-1);
    expect(audit?.details).toMatchObject({ matched: 1, total: 2 });
  });
});
