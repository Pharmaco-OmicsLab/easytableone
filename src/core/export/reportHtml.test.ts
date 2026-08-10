import { describe, expect, it } from "vitest";
import { renderMarkdown, renderUnifiedReportHtml } from "./reportHtml";
import type { UnifiedReportArtifacts } from "./unifiedReport";

function artifacts(overrides: Partial<UnifiedReportArtifacts> = {}): UnifiedReportArtifacts {
  return {
    md: [
      "# Test report",
      "",
      "## 1 First section",
      "",
      "**Bold text**",
      "",
      "| Term | Value |",
      "|---|---:|",
      "| Age | 42 |",
      "",
      "### 1.1 Figure section",
      "",
      "![Plot caption](asset:plot-1)",
      "",
    ].join("\n"),
    markdown: "",
    headings: [
      { level: 2, number: "1", text: "First section", slug: "first-section" },
      { level: 3, number: "1.1", text: "Figure section", slug: "figure-section" },
    ],
    assets: [{ id: "plot-1", caption: "Plot caption", base64Png: "cG5n" }],
    ...overrides,
  };
}

describe("reportHtml", () => {
  it("renders real Markdown headings, emphasis, and pipe tables", () => {
    const html = renderMarkdown("## Heading\n\n**bold**\n\n| A | B |\n|---|---:|\n| x | 1 |\n");

    expect(html).toContain("<h2>Heading</h2>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<table>");
    expect(html).not.toContain("## Heading");
  });

  it("sanitizes raw HTML by disabling Markdown HTML passthrough", () => {
    const html = renderMarkdown("## <script>alert(1)</script>\n\n<img src=x onerror=alert(1)>");

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("onerror=");
    expect(html).toContain("&lt;script&gt;");
  });

  it("builds a self-contained report with TOC anchors, inlined assets, and print CSS", () => {
    const html = renderUnifiedReportHtml(artifacts(), { title: "Test report" });

    expect(html).toContain('<a class="toc-link toc-level-2" href="#first-section"');
    expect(html).toContain('<details class="toc-group">');
    expect(html).not.toMatch(/<details class="toc-group"[^>]*\bopen\b/);
    expect(html).toContain('<summary class="toc-summary">');
    expect(html).toContain('<h2 id="first-section">1 First section</h2>');
    expect(html).toContain('src="data:image/png;base64,cG5n"');
    expect(html).toContain("<figcaption>Plot caption</figcaption>");
    expect(html).toContain('<details class="report-section" open>');
    expect(html).toContain('<summary class="report-section-summary"><h2 id="first-section">1 First section</h2></summary>');
    expect(html).toContain("requestAnimationFrame");
    expect(html).toContain("@media print");
    expect(html).not.toMatch(/<script src=|<link /);
    expect(html).not.toContain("asset:plot-1");
  });

  it("wraps only visible h2-h3 headings with children in collapsed TOC groups", () => {
    const html = renderUnifiedReportHtml(
      artifacts({
        md: [
          "# Test report",
          "",
          "## 1 Root with child",
          "",
          "### 1.1 Visible child",
          "",
          "#### 1.1.1 Skipped-level child",
          "",
          "## 2 Childless root",
          "",
        ].join("\n"),
        headings: [
          { level: 2, number: "1", text: "Root with child", slug: "root-with-child" },
          { level: 3, number: "1.1", text: "Visible child", slug: "visible-child" },
          { level: 4, number: "1.1.1", text: "Skipped-level child", slug: "skipped-level-child" },
          { level: 2, number: "2", text: "Childless root", slug: "childless-root" },
        ],
        assets: [],
      }),
      { title: "Test report" },
    );

    expect(html.match(/<details class="toc-group">/g)).toHaveLength(1);
    expect(html).toContain('<a class="toc-link toc-level-3" href="#visible-child"');
    expect(html).not.toContain('<a class="toc-link toc-level-4" href="#skipped-level-child"');
    expect(html).not.toMatch(/<details class="toc-group"[^>]*\bopen\b/);
    expect(html).toMatch(/<\/details><a class="toc-link toc-level-2" href="#childless-root"/);
  });

  it("emits scrollspy source that preserves user-collapsed TOC groups", () => {
    const html = renderUnifiedReportHtml(artifacts(), { title: "Test report" });

    expect(html).toContain("stopPropagation");
    expect(html).toContain("closest('details.toc-group')");
    expect(html).toContain("closest('details.report-section')");
    expect(html).toContain("active-ancestor");
    expect(html).not.toContain("el.open = true");
  });

  it("adds wrapping CSS for long inline tokens", () => {
    const html = renderUnifiedReportHtml(artifacts(), { title: "Test report" });

    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).toContain("word-break: break-word");
    expect(html).toContain("details.report-section:not([open]) > .report-section-body");
  });

  it("fails when assets and asset references drift", () => {
    expect(() =>
      renderUnifiedReportHtml(
        artifacts({
          md: "# Test\n\n## 1 First section\n",
          headings: [{ level: 2, number: "1", text: "First section", slug: "first-section" }],
        }),
        { title: "Test" },
      ),
    ).toThrow(/Unreferenced report assets/);
  });
});
