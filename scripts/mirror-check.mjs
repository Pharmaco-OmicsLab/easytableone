import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Keep this identical to the robocopy exclusion list in _materials/deploy.md (step 2c).
export const EXCLUDED_DIRS = new Set([".git", "_materials", "spikes", ".agents", ".claude", ".cursor", ".cache"]);
export const EXCLUDED_FILES = new Set(["agents.md", "claude.md", "check_fisher.mjs", ".gitattributes"]);
const slash = (value) => value.replaceAll("\\", "/");

export function isPublicPath(relativePath) {
  const parts = slash(relativePath).split("/");
  return parts.length > 0 && !parts.some((part) => EXCLUDED_DIRS.has(part)) && !EXCLUDED_FILES.has(parts.at(-1));
}

function gitFiles(args) {
  const result = spawnSync("git", ["ls-files", "-z", ...args], { cwd: root, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`git ls-files failed: ${result.error?.message ?? result.stderr}`);
  return result.stdout.split("\0").filter(Boolean).map(slash);
}

export function copySnapshot(sourceRoot, destination, files) {
  for (const file of files) {
    if (!isPublicPath(file)) continue;
    const source = path.join(sourceRoot, file);
    if (!fs.existsSync(source)) continue; // tracked deletion in the candidate workspace
    const target = path.join(destination, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
}

function quoteCmdArg(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function command(cwd, executable, args, env) {
  process.stdout.write(`\n> ${executable} ${args.join(" ")}\n`);
  let result;
  if (executable === "pnpm" && process.platform === "win32") {
    if (env.npm_execpath) {
      result = spawnSync(process.execPath, [env.npm_execpath, ...args], { cwd, env, stdio: "inherit", shell: false });
    } else {
      process.stderr.write("npm_execpath is unset; using quoted Windows shell fallback for pnpm.\n");
      const commandLine = [executable, ...args].map(quoteCmdArg).join(" ");
      result = spawnSync(commandLine, { cwd, env, stdio: "inherit", shell: true });
    }
  } else {
    result = spawnSync(executable, args, { cwd, env, stdio: "inherit", shell: false });
  }
  if (result.error || result.status !== 0) throw new Error(`${executable} ${args.join(" ")} failed (${result.status}): ${result.error?.message ?? "see output"}`);
}

export function buildMirrorChildEnv(parentEnv, temp) {
  return { ...parentEnv, TEMP: temp, TMP: temp, TMPDIR: temp, CI: "1" };
}

export function skippedInternalTests(reports) {
  return reports.flatMap((report) => report.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? [])
      .filter((test) => ["pending", "todo", "skipped"].includes(test.status))
      .map((test) => ({ test, fixture: test.fullName.match(/internal fixtures?:\s*([^)]+)/i)?.[1]?.trim() }))
      // Vitest JSON also labels tests excluded by --testNamePattern as "skipped". Only report
      // actual test.skip/skipIf cases whose title carries the fixture names and reason.
      .filter(({ fixture }) => Boolean(fixture))
      .map(({ test, fixture }) => ({
        file: slash(file.name),
        name: test.fullName,
        reason: `Requires internal fixture(s): ${fixture}`,
      })));
}

export function runMirrorCheck({ candidate = false, copyOnly = false } = {}) {
  const tracked = gitFiles(["--cached"]);
  const untracked = gitFiles(["--others", "--exclude-standard"]).filter(isPublicPath);
  if (!candidate && untracked.length > 0) {
    throw new Error(`Untracked public files would be omitted (${untracked.length}). Commit them, or review the precommit snapshot with --workspace-candidate:\n${untracked.join("\n")}`);
  }
  const files = [...new Set([...tracked, ...(candidate ? untracked : [])])];
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "eto-mirror-"));
  try {
    copySnapshot(root, temp, files);
    process.stdout.write(`Mirror snapshot: ${temp} (${candidate ? "tracked + nonignored untracked workspace candidate" : "tracked tree"})\n`);
    if (copyOnly) return temp;
    const env = buildMirrorChildEnv(process.env, temp);
    command(temp, "pnpm", ["install", "--frozen-lockfile"], env);
    command(temp, "pnpm", ["verify"], env);
    // Focused JSON runs collect the actual skipped names; verification already ran the full suite.
    const reportPaths = ["mirror-unit.json", "mirror-pyodide.json"];
    const vitest = path.join(temp, "node_modules", "vitest", "vitest.mjs");
    const pattern = "--testNamePattern=internal.fixture";
    const runVitest = (args) => {
      const result = spawnSync(process.execPath, [vitest, ...args], { cwd: temp, env, stdio: "inherit", shell: false });
      if (result.error || result.status !== 0) throw new Error(`vitest ${args.join(" ")} failed (${result.status}): ${result.error?.message ?? "see output"}`);
    };
    runVitest(["run", "--project", "unit", "src/core/schema/inference.test.ts", "tests/fixtures.test.ts", pattern, "--reporter=json", `--outputFile=${reportPaths[0]}`]);
    runVitest(["run", "--project", "pyodide", "tests/fungi.e2e.test.ts", "tests/modeling_pyodide.test.ts", "tests/stats.test.ts", "tests/perf.test.ts", "tests/pythonPlots.test.ts", pattern, "--reporter=json", `--outputFile=${reportPaths[1]}`]);
    const skipped = skippedInternalTests(reportPaths.map((file) => JSON.parse(fs.readFileSync(path.join(temp, file), "utf8"))));
    process.stdout.write(`\nSkipped internal-fixture tests (${skipped.length}):\n${skipped.map((test) => `- ${test.file}: ${test.name}\n  Reason: ${test.reason}`).join("\n")}\n`);
    return temp;
  } finally {
    if (!copyOnly) fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runMirrorCheck({ candidate: process.argv.includes("--workspace-candidate"), copyOnly: process.argv.includes("--copy-only") });
}
