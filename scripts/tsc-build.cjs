#!/usr/bin/env node
/**
 * Real project typecheck: `tsc -b --force` over tsconfig.app.json + tsconfig.node.json.
 *
 * Why this exists:
 *  - Root `tsconfig.json` has `"files": []` and only project references, so a plain
 *    `tsc --noEmit` at the root type-checks NOTHING. `tsc -b` is the real check.
 *  - In the Codex Windows sandbox, `fs.realpathSync.native` mis-resolves pnpm's
 *    node_modules junctions and `tsc -b` reports spurious errors (e.g. in vegaRender.ts,
 *    vite.config.ts). Using the JS realpath implementation removes them
 *    (diagnosed 2026-10-09, see _materials/claude.md "R1 build attribution").
 *    The override is process-local and harmless on a normal machine.
 *
 * Usage: node scripts/tsc-build.cjs   (extra args are passed through to tsc)
 */
const path = require("path");
require("./realpath-shim.cjs");
const tscEntry = require.resolve("typescript/lib/tsc.js", { paths: [path.resolve(__dirname, "..")] });
process.argv = [process.argv[0], tscEntry, "-b", "--force", "--pretty", "false", ...process.argv.slice(2)];
require(tscEntry);
