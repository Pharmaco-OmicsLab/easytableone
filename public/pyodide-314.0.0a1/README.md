# Vendored Pyodide 314.0.0a1

This directory holds the vendored Pyodide distribution as per **D34**
(self-hosted, version-pinned Pyodide).

## What is here

Pyodide 314.0.0a1 (the 0.30 pre-release), extracted from the upstream
tarball. Bundles **scipy 1.17.0** with R×C `fisher_exact` support.

## Original tarball

```
Filename : pyodide-314.0.0a1.tar.bz2
SHA-256  : 1B601C50C2105953B5368D026C5EA03391D5E69E5B32990AF573D9E25842B7D7
```

## Lock-file patch

`pyodide-lock.json` has been **hand-patched** relative to the upstream
tarball because the alpha tarball ships an inconsistent numpy entry: the
`file_name` references `pyemscripten_2026_0_wasm32.whl` but only the
`pyodide_2026_0_wasm32.whl` variant is present in the distribution.

### What was changed

| Field | Original (upstream) | Patched |
|-------|---------------------|---------|
| `packages.numpy.file_name` | `numpy-2.4.3-cp314-cp314-pyemscripten_2026_0_wasm32.whl` | `numpy-2.4.3-cp314-cp314-pyodide_2026_0_wasm32.whl` |
| `packages.numpy.sha256` | `a1a613dc...` | `0608c765...` |

All other entries are unmodified from the upstream tarball.

> **SHA value corrected in Round 7b Session B (2026-05-11).** Round 6b's
> initial patch wrote `9c37baca…` as the patched SHA, which did not match
> the actual on-disk wheel. The integrity test (`tests/pyodide_lock_integrity.test.ts`)
> caught the drift; the correct value above (`0608c765…`) is the SHA-256
> of the wheel as distributed in the tarball. Pyodide does not validate
> in-lock SHAs against locally-served bytes at runtime, so the mismatch
> was runtime-invisible until the test was added.

## Re-extraction procedure

If you need to re-extract the tarball (e.g., for a Pyodide upgrade):

```bash
# 1. Extract the tarball into public/
tar -xjf pyodide-314.0.0a1.tar.bz2 -C public/

# 2. Re-apply the numpy lock-file patch
node scripts/patch-pyodide-lock.cjs
```

The patch script is idempotent — it is safe to run multiple times.

> **Note**: This patch becomes **obsolete** once a stable Pyodide 0.30.x
> is released with a consistent lock file. When upgrading, verify that
> `pyodide-lock.json` entries match the files actually present before
> deciding whether to apply this patch.
