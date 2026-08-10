/**
 * Jaro-Winkler similarity between two strings.
 * Returns a value in [0, 1]. 1 = identical; 0 = completely dissimilar.
 * Standard p=0.1 prefix scaling factor.
 */
export function jaroWinkler(s1: string, s2: string): number {
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();
  const lenA = a.length;
  const lenB = b.length;

  if (lenA === 0 || lenB === 0) return 0;
  if (a === b) return 1;

  const matchDistance = Math.max(Math.floor(Math.max(lenA, lenB) / 2) - 1, 0);
  const matchedA = new Array<boolean>(lenA).fill(false);
  const matchedB = new Array<boolean>(lenB).fill(false);

  let matches = 0;
  for (let i = 0; i < lenA; i++) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(i + matchDistance + 1, lenB);
    for (let j = start; j < end; j++) {
      if (matchedB[j] || a[i] !== b[j]) continue;
      matchedA[i] = true;
      matchedB[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  const charsA: string[] = [];
  const charsB: string[] = [];
  for (let i = 0; i < lenA; i++) {
    if (matchedA[i]) charsA.push(a[i]);
  }
  for (let j = 0; j < lenB; j++) {
    if (matchedB[j]) charsB.push(b[j]);
  }

  let transpositions = 0;
  for (let i = 0; i < charsA.length; i++) {
    if (charsA[i] !== charsB[i]) transpositions++;
  }
  const halfTranspositions = transpositions / 2;

  const jaro = (
    matches / lenA +
    matches / lenB +
    (matches - halfTranspositions) / matches
  ) / 3;

  let prefix = 0;
  const prefixLimit = Math.min(4, lenA, lenB);
  while (prefix < prefixLimit && a[prefix] === b[prefix]) {
    prefix++;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}
