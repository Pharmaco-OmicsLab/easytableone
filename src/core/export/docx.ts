import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { AnalysisPlan, FormattedTable, Schema, StatisticalResults } from "../types";
import type { EDAResults } from "../eda/types";
import type { ModelingResults } from "../modeling/types";
import type { EducationContext, ExplanationDepth } from "../education/educationTypes";
import { generateEDAReportMarkdown } from "./edaReport";
import { buildModelingReportDocxChildren } from "./modelingReport";
import { buildMethodsSummaryDocxChildren } from "./methodsSummary";
import { buildEducationReportDocxChildren } from "./educationReport";
import { buildCorrelationSpec, buildMissingnessSpec } from "../eda/edaSpecBuilders";
import { vegaLiteSpecToPng } from "./vegaRender";



/**
 * Builds the user's DOCX export from the already formatted table and optional plot, EDA, modeling, methods, and education data.
 * The statistical rows are not recomputed here; the document uses the same journal-formatted cells as the preview and other
 * table exporters. The returned promise resolves to a browser `Blob` suitable for download.
 */
export async function exportDocx(
  table: FormattedTable,
  meta: { appVersion: string },
  plots?: Record<string, { histogram?: string; qqplot?: string; barchart?: string }>,
  edaResults?: EDAResults | null,
  modelingResults?: ModelingResults | null,
  methodsSummary?: { stats: StatisticalResults; schema: Schema; plan: AnalysisPlan } | null,
  educationReport?: EducationContext | null,
  educationDepth: ExplanationDepth = "concise",
): Promise<Blob> {
  const docRows: TableRow[] = [];
  const headerRefs = table.headerFootnoteRefs ?? {};

  // Header row
  docRows.push(
    new TableRow({
      tableHeader: true,
      children: table.header.map((headerText) => {
        const refs = headerRefs[headerText] ?? [];
        return new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: headerText,
                    bold: true,
                  }),
                  ...(refs.length
                    ? [new TextRun({ text: refs.join(","), superScript: true, bold: true })]
                    : []),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
            borders: {
              top: { style: BorderStyle.SINGLE, size: 12, color: "000000" },
              bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
          });
      }),
    })
  );

  // Data rows
  table.rows.forEach((row, rowIdx) => {
    const isLastRow = rowIdx === table.rows.length - 1;

    docRows.push(
      new TableRow({
        children: row.cells.map((cellText, cellIdx) => {
          const runs: TextRun[] = [];

          if (cellIdx === 0 && row.indent > 0) {
            runs.push(new TextRun({ text: "    " })); // Indent
          }

          runs.push(new TextRun({ text: cellText }));

          if (cellIdx === 0 && row.footnoteRefs.length > 0) {
            runs.push(
              new TextRun({
                text: row.footnoteRefs.join(","),
                superScript: true,
              })
            );
          }

          return new TableCell({
            children: [
              new Paragraph({
                children: runs,
                alignment: cellIdx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
              }),
            ],
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              bottom: isLastRow
                ? { style: BorderStyle.SINGLE, size: 12, color: "000000" }
                : { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
              right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            },
          });
        }),
      })
    );
  });

  const docTable = new Table({
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    rows: docRows,
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
    },
  });

  const children: (Paragraph | Table)[] = [];

  if (table.caption) {
    children.push(
      new Paragraph({
        text: table.caption,
        heading: HeadingLevel.HEADING_3,
        spacing: { after: 200 },
      })
    );
  } else {
    children.push(
      new Paragraph({
        text: table.title,
        heading: HeadingLevel.HEADING_3,
        spacing: { after: 200 },
      })
    );
  }

  children.push(docTable);

  if (table.footnotes.length > 0) {
    children.push(new Paragraph({ text: "", spacing: { before: 200 } })); // Spacer
    table.footnotes.forEach((fn) => {
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: fn.marker, superScript: true }),
            new TextRun({ text: " " + fn.text }),
          ],
          spacing: { after: 100 },
        })
      );
    });
  }

  if (table.methodsParagraph) {
    children.push(
      new Paragraph({
        text: "Statistical Methods",
        heading: HeadingLevel.HEADING_4,
        spacing: { before: 400, after: 200 },
      })
    );
    children.push(
      new Paragraph({
        text: table.methodsParagraph,
      })
    );
  }

  // Variable coding notes (Step 4 / D36)
  if (table.codingNotes && table.codingNotes.length > 0 && table.variableCodingSectionTitle !== null) {
    const sectionTitle = table.variableCodingSectionTitle ?? 'Variable coding notes';
    children.push(
      new Paragraph({
        text: sectionTitle,
        heading: HeadingLevel.HEADING_4,
        spacing: { before: 400, after: 200 },
      })
    );
    table.codingNotes.forEach((note) => {
      children.push(
        new Paragraph({
          text: `\u2022 ${note}`,
          spacing: { after: 100 },
        })
      );
    });
  }

  // Data quality notes (Step 8.5)
  if (table.dataQualityNotes && table.dataQualityNotes.length > 0 && table.dataQualitySectionTitle !== null) {
    const sectionTitle = table.dataQualitySectionTitle ?? 'Data quality notes';
    children.push(
      new Paragraph({
        text: sectionTitle,
        heading: HeadingLevel.HEADING_4,
        spacing: { before: 400, after: 200 },
      })
    );
    table.dataQualityNotes.forEach((note) => {
      children.push(
        new Paragraph({
          text: `\u2022 ${note}`,
          spacing: { after: 100 },
        })
      );
    });
  }

  // Supplementary Figures: Diagnostic Plots
  if (plots && Object.keys(plots).length > 0) {
    children.push(
      new Paragraph({
        text: "Supplementary Figures: Diagnostic Plots",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      })
    );

    for (const [varName, varPlots] of Object.entries(plots)) {
      children.push(
        new Paragraph({
          text: `Diagnostic Plots for ${varName}`,
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        })
      );

      if (varPlots.histogram) {
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: base64ToArrayBuffer(varPlots.histogram),
                transformation: { width: 250, height: 167 },
                inline: true,
              } as any),
            ],
            spacing: { after: 100 },
          })
        );
      }
      if (varPlots.qqplot) {
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: base64ToArrayBuffer(varPlots.qqplot),
                transformation: { width: 250, height: 167 },
                inline: true,
              } as any),
            ],
            spacing: { after: 100 },
          })
        );
      }
      if (varPlots.barchart) {
        children.push(
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: base64ToArrayBuffer(varPlots.barchart),
                transformation: { width: 300, height: 200 },
                inline: true,
              } as any),
            ],
            spacing: { after: 200 },
          })
        );
      }
    }
  }

  if (edaResults) {
    const missingnessChartPng = await vegaLiteSpecToPng(buildMissingnessSpec(edaResults.missingness.perVariable));
    const correlationMatrixPng = edaResults.correlations.nContinuous >= 2
      ? await vegaLiteSpecToPng(buildCorrelationSpec(
          edaResults.correlations.pairs,
          edaResults.correlations.flagged,
          edaResults.correlations.variableOrder,
          null,
        ))
      : null;

    children.push(
      new Paragraph({
        text: "Exploratory Data Analysis Report",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 200 },
      })
    );
    generateEDAReportMarkdown(edaResults)
      .split("\n")
      .filter((line) => line.trim().length > 0 && !line.startsWith("## "))
      .forEach((line) => children.push(new Paragraph({ text: line, spacing: { after: 80 } })));

    if (missingnessChartPng) {
      children.push(new Paragraph({ text: "Missingness summary", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: base64ToArrayBuffer(missingnessChartPng),
              transformation: { width: 500, height: 260 },
              inline: true,
            } as any),
          ],
          spacing: { after: 150 },
        })
      );
    }

    if (correlationMatrixPng) {
      children.push(new Paragraph({ text: "Correlation matrix", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: base64ToArrayBuffer(correlationMatrixPng),
              transformation: { width: 500, height: 500 },
              inline: true,
            } as any),
          ],
          spacing: { after: 150 },
        })
      );
    }

    if (edaResults.missingness.heatmapPng) {
      children.push(new Paragraph({ text: "Missingness heatmap", heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: base64ToArrayBuffer(edaResults.missingness.heatmapPng),
              transformation: { width: 500, height: 300 },
              inline: true,
            } as any),
          ],
          spacing: { after: 150 },
        })
      );
    }

    edaResults.bivariate?.plots.forEach((plot) => {
      children.push(new Paragraph({ text: plot.displayLabel, heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 100 } }));
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: base64ToArrayBuffer(plot.png),
              transformation: { width: 360, height: 240 },
              inline: true,
            } as any),
          ],
          spacing: { after: 150 },
        })
      );
    });
  }

  if (modelingResults && (modelingResults.logistic || modelingResults.ml)) {
    children.push(...buildModelingReportDocxChildren(modelingResults));
  }

  if (methodsSummary) {
    children.push(...buildMethodsSummaryDocxChildren(methodsSummary.stats, methodsSummary.schema, methodsSummary.plan));
  }

  if (educationReport) {
    children.push(...buildEducationReportDocxChildren(educationReport, educationDepth));
  }

  const doc = new Document({
    creator: `EasyTableOne v${meta.appVersion}`,
    title: table.caption || table.title,
    description: `Generated by EasyTableOne v${meta.appVersion} using journal ruleset v${table.rulesetVersion} (journal: ${table.journal}).`,
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}
