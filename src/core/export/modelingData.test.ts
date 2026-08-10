import { describe, expect, it } from "vitest";
import { toCsv } from "./modelingData";

describe("modelingData export helpers", () => {
  it("quotes commas, quotes, and newlines in CSV output", () => {
    const csv = toCsv([
      { term: 'age,"quoted"', note: "line\nbreak", value: 1 },
      { term: "marker", note: "plain", value: null },
    ]);

    expect(csv).toBe('term,note,value\r\n"age,""quoted""","line\nbreak",1\r\nmarker,plain,\r\n');
  });
});
