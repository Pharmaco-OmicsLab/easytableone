import { describe, expect, it } from "vitest";
import { getBaselineTestingAdvice, type SmdState } from "./baselineTestingAdvice";

describe("getBaselineTestingAdvice", () => {
  it("returns null for observational and unspecified designs", () => {
    expect(getBaselineTestingAdvice({ studyDesign: "observational" }, "computed")).toBeNull();
    expect(getBaselineTestingAdvice({ studyDesign: "unspecified" }, "enable_before_run")).toBeNull();
  });

  it("returns null when hidePValueColumn is active", () => {
    expect(
      getBaselineTestingAdvice(
        { studyDesign: "randomized_trial", userOverrides: { hidePValueColumn: true } },
        "computed",
      ),
    ).toBeNull();
  });

  it("supports computed state with existing SMD text", () => {
    const advice = getBaselineTestingAdvice({ studyDesign: "randomized_trial" }, "computed");
    expect(advice).toMatchObject({ severity: "strong", smdState: "computed" });
    expect(advice?.message).toContain("CONSORT");
    expect(advice?.message).toContain("EasyTableOne has already computed a standardised difference");
    expect(advice?.message).not.toContain("not available for this table");
  });

  it("supports enable_before_run state when SMD is off pre-run", () => {
    const advice = getBaselineTestingAdvice({ studyDesign: "randomized_trial" }, "enable_before_run");
    expect(advice).toMatchObject({ severity: "strong", smdState: "enable_before_run" });
    expect(advice?.message).toContain("CONSORT");
    expect(advice?.message).toContain("You can report standardised differences instead of P values");
    expect(advice?.message).not.toContain("not available for this table");
  });

  it("supports rerun_required state when SMD was not computed post-run", () => {
    const advice = getBaselineTestingAdvice({ studyDesign: "randomized_trial" }, "rerun_required");
    expect(advice).toMatchObject({ severity: "strong", smdState: "rerun_required" });
    expect(advice?.message).toContain("CONSORT");
    expect(advice?.message).toContain("Standardised differences were not computed for this run");
    expect(advice?.message).toContain("return to the Analysis Plan with standardised differences switched on");
    expect(advice?.message).not.toContain("not available for this table");
  });

  it("none of the three states contains 'not available for this table'", () => {
    const states: SmdState[] = ["computed", "enable_before_run", "rerun_required"];
    for (const state of states) {
      const advice = getBaselineTestingAdvice({ studyDesign: "randomized_trial" }, state);
      expect(advice?.message).not.toContain("not available for this table");
    }
  });
});
