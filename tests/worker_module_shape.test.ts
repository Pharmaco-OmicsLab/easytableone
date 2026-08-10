import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('worker files must be module-worker shape', () => {
  const findWorkerFiles = (dir: string, fileList: string[] = []) => {
    const files = readdirSync(dir, { withFileTypes: true });
    for (const file of files) {
      const filePath = join(dir, file.name);
      if (file.isDirectory()) {
        findWorkerFiles(filePath, fileList);
      } else if (file.name.endsWith('.worker.ts')) {
        fileList.push(filePath);
      }
    }
    return fileList;
  };

  const workerFiles = findWorkerFiles('src');

  it('finds at least one worker file', () => {
    expect(workerFiles.length).toBeGreaterThan(0);
  });

  it.each(workerFiles)('%s does not use importScripts (classic-worker only)', (file) => {
    const src = readFileSync(file, 'utf8');
    // importScripts() is the classic-worker bootstrap API. Pyodide 314+
    // does not support it — pyodide.asm.mjs is an ES module.
    // Any reversion to importScripts would break the app at runtime
    // (silently passes pnpm test, fails pnpm dev). This guard catches it
    // statically before the build step runs.
    const offending = src
      .split('\n')
      .map((line, i) => ({ line: line.trimStart(), n: i + 1 }))
      .filter(({ line }) =>
        /^\s*importScripts\s*\(/.test(line) ||
        /\bself\.importScripts\s*\(/.test(line) ||
        /\bglobalThis\.importScripts\s*\(/.test(line)
      );
    expect(
      offending,
      `Classic-worker importScripts() found in module worker:\n` +
        offending.map(o => `  L${o.n}: ${o.line}`).join('\n')
    ).toEqual([]);
  });
});

describe('easytable_stats.py warnings policy', () => {
  it('suppresses only the known degrees-of-freedom RuntimeWarning', () => {
    const src = readFileSync('src/workers/python/easytable_stats.py', 'utf8');

    expect(src).toContain('warnings.filterwarnings(');
    expect(src).toContain('message="Degrees of freedom <= 0 for slice"');
    expect(src).toContain('category=RuntimeWarning');
    expect(src).not.toContain('warnings.filterwarnings("ignore")');
  });

  it("uses one shared heteroscedastic-ANOVA advisory and never recommends Kruskal-Wallis", () => {
    const src = readFileSync('src/workers/python/easytable_stats.py', 'utf8');

    expect(src).toContain('HETEROSCEDASTIC_ANOVA_NOTE =');
    expect(src.match(/notes\.append\(HETEROSCEDASTIC_ANOVA_NOTE\)/g)).toHaveLength(2);
    expect(src).not.toContain('Consider Kruskal-Wallis');
  });
});
