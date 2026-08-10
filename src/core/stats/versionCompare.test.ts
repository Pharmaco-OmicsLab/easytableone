import { describe, it, expect } from 'vitest';
import { compareVersions } from './versionCompare';

describe('compareVersions', () => {
  it('compares basic versions correctly', () => {
    expect(compareVersions('1.14.1', '1.15.0')).toBe(-1);
    expect(compareVersions('1.17.0', '1.15.0')).toBe(1);
    expect(compareVersions('1.15.0', '1.15.0')).toBe(0);
  });

  it('handles pre-release alphabetic segments', () => {
    expect(compareVersions('314.0.0a1', '314.0.0')).toBe(-1); // alpha < release
  });

  it('handles zero-padded short forms correctly', () => {
    expect(compareVersions('1.15', '1.15.0')).toBe(0);
  });
});
