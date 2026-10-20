This document describes how to build, test, and release EasyTableOne.
It describes release v3.40 (Phase 51 Round 3 Part A).

# Developing

## Prerequisites and local run

Use Node.js 22, pnpm 10, and Git. Git LFS is required only in the draft repository that stores large source assets; the public mirror contains release assets.

```bash
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview -- --base /easytableone/
```

The scientific runtime is vendored under `public/pyodide-314.0.0a1/`; its manifest and lock checks pin the distribution and extra wheel hashes. To add a wheel, obtain an approved compatible wheel, place it in `extra-wheels/`, record its SHA-256 and package/version in `extra-wheels/MANIFEST.md`, then update the worker's local load path and tests. Runtime dependencies must remain local.

Python engine code lives in `src/workers/python/*.py`. `pyodide.worker.ts` loads the same-origin runtime and wheels; `pyodide.client.ts` exposes application calls to that worker.

## Test and maintenance commands

| Command | Coverage |
|---|---|
| `pnpm test:unit` | Fast Vitest unit and UI tests. |
| `pnpm test:pyodide` | Tests using the real scientific Python runtime. |
| `pnpm test:golden` | Cross-validates summaries against Python `tableone`. |
| `pnpm validation:report` | Regenerates machine-readable validation artefacts. |
| `pnpm test:e2e` | Development-server smoke flow. |
| `pnpm test:e2e:locality` | Production-build online locality gate. |
| `pnpm test:e2e:all` | Smoke and Chromium, Firefox, and WebKit locality projects. |
| `pnpm bench` | Generates benchmark input and runs browser measurements. |
| `pnpm test:inventory` | Reports discovered tests and skips. |
| `pnpm docs:api` | Builds the TypeDoc API reference for the documented public surfaces. |

Use focused Vitest project commands while iterating. Run the Pyodide project once near the end of a change.

## Public mirror release

1. Verify the draft branch, build, browser gates, and validation report.
2. Create the public mirror from the approved release commit, excluding internal planning and manuscript materials.
3. Copy pinned Pyodide distribution and generated public validation artefacts, preserving recorded hashes.
4. Verify the mirror's install, build, links, and offline workflow, then publish the mirror commit.

Keep this procedure aligned with the deployment checklist; internal `_materials/` files are not part of the public mirror.
