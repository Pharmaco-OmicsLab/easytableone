import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { getDecision, getStageDecisionIds, getStageOverview, STAGE_ORDER } from "../education/educationContent";
import type { EducationContext, ExplanationDepth } from "../education/educationTypes";

export type EducationReportDocxChild = Paragraph;

export function hasModelingReport(context: EducationContext): boolean {
  return Boolean(context.modelingResults?.logistic || context.modelingResults?.ml);
}

function line(text = ""): Paragraph {
  return new Paragraph({ text, spacing: { after: 80 } });
}

function bullet(label: string, text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: `${label}: `, bold: true }), new TextRun(text)],
    spacing: { after: 80 },
  });
}

export function buildEducationReportMarkdown(context: EducationContext = {}, depth: ExplanationDepth = "concise"): string {
  const lines = ["# Methods & Rationale Explainer", "", `Explanation depth: ${depth === "deep" ? "detailed" : "concise"}`, ""];

  for (const stage of STAGE_ORDER) {
    if (stage === "modeling" && !hasModelingReport(context)) continue;
    const overview = getStageOverview(stage);
    lines.push(`## ${overview.title}`, "");
    lines.push(`**Purpose:** ${overview.purpose}`, "");
    lines.push(`**What to do:** ${overview.whatToDo}`, "");
    lines.push(`**Why it matters:** ${overview.whyItMatters}`, "");

    const decisions = getStageDecisionIds(stage, context);
    if (decisions.length > 0) {
      lines.push("### Decisions", "");
      for (const id of decisions) {
        const decision = getDecision(id, depth, context);
        lines.push(`#### ${decision.label}`, "");
        lines.push(`- What: ${decision.concise.what}`);
        lines.push(`- Why: ${decision.concise.why}`);
        lines.push(`- Alternatives: ${decision.concise.alternatives}`);
        lines.push("");
      }
    }
  }

  return `${lines.join("\n").trim()}\n`;
}

export function buildEducationReportDocxChildren(context: EducationContext = {}, depth: ExplanationDepth = "concise"): EducationReportDocxChild[] {
  const children: EducationReportDocxChild[] = [
    new Paragraph({ text: "Methods & Rationale Explainer", heading: HeadingLevel.HEADING_2, spacing: { before: 400, after: 200 } }),
    line(`Explanation depth: ${depth === "deep" ? "detailed" : "concise"}`),
  ];

  for (const stage of STAGE_ORDER) {
    if (stage === "modeling" && !hasModelingReport(context)) continue;
    const overview = getStageOverview(stage);
    children.push(new Paragraph({ text: overview.title, heading: HeadingLevel.HEADING_3, spacing: { before: 240, after: 120 } }));
    children.push(bullet("Purpose", overview.purpose));
    children.push(bullet("What to do", overview.whatToDo));
    children.push(bullet("Why it matters", overview.whyItMatters));

    for (const id of getStageDecisionIds(stage, context)) {
      const decision = getDecision(id, depth, context);
      children.push(new Paragraph({ text: decision.label, heading: HeadingLevel.HEADING_4, spacing: { before: 160, after: 80 } }));
      children.push(bullet("What", decision.concise.what));
      children.push(bullet("Why", decision.concise.why));
      children.push(bullet("Alternatives", decision.concise.alternatives));
    }
  }

  return children;
}

export async function exportEducationReportDocx(context: EducationContext = {}, depth: ExplanationDepth = "concise", appVersion = "unknown"): Promise<Blob> {
  const doc = new Document({
    creator: `EasyTableOne v${appVersion}`,
    title: "Methods & Rationale Explainer",
    sections: [{ properties: {}, children: buildEducationReportDocxChildren(context, depth) }],
  });
  return Packer.toBlob(doc);
}
