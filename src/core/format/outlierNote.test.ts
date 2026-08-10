import { describe, expect, it } from "vitest";
import { buildOutlierFindingDetail, buildOutlierHistoryLine, buildOutlierNote } from "./outlierNote";

describe("outlier note pluralization", () => {
  it("uses singular for n=1", () => {
    const note = buildOutlierNote(1, "SomeColumn");
    expect(note).toContain("1 value in SomeColumn was");
    expect(note).toContain("a potential outlier");
    expect(note).not.toContain("values were");
    expect(note).not.toContain("potential outliers");
  });

  it("uses plural for n=2", () => {
    const note = buildOutlierNote(2, "SomeColumn");
    expect(note).toContain("2 values in SomeColumn were");
    expect(note).toContain("potential outliers");
    expect(note).not.toContain("value was");
  });

  it("uses plural for n=5 across finding and history variants", () => {
    expect(buildOutlierFindingDetail(5, "SomeColumn")).toBe(
      "5 values were flagged as potential outliers in SomeColumn."
    );
    expect(buildOutlierHistoryLine(5, "SomeColumn")).toBe(
      "- 5 values were flagged as potential outliers in SomeColumn"
    );
  });
});
