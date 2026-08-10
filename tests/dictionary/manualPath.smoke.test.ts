/**
 * tests/dictionary/manualPath.smoke.test.ts  (7g.2)
 *
 * Canary test for the manual sheet-picker path.
 * Drives classifyColumnsFromDict with a fungi-shaped DictionaryMap and asserts
 * that the resulting schema columns have human-readable level labels — not raw
 * codes.  This is the regression guard against the 7f consolidation failure where
 * both paths produced {code:2, label:"2"} instead of {code:2, label:"No"}.
 */
import { describe, it, expect } from 'vitest';
import { classifyColumnsFromDict, type DictionaryMap } from '../../src/core/dictionary/importer';
import type { SchemaColumn } from '../../src/core/types';

// ── Fungi-like DictionaryMap (as built by DictionaryStage.tsx manual path) ────
// Keys match the raw data column names.  levels come from parseEncodingString
// on the encoding/definition column cells.
const fungiDict: DictionaryMap = {
  '[b1]GA': { label: 'Gestational age (weeks)', units: '(weeks)' },
  '[b2]BW': { label: 'Birth weight (g)', units: '(g)' },
  '[c9]SkinColor': {
    label: 'Skin color',
    levels: [
      { code: 1, label: 'Non-white' },
      { code: 2, label: 'White' },
    ],
  },
  '[c10]Edema': {
    label: 'Edema',
    levels: [
      { code: 1, label: 'Yes' },
      { code: 2, label: 'No' },
    ],
  },
  '[c11]Malnutrition': {
    label: 'Malnutrition grade II/III',
    levels: [
      { code: 1, label: 'Yes' },
      { code: 2, label: 'No' },
    ],
  },
  '[d2]Species': {
    label: 'Candida species',
    levels: [
      { code: 1, label: 'C.albicans' },
      { code: 2, label: 'C.tropicalis' },
      { code: 3, label: 'Other' },
    ],
  },
  '[g1]Survival': {
    label: 'Survival',
    levels: [
      { code: 1, label: 'Survival' },
      { code: 2, label: 'Non-survival' },
    ],
  },
};

// ── Inferred schema simulating what inferSchema would produce ─────────────────
const inferredSchema: SchemaColumn[] = [
  { name: '[b1]GA',    inferredType: 'continuous',    confirmedType: 'continuous',    cardinalityTier: 'ok' },
  { name: '[b2]BW',    inferredType: 'continuous',    confirmedType: 'continuous',    cardinalityTier: 'ok' },
  { name: '[c9]SkinColor', inferredType: 'numeric_encoded_categorical_ambiguous', confirmedType: 'numeric_encoded_categorical_ambiguous', cardinalityTier: 'ok' },
  { name: '[c10]Edema',    inferredType: 'numeric_encoded_categorical_ambiguous', confirmedType: 'numeric_encoded_categorical_ambiguous', cardinalityTier: 'ok' },
  { name: '[c11]Malnutrition', inferredType: 'numeric_encoded_categorical_ambiguous', confirmedType: 'numeric_encoded_categorical_ambiguous', cardinalityTier: 'ok' },
  { name: '[d2]Species',   inferredType: 'numeric_encoded_categorical_ambiguous', confirmedType: 'numeric_encoded_categorical_ambiguous', cardinalityTier: 'ok' },
  { name: '[g1]Survival',  inferredType: 'numeric_encoded_categorical_ambiguous', confirmedType: 'numeric_encoded_categorical_ambiguous', cardinalityTier: 'ok' },
];

describe('manual path (classifyColumnsFromDict) — canary tests (7g.2)', () => {
  const result = classifyColumnsFromDict(inferredSchema, fungiDict);

  // ── Continuous columns ───────────────────────────────────────────────────
  it('GA: displayLabel populated, units populated, no levels', () => {
    const col = result.find((c) => c.name === '[b1]GA')!;
    expect(col.displayLabel).toBe('Gestational age (weeks)');
    expect(col.units).toBe('(weeks)');
    expect(col.levels).toBeUndefined();
  });

  // ── Binary columns ───────────────────────────────────────────────────────
  it('Edema: classified as binary with human-readable levels (not raw codes)', () => {
    const col = result.find((c) => c.name === '[c10]Edema')!;
    expect(col.confirmedType).toBe('binary');
    // CANARY: level labels must be "Yes"/"No", not "1"/"2"
    expect(col.levels).toEqual([
      { code: 1, label: 'Yes' },
      { code: 2, label: 'No' },
    ]);
    expect(col.displayLabel).toBe('Edema');
  });

  it('Survival (grouping variable): binary with human-readable labels for group headers', () => {
    const col = result.find((c) => c.name === '[g1]Survival')!;
    expect(col.confirmedType).toBe('binary');
    // Group headers must render as "Survival" and "Non-survival", not "1" and "2"
    const labels = col.levels!.map((l) => l.label);
    expect(labels).toContain('Survival');
    expect(labels).toContain('Non-survival');
  });

  it('Malnutrition: classified as binary with human-readable levels (label-leak canary)', () => {
    const col = result.find((c) => c.name === '[c11]Malnutrition')!;
    expect(col.confirmedType).toBe('binary');
    expect(col.displayLabel).toBe('Malnutrition grade II/III');
    // CANARY: displayLabel must NOT be an encoding string like "1: Yes, 2: No"
    expect(col.displayLabel).not.toMatch(/\d+\s*:/);
    expect(col.levels![0].label).toBe('Yes');
  });

  // ── Multi-level categorical ───────────────────────────────────────────────
  it('Candida species: classified as categorical_nominal with 3 human-readable levels', () => {
    const col = result.find((c) => c.name === '[d2]Species')!;
    expect(col.confirmedType).toBe('categorical_nominal');
    expect(col.levels!.length).toBe(3);
    // CANARY: level labels must be species names, not raw codes "1"/"2"/"3"
    const labels = col.levels!.map((l) => l.label);
    expect(labels).toContain('C.albicans');
    expect(labels).toContain('C.tropicalis');
    expect(labels).toContain('Other');
  });

  it('Skin color: classified as binary with human-readable labels', () => {
    const col = result.find((c) => c.name === '[c9]SkinColor')!;
    expect(col.confirmedType).toBe('binary');
    const labels = col.levels!.map((l) => l.label);
    expect(labels).toContain('Non-white');
    expect(labels).toContain('White');
  });

  // ── Bracket-normalization (dict key without brackets) ────────────────────
  it('bracket-stripped dict keys match bracketed data column names', () => {
    const strippedDict: DictionaryMap = {
      GA: { label: 'Gestational age', units: 'weeks' },
      Edema: {
        label: 'Edema',
        levels: [{ code: 1, label: 'Yes' }, { code: 2, label: 'No' }],
      },
    };
    const schema: SchemaColumn[] = [
      { name: '[b1]GA', inferredType: 'continuous', confirmedType: 'continuous', cardinalityTier: 'ok' },
      { name: '[c10]Edema', inferredType: 'numeric_encoded_categorical_ambiguous', confirmedType: 'numeric_encoded_categorical_ambiguous', cardinalityTier: 'ok' },
    ];
    const r = classifyColumnsFromDict(schema, strippedDict);
    expect(r[0].displayLabel).toBe('Gestational age');
    expect(r[1].confirmedType).toBe('binary');
    expect(r[1].levels![0].label).toBe('Yes');
  });
});
