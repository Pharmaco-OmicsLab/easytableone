import { expect, test, type Browser, type Page, type Response } from '@playwright/test';
import { access, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { regenerateSummary } from '../../scripts/bench/summary.mjs';
import {
  dismissWelcome,
  proceedFromSchema,
  resolveAmbiguousTypes,
  skipDictionary,
  uploadDataset,
  waitForEngine,
} from '../e2e/helpers/workflow';

type Memory = { wasmPeakMB: number | null; jsHeapMB: number | null };
type Run = {
  dataset: string;
  repetition: number;
  rowCount: number;
  inputColumnCount: number;
  baselineVariableCount: number;
  baselineVariables: string[];
  grouping: string;
  modelOutcome: string | null;
  modelPredictors: string[];
  sizeGateAppeared: boolean;
  sizeGateAcknowledged: boolean;
  status: string;
  stageReached: string;
  error?: string;
  coldLoadBytes?: number;
  timings: Record<string, number>;
  memory: Record<string, Memory>;
};

const diabetesVariables = [
  'time_in_hospital', 'num_lab_procedures', 'num_procedures', 'num_medications',
  'number_outpatient', 'number_emergency', 'number_inpatient', 'number_diagnoses',
  'race', 'gender', 'age', 'max_glu_serum', 'A1Cresult', 'metformin', 'insulin',
  'change', 'diabetesMed', 'medical_specialty_grouped',
];
const diabetesPredictors = [
  'age', 'time_in_hospital', 'num_lab_procedures', 'num_medications',
  'number_inpatient', 'number_emergency', 'number_diagnoses', 'A1Cresult',
  'insulin', 'diabetesMed',
];
const hfVariables = [
  'age', 'anaemia', 'creatinine_phosphokinase', 'diabetes', 'ejection_fraction',
  'high_blood_pressure', 'platelets', 'serum_creatinine', 'serum_sodium', 'sex', 'smoking',
];
const datasets = [
  { id: 'HF', file: 'heart_failure_clinical_records_dataset.csv', rows: 299, inputColumns: 13, grouping: 'DEATH_EVENT', variables: hfVariables, outcome: 'DEATH_EVENT', predictors: hfVariables, model: true, thorough: true },
  { id: 'Diabetes 20k', file: 'diabetes20k.csv', rows: 20000, inputColumns: 30, grouping: 'readmitted', variables: diabetesVariables, outcome: 'readmitted_30d', predictors: diabetesPredictors, model: true, thorough: true },
  { id: 'Diabetes 70k', file: 'diabetes70k.csv', rows: 69973, inputColumns: 30, grouping: 'readmitted', variables: diabetesVariables, outcome: 'readmitted_30d', predictors: diabetesPredictors, model: true, thorough: false },
] as const;

const outputDir = path.resolve('validation/benchmarks');
const baseURL = 'http://localhost:4173/easytableone/';
const machine = {
  hostname: os.hostname(), cpuModel: os.cpus()[0]?.model ?? 'unknown', cores: os.cpus().length,
  totalMemoryBytes: os.totalmem(), platform: os.platform(), release: os.release(),
};
let results: Run[] = [];

function reportPath(browser: Browser) {
  return path.join(outputDir,
    `${new Date().toISOString().slice(0, 10)}_${test.info().project.name.replace('bench-', '')}_${os.hostname().replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

async function persist(browser: Browser) {
  await mkdir(outputDir, { recursive: true });
  const outputFile = reportPath(browser);
  let earlierRuns: Run[] = [];
  try {
    earlierRuns = JSON.parse(await readFile(outputFile, 'utf8')).runs ?? [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const runsByRepetition = new Map<string, Run>();
  for (const run of [...earlierRuns, ...results]) runsByRepetition.set(`${run.dataset}\0${run.repetition}`, run);
  const report = {
    kind: process.env.ETO_BENCH_SMOKE === '1' ? 'environment-smoke' : 'author-benchmark',
    generatedAt: new Date().toISOString(),
    browser: { name: test.info().project.name.replace('bench-', ''), version: browser.version() },
    machine,
    protocol: { tableRepetitions: 5, fastModelRepetitions: 3, thoroughModelRepetitions: 1, warmCache: 'second navigation in same fresh context' },
    runs: [...runsByRepetition.values()],
  };
  await writeFile(outputFile, JSON.stringify(report, null, 2) + '\n');
  await regenerateSummary(outputDir);
}

async function memory(page: Page, run: Run, stage: string) {
  const values = await page.evaluate(async () => {
    const probe = (window as Window & { __etoBench?: { getMemoryStats: () => Promise<{ wasmBytes: number | null; jsHeapBytes: number | null }> } }).__etoBench;
    if (!probe) throw new Error('Benchmark memory probe unavailable: check ?bench=1');
    return probe.getMemoryStats();
  });
  run.memory[stage] = {
    wasmPeakMB: values.wasmBytes === null ? null : values.wasmBytes / 1_000_000,
    jsHeapMB: values.jsHeapBytes === null ? null : values.jsHeapBytes / 1_000_000,
  };
}

async function elapsed(run: Run, key: string, task: () => Promise<void>) {
  const started = performance.now();
  await task();
  run.timings[key] = (performance.now() - started) / 1000;
}

async function configureBaseline(page: Page, dataset: typeof datasets[number]) {
  await page.locator('#grouping-select').selectOption(dataset.grouping);
  await page.getByRole('button', { name: 'Clear all', exact: true }).click();
  for (const name of dataset.variables) {
    const input = page.locator(`label:has(span[title="${name}"]) input[type="checkbox"]`).first();
    await expect(input, `baseline variable ${name} must be selectable`).toBeVisible();
    await input.check();
  }
  const selected = await page.locator('label:has(span[title]) input[type="checkbox"]:checked').count();
  expect(selected).toBe(dataset.variables.length);
  const groupWarning = page.getByText('I acknowledge this group size warning and want to proceed');
  if (await groupWarning.isVisible()) await groupWarning.locator('..').locator('input[type="checkbox"]').check();
}

async function runModel(page: Page, run: Run, dataset: typeof datasets[number], fast: boolean) {
  if (fast) {
    // The label can include an eligibility hint, so avoid an exact accessible-name match.
    const outcome = page.getByLabel('Outcome');
    await expect(outcome).toBeVisible();
    const outcomeOptions = await outcome.locator('option').evaluateAll((options) =>
      options.map((option) => (option as HTMLOptionElement).value));
    if (!outcomeOptions.includes(dataset.outcome!)) {
      throw new Error(`Expected modeling outcome ${dataset.outcome}; available options: ${outcomeOptions.join(', ')}`);
    }
    await outcome.selectOption(dataset.outcome!);
    if (dataset.id !== 'HF') await page.getByLabel('Event to model', { exact: true }).selectOption('Yes');
    // The bulk button toggles: it reads "Select all" unless every eligible predictor is already selected.
    const selectAll = page.getByRole('button', { name: 'Select all', exact: true });
    if (await selectAll.isVisible()) await selectAll.click();
    await page.getByRole('button', { name: 'Clear all', exact: true }).click();
    for (const name of dataset.predictors) {
      const input = page.locator(`label:has(span[title="${name}"]) input[type="checkbox"]`).first();
      await expect(input, `model predictor ${name} must be selectable`).toBeVisible();
      await input.check();
    }
  }
  await page.getByRole('button', { name: 'Ridge', exact: true }).click();
  const fastCheck = page.getByRole('checkbox', { name: 'Fast validation' });
  if (fast) await fastCheck.check(); else await fastCheck.uncheck();
  const button = page.getByRole('button', { name: 'Run logistic regression' });
  await elapsed(run, fast ? 'modelFast_s' : 'modelThorough_s', async () => {
    await button.click();
    await expect(page.getByRole('button', { name: 'Running...' })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole('button', { name: 'Run logistic regression' })).toBeEnabled({ timeout: 30 * 60 * 1000 });
    await expect(page.getByText('Adjusted model', { exact: true })).toBeVisible();
  });
  await memory(page, run, fast ? 'modelFast' : 'modelThorough');
}

for (const dataset of datasets) {
  test(`${dataset.id} benchmark`, async ({ browser }) => {
    const repetitions = process.env.ETO_BENCH_SMOKE === '1' ? 1 : 5;
    // Allow every repetition to finish its bounded 20-minute statistics and 30-minute
    // modeling waits; stage timeouts are recorded and the loop advances to the next run.
    test.setTimeout(4 * 60 * 60 * 1000);
    for (let repetition = 1; repetition <= repetitions; repetition++) {
      if (dataset.id === 'HF' && repetition === 1) {
        results = [];
        await rm(reportPath(browser), { force: true });
      }
      const run: Run = {
        dataset: dataset.id, repetition, rowCount: dataset.rows,
        inputColumnCount: dataset.inputColumns,
        baselineVariableCount: dataset.variables.length + 1,
        baselineVariables: [...dataset.variables], grouping: dataset.grouping,
        modelOutcome: dataset.model ? dataset.outcome : null,
        modelPredictors: [...dataset.predictors],
        sizeGateAppeared: false, sizeGateAcknowledged: false,
        status: 'ok', stageReached: 'starting', timings: {}, memory: {},
      };
      const context = await browser.newContext({ acceptDownloads: true, baseURL });
      const page = await context.newPage();
      let crashed = false;
      page.on('crash', () => { crashed = true; });
      try {
        const coldResponses: Response[] = [];
        const onResponse = (response: Response) => coldResponses.push(response);
        context.on('response', onResponse);
        run.stageReached = 'coldLoad';
        await elapsed(run, 'coldLoad_s', async () => {
          await page.goto('./?bench=1');
          await waitForEngine(page);
        });
        context.off('response', onResponse);
        const sizes = await Promise.all(coldResponses.map(async (response) => {
          try {
            const size = await response.request().sizes();
            return size.responseBodySize + size.responseHeadersSize;
          } catch { return 0; }
        }));
        run.coldLoadBytes = sizes.reduce((sum, size) => sum + size, 0);
        await memory(page, run, 'coldLoad');

        run.stageReached = 'warmLoad';
        await elapsed(run, 'warmLoad_s', async () => {
          await page.reload();
          await waitForEngine(page);
        });
        await memory(page, run, 'warmLoad');
        await dismissWelcome(page);

        run.stageReached = 'import';
        await elapsed(run, 'import_s', async () => {
          await uploadDataset(page, path.resolve('bench-data', dataset.file));
          await skipDictionary(page);
          const importTimeout = dataset.rows >= 150000 ? 15 * 60 * 1000 : dataset.rows >= 70000 ? 10 * 60 * 1000 : 2 * 60 * 1000;
          await expect(page.getByTestId('schema-proceed')).toBeVisible({ timeout: importTimeout });
        });
        await memory(page, run, 'import');
        await resolveAmbiguousTypes(page);
        await proceedFromSchema(page);
        await expect(page.getByRole('button', { name: /I acknowledge these issues and want to proceed|Proceed/, exact: true }).first()).toBeVisible();
        await memory(page, run, 'qa');

        run.stageReached = 'qaToPlan';
        await elapsed(run, 'qaToPlan_s', async () => {
          const reasons = page.locator('textarea[placeholder^="Example: reviewed source file"]');
          for (let i = 0; i < await reasons.count(); i++) await reasons.nth(i).fill('Benchmark: review acknowledged; no data modification.');
          const acknowledge = page.getByRole('button', { name: 'I acknowledge these issues and want to proceed' });
          if (await acknowledge.isVisible()) await acknowledge.click();
          await page.getByTestId('qa-proceed').click();
          await expect(page.locator('#grouping-select')).toBeVisible();
        });
        await memory(page, run, 'plan');
        await configureBaseline(page, dataset);

        run.stageReached = 'statistics';
        await elapsed(run, 'stats_s', async () => {
          await page.getByTestId('plan-run-statistics').click();
          await expect(page.getByTestId('stats-continue-format-export')).toBeVisible({ timeout: 20 * 60 * 1000 });
        });
        await memory(page, run, 'statistics');
        await page.getByTestId('stats-continue-format-export').click();
        run.stageReached = 'docxExport';
        await elapsed(run, 'docxExport_s', async () => {
          const downloadPromise = page.waitForEvent('download');
          await page.locator('#download-docx').click();
          const download = await downloadPromise;
          const file = await download.path();
          expect((await stat(file!)).size).toBeGreaterThan(0);
        });
        run.timings.baselineTable_s = run.timings.import_s + run.timings.qaToPlan_s + run.timings.stats_s + run.timings.docxExport_s;
        await memory(page, run, 'export');

        if (dataset.model && repetition <= 3) {
          run.stageReached = 'modelFast';
          await page.getByRole('button', { name: /6\. Modeling/ }).first().click();
          await expect(page.getByRole('heading', { name: 'Modeling', exact: true })).toBeVisible();
          await runModel(page, run, dataset, true);
          if (dataset.thorough && repetition === 1) {
            run.stageReached = 'modelThorough';
            await runModel(page, run, dataset, false);
          }
        }
        if (!dataset.model && dataset.rows >= 150000) {
          await page.getByRole('button', { name: /6\. Modeling/ }).first().click();
          const gate = page.getByRole('checkbox', { name: /I understand this may be slow or crash/i });
          run.sizeGateAppeared ||= await gate.isVisible();
          if (await gate.isVisible()) {
            await gate.check();
            run.sizeGateAcknowledged = true;
          }
        }
        run.stageReached = 'complete';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const timedOut = error instanceof Error && error.name === 'TimeoutError' || /timeout|timed out/i.test(message);
        run.status = crashed ? 'crash' : timedOut ? 'timeout' : 'error';
        run.error = message.slice(0, 1000);
      } finally {
        results.push(run);
        await persist(browser);
        await context.close().catch(() => {});
      }
    }
    // An app crash or OOM is preserved as data. The HF smoke acceptance additionally
    // checks the JSON for a completed run with a non-null WebAssembly measurement.
  });
}

test('Synthetic 150k upload is rejected by the row limit when the file is present', async ({ browser }) => {
  const filePath = path.resolve('bench-data/synthetic150k.csv');
  let filePresent = true;
  try {
    await access(filePath);
  } catch {
    filePresent = false;
  }
  test.skip(!filePresent, 'synthetic150k.csv is optional and is not present');

  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  const run: Run = {
    dataset: 'Synthetic 150k', repetition: 1, rowCount: 150000,
    inputColumnCount: 30, baselineVariableCount: 19, baselineVariables: [], grouping: 'readmitted',
    modelOutcome: null, modelPredictors: [], sizeGateAppeared: false, sizeGateAcknowledged: false,
    status: 'rejected-by-limit', stageReached: 'upload', timings: {}, memory: {},
  };
  try {
    await page.goto('./?bench=1');
    await waitForEngine(page);
    await dismissWelcome(page);
    await page.locator('#fileInput').setInputFiles(filePath);
    const limitMessage = page.getByText(/150,000 data rows.*100,000-row limit/);
    await expect(limitMessage).toBeVisible({ timeout: 120_000 });
    await expect(page.getByRole('button', { name: 'Continue to sheet & header' })).toBeDisabled();
    run.error = await limitMessage.textContent() ?? undefined;
  } catch (error) {
    run.status = 'error';
    run.error = (error instanceof Error ? error.message : String(error)).slice(0, 1000);
  } finally {
    results.push(run);
    await persist(browser);
    await context.close().catch(() => {});
  }
  expect(run.status).toBe('rejected-by-limit');
});
