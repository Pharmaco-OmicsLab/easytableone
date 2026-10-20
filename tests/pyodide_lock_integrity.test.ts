import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PYODIDE_VERSION, PYTHON_RUNTIME_VERSION } from '../src/core/runtimeEnvironment';

/**
 * Verifies that the numpy wheel file on disk matches the SHA-256 recorded
 * in pyodide-lock.json. This guards against:
 *   1. Re-extracting the tarball without re-applying the patch.
 *   2. The lock file being updated without updating the actual wheel.
 *
 * LFS-aware (Step 7b.7.1): the numpy wheel is Git-LFS-tracked, so a fresh
 * clone before `git lfs pull` will have a 130-byte pointer file in place of
 * the binary. When that's the case we parse the pointer's `oid sha256:` line
 * and use that as the "actual" SHA — LFS guarantees the OID is the SHA-256
 * of the original binary content. This means the integrity check still works
 * on un-hydrated checkouts.
 *
 * If this test fails, run: node scripts/patch-pyodide-lock.cjs
 */

const LFS_POINTER_MAGIC = 'version https://git-lfs.github.com/spec/v1';

interface ResolvedSha {
  sha256: string;
  source: 'lfs-pointer' | 'binary';
}

/**
 * Compute the canonical SHA-256 for a wheel-or-pointer file on disk.
 * If the contents are an LFS pointer, return the OID from the pointer header.
 * Otherwise return SHA-256 of the raw bytes.
 *
 * @param contents Raw bytes read from the wheel path.
 * @param wheelPath Path used only for error messages.
 * @throws When the file looks like an LFS pointer but has no parsable OID line.
 */
export function resolveWheelSha(contents: Buffer, wheelPath: string): ResolvedSha {
  const head = contents.slice(0, LFS_POINTER_MAGIC.length).toString('utf8');
  if (head.startsWith(LFS_POINTER_MAGIC)) {
    const text = contents.toString('utf8');
    const m = text.match(/^oid sha256:([0-9a-f]{64})$/m);
    if (!m) {
      throw new Error(
        `Wheel file ${wheelPath} appears to be a Git-LFS pointer but no ` +
          `'oid sha256:<64-hex>' line was found. Run 'git lfs pull' to hydrate, ` +
          `or check the pointer's format.`,
      );
    }
    return { sha256: m[1], source: 'lfs-pointer' };
  }
  return {
    sha256: createHash('sha256').update(contents).digest('hex'),
    source: 'binary',
  };
}

describe('pyodide-lock.json integrity', () => {
  const PYODIDE_DIR = resolve(process.cwd(), 'public/pyodide-314.0.0a1');
  const LOCK_PATH = resolve(PYODIDE_DIR, 'pyodide-lock.json');

  it('keeps source runtime metadata synchronized with the public lock file', () => {
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));

    expect(PYODIDE_VERSION).toBe(lock.info.version);
    expect(PYTHON_RUNTIME_VERSION).toBe(lock.info.python);
  });

  it('numpy lock entry sha256 matches the on-disk wheel file (LFS-aware)', () => {
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    const numpyEntry = lock.packages?.numpy;

    expect(numpyEntry, 'numpy entry must exist in pyodide-lock.json').toBeTruthy();

    const { file_name, sha256 } = numpyEntry;
    expect(file_name, 'numpy file_name must be defined').toBeTruthy();
    expect(sha256, 'numpy sha256 must be defined').toBeTruthy();

    const wheelPath = resolve(PYODIDE_DIR, file_name);
    let wheelData: Buffer;
    try {
      wheelData = readFileSync(wheelPath);
    } catch {
      throw new Error(
        `numpy wheel not found at ${wheelPath}.\n` +
          `Lock file expects: ${file_name}\n` +
          `Run: node scripts/patch-pyodide-lock.cjs`,
      );
    }

    const { sha256: actualSha256 } = resolveWheelSha(wheelData, wheelPath);
    expect(actualSha256, `SHA-256 mismatch for ${file_name}`).toBe(sha256);
  });

  it('fonttools lock entry uses the browser-computed SRI hash', () => {
    const lock = JSON.parse(readFileSync(LOCK_PATH, 'utf8'));
    const fonttoolsEntry = lock.packages?.fonttools;

    expect(fonttoolsEntry, 'fonttools entry must exist in pyodide-lock.json').toBeTruthy();
    expect(fonttoolsEntry.file_name).toBe('fonttools-4.62.1-py3-none-any.whl');
    expect(fonttoolsEntry.sha256).toBe(
      '7487782e2113861f4ddcc07c3436450659e3caa5e470b27dc2177cade2d8e7fd',
    );
  });
});

describe('resolveWheelSha helper (LFS pointer parsing)', () => {
  it('extracts the OID from a valid LFS pointer', () => {
    const fixturePath = resolve(process.cwd(), 'tests/fixtures/sample-lfs-pointer.bin');
    const data = readFileSync(fixturePath);
    const { sha256, source } = resolveWheelSha(data, fixturePath);
    expect(source).toBe('lfs-pointer');
    expect(sha256).toBe(
      '0608c7657d32cc30896b884a15fb0607a5eacca968bc532fad36a57f4a603ecb',
    );
  });

  it('returns the SHA-256 of binary content when not an LFS pointer', () => {
    const binary = Buffer.from('hello world', 'utf8');
    const { sha256, source } = resolveWheelSha(binary, 'inline');
    expect(source).toBe('binary');
    // Pre-computed: sha256("hello world")
    expect(sha256).toBe(
      'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
    );
  });

  it('throws with a clear message when an LFS pointer has no oid line', () => {
    const broken = Buffer.from(
      'version https://git-lfs.github.com/spec/v1\nsize 12345\n',
      'utf8',
    );
    expect(() => resolveWheelSha(broken, 'broken-pointer')).toThrow(
      /git lfs pull/,
    );
  });
});
