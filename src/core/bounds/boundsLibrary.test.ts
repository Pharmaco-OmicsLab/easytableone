import { describe, expect, it } from "vitest";
import adultBounds from "./bounds_adults.json";
import pediatricBounds from "./bounds_pediatric.json";
import type { BoundsLibrary } from "./types";

function assertLibraryShape(library: BoundsLibrary) {
  expect(library.version).toBeTruthy();
  expect(library.concepts.length).toBeGreaterThanOrEqual(20);
  const conceptIds = new Set<string>();
  for (const concept of library.concepts) {
    expect(concept.concept_id).toBeTruthy();
    expect(concept.aliases.length).toBeGreaterThan(0);
    expect(concept.metric.lower).toBeTypeOf("number");
    expect(concept.metric.upper).toBeTypeOf("number");
    expect(concept.metric.unit).toBeTruthy();
    expect(concept.imperial.lower).toBeTypeOf("number");
    expect(concept.imperial.upper).toBeTypeOf("number");
    expect(concept.imperial.unit).toBeTruthy();
    expect(conceptIds.has(concept.concept_id)).toBe(false);
    conceptIds.add(concept.concept_id);
  }
}

describe("bounds libraries", () => {
  const adult = adultBounds as BoundsLibrary;
  const pediatric = pediatricBounds as BoundsLibrary;

  it("parses adult and pediatric libraries with required concept fields", () => {
    assertLibraryShape(adult);
    assertLibraryShape(pediatric);
  });

  it("contains expected adult and pediatric differences", () => {
    const adultWeight = adult.concepts.find((c) => c.concept_id === "weight");
    const pediatricWeight = pediatric.concepts.find((c) => c.concept_id === "weight");
    const adultHeartRate = adult.concepts.find((c) => c.concept_id === "heart_rate");
    const pediatricHeartRate = pediatric.concepts.find((c) => c.concept_id === "heart_rate");

    expect(adultWeight?.metric.upper).toBe(700);
    expect(pediatricWeight?.metric.upper).toBe(200);
    expect(adultHeartRate?.metric.upper).toBe(350);
    expect(pediatricHeartRate?.metric.upper).toBe(330);
  });

  it("keeps imperial hooks for weight and height", () => {
    for (const library of [adult, pediatric]) {
      for (const conceptId of ["weight", "height"]) {
        const concept = library.concepts.find((c) => c.concept_id === conceptId);
        expect(concept?.imperial.lower).toBeTypeOf("number");
        expect(concept?.imperial.upper).toBeTypeOf("number");
        expect(concept?.imperial.unit).toBeTruthy();
      }
    }
  });
});
