import { describe, expect, it } from "vitest";
import type { ModelingSetup } from "./types";
import { estimateModelingRuntime } from "./runtimeEstimate";

const setup: ModelingSetup = {
  outcome: "outcome",
  predictors: ["age"],
  referenceLevels: {},
  imputation: { policy: "complete_case", m: 20 },
  goal: "adjust",
  seed: 42,
  model: "ridge",
  lambdaRule: "lambda_1se",
  validationB: 200,
  ciBootstrapB: 200,
  fastMode: true,
};

describe("estimateModelingRuntime", () => {
  it("is monotonic in n, expanded predictors, and bootstrap count", () => {
    const base = estimateModelingRuntime(setup, 100, 2).score;
    expect(estimateModelingRuntime(setup, 200, 2).score).toBeGreaterThan(base);
    expect(estimateModelingRuntime(setup, 100, 4).score).toBeGreaterThan(base);
    expect(estimateModelingRuntime({ ...setup, validationB: 400, ciBootstrapB: 400 }, 100, 2).score).toBeGreaterThan(base);
  });

  it("lowers the estimate when fast mode is enabled", () => {
    const fast = estimateModelingRuntime({ ...setup, fastMode: true }, 1000, 8).score;
    const thorough = estimateModelingRuntime({ ...setup, fastMode: false }, 1000, 8).score;
    expect(fast).toBeLessThan(thorough);
  });

  it("is deterministic and returns a coarse label", () => {
    const first = estimateModelingRuntime(setup, 1000, 5);
    const second = estimateModelingRuntime(setup, 1000, 5);
    expect(first).toEqual(second);
    expect(first.label).toMatch(/^~/);
  });

  it("rounds up benchmarked Pyodide bootstrap costs by model family", () => {
    // Phase 18 R4 Pyodide benchmark, n=500/p=15/B=20:
    // ridge 14.93 s, lasso 38.00 s, elastic-net 85.65 s, Firth 47.69 s.
    expect(estimateModelingRuntime({ ...setup, model: "ridge", validationB: 20, ciBootstrapB: 20 }, 500, 15).bucket)
      .toBe("thirty_to_sixty_seconds");
    expect(estimateModelingRuntime({ ...setup, model: "lasso", validationB: 20, ciBootstrapB: 20 }, 500, 15).bucket)
      .toBe("thirty_to_sixty_seconds");
    expect(estimateModelingRuntime({ ...setup, model: "elasticnet", validationB: 20, ciBootstrapB: 20 }, 500, 15).bucket)
      .toBe("one_to_three_minutes");
    expect(estimateModelingRuntime({ ...setup, model: "firth", validationB: 20, ciBootstrapB: 20 }, 500, 15).bucket)
      .toBe("thirty_to_sixty_seconds");
  });

  it("does not under-promise the reported Firth plus 200-bootstrap scenario", () => {
    const estimate = estimateModelingRuntime(
      { ...setup, model: "firth", validationB: 200, ciBootstrapB: 200, fastMode: true },
      500,
      35,
    );
    expect(estimate.bucket).toBe("several_minutes");
    expect(estimate.label).toBe("may take several minutes");
    expect(estimate.isLongRun).toBe(true);
  });

  it("estimates random-forest imputation as costlier than median imputation", () => {
    const median = estimateModelingRuntime({ ...setup, imputation: { policy: "median", m: 20 } }, 500, 8).score;
    const rf = estimateModelingRuntime({ ...setup, imputation: { policy: "rf", m: 20 } }, 500, 8).score;
    expect(rf).toBeGreaterThan(median);
  });
});
