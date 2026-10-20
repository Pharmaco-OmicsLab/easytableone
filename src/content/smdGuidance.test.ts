import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  SMD_CAVEAT,
  SMD_GLOSSARY,
  SMD_USE_WHEN,
  SMD_USUALLY_NOT_NEEDED,
  SMD_WHEN_TO_USE_HEADLINE,
} from "./smdGuidance";

describe("smdGuidance", () => {
  it("exports valid guidance constants", () => {
    expect(SMD_GLOSSARY).toBeTruthy();
    expect(SMD_WHEN_TO_USE_HEADLINE).toBeTruthy();
    expect(SMD_USE_WHEN.length).toBeGreaterThan(0);
    expect(SMD_USUALLY_NOT_NEEDED.length).toBeGreaterThan(0);
    expect(SMD_CAVEAT).toBeTruthy();
  });

  it("public/tutorial.md and src/content/faq.md contain SMD_WHEN_TO_USE_HEADLINE verbatim", () => {
    const tutorialPath = path.resolve(__dirname, "../../public/tutorial.md");
    const faqPath = path.resolve(__dirname, "faq.md");

    const tutorialContent = fs.readFileSync(tutorialPath, "utf-8");
    const faqContent = fs.readFileSync(faqPath, "utf-8");

    expect(tutorialContent).toContain(SMD_WHEN_TO_USE_HEADLINE);
    expect(faqContent).toContain(SMD_WHEN_TO_USE_HEADLINE);
  });

  it("neither tutorial nor FAQ contains retired unconventional-SMD phrasing", () => {
    const tutorialPath = path.resolve(__dirname, "../../public/tutorial.md");
    const faqPath = path.resolve(__dirname, "faq.md");

    const tutorialContent = fs.readFileSync(tutorialPath, "utf-8");
    const faqContent = fs.readFileSync(faqPath, "utf-8");

    expect(tutorialContent).not.toContain("SMD isn't conventional");
    expect(tutorialContent).not.toContain("SMD is not conventional");
    expect(faqContent).not.toContain("SMD isn't conventional");
    expect(faqContent).not.toContain("SMD is not conventional");
  });

  it("repo-wide guard: src/ and public/ do not contain retired strings", () => {
    const consortPhrase = ["CONSORT", "aligned emphasis"].join("-");
    const retiredStrings = [
      consortPhrase,
      "SMD isn't conventional",
      "SMD is not conventional",
      "not available for this table",
    ];

    const dirsToCheck = [
      path.resolve(__dirname, "../../src"),
      path.resolve(__dirname, "../../public"),
    ];

    const textExtensions = new Set([
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".json",
      ".md",
      ".html",
      ".css",
    ]);

    function collectTextFiles(dir: string): string[] {
      const files: string[] = [];
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          files.push(...collectTextFiles(fullPath));
        } else if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) {
          files.push(fullPath);
        }
      }
      return files;
    }

    const files = dirsToCheck.flatMap(collectTextFiles);
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      if (path.resolve(file) === path.resolve(__filename)) continue;
      const content = fs.readFileSync(file, "utf-8");
      const isTestFile = file.includes(".test.");

      if (content.includes(consortPhrase)) {
        throw new Error(`Found retired string "${consortPhrase}" in ${file}`);
      }

      if (!isTestFile) {
        for (const retired of retiredStrings) {
          if (content.includes(retired)) {
            throw new Error(`Found retired string "${retired}" in ${file}`);
          }
        }
      }
    }
  });
});
