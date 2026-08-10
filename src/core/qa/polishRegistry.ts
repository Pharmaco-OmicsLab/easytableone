/**
 * src/core/qa/polishRegistry.ts
 *
 * Extensible registry for the Stage 5 Data Polish Advisor (D41).
 * Detects structural or cosmetic inconsistencies that degrade output.
 */
import type { Schema, DataFrame, SchemaColumn } from '../types';
import { getLevenshteinDistance } from './levenshtein';

export type PolishCategory = 'beautify' | 'quality';
export type Confidence = 'high' | 'low';

export interface PolishFinding {
  detectorId: string;
  category: PolishCategory;
  variable: string;            // raw column name
  title: string;
  affectedCount: number;
  variants: string[];          // distinct values implicated
  sampleRows: number[];        // 1-based, for report.md
  confidence: Confidence;
  suggestedCanonical?: string; // default canonical choice
}

export interface RecodeOp {
  kind: 'replace' | 'rename';
  column: string;
  mapping?: Record<string, string>;
  from?: string;
  to?: string;
}

export type ApplyResult =
  | { applyKind: 'merge' | 'rename'; df: DataFrame; schema: Schema; recode: RecodeOp; auditDescriptor: string }
  | { applyKind: 'route-to-schema'; auditDescriptor: string }
  | { applyKind: 'open-ordinal-ui'; column: string; seedOrder: string[]; auditDescriptor: string };

export interface PolishDetector {
  id: string;
  category: PolishCategory;
  label: string;
  detect(df: DataFrame, schema: Schema): PolishFinding[];
  apply(df: DataFrame, schema: Schema, finding: PolishFinding, canonical?: string): ApplyResult;
}

// ----------------------------------------------------
// HELPERS
// ----------------------------------------------------

function collapseWhitespace(val: string): string {
  return val.trim().replace(/\s+/g, ' ');
}

function isValueScanned(column: SchemaColumn, df: DataFrame): boolean {
  const t = column.confirmedType;
  if (t === 'binary' || t === 'categorical_nominal' || t === 'categorical_ordinal') {
    return true;
  }
  if (t === 'unsupported') {
    // low-cardinality unsupported: <= 20 unique non-empty values
    const colIdx = df.columns.findIndex((c) => c.name === column.name);
    if (colIdx === -1) return false;
    const uniqueValues = new Set<string>();
    for (const row of df.rows) {
      const cell = row[colIdx];
      if (cell !== null && cell !== undefined && String(cell).trim() !== '') {
        uniqueValues.add(String(cell).trim());
      }
    }
    return uniqueValues.size <= 20;
  }
  return false;
}

interface ColumnValueStats {
  uniqueValues: string[];
  frequencies: Record<string, number>;
  rowIndices: Record<string, number[]>; // value -> 1-based row indices
  observedOrder: string[];
}

function getColumnValueStats(df: DataFrame, colName: string): ColumnValueStats {
  const colIdx = df.columns.findIndex((c) => c.name === colName);
  if (colIdx === -1) {
    return { uniqueValues: [], frequencies: {}, rowIndices: {}, observedOrder: [] };
  }
  const frequencies: Record<string, number> = {};
  const rowIndices: Record<string, number[]> = {};
  const uniqueValuesSet = new Set<string>();
  const observedOrder: string[] = [];

  df.rows.forEach((row, rowIdx) => {
    const val = row[colIdx];
    if (val !== null && val !== undefined && String(val).trim() !== '') {
      const valStr = String(val);
      if (!uniqueValuesSet.has(valStr)) {
        uniqueValuesSet.add(valStr);
        observedOrder.push(valStr);
      }
      frequencies[valStr] = (frequencies[valStr] ?? 0) + 1;
      if (!rowIndices[valStr]) {
        rowIndices[valStr] = [];
      }
      rowIndices[valStr].push(rowIdx + 1);
    }
  });

  return {
    uniqueValues: Array.from(uniqueValuesSet),
    frequencies,
    rowIndices,
    observedOrder,
  };
}

const SYNONYMS = [
  ['m', 'male'],
  ['f', 'female'],
  ['y', 'yes'],
  ['n', 'no'],
  ['t', 'true'],
  ['f', 'false'],
];

function isOrdinalSequence(values: string[]): boolean {
  const normValues = values.map((v) => v.trim().toLowerCase());

  const ordinalLexiconGroups = [
    ['mild', 'moderate', 'severe'],
    ['low', 'normal', 'high'],
    ['small', 'medium', 'large'],
    ['none', 'mild', 'moderate', 'severe'],
  ];

  for (const group of ordinalLexiconGroups) {
    const matches = normValues.filter((v) => group.includes(v));
    if (matches.length >= 2 && matches.length === normValues.length) {
      return true;
    }
  }

  const romanPattern = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;
  if (normValues.every((v) => romanPattern.test(v)) && normValues.length >= 2) {
    return true;
  }

  if (normValues.every((v) => /^\d+(\.\d+)?$/.test(v)) && normValues.length >= 2) {
    return true;
  }

  return false;
}

function isShortAcronymLikeValue(value: string): boolean {
  const normalized = collapseWhitespace(value);
  return normalized.length <= 3 && /^[A-Za-z]+$/.test(normalized);
}

// ----------------------------------------------------
// REGISTRY DEFINITION
// ----------------------------------------------------

export const POLISH_REGISTRY: PolishDetector[] = [
  // 1. WHITESPACE INCONSISTENCY (high-confidence)
  {
    id: 'whitespace_inconsistency',
    category: 'beautify',
    label: 'Whitespace Inconsistency',
    detect(df, schema) {
      const findings: PolishFinding[] = [];
      schema.columns.forEach((col) => {
        if (col.exclusionReason || !isValueScanned(col, df)) return;
        const stats = getColumnValueStats(df, col.name);

        const groups = new Map<string, string[]>();
        stats.uniqueValues.forEach((val) => {
          const collapsed = collapseWhitespace(val);
          const list = groups.get(collapsed) || [];
          list.push(val);
          groups.set(collapsed, list);
        });

        groups.forEach((variants) => {
          if (variants.length >= 2) {
            // Find most frequent variant as suggested canonical
            let suggestedCanonical = variants[0];
            let maxFreq = -1;
            variants.forEach((v) => {
              const freq = stats.frequencies[v] ?? 0;
              if (freq > maxFreq || (freq === maxFreq && v < suggestedCanonical)) {
                maxFreq = freq;
                suggestedCanonical = v;
              }
            });

            const sortedVariants = [...variants].sort((a, b) => {
              const diff = (stats.frequencies[b] ?? 0) - (stats.frequencies[a] ?? 0);
              return diff !== 0 ? diff : a.localeCompare(b);
            });

            const nonCanonical = variants.filter((v) => v !== suggestedCanonical);
            const affectedCount = nonCanonical.reduce((sum, v) => sum + (stats.frequencies[v] ?? 0), 0);
            const sampleRows = nonCanonical.flatMap((v) => stats.rowIndices[v] ?? []);

            findings.push({
              detectorId: 'whitespace_inconsistency',
              category: 'beautify',
              variable: col.name,
              title: 'Whitespace Inconsistency',
              affectedCount,
              variants: sortedVariants,
              sampleRows: sampleRows.sort((a, b) => a - b),
              confidence: 'high',
              suggestedCanonical,
            });
          }
        });
      });
      return findings;
    },
    apply(df, schema, finding, canonical) {
      const canonicalValue = canonical || finding.suggestedCanonical || finding.variants[0];
      const colIdx = df.columns.findIndex((c) => c.name === finding.variable);
      const mapping: Record<string, string> = {};

      finding.variants.forEach((v) => {
        if (v !== canonicalValue) {
          mapping[v] = canonicalValue;
        }
      });

      const nextRows = df.rows.map((row) => {
        const cell = row[colIdx];
        if (cell !== null && cell !== undefined && mapping[String(cell)] !== undefined) {
          const nextRow = [...row];
          nextRow[colIdx] = typeof cell === 'number' ? parseFloat(canonicalValue) : canonicalValue;
          return nextRow;
        }
        return row;
      });

      return {
        applyKind: 'merge',
        df: { ...df, rows: nextRows },
        schema,
        recode: { kind: 'replace', column: finding.variable, mapping },
        auditDescriptor: `Merged whitespace variants in column '${finding.variable}' to '${canonicalValue}'`,
      };
    },
  },

  // 2. CASE INCONSISTENCY (high-confidence)
  {
    id: 'case_inconsistency',
    category: 'beautify',
    label: 'Case Inconsistency',
    detect(df, schema) {
      const findings: PolishFinding[] = [];
      schema.columns.forEach((col) => {
        if (col.exclusionReason || !isValueScanned(col, df)) return;
        const stats = getColumnValueStats(df, col.name);

        const collapsedMap = new Map<string, string[]>();
        stats.uniqueValues.forEach((val) => {
          const collapsed = collapseWhitespace(val);
          const list = collapsedMap.get(collapsed) || [];
          list.push(val);
          collapsedMap.set(collapsed, list);
        });

        const groups = new Map<string, string[]>();
        Array.from(collapsedMap.keys()).forEach((collapsed) => {
          const lower = collapsed.toLowerCase();
          const list = groups.get(lower) || [];
          list.push(collapsed);
          groups.set(lower, list);
        });

        groups.forEach((collapsedVariants) => {
          if (collapsedVariants.length >= 2) {
            const allOriginalVariants: string[] = [];
            collapsedVariants.forEach((c) => {
              allOriginalVariants.push(...(collapsedMap.get(c) ?? []));
            });

            let suggestedCanonical = allOriginalVariants[0];
            let maxFreq = -1;
            allOriginalVariants.forEach((v) => {
              const freq = stats.frequencies[v] ?? 0;
              if (freq > maxFreq || (freq === maxFreq && v < suggestedCanonical)) {
                maxFreq = freq;
                suggestedCanonical = v;
              }
            });

            const sortedVariants = [...allOriginalVariants].sort((a, b) => {
              const diff = (stats.frequencies[b] ?? 0) - (stats.frequencies[a] ?? 0);
              return diff !== 0 ? diff : a.localeCompare(b);
            });

            const nonCanonical = allOriginalVariants.filter(
              (v) => collapseWhitespace(v) !== collapseWhitespace(suggestedCanonical)
            );
            const affectedCount = nonCanonical.reduce((sum, v) => sum + (stats.frequencies[v] ?? 0), 0);
            const sampleRows = nonCanonical.flatMap((v) => stats.rowIndices[v] ?? []);

            findings.push({
              detectorId: 'case_inconsistency',
              category: 'beautify',
              variable: col.name,
              title: 'Case Inconsistency',
              affectedCount,
              variants: sortedVariants,
              sampleRows: sampleRows.sort((a, b) => a - b),
              confidence: 'high',
              suggestedCanonical,
            });
          }
        });
      });
      return findings;
    },
    apply(df, schema, finding, canonical) {
      const canonicalValue = canonical || finding.suggestedCanonical || finding.variants[0];
      const colIdx = df.columns.findIndex((c) => c.name === finding.variable);
      const mapping: Record<string, string> = {};

      finding.variants.forEach((v) => {
        if (v !== canonicalValue) {
          mapping[v] = canonicalValue;
        }
      });

      const nextRows = df.rows.map((row) => {
        const cell = row[colIdx];
        if (cell !== null && cell !== undefined && mapping[String(cell)] !== undefined) {
          const nextRow = [...row];
          nextRow[colIdx] = typeof cell === 'number' ? parseFloat(canonicalValue) : canonicalValue;
          return nextRow;
        }
        return row;
      });

      return {
        applyKind: 'merge',
        df: { ...df, rows: nextRows },
        schema,
        recode: { kind: 'replace', column: finding.variable, mapping },
        auditDescriptor: `Merged case variants in column '${finding.variable}' to '${canonicalValue}'`,
      };
    },
  },

  // 3. COLUMN NAME WHITESPACE (high-confidence)
  {
    id: 'column_name_whitespace',
    category: 'beautify',
    label: 'Leading/Trailing Column Whitespace',
    detect(df) {
      const findings: PolishFinding[] = [];
      df.columns.forEach((col) => {
        if (col.name.trim() !== col.name) {
          findings.push({
            detectorId: 'column_name_whitespace',
            category: 'beautify',
            variable: col.name,
            title: 'Leading/Trailing Column Whitespace',
            affectedCount: 1,
            variants: [col.name],
            sampleRows: [],
            confidence: 'high',
            suggestedCanonical: col.name.trim(),
          });
        }
      });
      return findings;
    },
    apply(df, schema, finding, canonical) {
      const canonicalValue = canonical || finding.suggestedCanonical || finding.variants[0];
      const nextColumns = df.columns.map((c) => {
        if (c.name === finding.variable) {
          return { ...c, name: canonicalValue };
        }
        return c;
      });

      const nextSchemaColumns = schema.columns.map((c) => {
        if (c.name === finding.variable) {
          return { ...c, name: canonicalValue };
        }
        return c;
      });

      return {
        applyKind: 'rename',
        df: { ...df, columns: nextColumns },
        schema: { ...schema, columns: nextSchemaColumns },
        recode: { kind: 'rename', column: finding.variable, from: finding.variable, to: canonicalValue },
        auditDescriptor: `Trimmed whitespace in column name '${finding.variable}' to '${canonicalValue}'`,
      };
    },
  },

  // 4. NEAR-DUPLICATE (low-confidence)
  {
    id: 'near_duplicate',
    category: 'quality',
    label: 'Near-Duplicate Values',
    detect(df, schema) {
      const findings: PolishFinding[] = [];
      schema.columns.forEach((col) => {
        if (col.exclusionReason || col.confirmedType === 'categorical_ordinal' || !isValueScanned(col, df)) return;
        const stats = getColumnValueStats(df, col.name);
        const unique = stats.uniqueValues;
        if (unique.length < 2) return;

        const adj: Record<string, string[]> = {};
        unique.forEach((u) => { adj[u] = []; });

        for (let i = 0; i < unique.length; i++) {
          for (let j = i + 1; j < unique.length; j++) {
            const a = unique[i];
            const b = unique[j];

            if (collapseWhitespace(a).toLowerCase() === collapseWhitespace(b).toLowerCase()) {
              continue;
            }

            const isShortNumericA = a.length <= 3 && /\d/.test(a);
            const isShortNumericB = b.length <= 3 && /\d/.test(b);
            const isShortAcronymA = isShortAcronymLikeValue(a);
            const isShortAcronymB = isShortAcronymLikeValue(b);
            if ((isShortNumericA && isShortNumericB) || (isShortAcronymA && isShortAcronymB)) {
              continue;
            }

            if (getLevenshteinDistance(a, b) <= 2) {
              adj[a].push(b);
              adj[b].push(a);
            }
          }
        }

        const visited = new Set<string>();
        unique.forEach((start) => {
          if (visited.has(start)) return;
          const component: string[] = [];
          const queue = [start];
          visited.add(start);

          while (queue.length > 0) {
            const curr = queue.shift()!;
            component.push(curr);
            adj[curr].forEach((neighbor) => {
              if (!visited.has(neighbor)) {
                visited.add(neighbor);
                queue.push(neighbor);
              }
            });
          }

          if (component.length >= 2) {
            let suggestedCanonical = component[0];
            let maxFreq = -1;
            component.forEach((v) => {
              const freq = stats.frequencies[v] ?? 0;
              if (freq > maxFreq || (freq === maxFreq && v < suggestedCanonical)) {
                maxFreq = freq;
                suggestedCanonical = v;
              }
            });

            const sortedVariants = [...component].sort((a, b) => {
              const diff = (stats.frequencies[b] ?? 0) - (stats.frequencies[a] ?? 0);
              return diff !== 0 ? diff : a.localeCompare(b);
            });

            const nonCanonical = component.filter((v) => v !== suggestedCanonical);
            const affectedCount = nonCanonical.reduce((sum, v) => sum + (stats.frequencies[v] ?? 0), 0);
            const sampleRows = nonCanonical.flatMap((v) => stats.rowIndices[v] ?? []);

            findings.push({
              detectorId: 'near_duplicate',
              category: 'quality',
              variable: col.name,
              title: 'Near-Duplicate Values',
              affectedCount,
              variants: sortedVariants,
              sampleRows: sampleRows.sort((a, b) => a - b),
              confidence: 'low',
              suggestedCanonical,
            });
          }
        });
      });
      return findings;
    },
    apply(df, schema, finding, canonical) {
      const canonicalValue = canonical || finding.suggestedCanonical || finding.variants[0];
      const colIdx = df.columns.findIndex((c) => c.name === finding.variable);
      const mapping: Record<string, string> = {};

      finding.variants.forEach((v) => {
        if (v !== canonicalValue) {
          mapping[v] = canonicalValue;
        }
      });

      const nextRows = df.rows.map((row) => {
        const cell = row[colIdx];
        if (cell !== null && cell !== undefined && mapping[String(cell)] !== undefined) {
          const nextRow = [...row];
          nextRow[colIdx] = typeof cell === 'number' ? parseFloat(canonicalValue) : canonicalValue;
          return nextRow;
        }
        return row;
      });

      return {
        applyKind: 'merge',
        df: { ...df, rows: nextRows },
        schema,
        recode: { kind: 'replace', column: finding.variable, mapping },
        auditDescriptor: `Merged near-duplicate values in column '${finding.variable}' to '${canonicalValue}'`,
      };
    },
  },

  // 5. SYNONYM HINTS (low-confidence)
  {
    id: 'synonym_hints',
    category: 'beautify',
    label: 'Synonym Inconsistency',
    detect(df, schema) {
      const findings: PolishFinding[] = [];
      schema.columns.forEach((col) => {
        if (col.exclusionReason || !isValueScanned(col, df)) return;
        const stats = getColumnValueStats(df, col.name);

        SYNONYMS.forEach((synGroup) => {
          const matches = stats.uniqueValues.filter((val) => {
            const norm = val.trim().toLowerCase();
            return synGroup.includes(norm);
          });

          // Must mix at least 2 distinct normalized synonyms
          const normSet = new Set(matches.map((m) => m.trim().toLowerCase()));

          if (normSet.size >= 2) {
            let suggestedCanonical = matches[0];
            let maxFreq = -1;
            matches.forEach((v) => {
              const freq = stats.frequencies[v] ?? 0;
              if (freq > maxFreq || (freq === maxFreq && v < suggestedCanonical)) {
                maxFreq = freq;
                suggestedCanonical = v;
              }
            });

            const sortedVariants = [...matches].sort((a, b) => {
              const diff = (stats.frequencies[b] ?? 0) - (stats.frequencies[a] ?? 0);
              return diff !== 0 ? diff : a.localeCompare(b);
            });

            const nonCanonical = matches.filter((v) => v !== suggestedCanonical);
            const affectedCount = nonCanonical.reduce((sum, v) => sum + (stats.frequencies[v] ?? 0), 0);
            const sampleRows = nonCanonical.flatMap((v) => stats.rowIndices[v] ?? []);

            findings.push({
              detectorId: 'synonym_hints',
              category: 'beautify',
              variable: col.name,
              title: 'Synonym Inconsistency',
              affectedCount,
              variants: sortedVariants,
              sampleRows: sampleRows.sort((a, b) => a - b),
              confidence: 'low',
              suggestedCanonical,
            });
          }
        });
      });
      return findings;
    },
    apply(df, schema, finding, canonical) {
      const canonicalValue = canonical || finding.suggestedCanonical || finding.variants[0];
      const colIdx = df.columns.findIndex((c) => c.name === finding.variable);
      const mapping: Record<string, string> = {};

      finding.variants.forEach((v) => {
        if (v !== canonicalValue) {
          mapping[v] = canonicalValue;
        }
      });

      const nextRows = df.rows.map((row) => {
        const cell = row[colIdx];
        if (cell !== null && cell !== undefined && mapping[String(cell)] !== undefined) {
          const nextRow = [...row];
          nextRow[colIdx] = typeof cell === 'number' ? parseFloat(canonicalValue) : canonicalValue;
          return nextRow;
        }
        return row;
      });

      return {
        applyKind: 'merge',
        df: { ...df, rows: nextRows },
        schema,
        recode: { kind: 'replace', column: finding.variable, mapping },
        auditDescriptor: `Resolved synonyms in column '${finding.variable}' to '${canonicalValue}'`,
      };
    },
  },

  // 6. MIXED TYPE (low-confidence)
  {
    id: 'mixed_type',
    category: 'quality',
    label: 'Mixed Numeric and String Values',
    detect(df, schema) {
      const findings: PolishFinding[] = [];
      schema.columns.forEach((col) => {
        if (col.exclusionReason || !isValueScanned(col, df)) return;
        const stats = getColumnValueStats(df, col.name);

        const hasNum = stats.uniqueValues.some((v) => !isNaN(parseFloat(v)));
        const hasStr = stats.uniqueValues.some((v) => isNaN(parseFloat(v)));

        if (hasNum && hasStr) {
          const numVals = stats.uniqueValues.filter((v) => !isNaN(parseFloat(v)));
          const affectedCount = numVals.reduce((sum, v) => sum + (stats.frequencies[v] ?? 0), 0);
          const sampleRows = numVals.flatMap((v) => stats.rowIndices[v] ?? []);

          findings.push({
            detectorId: 'mixed_type',
            category: 'quality',
            variable: col.name,
            title: 'Mixed Numeric and String Values',
            affectedCount,
            variants: stats.uniqueValues,
            sampleRows: sampleRows.sort((a, b) => a - b),
            confidence: 'low',
          });
        }
      });
      return findings;
    },
    apply(df, schema, finding) {
      const schemaCol = schema.columns.find((c) => c.name === finding.variable);

      if (schema.dictionarySource === 'imported' && schemaCol?.levels && schemaCol.levels.length > 0) {
        const colIdx = df.columns.findIndex((c) => c.name === finding.variable);
        const mapping: Record<string, string> = {};

        const nextRows = df.rows.map((row) => {
          const cell = row[colIdx];
          if (cell !== null && cell !== undefined) {
            const cellStr = String(cell);
            // If it is numeric-parseable, resolve it to level label
            if (!isNaN(parseFloat(cellStr))) {
              const matchedLevel = schemaCol.levels!.find((l) => {
                if (String(l.code) === cellStr) return true;
                const codeNum = parseFloat(String(l.code));
                const cellNum = parseFloat(cellStr);
                return !isNaN(codeNum) && codeNum === cellNum;
              });
              if (matchedLevel) {
                mapping[cellStr] = matchedLevel.label;
                const nextRow = [...row];
                nextRow[colIdx] = matchedLevel.label;
                return nextRow;
              }
            }
          }
          return row;
        });

        return {
          applyKind: 'merge',
          df: { ...df, rows: nextRows },
          schema,
          recode: { kind: 'replace', column: finding.variable, mapping },
          auditDescriptor: `Mapped mixed numeric codes in column '${finding.variable}' using dictionary labels`,
        };
      }

      return {
        applyKind: 'route-to-schema',
        auditDescriptor: `Routed column '${finding.variable}' with mixed type to the Variable types step`,
      };
    },
  },

  // 7. ORDINAL STORED AS STRING (D26-constrained)
  {
    id: 'ordinal_stored_as_string',
    category: 'beautify',
    label: 'Ordinal Sequence Stored as Nominal',
    detect(df, schema) {
      const findings: PolishFinding[] = [];
      schema.columns.forEach((col) => {
        if (col.exclusionReason || (col.confirmedType !== 'categorical_nominal' && col.confirmedType !== 'unsupported')) return;
        const stats = getColumnValueStats(df, col.name);
        if (!isValueScanned(col, df) || stats.uniqueValues.length < 2) return;

        // Skip binary columns
        if (stats.uniqueValues.length === 2) return;

        if (isOrdinalSequence(stats.uniqueValues)) {
          findings.push({
            detectorId: 'ordinal_stored_as_string',
            category: 'beautify',
            variable: col.name,
            title: 'Ordinal Sequence Stored as Nominal',
            affectedCount: stats.uniqueValues.length,
            variants: stats.observedOrder,
            sampleRows: [],
            confidence: 'low',
          });
        }
      });
      return findings;
    },
    apply(_df, _schema, finding) {
      return {
        applyKind: 'open-ordinal-ui',
        column: finding.variable,
        seedOrder: finding.variants,
        auditDescriptor: `Opened Ordinal UI for column '${finding.variable}' pre-seeded in observed order`,
      };
    },
  },
];

export function runPolishDetectors(df: DataFrame, schema: Schema): PolishFinding[] {
  return POLISH_REGISTRY.flatMap((d) => d.detect(df, schema));
}
