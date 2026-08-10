import JSZip from "jszip";
import type { ModelingDataExport, ModelingDataRow } from "../modeling/types";

type ModelingDataTableKey = Exclude<keyof ModelingDataExport, "warnings">;

const TABLES: Array<[ModelingDataTableKey, string]> = [
  ["modelInputMatrix", "model_input_matrix.csv"],
  ["lrPredictedProbabilities", "lr_predicted_probabilities.csv"],
  ["mlOofPredictions", "ml_oof_predictions.csv"],
  ["mlRocCurve", "ml_roc_curve.csv"],
  ["mlCalibration", "ml_calibration.csv"],
  ["mlVariableImportance", "ml_variable_importance.csv"],
  ["mlMetrics", "ml_metrics.csv"],
];

function columnsFor(rows: ModelingDataRow[]): string[] {
  const seen = new Set<string>();
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}

function quoteCsv(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: ModelingDataRow[]): string {
  const columns = columnsFor(rows);
  if (columns.length === 0) return "";
  const lines = [
    columns.map(quoteCsv).join(","),
    ...rows.map((row) => columns.map((column) => quoteCsv(row[column])).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

export async function buildModelingDataZip(data: ModelingDataExport): Promise<Blob> {
  const zip = new JSZip();
  for (const [key, filename] of TABLES) {
    const rows = data[key];
    if (Array.isArray(rows)) {
      zip.file(filename, toCsv(rows));
    }
  }
  if (data.warnings?.length) {
    zip.file("warnings.txt", `${data.warnings.join("\n")}\n`);
  }
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
