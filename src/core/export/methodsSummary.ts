import type { AnalysisPlan, Schema, StatisticalResults } from "../types";
import { getColumnDisplayLabel } from "../format/columnLabel";
import { isFisherLike } from "../format/testName";
import {
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

export interface MethodsSummaryRow {
  variable: string;
  displayLabel: string;
  summaryFormat: string;
  statisticalTest: string;
  selectionReason: string;
}

function summaryFormatForVariable(variable: StatisticalResults["perVariable"][number]): string {
  if (variable.overallSummary.mean !== undefined) {
    return variable.test.name === "Mann-Whitney U" || variable.test.name === "Kruskal-Wallis"
      ? "median (IQR)"
      : "mean (SD)";
  }
  if (variable.overallSummary.counts !== undefined) {
    return "n (%)";
  }
  return "not summarized";
}

function selectionReasonForVariable(variable: StatisticalResults["perVariable"][number], plan: AnalysisPlan): string {
  const override = plan.testOverrides?.find((item) => item.variable === variable.variable);
  if (override) {
    return `User override (${override.method})`;
  }
  const auxiliaryReason = variable.test.auxiliary?.selectionReason;
  if (typeof auxiliaryReason === "string" && auxiliaryReason.trim()) {
    return auxiliaryReason;
  }
  if (variable.test.name === "None") {
    return variable.notes.length ? variable.notes.join("; ") : "No statistical test was selected.";
  }
  if (variable.overallSummary.mean !== undefined) {
    const nonParametric = variable.test.name === "Mann-Whitney U" || variable.test.name === "Kruskal-Wallis";
    return nonParametric
      ? "Automatic selection based on non-normal continuous-variable assumptions."
      : "Automatic selection based on continuous-variable assumptions.";
  }
  if (variable.overallSummary.counts !== undefined) {
    return isFisherLike(variable.test.name)
      ? "Automatic selection because sparse categorical cells favored Fisher's exact test."
      : "Automatic selection for categorical group comparison.";
  }
  return "Automatic selection.";
}

export function buildMethodsSummaryRows(
  stats: StatisticalResults,
  schema: Schema,
  plan: AnalysisPlan,
): MethodsSummaryRow[] {
  return stats.perVariable.map((variable) => {
    const schemaCol = schema.columns.find((column) => column.name === variable.variable);
    return {
      variable: variable.variable,
      displayLabel: schemaCol ? getColumnDisplayLabel(schemaCol, "stripped") : variable.variable,
      summaryFormat: summaryFormatForVariable(variable),
      statisticalTest: variable.test.name,
      selectionReason: selectionReasonForVariable(variable, plan),
    };
  });
}

export function buildMethodsSummaryMarkdown(
  stats: StatisticalResults,
  schema: Schema,
  plan: AnalysisPlan,
): string {
  const rows = buildMethodsSummaryRows(stats, schema, plan);
  const lines = [
    "# Per-variable Methods Summary",
    "",
    "| Variable | Summary format | Statistical test | Selection reason |",
    "|---|---|---|---|",
  ];
  rows.forEach((row) => {
    lines.push(`| ${row.displayLabel} | ${row.summaryFormat} | ${row.statisticalTest} | ${row.selectionReason} |`);
  });
  lines.push("");
  return lines.join("\n");
}

export type MethodsSummaryDocxChild = Paragraph | Table;

function cell(text: string, bold = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold })],
      }),
    ],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      left: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
      right: { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" },
    },
  });
}

export function buildMethodsSummaryDocxChildren(
  stats: StatisticalResults,
  schema: Schema,
  plan: AnalysisPlan,
): MethodsSummaryDocxChild[] {
  const rows = buildMethodsSummaryRows(stats, schema, plan);
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: [
        cell("Variable", true),
        cell("Summary format", true),
        cell("Test", true),
        cell("Selection reason", true),
      ],
    }),
    ...rows.map((row) => new TableRow({
      children: [
        cell(row.displayLabel),
        cell(row.summaryFormat),
        cell(row.statisticalTest),
        cell(row.selectionReason),
      ],
    })),
  ];

  return [
    new Paragraph({
      text: "Per-variable Methods Summary",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 400, after: 200 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows,
    }),
  ];
}

export async function exportMethodsSummaryDocx(
  stats: StatisticalResults,
  schema: Schema,
  plan: AnalysisPlan,
  appVersion = "unknown",
): Promise<Blob> {
  const doc = new Document({
    creator: `EasyTableOne v${appVersion}`,
    title: "Per-variable Methods Summary",
    sections: [{ properties: {}, children: buildMethodsSummaryDocxChildren(stats, schema, plan) }],
  });
  return Packer.toBlob(doc);
}
