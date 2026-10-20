import type { Schema, DataFrame, AnalysisPlan, DataQualityFinding, CheckTier, CheckCategory, CheckStage } from "../types";
import { detectOutliers } from "./outliers";
import { getColumnDiagnosticLabel, getColumnDisplayLabel, resolveLevelLabel } from "../format/columnLabel";
import { buildOutlierFindingDetail } from "../format/outlierNote";
import { checkColumnBounds, loadBoundsLibrary, type ResearchPopulation, type UnitSystem } from "../bounds/boundsChecker";
import { useStore } from "../../store";

export interface WorkbookMeta {
  sheetNames: string[];
}

export interface CheckContext {
  schema: Schema;
  data: DataFrame;
  workbook?: WorkbookMeta;
  plan?: AnalysisPlan;
  researchPopulation?: ResearchPopulation;
  unitSystem?: UnitSystem;
}

export interface CheckDefinition {
  id: string;
  tier: CheckTier;
  category: CheckCategory;
  stage: CheckStage;
  requiresGrouping: boolean;


  run: (ctx: CheckContext) => DataQualityFinding[];
}

export const SMALL_CATEGORY_THRESHOLD = 10;


/** Registry of built-in data-quality checks; each definition supplies its stable id, stage, and finding producer. */
export const CHECK_REGISTRY: CheckDefinition[] = [
  // ==========================================
  // FORMAT GATES (blocking, format, data-review)
  // ==========================================
  {
    id: "noDataRows",
    tier: "blocking",
    category: "format",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ data }) => {
      if (!data.rows || data.rows.length === 0) {
        return [{
          checkId: "noDataRows",
          tier: "blocking",
          category: "format",
          title: "No Data Rows",
          detail: "The uploaded sheet contains no data rows.",
          requirement: "The sheet must contain a header row followed by at least one data row.",
          remedy: "Add data rows to your Excel sheet and re-upload.",
        }];
      }
      return [];
    }
  },
  {
    id: "duplicateColumnNames",
    tier: "blocking",
    category: "format",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ data }) => {
      const colNames = data.columns.map(c => c.name);
      const duplicates = colNames.filter((item, index) => colNames.indexOf(item) !== index);
      if (duplicates.length > 0) {
        const uniqueDups = [...new Set(duplicates)];
        return [{
          checkId: "duplicateColumnNames",
          tier: "blocking",
          category: "format",
          title: "Duplicate Column Headers",
          detail: `Two or more columns have the same header name: ${uniqueDups.map(d => `'${d}'`).join(', ')}.`,
          requirement: "Each column must have a unique header name.",
          remedy: "Rename the duplicate columns in Excel to be unique and re-upload.",
        }];
      }
      return [];
    }
  },
  {
    id: "allEmptyColumn",
    tier: "blocking",
    category: "format",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ data, schema }) => {
      const findings: DataQualityFinding[] = [];
      data.columns.forEach((col, colIdx) => {
        // Skip if the column is excluded in schema
        const schemaCol = schema.columns.find(c => c.name === col.name);
        if (schemaCol?.exclusionReason) return;

        const allEmpty = data.rows.every(row => {
          const v = row[colIdx];
          return v === null || v === undefined || String(v).trim() === "";
        });
        if (allEmpty) {
          findings.push({
            checkId: `allEmptyColumn_${col.name}`,
            tier: "blocking",
            category: "format",
            variable: col.name,
            title: "Empty Column",
            detail: `Column '${col.name}' has no values.`,
            requirement: "Remove empty columns or fill them before analysis.",
            remedy: "Delete the column in Excel, or populate it, then re-upload.",
          });
        }
      });
      return findings;
    }
  },
  {
    id: "noAnalyzableVariable",
    tier: "blocking",
    category: "format",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema }) => {
      const allExcludedOrUnanalyzable = schema.columns.every(c => 
        c.exclusionReason || ["id_like", "date", "unsupported"].includes(c.confirmedType)
      );
      if (allExcludedOrUnanalyzable) {
        return [{
          checkId: "noAnalyzableVariable",
          tier: "blocking",
          category: "format",
          title: "No Analyzable Variables",
          detail: "Every column in the dataset is classified as ID-like, Date, or Unsupported.",
          requirement: "The dataset must contain at least one analyzable variable (continuous or categorical).",
          remedy: "Change the column types in the Variable types step, or upload a dataset with continuous/categorical columns.",
        }];
      }
      return [];
    }
  },
  {
    id: "unresolvedDateColumn",
    tier: "blocking",
    category: "format",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema }) => {
      const findings: DataQualityFinding[] = [];
      schema.columns.forEach(c => {
        if (c.confirmedType === "date" && !c.exclusionReason) {
          findings.push({
            checkId: `unresolvedDateColumn_${c.name}`,
            tier: "blocking",
            category: "format",
            variable: c.name,
            title: "Unresolved Date Column",
            detail: `Column '${c.name}' contains date values.`,
            requirement: "EasyTableOne requires pre-processed inputs (e.g. compute age in years before upload).",
            remedy: "Exclude this column in the Variable types step, or pre-process and re-upload.",
          });
        }
      });
      return findings;
    }
  },
  {
    id: "unresolvedAmbiguousNumeric",
    tier: "blocking",
    category: "format",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema }) => {
      const findings: DataQualityFinding[] = [];
      schema.columns.forEach(c => {
        if (c.confirmedType === "numeric_encoded_categorical_ambiguous" && !c.exclusionReason) {
          findings.push({
            checkId: `unresolvedAmbiguousNumeric_${c.name}`,
            tier: "blocking",
            category: "format",
            variable: c.name,
            title: "Unresolved Ambiguous Column",
            detail: `Column '${c.name}' has ambiguous numeric encoding.`,
            requirement: "All ambiguous columns must be disambiguated before analysis.",
            remedy: "Select a confirmed type (e.g. continuous or binary) for this column in the Variable types step.",
          });
        }
      });
      return findings;
    }
  },
  {
    id: "unresolvedLocaleViolation",
    tier: "blocking",
    category: "format",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ data }) => {
      if (data.meta.parseWarnings && data.meta.parseWarnings.length > 0) {
        const localeWarnings = data.meta.parseWarnings.filter(w => 
          w.message.toLowerCase().includes("locale") || 
          w.message.toLowerCase().includes("decimal") ||
          w.message.toLowerCase().includes("separator")
        );
        if (localeWarnings.length > 0) {
          return [{
            checkId: "unresolvedLocaleViolation",
            tier: "blocking",
            category: "format",
            title: "Locale Format Violations",
            detail: "Some cells do not match the expected decimal format.",
            requirement: "All numeric cells must use dot (.) as decimal separator.",
            remedy: "Correct the cell values in Excel and re-upload.",
          }];
        }
      }
      return [];
    }
  },

  // ==========================================
  // QUALITY CHECKS (data-review / plan)
  // ==========================================
  {
    id: "constantColumn",
    tier: "blocking",
    category: "quality",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema, data }) => {
      const findings: DataQualityFinding[] = [];
      schema.columns.forEach((col, colIdx) => {
        if (col.exclusionReason) return;
        if (["id_like", "date"].includes(col.confirmedType)) return;
        
        const values = data.rows.map(r => r[colIdx]);
        const nonNullValues = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "");
        const uniqueVals = new Set(nonNullValues);
        
        if (uniqueVals.size <= 1) {
          const sampleValStr = uniqueVals.size === 1 ? String([...uniqueVals][0]) : "no values";
          findings.push({
            checkId: `constantColumn_${col.name}`,
            tier: "blocking",
            category: "quality",
            variable: col.name,
            title: "Constant Column",
            detail: `Variable '${col.name}' has a single unique value (${sampleValStr}).`,
            requirement: "A variable needs at least two distinct values to be tabulated.",
            remedy: "Deselect (exclude) this variable in the Variable types step, or correct the data, then continue.",
          });
        }
      });
      return findings;
    }
  },
  {
    id: "excelErrorColumn",
    tier: "review",
    category: "quality",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ data, schema }) => {
      const findings: DataQualityFinding[] = [];
      const counts = data.meta.excelErrorCounts ?? {};

      for (const [column, count] of Object.entries(counts)) {
        if (count <= 0) continue;
        const schemaCol = schema.columns.find((c) => c.name === column);
        if (schemaCol?.exclusionReason) continue;
        const colIdx = data.columns.findIndex((c) => c.name === column);
        const totalRows = data.rows.length;
        const tier: CheckTier = totalRows > 0 && count >= totalRows ? "blocking" : "review";
        const warning = data.meta.parseWarnings.find(
          (w) => w.column === column && w.message.includes("Excel error value"),
        );
        const tokenMatches = Array.from(warning?.message.matchAll(/\((#[^)]+)\)/g) ?? []);
        const example = tokenMatches.at(-1)?.[1] ?? "Excel error";

        findings.push({
          checkId: `excelErrorColumn_${column}`,
          tier,
          category: "quality",
          variable: column,
          title: "Excel Error Values",
          detail: `Column '${column}' contains ${count} Excel error value(s) (e.g. ${example}). The source spreadsheet formula is likely broken; these were treated as missing.`,
          requirement: "Fix the formula in the source file (or remove the column) and re-upload.",
          remedy: "In Excel, repair the #REF!/#VALUE! formulas, or delete the column, then re-upload.",
          affectedCount: count,
          affectedRowsSample: colIdx >= 0
            ? data.rows
                .map((row, rowIdx) => ({ row, rowIdx }))
                .filter(({ row }) => row[colIdx] === null)
                .map(({ rowIdx }) => rowIdx + 1)
                .slice(0, 10)
            : undefined,
        });
      }

      return findings;
    }
  },
  {
    id: "highMissingness",
    tier: "review", // dynamically adjusted between review/advisory in run
    category: "quality",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema, data }) => {
      const findings: DataQualityFinding[] = [];
      schema.columns.forEach((col, colIdx) => {
        if (col.exclusionReason) return;
        if (["id_like", "date", "unsupported"].includes(col.confirmedType)) return;

        let missingCount = 0;
        const rowIndices: number[] = [];
        const sampleValues: string[] = [];
        
        data.rows.forEach((row, rowIdx) => {
          const v = row[colIdx];
          if (v === null || v === undefined || String(v).trim() === "") {
            missingCount++;
            rowIndices.push(rowIdx + 1);
          } else {
            if (sampleValues.length < 10) {
              sampleValues.push(String(v));
            }
          }
        });

        const totalRows = data.rows.length;
        const missingPercent = totalRows > 0 ? (missingCount / totalRows) * 100 : 0;
        
        if (missingPercent >= 20) {
          const tier = missingPercent >= 30 ? "review" : "advisory";
          const displayVar = getColumnDiagnosticLabel(col);
          findings.push({
            checkId: `highMissingness_${col.name}`,
            tier,
            category: "quality",
            variable: col.name,
            title: tier === "review" ? "High Missingness Requires Review" : "Moderate Missingness",
            detail: `Variable '${displayVar}' had ${missingPercent.toFixed(1)}% missingness.`,
            remedy: tier === "review" 
              ? "Rule of thumb: variables with 30% or more missing values should be carefully reviewed and may need to be excluded. Acknowledge to proceed, or exclude this column." 
              : "This is below the 30% review threshold, but consider verifying whether the missingness is expected.",
            affectedCount: missingCount,
            affectedRowsSample: rowIndices.slice(0, 10),
            sampleValues: sampleValues.slice(0, 2),
          });
        }
      });
      return findings;
    }
  },
  {
    id: "outliers",
    tier: "advisory",
    category: "quality",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema, data }) => {
      const findings: DataQualityFinding[] = [];
      schema.columns.forEach((col) => {
        if (col.exclusionReason) return;
        if (col.confirmedType !== "continuous") return;
        
        const out = detectOutliers(data, col.name, "iqr");
        if (out && out.rowIndices.length > 0) {
          const displayVar = getColumnDiagnosticLabel(col);
          const row1Indexed = out.rowIndices.map(idx => idx + 1);
          const uniqueSampleVals = [...new Set(out.values.map(String))];
          const count = out.rowIndices.length;
          findings.push({
            checkId: `outliers_${col.name}`,
            tier: "advisory",
            category: "quality",
            variable: col.name,
            title: "Potential Outlier Values Flagged",
            detail: buildOutlierFindingDetail(count, displayVar),
            remedy: "Review the flagged potential outliers in the diagnostics panel.",
            affectedCount: count,
            affectedRowsSample: row1Indexed.slice(0, 10),
            sampleValues: uniqueSampleVals.slice(0, 10),
          });
        }
      });
      return findings;
    }
  },
  {
    id: "duplicateRows",
    tier: "advisory",
    category: "quality",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ data }) => {
      const seen = new Map<string, number>();
      const dupIndices: number[] = [];
      data.rows.forEach((row, idx) => {
        const rowStr = JSON.stringify(row);
        if (seen.has(rowStr)) {
          dupIndices.push(idx + 1);
        } else {
          seen.set(rowStr, idx);
        }
      });
      if (dupIndices.length > 0) {
        return [{
          checkId: "duplicateRows",
          tier: "advisory",
          category: "quality",
          title: "Duplicate Rows",
          detail: `Dataset contains ${dupIndices.length} exact duplicate rows.`,
          remedy: "Verify if duplicate rows are expected in this dataset.",
          affectedCount: dupIndices.length,
          affectedRowsSample: dupIndices.slice(0, 10),
        }];
      }
      return [];
    }
  },
  {
    id: "sampleSize",
    tier: "advisory",
    category: "quality",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema, data }) => {
      const findings: DataQualityFinding[] = [];
      schema.columns.forEach((col, colIdx) => {
        if (col.exclusionReason) return;
        if (col.confirmedType !== "continuous") return;

        const values = data.rows.map(r => r[colIdx]);
        const validCount = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "").length;
        
        if (validCount > 0 && validCount < 30) {
          const displayVar = getColumnDiagnosticLabel(col);
          const valWord = validCount === 1 ? "value" : "values";
          findings.push({
            checkId: `sampleSize_${col.name}`,
            tier: "advisory",
            category: "quality",
            variable: col.name,
            title: "Small Sample Size",
            detail: `Variable '${displayVar}' has N = ${validCount} (< 30) non-null ${valWord}.`,
            remedy: "Continuous testing on small sample sizes may have limited power.",
            affectedCount: validCount,
          });
        }
      });
      return findings;
    }
  },

  // ==========================================
  // GROUPING-DEPENDENT QUALITY CHECKS (plan)
  // ==========================================
  {
    id: "zeroVarianceGrouping",
    tier: "blocking",
    category: "quality",
    stage: "plan",
    requiresGrouping: true,
    run: ({ plan, data }) => {
      if (!plan || !plan.groupingVariable) return [];
      const colIdx = data.columns.findIndex(c => c.name === plan.groupingVariable);
      if (colIdx === -1) return [];
      const values = data.rows.map(r => r[colIdx]);
      const nonNullVals = values.filter(v => v !== null && v !== undefined && String(v).trim() !== "");
      const uniqueCount = new Set(nonNullVals).size;
      if (uniqueCount < 2) {
        return [{
          checkId: "zeroVarianceGrouping",
          tier: "blocking",
          category: "quality",
          variable: plan.groupingVariable,
          title: "Zero Variance Grouping Variable",
          detail: `Grouping variable '${plan.groupingVariable}' has ${uniqueCount} distinct non-null value(s).`,
          requirement: "The grouping variable must have at least two distinct values to stratify the table.",
          remedy: "Select a different grouping variable with at least two groups.",
        }];
      }
      return [];
    }
  },
  {
    id: "groupImbalance",
    tier: "review",
    category: "quality",
    stage: "plan",
    requiresGrouping: true,
    run: ({ plan, data }) => {
      if (!plan || !plan.groupingVariable) return [];
      const colIdx = data.columns.findIndex(c => c.name === plan.groupingVariable);
      if (colIdx === -1) return [];
      const counts: Record<string, number> = {};
      data.rows.forEach(row => {
        const v = row[colIdx];
        if (v !== null && v !== undefined && String(v).trim() !== "") {
          counts[String(v)] = (counts[String(v)] ?? 0) + 1;
        }
      });
      const smallGroups = Object.entries(counts)
        .map(([name, n]) => ({ name, n }))
        .filter(g => g.n < 10);
      if (smallGroups.length > 0) {
        return [{
          checkId: "groupImbalance",
          tier: "review",
          category: "quality",
          variable: plan.groupingVariable,
          title: "Group Imbalance",
          detail: `Some groups have very small sample sizes: ${smallGroups.map(g => `'${g.name}' (n=${g.n})`).join(', ')}.`,
          remedy: "Acknowledge this imbalance to proceed with the analysis.",
        }];
      }
      return [];
    }
  },
  {
    id: "groupingVariableReencoding",
    tier: "advisory",
    category: "quality",
    stage: "plan",
    requiresGrouping: true,
    run: ({ plan, schema, data }) => {
      if (!plan?.groupingVariable) return [];
      const groupingIndex = data.columns.findIndex((column) => column.name === plan.groupingVariable);
      const groupingColumn = schema.columns.find((column) => column.name === plan.groupingVariable);
      if (groupingIndex === -1 || !groupingColumn) return [];

      return schema.columns.flatMap((column) => {
        if (column.name === plan.groupingVariable || column.exclusionReason || !plan.includedVariables?.includes(column.name)) return [];
        if (!["binary", "categorical_nominal", "categorical_ordinal"].includes(column.confirmedType)) return [];
        const variableIndex = data.columns.findIndex((dataColumn) => dataColumn.name === column.name);
        if (variableIndex === -1) return [];

        const groupsByLevel = new Map<string, Set<string>>();
        for (const row of data.rows) {
          const group = row[groupingIndex];
          const level = row[variableIndex];
          if (isMissingValue(group) || isMissingValue(level)) continue;
          const groups = groupsByLevel.get(String(level)) ?? new Set<string>();
          groups.add(String(group));
          groupsByLevel.set(String(level), groups);
        }

        if (groupsByLevel.size === 0 || ![...groupsByLevel.values()].every((groups) => groups.size === 1)) return [];
        const displayVariable = getColumnDisplayLabel(column);
        const displayGrouping = getColumnDisplayLabel(groupingColumn).toLowerCase();
        return [{
          checkId: `groupingVariableReencoding_${column.name}`,
          tier: "advisory" as const,
          category: "quality" as const,
          variable: column.name,
          title: "This variable may be a re-encoding of the grouping variable",
          detail: `Every level of "${displayVariable}" occurs in only one ${displayGrouping}, so the variable predicts the group perfectly. If it is a more detailed version of the grouping variable, its P-value is not a finding — it compares the grouping variable with itself — and should be removed while keeping the counts. If the two are genuinely independent measurements, a perfect separation is a real result but the P-value is unstable; report the counts and interpret with care.`,
          remedy: "Review whether this variable is a more detailed version of the grouping variable. If so, remove it from the comparison while keeping its counts.",
        }];
      });
    },
  },

  // ==========================================
  // BEAUTIFY ADVISORIES (advisory, beautify, data-review)
  // ==========================================
  {
    id: "noDictionarySheet",
    tier: "advisory",
    category: "beautify",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema, workbook }) => {
      if (schema.dictionarySource === "imported") return [];
      if (workbook && workbook.sheetNames.length > 0) {
        const hasDict = workbook.sheetNames.some(name => 
          /dict|codebook|variable|label|map|legend/i.test(name)
        );
        if (!hasDict) {
          return [{
            checkId: "noDictionarySheet",
            tier: "advisory",
            category: "beautify",
            title: "No Dictionary Sheet Imported",
            detail: "No data dictionary was imported for this workbook.",
            remedy: "Importing a dictionary during the Import data step helps automate clean variable labels.",
          }];
        }
      }
      return [];
    }
  },
  {
    id: "unlabeledVariables",
    tier: "advisory",
    category: "beautify",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema }) => {
      const activeCols = schema.columns.filter(c => !c.exclusionReason && !["id_like", "date", "unsupported"].includes(c.confirmedType));
      const unlabeled = activeCols.filter(c => !c.displayLabel);
      if (unlabeled.length > 0) {
        return [{
          checkId: "unlabeledVariables",
          tier: "advisory",
          category: "beautify",
          title: "Unlabeled Variables",
          detail: `${unlabeled.length} variables do not have custom display labels.`,
          remedy: "Add display labels in the Variable types step for publication-ready headers.",
          affectedCount: unlabeled.length,
        }];
      }
      return [];
    }
  },
  {
    id: "codedCategoricalNoLabels",
    tier: "advisory",
    category: "beautify",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema }) => {
      const findings: DataQualityFinding[] = [];
      schema.columns.forEach(col => {
        if (col.exclusionReason) return;
        if (!["binary", "categorical_nominal", "categorical_ordinal"].includes(col.confirmedType)) return;
        
        const hasDescriptiveLabel = col.levels && col.levels.some(l => 
          String(l.code).trim() !== String(l.label).trim()
        );
        
        if (!col.levels || col.levels.length === 0 || !hasDescriptiveLabel) {
          const displayVar = getColumnDiagnosticLabel(col);
          const sampleCodes = col.levels ? col.levels.map(l => String(l.code)).join("/") : "0/1";
          findings.push({
            checkId: `codedCategoricalNoLabels_${col.name}`,
            tier: "advisory",
            category: "beautify",
            variable: col.name,
            title: "Coded Categorical Without Labels",
            detail: `Categorical variable '${displayVar}' has numeric codes (e.g. ${sampleCodes}) but no descriptive labels.`,
            remedy: "Define level labels (e.g. 0=No, 1=Yes) in a dictionary sheet or manually.",
          });
        }
      });
      return findings;
    }
  },
  {
    id: "smallCategoryLevel",
    tier: "advisory",
    category: "quality",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema, data }) => {
      const findings: DataQualityFinding[] = [];
      schema.columns.forEach((col) => {
        if (col.exclusionReason || !["binary", "categorical_nominal", "categorical_ordinal"].includes(col.confirmedType)) return;
        const colIdx = data.columns.findIndex((dataCol) => dataCol.name === col.name);
        if (colIdx < 0) return;
        const counts = new Map<string, number>();
        data.rows.forEach((row) => {
          const value = row[colIdx];
          if (isMissingValue(value)) return;
          const key = String(value);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        });
        if (counts.size < 2) return;
        const smallLevels = [...counts.entries()]
          .filter(([, n]) => n > 0 && n < SMALL_CATEGORY_THRESHOLD)
          .map(([code, n]) => ({ label: resolveLevelLabel(code, col), n }));
        if (smallLevels.length === 0) return;
        const listed = smallLevels.slice(0, 5);
        const levelList = listed.map(({ label, n }) => `'${label}' (n = ${n})`).join(" and ");
        const moreText = smallLevels.length > 5 ? ` and ${smallLevels.length - 5} more` : "";
        const levelsText = listed.length === 1
          ? `level '${listed[0].label}' has n = ${listed[0].n}, fewer than ${SMALL_CATEGORY_THRESHOLD} observations`
          : `levels ${levelList}${moreText} have fewer than ${SMALL_CATEGORY_THRESHOLD} observations`;
        const displayVar = getColumnDisplayLabel(col);
        findings.push({
          checkId: `smallCategoryLevel_${col.name}`,
          tier: "advisory",
          category: "quality",
          variable: col.name,
          title: "Small Category",
          detail: `Variable '${displayVar}': ${levelsText}. Percentages for this level are unstable and the level may make the table sparse.`,
          remedy: "Consider combining this level with a related one in your source data, or report it with care. This is advisory; the analysis is unchanged.",
        });
      });
      return findings;
    },
  },
  {
    id: "continuousNoUnits",
    tier: "advisory",
    category: "beautify",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema }) => {
      const findings: DataQualityFinding[] = [];
      schema.columns.forEach(col => {
        if (col.exclusionReason) return;
        if (col.confirmedType !== "continuous") return;
        if (!col.units || col.units.trim() === "") {
          const displayVar = getColumnDiagnosticLabel(col);
          findings.push({
            checkId: `continuousNoUnits_${col.name}`,
            tier: "advisory",
            category: "beautify",
            variable: col.name,
            title: "Missing Units for Continuous Variable",
            detail: `Continuous variable '${displayVar}' has no units defined.`,
            remedy: "Specify units (e.g., years, mg/dL) in the Variable types step.",
          });
        }
      });
      return findings;
    }
  },

  {
    id: "sanityBounds",
    tier: "advisory",
    category: "quality",
    stage: "data-review",
    requiresGrouping: false,
    run: ({ schema, data, plan, researchPopulation, unitSystem: contextUnitSystem }) => {
      const population = researchPopulation ?? plan?.researchPopulation ?? useStore.getState().researchPopulation ?? "adult";
      const unitSystem: UnitSystem = contextUnitSystem ?? plan?.unitSystem ?? useStore.getState().unitSystem ?? "metric";
      const library = loadBoundsLibrary(population);
      if (!library) return [];

      const findings: DataQualityFinding[] = [];
      schema.columns.forEach((col) => {
        if (col.exclusionReason) return;
        if (col.confirmedType !== "continuous") return;

        const values = extractNumericValues(data, col.name);
        const result = checkColumnBounds(col, values, library, unitSystem);
        if (!result || result.violations.length === 0) return;

        const displayVar = getColumnDiagnosticLabel(col);
        const n = result.violations.length;
        const sampleValues = [...new Set(result.violations.map((v) => String(v.value)))].slice(0, 10);
        const matchScore = result.matchScore !== undefined ? `, score ${result.matchScore.toFixed(2)}` : "";
        const unitLabel = unitSystem === "imperial" ? "imperial" : "metric";
        const unitNote = col.units?.trim()
          ? undefined
          : `Bounds assume ${unitLabel} units. If this column uses different units, dismiss this finding.`;

        findings.push({
          checkId: `sanityBounds_${col.name}`,
          tier: "advisory",
          category: "quality",
          variable: col.name,
          title: `Potential implausible values in "${displayVar}"`,
          detail: [
            `${n} ${n === 1 ? "value" : "values"} in column "${displayVar}" `,
            `${n === 1 ? "falls" : "fall"} outside the plausible range for `,
            `${result.conceptLabel} [${result.lower}-${result.upper} ${result.unit}]. `,
            `Matched concept: "${result.conceptId}" (${result.matchedBy}${matchScore}). `,
            unitNote,
          ].join(""),
          remedy: unitNote ?? "Review the flagged values against the declared column unit.",
          affectedCount: n,
          affectedRowsSample: result.violations.map((v) => v.rowIndex + 1).slice(0, 10),
          sampleValues,
          assumedUnitNote: unitNote,
          highlightedValues: result.violations.map((v) => v.value).slice(0, 10),
          metadataOnly: {
            conceptId: result.conceptId,
            violationCount: n,
            matchedBy: result.matchedBy,
          },
        });
      });
      return findings;
    }
  }
];



/** Runs only registry checks for the requested workflow stage and returns their findings without mutating the context. */
export function runChecks(stage: CheckStage, ctx: CheckContext): DataQualityFinding[] {
  return CHECK_REGISTRY
    .filter(c => c.stage === stage)
    .flatMap(c => c.run(ctx));
}

function extractNumericValues(data: DataFrame, columnName: string): (number | null)[] {
  const colIdx = data.columns.findIndex((c) => c.name === columnName);
  if (colIdx === -1) return [];
  const sentinels = new Set((data.meta.missingSentinels ?? []).map((s) => s.trim().toLowerCase()));

  return data.rows.map((row) => {
    const raw = row[colIdx];
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
    const text = String(raw).trim();
    if (!text || sentinels.has(text.toLowerCase())) return null;
    const parsed = Number(text.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  });
}

function isMissingValue(value: unknown): boolean {
  return value === null || value === undefined || String(value).trim() === "";
}
