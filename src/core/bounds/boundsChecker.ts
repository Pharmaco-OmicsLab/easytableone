import type { SchemaColumn } from '../types';
import adultBounds from './bounds_adults.json';
import pediatricBounds from './bounds_pediatric.json';
import { jaroWinkler } from './jaroWinkler';
import type { BoundsConcept, BoundsLibrary, BoundsViolation } from './types';

export type ResearchPopulation = 'adult' | 'pediatric' | 'other';
export type UnitSystem = 'metric' | 'imperial';

export interface BoundsCheckResult {
  conceptId: string;
  conceptLabel: string;
  unit: string;
  lower: number;
  upper: number;
  violations: BoundsViolation[];
  matchedBy: 'jaro_winkler' | 'dictionary_tag' | 'alias_exact';
  matchScore?: number;
}

export function normalizeBoundsName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

export function loadBoundsLibrary(population: ResearchPopulation): BoundsLibrary | null {
  if (population === 'other') return null;
  return (population === 'pediatric' ? pediatricBounds : adultBounds) as BoundsLibrary;
}

function conceptById(library: BoundsLibrary, conceptId: string): BoundsConcept | undefined {
  return library.concepts.find((concept) => concept.concept_id === conceptId);
}

function matchConcept(
  column: SchemaColumn,
  library: BoundsLibrary,
): { concept: BoundsConcept; matchedBy: BoundsCheckResult['matchedBy']; matchScore?: number } | null {
  if (column.boundsConceptId) {
    const concept = conceptById(library, column.boundsConceptId);
    if (concept) return { concept, matchedBy: 'dictionary_tag' };
  }

  const normalizedName = normalizeBoundsName(column.name);
  for (const concept of library.concepts) {
    if (concept.aliases.map(normalizeBoundsName).includes(normalizedName)) {
      return { concept, matchedBy: 'alias_exact' };
    }
  }

  if (/(^|_)ratio($|_)/.test(normalizedName)) return null;

  let best: { concept: BoundsConcept; score: number } | null = null;
  for (const concept of library.concepts) {
    const score = Math.max(
      ...concept.aliases
        .map(normalizeBoundsName)
        .filter((alias) => hasMeaningfulTokenOverlap(normalizedName, alias))
        .map((alias) => jaroWinkler(normalizedName, alias)),
    );
    if (!best || score > best.score) {
      best = { concept, score };
    }
  }

  if (!best || best.score < 0.85) return null;
  return { concept: best.concept, matchedBy: 'jaro_winkler', matchScore: best.score };
}

function hasMeaningfulTokenOverlap(normalizedName: string, normalizedAlias: string): boolean {
  const nameTokens = normalizedName.split('_').filter(Boolean);
  const aliasTokens = normalizedAlias.split('_').filter(Boolean);
  const genericTokens = new Set(['s', 'serum', 'body', 'blood']);
  const meaningfulAliasTokens = aliasTokens.filter((token) => !genericTokens.has(token));

  if (meaningfulAliasTokens.length === 0) return true;
  return meaningfulAliasTokens.some((token) => nameTokens.includes(token));
}

export function checkColumnBounds(
  column: SchemaColumn,
  values: (number | null)[],
  library: BoundsLibrary,
  unitSystem: UnitSystem,
): BoundsCheckResult | null {
  const match = matchConcept(column, library);
  if (!match) return null;

  const bounds = match.concept[unitSystem];
  const violations = values.reduce<BoundsViolation[]>((acc, value, rowIndex) => {
    if (value === null) return acc;
    if (value < bounds.lower || value > bounds.upper) {
      acc.push({ value, rowIndex });
    }
    return acc;
  }, []);

  return {
    conceptId: match.concept.concept_id,
    conceptLabel: match.concept.label,
    unit: bounds.unit,
    lower: bounds.lower,
    upper: bounds.upper,
    violations,
    matchedBy: match.matchedBy,
    matchScore: match.matchScore,
  };
}
