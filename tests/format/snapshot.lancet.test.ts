import { describe, expect, it } from "vitest";
import { formatTable, journalRulesets } from "../../src/core/format/formatTable";
import { mockStats, dummyPlan, dummySchema } from "./mockStats";

describe("FormatTable - LANCET", () => {
  it("formats correctly against snapshot", () => {
    const formatted = formatTable(mockStats, "LANCET", dummyPlan, dummySchema, "1.0.0-test");
    expect(formatted).toMatchSnapshot();
  });

  it("keeps table headings bold per the Lancet ruleset", () => {
    const lancet = journalRulesets.EasyTableOne_Ruleset.journals.find((journal) => journal.journal_id === "LANCET")!;
    expect(lancet.table_styling.bold_headers).toMatchSnapshot("heading bold flag");
  });
});
