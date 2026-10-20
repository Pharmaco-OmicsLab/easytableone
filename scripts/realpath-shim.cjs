/**
 * Process-wide realpath workaround for the Codex Windows sandbox.
 *
 * `fs.realpathSync.native` / `fs.promises.realpath` (libuv) fail with EPERM or
 * resolve wrongly on pnpm's node_modules junctions in that sandbox. Vite's resolver
 * (e.g. `vite:worker-import-meta-url` resolving src/workers/pyodide.worker.ts) and
 * `tsc -b` then report spurious failures. Swapping in the pure-JS implementations
 * removes them. Harmless on a normal machine: same results, slightly slower.
 *
 * Load it into every Node process, including Vitest/Playwright children, via
 *   NODE_OPTIONS=--require=<abs path>/scripts/realpath-shim.cjs
 * (see agents.md "Known sandbox failure: realpath EPERM").
 */
const fs = require("fs");
fs.realpathSync.native = fs.realpathSync;
const jsRealpath = fs.realpath;
fs.realpath.native = jsRealpath;
fs.promises.realpath = (p, opts) =>
  new Promise((resolve, reject) => jsRealpath(p, opts, (err, res) => (err ? reject(err) : resolve(res))));
