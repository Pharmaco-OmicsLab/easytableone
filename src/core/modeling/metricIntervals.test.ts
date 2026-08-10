import { describe, expect, it } from "vitest";
import type { MlComparisonRow } from "./types";

const metricRanges = {
  auc: [0, 1],
  sens: [0, 1],
  spec: [0, 1],
  balacc: [0, 1],
  mcc: [-1, 1],
  f1: [0, 1],
} as const;

function expectBoundedMetricIntervals(rows: MlComparisonRow[]): void {
  for (const row of rows) {
    for (const [metric, [minimum, maximum]] of Object.entries(metricRanges) as Array<[keyof typeof metricRanges, readonly [number, number]]>) {
      const summary = row[metric];
      if (summary?.ciLow === null || summary?.ciLow === undefined || summary.ciHigh === null || summary.ciHigh === undefined) continue;
      // D93(g): containment tolerates one ulp (mean is computed on the natural scale,
      // the endpoints on the transformed one). Range assertions stay exact.
      const EPS = 1e-9;
      expect(summary.ciLow).toBeLessThanOrEqual(summary.mean! + EPS);
      expect(summary.mean!).toBeLessThanOrEqual(summary.ciHigh + EPS);
      expect(summary.ciLow).toBeGreaterThanOrEqual(minimum);
      expect(summary.ciHigh).toBeLessThanOrEqual(maximum);
    }
  }
}

describe("ML metric interval invariant", () => {
  it("accepts only intervals containing their mean and inside the metric range", () => {
    expectBoundedMetricIntervals([{
      model: "fixture",
      auc: { mean: 0.7, sd: 0.1, ciLow: 0.4, ciHigh: 0.9, ciBasis: "logit" },
      sens: { mean: 0.5, sd: 0.1, ciLow: null, ciHigh: null },
      spec: { mean: 0.8, sd: 0.1, ciLow: 0.6, ciHigh: 0.95, ciBasis: "logit" },
      balacc: { mean: 0.65, sd: 0.1, ciLow: 0.5, ciHigh: 0.8, ciBasis: "logit" },
      mcc: { mean: -0.2, sd: 0.1, ciLow: -0.6, ciHigh: 0.2, ciBasis: "fisher_z" },
      f1: { mean: 0.6, sd: 0.1, ciLow: 0.4, ciHigh: 0.8, ciBasis: "logit" },
    }]);
  });

  it("rejects an interval that leaves the metric range", () => {
    expect(() => expectBoundedMetricIntervals([{
      model: "out-of-range",
      // The defect this invariant exists to catch: specificity 0.912 to 1.019.
      auc: { mean: 0.7, sd: 0.1, ciLow: 0.4, ciHigh: 0.9, ciBasis: "logit" },
      sens: { mean: 0.5, sd: 0.1, ciLow: null, ciHigh: null },
      spec: { mean: 0.966, sd: 0.021, ciLow: 0.912, ciHigh: 1.019, ciBasis: "logit" },
      balacc: { mean: 0.65, sd: 0.1, ciLow: 0.5, ciHigh: 0.8, ciBasis: "logit" },
    }])).toThrow();
  });

  it("rejects an interval that does not contain its mean", () => {
    expect(() => expectBoundedMetricIntervals([{
      model: "mean-outside",
      auc: { mean: 0.9, sd: 0.01, ciLow: 0.70, ciHigh: 0.85, ciBasis: "logit" },
      sens: { mean: 0.5, sd: 0.1, ciLow: null, ciHigh: null },
      spec: { mean: 0.8, sd: 0.1, ciLow: 0.6, ciHigh: 0.95, ciBasis: "logit" },
      balacc: { mean: 0.65, sd: 0.1, ciLow: 0.5, ciHigh: 0.8, ciBasis: "logit" },
    }])).toThrow();
  });
});
