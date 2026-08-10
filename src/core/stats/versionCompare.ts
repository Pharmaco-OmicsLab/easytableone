/**
 * Compare semantic-style version strings.
 * Returns -1 if a < b, 0 if equal, 1 if a > b.
 * Handles numeric and pre-release segments (e.g. "1.17.0", "314.0.0a1").
 */
export function compareVersions(a: string, b: string): number {
  const parse = (s: string) => s.split(/[.\-+]/).map((p) => {
    const n = Number(p);
    return isNaN(n) ? p : n;
  });
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (typeof da !== typeof db) return typeof da === 'string' ? -1 : 1;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}
