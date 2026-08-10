import type { Schema } from "../types";

export interface EDAMissingnessVariable {
  name: string;
  displayLabel: string;
  missingCount: number;
  missingPct: number;
}

export interface EDAIndicatorCorrelation {
  colA: string;
  displayA: string;
  colB: string;
  displayB: string;
  correlation: number;
}

export interface EDAMcarResult {
  statistic: number | null;
  df: number;
  pValue: number | null;
  nPatterns: number;
  note: string;
  experimental?: boolean;
  verdict?: "consistent_with_mcar" | "inconsistent_with_mcar" | null;
  approximationNote?: string | null;
}

export interface EDACorrelationPair {
  colA: string;
  displayA: string;
  colB: string;
  displayB: string;
  r: number;
  rho?: number;
}

export interface EDAFlaggedPair {
  colA: string;
  displayA: string;
  colB: string;
  displayB: string;
  pearsonR: number;
  spearmanRho: number;
}

export interface EDABivariatePlot {
  variable: string;
  displayLabel: string;
  plotType: "boxplot" | "stacked_bar";
  png: string;
}

export interface EDAMosaicPair {
  colA: string;
  displayA: string;
  colB: string;
  displayB: string;
  png: string;
}

export interface EDAVifRow {
  variable: string;
  displayLabel: string;
  vif: number | null;
  severity: "ok" | "elevated" | "high";
}

export interface EDAResults {
  missingness: {
    perVariable: EDAMissingnessVariable[];
    indicatorCorrelations: EDAIndicatorCorrelation[];
    heatmapPng: string | null;
    mcar?: EDAMcarResult | null;
  };
  correlations: {
    pairs: EDACorrelationPair[];
    flagged: EDAFlaggedPair[];
    nContinuous: number;
    variableOrder: string[];
  };
  bivariate: {
    groupingVariable: string;
    groupingDisplayLabel: string;
    plots: EDABivariatePlot[];
  } | null;
  mosaic?: {
    pairs: EDAMosaicPair[];
  };
  vif?: EDAVifRow[];
  schemaFingerprint: string;
  generatedAt: string;
}

export function computeSchemaFingerprint(schema: Schema | null | undefined): string {
  if (!schema) return "";
  return schema.columns
    .map((column) => `${column.name}:${column.confirmedType}:${column.exclusionReason ?? ""}`)
    .join("|");
}
