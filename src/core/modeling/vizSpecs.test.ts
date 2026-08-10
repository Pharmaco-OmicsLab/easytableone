import { describe, expect, it } from "vitest";
import type { MlModelResult, MlResult } from "./types";
import { buildDecisionCurveSpec, buildMlCalibrationSpec, buildMlImportanceSpec, buildMlRocSpec } from "./vizSpecs";

const model: MlModelResult = {
  name: "RandomForest",
  metrics: {
    auc: { mean: 0.7, sd: 0.02 },
    sens: { mean: 0.6, sd: 0.03 },
    spec: { mean: 0.8, sd: 0.04 },
    balacc: { mean: 0.7, sd: 0.02 },
  },
  roc: { grid: [0, 1], mean: [0, 1], sd: [0, 0] },
  varImportance: [{ name: "Age", score: 12 }],
  calibration: {
    slope: 0.9,
    intercept: 0.1,
    curve: [{ predicted: 0.2, observed: 0.25, n: 10 }],
    brier: 0.12,
  },
  confusion: { tp: 8, fp: 2, fn: 1, tn: 9 },
};

const result: MlResult = {
  models: [model],
  comparison: [],
  folds: { nSplits: 5, nRepeats: 3, seed: 42 },
  warnings: [],
};

describe("ML visualization specs", () => {
  it("builds a layered ROC spec keyed by model and FPR/TPR fields", () => {
    const spec = buildMlRocSpec(result) as any;

    expect(spec.layer).toHaveLength(2);
    expect(spec.layer[0].mark.type).toBe("area");
    expect(spec.layer[1].encoding.x.field).toBe("fpr");
    expect(spec.layer[1].encoding.y.field).toBe("tpr");
    expect(spec.layer[1].encoding.color.field).toBe("model");
  });

  it("builds an importance bar spec keyed by predictor name and score", () => {
    const spec = buildMlImportanceSpec(model) as any;

    expect(spec.mark.type).toBe("bar");
    expect(spec.encoding.x.field).toBe("score");
    expect(spec.encoding.y.field).toBe("name");
  });

  it("builds a calibration spec with reference and observed-risk layers", () => {
    const spec = buildMlCalibrationSpec(model) as any;

    expect(spec.layer).toHaveLength(2);
    expect(spec.layer[0].encoding.x.field).toBe("x");
    expect(spec.layer[1].encoding.x.field).toBe("predicted");
    expect(spec.layer[1].encoding.y.field).toBe("observed");
  });

  it("builds a decision-curve spec with model, treat-all, and treat-none series", () => {
    const spec = buildDecisionCurveSpec({
      basis: "pooled_repeated_cv",
      prevalence: 0.4,
      points: [
        { threshold: 0.1, netBenefit: 0.3, netBenefitTreatAll: 0.333 },
        { threshold: 0.2, netBenefit: 0.25, netBenefitTreatAll: 0.25 },
      ],
    }) as any;

    expect(spec.encoding.x.field).toBe("threshold");
    expect(spec.encoding.y.field).toBe("netBenefit");
    expect(spec.encoding.color.field).toBe("strategy");
    expect(spec.data.values.map((row: any) => row.strategy).sort()).toEqual(["Model", "Model", "Treat all", "Treat all", "Treat none", "Treat none"].sort());
  });

  it("excludes treat-all values below the floor from the data", () => {
    const spec = buildDecisionCurveSpec({
      basis: "apparent",
      prevalence: 0.5,
      points: [
        { threshold: 0.1, netBenefit: 0.3, netBenefitTreatAll: 0.4 },
        { threshold: 0.9, netBenefit: 0.05, netBenefitTreatAll: -5.0 },  // far below floor
      ],
    }) as any;

    const treatAllValues = spec.data.values
      .filter((row: any) => row.strategy === "Treat all")
      .map((row: any) => row.netBenefit);

    // The -5.0 point must be absent; the 0.4 point must be present
    expect(treatAllValues).not.toContain(-5.0);
    expect(treatAllValues).toContain(0.4);
  });
});
