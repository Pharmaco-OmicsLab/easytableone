export interface ParsedLevel {
  code: string | number;
  label: string;
}

export interface ParseResult {
  levels: ParsedLevel[];
  warnings: string[];
}

export function parseEncodingString(input: string): ParseResult {
  const warnings: string[] = [];
  const trimmed = input.trim().replace(/^["']|["']$/g, '');
  if (!trimmed) return { levels: [], warnings };

  // Split on comma, semicolon, or newline. Periods stay inside labels (e.g. "C.albicans").
  let tokens = trimmed.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);

  // If only one token came out but it looks like multiple "N. Label" segments
  // (i.e., space-separated rather than comma-separated), split on whitespace
  // that precedes a digit followed by a separator or just text.
  if (tokens.length === 1 && /\d+\s*[.:=]?\s*\S/.test(tokens[0])) {
    tokens = tokens[0].split(/(?<=\S)\s+(?=\d+\s*[.:=]?\s*\S)/).map((s) => s.trim()).filter(Boolean);
  }

  // ALSO handle the no-separator pattern: "1 Non-survival 2 Survival"
  // If the above split didn't fully resolve it and we still have a long string:
  if (tokens.length === 1) {
    const matches = [...tokens[0].matchAll(/(\d+)\s+([^\d]+?)(?=\s+\d+\s|$)/g)];
    if (matches.length >= 2) {
      tokens = matches.map((m) => `${m[1]} ${m[2].trim()}`);
    }
  }

  const raw: Array<{ code: string; label: string }> = [];
  for (const tok of tokens) {
    // Match: optional whitespace, the code (digits or non-separator chars),
    // optional whitespace, then a separator (':', '=', '.'), then label.
    // Or: digits followed by a single space then label (no separator).
    let m = tok.match(/^\s*(\d+(?:\.\d+)?|[^\s:=.]+)\s*[:=.]\s*(.*)$/);
    if (!m) {
      m = tok.match(/^\s*(\d+)\s+(.*)$/);  // "1 Yes" pattern
    }
    if (m) {
      const code = m[1].trim();
      const label = m[2].trim();
      if (label || code) raw.push({ code, label: label || code });
    } else {
      warnings.push(`Could not parse encoding token: ${JSON.stringify(tok)}`);
    }
  }

  // Normalize code types: if all codes are integer strings, store as numbers.
  const allInt = raw.length > 0 && raw.every((r) => /^-?\d+$/.test(r.code));
  const allNumeric = raw.length > 0 && raw.every((r) => !isNaN(parseFloat(r.code)));

  const levels: ParsedLevel[] = raw.map((r) => ({
    code: allInt ? parseInt(r.code, 10) : (allNumeric ? parseFloat(r.code) : r.code),
    label: r.label,
  }));

  // De-duplicate by stringified code, keeping the first occurrence.
  const seen = new Set<string>();
  const deduped: ParsedLevel[] = [];
  for (const lv of levels) {
    const k = String(lv.code);
    if (!seen.has(k)) {
      seen.add(k);
      deduped.push(lv);
    } else {
      warnings.push(`Duplicate code ${JSON.stringify(lv.code)} in encoding string; kept first.`);
    }
  }

  return { levels: deduped, warnings };
}
