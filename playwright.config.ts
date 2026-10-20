import { defineConfig, devices } from "@playwright/test";

// Four projects:
//  - smoke-dev:     the existing smoke test against the Vite DEV server (http://localhost:5173/).
//  - prod-*:        Phase 51 data-locality spec against the PRODUCTION build served by
//                   `vite preview` (http://localhost:4173/easytableone/), so the CSP header path
//                   and the dedicated worker are exercised.
//
// Playwright's `webServer` is global, not per project. To avoid starting the dev server for the
// production project (and building for the smoke project), the servers are selected from the
// `--project` CLI flags. With no --project flag every server is started.
const requestedProjects: string[] = [];
process.argv.forEach((arg, i, argv) => {
  if (arg.startsWith("--project=")) requestedProjects.push(arg.slice("--project=".length));
  else if (arg === "--project" && argv[i + 1]) requestedProjects.push(argv[i + 1]);
});
const wants = (name: string) => requestedProjects.length === 0 || requestedProjects.includes(name);
const wantsProd = ["prod-chromium", "prod-firefox", "prod-webkit"].some(wants);

// Servers are started through direct binaries, never `pnpm`/`npm run`: pnpm re-verifies
// node_modules before running a script and, offline, can try to reinstall and exit
// (agents.md rules 1–5; seen as webServer exit code 4294963248 on Windows, 2026-10-13).
const VITE = "node node_modules/vite/bin/vite.js";
// PW_PREVIEW_PORT overrides the production preview port (default 4173) when a stale
// preview from an earlier run still holds it and cannot be killed from the agent sandbox.
const PREVIEW_PORT = Number(process.env.PW_PREVIEW_PORT ?? 4173);
const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}/easytableone/`;

const devServer = {
  command: VITE,
  url: "http://localhost:5173",
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
};

const prodServer = {
  // Build first (tsc -b + vite build + dist offline scan), then serve dist with the CSP header.
  // Same chain as `pnpm build && pnpm preview`, via direct binaries.
  command: `node scripts/tsc-build.cjs && ${VITE} build && node scripts/check-dist-offline.mjs && ${VITE} preview --port ${PREVIEW_PORT} --strictPort`,
  url: PREVIEW_URL,
  // Never reuse: a stale preview would silently test an old build.
  reuseExistingServer: false,
  timeout: 600_000,
};

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 0,
  workers: 1,
  use: {
    // retries are 0, so "on-first-retry" never records; keep a trace of every CI failure instead.
    trace: process.env.CI ? "retain-on-failure" : "on-first-retry",
  },
  projects: [
    {
      name: "smoke-dev",
      testIgnore: /data-locality\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:5173",
        ...(process.env.PW_CHROMIUM_CHANNEL ? { channel: process.env.PW_CHROMIUM_CHANNEL } : {}),
      },
    },
    {
      name: "prod-chromium",
      testMatch: /(?:data-locality|small-category-advisory)\.spec\.ts/,
      // PW_CHROMIUM_CHANNEL=chrome runs this project on the locally installed Google Chrome
      // when Playwright's bundled Chromium is not installed (no network to download it).
      use: {
        ...devices["Desktop Chrome"],
        baseURL: PREVIEW_URL,
        ...(process.env.PW_CHROMIUM_CHANNEL ? { channel: process.env.PW_CHROMIUM_CHANNEL } : {}),
      },
    },
    {
      name: "prod-firefox",
      testMatch: /data-locality\.spec\.ts/,
      use: { ...devices["Desktop Firefox"], baseURL: PREVIEW_URL },
    },
    {
      name: "prod-webkit",
      testMatch: /data-locality\.spec\.ts/,
      use: { ...devices["Desktop Safari"], baseURL: PREVIEW_URL },
    },
  ],
  webServer: [...(wants("smoke-dev") ? [devServer] : []), ...(wantsProd ? [prodServer] : [])],
});
