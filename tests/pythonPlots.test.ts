import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { pyodideClient } from '../src/workers/pyodide.client';
import { journalRulesets } from '../src/core/format/formatTable';

const themes = Object.fromEntries(
  journalRulesets.EasyTableOne_Ruleset.journals.map((journal) => [journal.journal_id, journal.plot_theme])
);

describe('Python Static Plots Rendering Integration & Visual Regression', () => {
  beforeAll(async () => {
    await pyodideClient.isReady();
  });

  it('renders a continuous variable histogram as base64 PNG', async () => {
    const data = {
      type: 'continuous',
      raw: [
        { val: 1.0, group: 'Group A' },
        { val: 1.5, group: 'Group A' },
        { val: 2.0, group: 'Group B' },
      ],
      qq: {
        points: [{ theoretical: -0.5, sample: 1.0 }, { theoretical: 0.5, sample: 1.5 }],
        lines: [{ x: -1, y: 0.8 }, { x: 1, y: 1.7 }]
      }
    };

    const pngB64 = await pyodideClient.renderThumbnail(data, 'histogram');
    expect(pngB64).toBeDefined();
    expect(pngB64.length).toBeGreaterThan(100);
    expect(pngB64).toMatch(/^[A-Za-z0-9+/=\s]+$/);
  });

  it('renders a continuous variable qqplot as base64 PNG', async () => {
    const data = {
      type: 'continuous',
      raw: [
        { val: 1.0, group: 'Group A' },
        { val: 1.5, group: 'Group A' },
        { val: 2.0, group: 'Group B' },
      ],
      qq: {
        points: [
          { theoretical: -0.5, sample: 1.0, group: 'Group A' },
          { theoretical: 0.5, sample: 1.5, group: 'Group A' },
          { theoretical: 0.0, sample: 2.0, group: 'Group B' },
        ],
        lines: [
          { x: -1, y: 0.8, group: 'Group A' },
          { x: 1, y: 1.7, group: 'Group A' },
          { x: -1, y: 1.5, group: 'Group B' },
          { x: 1, y: 2.5, group: 'Group B' },
        ]
      }
    };

    const pngB64 = await pyodideClient.renderThumbnail(data, 'qqplot');
    expect(pngB64).toBeDefined();
    expect(pngB64.length).toBeGreaterThan(100);
    expect(pngB64).toMatch(/^[A-Za-z0-9+/=\s]+$/);
  });

  it('renders a categorical barchart as base64 PNG', async () => {
    const data = {
      type: 'categorical',
      raw: [
        { val: 'Yes', group: 'Group A' },
        { val: 'No', group: 'Group A' },
        { val: 'Yes', group: 'Group B' },
      ],
    };

    const pngB64 = await pyodideClient.renderThumbnail(data, 'barchart');
    expect(pngB64).toBeDefined();
    expect(pngB64.length).toBeGreaterThan(100);
    expect(pngB64).toMatch(/^[A-Za-z0-9+/=\s]+$/);
  });

  it('renders distinct themed thumbnails for NEJM and Generic', async () => {
    const data = {
      type: 'continuous',
      raw: [
        { val: 1.0, group: 'Group A' },
        { val: 1.5, group: 'Group A' },
        { val: 2.0, group: 'Group B' },
        { val: 2.5, group: 'Group B' },
      ],
      qq: { points: [], lines: [] },
    };

    const nejmPng = await pyodideClient.renderThumbnail(data, 'histogram', themes.NEJM);
    const genericPng = await pyodideClient.renderThumbnail(data, 'histogram', themes.GENERIC);
    expect(nejmPng.length).toBeGreaterThan(100);
    expect(genericPng.length).toBeGreaterThan(100);
    expect(nejmPng).not.toBe(genericPng);
  });

  it('honors thumbnail DPI override dimensions', async () => {
    const data = {
      type: 'continuous',
      raw: [
        { val: 1.0, group: 'All' },
        { val: 1.5, group: 'All' },
        { val: 2.0, group: 'All' },
      ],
      qq: { points: [], lines: [] },
    };

    const pngB64 = await pyodideClient.renderThumbnail(data, 'histogram', themes.GENERIC, 3, 2, 72);
    await pyodideClient.call("run_python", [`dpi_test_b64 = "${pngB64}"`]);
    const shape = await pyodideClient.call("run_python", [`
import io
import base64
import matplotlib.pyplot as plt
img = plt.imread(io.BytesIO(base64.b64decode(dpi_test_b64)), format='png')
tuple(img.shape[:2])
    `]);

    expect(shape[0]).toBe(144);
    expect(shape[1]).toBe(216);
  });

  it('renders publication figures as PDF and SVG with font scaling', async () => {
    const data = {
      type: 'continuous',
      raw: [
        { val: 1.0, group: 'All' },
        { val: 1.5, group: 'All' },
        { val: 2.0, group: 'All' },
      ],
      qq: { points: [], lines: [] },
    };

    const pdfB64 = await pyodideClient.renderPublicationFigure(data, 'histogram', themes.GENERIC, 4, 3, 300, 'pdf', 1.25);
    const svgB64 = await pyodideClient.renderPublicationFigure(data, 'histogram', themes.GENERIC, 4, 3, 300, 'svg', 1.25);
    expect(Buffer.from(pdfB64, 'base64').toString('utf-8', 0, 4)).toBe('%PDF');
    expect(Buffer.from(svgB64, 'base64').toString('utf-8')).toContain('<svg');
  });

  it('smoke-renders a themed thumbnail for every journal', async () => {
    const data = {
      type: 'categorical',
      raw: [
        { val: 'Yes', group: 'Group A' },
        { val: 'No', group: 'Group A' },
        { val: 'Yes', group: 'Group B' },
      ],
    };

    for (const journal of journalRulesets.EasyTableOne_Ruleset.journals) {
      const pngB64 = await pyodideClient.renderThumbnail(data, 'barchart', journal.plot_theme);
      expect(pngB64.length).toBeGreaterThan(100);
    }
  });

  it('fits long categorical thumbnail tick labels without overlap', async () => {
    const data = {
      type: 'categorical',
      raw: Array.from({ length: 18 }, (_, index) => ({
        val: `Very long category label ${index + 1}`,
        group: 'All',
      })),
    };
    await pyodideClient.call('run_python', [`plot_debug_data = ${JSON.stringify(JSON.stringify(data))}`]);
    await pyodideClient.call('run_python', [`plot_debug_theme = ${JSON.stringify(JSON.stringify(themes.GENERIC))}`]);
    const raw = await pyodideClient.call('run_python', [`
import json
theme, dpi = _apply_plot_theme(plot_debug_theme, "figure_dpi_screen", 72)
json.dumps(render_plot(plot_debug_data, "barchart", theme, 3.0, 2.0, dpi, False, "png", True))
    `]);
    const debug = JSON.parse(raw);

    expect(debug.figsize[0]).toBeGreaterThan(3);
    expect(debug.x_tick_overlap).toBe(false);
    expect(debug.x_tick_rotations.some((rotation: number) => rotation > 0)).toBe(true);
  }, 60000);

  it('fits grouped boxplot tick labels without overlap', async () => {
    const data = {
      type: 'continuous',
      raw: [
        { val: 1.0, group: 'Probable severe disease' },
        { val: 1.5, group: 'Probable severe disease' },
        { val: 2.0, group: 'Probable non-severe disease' },
        { val: 2.5, group: 'Probable non-severe disease' },
      ],
    };
    await pyodideClient.call('run_python', [`plot_debug_data = ${JSON.stringify(JSON.stringify(data))}`]);
    await pyodideClient.call('run_python', [`plot_debug_theme = ${JSON.stringify(JSON.stringify(themes.GENERIC))}`]);
    const raw = await pyodideClient.call('run_python', [`
import json
theme, dpi = _apply_plot_theme(plot_debug_theme, "figure_dpi_screen", 72)
json.dumps(render_plot(plot_debug_data, "boxplot", theme, 3.0, 2.0, dpi, False, "png", True))
    `]);
    const debug = JSON.parse(raw);

    expect(debug.figsize[0]).toBeGreaterThan(3);
    expect(debug.x_tick_overlap).toBe(false);
  }, 60000);

  it('wraps long Q-Q titles and uses automatic legend placement', async () => {
    const data = {
      type: 'continuous',
      display_label: 'Extremely long oxygen saturation measurement label',
      raw: [
        { val: 1.0, group: 'Probable severe disease' },
        { val: 1.5, group: 'Probable severe disease' },
        { val: 2.0, group: 'Probable non-severe disease' },
        { val: 2.5, group: 'Probable non-severe disease' },
      ],
      qq: {
        points: [
          { theoretical: -1.0, sample: 1.0, group: 'Probable severe disease' },
          { theoretical: 1.0, sample: 1.5, group: 'Probable severe disease' },
          { theoretical: -1.0, sample: 2.0, group: 'Probable non-severe disease' },
          { theoretical: 1.0, sample: 2.5, group: 'Probable non-severe disease' },
        ],
        lines: [
          { x: -1, y: 0.8, group: 'Probable severe disease' },
          { x: 1, y: 1.7, group: 'Probable severe disease' },
          { x: -1, y: 1.8, group: 'Probable non-severe disease' },
          { x: 1, y: 2.7, group: 'Probable non-severe disease' },
        ],
      },
    };
    await pyodideClient.call('run_python', [`plot_debug_data = ${JSON.stringify(JSON.stringify(data))}`]);
    await pyodideClient.call('run_python', [`plot_debug_theme = ${JSON.stringify(JSON.stringify(themes.GENERIC))}`]);
    const raw = await pyodideClient.call('run_python', [`
import json
theme, dpi = _apply_plot_theme(plot_debug_theme, "figure_dpi_screen", 72)
json.dumps(render_plot(plot_debug_data, "qqplot", theme, 3.0, 2.0, dpi, False, "png", True))
    `]);
    const debug = JSON.parse(raw);

    expect(debug.titles.some((title: string) => title.includes('\n'))).toBe(true);
    expect(debug.legend_locs.every((loc: number) => loc === 0)).toBe(true);
  }, 60000);

  it.skipIf(!fs.existsSync(path.resolve(__dirname, '../spikes/round13/output/data_clean.json')) ||
    !fs.existsSync(path.resolve(__dirname, '../spikes/round14_d49/output/g1_boxplot_pyodide.png')))(
    'verifies visual regression of G1 boxplot against reference (internal fixtures: spikes/round13/output/data_clean.json, spikes/round14_d49/output/g1_boxplot_pyodide.png)',
    async () => {
    // 1. Load the same input data as the spike
    const dataCleanPath = path.resolve(__dirname, '../spikes/round13/output/data_clean.json');
    const dataClean = JSON.parse(fs.readFileSync(dataCleanPath, 'utf-8'));
    
    // Format input data structures
    const inputData = {
      type: 'continuous',
      raw: dataClean.boxplot
    };

    // 2. Render boxplot via pyodideClient (spec uses 7x6 inches, 300 DPI matching spike config)
    const renderedB64 = await pyodideClient.renderPublicationFigure(inputData, 'boxplot', 7, 6, 300);

    // 3. Load reference image
    const refImgPath = path.resolve(__dirname, '../spikes/round14_d49/output/g1_boxplot_pyodide.png');
    const refBuffer = fs.readFileSync(refImgPath);
    const refBase64 = refBuffer.toString('base64');

    // 4. Run visual diff inside Pyodide worker using numpy/matplotlib
    const diffCode = `
import io
import base64
import numpy as np
import matplotlib.pyplot as plt

def compare_images(b64_a, b64_b):
    img_data_a = base64.b64decode(b64_a)
    img_a = plt.imread(io.BytesIO(img_data_a), format='png')
    
    img_data_b = base64.b64decode(b64_b)
    img_b = plt.imread(io.BytesIO(img_data_b), format='png')
    
    min_h = min(img_a.shape[0], img_b.shape[0])
    min_w = min(img_a.shape[1], img_b.shape[1])
    img_a = img_a[:min_h, :min_w, :]
    img_b = img_b[:min_h, :min_w, :]
    
    # Calculate Mean Squared Error (MSE)
    mse = np.mean((img_a - img_b) ** 2)
    return float(mse)

mse_result = compare_images(a_b64, b_b64)
mse_result
    `;

    // Inject base64 strings as globals in Python
    await pyodideClient.call("run_python", [`a_b64 = "${renderedB64}"`]);
    await pyodideClient.call("run_python", [`b_b64 = "${refBase64}"`]);

    const mse = await pyodideClient.call("run_python", [diffCode]);
    
    // D46 journal theming changes font sizing and plot styling; this legacy reference
    // still catches blank or grossly malformed renders without pinning exact pixels.
    expect(mse).toBeLessThan(0.02);
  });
});
