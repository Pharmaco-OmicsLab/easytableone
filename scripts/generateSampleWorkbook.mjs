/**
 * One-off script to generate the sample workbook for the Round 12 tutorial.
 * Run with: node scripts/generateSampleWorkbook.mjs
 */

import * as XLSX from "xlsx";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputFiles = [
  path.join(__dirname, "..", "public", "samples", "easytableone_sample.xlsx"),
  path.join(__dirname, "..", "_materials", "easytableone_sample.xlsx"),
];

for (const file of outputFiles) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

// ─── Data sheet ─────────────────────────────────────────────────────────────
// 25 rows of synthetic clinical-trial data.
// Grouping: treatment (0=Placebo, 1=Drug A)
// Continuous: age, wbc, platelet
// Categorical: sex (1=Male, 2=Female), severity (1=Mild, 2=Moderate, 3=Severe), smoker (0=No, 1=Yes)
// ~3 missing cells

const rows = [
  // Headers
  ["patient_id", "treatment", "age", "wbc", "platelet", "sex", "severity", "smoker"],
  // Data (25 rows, realistic but synthetic)
  [1,  1, 45, 7.2, 220, 1, 1, 0],
  [2,  0, 52, 8.1, 185, 2, 2, 1],
  [3,  1, 38, 6.5, 310, 1, 1, 0],
  [4,  0, 61, 9.3, 145, 2, 3, 1],
  [5,  1, 47, 7.8, 265, 2, 2, 0],
  [6,  0, 55, 8.6, null, 1, 2, 0],  // missing platelet
  [7,  1, 43, 7.1, 195, 2, 1, 1],
  [8,  0, 59, 9.0, 160, 1, 3, 1],
  [9,  1, 50, 7.5, 240, 1, 2, 0],
  [10, 0, 48, 8.2, 175, 2, 2, 1],
  [11, 1, 35, 6.8, 330, 2, 1, 0],
  [12, 0, 63, 9.7, 130, 1, 3, 0],
  [13, 1, 41, 7.0, 280, 1, 1, 1],
  [14, 0, 57, 8.9, 155, 2, 3, 1],
  [15, 1, 44, 7.3, 215, 2, 2, 0],
  [16, 0, 53, 8.4, 190, 1, 2, 0],
  [17, 1, 39, 6.9, 295, null, 1, 1],  // missing sex
  [18, 0, 60, 9.1, 140, 2, 3, 1],
  [19, 1, 46, 7.6, 255, 1, 2, 0],
  [20, 0, 49, 8.3, 170, 2, 2, 1],
  [21, 1, 36, 6.7, 320, 2, 1, 0],
  [22, 0, 64, 9.8, 125, 1, 3, 0],
  [23, 1, 42, 7.2, 275, 1, 1, null],  // missing smoker
  [24, 0, 58, 8.8, 150, 2, 3, 1],
  [25, 1, 47, 7.4, 230, 1, 2, 0],
];

// ─── Dictionary sheet ────────────────────────────────────────────────────────
// Columns: variable, code, label.
// Include every data column so the dictionary sheet is auto-detected against the
// full workbook header; continuous/id variables have no level codes.
const dict = [
  ["variable", "code", "label"],
  ["patient_id", null, null],
  ["treatment", 0, "Placebo"],
  ["treatment", 1, "Drug A"],
  ["age", null, null],
  ["wbc", null, null],
  ["platelet", null, null],
  ["sex",       1, "Male"],
  ["sex",       2, "Female"],
  ["severity",  1, "Mild"],
  ["severity",  2, "Moderate"],
  ["severity",  3, "Severe"],
  ["smoker",    0, "No"],
  ["smoker",    1, "Yes"],
];

// ─── Assemble workbook ────────────────────────────────────────────────────────

const wb = XLSX.utils.book_new();

const wsData = XLSX.utils.aoa_to_sheet(rows);
XLSX.utils.book_append_sheet(wb, wsData, "Data");

const wsDict = XLSX.utils.aoa_to_sheet(dict);
XLSX.utils.book_append_sheet(wb, wsDict, "Dictionary");

for (const file of outputFiles) {
  XLSX.writeFile(wb, file);
  console.log(`Sample workbook written to: ${file}`);
}
