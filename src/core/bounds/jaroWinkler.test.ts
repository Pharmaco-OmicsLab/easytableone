import { describe, expect, it } from "vitest";
import { jaroWinkler } from "./jaroWinkler";

describe("jaroWinkler", () => {
  it("matches standard reference examples", () => {
    expect(jaroWinkler("MARTHA", "MARHTA")).toBeCloseTo(0.961, 3);
    expect(jaroWinkler("DIXON", "DICKSONX")).toBeCloseTo(0.813, 3);
    expect(jaroWinkler("JELLYFISH", "SMELLYFISH")).toBeCloseTo(0.896, 3);
  });

  it("handles exact, short, prefix, unrelated, and empty inputs", () => {
    expect(jaroWinkler("weight", "weight")).toBe(1);
    expect(jaroWinkler("wt", "weight")).toBeLessThan(0.85);
    expect(jaroWinkler("age_years", "age")).toBeCloseTo(0.844, 3);
    expect(jaroWinkler("patient_age", "age")).toBeLessThan(0.85);
    expect(jaroWinkler("abc", "xyz")).toBe(0);
    expect(jaroWinkler("", "age")).toBe(0);
    expect(jaroWinkler("age", "")).toBe(0);
  });
});
