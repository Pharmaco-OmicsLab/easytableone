import { buildCorrelationSpec, buildMissingnessSpec } from "../eda/edaSpecBuilders";
import type { EDAResults } from "../eda/types";
import type { Schema } from "../types";
import { vegaLiteSpecToPng } from "./vegaRender";

export interface EdaReportChartPngs {
  missingnessChartPng: string | null;
  correlationChartPng: string | null;
}

/**
 * Pre-renders the EDA report's missingness and correlation charts to base64 PNG
 * so generateEDAReportHtml can embed them without scripts or remote resources.
 */
export async function renderEdaReportChartPngs(
  edaResults: EDAResults,
  schema?: Schema | null,
): Promise<EdaReportChartPngs> {
  const missingnessChartPng = await vegaLiteSpecToPng(
    buildMissingnessSpec(edaResults.missingness.perVariable),
  );
  const correlationChartPng = edaResults.correlations.nContinuous >= 2
    ? await vegaLiteSpecToPng(buildCorrelationSpec(
        edaResults.correlations.pairs,
        edaResults.correlations.flagged,
        edaResults.correlations.variableOrder,
        schema,
      ))
    : null;
  return { missingnessChartPng, correlationChartPng };
}
