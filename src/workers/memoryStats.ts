/** Read-only probe of Pyodide's current WebAssembly linear-memory allocation. */
export function getWasmBytes(pyodide: {
  _module?: { HEAP8?: { buffer?: { byteLength: number } }; wasmMemory?: { buffer?: { byteLength: number } } };
}): number | null {
  return pyodide._module?.HEAP8?.buffer?.byteLength
    ?? pyodide._module?.wasmMemory?.buffer?.byteLength
    ?? null;
}
