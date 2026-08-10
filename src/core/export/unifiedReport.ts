import type { EDAResults } from "../eda/types";
import type { EducationContext, ExplanationDepth } from "../education/educationTypes";
import type { ModelingResults, ModelingSetup } from "../modeling/types";
import type {
  AnalysisPlan,
  DataQualityRecord,
  DataQualityReport,
  FormattedTable,
  Schema,
  StatisticalResults,
} from "../types";
import { generateDataQualityReport } from "./dataQualityReport";
import { generateEDAReportMarkdown } from "./edaReport";
import { buildEducationReportMarkdown } from "./educationReport";
import { buildMethodsSummaryMarkdown } from "./methodsSummary";
import { buildModelingReportMarkdown } from "./modelingReport";

export interface UnifiedReportSections {
  table1: true;
  dataQuality: boolean;
  eda: boolean;
  modeling: boolean;
  methods: boolean;
  education: boolean;
}

export interface ReportHeading {
  level: number;
  number: string;
  text: string;
  slug: string;
}

export interface ReportAsset {
  id: string;
  base64Png: string;
  caption: string;
}

export interface UnifiedReportArtifacts {
  markdown: string;
  md: string;
  assets: ReportAsset[];
  headings: ReportHeading[];
}

export interface UnifiedReportContext {
  stats: StatisticalResults | null;
  schema: Schema | null;
  plan: AnalysisPlan | null;
  journalId: string;
  formattedTable: FormattedTable | null;
  dataQualityRecords: DataQualityRecord[];
  qaReport?: DataQualityReport | null;
  edaResults?: EDAResults | null;
  modelingResults?: ModelingResults | null;
  modelingSetup?: ModelingSetup | null;
  modelingFigures?: ReportAsset[];
  educationDepth: ExplanationDepth;
  appVersion: string;
  rulesetVersion: string;
  timestamp: string;
  supplementaryFigures?: ReportAsset[];
}

interface SectionDescriptor {
  key: Exclude<keyof UnifiedReportSections, "table1"> | "table1" | "figures" | "footer";
  included: (sections: UnifiedReportSections, ctx: UnifiedReportContext) => boolean;
  build: (ctx: UnifiedReportContext, assets: ReportAsset[]) => string;
}

const ORDERED_SECTIONS: SectionDescriptor[] = [
  {
    key: "dataQuality",
    included: (sections, ctx) => sections.dataQuality && !!ctx.schema && !!ctx.plan,
    build: (ctx) =>
      generateDataQualityReport(
        ctx.dataQualityRecords,
        ctx.schema as Schema,
        ctx.plan as AnalysisPlan,
        ctx.appVersion,
        ctx.timestamp,
        { qaReport: ctx.qaReport ?? null },
      ),
  },
  {
    key: "eda",
    included: (sections, ctx) => sections.eda && !!ctx.edaResults,
    build: (ctx, assets) => `${generateEDAReportMarkdown(ctx.edaResults ?? null, ctx.schema)}\n${collectEdaFigures(ctx.edaResults, assets)}`,
  },
  {
    key: "table1",
    included: () => true,
    build: (ctx) => renderFormattedTableMarkdown(ctx.formattedTable),
  },
  {
    key: "figures",
    included: (_sections, ctx) => (ctx.supplementaryFigures?.length ?? 0) > 0,
    build: (ctx, assets) => renderSupplementaryFigures(ctx.supplementaryFigures ?? [], assets),
  },
  {
    key: "modeling",
    included: (sections, ctx) => sections.modeling && hasModelingReport(ctx.modelingResults),
    build: (ctx, assets) =>
      `${buildModelingReportMarkdown(
        ctx.modelingResults as ModelingResults,
        ctx.modelingSetup ?? (ctx.modelingResults as ModelingResults).setup,
        ctx.schema,
      )}\n${renderModelingFigures(ctx.modelingFigures, assets)}`,
  },
  {
    key: "methods",
    included: (sections, ctx) => sections.methods && !!ctx.stats && !!ctx.schema && !!ctx.plan,
    build: (ctx) => buildMethodsSummaryMarkdown(ctx.stats as StatisticalResults, ctx.schema as Schema, ctx.plan as AnalysisPlan),
  },
  {
    key: "education",
    included: (sections) => sections.education,
    build: (ctx) => buildEducationReportMarkdown(buildEducationContext(ctx), ctx.educationDepth),
  },
  {
    key: "footer",
    included: () => true,
    build: (ctx) => renderProvenanceFooter(ctx),
  },
];

export function buildUnifiedReport(
  sections: UnifiedReportSections,
  ctx: UnifiedReportContext,
): UnifiedReportArtifacts {
  const effectiveSections: UnifiedReportSections = { ...sections, table1: true };
  const assets: ReportAsset[] = [];
  const body = ORDERED_SECTIONS
    .filter((section) => section.included(effectiveSections, ctx))
    .map((section) => normalizeHeadings(section.build(ctx, assets)))
    .filter((section) => section.trim().length > 0)
    .join("\n\n");
  const { markdown, headings } = numberHeadings(body);
  const title = renderTitleBlock(ctx);
  return {
    markdown,
    md: `${title}\n\n${markdown}\n`,
    assets,
    headings,
  };
}

function hasModelingReport(results: ModelingResults | null | undefined): boolean {
  return !!(results?.logistic || results?.ml);
}

function buildEducationContext(ctx: UnifiedReportContext): EducationContext {
  return {
    stats: ctx.stats,
    schema: ctx.schema,
    plan: ctx.plan,
    modelingSetup: ctx.modelingSetup ?? ctx.modelingResults?.setup,
    modelingResults: ctx.modelingResults,
  };
}

function renderTitleBlock(ctx: UnifiedReportContext): string {
  const title = ctx.formattedTable?.title || "Baseline Characteristics Report";
  return [
    `# ${title}`,
    "",
    "Unified EasyTableOne final report",
    "",
    `_Generated ${ctx.timestamp} - EasyTableOne v${ctx.appVersion} - ruleset v${ctx.rulesetVersion}_`,
  ].join("\n");
}

function renderFormattedTableMarkdown(table: FormattedTable | null): string {
  if (!table) {
    return "## Formal Table 1\n\nTable 1 has not been generated for this session.\n";
  }
  const lines = ["## Formal Table 1", "", `**${escapeMarkdownCell(table.title)}**`, ""];
  const headerRefs = table.headerFootnoteRefs ?? {};
  lines.push(`| ${table.header.map((header) => {
    const refs = headerRefs[header];
    return escapeMarkdownCell(refs?.length ? `${header} ${refs.map((ref) => `^${ref}^`).join("")}` : header);
  }).join(" | ")} |`);
  lines.push(`| ${table.header.map((_, index) => (index === 0 ? "---" : "---:")).join(" | ")} |`);
  for (const row of table.rows) {
    const cells = row.cells.map((cell, index) => {
      const footnotes = index === 0 && row.footnoteRefs.length ? ` ${row.footnoteRefs.map((ref) => `^${ref}^`).join("")}` : "";
      const indent = index === 0 && row.indent > 0 ? `${"&nbsp;".repeat(row.indent * 4)}${cell}` : cell;
      return escapeMarkdownCell(`${indent}${footnotes}`);
    });
    lines.push(`| ${cells.join(" | ")} |`);
  }
  if (table.footnotes.length) {
    lines.push("");
    for (const footnote of table.footnotes) {
      lines.push(`- ^${escapeMarkdownCell(footnote.marker)}^ ${footnote.text}`);
    }
  }
  if (table.codingNotes?.length) {
    lines.push("", `### ${table.variableCodingSectionTitle ?? "Variable coding notes"}`);
    table.codingNotes.forEach((note) => lines.push(`- ${note}`));
  }
  if (table.dataQualityNotes?.length && table.dataQualitySectionTitle !== null) {
    lines.push("", `### ${table.dataQualitySectionTitle ?? "Data quality notes"}`);
    table.dataQualityNotes.forEach((note) => lines.push(`- ${note}`));
  }
  if (table.methodsParagraph) {
    lines.push("", "### Statistical methods", table.methodsParagraph);
  }
  lines.push("");
  return lines.join("\n");
}

function collectEdaFigures(edaResults: EDAResults | null | undefined, assets: ReportAsset[]): string {
  if (!edaResults) return "";
  const lines: string[] = [];
  const pushAsset = (id: string, caption: string, base64Png: string | null | undefined) => {
    if (!base64Png) return;
    assets.push({ id, caption, base64Png });
    lines.push(`![${caption}](asset:${id})`);
    lines.push("");
  };
  pushAsset("eda-missingness", "Missingness heatmap", edaResults.missingness.heatmapPng);
  edaResults.mosaic?.pairs.forEach((pair, index) => {
    pushAsset(`eda-mosaic-${index + 1}`, `${pair.displayA} x ${pair.displayB} mosaic plot`, pair.png);
  });
  edaResults.bivariate?.plots.forEach((plot, index) => {
    pushAsset(`eda-bivariate-${index + 1}`, `${plot.displayLabel} ${plot.plotType}`, plot.png);
  });
  if (lines.length === 0) return "";
  return ["### EDA figures", "", ...lines, ""].join("\n");
}

function renderSupplementaryFigures(figures: ReportAsset[], assets: ReportAsset[]): string {
  if (figures.length === 0) return "";
  const lines = ["## Diagnostic and publication figures", ""];
  for (const figure of figures) {
    assets.push(figure);
    lines.push(`![${figure.caption}](asset:${figure.id})`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderModelingFigures(figures: ReportAsset[] | undefined, assets: ReportAsset[]): string {
  if (!figures || figures.length === 0) return "";
  const lines = ["### Benchmark figures", ""];
  for (const figure of figures) {
    assets.push(figure);
    lines.push(`![${figure.caption}](asset:${figure.id})`);
    lines.push("");
  }
  return lines.join("\n");
}

function renderProvenanceFooter(ctx: UnifiedReportContext): string {
  const libraryVersions = Object.entries(ctx.stats?.computeMetadata.libVersions ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, version]) => `${name} ${version}`)
    .join(", ") || "not recorded";
  return [
    "## Reproducibility & environment",
    "",
    `- EasyTableOne version: ${ctx.appVersion}`,
    `- journal_rulesets.json version: ${ctx.rulesetVersion}`,
    `- Selected journal: ${ctx.journalId}`,
    `- Generated: ${ctx.timestamp}`,
    `- Engine/library versions: ${libraryVersions}`,
    "",
    "This report is assembled from session-local results. Raw source data and dataset hashes are not included.",
  ].join("\n");
}

function normalizeHeadings(markdown: string): string {
  const trimmed = markdown.trim();
  if (!trimmed) return "";
  const levels = [...trimmed.matchAll(/^(#{1,6})\s+\S.*$/gm)].map((match) => match[1].length);
  const minLevel = levels.length ? Math.min(...levels) : 2;
  const shift = 2 - minLevel;
  return trimmed.replace(/^(#{1,6})\s+(.*)$/gm, (_full, hashes: string, text: string) => {
    const nextLevel = Math.min(6, Math.max(2, hashes.length + shift));
    return `${"#".repeat(nextLevel)} ${stripExistingNumber(text.trim())}`;
  });
}

function numberHeadings(markdown: string): { markdown: string; headings: ReportHeading[] } {
  const counters = [0, 0, 0, 0, 0];
  const slugCounts = new Map<string, number>();
  const headings: ReportHeading[] = [];
  const numbered = markdown.replace(/^(#{2,6})\s+(.*)$/gm, (_full, hashes: string, rawText: string) => {
    const level = hashes.length;
    const index = level - 2;
    counters[index] += 1;
    for (let i = index + 1; i < counters.length; i++) counters[i] = 0;
    const number = counters.slice(0, index + 1).filter((value) => value > 0).join(".");
    const text = stripExistingNumber(rawText.trim());
    const slug = uniqueSlug(text, slugCounts);
    headings.push({ level, number, text, slug });
    return `${hashes} ${number} ${text}`;
  });
  return { markdown: numbered, headings };
}

function uniqueSlug(text: string, slugCounts: Map<string, number>): string {
  const base = slugify(text) || "section";
  const count = slugCounts.get(base) ?? 0;
  slugCounts.set(base, count + 1);
  return count === 0 ? base : `${base}-${count + 1}`;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~()[\]{}:;'"!?.,/\\|]+/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripExistingNumber(text: string): string {
  return text.replace(/^\d+(?:\.\d+)*\s+/, "");
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}
