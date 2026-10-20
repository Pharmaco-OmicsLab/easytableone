/**
 * Generates a publication-ready LaTeX table using booktabs and threeparttable.
 *
 * Required preamble in the user's document:
 *   \usepackage{booktabs}
 *   \usepackage{threeparttable}
 *
 * The generated string is a `\begin{table}...\end{table}` block that the user
 * pastes into their document body.
 */
import type { FormattedTable } from "../types";

function escapeLatex(text: string): string {
  // Very basic LaTeX escaping
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}



/**
 * Produces a `booktabs`/`threeparttable` LaTeX table block from the supplied formatted display table.
 * The result is body markup (not a complete document) and requires the packages documented above.
 */
export function exportLatex(table: FormattedTable): string {
  const colCount = table.header.length;
  const columnSpec = "l" + "c".repeat(colCount - 1);
  const headerRefs = table.headerFootnoteRefs ?? {};

  let out = `\\begin{table}[htbp]
\\centering
\\begin{threeparttable}
\\caption{${escapeLatex(table.caption || "Baseline Characteristics")}}
\\begin{tabular}{${columnSpec}}
\\toprule
`;

  // Header
  const headerRow = table.header.map((h) => {
    const refs = headerRefs[h];
    const refText = refs?.length ? `\\textsuperscript{${escapeLatex(refs.join(","))}}` : "";
    return `\\textbf{${escapeLatex(h)}}${refText}`;
  }).join(" & ");
  out += `${headerRow} \\\\\n\\midrule\n`;

  // Rows
  table.rows.forEach((row) => {
    const cells = row.cells.map((c, i) => {
      let cellText = escapeLatex(c);
      if (i === 0) {
        if (row.indent > 0) {
          cellText = `\\hspace{${row.indent}em} ${cellText}`;
        }
        if (row.footnoteRefs.length > 0) {
          cellText += `\\textsuperscript{${escapeLatex(row.footnoteRefs.join(","))}}`;
        }
      }
      return cellText;
    });
    out += `${cells.join(" & ")} \\\\\n`;
  });

  out += `\\bottomrule
\\end{tabular}\n`;

  // Footnotes
  if (table.footnotes.length > 0) {
    out += `\\begin{tablenotes}[para,flushleft]\n\\small\n`;
    table.footnotes.forEach((fn) => {
      out += `\\item[${escapeLatex(fn.marker)}] ${escapeLatex(fn.text)}\n`;
    });
    out += `\\end{tablenotes}\n`;
  }

  out += `\\end{threeparttable}\n`;
  
  if (table.methodsParagraph) {
    out += `\n\\vspace{1em}\n\\noindent\\textbf{Statistical Methods:} \\small{${escapeLatex(table.methodsParagraph)}}\n`;
  }

  out += `\\end{table}`;

  return out;
}
