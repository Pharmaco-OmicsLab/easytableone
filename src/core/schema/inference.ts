import type { ColumnType, DataFrame, SchemaColumn } from "../types";
import { naturalOrdinalCompare } from "../format/levelOrdering";

function isWholeNumber(val: any): boolean {
  if (typeof val === "number") return Number.isInteger(val);
  if (typeof val === "string") {
    const n = Number(val);
    return !Number.isNaN(n) && Number.isInteger(n);
  }
  return false;
}

function isNumeric(val: any): boolean {
  if (typeof val === "number") return true;
  if (typeof val === "string" && val.trim() !== "") return !Number.isNaN(Number(val));
  return false;
}

function parseDateStrict(val: any): boolean {
  if (typeof val !== "string") return false;
  const d = new Date(val);
  return (
    !Number.isNaN(d.getTime()) &&
    val.length > 5 &&
    /[0-9]/.test(val) &&
    !/^\d+$/.test(val) &&
    !isNumeric(val)
  );
}

function isRangeOrThresholdLabel(val: any): boolean {
  const label = String(val).trim();
  const num = String.raw`[-+]?(?:\d+\.?\d*|\.\d+)`;
  const range = new RegExp(String.raw`^[\[\(]?\s*${num}\s*-\s*${num}\s*[\]\)]?$`);
  const threshold = new RegExp(String.raw`^(?:<=|>=|<|>)\s*${num}$`);
  const plus = new RegExp(String.raw`^${num}\s*\+$`);
  return range.test(label) || threshold.test(label) || plus.test(label);
}

function isOrderedRangeCategorical(uniqueValues: any[], allNumeric: boolean): boolean {
  if (uniqueValues.length < 3 || allNumeric) return false;
  return uniqueValues.every(isRangeOrThresholdLabel);
}

export function inferSchema(data: DataFrame): SchemaColumn[] {
  return data.columns.map((col, colIndex) => {
    const nonNullValues = data.rows.map((r) => r[colIndex]).filter((v) => v !== null && v !== "");
    const uniqueValues = Array.from(new Set(nonNullValues));
    const cardinality = uniqueValues.length;
    const n = nonNullValues.length;

    const allNumeric = nonNullValues.every(isNumeric);
    const allWholeNumbers = nonNullValues.every(isWholeNumber);

    // Check Date
    let dateCount = 0;
    for (const val of nonNullValues) {
      if (parseDateStrict(val)) dateCount++;
    }
    if (n > 0 && dateCount / n > 0.9) {
      return createSchemaColumn(col.name, "date", cardinality, uniqueValues);
    }

    // Check id_like
    const nameIsId = /(^|_)id($|_)/i.test(col.name);
    // id_like if cardinality == N or name indicates it.
    if ((cardinality === n && n > 0 && cardinality > 20) || nameIsId) {
      if (!allNumeric || allWholeNumbers) {
        return createSchemaColumn(col.name, "id_like", cardinality, uniqueValues);
      }
    }

    // Check binary
    if (cardinality === 2) {
      if (allNumeric && !allWholeNumbers) {
        return createSchemaColumn(col.name, "continuous", cardinality, uniqueValues);
      }
      return createSchemaColumn(col.name, "binary", cardinality, uniqueValues);
    }

    // 3-4 level whole-number columns still auto-classify as coded categories.
    if (allNumeric && allWholeNumbers && cardinality >= 3 && cardinality <= 4) {
      return createSchemaColumn(col.name, "categorical_nominal", cardinality, uniqueValues);
    }

    // 5-10 whole-number columns keep the old default; the Schema-stage nudge is derived at render.
    if (allNumeric && allWholeNumbers && cardinality >= 5 && cardinality <= 10) {
      return createSchemaColumn(
        col.name,
        "categorical_nominal",
        cardinality,
        uniqueValues,
        undefined,
        allWholeNumbers,
      );
    }

    // continuous
    if (allNumeric && (!allWholeNumbers || cardinality > 10) && !nameIsId) {
      return createSchemaColumn(col.name, "continuous", cardinality, uniqueValues, undefined, allWholeNumbers);
    }

    // categorical_nominal
    if (cardinality >= 3 && cardinality <= 20) {
      if (isOrderedRangeCategorical(uniqueValues, allNumeric)) {
        const orderedValues = [...uniqueValues].sort((a, b) => naturalOrdinalCompare(String(a), String(b)));
        return createSchemaColumn(col.name, "categorical_ordinal", cardinality, orderedValues, undefined, allWholeNumbers);
      }
      return createSchemaColumn(col.name, "categorical_nominal", cardinality, uniqueValues, undefined, allWholeNumbers);
    }

    // Constant column: one distinct non-null value. Determinable, just not analyzable.
    if (n > 0 && cardinality === 1) {
      const only = String(uniqueValues[0]);
      return createSchemaColumn(
        col.name,
        "unsupported",
        cardinality,
        uniqueValues,
        `Constant column - only one value ("${only}") present. A variable needs >=2 distinct values to be tabulated.`,
      );
    }

    // Check unsupported / high cardinality
    if (cardinality > 20) {
      return createSchemaColumn(
        col.name,
        "unsupported",
        cardinality,
        uniqueValues,
        `Excluded by default - ${cardinality} unique values exceeds the 20-level threshold.`,
      );
    }

    return createSchemaColumn(
      col.name,
      "unsupported",
      cardinality,
      uniqueValues,
      "Excluded by default - unable to determine type.",
    );
  });
}

function createSchemaColumn(
  name: string,
  type: ColumnType,
  cardinality: number,
  uniqueValues: any[],
  exclusionReason?: string,
  isWholeNumberNumeric: boolean = uniqueValues.length > 0 && uniqueValues.every(isWholeNumber),
): SchemaColumn {
  let tier: "ok" | "warn" | "flag" = "ok";
  if (type === "categorical_nominal" || type === "numeric_encoded_categorical_ambiguous") {
    if (cardinality >= 11 && cardinality <= 20) tier = "warn";
    else if (cardinality > 20) tier = "flag";
  } else if (type === "unsupported" || type === "date") {
    tier = "flag";
  }

  const col: SchemaColumn = {
    name,
    inferredType: type,
    confirmedType: type,
    cardinalityTier: tier,
    distinctCount: cardinality,
    isWholeNumberNumeric,
    exclusionReason:
      tier === "flag"
        ? exclusionReason || `Excluded due to high cardinality (${cardinality}).`
        : undefined,
  };

  if (
    type === "categorical_nominal" ||
    type === "categorical_ordinal" ||
    type === "numeric_encoded_categorical_ambiguous" ||
    type === "binary"
  ) {
    col.levels = uniqueValues.map((v, index) => ({ code: v, label: String(v), ...(type === "categorical_ordinal" ? { order: index } : {}) }));
  }

  return col;
}
