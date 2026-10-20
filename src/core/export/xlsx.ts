import * as XLSX from "xlsx";
import type { FormattedTable } from "../types";



/**
 * Serializes the formatted table and footnotes as an XLSX workbook `Blob` for download.
 * It exports the supplied display strings as-is and does not recalculate statistics or journal formatting.
 */
export function exportXlsx(table: FormattedTable): Blob {
  const rows: Array<Array<string>> = [];
  const headerRefs = table.headerFootnoteRefs ?? {};

  rows.push([table.title]);
  rows.push([]);
  rows.push(table.header.map((header) => {
    const refs = headerRefs[header];
    return refs?.length ? `${header} [${refs.join(",")}]` : header;
  }));

  for (const row of table.rows) {
    const cells = [...row.cells];
    if (row.indent > 0 && cells[0]) {
      cells[0] = `${"  ".repeat(row.indent)}${cells[0]}`;
    }
    if (row.footnoteRefs.length > 0) {
      cells[0] = `${cells[0]} [${row.footnoteRefs.join(",")}]`;
    }
    rows.push(cells);
  }

  if (table.footnotes.length > 0) {
    rows.push([]);
    rows.push(["Footnotes"]);
    table.footnotes.forEach((footnote) => rows.push([`${footnote.marker} ${footnote.text}`]));
  }

  if (table.codingNotes?.length) {
    rows.push([]);
    rows.push([table.variableCodingSectionTitle ?? "Variable coding notes"]);
    table.codingNotes.forEach((note) => rows.push([note]));
  }

  if (table.dataQualityNotes?.length && table.dataQualitySectionTitle !== null) {
    rows.push([]);
    rows.push([table.dataQualitySectionTitle ?? "Data quality notes"]);
    table.dataQualityNotes.forEach((note) => rows.push([note]));
  }

  if (table.methodsParagraph) {
    rows.push([]);
    rows.push(["Statistical Methods"]);
    rows.push([table.methodsParagraph]);
  }

  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = table.header.map((header, index) => ({
    wch: Math.max(index === 0 ? 28 : 14, header.length + 4),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Table 1");
  const bytes = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

  return new Blob([bytes], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
