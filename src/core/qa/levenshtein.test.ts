import { describe, expect, it } from 'vitest';
import { getLevenshteinDistance } from './levenshtein';

describe('getLevenshteinDistance', () => {
  it('computes correct edit distance', () => {
    expect(getLevenshteinDistance('', '')).toBe(0);
    expect(getLevenshteinDistance('a', '')).toBe(1);
    expect(getLevenshteinDistance('', 'b')).toBe(1);
    expect(getLevenshteinDistance('abc', 'abc')).toBe(0);
    expect(getLevenshteinDistance('kitten', 'sitting')).toBe(3);
    expect(getLevenshteinDistance('parapsilosis', 'parapsilsis')).toBe(1);
    expect(getLevenshteinDistance('Male', 'male')).toBe(1);
    expect(getLevenshteinDistance('Yes', 'yes')).toBe(1);
  });
});
