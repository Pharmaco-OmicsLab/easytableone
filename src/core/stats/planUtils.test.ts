import { describe, it, expect } from "vitest";
import { validateGroupingVariable, defaultGroupOrder } from "./planUtils";
import type { Schema, DataFrame } from "../types";

describe("planUtils", () => {
  describe("validateGroupingVariable", () => {
    it("rejects continuous grouping variable per D31", () => {
      const schema: Schema = {
        columns: [
          { name: "age", confirmedType: "continuous", inferredType: "continuous", cardinalityTier: "ok" }
        ]
      };
      expect(() => validateGroupingVariable(schema, "age")).toThrow(/must be categorical/i);
    });

    it("accepts binary grouping variable", () => {
      const schema: Schema = {
        columns: [
          { name: "is_sick", confirmedType: "binary", inferredType: "binary", cardinalityTier: "ok" }
        ]
      };
      expect(() => validateGroupingVariable(schema, "is_sick")).not.toThrow();
    });
  });

  describe("defaultGroupOrder", () => {
    const schema: Schema = {
      columns: [
        { name: "binary_col", confirmedType: "binary", inferredType: "binary", cardinalityTier: "ok" },
        { 
          name: "bp_category", 
          confirmedType: "categorical_ordinal", 
          inferredType: "categorical_ordinal", 
          cardinalityTier: "ok",
          levels: [
            { code: "Normal", label: "Normal", order: 2 },
            { code: "High", label: "High", order: 3 },
            { code: "Low", label: "Low", order: 1 }
          ]
        },
        { name: "site", confirmedType: "categorical_nominal", inferredType: "categorical_nominal", cardinalityTier: "ok" }
      ]
    };

    const df: DataFrame = {
      columns: [
        { name: "binary_col", originalName: "binary_col" },
        { name: "bp_category", originalName: "bp_category" },
        { name: "site", originalName: "site" }
      ],
      rows: [
        [1, "Low", "A"],
        [0, "Low", "B"],
        [1, "Normal", "C"],
        [1, "High", "C"],
        [0, "High", "B"],
        [1, "Normal", "B"],
        [null, "Normal", "C"] // site count: A=1, B=3, C=3 (B and C tie)
      ],
      meta: {} as any
    };

    it("orders binary grouping by order of appearance when no levels exist", () => {
      const order = defaultGroupOrder(schema, df, "binary_col");
      expect(order).toEqual([1, 0]);
    });

    it("orders ordinal grouping by level.order (D32 rule a)", () => {
      const order = defaultGroupOrder(schema, df, "bp_category");
      expect(order).toEqual(["Low", "Normal", "High"]);
    });

    it("orders nominal string grouping by order of appearance when no levels exist", () => {
      const order = defaultGroupOrder(schema, df, "site");
      expect(order).toEqual(["A", "B", "C"]);
    });
  });
});
