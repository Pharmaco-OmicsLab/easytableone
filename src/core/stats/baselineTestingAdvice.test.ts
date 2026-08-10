import { describe, expect, it } from "vitest";
import { getBaselineTestingAdvice } from "./baselineTestingAdvice";

describe("getBaselineTestingAdvice", () => {
  it("returns null for observational and unspecified designs", () => {
    expect(getBaselineTestingAdvice({ studyDesign: "observational" }, true)).toBeNull();
    expect(getBaselineTestingAdvice({ studyDesign: "unspecified" }, true)).toBeNull();
  });

  it("returns a strong advisory for randomized trials until the override is active", () => {
    const advice = getBaselineTestingAdvice({ studyDesign: "randomized_trial" }, true);

    expect(advice).toMatchObject({ severity: "strong", smdAvailable: true });
    expect(advice?.message).toContain("CONSORT");
    expect(getBaselineTestingAdvice({ studyDesign: "randomized_trial", userOverrides: { hidePValueColumn: true } }, true)).toBeNull();
  });

  it("omits the switch offer when SMDs are unavailable", () => {
    const advice = getBaselineTestingAdvice({ studyDesign: "randomized_trial" }, false);

    expect(advice?.smdAvailable).toBe(false);
    expect(advice?.message).not.toContain("You can switch to standardised differences only");
  });
});
