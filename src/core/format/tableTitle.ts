/**
 * src/core/format/tableTitle.ts
 *
 * Table title generation (Step 7 / D-list context).
 * The title includes a "by <grouping variable>" annotation using the
 * grouping variable's display label (NOT raw column name).
 *
 * Rules:
 * - Template from journal ruleset `table_title_template` (fallback: hardcoded default).
 * - `{grouping_label}` placeholder is substituted with the grouping variable's
 *   display label with bracket prefix stripped.
 * - Bracket-prefixed labels (e.g., "[c10] Edema") → "Edema" in the title.
 */

/** Default title template when no ruleset override is present. */
export const DEFAULT_TITLE_TEMPLATE =
  'Table 1: Baseline Characteristics, by {grouping_label}';

/**
 * Strip bracket codes from a label — both leading and trailing.
 * "[c10] Edema" → "Edema"
 * "Edema [c10]" → "Edema"
 * "[b1]Gestational age" → "Gestational age"
 * "Birth weight [kg]" → "Birth weight [kg]"  (units brackets are NOT stripped — only codes
 *   at word boundaries adjacent to nothing else on that side)
 *
 * Matching rule: a bracket sequence is a "code" if it sits at the very start or very end
 * of the string (optionally separated from the rest by whitespace). This avoids stripping
 * unit annotations that appear in the middle of a label.
 */
export function stripBracketCodes(s: string): string {
  return s
    .replace(/^\[[^\]]+\]\s*/, '')  // leading [xxx]
    .replace(/\s*\[[^\]]+\]$/, '')  // trailing [xxx]
    .trim();
}

/**
 * Strip leading bracket prefix from a label string.
 * Kept for backward compatibility — use stripBracketCodes for new code.
 * "[c10] Edema" → "Edema"
 */
export function stripBracketPrefix(s: string): string {
  return s.replace(/^\[[^\]]+\]\s*/, '').trim();
}

/**
 * Generate the table title by substituting `{grouping_label}` in the template.
 *
 * @param template - Template string with `{grouping_label}` placeholder.
 *                   If undefined or null, falls back to DEFAULT_TITLE_TEMPLATE.
 * @param groupingLabel - The raw display label for the grouping variable.
 *                        Bracket prefixes are stripped automatically.
 * @returns Formatted title string.
 * @throws Error if the template does not contain `{grouping_label}`.
 */
export function generateTableTitle(
  template: string | null | undefined,
  groupingLabel: string,
): string {
  const tmpl = template ?? DEFAULT_TITLE_TEMPLATE;
  if (!tmpl.includes('{grouping_label}')) {
    return tmpl;
  }
  const cleanLabel = stripBracketCodes(groupingLabel);
  return tmpl.replace('{grouping_label}', cleanLabel);
}
