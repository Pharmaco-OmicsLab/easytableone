import type { DataFrame, DataQualityReport, Schema, SchemaColumn } from "../types";
import { detectOutliers } from "./outliers";
import { scanDictionaryCompliance } from "./dictionaryCompliance";

export function runQA(data: DataFrame, schemaOrColumns: Schema | SchemaColumn[]): DataQualityReport {
  // Accept either a full Schema or a bare SchemaColumn[] for backwards compatibility
  const schema: Schema | undefined = Array.isArray(schemaOrColumns) ? undefined : schemaOrColumns;
  const schemaColumns: SchemaColumn[] = Array.isArray(schemaOrColumns)
    ? schemaOrColumns
    : schemaOrColumns.columns;

  const rowCount = data.rows.length;

  const report: DataQualityReport = {
    columns: [],
    overallCompletenessPercent: 100,
    blockingErrors: [],
  };

  let totalCells = 0;
  let totalMissing = 0;

  schemaColumns.forEach((col, colIndex) => {
    let missingCount = 0;
    const values = data.rows.map((r) => r[colIndex]);
    const validValues: Array<string | number | boolean> = [];

    for (const v of values) {
      if (v === null || v === "") {
        missingCount++;
      } else {
        validValues.push(v);
      }
    }

    totalCells += rowCount;
    totalMissing += missingCount;

    const uniqueValues = new Set(validValues);
    const cardinality = uniqueValues.size;

    // Detect outliers for continuous variables (S-14: result is null only when computation impossible)
    let outliers;
    if (col.confirmedType === "continuous") {
      const out = detectOutliers(data, col.name, "iqr");
      // Only attach to report when computation succeeded AND outliers were found
      if (out && out.rowIndices.length > 0) {
        outliers = out;
      }
    }

    report.columns.push({
      name: col.name,
      missingCount,
      missingPercent: rowCount > 0 ? (missingCount / rowCount) * 100 : 0,
      outliers,
      cardinality,
      isConstant: cardinality === 1 && missingCount === 0,
      flags: [],
    });
  });

  report.overallCompletenessPercent =
    totalCells > 0 ? ((totalCells - totalMissing) / totalCells) * 100 : 100;

  // D33 — Dictionary compliance check
  if (schema) {
    const violations = scanDictionaryCompliance(schema, data);
    for (const v of violations) {
      const reportCol = report.columns.find((c) => c.name === v.columnName);
      if (reportCol) {
        reportCol.dictionaryViolations = {
          declaredCodes: v.declaredCodes,
          undeclaredValues: v.undeclaredValues,
          resolutionStatus: v.resolutionStatus,
        };
      }
    }

    const unresolved = violations.filter((v) => v.resolutionStatus === 'unresolved');
    if (unresolved.length > 0) {
      report.blockingErrors.push({
        kind: 'dictionary_compliance',
        columns: unresolved.map((v) => v.columnName),
        message: `${unresolved.length} column(s) contain values not declared in the data dictionary. ` +
                 `Please resolve each violation before continuing to the Analysis plan step.`,
      });
    }
  }

  return report;
}
