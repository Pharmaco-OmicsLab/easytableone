// Keep this source-owned metadata in sync with the public Pyodide lock file.
// The public directory is served unchanged at runtime, so it must not be imported
// into the application bundle. tests/pyodide_lock_integrity.test.ts verifies the
// values below against the vendored lock file. The directory token `314.0.0a1`
// is the CPython build token, not the Pyodide release version.
export const PYODIDE_VERSION = "0.30.0.dev0";
export const PYTHON_RUNTIME_VERSION = "3.14.0";

export function pyodideRuntimeLabel(): string {
  return `Pyodide ${PYODIDE_VERSION} (CPython ${PYTHON_RUNTIME_VERSION}, WebAssembly, in-browser; no server)`;
}
