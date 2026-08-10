/**
 * src/core/qa/levenshtein.ts
 *
 * Computes Levenshtein edit distance between two strings.
 * Used for detecting near-duplicate categorical values (D41).
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const d: number[][] = [];

  for (let i = 0; i <= a.length; i++) {
    d[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    d[0][j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(
        d[i - 1][j] + 1,      // deletion
        d[i][j - 1] + 1,      // insertion
        d[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return d[a.length][b.length];
}
