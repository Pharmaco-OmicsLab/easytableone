import { z } from "zod";

export const CellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type Cell = z.infer<typeof CellSchema>;

export const ParseWarningSchema = z.object({
  message: z.string(),
  row: z.number().optional(),
  column: z.string().optional(),
});
export type ParseWarning = z.infer<typeof ParseWarningSchema>;

export const DataFrameSchema = z.object({
  columns: z.array(
    z.object({
      originalName: z.string(),
      name: z.string(),
    }),
  ),
  rows: z.array(z.array(CellSchema)),
  meta: z.object({
    sourceFile: z.string(),
    sheetName: z.string().optional(),
    parseWarnings: z.array(ParseWarningSchema),
    locale: z.object({
      decimalSeparator: z.literal("."),
      thousandSeparator: z.literal(","),
    }),
    detectedHeaderRow: z.number(),
    confirmedHeaderRow: z.number(),
    encoding: z.string(),
    missingSentinels: z.array(z.string()),
    excelErrorCounts: z.record(z.string(), z.number().int().nonnegative()).optional(),
  }),
});
export type DataFrame = z.infer<typeof DataFrameSchema>;

export const ColumnTypeSchema = z.enum([
  "continuous",
  "binary",
  "categorical_nominal",
  "categorical_ordinal",
  "date",
  "id_like",
  "numeric_encoded_categorical_ambiguous",
  "unsupported",
]);
export type ColumnType = z.infer<typeof ColumnTypeSchema>;

export const SchemaColumnSchema = z.object({
  name: z.string(),
  inferredType: ColumnTypeSchema,
  confirmedType: ColumnTypeSchema,
  label: z.string().optional(),
  /** Display label from dictionary import or manual override. Used in docx, title, diagnostics. */
  displayLabel: z.string().optional(),
  units: z.string().optional(),
  boundsConceptId: z.string().optional(),
  levels: z
    .array(
      z.object({
        code: z.union([z.string(), z.number()]),
        label: z.string(),
        order: z.number().optional(),
      }),
    )
    .optional(),
  referenceLevel: z.union([z.string(), z.number()]).optional(),
  cardinalityTier: z.enum(["ok", "warn", "flag"]),
  distinctCount: z.number().int().nonnegative().optional(),
  isWholeNumberNumeric: z.boolean().optional(),
  exclusionReason: z.string().optional(),
  displayLevel: z.union([z.string(), z.number()]).optional(),
});
export type SchemaColumn = z.infer<typeof SchemaColumnSchema>;

export const SchemaSchema = z.object({
  columns: z.array(SchemaColumnSchema),
  dictionarySource: z.enum(["imported", "manual"]).optional(),
  dictionaryFingerprint: z.string().optional(),
});
export type Schema = z.infer<typeof SchemaSchema>;

export const QualityFlagSchema = z.object({
  type: z.string(),
  message: z.string(),
});
export type QualityFlag = z.infer<typeof QualityFlagSchema>;

export const DictionaryViolationSchema = z.object({
  declaredCodes: z.array(z.union([z.string(), z.number()])),
  undeclaredValues: z.array(
    z.object({
      value: z.union([z.string(), z.number()]),
      rowIndices: z.array(z.number().int().nonnegative()),
      count: z.number().int().nonnegative(),
    })
  ),
  resolutionStatus: z.enum(['unresolved', 'reupload_pending', 'treat_as_missing', 'levels_added']),
});
export type DictionaryViolation = z.infer<typeof DictionaryViolationSchema>;

export const DataQualityReportSchema = z.object({
  columns: z.array(
    z.object({
      name: z.string(),
      missingCount: z.number(),
      missingPercent: z.number(),
      outliers: z
        .object({
          method: z.enum(["iqr", "zscore"]),
          rowIndices: z.array(z.number()),
          values: z.array(z.number()),
        })
        .optional(),
      cardinality: z.number(),
      isConstant: z.boolean(),
      flags: z.array(QualityFlagSchema),
      dictionaryViolations: DictionaryViolationSchema.optional(),
    }),
  ),
  overallCompletenessPercent: z.number(),
  blockingErrors: z.array(
    z.object({
      kind: z.enum(["unsupported_type", "dictionary_compliance"]),
      columns: z.array(z.string()),
      message: z.string(),
    }),
  ),
});
export type DataQualityReport = z.infer<typeof DataQualityReportSchema>;

export const OutlierActionSchema = z.object({
  rowIndex: z.number().int().nonnegative(),
  action: z.enum(["keep", "exclude", "winsorize"]),
  winsorizeBound: z.enum(["p01_p99", "p025_p975", "p05_p95"]).optional(),
});
// NOTE: see PLAN.md §3.3 — for action='winsorize', winsorizeBound is column-wide;
// rowIndex is informational only. Validators do NOT enforce uniqueness of (rowIndex, col).
export type OutlierAction = z.infer<typeof OutlierActionSchema>;

export const StatisticalTestSchema = z.enum([
  "shapiro",
  "ttest",
  "anova",
  "mannwhitney",
  "kruskal",
  "chisquare",
  "fisher",
]);
export type StatisticalTest = z.infer<typeof StatisticalTestSchema>;

export const AuditEntrySchema = z.object({
  timestamp: z.string(),
  action: z.string(),
  details: z.record(
    z.string(),
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])),
    ]),
  ),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const CheckTierSchema = z.enum(["blocking", "review", "advisory"]);
export type CheckTier = z.infer<typeof CheckTierSchema>;

export const CheckCategorySchema = z.enum(["format", "quality", "beautify"]);
export type CheckCategory = z.infer<typeof CheckCategorySchema>;

export const CheckStageSchema = z.enum(["data-review", "plan"]);
export type CheckStage = z.infer<typeof CheckStageSchema>;

export const DataQualityFindingSchema = z.object({
  checkId: z.string(),
  tier: CheckTierSchema,
  category: CheckCategorySchema,
  variable: z.string().optional(),
  title: z.string(),
  detail: z.string(),
  requirement: z.string().optional(),
  remedy: z.string(),
  affectedCount: z.number().int().nonnegative().optional(),
  affectedRowsSample: z.array(z.number().int().nonnegative()).optional(),
  sampleValues: z.array(z.string()).optional(),
  assumedUnitNote: z.string().optional(),
  highlightedValues: z.array(z.union([z.string(), z.number()])).optional(),
  metadataOnly: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
});
export type DataQualityFinding = z.infer<typeof DataQualityFindingSchema>;

export const DataQualityRecordSchema = z.object({
  finding: DataQualityFindingSchema,
  response: z.enum(["fixed", "acknowledged", "overridden", "dismissed", "pending", "applied"]),
  timestamp: z.string(),
  fixDetails: z.string().optional(),
});
export type DataQualityRecord = z.infer<typeof DataQualityRecordSchema>;

export const UserOverridesSchema = z.object({
  numberFormat: z.object({
    thousandSeparator: z.boolean().optional(),
    decimalPlaces: z.number().min(0).max(4).optional(),
    suppressTrailingZeros: z.boolean().optional(),
  }).optional(),
  iqrDelimiter: z.string().optional(),
  pValueThreshold: z.string().regex(/^<\d*\.?\d+$/).optional(),
  pValueSignificantDigits: z.number().min(1).max(4).optional(),
  titleTemplate: z.string().optional(),
  variableCodingSectionTitle: z.string().nullable().optional(),
  showPlannedZeroCountLevels: z.boolean().optional(),
  showMissingDataRows: z.boolean().optional(),
  hidePValueColumn: z.boolean().optional(),
}).strict();
export type UserOverrides = z.infer<typeof UserOverridesSchema>;

export const TestMethodSchema = z.enum([
  "mann_whitney_u",
  "t_test",
  "welch_t_test",
  "chi_square",
  "fishers_exact",
  "kruskal_wallis",
  "oneway_anova",
  "ordinal_rank",
]);
export type TestMethod = z.infer<typeof TestMethodSchema>;

export const TestOverrideSchema = z.object({
  variable: z.string(),
  method: TestMethodSchema,
  timestamp: z.string(),
}).strict();
export type TestOverride = z.infer<typeof TestOverrideSchema>;

export const AnalysisPlanSchema = z.object({
  rulesetVersion: z.string(),
  appVersion: z.string(),
  researchPopulation: z.enum(["adult", "pediatric", "other"]).default("adult"),
  studyDesign: z.enum(["unspecified", "randomized_trial", "observational", "other"]).default("unspecified"),
  unitSystem: z.enum(["metric", "imperial"]).default("metric"),
  groupingVariable: z.string(),
  includedVariables: z.array(z.string()),
  variableConfig: z.record(
    z.string(),
    z.object({
      label: z.string(),
      units: z.string().optional(),
      treatAs: ColumnTypeSchema,
      referenceLevel: z.union([z.string(), z.number()]).optional(),
      bins: z
        .array(
          z.object({
            label: z.string(),
            min: z.number(),
            max: z.number(),
          }),
        )
        .optional(),
      missingness: z.enum(["drop_row", "drop_var", "flag", "impute_median", "impute_mode"]),
      outlierActions: z.array(OutlierActionSchema).optional(),
      statisticalTestOverride: StatisticalTestSchema.optional(),
      chiSquareYatesCorrection: z.boolean().optional(),
      displayLevel: z.union([z.string(), z.number()]).optional(),
      levelOrder: z.array(z.union([z.string(), z.number()])).optional(),
    }),
  ),
  showSMD: z.boolean(),
  showPValue: z.boolean(),
  multipleTestingCorrection: z.enum(["none", "bonferroni", "holm", "bh"]),
  randomSeed: z.number().optional(),
  groupOrder: z.array(z.union([z.string(), z.number()])).optional(),
  auditLog: z.array(AuditEntrySchema),
  userOverrides: UserOverridesSchema.optional(),
  testOverrides: z.array(TestOverrideSchema).optional(),
});
export type AnalysisPlan = z.infer<typeof AnalysisPlanSchema>;
export type StudyDesign = AnalysisPlan["studyDesign"];

export const SummaryStatSchema = z.record(z.string(), z.any());
export type SummaryStat = z.infer<typeof SummaryStatSchema>;

export const PostHocSchema = z.object({
  reason: z.string(),
  correction: z.enum(["tukey", "holm"]),
  method: z.enum(["tukey_hsd", "dunn", "pairwise_chi_square_fisher"]),
  pairs: z.array(z.object({
    groupA: z.string(),
    groupB: z.string(),
    pValueRaw: z.number().nullable(),
    pValueCorrected: z.number().nullable(),
    perPairTest: z.string().optional(),
    significant: z.boolean(),
  })),
  caveat: z.string().optional(),
  error: z.string().optional(),
});
export type PostHoc = z.infer<typeof PostHocSchema>;

export const StatisticalResultsSchema = z
  .object({
    perVariable: z.array(
      z.object({
        variable: z.string(),
        summaryByGroup: z.record(z.string(), SummaryStatSchema),
        overallSummary: SummaryStatSchema,
        test: z.object({
          name: z.string(),
          statistic: z.number().nullable(),
          pValue: z.number().nullable(),
          df: z.number().int().nullable().optional(),
          originalPValue: z.number().nullable().optional(),
          auxiliary: z.record(z.string(), z.union([z.number(), z.string()]).optional()).optional(),
        }),
        smd: z.number().nullable().optional(),
        postHoc: PostHocSchema.optional(),
        notes: z.array(z.string()),
        plotData: z.any().optional(),
      }),
    ),
    groups: z.array(
      z.object({
        name: z.string(),
        n: z.number(),
      }),
    ),
    totalN: z.number(),
    computeMetadata: z.object({
      libVersions: z.record(z.string(), z.string()),
      seed: z.number(),
    }),
  })
  .strict();
export type StatisticalResults = z.infer<typeof StatisticalResultsSchema>;

export const RecomputeVariableResultSchema = z.union([
  StatisticalResultsSchema.shape.perVariable.element,
  z.object({
    result: StatisticalResultsSchema.shape.perVariable.element,
    adjustedPValues: z.record(z.string(), z.number().nullable()),
  }).strict(),
]);
export type RecomputeVariableResult = z.infer<typeof RecomputeVariableResultSchema>;

export const FormattedTableSchema = z.object({
  journal: z.string(),
  rulesetVersion: z.string(),
  /** Table title with grouping variable annotation (Step 7). */
  title: z.string(),
  header: z.array(z.string()),
  headerFootnoteRefs: z.record(z.string(), z.array(z.string())).optional(),
  rows: z.array(
    z.object({
      indent: z.number(),
      cells: z.array(z.string()),
      isSubgroup: z.boolean(),
      footnoteRefs: z.array(z.string()),
    }),
  ),
  footnotes: z.array(
    z.object({
      marker: z.string(),
      text: z.string(),
    }),
  ),
  caption: z.string().optional(),
  methodsParagraph: z.string(),
  /** Variable coding notes section content (Step 4). One entry per recoded variable. */
  codingNotes: z.array(z.string()).optional(),
  dataQualityNotes: z.array(z.string()).optional(),
  dataQualitySectionTitle: z.string().nullable().optional(),
  variableCodingSectionTitle: z.string().nullable().optional(),
});
export type FormattedTable = z.infer<typeof FormattedTableSchema>;

export const NormalityLogicSchema = z.object({
  small_n_test: z.string(),
  small_n_threshold_p: z.number(),
  large_n_threshold_n: z.number(),
  large_n_skew_max: z.number(),
  large_n_kurt_max: z.number(),
});
export type NormalityLogic = z.infer<typeof NormalityLogicSchema>;

export const PlotThemeSchema = z.object({
  seaborn_style: z.enum(["ticks", "white", "whitegrid", "darkgrid", "dark"]),
  // Palette provenance: NEJM/JAMA/Lancet/Nature Medicine use ggsci palettes; Generic uses Tableau 10.
  color_palette: z.array(z.string()).min(2),
  font_family: z.string(),
  font_size_base: z.number().int().positive(),
  despine: z.boolean(),
  bar_edge_color: z.string(),
  bar_edge_linewidth: z.number().nonnegative(),
  line_width: z.number().positive(),
  figure_dpi_screen: z.number().int().positive(),
  figure_dpi_export: z.number().int().positive(),
});
export type PlotTheme = z.infer<typeof PlotThemeSchema>;

export const JournalConfigSchema = z.object({
  journal_id: z.string(),
  display_name: z.string(),
  provenance: z.object({
    source_title: z.string(),
    source_url: z.string().url().nullable(),
    retrieved_on: z.iso.date().nullable(),
    last_reviewed_on: z.iso.date(),
    notes: z.string(),
  }),
  missing_data_label: z.string().optional(),
  /** Title template. `{grouping_label}` placeholder substituted at render time (D40). */
  table_title_template: z.string().optional(),
  /** Section title for variable coding notes. null suppresses the section (D36). */
  variable_coding_section_title: z.string().nullable().optional(),
  data_quality_section_title: z.string().nullable().optional(),
  /** Number formatting policy (D40). */
  number_format: z.object({
    thousand_separator: z.boolean(),
    suppress_trailing_zero: z.boolean(),
    decimal_precision: z.number().int().nonnegative(),
  }).optional(),
  p_value_formatting: z.object({
    leading_zero: z.boolean(),
    max_decimal_places: z.number(),
    conditional_decimals: z.array(z.object({
      range: z.string(),
      decimals: z.number().optional(),
      display: z.string().optional()
    })).optional(),
    threshold_low: z.string(),
    significant_figures: z.number().int().positive().optional(),
    exact_p_values: z.boolean().optional(),
    decimal_separator: z.string().optional(),
    italicize_p: z.boolean()
  }),
  summary_statistics: z.object({
    continuous_normal: z.string(),
    continuous_non_normal: z.string(),
    continuous_label_template: z.string(),
    iqr_delimiter: z.string(),
    categorical: z.string(),
    percentage_decimals: z.number(),
    percentage_decimals_rule: z.object({
      below_n: z.number().int().positive(),
      decimals: z.number().int().nonnegative(),
    }).optional(),
  }),
  table_styling: z.object({
    bold_headers: z.boolean(),
    indent_subgroups: z.boolean(),
    row_spacing: z.string(),
    footnote_sequence: z.array(z.string())
  }),
  plot_theme: PlotThemeSchema,
}).superRefine((journal, context) => {
  const generic = journal.journal_id === "GENERIC";
  if (!generic && (journal.provenance.source_url === null || journal.provenance.retrieved_on === null)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["provenance"], message: "Only GENERIC may omit a provenance URL or retrieval date" });
  }
  if (journal.provenance.retrieved_on && journal.provenance.last_reviewed_on < journal.provenance.retrieved_on) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["provenance", "last_reviewed_on"], message: "Review date cannot precede retrieval date" });
  }
});
export type JournalConfig = z.infer<typeof JournalConfigSchema>;

export const JournalRulesetSchema = z.object({
  EasyTableOne_Ruleset: z.object({
    version: z.string(),
    changelog: z.string().optional(),
    review_policy: z.object({
      cadence_months: z.number().int().positive(),
      also_before: z.string(),
      report_discrepancy: z.string(),
    }),
    global_defaults: z.object({
      missing_data_label: z.string(),
      normality_logic: NormalityLogicSchema,
      test_selection_logic: z.record(z.string(), z.string())
    }),
    journals: z.array(JournalConfigSchema),
    logic_mapping: z.array(z.object({
      if: z.string(),
      then: z.record(z.string(), z.string())
    }))
  })
}).superRefine((ruleset, context) => {
  for (const [index, journal] of ruleset.EasyTableOne_Ruleset.journals.entries()) {
    const threshold = journal.p_value_formatting.threshold_low;
    if (!threshold.startsWith("<")) continue;
    const separator = journal.p_value_formatting.decimal_separator ?? ".";
    const normalized = threshold.slice(1).trim().replace(/[·,]/g, ".").replace(separator, ".");
    const value = Number(normalized);
    if (!Number.isFinite(value) || value <= 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["EasyTableOne_Ruleset", "journals", index, "p_value_formatting", "threshold_low"],
        message: `threshold_low must contain a positive numeric bound; received ${threshold}`,
      });
    }
  }
});
export type JournalRuleset = z.infer<typeof JournalRulesetSchema>;
