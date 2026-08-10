import MarkdownIt from "markdown-it";
import type { ReportAsset, UnifiedReportArtifacts } from "./unifiedReport";

export interface ReportHtmlOptions {
  title: string;
  theme?: "default";
  codeFolding?: boolean;
}

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: true,
});

interface TocNode {
  heading: UnifiedReportArtifacts["headings"][number];
  children: TocNode[];
}

export function renderMarkdown(md: string): string {
  return neutralizeDangerousAttributeText(markdown.render(md));
}

export function renderUnifiedReportHtml(
  art: UnifiedReportArtifacts,
  opts: ReportHtmlOptions,
): string {
  const assetMap = new Map(art.assets.map((asset) => [asset.id, asset]));
  let body = renderMarkdown(art.md);
  body = inlineAssets(body, assetMap);
  body = addHeadingIds(body, art.headings);
  body = body.replace("<h1>", "<h1 class=\"title\">");
  body = wrapTopLevelSections(body);

  const toc = renderToc(art.headings);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="generator" content="EasyTableOne unified report">
  <title>${escapeHtml(opts.title)}</title>
  <style>${REPORT_CSS}</style>
</head>
<body>
  <nav class="toc-rail" aria-label="Table of contents">
    <div class="toc-title">Contents</div>
    ${toc}
  </nav>
  <main class="report">
    ${body}
  </main>
  <script>${SCROLLSPY_JS}</script>
</body>
</html>`;
}

function buildTocTree(headings: UnifiedReportArtifacts["headings"]): TocNode[] {
  const roots: TocNode[] = [];
  const stack: TocNode[] = [];
  for (const heading of headings) {
    const node: TocNode = { heading, children: [] };
    while (stack.length && stack[stack.length - 1].heading.level >= heading.level) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(node);
    else roots.push(node);
    stack.push(node);
  }
  return roots;
}

function renderTocNode(node: TocNode): string {
  const link = `<a class="toc-link toc-level-${node.heading.level}" href="#${escapeAttr(node.heading.slug)}" data-target="${escapeAttr(node.heading.slug)}">
      <span class="toc-number">${escapeHtml(node.heading.number)}</span>
      <span>${escapeHtml(node.heading.text)}</span>
    </a>`;
  if (node.children.length === 0) return link;
  const childList = `<div class="toc-children">${node.children.map(renderTocNode).join("")}</div>`;
  return `<details class="toc-group">
    <summary class="toc-summary">${link}</summary>
    ${childList}
  </details>`;
}

function renderToc(headings: UnifiedReportArtifacts["headings"]): string {
  const visibleHeadings = headings.filter((heading) => heading.level <= 3);
  return buildTocTree(visibleHeadings).map(renderTocNode).join("");
}

function inlineAssets(html: string, assets: Map<string, ReportAsset>): string {
  const seen = new Set<string>();
  const inlined = html.replace(
    /<p>\s*<img\b([^>]*)>\s*<\/p>/g,
    (full, attrs: string) => {
      const srcMatch = attrs.match(/\bsrc="asset:([^"]+)"/);
      if (!srcMatch) return full;
      const id = srcMatch[1];
      const alt = attrs.match(/\balt="([^"]*)"/)?.[1] ?? "";
      const asset = assets.get(id);
      if (!asset) {
        throw new Error(`Missing report asset: ${id}`);
      }
      if (seen.has(id)) {
        throw new Error(`Duplicate report asset reference: ${id}`);
      }
      seen.add(id);
      const caption = escapeHtml(asset.caption || unescapeHtml(alt));
      return `<figure class="report-figure" id="figure-${escapeAttr(id)}"><img src="data:image/png;base64,${asset.base64Png}" alt="${escapeAttr(unescapeHtml(alt) || asset.caption)}"><figcaption>${caption}</figcaption></figure>`;
    },
  );
  const missing = [...assets.keys()].filter((id) => !seen.has(id));
  if (missing.length > 0) {
    throw new Error(`Unreferenced report assets: ${missing.join(", ")}`);
  }
  return inlined;
}

function addHeadingIds(html: string, headings: UnifiedReportArtifacts["headings"]): string {
  let index = 0;
  return html.replace(/<h([2-6])>(.*?)<\/h\1>/g, (full, level: string, content: string) => {
    const heading = headings[index++];
    if (!heading) return full;
    return `<h${level} id="${escapeAttr(heading.slug)}">${content}</h${level}>`;
  });
}

function wrapTopLevelSections(html: string): string {
  const matches = [...html.matchAll(/<h2 id="[^"]+">[\s\S]*?<\/h2>/g)];
  if (matches.length === 0) return html;

  let result = html.slice(0, matches[0].index);
  matches.forEach((match, index) => {
    const start = match.index ?? 0;
    const contentStart = start + match[0].length;
    const nextStart = matches[index + 1]?.index ?? html.length;
    result += `<details class="report-section" open>
  <summary class="report-section-summary">${match[0]}</summary>
  <div class="report-section-body">
    ${html.slice(contentStart, nextStart)}
  </div>
</details>`;
  });
  return result;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function neutralizeDangerousAttributeText(value: string): string {
  return value.replace(/\bon[a-z]+\s*=/gi, "data-removed=");
}

const REPORT_CSS = `
:root { color-scheme: light; --ink: #1f2933; --muted: #64748b; --rule: #d6dee8; --accent: #0f766e; --paper: #ffffff; --soft: #f7fafc; }
* { box-sizing: border-box; }
body { margin: 0; background: #eef3f7; color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.58; overflow-wrap: break-word; }
.report { max-width: 980px; margin: 0 auto; padding: 46px 54px 72px; background: var(--paper); min-height: 100vh; box-shadow: 0 1px 18px rgba(15, 23, 42, 0.08); }
.title { font-size: 38px; line-height: 1.1; font-weight: 650; margin: 0 0 12px; letter-spacing: 0; }
h1, h2, h3, h4, h5, h6 { color: #172033; font-weight: 650; letter-spacing: 0; scroll-margin-top: 22px; }
h2 { font-size: 30px; margin: 42px 0 14px; padding-bottom: 8px; border-bottom: 1px solid var(--rule); }
h3 { font-size: 24px; margin: 30px 0 10px; }
h4 { font-size: 20px; margin: 24px 0 8px; }
p, li { overflow-wrap: anywhere; }
p { margin: 0 0 14px; }
em { color: var(--muted); }
code { background: #eef2f7; border: 1px solid #dce3eb; border-radius: 4px; padding: 0.1em 0.3em; font-size: 0.92em; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
table { width: 100%; border-collapse: collapse; margin: 18px 0 24px; font-size: 14px; }
thead th { border-top: 2px solid #111827; border-bottom: 1px solid #111827; color: #111827; font-weight: 700; }
tbody { border-bottom: 2px solid #111827; }
th, td { padding: 8px 10px; text-align: left; vertical-align: top; border-bottom: 1px solid #e5eaf0; }
th:not(:first-child), td:not(:first-child) { text-align: right; }
tbody tr:nth-child(even) { background: #fbfcfe; }
ul, ol { padding-left: 1.5rem; }
.report-section { border-top: 1px solid transparent; }
.report-section > .report-section-summary { display: block; list-style: none; cursor: pointer; margin-top: 42px; }
.report-section > .report-section-summary::-webkit-details-marker { display: none; }
.report-section > .report-section-summary h2 { display: grid; grid-template-columns: auto 1fr; gap: 10px; align-items: baseline; margin-top: 0; }
.report-section > .report-section-summary h2::before { content: "\\25BE"; color: var(--muted); font-size: 16px; line-height: 1; transform: translateY(-2px); }
.report-section:not([open]) > .report-section-summary h2::before { content: "\\25B8"; }
.report-section:not([open]) > .report-section-summary h2 { margin-bottom: 0; }
.report-section-body { min-width: 0; }
.report-figure { margin: 24px 0; padding: 12px; border: 1px solid var(--rule); background: #fbfcfe; break-inside: avoid; }
.report-figure img { display: block; max-width: 100%; height: auto; margin: 0 auto; }
.report-figure figcaption { margin-top: 8px; font-size: 13px; color: var(--muted); font-weight: 600; }
.toc-rail { position: fixed; top: 22px; left: 18px; width: 250px; max-height: calc(100vh - 44px); overflow: auto; padding: 14px; background: rgba(255,255,255,0.94); border: 1px solid var(--rule); box-shadow: 0 6px 24px rgba(15, 23, 42, 0.08); }
.toc-title { font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 700; margin-bottom: 8px; }
.toc-group { border: none; margin: 0; }
.toc-group > .toc-summary { list-style: none; cursor: pointer; }
.toc-group > .toc-summary::-webkit-details-marker { display: none; }
.toc-group > .toc-summary::before { content: "\\25B8"; display: inline-block; width: 12px; margin-right: 2px; color: var(--muted); transition: transform 0.15s ease; }
.toc-group[open] > .toc-summary::before { transform: rotate(90deg); }
.toc-group > .toc-summary .toc-link { display: inline-grid; }
.toc-children { margin-left: 2px; }
.toc-link { display: grid; grid-template-columns: auto 1fr; gap: 8px; padding: 5px 6px; border-left: 3px solid transparent; color: #334155; text-decoration: none; font-size: 13px; line-height: 1.3; }
.toc-link:hover, .toc-link.active { color: #0f766e; border-left-color: var(--accent); background: #ecfdf5; }
.toc-group.active-ancestor > .toc-summary .toc-link { color: #0f766e; border-left-color: var(--accent); background: #f0fdfa; }
.toc-level-3 { padding-left: 18px; }
.toc-level-4, .toc-level-5, .toc-level-6 { padding-left: 32px; font-size: 12px; }
.toc-number { color: var(--muted); font-variant-numeric: tabular-nums; }
@media (max-width: 1480px) {
  .toc-rail { position: static; width: auto; max-height: none; margin: 16px auto 0; max-width: 980px; }
  .report { margin-top: 16px; }
}
@media (max-width: 720px) {
  .report { padding: 28px 18px 48px; }
  .title { font-size: 30px; }
  h2 { font-size: 24px; }
  h3 { font-size: 20px; }
  table { display: block; overflow-x: auto; white-space: nowrap; }
}
@media print {
  body { background: #fff; }
  .toc-rail { display: none; }
  .report { max-width: none; margin: 0; padding: 0; box-shadow: none; }
  details.report-section:not([open]) > .report-section-body { display: block; }
  h2, h3, h4 { page-break-after: avoid; }
  .report-figure, table { break-inside: avoid; }
}
`;

const SCROLLSPY_JS = `
(function () {
  var links = Array.prototype.slice.call(document.querySelectorAll('.toc-link'));
  document.querySelectorAll('.toc-summary .toc-link').forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.stopPropagation();
    });
  });
  if (links.length === 0) return;
  var byId = new Map(links.map(function (link) { return [link.getAttribute('data-target'), link]; }));
  var headings = Array.prototype.slice.call(document.querySelectorAll('main h2[id], main h3[id]'))
    .filter(function (heading) { return byId.has(heading.id); });
  var groups = Array.prototype.slice.call(document.querySelectorAll('details.toc-group'));
  var activeId = "";
  var ticking = false;

  links.forEach(function (link) {
    link.addEventListener('click', function () {
      var target = document.getElementById(link.getAttribute('data-target'));
      var section = target ? target.closest('details.report-section') : null;
      if (section) section.open = true;
    });
  });

  function setActive(nextId) {
    if (!nextId || nextId === activeId) return;
    activeId = nextId;
    links.forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('data-target') === activeId);
    });
    groups.forEach(function (group) { group.classList.remove('active-ancestor'); });
    var activeLink = byId.get(activeId);
    var el = activeLink ? activeLink.closest('details.toc-group') : null;
    while (el) {
      el.classList.add('active-ancestor');
      el = el.parentElement ? el.parentElement.closest('details.toc-group') : null;
    }
  }

  function updateActive() {
    ticking = false;
    var offset = 120;
    var current = headings[0];
    for (var i = 0; i < headings.length; i += 1) {
      if (headings[i].getBoundingClientRect().top <= offset) current = headings[i];
      else break;
    }
    if (current) setActive(current.id);
  }

  function requestUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateActive);
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', requestUpdate);
  updateActive();
})();
`;
