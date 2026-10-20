import { defineConfig, devices } from '@playwright/test';

// Deliberate benchmark only. Production preview runs the current build; the author prepares
// it with pnpm build before invoking pnpm bench. Never reuse an unrelated running preview.
const baseURL = 'http://localhost:4173/easytableone/';

export default defineConfig({
  testDir: './tests/bench',
  timeout: 45 * 60 * 1000,
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: { baseURL, actionTimeout: 120_000, navigationTimeout: 180_000 },
  projects: [
    { name: 'bench-chromium', use: { ...devices['Desktop Chrome'], baseURL } },
    { name: 'bench-firefox', use: { ...devices['Desktop Firefox'], baseURL } },
    { name: 'bench-webkit', use: { ...devices['Desktop Safari'], baseURL } },
  ],
  webServer: {
    command: 'node ./node_modules/vite/bin/vite.js preview --port 4173 --strictPort',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
