import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const vitest = path.join(root, "node_modules", ".bin", process.platform === "win32" ? "vitest.cmd" : "vitest");
const command = process.platform === "win32" ? `"${vitest}"` : vitest;
const result = spawnSync(command, ["run", "--project", "pyodide", "tests/golden/export_r_tableone.test.ts"], {
  cwd: root,
  env: { ...process.env, ETO_EXPORT_FOR_R: "1" },
  stdio: "inherit",
  shell: process.platform === "win32",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
