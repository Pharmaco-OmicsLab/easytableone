import pyodideLock from "../../public/pyodide-314.0.0a1/pyodide-lock.json";

// Pyodide distribution version and the CPython version it was built against,
// both read from the vendored pyodide-lock.json so they cannot drift. Note that
// the directory name `pyodide-314.0.0a1` is the CPython 3.14.0a1 token, NOT a
// Pyodide release number. Never report the directory name as the Pyodide version.
export const PYODIDE_VERSION = pyodideLock.info.version;
export const PYTHON_RUNTIME_VERSION = pyodideLock.info.python;

export function pyodideRuntimeLabel(): string {
  return `Pyodide ${PYODIDE_VERSION} (CPython ${PYTHON_RUNTIME_VERSION}, WebAssembly, in-browser; no server)`;
}
