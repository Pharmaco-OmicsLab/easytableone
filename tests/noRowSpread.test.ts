import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(process.cwd(), "src/core");

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(filePath);
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name) ? [filePath] : [];
  });
}

describe("row-scaled min/max spread guard", () => {
  it("keeps schema and QA source free of min/max argument spreads", () => {
    const violations = ["schema", "qa"].flatMap((directory) =>
      sourceFiles(path.join(sourceRoot, directory)).flatMap((filePath) => {
        const source = fs.readFileSync(filePath, "utf8");
        return [...source.matchAll(/Math\.(?:min|max)\s*\(\s*\.\.\./g)].map(
          (match) => `${path.relative(process.cwd(), filePath)}:${source.slice(0, match.index).split(/\r?\n/).length}`,
        );
      }),
    );

    expect(violations).toEqual([]);
  });
});
