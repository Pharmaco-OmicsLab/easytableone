import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = "outputs/support2_setup";
const outputPath = `${outputDir}/support2_dictionary.xlsx`;

const selected = new Set([
  "age", "sex", "race", "dzclass", "num.co", "diabetes", "dementia", "ca", "scoma",
  "meanbp", "hrt", "resp", "temp", "pafi", "wblc", "crea", "sod", "bun", "alb", "bili",
]);

const metadata = {
  age: ["Age", "yr", "", "Numeric"], death: ["Death (all-cause)", "", "0: No; 1: Yes", "Exclude - outcome"],
  sex: ["Sex", "", "male: Male; female: Female", "Yes/No category (binary)"],
  hospdead: ["In-hospital outcome", "", "0: Survived to discharge; 1: In-hospital death", "Grouping variable"],
  slos: ["Length of hospital stay", "days", "", "Exclude - post-baseline"], d_time: ["", "", "", ""],
  "d.time": ["Days from study entry to death", "days", "", "Exclude - outcome"],
  dzgroup: ["Primary diagnosis group", "", "", "Exclude - diagnosis detail"], dzclass: ["Disease class", "", "ARF/MOSF: Acute renal failure/multiple organ system failure; COPD/CHF/Cirrhosis: COPD, CHF, or cirrhosis; Cancer: Cancer; Coma: Coma", "Category (no order)"],
  "num.co": ["Number of coexisting conditions", "", "", "Numeric"], edu: ["Years of education", "yr", "", "Exclude - not selected"], income: ["Annual income category", "", "", "Exclude - not selected"],
  scoma: ["SUPPORT coma score", "", "", "Numeric"], charges: ["Hospital charges", "US dollars", "", "Exclude - post-baseline"], totcst: ["Total hospital costs", "US dollars", "", "Exclude - post-baseline"], totmcst: ["Total micro-costs", "US dollars", "", "Exclude - post-baseline"], avtisst: ["Average TISS score", "", "", "Exclude - post-baseline"],
  race: ["Race", "", "white: White; black: Black; hispanic: Hispanic; asian: Asian; other: Other", "Category (no order)"], sps: ["SUPPORT physiology score", "", "", "Exclude - model-derived"], aps: ["Acute physiology score", "", "", "Exclude - model-derived"], surv2m: ["Predicted 2-month survival", "", "", "Exclude - model-derived"], surv6m: ["Predicted 6-month survival", "", "", "Exclude - model-derived"], hday: ["Days in hospital before study entry", "days", "", "Exclude - post-baseline"],
  diabetes: ["Diabetes", "", "0: No; 1: Yes", "Yes/No category (binary)"], dementia: ["Dementia", "", "0: No; 1: Yes", "Yes/No category (binary)"], ca: ["Cancer status", "", "no: No cancer; yes: Cancer (non-metastatic); metastatic: Metastatic cancer", "Category (no order)"], prg2m: ["Physician-predicted 2-month survival", "", "", "Exclude - prognosis"], prg6m: ["Physician-predicted 6-month survival", "", "", "Exclude - prognosis"], dnr: ["Do-not-resuscitate status", "", "", "Exclude - post-baseline"], dnrday: ["Days to do-not-resuscitate order", "days", "", "Exclude - post-baseline"],
  meanbp: ["Mean arterial pressure", "mm Hg", "", "Numeric"], wblc: ["White-cell count", "10^3/mm^3", "", "Numeric"], hrt: ["Heart rate", "beats/min", "", "Numeric"], resp: ["Respiratory rate", "breaths/min", "", "Numeric"], temp: ["Temperature", "°C", "", "Numeric"], pafi: ["PaO2/FiO2 ratio", "", "", "Numeric"], alb: ["Albumin", "g/dL", "", "Numeric"], bili: ["Bilirubin", "mg/dL", "", "Numeric"], crea: ["Creatinine", "mg/dL", "", "Numeric"], sod: ["Serum sodium", "mmol/L", "", "Numeric"], ph: ["Arterial pH", "", "", "Exclude - candidate measure, not in final SUPPORT score"], glucose: ["Glucose", "mg/dL", "", "Exclude - 49.4% missing; not in final SUPPORT score"], bun: ["Blood urea nitrogen", "mg/dL", "", "Numeric"], urine: ["Urine output", "mL/day", "", "Exclude - >50% missing (do not restore)"],
  adlp: ["Activities of daily living before hospitalization", "", "", "Exclude - not selected"], adls: ["Activities of daily living at study entry", "", "", "Exclude - not selected"], sfdm2: ["Supportive functional status at 2 months", "", "", "Exclude - outcome"], adlsc: ["Activities of daily living change", "", "", "Exclude - outcome"],
};

const variables = ["age", "death", "sex", "hospdead", "slos", "d.time", "dzgroup", "dzclass", "num.co", "edu", "income", "scoma", "charges", "totcst", "totmcst", "avtisst", "race", "sps", "aps", "surv2m", "surv6m", "hday", "diabetes", "dementia", "ca", "prg2m", "prg6m", "dnr", "dnrday", "meanbp", "wblc", "hrt", "resp", "temp", "pafi", "alb", "bili", "crea", "sod", "ph", "glucose", "bun", "urine", "adlp", "adls", "sfdm2", "adlsc"];

const rows = variables.map((variable) => {
  const [label, units, coding, action] = metadata[variable] ?? [variable, "", "", "Exclude - not selected"];
  return [variable, label || variable, units, coding, action, selected.has(variable) ? "Yes" : "No"];
});

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("Dictionary");
sheet.showGridLines = false;
// The importer's header detector requires these exact fields on the first row.
sheet.getRange("A1:F1").values = [["variable", "label", "units", "coding", "recommended app action", "include in Table 2"]];
sheet.getRange("A2:F48").values = rows;
sheet.getRange("A1:F1").format = { fill: "#17365D", font: { bold: true, color: "#FFFFFF" }, horizontalAlignment: "center", wrapText: true, verticalAlignment: "center", borders: { preset: "outside", style: "thin", color: "#1F4E78" } };
sheet.getRange("A1:F48").format.borders = { insideHorizontal: { style: "thin", color: "#D9E2F3" }, bottom: { style: "thin", color: "#D9E2F3" } };
sheet.getRange("A2:F48").format.wrapText = true;
sheet.getRange("A2:A48").format.font = { bold: true, color: "#1F1F1F" };
sheet.getRange("F2:F48").conditionalFormats.add("containsText", { text: "Yes", format: { fill: "#E2F0D9", font: { bold: true, color: "#375623" } } });
sheet.getRange("E2:E48").conditionalFormats.add("containsText", { text: "Grouping", format: { fill: "#FFF2CC", font: { bold: true, color: "#7F6000" } } });
sheet.getRange("E2:E48").conditionalFormats.add("containsText", { text: ">50%", format: { fill: "#FCE4D6", font: { bold: true, color: "#C00000" } } });
sheet.getRange("A1").format.columnWidth = 16;
sheet.getRange("B1").format.columnWidth = 33;
sheet.getRange("C1").format.columnWidth = 15;
sheet.getRange("D1").format.columnWidth = 65;
sheet.getRange("E1").format.columnWidth = 32;
sheet.getRange("F1").format.columnWidth = 17;
sheet.getRange("A1:F48").format.rowHeight = 22;
sheet.getRange("D2:D48").format.rowHeight = 38;
sheet.freezePanes.freezeRows(1);
sheet.tables.add("A1:F48", true, "Support2DictionaryTable");

await fs.mkdir(outputDir, { recursive: true });
const file = await SpreadsheetFile.exportXlsx(workbook);
await file.save(outputPath);

const inspection = await workbook.inspect({ kind: "table", range: "Dictionary!A1:F12", include: "values,formulas", tableMaxRows: 12, tableMaxCols: 6 });
console.log(inspection.ndjson);
const errors = await workbook.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 20 }, summary: "formula error scan" });
console.log(errors.ndjson);
const preview = await workbook.render({ sheetName: "Dictionary", autoCrop: "all", scale: 1.2, format: "png" });
await fs.writeFile(`${outputDir}/support2_dictionary_preview.png`, new Uint8Array(await preview.arrayBuffer()));
const previewTop = await workbook.render({ sheetName: "Dictionary", range: "A1:F25", scale: 1.5, format: "png" });
await fs.writeFile(`${outputDir}/support2_dictionary_preview_top.png`, new Uint8Array(await previewTop.arrayBuffer()));
const previewBottom = await workbook.render({ sheetName: "Dictionary", range: "A26:F48", scale: 1.5, format: "png" });
await fs.writeFile(`${outputDir}/support2_dictionary_preview_bottom.png`, new Uint8Array(await previewBottom.arrayBuffer()));
