// Phase 51 R1 (D105b/c): fail the build if dist/ can make an automatic remote request.
//
// Scans dist/**/*.{html,js,mjs,css} for remote (http/https) URLs in resource-loading
// positions: src=, href= (except on <a>), import(), importScripts(), fetch(), url(),
// `.src = "..."`, and any literal that names a public CDN host. Anything not on the
// allowlist below fails. Also asserts that dist/index.html carries the CSP meta tag with
// connect-src 'self', and that the unused Pyodide console pages were stripped.
//
// Usage: node scripts/check-dist-offline.mjs [distDir]   (default: ./dist)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.resolve(process.argv[2] ?? path.join(root, "dist"));

// Must stay identical to CSP in vite.config.ts and to _materials/deploy.md.
const CSP_EXPECTED =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; " +
  "connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'";

// Allowlist: string literals that exist in shipped files but are never fetched.
// Each entry: file (RegExp on the dist-relative posix path), match (RegExp on the matched
// text), reason. Keep this list short; every entry needs a reason.
const ALLOWLIST = [
  {
    // pyodide.mjs / pyodide.js / the Vite-bundled copy in assets/pyodide-*.js
    file: /^(pyodide-314\.0\.0a1\/pyodide\.(m?js)|assets\/pyodide-[^/]+\.js)$/,
    match: /cdn\.jsdelivr\.net\/pyodide\//,
    reason:
      "Pyodide's default cdnUrl fallback (`packageBaseUrl ?? https://cdn.jsdelivr.net/pyodide/v<ver>/full/`). " +
      "Never used: pyodide.worker.ts always passes an explicit same-origin indexURL, and connect-src 'self' " +
      "would block it regardless.",
  },
  // Vega-Lite `$schema` URLs (https://vega.github.io/schema/...) are identifier strings in spec
  // objects. No current pattern matches them, so no entry is needed; add one here only if a
  // pattern change starts flagging them.
];

const SCAN_EXT = new Set([".html", ".js", ".mjs", ".css"]);
const URL_RE = "https?:\\/\\/[^\\s\"'`)<>\\\\]+";
const PATTERNS = [
  { name: "src=", re: new RegExp(`\\bsrc\\s*=\\s*\\\\?["']?\\s*(${URL_RE})`, "g") },
  { name: "href=", re: new RegExp(`\\bhref\\s*=\\s*\\\\?["']?\\s*(${URL_RE})`, "g"), skipAnchor: true },
  { name: ".src =", re: new RegExp(`\\.src\\s*=\\s*["'\`](${URL_RE})`, "g") },
  { name: "import()", re: new RegExp(`\\bimport\\s*\\(\\s*["'\`](${URL_RE})`, "g") },
  { name: "importScripts()", re: new RegExp(`\\bimportScripts\\s*\\(\\s*["'\`](${URL_RE})`, "g") },
  { name: "fetch()", re: new RegExp(`\\bfetch\\s*\\(\\s*["'\`](${URL_RE})`, "g") },
  { name: "url()", re: new RegExp(`\\burl\\(\\s*["']?(${URL_RE})`, "g") },
  { name: "@import", re: new RegExp(`@import\\s+["'](${URL_RE})`, "g") },
  {
    name: "CDN host literal",
    re: /https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com|ajax\.googleapis\.com|code\.jquery\.com|esm\.sh|cdn\.skypack\.dev)[^\s"'`)<>\\]*/g,
  },
];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (SCAN_EXT.has(path.extname(e.name))) out.push(p);
  }
  return out;
}

// True if the match sits inside an <a ...> tag (user-initiated navigation is allowed).
function insideAnchorTag(text, index) {
  const lt = text.lastIndexOf("<", index);
  if (lt < 0) return false;
  if (text.lastIndexOf(">", index) > lt) return false;
  return /^<a[\s>]/i.test(text.slice(lt, lt + 3));
}

const failures = [];
const problems = [];
const used = new Set();

if (!fs.existsSync(distDir)) {
  console.error(`check-dist-offline: ${distDir} does not exist. Run vite build first.`);
  process.exit(1);
}

for (const abs of walk(distDir)) {
  const rel = path.relative(distDir, abs).split(path.sep).join("/");
  const text = fs.readFileSync(abs, "utf8");
  const seen = new Set();
  for (const pat of PATTERNS) {
    pat.re.lastIndex = 0;
    for (let m = pat.re.exec(text); m; m = pat.re.exec(text)) {
      if (pat.skipAnchor && insideAnchorTag(text, m.index)) continue;
      const url = m[1] ?? m[0];
      const key = `${m.index}:${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const allowIdx = ALLOWLIST.findIndex((a) => a.file.test(rel) && a.match.test(url));
      if (allowIdx >= 0) {
        used.add(allowIdx);
        continue;
      }
      failures.push(`${rel}: ${pat.name} -> ${url.slice(0, 120)}`);
    }
  }
}

// Unused Pyodide REPL pages must not ship.
for (const page of ["console.html", "console-v2.html"]) {
  if (fs.existsSync(path.join(distDir, "pyodide-314.0.0a1", page))) {
    problems.push(`pyodide-314.0.0a1/${page} is present in dist/ (should be stripped by vite.config.ts).`);
  }
}

// CSP meta in index.html.
const indexPath = path.join(distDir, "index.html");
if (!fs.existsSync(indexPath)) {
  problems.push("index.html is missing from dist/.");
} else {
  const html = fs.readFileSync(indexPath, "utf8");
  const tag = html.match(/<meta\s[^>]*http-equiv\s*=\s*["']Content-Security-Policy["'][^>]*>/i);
  const content = tag?.[0].match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1];
  if (!content) {
    problems.push("dist/index.html has no <meta http-equiv=\"Content-Security-Policy\" content=\"...\">.");
  } else {
    const decoded = content.replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, "&");
    const directives = new Map(
      decoded
        .split(";")
        .map((d) => d.trim())
        .filter(Boolean)
        .map((d) => {
          const [name, ...vals] = d.split(/\s+/);
          return [name, vals.join(" ")];
        }),
    );
    if (directives.get("connect-src") !== "'self'") {
      problems.push(`CSP meta connect-src must be exactly 'self', got: ${directives.get("connect-src")}`);
    }
    if (/https?:\/\//.test(decoded)) {
      problems.push("CSP meta contains a remote host; hosts must never be added to the policy.");
    }
    if (decoded !== CSP_EXPECTED) {
      problems.push(`CSP meta differs from the Phase 51 policy.\n  got:      ${decoded}\n  expected: ${CSP_EXPECTED}`);
    }
  }
}

for (let i = 0; i < ALLOWLIST.length; i++) {
  if (!used.has(i)) console.log(`check-dist-offline: note: allowlist entry ${i} unused (${ALLOWLIST[i].match})`);
}

if (failures.length || problems.length) {
  console.error("check-dist-offline: FAILED");
  for (const f of failures) console.error(`  remote reference: ${f}`);
  for (const p of problems) console.error(`  ${p}`);
  console.error("Fix the code; do not widen the CSP or add to the allowlist unless the string is never fetched.");
  process.exit(1);
}
console.log(`check-dist-offline: OK (${walk(distDir).length} files scanned, ${used.size} allowlist entries used)`);
