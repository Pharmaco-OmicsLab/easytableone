import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildMirrorChildEnv, copySnapshot, isPublicPath, skippedInternalTests } from "./mirror-check.mjs";

test("mirror exclusions match development-only paths while retaining workflow and validation", () => {
  for (const file of ["_materials/samples/private.xlsx", "spikes/a.ts", ".agents/note", ".claude/x", ".cursor/x", ".cache/x", ".git/config", "agents.md", "claude.md", "check_fisher.mjs", ".gitattributes"]) {
    assert.equal(isPublicPath(file), false, file);
  }
  for (const file of [".github/workflows/ci.yml", "validation/report/EasyTableOne_tableone_validation.docx", "public/samples/heart_failure_clinical_records_dataset.csv"]) {
    assert.equal(isPublicPath(file), true, file);
  }
});

test("mirror child processes run with CI enabled and workspace-local temp paths", () => {
  const env = buildMirrorChildEnv({ PATH: "sentinel", CI: "0" }, "D:\\temp with spaces");
  assert.equal(env.PATH, "sentinel");
  assert.equal(env.CI, "1");
  assert.equal(env.TEMP, "D:\\temp with spaces");
  assert.equal(env.TMP, env.TEMP);
  assert.equal(env.TMPDIR, env.TEMP);
});

test("snapshot copies public files and excludes internal data", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "eto-mirror-fixture-"));
  const source = path.join(temp, "source");
  const target = path.join(temp, "target");
  try {
    for (const file of ["_materials/samples/private.xlsx", "public/samples/sample.csv", ".github/workflows/ci.yml"]) {
      const absolute = path.join(source, file);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, file);
    }
    copySnapshot(source, target, ["_materials/samples/private.xlsx", "public/samples/sample.csv", ".github/workflows/ci.yml"]);
    assert.equal(fs.existsSync(path.join(target, "_materials/samples/private.xlsx")), false);
    assert.equal(fs.existsSync(path.join(target, "public/samples/sample.csv")), true);
    assert.equal(fs.existsSync(path.join(target, ".github/workflows/ci.yml")), true);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test("skipped test report includes only cases that name their internal fixtures", () => {
  const report = { testResults: [{ name: "fixtures.test.ts", assertionResults: [
    { status: "pending", fullName: "internal fixture: babies.csv schema" },
  ] }] };
  assert.deepEqual(skippedInternalTests([report]), [{
    file: "fixtures.test.ts",
    name: "internal fixture: babies.csv schema",
    reason: "Requires internal fixture(s): babies.csv schema",
  }]);
  assert.deepEqual(skippedInternalTests([{ testResults: [{ name: "src/example.test.ts", assertionResults: [
    { status: "pending", fullName: "unexplained skip" },
    { status: "skipped", fullName: "QA fixture-free checks > filtered out by name pattern" },
  ] }] }]), []);

  const spikeReport = { testResults: [{ name: "tests/pythonPlots.test.ts", assertionResults: [
    { status: "skipped", fullName: "Python plots > verifies G1 (internal fixtures: spikes/round13/output/data_clean.json, spikes/round14_d49/output/g1_boxplot_pyodide.png)" },
  ] }] };
  assert.deepEqual(skippedInternalTests([spikeReport]), [{
    file: "tests/pythonPlots.test.ts",
    name: "Python plots > verifies G1 (internal fixtures: spikes/round13/output/data_clean.json, spikes/round14_d49/output/g1_boxplot_pyodide.png)",
    reason: "Requires internal fixture(s): spikes/round13/output/data_clean.json, spikes/round14_d49/output/g1_boxplot_pyodide.png",
  }]);
});
