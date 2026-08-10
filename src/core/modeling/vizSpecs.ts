import type { DecisionCurve, MlModelResult, MlResult } from "./types";

export function buildMlRocSpec(result: MlResult) {
  const values = result.models.flatMap((model) =>
    model.roc.grid.flatMap((fpr, index) => {
      const mean = model.roc.mean[index] ?? 0;
      const sd = model.roc.sd[index] ?? 0;
      return [
        { model: model.name, fpr, tpr: mean, lower: Math.max(0, mean - sd), upper: Math.min(1, mean + sd), kind: "mean" },
      ];
    }),
  );
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    data: { values },
    width: "container",
    height: 260,
    layer: [
      {
        mark: { type: "area", opacity: 0.12 },
        encoding: {
          x: { field: "fpr", type: "quantitative", title: "False positive rate" },
          y: { field: "lower", type: "quantitative", title: "True positive rate", scale: { domain: [0, 1] } },
          y2: { field: "upper" },
          color: { field: "model", type: "nominal", title: "Model" },
        },
      },
      {
        mark: { type: "line", strokeWidth: 2 },
        encoding: {
          x: { field: "fpr", type: "quantitative" },
          y: { field: "tpr", type: "quantitative" },
          color: { field: "model", type: "nominal" },
          tooltip: [
            { field: "model", type: "nominal" },
            { field: "fpr", type: "quantitative", format: ".2f" },
            { field: "tpr", type: "quantitative", format: ".2f" },
          ],
        },
      },
    ],
  };
}

export function buildMlImportanceSpec(model: MlModelResult) {
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    data: { values: model.varImportance },
    width: "container",
    height: Math.max(120, model.varImportance.length * 24),
    mark: { type: "bar", color: "#4E79A7" },
    encoding: {
      x: { field: "score", type: "quantitative", title: "Scaled importance" },
      y: { field: "name", type: "nominal", sort: "-x", title: null },
      tooltip: [
        { field: "name", type: "nominal" },
        { field: "score", type: "quantitative", format: ".1f" },
      ],
    },
  };
}

export function buildMlCalibrationSpec(model: MlModelResult) {
  const values = model.calibration.curve;
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    data: { values },
    width: "container",
    height: 180,
    layer: [
      {
        data: { values: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
        mark: { type: "line", strokeDash: [4, 4], color: "#9CA3AF" },
        encoding: {
          x: { field: "x", type: "quantitative", title: "Predicted risk", scale: { domain: [0, 1] } },
          y: { field: "y", type: "quantitative", title: "Observed risk", scale: { domain: [0, 1] } },
        },
      },
      {
        mark: { type: "line", point: true, color: "#E15759" },
        encoding: {
          x: { field: "predicted", type: "quantitative" },
          y: { field: "observed", type: "quantitative" },
          tooltip: [
            { field: "predicted", type: "quantitative", format: ".2f" },
            { field: "observed", type: "quantitative", format: ".2f" },
            { field: "n", type: "quantitative" },
          ],
        },
      },
    ],
  };
}

export function buildDecisionCurveSpec(curve: DecisionCurve) {
  const finiteModelValues = curve.points
    .map((point) => point.netBenefit)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const finiteAllValues = curve.points
    .map((point) => point.netBenefitTreatAll)
    .filter((value): value is number => value !== null && Number.isFinite(value));
  const minY = Math.max(-0.25, Math.min(0, ...finiteModelValues, ...finiteAllValues));
  const values = curve.points.flatMap((point) => [
    { threshold: point.threshold, netBenefit: point.netBenefit, strategy: "Model" },
    { threshold: point.threshold, netBenefit: point.netBenefitTreatAll, strategy: "Treat all" },
    { threshold: point.threshold, netBenefit: 0, strategy: "Treat none" },
  ]).filter((point) => point.netBenefit !== null && Number.isFinite(point.netBenefit) && (point.netBenefit as number) >= minY);
  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    data: { values },
    width: "container",
    height: 220,
    mark: { type: "line", strokeWidth: 2 },
    encoding: {
      x: { field: "threshold", type: "quantitative", title: "Risk threshold", scale: { domain: [0, 1] } },
      y: { field: "netBenefit", type: "quantitative", title: "Net benefit", scale: { domainMin: minY } },
      color: { field: "strategy", type: "nominal", title: "Strategy" },
      strokeDash: { field: "strategy", type: "nominal", legend: null },
      tooltip: [
        { field: "strategy", type: "nominal" },
        { field: "threshold", type: "quantitative", format: ".2f" },
        { field: "netBenefit", type: "quantitative", format: ".3f" },
      ],
    },
  };
}
