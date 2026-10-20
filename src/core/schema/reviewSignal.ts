import type { SchemaColumn } from "../types";

export type SchemaReviewSignal = {
  level: "ok" | "warn" | "flag";
  message?: string;
};

const CATEGORY_TYPES = new Set(["binary", "categorical_nominal", "categorical_ordinal"]);

const ORDINAL_SCALE_NAME =
  /(^|[_\s\-.])(nyha|asa|ecog|mrs|killip|gcs|kps|tnm|stage|grade|class|score|severity|likert|child[_\s-]?pugh|giai[_\s]?doan|phan[_\s]?do|muc[_\s]?do)([_\s\-.]|\d|$)/i;

function isCategoryType(type: SchemaColumn["confirmedType"]): boolean {
  return CATEGORY_TYPES.has(type);
}

export function deriveSchemaReviewSignal(col: SchemaColumn): SchemaReviewSignal {
  if (col.exclusionReason) return { level: "ok" };

  const distinctCount = col.distinctCount ?? 0;
  const isWholeNumberNumeric = col.isWholeNumberNumeric ?? false;

  if (
    col.confirmedType === "categorical_nominal" &&
    (col.isWholeNumberNumeric ?? false) &&
    (col.distinctCount ?? 0) >= 3 &&
    (col.distinctCount ?? 0) <= 10 &&
    (ORDINAL_SCALE_NAME.test(col.name) ||
      ORDINAL_SCALE_NAME.test(col.displayLabel ?? "") ||
      ORDINAL_SCALE_NAME.test(col.label ?? ""))
  ) {
    return {
      level: "warn",
      // Keep this in sync with SchemaStage TYPE_META.categorical_ordinal.label.
      message: `Looks like an ordered clinical scale (${col.distinctCount} whole-number codes). If the codes have a natural order (e.g. NYHA I–IV, cancer stage), set the type to "Ordered category (ordinal)" so levels keep their order.`,
    };
  }

  if (
    isCategoryType(col.confirmedType) &&
    isWholeNumberNumeric &&
    distinctCount >= 5 &&
    distinctCount <= 10
  ) {
    return {
      level: "warn",
      // Keep this in sync with SchemaStage TYPE_META.continuous.label.
      message: `${distinctCount} distinct whole-number values - confirm this is a category, not a measurement. If it's a measurement, switch the type to "Numeric".`,
    };
  }

  if (isCategoryType(col.confirmedType) && distinctCount >= 11 && distinctCount <= 20) {
    return {
      level: "warn",
      message: `${distinctCount} distinct values - high cardinality. Confirm this is a category and not free text or an identifier; exclude it if it should not appear in Table 1.`,
    };
  }

  if (col.confirmedType === "unsupported" || col.confirmedType === "date") {
    return {
      level: "flag",
      message:
        col.exclusionReason ||
        "This column type is not used in Table 1. Exclude it or recode it before analysis.",
    };
  }

  const isCardinalitySensitive =
    isCategoryType(col.confirmedType) ||
    col.confirmedType === "numeric_encoded_categorical_ambiguous";

  if (isCardinalitySensitive && distinctCount > 20) {
    return {
      level: "flag",
      message:
        `${distinctCount} distinct values exceeds the 20-level threshold for a category. ` +
        `If this is a measurement, switch the type to "Numeric"; if it is an identifier or free text, exclude it.`,
    };
  }

  return { level: "ok" };
}
