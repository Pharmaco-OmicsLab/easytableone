import type { FormattedTable } from "../types";

function escapeCsvCell(text: string): string {
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}



/**
 * Converts the supplied formatted table, including its display labels and footnotes, to CSV text.
 * Values are escaped for CSV output; statistical calculations and journal formatting remain upstream.
 */
export function exportCsv(table: FormattedTable): string {
  let out = "";
  const headerRefs = table.headerFootnoteRefs ?? {};

  // Header
  out += table.header.map((header) => {
    const refs = headerRefs[header];
    return escapeCsvCell(refs?.length ? `${header} [${refs.join(",")}]` : header);
  }).join(",") + "\n";

  // Rows
  table.rows.forEach((row) => {
    const cells = row.cells.map((c, i) => {
      let cellText = c;
      if (i === 0) {
        // CSV is a flat tabular format; row.indent is dropped intentionally.
        // For preserved hierarchy, use the .docx, .tex, or HTML exports.
        if (row.footnoteRefs.length > 0) {
          cellText += ` [${row.footnoteRefs.join(",")}]`;
        }
      }
      return escapeCsvCell(cellText);
    });
    out += cells.join(",") + "\n";
  });

  // Footnotes
  if (table.footnotes.length > 0) {
    out += "\n";
    table.footnotes.forEach((fn) => {
      out += escapeCsvCell(`${fn.marker} ${fn.text}`) + "\n";
    });
  }

  // Methods
  if (table.methodsParagraph) {
    out += "\n";
    out += escapeCsvCell("Statistical Methods: " + table.methodsParagraph) + "\n";
  }

  return out;
}
