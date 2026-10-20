import { describe, expect, it } from "vitest";
import { maxOf, minOf } from "./arrayExtent";

describe("array extent helpers", () => {
  it("matches Math min/max empty-array semantics", () => {
    expect(minOf([])).toBe(Infinity);
    expect(maxOf([])).toBe(-Infinity);
  });

  it("returns the minimum and maximum without argument spreading", () => {
    expect(minOf([4, -2, 9])).toBe(-2);
    expect(maxOf([4, -2, 9])).toBe(9);
  });
});
