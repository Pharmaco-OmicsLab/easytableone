/// <reference lib="webworker" />

// Self-hosted Pyodide distribution — bundles scipy 1.17.0 (R×C fisher_exact).
// Tarball SHA-256: 1B601C50C2105953B5368D026C5EA03391D5E69E5B32990AF573D9E25842B7D7
// pyodide-lock.json has been patched post-extract (numpy file_name/sha256 mismatch
// in the upstream alpha tarball); see scripts/patch-pyodide-lock.cjs and
// public/pyodide-314.0.0a1/README.md for details.
//
// MODULE WORKER. Instantiated with { type: 'module' } at the call site.
// This Pyodide distribution requires module workers; classic workers using
// importScripts() are not supported.
// pyodide.asm.mjs is an ES module; it cannot be loaded via importScripts().

import { PYODIDE_VERSION } from '../core/runtimeEnvironment';
import { compareVersions } from '../core/stats/versionCompare';

const PYODIDE_DIRECTORY_TOKEN = '314.0.0a1';
// In production the worker loads from https://easyverse.app/easytableone/assets/…
// so we strip back to the app root and append the pyodide folder.
const BASE_URL = import.meta.env.BASE_URL; // '/easytableone/' in prod, '/' in dev
const PYODIDE_INDEX_URL = location.origin + BASE_URL + `pyodide-${PYODIDE_DIRECTORY_TOKEN}/`;

let pyodideReadyPromise: Promise<any> | null = null;
let pyodide: any = null;

async function initPyodide() {
  const t0 = performance.now();

  // Dynamic import with @vite-ignore: the vendored pyodide.mjs is a
  // public/ asset served at runtime, not a module Vite should resolve
  // at build time. The /* @vite-ignore */ directive tells Vite to emit
  // the import() call verbatim without attempting to bundle it.
  const pyodideModule = await import(
    /* @vite-ignore */ PYODIDE_INDEX_URL + 'pyodide.mjs'
  );
  const loadPyodide = pyodideModule.loadPyodide;
  if (typeof loadPyodide !== 'function') {
    throw new Error(
      `pyodide.mjs at ${PYODIDE_INDEX_URL} did not export loadPyodide. ` +
      `Verify the vendored distribution.`
    );
  }

  pyodide = await loadPyodide({ indexURL: PYODIDE_INDEX_URL });
  await pyodide.loadPackage(['scipy', 'statsmodels', 'numpy', 'pandas', 'matplotlib', 'fonttools', 'scikit-learn']);

  // Fetch and extract Seaborn wheel
  try {
    const seabornRes = await fetch(PYODIDE_INDEX_URL + 'extra-wheels/seaborn-0.13.2-py3-none-any.whl');
    const seabornBuffer = await seabornRes.arrayBuffer();
    pyodide.FS.writeFile('/seaborn-0.13.2-py3-none-any.whl', new Uint8Array(seabornBuffer));
    await pyodide.runPythonAsync(`
      import sys
      import zipfile
      site_pkgs = [p for p in sys.path if 'site-packages' in p][0]
      with zipfile.ZipFile('/seaborn-0.13.2-py3-none-any.whl', 'r') as zf:
          zf.extractall(site_pkgs)
    `);
  } catch (err) {
    console.error('Failed to load/extract Seaborn wheel in worker:', err);
  }

  // Fetch and extract scikit-posthocs wheel
  try {
    const scikitPosthocsRes = await fetch(PYODIDE_INDEX_URL + 'extra-wheels/scikit_posthocs-0.14.0-py3-none-any.whl');
    const scikitPosthocsBuffer = await scikitPosthocsRes.arrayBuffer();
    pyodide.FS.writeFile('/scikit_posthocs-0.14.0-py3-none-any.whl', new Uint8Array(scikitPosthocsBuffer));
    await pyodide.runPythonAsync(`
      import sys
      import zipfile
      site_pkgs = [p for p in sys.path if 'site-packages' in p][0]
      with zipfile.ZipFile('/scikit_posthocs-0.14.0-py3-none-any.whl', 'r') as zf:
          zf.extractall(site_pkgs)
    `);
  } catch (err) {
    console.error('Failed to load/extract scikit-posthocs wheel in worker:', err);
  }

  // Fetch and extract tabulate wheel (firthlogist import dependency)
  try {
    const tabulateRes = await fetch(PYODIDE_INDEX_URL + 'extra-wheels/tabulate-0.10.0-py3-none-any.whl');
    const tabulateBuffer = await tabulateRes.arrayBuffer();
    pyodide.FS.writeFile('/tabulate-0.10.0-py3-none-any.whl', new Uint8Array(tabulateBuffer));
    await pyodide.runPythonAsync(`
      import sys
      import zipfile
      site_pkgs = [p for p in sys.path if 'site-packages' in p][0]
      with zipfile.ZipFile('/tabulate-0.10.0-py3-none-any.whl', 'r') as zf:
          zf.extractall(site_pkgs)
    `);
  } catch (err) {
    console.error('Failed to load/extract tabulate wheel in worker:', err);
  }

  // Fetch and extract firthlogist wheel
  try {
    const firthlogistRes = await fetch(PYODIDE_INDEX_URL + 'extra-wheels/firthlogist-0.5.0-py3-none-any.whl');
    const firthlogistBuffer = await firthlogistRes.arrayBuffer();
    pyodide.FS.writeFile('/firthlogist-0.5.0-py3-none-any.whl', new Uint8Array(firthlogistBuffer));
    await pyodide.runPythonAsync(`
      import sys
      import zipfile
      site_pkgs = [p for p in sys.path if 'site-packages' in p][0]
      with zipfile.ZipFile('/firthlogist-0.5.0-py3-none-any.whl', 'r') as zf:
          zf.extractall(site_pkgs)
    `);
  } catch (err) {
    console.error('Failed to load/extract firthlogist wheel in worker:', err);
  }

  // Fetch and register DejaVu Sans font
  try {
    const fontRes = await fetch(PYODIDE_INDEX_URL + 'fonts/DejaVuSans.ttf');
    const fontBuffer = await fontRes.arrayBuffer();
    pyodide.FS.writeFile('/DejaVuSans.ttf', new Uint8Array(fontBuffer));
    await pyodide.runPythonAsync(`
      import matplotlib as mpl
      import matplotlib.font_manager as fm
      fm.fontManager.addfont('/DejaVuSans.ttf')
      mpl.rcParams['font.family'] = 'DejaVu Sans'
    `);
  } catch (err) {
    console.error('Failed to load/register DejaVu Sans font in worker:', err);
  }

  const t1 = performance.now();
  console.log(`Pyodide cold start: ${((t1 - t0) / 1000).toFixed(1)}s`);

  const scipyVersion: string = pyodide.runPython(`import scipy; scipy.__version__`);
  if (compareVersions(String(scipyVersion), '1.15.0') < 0) {
    throw new Error(
      `Loaded scipy ${scipyVersion}, expected >= 1.15.0. ` +
      `Check that the vendored Pyodide distribution at ${PYODIDE_INDEX_URL} ` +
      `contains the expected scientific package set.`
    );
  }
  console.log(`Pyodide ${PYODIDE_VERSION} ready. scipy ${scipyVersion}.`);
  return pyodide;
}

pyodideReadyPromise = initPyodide();

self.onmessage = async (event: MessageEvent) => {
  const { id, fnName, args } = event.data;

  if (fnName === 'ping') {
    (self as any).postMessage({ id, result: 'pong' });
    return;
  }

  try {
    const py = await pyodideReadyPromise;
    if (!py) throw new Error('Pyodide not initialized');

    if (fnName === 'check_ready') {
      (self as any).postMessage({ id, result: true });
      return;
    }

    if (fnName === 'run_python') {
      let result = await py.runPythonAsync(args[0]);
      if (result && typeof result.toJs === 'function') {
        result = result.toJs();
      }
      (self as any).postMessage({ id, result });
      return;
    }

    const fn = py.globals.get(fnName);
    if (fn) {
      let result = fn(...(args || []));
      if (result && typeof result.toJs === 'function') {
        result = result.toJs();
      }
      (self as any).postMessage({ id, result });
    } else {
      throw new Error(`Function ${fnName} not found`);
    }
  } catch (error: any) {
    (self as any).postMessage({ id, error: error?.message ?? String(error) });
  }
};
