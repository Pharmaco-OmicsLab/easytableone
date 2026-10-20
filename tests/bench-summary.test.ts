import { describe, expect, it } from 'vitest';
import { latestReportsPerBrowser, rangeCell, renderSummary } from '../scripts/bench/summary.mjs';

const fixture = {
  browser: { name: 'Chromium', version: 'fixture' },
  machine: { hostname: 'fixture-host', cpuModel: 'fixture CPU', cores: 8, totalMemoryBytes: 16 * 1024 ** 3, platform: 'win32', release: 'fixture' },
  runs: [
    { dataset: 'HF', repetition: 1, rowCount: 299, inputColumnCount: 13, baselineVariableCount: 12, status: 'ok', timings: { coldLoad_s: 1, baselineTable_s: 4, modelFast_s: 8, modelThorough_s: 12 }, memory: { import: { wasmPeakMB: 300 }, export: { wasmPeakMB: 600 } } },
    { dataset: 'HF', repetition: 2, rowCount: 299, inputColumnCount: 13, baselineVariableCount: 12, status: 'ok', timings: { coldLoad_s: 2, baselineTable_s: 5, modelFast_s: 9 }, memory: { import: { wasmPeakMB: 350 }, export: { wasmPeakMB: 700 } } },
    { dataset: 'HF', repetition: 3, rowCount: 299, inputColumnCount: 13, baselineVariableCount: 12, status: 'crash', stageReached: 'statistics', timings: {}, memory: {} },
  ],
};

describe('browser benchmark summary', () => {
  it('reports median and observed range without treating a failure as a zero', () => {
    expect(rangeCell([1, 2, undefined, Number.NaN])).toBe('1.5 (1–2) s');
    const summary = renderSummary([fixture]);
    expect(summary).toContain('| Heart Failure | 299 × 12 | 1.5 (1–2) s | 4.5 (4–5) s | 8.5 (8–9) s / 12 (12–12) s | 650 (600–700) MB |');
    expect(summary).toContain('HF, repetition 3: crash at statistics');
    expect(summary).toContain('WebAssembly linear memory is the headline memory measure');
  });

  it('keeps only the newest report per browser', () => {
    const stale = { ...fixture, generatedAt: '2026-10-10T12:00:00.000Z', machine: { ...fixture.machine, hostname: 'stale-host' } };
    const latestChromium = { ...fixture, generatedAt: '2026-10-11T12:00:00.000Z' };
    const firefox = { ...fixture, generatedAt: '2026-10-09T12:00:00.000Z', browser: { name: 'Firefox', version: 'fixture' } };

    expect(latestReportsPerBrowser([stale, latestChromium, firefox])).toEqual([latestChromium, firefox]);
    const summary = renderSummary([stale, latestChromium, firefox]);
    expect(summary.match(/^## Chromium /gm)).toHaveLength(1);
    expect(summary).not.toContain('stale-host');
    expect(summary).toContain('## Firefox fixture');
  });
});
