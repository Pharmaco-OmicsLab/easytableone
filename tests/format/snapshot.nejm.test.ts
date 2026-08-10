import { describe, expect, it } from "vitest";
import { formatTable } from "../../src/core/format/formatTable";
import { mockStats, dummyPlan, dummySchema } from "./mockStats";

describe("FormatTable - NEJM", () => {
  it("formats correctly against snapshot", () => {
    const formatted = formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test");
    expect(formatted).toMatchSnapshot();
  });

  it('NEJM IQR uses spaced "to" delimiter', () => {
    const formatted = formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "1.0.0-test");
    const cellWithIqr = formatted.rows.find(r => r.cells.some(c => c.includes(' to ')));
    expect(cellWithIqr).toBeDefined();
  });
});
