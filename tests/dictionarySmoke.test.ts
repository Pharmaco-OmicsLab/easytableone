/**
 * Structural smoke test: exactly one exported function in src/core/dictionary/
 * matches /apply.*[Dd]ictionary/, which must be `applyDetectedDictionary`.
 * Catches future re-forks of the dictionary-apply logic into parallel helpers.
 * See Round 7e.1.
 */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { it, expect } from 'vitest';

it('src/core/dictionary/ exports exactly one function matching /apply.*[Dd]ictionary/ (7e.1 smoke)', () => {
  const dir = join(process.cwd(), 'src', 'core', 'dictionary');
  const files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
  const matches: string[] = [];
  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8');
    // Matches: export function applyXxxDictionary or export async function applyXxxDictionary
    const re = /export\s+(?:async\s+)?function\s+(apply\w*[Dd]ictionary\w*)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(content)) !== null) {
      matches.push(`${file}::${m[1]}`);
    }
  }
  expect(matches).toHaveLength(1);
  expect(matches[0]).toContain('applyDetectedDictionary');
});
