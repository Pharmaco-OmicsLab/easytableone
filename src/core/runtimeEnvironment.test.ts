import { describe, expect, it } from "vitest";
import { PYODIDE_VERSION, PYTHON_RUNTIME_VERSION, pyodideRuntimeLabel } from "./runtimeEnvironment";

describe("runtimeEnvironment", () => {
  it("exposes the current Pyodide and CPython versions", () => {
    expect(PYODIDE_VERSION).toBe("0.30.0.dev0");
    expect(PYTHON_RUNTIME_VERSION).toBe("3.14.0");
  });

  it("reports the real Pyodide release, not the vendored directory token", () => {
    expect(pyodideRuntimeLabel()).toBe(
      "Pyodide 0.30.0.dev0 (CPython 3.14.0, WebAssembly, in-browser; no server)",
    );
    expect(pyodideRuntimeLabel()).not.toContain("314.0.0a1");
    expect(pyodideRuntimeLabel()).not.toContain("314.0.0");
  });
});
