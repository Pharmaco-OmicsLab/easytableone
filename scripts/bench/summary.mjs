import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATASETS = [
  ['HF', 'Heart Failure'],
  ['Diabetes 20k', 'Diabetes subsample'],
  ['Diabetes 70k', 'Diabetes, full'],
  ['Synthetic 150k', 'Synthetic 150k (limit check)'],
];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function rangeCell(values, unit = 's') {
  const finite = values.filter((value) => Number.isFinite(value));
  if (!finite.length) return '—';
  const format = (value) => Number(value.toFixed(1)).toLocaleString('en-US');
  return `${format(median(finite))} (${format(Math.min(...finite))}–${format(Math.max(...finite))}) ${unit}`;
}

export function latestReportsPerBrowser(reports) {
  const latest = new Map();
  for (const report of reports) {
    const name = report.browser.name;
    const current = latest.get(name);
    const timestamp = Date.parse(report.generatedAt ?? '') || Number.NEGATIVE_INFINITY;
    const currentTimestamp = current ? Date.parse(current.generatedAt ?? '') || Number.NEGATIVE_INFINITY : Number.NEGATIVE_INFINITY;
    if (!current || timestamp >= currentTimestamp) latest.set(name, report);
  }
  return [...latest.values()];
}

export function renderSummary(reports) {
  reports = latestReportsPerBrowser(reports);
  const lines = [
    '# Browser benchmark summary',
    '',
    'User-perceived timings include UI rendering and polling latency. Each cell is median (min–max) of completed stage measurements; failures are listed below.',
    'Warm load navigates again in the same context after its first load, reusing that context’s HTTP cache.',
    '',
  ];
  for (const report of reports) {
    lines.push(`## ${report.browser.name} ${report.browser.version} — ${report.machine.hostname}`);
    lines.push('');
    if (report.kind === 'environment-smoke') lines.push('**Environment smoke only — not reference-laptop or paper results.**', '');
    lines.push(`Machine: ${report.machine.cpuModel}; ${report.machine.cores} cores; ${Math.round(report.machine.totalMemoryBytes / (1024 ** 3))} GiB RAM; ${report.machine.platform} ${report.machine.release}.`);
    lines.push('');
    lines.push('| Dataset | Records × variables | First load (download + start) | Baseline table (import → export) | Modeling, ridge (fast / thorough) | Peak WebAssembly memory |');
    lines.push('| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const [id, label] of DATASETS) {
      const rows = report.runs.filter((run) => run.dataset === id);
      const first = rows[0];
      const dimensions = first ? `${first.rowCount.toLocaleString('en-US')} × ${first.baselineVariableCount}` : '—';
      const value = (key) => rows.map((row) => row.timings?.[key]);
      const firstLoad = id === 'HF' ? rangeCell(value('coldLoad_s')) : '—';
      const table = rangeCell(value('baselineTable_s'));
      const fast = rangeCell(value('modelFast_s'));
      const thorough = rangeCell(value('modelThorough_s'));
      const modeling = id.startsWith('Synthetic') ? '—' : `${fast} / ${thorough}`;
      const peaks = rows.map((row) => {
        const readings = Object.values(row.memory ?? {}).map((m) => m?.wasmPeakMB).filter(Number.isFinite);
        return readings.length ? Math.max(...readings) : undefined;
      });
      const peak = rangeCell(peaks, 'MB');
      lines.push(`| ${label} | ${dimensions} | ${firstLoad} | ${table} | ${modeling} | ${peak} |`);
    }
    lines.push('');
    lines.push('WebAssembly linear memory is the headline memory measure. It grows but does not shrink, so its final size is its peak; Chromium JS heap is recorded separately in JSON and excludes worker memory. First-load transfer bytes and warm-load timings are in JSON.');
    lines.push('');
    const failures = report.runs.filter((run) => run.status !== 'ok' && run.status !== 'rejected-by-limit');
    if (failures.length) {
      lines.push('Failures:');
      for (const failure of failures) lines.push(`- ${failure.dataset}, repetition ${failure.repetition}: ${failure.status} at ${failure.stageReached}${failure.error ? ` — ${failure.error}` : ''}`);
      lines.push('');
    }
  }
  if (!reports.length) lines.push('No benchmark results yet.', '');
  return lines.join('\n');
}

export async function regenerateSummary(directory) {
  const files = (await readdir(directory)).filter((name) => /^\d{4}-\d{2}-\d{2}_.+\.json$/.test(name)).sort();
  const reports = await Promise.all(files.map(async (name) => JSON.parse(await readFile(path.join(directory, name), 'utf8'))));
  const markdown = renderSummary(reports);
  await writeFile(path.join(directory, 'summary.md'), markdown);
  return markdown;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const directory = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('validation/benchmarks');
  await regenerateSummary(directory);
}
