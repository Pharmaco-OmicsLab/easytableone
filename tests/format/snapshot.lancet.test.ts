import { describe, expect, it } from "vitest";
import { formatTable } from "../../src/core/format/formatTable";
import { mockStats, dummyPlan, dummySchema } from "./mockStats";

describe("FormatTable - LANCET", () => {
  it("formats correctly against snapshot", () => {
    const formatted = formatTable(mockStats, "LANCET", dummyPlan, dummySchema, "1.0.0-test");
    expect(formatted).toMatchSnapshot();
  });
});
