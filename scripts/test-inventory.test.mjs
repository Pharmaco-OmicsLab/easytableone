import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { buildPlaywrightInvocation, buildVitestInvocation, makeInventory, renderMarkdown, summarizePlaywright, summarizeVitest } from "./test-inventory.mjs";

test("child process paths stay single arguments for a workspace path with spaces", () => {
  const repoRoot = "D:\\Long project\\x";
  const vitest = buildVitestInvocation(repoRoot, "unit", ".tmp/test-inventory/unit.json");
  assert.equal(vitest.executable, process.execPath);
  assert.equal(vitest.options.cwd, repoRoot);
  assert.equal(vitest.options.shell, false);
  assert.equal(vitest.args[0], path.join(repoRoot, "node_modules", "vitest", "vitest.mjs"));
  assert.equal(vitest.args.at(-1), "--outputFile=.tmp/test-inventory/unit.json");
  assert.equal(vitest.args.length, 6);

  const playwright = buildPlaywrightInvocation(repoRoot);
  assert.equal(playwright.executable, process.execPath);
  assert.equal(playwright.options.cwd, repoRoot);
  assert.equal(playwright.options.shell, false);
  assert.equal(playwright.args[0], path.join(repoRoot, "node_modules", "@playwright", "test", "cli.js"));
  assert.deepEqual(playwright.args.slice(1), ["test", "--list", "--reporter=json"]);
});

test("Vitest inventory matches reporter totals and preserves skip/fixme", () => {
  const unit = summarizeVitest({
    numTotalTests: 3, numPassedTests: 1, numFailedTests: 0, numPendingTests: 1, numTodoTests: 1,
    testResults: [{ name: "src/core/example.test.ts", assertionResults: [
      { fullName: "passes", status: "passed" },
      { fullName: "internal fixture: sample", status: "pending" },
      { fullName: "planned fix", status: "todo" },
    ] }],
  }, "unit");
  assert.deepEqual(unit.counts, { passed: 1, skipped: 1, fixme: 1, failed: 0 });
  assert.equal(unit.fileCount, 1);
  assert.throws(() => summarizeVitest({ numTotalTests: 4, numPassedTests: 1, numFailedTests: 0, numPendingTests: 1, numTodoTests: 1,
    testResults: [{ name: "src/core/example.test.ts", assertionResults: [] }] }, "unit"), /differ/);
});

test("Vitest paths remain relative when the workspace path contains spaces", () => {
  const report = {
    numTotalTests: 1, numPassedTests: 1, numFailedTests: 0, numPendingTests: 0, numTodoTests: 0,
    testResults: [{ name: path.join(process.cwd(), "src", "core", "example.test.ts"), assertionResults: [
      { fullName: "passes", status: "passed" },
    ] }],
  };
  assert.deepEqual(summarizeVitest(report, "unit").files, ["src/core/example.test.ts"]);
});

test("Playwright list is discovery, not an execution result", () => {
  const report = { config: { projects: [{ name: "prod-chromium" }, { name: "prod-webkit" }] }, suites: [{
    title: "e2e.spec.ts", file: "e2e.spec.ts", specs: [{ title: "workflow", file: "e2e.spec.ts", tests: [
      { projectName: "prod-chromium", expectedStatus: "passed", status: "skipped", annotations: [] },
    ] }],
  }, {
    title: "data-locality.spec.ts", file: "data-locality.spec.ts", specs: [{
      title: "offline pass: after engine ready the whole workflow and all exports work without a network",
      file: "data-locality.spec.ts", tests: [{ projectName: "prod-webkit", expectedStatus: "passed", status: "skipped", annotations: [] }],
    }],
  }] };
  const e2e = summarizePlaywright(report);
  assert.deepEqual(e2e["prod-chromium"].counts, { listed: 1, skipped: 0, fixme: 0 });
  assert.deepEqual(e2e["prod-webkit"].counts, { listed: 0, skipped: 0, fixme: 1 });
  assert.match(e2e["prod-webkit"].tests[0].reason, /WebKit encountered an internal error/);
  const unit = { project: "unit", files: ["src/core/example.test.ts"], fileCount: 1, testCount: 1,
    counts: { passed: 1, skipped: 0, fixme: 0, failed: 0 } };
  const pyodide = { project: "pyodide", files: [], fileCount: 0, testCount: 0,
    counts: { passed: 0, skipped: 0, fixme: 0, failed: 0 } };
  const inventory = makeInventory(unit, pyodide, e2e);
  assert.deepEqual(inventory.srcModulesCovered, ["src/core"]);
  assert.match(renderMarkdown(inventory), /Playwright counts are discovery only/);
});
