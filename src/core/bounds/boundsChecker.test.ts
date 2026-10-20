import { describe, expect, it } from "vitest";
import type { SchemaColumn } from "../types";
import { checkColumnBounds, loadBoundsLibrary, normalizeBoundsUnit } from "./boundsChecker";

function col(name: string, extra: Partial<SchemaColumn> = {}): SchemaColumn {
  return {
    name,
    inferredType: "continuous",
    confirmedType: "continuous",
    cardinalityTier: "ok",
    ...extra,
  };
}

describe("boundsChecker", () => {
  const adult = loadBoundsLibrary("adult");
  const pediatric = loadBoundsLibrary("pediatric");

  it("detects implausible adult age values", () => {
    const result = checkColumnBounds(col("age"), [25, 45, 999, 67], adult!, "metric");
    expect(result?.conceptId).toBe("age");
    expect(result?.violations).toEqual([{ value: 999, rowIndex: 2 }]);
  });

  it("matches aliases and fuzzy names", () => {
    const weightKg = checkColumnBounds(col("weight_kg"), [65, 82, 701, 55], adult!, "metric");
    expect(weightKg?.conceptId).toBe("weight");
    expect(weightKg?.violations).toEqual([{ value: 701, rowIndex: 2 }]);

    const wt = checkColumnBounds(col("wt"), [50, 200, 65], adult!, "metric");
    expect(wt?.conceptId).toBe("weight");
    expect(wt?.matchedBy).toBe("alias_exact");
    expect(wt?.violations).toEqual([]);
  });

  it("returns null when no concept matches or population is other", () => {
    expect(checkColumnBounds(col("xyz_measure"), [1, 2, 3], adult!, "metric")).toBeNull();
    expect(checkColumnBounds(col("albumin_creatinine_ratio"), [1000], adult!, "metric")).toBeNull();
    expect(loadBoundsLibrary("other")).toBeNull();
  });

  it("dispatches adult and pediatric libraries independently", () => {
    const peds = checkColumnBounds(col("weight"), [201], pediatric!, "metric");
    const adults = checkColumnBounds(col("weight"), [201], adult!, "metric");
    expect(peds?.violations).toEqual([{ value: 201, rowIndex: 0 }]);
    expect(adults?.violations).toEqual([]);
  });

  it("skips nulls, returns matched no-violation results, normalizes names, and honors dictionary tags", () => {
    const age = checkColumnBounds(col("age"), [null, 42, null], adult!, "metric");
    expect(age?.violations).toEqual([]);

    const hr = checkColumnBounds(col("Heart Rate (BPM)"), [75, 360], adult!, "metric");
    expect(hr?.conceptId).toBe("heart_rate");
    expect(hr?.violations).toEqual([{ value: 360, rowIndex: 1 }]);

    const hb = checkColumnBounds(col("any_column", { boundsConceptId: "hemoglobin" }), [0.9], adult!, "metric");
    expect(hb?.conceptId).toBe("hemoglobin");
    expect(hb?.matchedBy).toBe("dictionary_tag");
  });

  it("does not let generic serum prefixes overpower concept tokens", () => {
    const result = checkColumnBounds(col("serum_creatinine"), [0.8], adult!, "metric");
    expect(result?.conceptId).toBe("creatinine");
    expect(result?.matchedBy).toBe("alias_exact");
    expect(result?.violations).toEqual([]);
  });

  it("suppresses declared-unit mismatches while retaining unit-normalized matches (D98)", () => {
    const plateletValues = Array.from({ length: 299 }, () => 263000);
    expect(checkColumnBounds(col("platelets", { units: "platelets/µL" }), plateletValues, adult!, "metric")).toBeNull();
    expect(checkColumnBounds(col("platelets"), plateletValues, adult!, "metric")?.violations).toHaveLength(299);
    expect(checkColumnBounds(col("serum_creatinine", { units: "mg/dL" }), [0.8], adult!, "metric")).toBeNull();
    expect(checkColumnBounds(col("age", { units: "years" }), [999], adult!, "metric")?.violations).toEqual([{ value: 999, rowIndex: 0 }]);
    expect(normalizeBoundsUnit("µmol/L")).toBe(normalizeBoundsUnit("umol/L"));
    expect(normalizeBoundsUnit("uMol/l")).toBe(normalizeBoundsUnit("umol/L"));
  });

  it("rejects fuzzy matches with meaningful unaccounted tokens but retains qualifiers (D98)", () => {
    expect(checkColumnBounds(col("creatinine_phosphokinase"), [999], adult!, "metric")).toBeNull();
    expect(checkColumnBounds(col("patient_nbr"), [999], adult!, "metric")).toBeNull();
    for (const name of ["Creatinine_T0", "Creatinine_T1", "Albumin_T0", "Glucose_T0", "hba1c_percent", "creatinine_mg_dl"]) {
      expect(checkColumnBounds(col(name), [999], adult!, "metric")).not.toBeNull();
    }
    expect(checkColumnBounds(col("platelets"), [263000], adult!, "metric")?.matchedBy).toBe("alias_exact");
    expect(checkColumnBounds(col("anything", { boundsConceptId: "platelet_count" }), [263000], adult!, "metric")?.matchedBy).toBe("dictionary_tag");
  });
});
