import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflow = parse(fs.readFileSync(path.resolve(__dirname, "../.github/workflows/ci.yml"), "utf8"));
const commands = (job: { steps: Array<{ run?: string }> }) => job.steps.flatMap((step) => step.run ? [step.run] : []);

describe("public CI workflow", () => {
  it("parses and guards every job to the public repository", () => {
    expect(Object.keys(workflow.on).sort()).toEqual(["pull_request", "push", "workflow_dispatch"]);
    // R3 adds the public API documentation build as an independent CI job.
    expect(Object.keys(workflow.jobs).sort()).toEqual(["docs", "e2e", "inventory", "pyodide", "unit", "verify"]);
    for (const job of Object.values(workflow.jobs) as Array<{ if?: string }>) {
      expect(job.if).toBe("github.repository == 'Pharmaco-OmicsLab/easytableone'");
    }
  });

  it("splits unit and Pyodide tests and rejects LFS wheel pointers", () => {
    expect(commands(workflow.jobs.unit).join("\n")).toContain("pnpm test:unit");
    expect(commands(workflow.jobs.pyodide).join("\n")).toContain("pnpm test:pyodide");
    expect(commands(workflow.jobs.pyodide).join("\n")).toContain("pnpm test:golden");
    expect(commands(workflow.jobs.pyodide).join("\n")).toMatch(/find public\/pyodide-\*.*-name '\*\.whl'.*-size -1024c/);
    expect(workflow.jobs.verify.needs).toEqual(["unit", "pyodide"]);
    expect(commands(workflow.jobs.verify)).toEqual(expect.arrayContaining(["pnpm install --frozen-lockfile", "pnpm test:projects", "pnpm typecheck", "pnpm build"]));
  });

  it("runs inventory and browser tests, preserving failure reports", () => {
    expect(commands(workflow.jobs.inventory)).toContain("pnpm test:inventory");
    expect(commands(workflow.jobs.e2e)).toEqual(expect.arrayContaining([
      "npx playwright install --with-deps chromium firefox webkit", "pnpm test:e2e:all",
    ]));
    expect(workflow.jobs.e2e.steps).toContainEqual(expect.objectContaining({
      if: "failure()", with: expect.objectContaining({ name: "playwright-report" }),
    }));
  });
});
