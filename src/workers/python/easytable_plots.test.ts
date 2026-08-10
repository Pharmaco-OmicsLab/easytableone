import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("easytable_plots.py", () => {
  it("does not contain the old literal QQ plot group title", () => {
    const source = readFileSync("src/workers/python/easytable_plots.py", "utf8");
    expect(source).not.toContain("Q-Q Plot: group");
    expect(source).toContain("variable_label");
  });
});
