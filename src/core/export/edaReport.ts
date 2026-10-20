import type { EDAResults } from "../eda/types";
import type { Schema } from "../types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function activeColumnLabels(schema: Schema | null | undefined) {
  if (!schema) return new Map<string, string>();
  return new Map(
    schema.columns
      .filter((column) => !column.exclusionReason)
      .map((column) => [column.name, column.displayLabel || column.label || column.name]),
  );
}



export function generateEDAReportMarkdown(
  edaResults: EDAResults | null,
  schema?: Schema | null,
): string {
  if (!edaResults) {
    return "## Exploratory Data Analysis\n\nNo EDA results have been generated for this session.\n";
  }
  const labels = activeColumnLabels(schema);
  const lines: string[] = [];
  lines.push("## Exploratory Data Analysis\n");
  lines.push(`Generated: ${edaResults.generatedAt}`);
  lines.push(`Schema fingerprint: \`${summarizeSchemaFingerprint(edaResults.schemaFingerprint)}\`\n`);

  lines.push("### Missingness");
  const missing = edaResults.missingness.perVariable.filter((item) => item.missingPct > 0);
  if (missing.length === 0) {
    lines.push("No missing values detected across active variables.\n");
  } else {
    missing.forEach((item) => {
      lines.push(`- ${labels.get(item.name) ?? item.displayLabel}: ${item.missingPct.toFixed(1)}% (${item.missingCount})`);
    });
    lines.push("");
  }

  if (edaResults.missingness.indicatorCorrelations.length === 0) {
    lines.push("No correlated missingness patterns detected.\n");
  } else {
    lines.push("Correlated missingness patterns:");
    edaResults.missingness.indicatorCorrelations.forEach((item) => {
      lines.push(`- ${item.displayA} and ${item.displayB}: r = ${item.correlation.toFixed(2)}`);
    });
    lines.push("");
  }
  if (edaResults.missingness.mcar) {
    const mcar = edaResults.missingness.mcar;
    const prefix = mcar.experimental ? "Little's MCAR test (experimental):" : "Little's MCAR test:";
    if (mcar.pValue === null || mcar.statistic === null) {
      lines.push(`${prefix} ${mcar.note}\n`);
    } else {
      const isConsistent = mcar.verdict === "consistent_with_mcar" || (mcar.verdict === undefined && mcar.pValue >= 0.05);
      const verdictText = isConsistent
        ? 'Missingness pattern is consistent with "completely at random" (approximate test)'
        : 'Missingness pattern is not consistent with "completely at random" (approximate test)';
      const pStr = mcar.pValue < 0.001 ? "p < 0.001" : `p ≈ ${mcar.pValue.toFixed(3)}`;
      lines.push(`${prefix} ${verdictText}\n  Details: chi-square=${mcar.statistic.toFixed(2)}, df=${mcar.df}, ${pStr}, patterns=${mcar.nPatterns}. ${mcar.note}`);
      if (mcar.approximationNote) {
        lines.push(`  ${mcar.approximationNote}`);
      }
      lines.push("");
    }
  }

  lines.push("### Correlations");
  if (edaResults.correlations.nContinuous < 2) {
    lines.push("Fewer than 2 continuous variables; correlation matrix not available.\n");
  } else if (edaResults.correlations.flagged.length === 0) {
    lines.push("No highly correlated continuous-variable pairs detected.\n");
  } else {
    lines.push("Highly correlated pairs (|r| > 0.7):");
    edaResults.correlations.flagged.forEach((item) => {
      lines.push(`- ${item.displayA} and ${item.displayB}: Pearson r = ${item.pearsonR.toFixed(2)}, Spearman rho = ${item.spearmanRho.toFixed(2)}`);
    });
    lines.push("");
  }

  lines.push("### Multicollinearity");
  if (!edaResults.vif?.length) {
    lines.push("VIF was not available; at least 2 complete continuous predictors are required.\n");
  } else {
    lines.push("Variance inflation factors (VIF):");
    edaResults.vif.forEach((item) => {
      const value = item.vif === null ? "Infinity" : item.vif.toFixed(2);
      lines.push(`- ${item.displayLabel}: ${value} (${item.severity})`);
    });
    lines.push("");
  }

  lines.push("### Categorical associations");
  if (!edaResults.mosaic?.pairs.length) {
    lines.push("No categorical mosaic plots were generated.\n");
  } else {
    lines.push("Categorical mosaic plots:");
    edaResults.mosaic.pairs.forEach((pair) => {
      lines.push(`- ${pair.displayA} x ${pair.displayB}`);
    });
    lines.push("");
  }

  lines.push("### Bivariate plots");
  if (!edaResults.bivariate) {
    lines.push("No grouping variable was available when EDA was generated.\n");
  } else if (edaResults.bivariate.plots.length === 0) {
    lines.push(`No bivariate plots were generated for grouping variable ${edaResults.bivariate.groupingDisplayLabel}.\n`);
  } else {
    lines.push(`Bivariate distributions by ${edaResults.bivariate.groupingDisplayLabel}:`);
    edaResults.bivariate.plots.forEach((plot) => {
      lines.push(`- ${plot.displayLabel} (${plot.plotType})`);
    });
    lines.push("");
  }

  return lines.join("\n");
}

function summarizeSchemaFingerprint(fingerprint: string): string {
  if (fingerprint.length <= 96) return fingerprint;
  const segments = fingerprint.split("|").filter(Boolean);
  const digest = hashString(fingerprint).slice(0, 12);
  return `${segments.length} variables; digest ${digest}`;
}

function hashString(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}



export function generateEdaSummaryMarkdown(edaResults: EDAResults | null): string {
  if (!edaResults) return "";
  const lines: string[] = [];
  lines.push("## EDA Summary\n");
  lines.push(`Generated by EasyTableOne on ${edaResults.generatedAt}.\n`);

  const missingVars = edaResults.missingness.perVariable;
  const anyMissing = missingVars.filter((item) => item.missingCount > 0);
  const mostMissing = [...anyMissing].sort((a, b) => b.missingPct - a.missingPct)[0];
  lines.push("### Missingness");
  lines.push(`${missingVars.length} variables were examined for missing data. ${anyMissing.length} had any missing values.`);
  if (mostMissing) {
    lines.push(`The most missing variable was ${mostMissing.displayLabel} (${mostMissing.missingPct.toFixed(1)}% missing, n=${mostMissing.missingCount}).`);
  }
  const missingCorr = edaResults.missingness.indicatorCorrelations[0];
  if (missingCorr) {
    lines.push(`Correlated missingness patterns were identified between ${missingCorr.displayA} and ${missingCorr.displayB} (r = ${missingCorr.correlation.toFixed(3)}), suggesting these may be missing not at random.`);
  }
  lines.push("");

  lines.push("### Continuous Variable Correlations");
  lines.push(`${edaResults.correlations.nContinuous} continuous variables were included in the correlation analysis.`);
  if (edaResults.correlations.flagged.length > 0) {
    lines.push(`${edaResults.correlations.flagged.length} pairs of variables showed high correlation (|r| > 0.7):`);
    edaResults.correlations.flagged.slice(0, 5).forEach((item) => {
      lines.push(`- ${item.displayA} and ${item.displayB} (Pearson r = ${item.pearsonR.toFixed(3)}, Spearman rho = ${item.spearmanRho.toFixed(3)}).`);
    });
    if (edaResults.correlations.flagged.length > 5) {
      lines.push(`- and ${edaResults.correlations.flagged.length - 5} more`);
    }
    lines.push("Highly correlated variables may represent the same underlying construct; consider excluding one before multivariate analysis.");
  } else {
    lines.push("No highly correlated pairs were detected.");
  }
  lines.push("");

  lines.push("### Bivariate Distributions");
  if (edaResults.bivariate) {
    lines.push(`Bivariate distributions by ${edaResults.bivariate.groupingDisplayLabel} were examined for ${edaResults.bivariate.plots.length} variables.`);
    lines.push("See the accompanying EDA report for plots.");
  } else {
    lines.push("Bivariate distributions were not computed (no grouping variable selected).");
  }

  if (edaResults.vif?.length) {
    const elevated = edaResults.vif.filter((item) => item.severity !== "ok");
    lines.push("");
    lines.push("### Multicollinearity");
    lines.push(`${edaResults.vif.length} continuous predictors were evaluated with VIF.`);
    if (elevated.length) {
      lines.push(`${elevated.length} variables had elevated VIF (> 5), suggesting unstable estimates in multivariable models.`);
    } else {
      lines.push("No elevated VIF values were detected.");
    }
  }

  return lines.join("\n").replace(/\b(null|undefined)\b/g, "");
}



export function generateEDAReportSectionHtml(
  edaResults: EDAResults | null,
  schema?: Schema | null,
): string {
  const summary = generateEDAReportMarkdown(edaResults, schema)
    .split("\n")
    .map((line) => escapeHtml(line))
    .join("<br>");

  if (!edaResults) {
    return `<section><h2>Exploratory Data Analysis</h2><p>No EDA results have been generated for this session.</p></section>`;
  }

  const missingHeatmap = edaResults.missingness.heatmapPng
    ? `<h3>Missingness heatmap</h3><img class="eda-img" src="data:image/png;base64,${edaResults.missingness.heatmapPng}" alt="Missingness heatmap">`
    : "";
  const bivariate = edaResults.bivariate?.plots.length
    ? `<h3>Bivariate plots</h3><div class="eda-grid">${edaResults.bivariate.plots.map((plot) => `
        <figure>
          <figcaption>${escapeHtml(plot.displayLabel)}</figcaption>
          <img class="eda-img" src="data:image/png;base64,${plot.png}" alt="${escapeHtml(plot.displayLabel)} bivariate plot">
        </figure>
      `).join("")}</div>`
    : "";
  const mosaic = edaResults.mosaic?.pairs.length
    ? `<h3>Categorical mosaic plots</h3><div class="eda-grid">${edaResults.mosaic.pairs.map((pair) => `
        <figure>
          <figcaption>${escapeHtml(pair.displayA)} x ${escapeHtml(pair.displayB)}</figcaption>
          <img class="eda-img" src="data:image/png;base64,${pair.png}" alt="${escapeHtml(pair.displayA)} by ${escapeHtml(pair.displayB)} mosaic plot">
        </figure>
      `).join("")}</div>`
    : "";

  return `
    <section>
      <h2>Exploratory Data Analysis</h2>
      <div class="eda-summary">${summary}</div>
      ${missingHeatmap}
      ${mosaic}
      ${bivariate}
    </section>
  `;
}



export function generateEDAReportHtml(
  edaResults: EDAResults | null,
  _schema?: Schema | null, // kept for call-site compatibility; charts are now pre-rendered PNGs
  appVersion = "unknown",
  timestamp: string = new Date().toISOString(),
  correlationChartPng?: string | null,
  missingnessChartPng?: string | null,
): string {
  if (!edaResults) {
    return "<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"utf-8\" /><title>EDA Report - EasyTableOne</title></head><body><h1>Exploratory Data Analysis Report</h1><p>No EDA results have been generated for this session.</p></body></html>";
  }

  const heatmapPng = edaResults.missingness.heatmapPng;
  const mcarHtml = edaResults.missingness.mcar
    ? edaResults.missingness.mcar.pValue === null || edaResults.missingness.mcar.statistic === null
      ? `<p><strong>Little's MCAR${edaResults.missingness.mcar.experimental ? " (experimental)" : ""}:</strong> ${escapeHtml(edaResults.missingness.mcar.note)}</p>`
      : (() => {
          const mcar = edaResults.missingness.mcar;
          if (!mcar || mcar.pValue === null || mcar.statistic === null) return "";
          const isConsistent = mcar.verdict === "consistent_with_mcar" || (mcar.verdict === undefined && mcar.pValue >= 0.05);
          const verdictText = isConsistent
            ? 'Missingness pattern is consistent with "completely at random" (approximate test)'
            : 'Missingness pattern is not consistent with "completely at random" (approximate test)';
          const pStr = mcar.pValue < 0.001 ? "p < 0.001" : `p ≈ ${mcar.pValue.toFixed(3)}`;
          return `<p><strong>Little's MCAR${mcar.experimental ? " (experimental)" : ""}:</strong> ${escapeHtml(verdictText)}<br/>
          Details: chi-square=${mcar.statistic.toFixed(2)}, df=${mcar.df}, ${pStr}, patterns=${mcar.nPatterns}.<br/>
          <span style="font-size: 0.85em; color: #6b7280;">${escapeHtml(mcar.note)}</span>
          ${mcar.approximationNote ? `<br/><span style="font-size: 0.85em; color: #6b7280; font-style: italic;">${escapeHtml(mcar.approximationNote)}</span>` : ""}
          </p>`;
        })()
    : "";
  const flaggedPairsHtml = edaResults.correlations.flagged.length
    ? `<ul class="flagged">${edaResults.correlations.flagged.map((item) => `<li>${escapeHtml(item.displayA)} and ${escapeHtml(item.displayB)}: Pearson r = ${item.pearsonR.toFixed(3)}, Spearman rho = ${item.spearmanRho.toFixed(3)}</li>`).join("")}</ul>`
    : "<p>No highly correlated continuous-variable pairs detected.</p>";
  const bivariateHtml = edaResults.bivariate?.plots.length
    ? `<div class="eda-grid">${edaResults.bivariate.plots.map((plot) => `
        <figure>
          <figcaption>${escapeHtml(plot.displayLabel)}</figcaption>
          <img src="data:image/png;base64,${plot.png}" alt="${escapeHtml(plot.displayLabel)} bivariate plot" />
        </figure>
      `).join("")}</div>`
    : "<p>Bivariate distributions were not computed.</p>";
  const mosaicHtml = edaResults.mosaic?.pairs.length
    ? `<div class="eda-grid">${edaResults.mosaic.pairs.map((pair) => `
        <figure>
          <figcaption>${escapeHtml(pair.displayA)} x ${escapeHtml(pair.displayB)}</figcaption>
          <img src="data:image/png;base64,${pair.png}" alt="${escapeHtml(pair.displayA)} by ${escapeHtml(pair.displayB)} mosaic plot" />
        </figure>
      `).join("")}</div>`
    : "<p>No categorical mosaic plots were generated.</p>";
  const vifHtml = edaResults.vif?.length
    ? `<table><thead><tr><th>Variable</th><th>VIF</th><th>Flag</th></tr></thead><tbody>${edaResults.vif.map((row) => `
        <tr><td>${escapeHtml(row.displayLabel)}</td><td>${row.vif === null ? "Infinity" : row.vif.toFixed(2)}</td><td>${escapeHtml(row.severity)}</td></tr>
      `).join("")}</tbody></table>`
    : "<p>VIF requires at least 2 complete continuous predictors.</p>";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>EDA Report - EasyTableOne</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1f2937; }
    h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
    h2 { font-size: 1.15rem; margin-top: 2rem; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.25rem; }
    .meta { font-size: 0.85rem; color: #6b7280; margin-bottom: 2rem; }
    .print-hint { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 0.75rem 1rem; font-size: 0.85rem; color: #1e40af; margin-bottom: 1.5rem; }
    .chart-container { margin: 1rem 0; }
    img { max-width: 100%; border: 1px solid #e5e7eb; border-radius: 4px; }
    ul.flagged { padding-left: 1.25rem; }
    .eda-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    figure { margin: 0; break-inside: avoid; }
    figcaption { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border-bottom: 1px solid #e5e7eb; padding: 0.5rem; text-align: left; }
    @media print {
      .print-hint { display: none; }
      body { max-width: 100%; margin: 0; }
      h2 { page-break-after: avoid; }
    }
  </style>
</head>
<body>
  <!-- Self-contained: charts are embedded as PNG data URIs; no scripts or remote resources. -->
  <h1>Exploratory Data Analysis Report</h1>
  <div class="meta">
    Generated by EasyTableOne v${escapeHtml(appVersion)} - ${escapeHtml(timestamp)}<br/>
    Session-local results - not included in reproducibility.json
  </div>
  <div class="print-hint">
    <strong>To save as PDF:</strong> Use your browser's
    <strong>File - Print - Save as PDF</strong> (or Ctrl+P / Cmd+P).
    The print layout hides this message and browser chrome.
  </div>

  <h2>Missingness</h2>
  ${mcarHtml}
  ${missingnessChartPng ? `<div class="chart-container"><img src="data:image/png;base64,${missingnessChartPng}" alt="Missingness by variable (bar chart)" /></div>` : ""}
  ${heatmapPng ? `<img src="data:image/png;base64,${heatmapPng}" alt="Missingness heatmap" />` : ""}

  <h2>Correlations</h2>
  ${correlationChartPng ? `<div class="chart-container"><img src="data:image/png;base64,${correlationChartPng}" alt="Correlation matrix of continuous variables" /></div>` : ""}
  ${flaggedPairsHtml}

  <h2>Multicollinearity</h2>
  ${vifHtml}

  <h2>Categorical Associations</h2>
  ${mosaicHtml}

  <h2>Bivariate Plots</h2>
  ${bivariateHtml}
</body>
</html>`;
}
