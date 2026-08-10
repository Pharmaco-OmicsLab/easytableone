/**
 * Round 12 §3.3 — Static asset existence test.
 * Asserts that public/samples/easytableone_sample.xlsx is present.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { detectDictionarySheets, type WorkbookSheets } from "../src/core/dictionary/sheetDetector";

const assetPath = path.resolve(
  __dirname,
  "..",
  "public",
  "samples",
  "easytableone_sample.xlsx"
);

function readSampleWorkbook(): WorkbookSheets {
  const workbook = XLSX.readFile(assetPath);
  const sheets: WorkbookSheets["sheets"] = {};
  for (const sheetName of workbook.SheetNames) {
    sheets[sheetName] = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      defval: null,
    }) as WorkbookSheets["sheets"][string];
  }
  return { sheets };
}

describe("Sample workbook asset", () => {
  it("public/samples/easytableone_sample.xlsx exists", () => {
    expect(fs.existsSync(assetPath), `Expected file at: ${assetPath}`).toBe(true);
  });

  it("sample workbook is a non-empty file (> 1 kB)", () => {
    const stat = fs.statSync(assetPath);
    expect(stat.size).toBeGreaterThan(1024);
  });

  it("ships a long-format variable/code/label dictionary that detector imports as level labels", () => {
    const workbook = readSampleWorkbook();
    const dataRows = workbook.sheets.Data;
    const dictionaryRows = workbook.sheets.Dictionary;

    expect(dataRows?.[0]).toEqual([
      "patient_id",
      "treatment",
      "age",
      "wbc",
      "platelet",
      "sex",
      "severity",
      "smoker",
    ]);
    expect(dictionaryRows?.[0]).toEqual(["variable", "code", "label"]);
    expect(dictionaryRows).toContainEqual(["treatment", 0, "Placebo"]);
    expect(dictionaryRows).toContainEqual(["treatment", 1, "Drug A"]);
    expect(dictionaryRows).toContainEqual(["smoker", 0, "No"]);
    expect(dictionaryRows).toContainEqual(["smoker", 1, "Yes"]);

    const detected = detectDictionarySheets(
      workbook,
      "Data",
      dataRows[0].map(String),
    );
    expect(detected).toHaveLength(1);
    expect(detected[0].sheetName).toBe("Dictionary");
    expect(detected[0].isLongFormat).toBe(true);
    expect(detected[0].mapping.treatment?.label).toBe("");
    expect(detected[0].mapping.smoker?.label).toBe("");
    expect(detected[0].dictionaryMap?.treatment.levels).toEqual([
      { code: 0, label: "Placebo" },
      { code: 1, label: "Drug A" },
    ]);
    expect(detected[0].dictionaryMap?.smoker.levels).toEqual([
      { code: 0, label: "No" },
      { code: 1, label: "Yes" },
    ]);
  });

  it("_materials copy matches the public downloadable sample", () => {
    const materialsPath = path.resolve(
      __dirname,
      "..",
      "_materials",
      "easytableone_sample.xlsx"
    );
    expect(fs.readFileSync(materialsPath)).toEqual(fs.readFileSync(assetPath));
  });
});
