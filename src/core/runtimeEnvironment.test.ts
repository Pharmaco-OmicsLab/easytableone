import { describe, expect, it } from "vitest";
import pyodideLock from "../../public/pyodide-314.0.0a1/pyodide-lock.json";
import { PYODIDE_VERSION, PYTHON_RUNTIME_VERSION, pyodideRuntimeLabel } from "./runtimeEnvironment";

describe("runtimeEnvironment", () => {
  it("derives runtime versions from the vendored Pyodide lock file", () => {
    expect(PYODIDE_VERSION).toBe(pyodideLock.info.version);
    expect(PYTHON_RUNTIME_VERSION).toBe(pyodideLock.info.python);
  });

  it("reports the real Pyodide release, not the vendored directory token", () => {
    expect(pyodideRuntimeLabel()).toBe(
      "Pyodide 0.30.0.dev0 (CPython 3.14.0, WebAssembly, in-browser; no server)",
    );
    expect(pyodideRuntimeLabel()).not.toContain("314.0.0a1");
    expect(pyodideRuntimeLabel()).not.toContain("314.0.0");
  });
});
