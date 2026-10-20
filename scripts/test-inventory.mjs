import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const conditionalFixmes = JSON.parse(fs.readFileSync(path.join(root, "tests", "e2e", "conditional-fixmes.json"), "utf8"));
const slash = (value) => value.replaceAll("\\", "/");

export function summarizeVitest(report, project) {
  if (!Array.isArray(report.testResults) || typeof report.numTotalTests !== "number") {
    throw new Error(`Invalid Vitest JSON report for ${project}`);
  }
  const files = report.testResults.map((file) => slash(path.relative(root, file.name))).sort();
  const tests = report.testResults.flatMap((file) => file.assertionResults.map((test) => ({
    file: slash(path.relative(root, file.name)),
    name: test.fullName,
    status: test.status === "passed" ? "passed" : test.status === "failed" ? "failed" : test.status === "todo" ? "fixme" : "skipped",
  })));
  const counts = { passed: 0, skipped: 0, fixme: 0, failed: 0 };
  for (const test of tests) counts[test.status]++;
  if (tests.length !== report.numTotalTests || counts.passed !== report.numPassedTests || counts.failed !== report.numFailedTests ||
      counts.skipped + counts.fixme !== report.numPendingTests + report.numTodoTests) {
    throw new Error(`${project} inventory counts differ from the Vitest summary`);
  }
  return { project, files, fileCount: files.length, testCount: tests.length, counts, tests };
}

export function summarizePlaywright(report) {
  if (!Array.isArray(report.suites) || !Array.isArray(report.config?.projects)) throw new Error("Invalid Playwright list JSON");
  const projects = Object.fromEntries(report.config.projects.map((project) => [project.name, {
    project: project.name, files: new Set(), tests: [],
  }]));
  const visit = (suite, parents = []) => {
    const names = suite.title ? [...parents, suite.title] : parents;
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const bucket = projects[test.projectName];
        if (!bucket) throw new Error(`Unknown Playwright project: ${test.projectName}`);
        const file = slash(spec.file || suite.file);
        bucket.files.add(file);
        const conditionalReason = conditionalFixmes[test.projectName]?.[spec.title];
        const fixme = (test.annotations ?? []).some((annotation) => annotation.type === "fixme") || Boolean(conditionalReason);
        const skipped = !fixme && ((test.annotations ?? []).some((annotation) => annotation.type === "skip") || test.expectedStatus === "skipped");
        bucket.tests.push({ file, name: [...names, spec.title].join(" > "), status: fixme ? "fixme" : skipped ? "skipped" : "listed", ...(conditionalReason && { reason: conditionalReason }) });
      }
    }
    for (const child of suite.suites ?? []) visit(child, names);
  };
  for (const suite of report.suites) visit(suite);
  return Object.fromEntries(Object.entries(projects).map(([name, bucket]) => [name, {
    project: name, files: [...bucket.files].sort(), fileCount: bucket.files.size,
    testCount: bucket.tests.length,
    counts: { listed: bucket.tests.filter((test) => test.status === "listed").length,
      skipped: bucket.tests.filter((test) => test.status === "skipped").length,
      fixme: bucket.tests.filter((test) => test.status === "fixme").length },
    tests: bucket.tests,
  }]));
}

export function makeInventory(unit, pyodide, e2e) {
  const modules = [...new Set([...unit.files, ...pyodide.files]
    .filter((file) => file.startsWith("src/"))
    .map((file) => file.split("/").slice(0, 2).join("/")))].sort();
  return { generatedAt: new Date().toISOString(), vitest: { unit, pyodide }, e2e, srcModulesCovered: modules };
}

export function renderMarkdown(inventory) {
  const rows = Object.values(inventory.vitest).map((project) =>
    `| ${project.project} | ${project.fileCount} | ${project.testCount} | ${project.counts.passed} | ${project.counts.skipped} | ${project.counts.fixme} | ${project.counts.failed} |`);
  const e2eRows = Object.values(inventory.e2e).map((project) =>
    `| ${project.project} | ${project.fileCount} | ${project.testCount} | ${project.counts.listed} | ${project.counts.skipped} | ${project.counts.fixme} |`);
  return `# Test inventory\n\nGenerated ${inventory.generatedAt}. Vitest counts come from executed JSON reports. Playwright counts are discovery only, not pass results.\n\n` +
    `## Vitest\n\n| Project | Files | Tests | Passed | Skipped | Fixme | Failed |\n| --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows.join("\n")}\n\n` +
    `## Playwright (listed)\n\n| Project | Files | Tests | Listed | Skipped | Fixme |\n| --- | ---: | ---: | ---: | ---: | ---: |\n${e2eRows.join("\n")}\n\n` +
    `## Top-level src/ modules with colocated tests\n\n${inventory.srcModulesCovered.map((module) => `- ${module}`).join("\n") || "(none)"}\n`;
}

export function buildVitestInvocation(repoRoot, project, reportRelativePath) {
  const cli = path.join(repoRoot, "node_modules", "vitest", "vitest.mjs");
  return {
    executable: process.execPath,
    args: [cli, "run", "--project", project, "--reporter=json", `--outputFile=${reportRelativePath}`],
    options: { cwd: repoRoot, shell: false, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  };
}

export function buildPlaywrightInvocation(repoRoot) {
  return {
    executable: process.execPath,
    args: [path.join(repoRoot, "node_modules", "@playwright", "test", "cli.js"), "test", "--list", "--reporter=json"],
    options: { cwd: repoRoot, shell: false, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  };
}

export function runInventory() {
  const reportDir = path.join(root, ".tmp", "test-inventory");
  const env = process.env;
  fs.rmSync(reportDir, { recursive: true, force: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const unitRelative = ".tmp/test-inventory/unit.json";
  const pyodideRelative = ".tmp/test-inventory/pyodide.json";
  if (Boolean(process.env.ETO_UNIT_REPORT) !== Boolean(process.env.ETO_PYODIDE_REPORT)) {
    throw new Error("Set both ETO_UNIT_REPORT and ETO_PYODIDE_REPORT to reuse CI reports");
  }
  const runVitest = (project, reportPath) => {
    const invocation = buildVitestInvocation(root, project, reportPath);
    const result = spawnSync(invocation.executable, invocation.args, { ...invocation.options, env });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`vitest run --project ${project} failed (${result.status}):\n${result.stdout}\n${result.stderr}`);
    return JSON.parse(fs.readFileSync(path.join(root, reportPath), "utf8"));
  };
  const unitReport = process.env.ETO_UNIT_REPORT
    ? JSON.parse(fs.readFileSync(path.resolve(root, process.env.ETO_UNIT_REPORT), "utf8"))
    : runVitest("unit", unitRelative);
  const pyodideReport = process.env.ETO_PYODIDE_REPORT
    ? JSON.parse(fs.readFileSync(path.resolve(root, process.env.ETO_PYODIDE_REPORT), "utf8"))
    : runVitest("pyodide", pyodideRelative);
  const unit = summarizeVitest(unitReport, "unit");
  const pyodide = summarizeVitest(pyodideReport, "pyodide");
  const invocation = buildPlaywrightInvocation(root);
  const playwright = spawnSync(invocation.executable, invocation.args, { ...invocation.options, env });
  if (playwright.error) throw playwright.error;
  if (playwright.status !== 0) throw new Error(`playwright test --list failed (${playwright.status}):\n${playwright.stdout}\n${playwright.stderr}`);
  const e2e = summarizePlaywright(JSON.parse(playwright.stdout));
  const inventory = makeInventory(unit, pyodide, e2e);
  const outputDir = path.join(root, "validation");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "test_inventory.json"), `${JSON.stringify(inventory, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDir, "test_inventory.md"), renderMarkdown(inventory));
  process.stdout.write(renderMarkdown(inventory));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runInventory();
