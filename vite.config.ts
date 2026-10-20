/// <reference types="vitest" />
import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

type VitestProjectGlobs = {
  unit: {
    include: string[];
    exclude: string[];
  };
  pyodide: {
    include: string[];
  };
};

const testProjects = JSON.parse(
  fs.readFileSync(new URL("./scripts/vitest-projects.json", import.meta.url), "utf8"),
) as VitestProjectGlobs;

// Phase 51 R1 (D105c). `connect-src 'self'` is non-negotiable: never add a host to
// connect-src, script-src, img-src or font-src. Keep this string identical to
// CSP_EXPECTED in scripts/check-dist-offline.mjs and to _materials/deploy.md.
const CSP =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; " +
  "connect-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'none'";

// frame-ancestors is ignored in a <meta> CSP, so it is only sent as an HTTP header.
const CSP_HEADER = `${CSP}; frame-ancestors 'self'`;

// Step 4: inject the CSP meta into the built index.html only. The dev server needs HMR
// websockets and inline scripts, so it must not get this policy.
function cspMetaPlugin(): Plugin {
  return {
    name: "easytableone:csp-meta",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: CSP },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

// Step 3: the upstream Pyodide REPL pages (unused by the app) load jQuery/xterm from CDNs.
// public/pyodide-314.0.0a1 is SHA-256 pinned, so leave public/ untouched and delete the
// copies from dist/ after the bundle is written. Before deleting, confirm the pin files
// do not list them (if one ever does, delete from public/ instead and update the pin).
const PYODIDE_UNUSED_PAGES = ["console.html", "console-v2.html"];
const PYODIDE_PIN_FILES = [
  "public/pyodide-314.0.0a1/pyodide-lock.json",
  "public/pyodide-314.0.0a1/README.md",
  "public/pyodide-314.0.0a1/extra-wheels/MANIFEST.md",
];

function stripPyodideConsolePagesPlugin(): Plugin {
  let root = process.cwd();
  let outDir = "dist";
  return {
    name: "easytableone:strip-pyodide-console-pages",
    apply: "build",
    configResolved(config) {
      root = config.root;
      outDir = config.build.outDir;
    },
    closeBundle() {
      for (const rel of PYODIDE_PIN_FILES) {
        const abs = path.resolve(root, rel);
        if (!fs.existsSync(abs)) continue;
        const text = fs.readFileSync(abs, "utf8");
        for (const page of PYODIDE_UNUSED_PAGES) {
          if (text.includes(page)) {
            throw new Error(
              `${rel} references ${page}; it is pinned. Do not strip it from dist/ automatically: ` +
                "remove it from public/ and update the pin manifest instead.",
            );
          }
        }
      }
      const distDir = path.resolve(root, outDir, "pyodide-314.0.0a1");
      for (const page of PYODIDE_UNUSED_PAGES) {
        fs.rmSync(path.join(distDir, page), { force: true });
      }
    },
  };
}

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/easytableone/" : "/",
  plugins: [react(), cspMetaPlugin(), stripPyodideConsolePagesPlugin()],
  preview: {
    headers: {
      "Content-Security-Policy": CSP_HEADER,
    },
  },
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./src/setupTests.ts"],
          globals: true,
          include: testProjects.unit.include,
          exclude: [...testProjects.unit.exclude, ...testProjects.pyodide.include],
          sequence: {
            groupOrder: 0,
          },
        },
      },
      {
        test: {
          name: "pyodide",
          environment: "jsdom",
          setupFiles: ["./src/setupTests.ts"],
          globals: true,
          include: testProjects.pyodide.include,
          fileParallelism: true,
          maxWorkers: 3,
          testTimeout: 120000,
          hookTimeout: 180000,
          sequence: {
            groupOrder: 1,
          },
        },
      },
    ],
  },
});
