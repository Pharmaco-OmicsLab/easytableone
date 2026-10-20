import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generateReproducibilityJson } from "../src/core/export/reproducibilityJson";
import { formatTable, journalRulesets } from "../src/core/format/formatTable";
import { dummyPlan, dummySchema, mockStats } from "./format/mockStats";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("public documentation consistency", () => {
  it("documents exactly the top-level reproducibility keys the generator can emit", () => {
    const formattedTable = formatTable(mockStats, "NEJM", dummyPlan, dummySchema, "3.40.0-test");
    const output = JSON.parse(generateReproducibilityJson({
      plan: {
        ...dummyPlan,
        userOverrides: { pValueThreshold: "<0.001" },
        testOverrides: [{ variable: "Age", method: "welch", timestamp: "2026-10-11T00:00:00.000Z" }],
      },
      schema: dummySchema,
      results: mockStats,
      formattedTable,
      appVersion: "3.40.0-test",
      timestamp: "2026-10-11T00:00:00.000Z",
      inputDataHash: "opt-in-hash",
      modelingResults: {
        setup: { outcome: "outcome", predictors: [], seed: 1, imputation: { policy: "complete_case", m: 1 } },
        logistic: null,
        ml: { models: [], comparison: [], folds: { nSplits: 0, nRepeats: 0, seed: 1 } },
      } as never,
    }));
    const fenced = read("docs/REPRODUCIBILITY_JSON.md").match(/```text\s*([\s\S]*?)```/)?.[1];
    expect(fenced).toBeDefined();
    const documented = fenced!.split(/\r?\n/).map((line) => line.trim().replace(/\s+\(optional\)$/, "")).filter(Boolean).sort();
    expect(documented).toEqual(Object.keys(output).sort());
    expect(output.rulesetProvenance).toEqual(
      journalRulesets.EasyTableOne_Ruleset.journals.find((journal) => journal.journal_id === formattedTable.journal)?.provenance,
    );
  });

  it("keeps every statistical-reference file:line citation within its source file", () => {
    const doc = read("docs/STATISTICAL_REFERENCE.md");
    for (const match of doc.matchAll(/`([^`]+):(\d+)`/g)) {
      const [, path, rawLine] = match;
      const sourceLines = read(path).split(/\r?\n/).length;
      expect(sourceLines, `${path}:${rawLine}`).toBeGreaterThanOrEqual(Number(rawLine));
    }
  });

  it("uses only package scripts that exist and lists README thresholds in the reference", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    const devDoc = read("docs/DEVELOPING.md");
    for (const match of devDoc.matchAll(/^\| `pnpm ([^` ]+)/gm)) {
      expect(pkg.scripts, `pnpm ${match[1]}`).toHaveProperty(match[1]);
    }
    const statistics = read("docs/STATISTICAL_REFERENCE.md");
    for (const threshold of ["20%", "30%", "50,000", "150,000", "2000"]) {
      expect(statistics).toContain(threshold);
    }
  });
});
