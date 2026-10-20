import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const snapshots = [
  "tests/format/__snapshots__/snapshot.jama.test.ts.snap",
  "tests/format/__snapshots__/snapshot.lancet.test.ts.snap",
  "tests/format/__snapshots__/snapshot.nejm.test.ts.snap",
  "tests/format/__snapshots__/snapshot.naturemed.test.ts.snap",
  "tests/format/__snapshots__/snapshot.generic.test.ts.snap",
];
const normalizeVersion = (text) => text
  .replaceAll('"rulesetVersion": "1.6"', '"rulesetVersion": "1.7"')
  .replaceAll("(ruleset v1.6)", "(ruleset v1.7)");

let failed = false;
for (const path of snapshots) {
  const original = execFileSync("git", ["show", `HEAD:${path}`], { cwd: root, encoding: "utf8" });
  const current = readFileSync(resolve(root, path), "utf8");
  const passed = normalizeVersion(original) === current;
  console.log(`${passed ? "PASS" : "FAIL"} ${path}: ${passed ? "ruleset version only" : "other snapshot content changed"}`);
  failed ||= !passed;
}
if (failed) process.exitCode = 1;
