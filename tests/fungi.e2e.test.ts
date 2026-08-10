import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it, beforeAll } from "vitest";
import { enumerateSheets, parseXLSXSheet } from "../src/core/parser/xlsx";
import { inferSchema } from "../src/core/schema/inference";
import { classifyColumnsFromDict } from "../src/core/dictionary/importer";
import { runTable1 } from "../src/core/stats/runTable1";
import { formatTable } from "../src/core/format/formatTable";
import { pyodideClient } from "../src/workers/pyodide.client";

const MATERIALS_DIR = path.resolve(__dirname, "../_materials");

function getFile(filename: string): File {
  const directPath = path.join(MATERIALS_DIR, filename);
  const filepath = fs.existsSync(directPath)
    ? directPath
    : path.join(MATERIALS_DIR, "samples", filename);
  const buffer = fs.readFileSync(filepath);
  return new File([buffer], filename, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("Fungi E2E Pipeline", () => {
  beforeAll(async () => {
    await pyodideClient.isReady();
  }, 60000);

  it("fungi Sheet 2 grouped by Pallor/Cyanosis: docx footnote does not mention 2Ã—2", async () => {
    const file = getFile("250409_fungi_dataplus_master_file.xlsx");
    const { workbook, sheets } = await enumerateSheets(file);
    
    // Using Sheet 2 (which is typically index 1: "250207_SO_LIEU_BAI_BAO_201_MAU" if index 0 is first, let's use the exact name)
    const df = parseXLSXSheet(workbook, "250207_SO_LIEU_BAI_BAO_201_MAU", 0);
    
    // Parse Dictionary
    const dictSheet = workbook.Sheets["250113_variablecoding_250525"];
    const rawDict: any[][] = await import("xlsx").then((x) =>
      x.utils.sheet_to_json(dictSheet, { header: 1, defval: "" }),
    );
    // Basic map for dictionary importer
    const dictObj: Record<string, any> = {};
    for (const row of rawDict.slice(1)) {
      if (row[0] && row[1]) {
        // Mock parsing dictionary format
        const codeString = row[4] || ""; // Assume column 4 is encodings
        if (codeString) {
           const { parseEncodingString } = await import("../src/core/dictionary/encodingParser");
           const parsed = parseEncodingString(codeString);
           if (parsed.levels.length > 0) {
              dictObj[row[0]] = { levels: parsed.levels };
           }
        }
      }
    }
    
    let schema = inferSchema(df);
    schema = classifyColumnsFromDict(schema, dictObj);
    
    // Create Plan
    // Grouping by c9.1 Pallor/Cyanosis
    const plan = {
      rulesetVersion: "1.0",
      appVersion: "1.0",
      groupingVariable: "c9.1",
      includedVariables: schema.map(c => c.name).filter(n => n !== "c9.1" && n !== "id" && n !== "Date"),
      variableConfig: {},
      showSMD: true,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      auditLog: [],
    };
    
    // Default variable config
    for (const col of schema) {
      (plan.variableConfig as any)[col.name] = {
        label: col.label || col.name,
        treatAs: col.inferredType,
        missingness: "drop_row",
      };
    }
    
    const statsResult = await runTable1(df, plan);
    const fullSchema = { columns: schema, rawRows: df.rows };
    const formattedTable = formatTable(statsResult, "GENERIC", plan as any, fullSchema as any, "1.0.0");
    
    const allFootnoteText = formattedTable.footnotes.map((f: any) => f.text).join(' ');
    expect(allFootnoteText).not.toMatch(/2.?2 tables only/);
    expect(allFootnoteText).not.toMatch(/only supports 2.?2/);
    expect(formattedTable.methodsParagraph).not.toMatch(/2.?2 tables only/);
    
    // Check libVersions
    const scipyVer = statsResult.computeMetadata.libVersions.scipy;
    const [maj, min] = scipyVer.split('.').map(Number);
    expect(maj * 100 + min).toBeGreaterThanOrEqual(115);
  }, 100000);
});
