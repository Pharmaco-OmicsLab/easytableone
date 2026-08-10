import type { SchemaColumn } from "../types";

export type SchemaReviewSignal = {
  level: "ok" | "warn" | "flag";
  message?: string;
};

const CATEGORY_TYPES = new Set(["binary", "categorical_nominal", "categorical_ordinal"]);

function isCategoryType(type: SchemaColumn["confirmedType"]): boolean {
  return CATEGORY_TYPES.has(type);
}

export function deriveSchemaReviewSignal(col: SchemaColumn): SchemaReviewSignal {
  if (col.exclusionReason) return { level: "ok" };

  const distinctCount = col.distinctCount ?? 0;
  const isWholeNumberNumeric = col.isWholeNumberNumeric ?? false;

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

  if (col.confirmedType === "unsupported" || col.confirmedType === "date" || distinctCount > 20) {
    return {
      level: "flag",
      message:
        col.exclusionReason ||
        (distinctCount > 20
          ? `${distinctCount} distinct values exceeds the 20-level threshold. Exclude it if this is an identifier or free text, or recode it before analysis.`
          : "This column type is not used in Table 1. Exclude it or recode it before analysis."),
    };
  }

  return { level: "ok" };
}
