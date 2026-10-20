import { describe, expect, it } from "vitest";
import { isFisherLike, isOrdinalRankTest } from "./testName";

describe("testName helpers", () => {
  it("detects Fisher-like tests", () => {
    expect(isFisherLike("Fisher's exact")).toBe(true);
    expect(isFisherLike("Fisher's exact (Monte Carlo)")).toBe(true);
    expect(isFisherLike("Chi-square")).toBe(false);
  });

  it("detects ordinal rank tests", () => {
    expect(isOrdinalRankTest("Mann-Whitney U (ordinal)")).toBe(true);
    expect(isOrdinalRankTest("Kruskal-Wallis (ordinal)")).toBe(true);
    expect(isOrdinalRankTest("Mann-Whitney U")).toBe(false);
    expect(isOrdinalRankTest("Kruskal-Wallis")).toBe(false);
    expect(isOrdinalRankTest("Chi-square")).toBe(false);
  });
});
