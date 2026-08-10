import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { EXCEL_ERROR_TOKENS, parseCSV } from "./csv";
import { parseXLSXSheet } from "./xlsx";

describe("Excel error token parsing", () => {
  it("coerces CSV Excel errors to missing and records a column warning", async () => {
    const file = new File(["AGEMO,value\n#REF!,1\n#REF!,2\n"], "errors.csv", {
      type: "text/csv",
    });

    const df = await parseCSV(file);

    expect(df.rows.map((row) => row[0])).toEqual([null, null]);
    expect(df.rows.map((row) => row[1])).toEqual([1, 2]);
    expect(df.meta.excelErrorCounts).toEqual({ AGEMO: 2 });
    expect(df.meta.parseWarnings[0].message).toContain("2 Excel error value(s) (#REF!)");
    expect(df.meta.missingSentinels).toEqual(expect.arrayContaining(EXCEL_ERROR_TOKENS));
  });

  it("coerces XLSX Excel errors to missing and records a column warning", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["AGEMO", "value"],
      ["#VALUE!", 10],
      ["#VALUE!", 20],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

    const df = parseXLSXSheet(workbook, "Sheet1", 0, "errors.xlsx");

    expect(df.rows.map((row) => row[0])).toEqual([null, null]);
    expect(df.rows.map((row) => row[1])).toEqual([10, 20]);
    expect(df.meta.excelErrorCounts).toEqual({ AGEMO: 2 });
    expect(df.meta.parseWarnings[0].message).toContain("2 Excel error value(s) (#VALUE!)");
    expect(df.meta.missingSentinels).toEqual(expect.arrayContaining(EXCEL_ERROR_TOKENS));
  });

  it("does not warn for clean numeric data", async () => {
    const file = new File(["age\n1\n2\n3\n"], "clean.csv", { type: "text/csv" });
    const df = await parseCSV(file);

    expect(df.meta.excelErrorCounts).toBeUndefined();
    expect(df.meta.parseWarnings.some((warning) => warning.message.includes("Excel error"))).toBe(false);
  });
});
