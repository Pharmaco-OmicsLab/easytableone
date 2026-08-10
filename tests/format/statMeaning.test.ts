import { describe, expect, it } from "vitest";
import { smdMagnitude, buildStatMeaning } from "../../src/core/format/statMeaning";
import { formatSmdValue } from "../../src/core/format/numberFormat";
import type { StatisticalResults } from "../../src/core/types";

describe("SMD magnitude and meaning", () => {
  describe("smdMagnitude", () => {
    it("classifies SMD magnitudes according to Cohen-anchored conventions", () => {
      // < 0.2: negligible-to-small
      expect(smdMagnitude(0.0)).toBe("negligible-to-small");
      expect(smdMagnitude(0.15)).toBe("negligible-to-small");
      
      // < 0.5: small-to-moderate
      expect(smdMagnitude(0.2)).toBe("small-to-moderate");
      expect(smdMagnitude(0.3)).toBe("small-to-moderate");
      expect(smdMagnitude(0.49)).toBe("small-to-moderate");

      // < 0.8: moderate-to-large
      expect(smdMagnitude(0.5)).toBe("moderate-to-large");
      expect(smdMagnitude(0.79)).toBe("moderate-to-large");

      // >= 0.8: large
      expect(smdMagnitude(0.8)).toBe("large");
      expect(smdMagnitude(1.5)).toBe("large");
    });
  });

  describe("formatSmdValue", () => {
    it("formats SMD value correctly with capping", () => {
      expect(formatSmdValue(0.1234)).toBe("0.123");
      expect(formatSmdValue(0.1234, "·")).toBe("0·123");
      expect(formatSmdValue(10.00001)).toBe(">10");
      expect(formatSmdValue(100)).toBe(">10");
      expect(formatSmdValue(Infinity)).toBe(">10");
    });
  });

  describe("buildStatMeaning", () => {
    const mockResultsBase = {
      computeMetadata: { libVersions: {}, seed: 42 },
      totalN: 200,
    };

    it("uses standard SMD wording for k <= 2", () => {
      const results: StatisticalResults = {
        ...mockResultsBase,
        groups: [{ name: "A", n: 100 }, { name: "B", n: 100 }],
        perVariable: [
          {
            variable: "Age",
            summaryByGroup: {},
            overallSummary: { mean: 45, n: 200 },
            test: { name: "t-test", statistic: 2.0, pValue: 0.04 },
            smd: 0.35,
            notes: [],
          },
        ],
      } as any;

      const meaning = buildStatMeaning(results.perVariable[0], { results, journalId: "NEJM" });
      expect(meaning).toContain("SMD=0.350 indicates a small-to-moderate difference.");
      expect(meaning).not.toContain("Largest pairwise");
    });

    it("uses Largest pairwise wording for k > 2", () => {
      const results: StatisticalResults = {
        ...mockResultsBase,
        groups: [{ name: "A", n: 50 }, { name: "B", n: 50 }, { name: "C", n: 50 }],
        perVariable: [
          {
            variable: "Age",
            summaryByGroup: {},
            overallSummary: { mean: 45, n: 150 },
            test: { name: "ANOVA", statistic: 3.5, pValue: 0.03 },
            postHoc: {
              reason: "ANOVA significant",
              correction: "tukey",
              method: "tukey_hsd",
              pairs: [
                { groupA: "A", groupB: "B", pValueRaw: 0.01, pValueCorrected: 0.01, significant: true }
              ]
            },
            smd: 0.55,
            notes: [],
          },
        ],
      } as any;

      const meaning = buildStatMeaning(results.perVariable[0], { results, journalId: "NEJM" });
      expect(meaning).toContain("Largest pairwise SMD=0.550 indicates a moderate-to-large difference between at least one pair of groups.");
    });

    it("handles capped SMD (>10) sentinel correctly in stat meaning", () => {
      const results: StatisticalResults = {
        ...mockResultsBase,
        groups: [{ name: "A", n: 100 }, { name: "B", n: 100 }],
        perVariable: [
          {
            variable: "Age",
            summaryByGroup: {},
            overallSummary: { mean: 45, n: 200 },
            test: { name: "t-test", statistic: 2.0, pValue: 0.04 },
            smd: 10.000001,
            notes: [],
          },
        ],
      } as any;

      const meaning = buildStatMeaning(results.perVariable[0], { results, journalId: "NEJM" });
      expect(meaning).toContain("SMD>10 indicates a large difference.");
    });
  });
});
