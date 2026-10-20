import type React from "react";
import faqMarkdown from "../../content/faq.md?raw";

export const FAQ_CATEGORIES = [
  "Basics & getting started",
  "Privacy & data security",
  "How it works & technical infrastructure",
  "Statistical methods",
  "Missing data, imputation & modeling",
  "Input data & dictionaries",
  "Reliability, validation & limitations",
  "Exports & journal formatting",
  "Troubleshooting",
] as const;

export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export interface FaqItem {
  id: string;
  category: FaqCategory;
  question: string;
  short: React.ReactNode;
  detail?: React.ReactNode;
  search: string;
}

const codeClass = "rounded bg-gray-100 px-1 text-xs";
const listClass = "list-disc space-y-1 pl-5";
const categorySet = new Set<string>(FAQ_CATEGORIES);

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[`"'’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeCategory(raw: string): FaqCategory | null {
  const category = raw.replace(/^\d+\.\s*/, "").trim();
  return categorySet.has(category) ? (category as FaqCategory) : null;
}

function stripMarkdown(text: string) {
  return text
    .replace(/<span style="color:\s*red;">([\s\S]*?)<\/span>/gi, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*<span style="color:\s*red;">\[CITATION PLACEHOLDER — TO BE FINALIZED\]<\/span>\*\*|`[^`]+`|\*\*[^*]+\*\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (token.startsWith("`")) {
      nodes.push(
        <code key={key} className={codeClass}>
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.includes("[CITATION PLACEHOLDER")) {
      nodes.push(
        <strong key={key} style={{ color: "red" }}>
          [CITATION PLACEHOLDER — TO BE FINALIZED]
        </strong>,
      );
    } else {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

function renderBlocks(markdown: string, keyPrefix: string) {
  const blocks = markdown
    .trim()
    .split(/\n{2,}/)
    .map((block) => block.replace(/^\s*-{3,}\s*$/gm, "").trim())
    .filter(Boolean);

  return (
    <div className="space-y-3">
      {blocks.map((block, blockIndex) => {
        const lines = block.split(/\n/).map((line) => line.trim()).filter(Boolean);
        const isList = lines.every((line) => line.startsWith("- "));
        if (isList) {
          return (
            <ul key={`${keyPrefix}-list-${blockIndex}`} className={listClass}>
              {lines.map((line, lineIndex) => (
                <li key={`${keyPrefix}-li-${blockIndex}-${lineIndex}`}>
                  {splitInlineMarkdown(line.replace(/^-\s*/, ""), `${keyPrefix}-li-${blockIndex}-${lineIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={`${keyPrefix}-p-${blockIndex}`}>
            {splitInlineMarkdown(lines.join(" "), `${keyPrefix}-p-${blockIndex}`)}
          </p>
        );
      })}
    </div>
  );
}

function extractSectionBody(lines: string[], startIndex: number, endIndex: number) {
  return lines.slice(startIndex, endIndex).join("\n").trim();
}

function parseFaqMarkdown(markdown: string): FaqItem[] {
  const lines = markdown.split(/\r?\n/);
  const items: FaqItem[] = [];
  let category: FaqCategory | null = null;
  let question: string | null = null;
  let bodyStart = -1;

  function commit(endIndex: number) {
    if (!category || !question || bodyStart < 0) return;
    const body = extractSectionBody(lines, bodyStart, endIndex);
    const shortMatch = body.match(/\*\*Short:\*\*\s*([\s\S]*?)(?=\n\n\*\*More detail:\*\*|$)/);
    if (!shortMatch) return;
    const detailMatch = body.match(/\*\*More detail:\*\*\s*([\s\S]*)$/);
    const shortText = shortMatch[1].trim();
    const detailText = detailMatch?.[1]?.trim();
    const id = slugify(`${category}-${question}`);
    const plainText = `${question} ${stripMarkdown(shortText)} ${detailText ? stripMarkdown(detailText) : ""}`.toLowerCase();

    items.push({
      id,
      category,
      question,
      short: renderBlocks(shortText, `${id}-short`),
      ...(detailText ? { detail: renderBlocks(detailText, `${id}-detail`) } : {}),
      search: plainText,
    });
  }

  lines.forEach((line, index) => {
    if (line.startsWith("## ") && !line.startsWith("## How to read")) {
      commit(index);
      category = normalizeCategory(line.replace(/^##\s+/, ""));
      question = null;
      bodyStart = -1;
      return;
    }

    if (line.startsWith("### ")) {
      commit(index);
      question = line.replace(/^###\s+/, "").trim();
      bodyStart = index + 1;
    }
  });
  commit(lines.length);

  return items;
}

export const FAQ_ITEMS: FaqItem[] = parseFaqMarkdown(faqMarkdown);
