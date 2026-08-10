/// <reference types="vitest" />
import fs from "node:fs";
import react from "@vitejs/plugin-react";
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

export default defineConfig({
  base: process.env.NODE_ENV === "production" ? "/easytableone/" : "/",
  plugins: [react()],
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
