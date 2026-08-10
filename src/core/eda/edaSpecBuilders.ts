import type { EDACorrelationPair, EDAFlaggedPair, EDAMissingnessVariable } from "./types";
import type { Schema } from "../types";

function uniqueDisplayOrder(variableOrder: string[], schema: Schema | null | undefined) {
  const baseLabels = variableOrder.map((name) => {
    const column = schema?.columns.find((item) => item.name === name);
    return column?.displayLabel || column?.label || name;
  });
  const counts = new Map<string, number>();
  baseLabels.forEach((label) => counts.set(label, (counts.get(label) ?? 0) + 1));
  return baseLabels.map((label, index) => (counts.get(label)! > 1 ? `${label} (${variableOrder[index]})` : label));
}

export function buildMissingnessSpec(perVariable: EDAMissingnessVariable[]): object {
  const missingVars = perVariable.filter((item) => item.missingPct > 0);
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: "container",
    height: Math.max(80, missingVars.length * 22),
    data: { values: missingVars },
    mark: "bar",
    encoding: {
      y: {
        field: "displayLabel",
        type: "nominal",
        sort: { field: "missingPct", order: "descending" },
        axis: { title: null },
      },
      x: {
        field: "missingPct",
        type: "quantitative",
        axis: { title: "% Missing", format: ".1f" },
        scale: { domain: [0, 100] },
      },
      color: {
        condition: [
          { test: "datum.missingPct > 50", value: "#ef4444" },
          { test: "datum.missingPct > 20", value: "#f59e0b" },
        ],
        value: "#22c55e",
      },
      tooltip: [
        { field: "displayLabel", title: "Variable" },
        { field: "missingPct", title: "% Missing", format: ".1f" },
        { field: "missingCount", title: "Count" },
      ],
    },
  };
}

export function buildCorrelationSpec(
  pairs: EDACorrelationPair[],
  flagged: EDAFlaggedPair[],
  variableOrder: string[],
  schema: Schema | null | undefined,
): object {
  const flaggedKeys = new Set(flagged.map((item) => `${item.colA}|${item.colB}`));
  const displayOrder = uniqueDisplayOrder(variableOrder, schema);
  const labelStride = variableOrder.length > 24 ? 3 : variableOrder.length > 12 ? 2 : 1;
  const visibleAxisLabels = displayOrder.filter((_, index) => index % labelStride === 0);
  const dataWithLabels = pairs.map((item) => {
    const indexA = variableOrder.indexOf(item.colA);
    const indexB = variableOrder.indexOf(item.colB);
    return {
      ...item,
      flagged: flaggedKeys.has(`${item.colA}|${item.colB}`),
      displayA: displayOrder[indexA] ?? item.displayA,
      displayB: displayOrder[indexB] ?? item.displayB,
    };
  });

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    width: Math.min(500, variableOrder.length * 35 + 80),
    height: Math.min(500, variableOrder.length * 35 + 80),
    padding: { left: 10, right: 10, top: 10, bottom: 110 },
    data: { values: dataWithLabels },
    layer: [
      {
        mark: "rect",
        encoding: {
          x: {
            field: "displayA",
            type: "ordinal",
            sort: displayOrder,
            axis: {
              labelAngle: -45,
              labelOverlap: false,
              labelLimit: 120,
              title: null,
              labelExpr: `indexof(${JSON.stringify(visibleAxisLabels)}, datum.value) >= 0 ? datum.value : ''`,
            },
          },
          y: {
            field: "displayB",
            type: "ordinal",
            sort: displayOrder,
            axis: { labelOverlap: true, title: null },
          },
          color: {
            field: "r",
            type: "quantitative",
            scale: { scheme: "redblue", domain: [-1, 1] },
            legend: { title: "Pearson r" },
          },
          tooltip: [
            { field: "displayA", title: "Variable A" },
            { field: "displayB", title: "Variable B" },
            { field: "r", title: "Pearson r", format: ".3f" },
            { field: "rho", title: "Spearman rho", format: ".3f" },
          ],
        },
      },
      {
        transform: [{ filter: "datum.flagged" }],
        mark: { type: "rect", filled: false, stroke: "#f97316", strokeWidth: 2 },
        encoding: {
          x: { field: "displayA", type: "ordinal", sort: displayOrder },
          y: { field: "displayB", type: "ordinal", sort: displayOrder },
        },
      },
    ],
  };
}
