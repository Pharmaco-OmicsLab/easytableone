import { describe, expect, it } from 'vitest';
import { getWasmBytes } from './memoryStats';

describe('WebAssembly memory probe', () => {
  it('reads HEAP8 allocation without mutating it', () => {
    const py = { _module: { HEAP8: { buffer: { byteLength: 512 } }, wasmMemory: { buffer: { byteLength: 1024 } } } };
    expect(getWasmBytes(py)).toBe(512);
    expect(py._module.HEAP8.buffer.byteLength).toBe(512);
  });
  it('falls back to wasmMemory when HEAP8 is unavailable', () => {
    expect(getWasmBytes({ _module: { wasmMemory: { buffer: { byteLength: 2048 } } } })).toBe(2048);
    expect(getWasmBytes({})).toBeNull();
  });
});
