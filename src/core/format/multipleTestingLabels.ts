import type { AnalysisPlan } from "../types";

type MultipleTestingCorrection = AnalysisPlan["multipleTestingCorrection"];

export const multipleTestingLabels: Record<
  MultipleTestingCorrection,
  { method: string; header: string; footnote: string | null }
> = {
  none: { method: "", header: "P-value", footnote: null },
  bonferroni: {
    method: "Bonferroni correction",
    header: "P-value (Bonferroni-adjusted)",
    footnote: "P-value adjusted via bonferroni",
  },
  holm: {
    method: "Holm-Bonferroni correction",
    header: "P-value (Holm-adjusted)",
    footnote: "P-value adjusted via holm",
  },
  bh: {
    method: "Benjamini-Hochberg false discovery rate procedure",
    header: "P-value (BH-adjusted)",
    footnote: "P-value adjusted via bh",
  },
};
