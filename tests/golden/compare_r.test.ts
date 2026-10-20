import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { compareRows, maximumAbsoluteDifferences, monteCarloTolerance } from "../../scripts/crossval/compare-r.mjs";

describe("R tableone comparator", () => {
  it("covers agreement, discrepancy, MC tolerance, and non-comparable rows", () => {
    const spec = { tier: "A", groupOrder: ["a", "b"], tests: [
      { variable: "x", test: "Welch t" }, { variable: "mc", test: "Fisher's exact (Monte Carlo)" },
      { variable: "empty", test: "None", emptyGroup: true },
    ] };
    const eto = [
      { variable: "x", group: "", statistic: "mean", value: "1" },
      { variable: "y", group: "", statistic: "mean", value: "1" },
      { variable: "mc", group: "", statistic: "p_value", value: "0.1" },
      { variable: "empty", group: "", statistic: "p_value", value: "" },
    ];
    const r = [
      { variable: "x", group: "", statistic: "mean", value: "1.00001" },
      { variable: "y", group: "", statistic: "mean", value: "1.01" },
      { variable: "mc", group: "", statistic: "p_value", value: String(0.1 + monteCarloTolerance(0.1) * 0.5) },
      { variable: "empty", group: "", statistic: "p_value", value: "0.2" },
      { variable: "mc", group: "", statistic: "test_selection", value: "fisher" },
    ];
    const result = compareRows(eto, r, spec);
    expect(result.find((row) => row.variable === "x")?.agrees).toBe(true);
    expect(result.find((row) => row.variable === "y")).toMatchObject({ agrees: false, category: "DISCREPANCY" });
    expect(result.find((row) => row.variable === "mc")).toMatchObject({ agrees: true, category: "H" });
    expect(result.find((row) => row.variable === "empty")).toMatchObject({ agrees: null, category: "G" });
  });

  it("fails with category B and variable name when sparse-cell test families differ", () => {
    const spec = { tier: "B", groupOrder: ["a", "b"], tests: [{ variable: "sparse_x", test: "Fisher's exact", exact: true }] };
    const r = [{ variable: "sparse_x", group: "", statistic: "test_selection", value: "chi_square" }];
    expect(() => compareRows([], r, spec)).toThrow(/Category B setup failure for sparse_x/);
  });

  it("fails with category C and variable name when Mann–Whitney is not matched in R", () => {
    const spec = { tier: "B", groupOrder: ["a", "b"], tests: [{ variable: "rank_x", test: "Mann-Whitney U", scipyMannWhitney: { actual_method: "asymptotic" } }] };
    const r = [{ variable: "rank_x", group: "", statistic: "test_selection", value: "kruskal_wallis" }];
    expect(() => compareRows([], r, spec)).toThrow(/Category C setup failure for rank_x/);
  });

  it("fails with category E and variable name when a required R summary is missing", () => {
    const spec = { tier: "B", groupOrder: ["a", "b"], tests: [{ variable: "age", test: "Welch t" }] };
    expect(() => compareRows([{ variable: "age", group: "a", statistic: "mean", value: "4" }], [], spec))
      .toThrow(/Unexpected category E for age \(mean\)/);
  });

  it("allows the documented missing n when tableone drops the all-missing variable", () => {
    const result = compareRows(
      [{ variable: "all_missing", group: "Overall", statistic: "n", value: "0" }],
      [],
      { tier: "A", groupOrder: ["a", "b"], tests: [] },
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ category: "E", easytableone: 0, r_tableone: null,
      reason: "The synthetic all_missing variable has no non-missing observations; R tableone drops such variables entirely (ModuleReturnVarsExist), so it reports no n, while EasyTableOne reports n = 0." });
  });

  it("reports exact and Monte Carlo maximum differences separately to two significant figures", () => {
    expect(maximumAbsoluteDifferences([
      { comparison_type: "exact", absolute_difference: 3.2014213502407074e-10 },
      { comparison_type: "exact", absolute_difference: 1.0e-11 },
      { comparison_type: "monte_carlo_p", absolute_difference: 0.00360000000000002 },
      { comparison_type: "monte_carlo_p", absolute_difference: 0.0004 },
    ])).toEqual({ exact: "3.2e-10", monteCarloP: "0.0036" });
    expect(maximumAbsoluteDifferences([
      { comparison_type: "exact", absolute_difference: 0 },
    ])).toEqual({ exact: "0.0", monteCarloP: null });
  });

  it("compares omitted zero-count levels as zero when the level appears elsewhere", () => {
    const eto = [
      { variable: "cat", group: "A|no", statistic: "count", value: "2" },
      { variable: "cat", group: "A|no", statistic: "percent", value: "100" },
    ];
    const r = [
      ...eto,
      { variable: "cat", group: "B|no", statistic: "count", value: "0" },
      { variable: "cat", group: "B|no", statistic: "percent", value: "0" },
    ];
    const result = compareRows(eto, r, { tier: "A", groupOrder: ["A", "B"], tests: [] });
    expect(result.filter((row) => row.group === "B|no")).toEqual(expect.arrayContaining([
      expect.objectContaining({ statistic: "count", easytableone: 0, r_tableone: 0, agrees: true, reason: "zero-count level not displayed by EasyTableOne; compared as 0" }),
      expect.objectContaining({ statistic: "percent", easytableone: 0, r_tableone: 0, agrees: true, reason: "zero-count level not displayed by EasyTableOne; compared as 0" }),
    ]));
  });

  it("emits non-missing n once per categorical stratum in the R harness", () => {
    const rHarness = fs.readFileSync(path.resolve("validation/r/crossval_tableone.R"), "utf8");
    expect(rHarness).toContain("nonmissing_count <- function(n, miss) as.numeric(n) - as.numeric(miss)");
    expect(rHarness).toContain('nonmissing_count(stratum[variable, "n"], stratum[variable, "miss"])');
    expect(rHarness).toContain("nonmissing_count(mat$n[1], mat$miss[1])");
    const categoricalBlock = rHarness.slice(rHarness.indexOf("for (level in c(\"Overall\", group_order)) {", rHarness.indexOf("} else {\n      x<-as.character")));
    expect(categoricalBlock.indexOf('out <- add(out, tier, variable, level, "n"')).toBeLessThan(categoricalBlock.indexOf("for (category in categories)"));
  });

  it("categorizes every non-comparable multi-group SMD as D2 while preserving D for two groups", () => {
    const multi = compareRows(
      [{ variable: "constant", group: "", statistic: "smd", value: "0" }],
      [{ variable: "constant", group: "", statistic: "smd", value: "" }],
      { tier: "A", groupOrder: ["a", "b", "c"], tests: [{ variable: "constant" }] },
    );
    expect(multi[0]).toMatchObject({ category: "D2", agrees: null });

    const two = compareRows(
      [{ variable: "small", group: "", statistic: "smd", value: "" }],
      [{ variable: "small", group: "", statistic: "smd", value: "1.2" }],
      { tier: "B", groupOrder: ["a", "b"], tests: [{ variable: "small", smdUndefinedSmallGroup: true }] },
    );
    expect(two[0]).toMatchObject({ category: "D", agrees: null });
  });
});
