import type { FormattedTable } from "../types";

interface HtmlPreviewProps {
  table: FormattedTable;
}

export function HtmlPreview({ table }: HtmlPreviewProps) {
  const headerRefs = table.headerFootnoteRefs ?? {};
  const allText = [table.header.join(" "), ...table.rows.flatMap((row) => row.cells)].join(" ");
  const glossary = [
    allText.includes("n (%)") || /\d+\s+\([\d.]+%\)/.test(allText)
      ? ["n (%)", "count (column percentage)"]
      : null,
    allText.includes("±") || allText.includes("Â±")
      ? ["Mean ± SD", "mean plus/minus standard deviation"]
      : null,
    allText.includes("[IQR]") || table.rows.some((row) => row.cells.some((cell) => /\d.*\(.+\s(to|–|-)\s.+\)/.test(cell)))
      ? ["Median [IQR]", "median [25th-75th percentile]"]
      : null,
    allText.includes("Q1") || allText.includes("Q3")
      ? ["Q1 / Q3", "25th / 75th percentile"]
      : null,
  ].filter(Boolean) as [string, string][];

  return (
    <div className="overflow-x-auto overflow-y-visible">
      <table className="min-w-full text-sm text-left border-collapse font-sans text-gray-900">
        <caption className="caption-top text-lg font-bold mb-4 text-left">
          {table.title}
        </caption>
        <thead>
          <tr className="border-b-2 border-gray-900">
            {table.header.map((col, idx) => (
              <th key={idx} className="py-2 px-4 font-bold">
                {col}
                {headerRefs[col]?.length > 0 && (
                  <sup className="ml-1 text-xs">{headerRefs[col].join(",")}</sup>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="border-b-2 border-gray-900">
          {table.rows.map((row, idx) => (
            <tr key={idx} className="border-b border-gray-200 last:border-0 hover:bg-gray-50">
              {row.cells.map((cell, cellIdx) => (
                <td
                  key={cellIdx}
                  className={`py-2 px-4 ${cellIdx === 0 && row.indent > 0 ? "pl-8" : ""}`}
                >
                  {cell}
                  {cellIdx === 0 && row.footnoteRefs.length > 0 && (
                    <sup className="ml-1 text-xs">{row.footnoteRefs.join(",")}</sup>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {glossary.length > 0 && (
        <div className="mt-3 text-xs text-gray-600">
          {glossary.map(([term, definition], index) => (
            <span key={term} title={definition}>
              {index > 0 ? " · " : ""}
              <span className="font-semibold">{term}</span>: {definition}
            </span>
          ))}
        </div>
      )}

      {table.footnotes.length > 0 && (
        <div className="mt-4 text-xs text-gray-600">
          {table.footnotes.map((fn, idx) => (
            <div key={idx} className="mb-1">
              <sup>{fn.marker}</sup> {fn.text}
            </div>
          ))}
        </div>
      )}

      {table.methodsParagraph && (
        <div className="mt-6 text-sm text-gray-700 bg-gray-50 p-4 rounded-md">
          <h4 className="font-bold mb-2 text-gray-900">Statistical Methods</h4>
          <p>{table.methodsParagraph}</p>
        </div>
      )}
    </div>
  );
}
