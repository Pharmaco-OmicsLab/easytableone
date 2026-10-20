import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';
import { deterministicSample } from './deterministic-sample.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = path.join(root, 'public/samples');
const output = path.join(root, 'bench-data');

await mkdir(output, { recursive: true });

for (const filename of [
  'heart_failure_clinical_records_dataset.csv',
  'heart_failure_dictionary.csv',
  'diabetes130_dictionary.csv',
]) {
  await copyFile(path.join(source, filename), path.join(output, filename));
}
await copyFile(path.join(source, 'diabetes130_clean.csv'), path.join(output, 'diabetes70k.csv'));

const parsed = Papa.parse(await readFile(path.join(source, 'diabetes130_clean.csv'), 'utf8'), {
  header: true,
  skipEmptyLines: true,
});
if (parsed.errors.length) throw new Error(`Diabetes CSV parse failed: ${parsed.errors[0].message}`);
const rows = parsed.data;
if (rows.length !== 69973) throw new Error(`Expected 69,973 Diabetes rows, found ${rows.length}`);

const writeCsv = (filename, selected) => writeFile(
  path.join(output, filename),
  Papa.unparse({ fields: parsed.meta.fields, data: selected }, { newline: '\n' }) + '\n',
);

await writeCsv('diabetes20k.csv', deterministicSample(rows, 20000, 20260229));
console.log(`Prepared HF and Diabetes 20k/70k in ${output}`);
