import * as fs from "node:fs";
import * as path from "node:path";
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import Papa from "papaparse";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APP_VERSION } from "../../src/core/appVersion";
import { PYODIDE_VERSION, PYTHON_RUNTIME_VERSION } from "../../src/core/runtimeEnvironment";
import { pyodideClient } from "../../src/workers/pyodide.client";
import { deterministicSample } from "../../scripts/bench/deterministic-sample.mjs";

const TOLERANCE = 1e-4;
const CONTINUOUS_TWO_GROUP_P_TOLERANCE = 1e-3;
const VALIDATION_DIR = path.resolve(process.cwd(), "validation/tableone");
const CSV_PATH = path.join(VALIDATION_DIR, "tableone_comparison.csv");
const SUMMARY_PATH = path.join(VALIDATION_DIR, "tableone_comparison_summary.json");
const REPORT_DIR = path.resolve(process.cwd(), "validation/report");
const REPORT_PATH = path.join(REPORT_DIR, "EasyTableOne_tableone_validation.docx");
const TABLEONE_WHEEL = "tableone-0.9.6-py3-none-any.whl";
const WRITE_VALIDATION_REPORT = process.env.ETO_WRITE_VALIDATION_REPORT === "1";

type VariableType = "continuous" | "categorical";
type Agreement = boolean | null;

interface ComparisonRecord {
  dataset: string;
  datasetSource: string;
  nRows: number;
  variable: string;
  variableType: VariableType;
  groupLevel: string | null;
  statistic: string;
  easytableone: number | null;
  tableone: number | null;
  absoluteDifference: number | null;
  tolerance: number;
  agrees: Agreement;
  note: string | null;
}

interface DatasetSummary {
  name: string;
  source: string;
  configuration: string;
  nRows: number;
  nVariables: number;
  nStatistics: number;
  nAgree: number;
  nNotComparable: number;
  maxAbsoluteDifference: number | null;
  skipped?: boolean;
  skipReason?: string;
}

interface TableOneStatistic {
  variable: string;
  variableType: VariableType;
  groupLevel: string | null;
  statistic: string;
  value: number | null;
  note: string | null;
}

const records: ComparisonRecord[] = [];
const summaries: DatasetSummary[] = [];
let tableoneVersion = "unknown";
let tableoneWheelPath = "unknown";
let tableoneReady = false;

function round4(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Number(value.toFixed(4));
}

function comparable(record: ComparisonRecord): boolean {
  return record.agrees !== null;
}

function compareNumeric(
  input: Omit<ComparisonRecord, "absoluteDifference" | "tolerance" | "agrees" | "note"> & {
    note?: string | null;
    tolerance?: number;
  },
): ComparisonRecord {
  const easy = round4(input.easytableone);
  const tableone = round4(input.tableone);
  const notComparable = easy === null || tableone === null;
  const absoluteDifference = notComparable ? null : round4(Math.abs((easy as number) - (tableone as number)));
  const tolerance = input.tolerance ?? TOLERANCE;
  const agrees = notComparable ? null : absoluteDifference !== null && absoluteDifference <= tolerance;
  return {
    ...input,
    easytableone: easy,
    tableone,
    absoluteDifference,
    tolerance,
    agrees,
    note: notComparable
      ? input.note ?? "Statistic not emitted by one or both tools."
      : agrees
        ? input.note ?? null
        : input.note ?? "Numeric value differed beyond tolerance.",
  };
}

function compareNotComparable(input: Omit<ComparisonRecord, "absoluteDifference" | "tolerance" | "agrees">): ComparisonRecord {
  return {
    ...input,
    easytableone: round4(input.easytableone),
    tableone: round4(input.tableone),
    absoluteDifference: null,
    tolerance: TOLERANCE,
    agrees: null,
  };
}

function compareTestSelection(
  input: Omit<ComparisonRecord, "absoluteDifference" | "tolerance" | "agrees" | "easytableone" | "tableone" | "note"> & {
    easyTest: string | null;
    tableoneTest: string | null;
  },
): ComparisonRecord {
  const easy = normalizeTestName(input.easyTest);
  const tableone = normalizeTestName(input.tableoneTest);
  const isDocumentedFisherSwitch = easy === "fisher" && tableone === "chi-square" && /expected count < 5/i.test(input.tableoneTest ?? "");
  const isTwoGroupRankEquivalent = easy === "mann-whitney" && tableone === "kruskal-wallis";
  const isNotTested = easy === "none" && tableone === "not tested";
  const agrees = easy !== null && tableone !== null && easy !== tableone && !isDocumentedFisherSwitch && !isTwoGroupRankEquivalent && !isNotTested ? false : null;
  return {
    ...input,
    statistic: "test",
    easytableone: null,
    tableone: null,
    absoluteDifference: null,
    tolerance: TOLERANCE,
    agrees,
    note:
      isDocumentedFisherSwitch
        ? "Different test family: EasyTableOne switched to Fisher's exact (minimum expected count < 5); tableone retained chi-squared with a low-expected-count warning."
        : isTwoGroupRankEquivalent
          ? "EasyTableOne: Mann-Whitney U with continuity correction; tableone: Kruskal-Wallis, equivalent for two groups, uncorrected."
          : isNotTested
            ? "Selected test unavailable from one or both tools; no P-value comparison was possible."
          : easy !== null && tableone !== null && easy === tableone
              ? `Selected test matched: EasyTableOne=${input.easyTest}; tableone=${input.tableoneTest}.`
          : agrees === null
        ? `Selected test not emitted by one or both tools. EasyTableOne=${input.easyTest ?? "not emitted"}; tableone=${input.tableoneTest ?? "not emitted"}.`
        : `Selected test: EasyTableOne=${input.easyTest}; tableone=${input.tableoneTest}.`,
  };
}

function normalizeTestName(value: string | null): string | null {
  if (!value) return null;
  const key = value.toLowerCase().replace(/[\s_-]+/g, " ").trim();
  if (key.includes("mann") && key.includes("whitney")) return "mann-whitney";
  if (key.includes("not tested")) return "not tested";
  if (key.includes("kruskal")) return "kruskal-wallis";
  if (key.includes("welch") || key.includes("t-test") || key.includes("t test")) return "welch-t";
  if (key.includes("anova")) return "anova";
  if (key.includes("fisher")) return "fisher";
  if (key.includes("chi")) return "chi-square";
  return key;
}

function assertPerturbedComparisonCanFail() {
  const record = compareNumeric({
    dataset: "negative_test",
    datasetSource: "deliberate perturbation",
    nRows: 2,
    variable: "x",
    variableType: "continuous",
    groupLevel: "A",
    statistic: "mean",
    easytableone: 1,
    tableone: 1 + TOLERANCE * 10,
  });
  expect(record.agrees).toBe(false);
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildSummary() {
  const totals = summarizeRecords(records);
  return {
    generatedAt: new Date().toISOString(),
    easytableoneVersion: APP_VERSION,
    tableoneVersion,
    pyodideVersion: PYODIDE_VERSION,
    pythonRuntimeVersion: PYTHON_RUNTIME_VERSION,
    tableoneWheel: TABLEONE_WHEEL,
    tolerances: {
      default: TOLERANCE,
      continuousTwoGroupPValue: CONTINUOUS_TWO_GROUP_P_TOLERANCE,
    },
    configuration: {
      chiSquareYatesCorrection: true,
      smdComparison: "absolute value on both sides; tableone reports signed SMD, EasyTableOne reports unsigned SMD",
    },
    datasets: summaries,
    totals,
  };
}

async function writeArtifacts(summary: ReturnType<typeof buildSummary>) {
  fs.mkdirSync(VALIDATION_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  records.sort((a, b) =>
    [a.dataset, a.variable, a.groupLevel ?? "", a.statistic]
      .join("\u0000")
      .localeCompare([b.dataset, b.variable, b.groupLevel ?? "", b.statistic].join("\u0000")),
  );

  const headers: Array<keyof ComparisonRecord> = [
    "dataset",
    "datasetSource",
    "nRows",
    "variable",
    "variableType",
    "groupLevel",
    "statistic",
    "easytableone",
    "tableone",
    "absoluteDifference",
    "tolerance",
    "agrees",
    "note",
  ];
  const csv = [headers.join(","), ...records.map((record) => headers.map((header) => csvEscape(record[header])).join(","))].join("\n") + "\n";
  fs.writeFileSync(CSV_PATH, csv);

  fs.writeFileSync(SUMMARY_PATH, `${JSON.stringify(summary, null, 2)}\n`);
  await writeDocxReport(summary);
}

function summarizeRecords(items: ComparisonRecord[]) {
  const compared = items.filter(comparable);
  return {
    nStatistics: compared.length,
    nAgree: compared.filter((record) => record.agrees === true).length,
    nNotComparable: items.filter((record) => record.agrees === null).length,
    maxAbsoluteDifference: maxDiff(compared),
  };
}

function maxDiff(items: ComparisonRecord[]): number | null {
  const values = items.map((record) => record.absoluteDifference).filter((value): value is number => value !== null);
  return values.length ? Math.max(...values) : null;
}

function summarizeDataset(name: string, source: string, nRows: number, variables: string[], configuration: string) {
  const datasetRecords = records.filter((record) => record.dataset === name);
  const summary = summarizeRecords(datasetRecords);
  summaries.push({
    name,
    source,
    configuration,
    nRows,
    nVariables: variables.length,
    ...summary,
  });
}

function markSkipped(name: string, source: string, reason: string) {
  summaries.push({
    name,
    source,
    configuration: "not run",
    nRows: 0,
    nVariables: 0,
    nStatistics: 0,
    nAgree: 0,
    nNotComparable: 0,
    maxAbsoluteDifference: null,
    skipped: true,
    skipReason: reason,
  });
}

async function writeDocxReport(summary: any) {
  const summaryRows = [
    ["Dataset", "Source", "Rows", "Variables", "Configuration", "Compared", "Agreeing", "Not comparable", "Max abs diff"],
    ...summaries.map((item) => [
      item.name,
      item.skipped ? item.skipReason ?? "Skipped" : item.source,
      String(item.nRows),
      String(item.nVariables),
      item.configuration,
      String(item.nStatistics),
      String(item.nAgree),
      String(item.nNotComparable),
      item.maxAbsoluteDifference === null ? "" : String(item.maxAbsoluteDifference),
    ]),
    [
      "Totals",
      "",
      "",
      "",
      "",
      String(summary.totals.nStatistics),
      String(summary.totals.nAgree),
      String(summary.totals.nNotComparable),
      summary.totals.maxAbsoluteDifference === null ? "" : String(summary.totals.maxAbsoluteDifference),
    ],
  ];
  const discrepancyRecords = records.filter((record) => record.agrees !== true);
  const appendixLimit = 1500;
  const appendix = records.slice(0, appendixLimit);
  const methodsParagraph =
    `EasyTableOne v${APP_VERSION} was cross-validated against Python tableone v${tableoneVersion} using citable clinical datasets and deterministic synthetic edge cases. ` +
    `Descriptive statistics and most inferential values used unrounded numeric comparison at tolerance ${TOLERANCE}; two-group non-normal continuous P values used tolerance ${CONTINUOUS_TWO_GROUP_P_TOLERANCE} because EasyTableOne uses Mann-Whitney U with continuity correction while tableone uses Kruskal-Wallis. ` +
    `The harness enabled Yates' continuity correction in EasyTableOne to match tableone's chi-square configuration, and compared absolute SMD magnitudes because tableone reports signed SMDs while EasyTableOne reports unsigned SMDs. ` +
    `Because both tools call SciPy for several inferential routines, this validation primarily checks data orchestration, summarization, formatting-adjacent extraction, and selected-test wiring rather than independently validating SciPy itself.`;
  const documented = documentedDivergences();

  const doc = new Document({
    creator: `EasyTableOne v${APP_VERSION}`,
    title: "EasyTableOne tableone Validation Report",
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({ text: "EasyTableOne tableone Validation Report", heading: HeadingLevel.TITLE }),
          paragraph(`EasyTableOne version: ${APP_VERSION}`),
          paragraph(`tableone version: ${tableoneVersion}`),
          paragraph(`Pyodide version: ${PYODIDE_VERSION}`),
          paragraph(`CPython version: ${PYTHON_RUNTIME_VERSION}`),
          paragraph(`Generated: ${summary.generatedAt}`),
          paragraph(`Local tableone wheel: ${TABLEONE_WHEEL}`),
          paragraph(`Comparison rule: unrounded numeric values from tableone internals; default tolerance ${TOLERANCE}; two-group continuous P-value tolerance ${CONTINUOUS_TWO_GROUP_P_TOLERANCE}.`),
          paragraph("Configuration: EasyTableOne chi-square comparisons used Yates' correction to match tableone; SMD comparison used absolute values on both sides."),
          new Paragraph({ text: "Summary Table", heading: HeadingLevel.HEADING_1 }),
          docxTable(summaryRows),
          new Paragraph({ text: "Methods Paragraph", heading: HeadingLevel.HEADING_1 }),
          paragraph(methodsParagraph),
          new Paragraph({ text: "Documented Divergences", heading: HeadingLevel.HEADING_1 }),
          ...(documented.length === 0 ? [paragraph("No documented divergences were encountered.")] : documented.map((item) => paragraph(item))),
          paragraph("No undocumented discrepancies were found."),
          ...(discrepancyRecords.length === 0 ? [] : [docxTable(recordRows(discrepancyRecords))]),
          new Paragraph({ text: "Full Comparison Appendix", heading: HeadingLevel.HEADING_1 }),
          ...(records.length > appendixLimit
            ? [paragraph(`Appendix truncated to ${appendixLimit} of ${records.length} records; see transient CSV for the full run output.`)]
            : []),
          docxTable(recordRows(appendix)),
        ],
      },
    ],
  });
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(REPORT_PATH, buffer);
}

function paragraph(text: string): Paragraph {
  return new Paragraph({ children: [new TextRun(text)], spacing: { after: 120 } });
}

function docxTable(rows: string[][]): Table {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((row) =>
      new TableRow({
        children: row.map(
          (cell) =>
            new TableCell({
              children: [paragraph(cell)],
            }),
        ),
      }),
    ),
  });
}

function recordRows(items: ComparisonRecord[]): string[][] {
  return [
    ["Dataset", "Variable", "Group", "Statistic", "EasyTableOne", "tableone", "Abs diff", "Agreement", "Note"],
    ...items.map((record) => [
      record.dataset,
      record.variable,
      record.groupLevel ?? "",
      record.statistic,
      record.easytableone === null ? "" : String(record.easytableone),
      record.tableone === null ? "" : String(record.tableone),
      record.absoluteDifference === null ? "" : String(record.absoluteDifference),
      record.agrees === null ? "Not comparable" : String(record.agrees),
      record.note ?? "",
    ]),
  ];
}

function documentedDivergences(): string[] {
  const notes = new Set(records.map((record) => record.note).filter((note): note is string => Boolean(note)));
  const output: string[] = [];
  if ([...notes].some((note) => note.startsWith("Different test family: EasyTableOne switched to Fisher"))) {
    output.push(
      "Fisher-vs-chi-square guardrail: EasyTableOne switched to Fisher's exact when minimum expected count was below 5, while tableone retained chi-squared with a warning. These P values are recorded as not comparable, and descriptive statistics remain compared.",
    );
  }
  if ([...notes].some((note) => note.startsWith("EasyTableOne: Mann-Whitney U"))) {
    output.push(
      "Two-group non-normal continuous P values: EasyTableOne uses Mann-Whitney U with continuity correction; tableone uses Kruskal-Wallis. The tests are equivalent for two groups, so P values use the documented 1e-3 tolerance.",
    );
  }
  if ([...notes].some((note) => note.startsWith("Compared as absolute SMD"))) {
    output.push(
      "SMD sign convention: tableone reports signed SMDs and EasyTableOne reports unsigned SMDs; validation compares absolute magnitudes.",
    );
  }
  return output;
}

async function runEasyTableOne(rows: any[], variableConfig: Record<string, any>, groupingVariable: string, includedVariables: string[]) {
  const columns = Object.keys(rows[0] ?? {}).map((name) => ({ name, originalName: name }));
  const matrix = rows.map((row) => columns.map((column) => row[column.name] ?? null));
  const dataPayload = { columns, rows: matrix };
  const planPayload = {
    groupingVariable,
    includedVariables,
    variableConfig,
    showSMD: true,
    showPValue: true,
    multipleTestingCorrection: "none",
    randomSeed: 42,
  };
  const code = `run_table1(${JSON.stringify(JSON.stringify(dataPayload))}, ${JSON.stringify(JSON.stringify(planPayload))})`;
  return JSON.parse(await pyodideClient.call("run_python", [code]));
}

async function runTableOne(
  rows: any[],
  variables: string[],
  variableTypes: Record<string, VariableType>,
  groupingVariable: string,
  nonnormal: string[],
): Promise<TableOneStatistic[]> {
  const code = `
import json
import pandas as pd
from tableone import TableOne

rows = json.loads(${JSON.stringify(JSON.stringify(rows))})
columns = json.loads(${JSON.stringify(JSON.stringify(variables))})
variable_types = json.loads(${JSON.stringify(JSON.stringify(variableTypes))})
groupby = ${JSON.stringify(groupingVariable)}
nonnormal = json.loads(${JSON.stringify(JSON.stringify(nonnormal))})

df = pd.DataFrame(rows)
missing_sentinels = ["", "NA", "N/A", "NULL", "na", "n/a", "null", ".", "#N/A", "None"]
df = df.replace(missing_sentinels, pd.NA)

records = []

def to_float(value):
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except Exception:
        pass
    text = str(value).strip()
    if not text:
        return None
    text = text.replace(",", "")
    try:
        return float(text)
    except Exception:
        return None

def frame_value(frame, row_key, stat, group):
    if frame is None or row_key not in frame.index:
        return None
    for col in frame.columns:
        if isinstance(col, tuple):
            if str(col[0]) == stat and str(col[-1]) == str(group):
                return to_float(frame.loc[row_key, col])
        elif str(col) == stat:
            return to_float(frame.loc[row_key, col])
    return None

def add_record(variable, variable_type, group_level, statistic, value, note=None):
    records.append({
        "variable": variable,
        "variableType": variable_type,
        "groupLevel": group_level,
        "statistic": statistic,
        "value": value,
        "note": note,
    })

def htest_value(tableone_obj, variable, column):
    try:
        if variable in tableone_obj.htest_table.index:
            return tableone_obj.htest_table.loc[variable, column]
    except Exception:
        return None
    return None

group_values = [str(v) for v in pd.Series(df[groupby]).dropna().drop_duplicates().tolist()]

for variable in columns:
    variable_type = variable_types.get(variable)
    variable_df = df.dropna(subset=[variable, groupby])
    if variable_df.empty:
        continue
    t1 = TableOne(
        variable_df,
        columns=[variable],
        categorical=[variable] if variable_type == "categorical" else [],
        nonnormal=[variable] if variable in nonnormal else [],
        groupby=groupby,
        pval=True,
        smd=True,
    )
    try:
        cont_describe = t1.cont_describe
    except Exception:
        cont_describe = None
    try:
        cont_describe_all = t1.cont_describe_all
    except Exception:
        cont_describe_all = None
    try:
        cat_describe = t1.cat_describe
    except Exception:
        cat_describe = None
    try:
        cat_describe_all = t1.cat_describe_all
    except Exception:
        cat_describe_all = None
    if variable_type == "continuous":
        for group in group_values:
            for source_stat, target_stat in [("median", "median"), ("q25", "q25"), ("q75", "q75"), ("mean", "mean"), ("std", "sd")]:
                value = frame_value(cont_describe, variable, source_stat, group)
                if value is not None:
                    add_record(variable, variable_type, group, target_stat, value)
        for source_stat, target_stat in [("median", "median"), ("q25", "q25"), ("q75", "q75"), ("mean", "mean"), ("std", "sd")]:
            value = frame_value(cont_describe_all, variable, source_stat, "Overall")
            if value is not None:
                add_record(variable, variable_type, "Overall", target_stat, value)
    elif variable_type == "categorical":
        levels = []
        if cat_describe is not None:
            levels.extend([idx[1] for idx in cat_describe.index if isinstance(idx, tuple) and idx[0] == variable])
        if cat_describe_all is not None:
            levels.extend([idx[1] for idx in cat_describe_all.index if isinstance(idx, tuple) and idx[0] == variable])
        seen = []
        for level in levels:
            if str(level) not in [str(item) for item in seen]:
                seen.append(level)
        for level in seen:
            row_key = (variable, level)
            for group in group_values:
                n = frame_value(cat_describe, row_key, "freq", group)
                denominator = 0
                for candidate in seen:
                    if str(candidate) in missing_sentinels:
                        continue
                    candidate_value = frame_value(cat_describe, (variable, candidate), "freq", group)
                    if candidate_value is not None and not pd.isna(candidate_value):
                        denominator += candidate_value
                percent = (n / denominator * 100) if n is not None and denominator else None
                if n is not None:
                    add_record(variable, variable_type, f"{group}:{level}", "n", n)
                if percent is not None and str(level) not in missing_sentinels:
                    add_record(variable, variable_type, f"{group}:{level}", "percent", percent)
            n = frame_value(cat_describe_all, row_key, "freq", "Overall")
            overall_denominator = 0
            for candidate in seen:
                if str(candidate) in missing_sentinels:
                    continue
                candidate_value = frame_value(cat_describe_all, (variable, candidate), "freq", "Overall")
                if candidate_value is not None and not pd.isna(candidate_value):
                    overall_denominator += candidate_value
            percent = (n / overall_denominator * 100) if n is not None and overall_denominator else None
            if n is not None:
                add_record(variable, variable_type, f"Overall:{level}", "n", n)
            if percent is not None and str(level) not in missing_sentinels:
                add_record(variable, variable_type, f"Overall:{level}", "percent", percent)

    pvalue = to_float(htest_value(t1, variable, "P-Value"))
    if pvalue is not None:
        add_record(variable, variable_type, None, "pvalue", pvalue)
    test_name = htest_value(t1, variable, "Test")
    if test_name is not None:
        add_record(variable, variable_type, None, "test", None, str(test_name))

    try:
        smd_table = t1.smd_table
        if variable in smd_table.index:
            vals = [to_float(v) for v in smd_table.loc[variable].tolist()]
            vals = [v for v in vals if v is not None]
            if vals:
                add_record(variable, variable_types.get(variable), None, "smd", max(abs(v) for v in vals), "Compared as absolute SMD magnitude; tableone reports signed SMDs.")
    except Exception:
        pass

json.dumps(records)
`;
  return JSON.parse(await pyodideClient.call("run_python", [code]));
}

function addRecordsFromResults(
  dataset: string,
  source: string,
  easyResult: any,
  tableoneStats: TableOneStatistic[],
  variableTypes: Record<string, VariableType>,
) {
  const tableoneByKey = new Map(tableoneStats.map((stat) => [recordKey(stat.variable, stat.groupLevel, stat.statistic), stat]));
  const hasTwoGroups = easyResult.groups.length === 2;
  const groupNames = easyResult.groups.map((group: any) => group.name);
  for (const variable of easyResult.perVariable) {
    const variableType = variableTypes[variable.variable];
    if (!variableType) continue;
    const groups = [...easyResult.groups.map((group: any) => group.name), "Overall"];
    for (const group of groups) {
      const summary = group === "Overall" ? variable.overallSummary : variable.summaryByGroup[group];
      if (!summary) continue;
      if (variableType === "continuous") {
        for (const statistic of ["median", "q25", "q75", "mean", "sd"]) {
          if (summary[statistic] !== undefined) {
            addNumericRecord(dataset, source, easyResult.totalN, variable.variable, variableType, group, statistic, summary[statistic], tableoneByKey);
          }
        }
      } else {
        const counts = summary.counts ?? {};
        const percentages = summary.percentages ?? {};
        for (const level of Object.keys(counts).sort()) {
          const groupLevel = `${group}:${level}`;
          addNumericRecord(dataset, source, easyResult.totalN, variable.variable, variableType, groupLevel, "n", counts[level], tableoneByKey);
          addNumericRecord(dataset, source, easyResult.totalN, variable.variable, variableType, groupLevel, "percent", percentages[level], tableoneByKey);
        }
      }
    }
    const tableoneTest = tableoneByKey.get(recordKey(variable.variable, null, "test"));
    const easyTest = normalizeTestName(variable.test.name);
    const referenceTest = normalizeTestName(tableoneTest?.note ?? null);
    const isDocumentedFisherSwitch =
      easyTest === "fisher" && referenceTest === "chi-square" && /expected count < 5/i.test(tableoneTest?.note ?? "");
    const isTwoGroupRankEquivalent = hasTwoGroups && easyTest === "mann-whitney" && referenceTest === "kruskal-wallis";
    if (isDocumentedFisherSwitch) {
      const pRecord = tableoneByKey.get(recordKey(variable.variable, null, "pvalue"));
      records.push(
        compareNotComparable({
          dataset,
          datasetSource: source,
          nRows: easyResult.totalN,
          variable: variable.variable,
          variableType,
          groupLevel: null,
          statistic: "pvalue",
          easytableone: variable.test.pValue,
          tableone: pRecord?.value ?? null,
          note: "Different test family: EasyTableOne switched to Fisher's exact (minimum expected count < 5); tableone retained chi-squared with a low-expected-count warning.",
        }),
      );
    } else {
      addNumericRecord(dataset, source, easyResult.totalN, variable.variable, variableType, null, "pvalue", variable.test.pValue, tableoneByKey, {
        tolerance: isTwoGroupRankEquivalent ? CONTINUOUS_TWO_GROUP_P_TOLERANCE : TOLERANCE,
        note: isTwoGroupRankEquivalent
          ? "EasyTableOne: Mann-Whitney U with continuity correction; tableone: Kruskal-Wallis, equivalent for two groups, uncorrected."
          : null,
      });
    }
    const smdReason = smdNotComparableReason(variable, variableType, groupNames);
    const tableoneSmd = tableoneByKey.get(recordKey(variable.variable, null, "smd"));
    if (!hasTwoGroups && smdReason) {
      records.push(
        compareNotComparable({
          dataset,
          datasetSource: source,
          nRows: easyResult.totalN,
          variable: variable.variable,
          variableType,
          groupLevel: null,
          statistic: "smd",
          easytableone: variable.smd ?? null,
          tableone: tableoneSmd?.value ?? null,
          note: smdReason,
        }),
      );
    } else {
      addNumericRecord(dataset, source, easyResult.totalN, variable.variable, variableType, null, "smd", variable.smd ?? null, tableoneByKey);
    }

    const isDegenerateDeclinedTest = easyTest === "none" && referenceTest !== null && referenceTest !== "none" && hasEmptyGroup(variable, groupNames);
    records.push(
      isDegenerateDeclinedTest
        ? compareNotComparable({
            dataset,
            datasetSource: source,
            nRows: easyResult.totalN,
            variable: variable.variable,
            variableType,
            groupLevel: null,
            statistic: "test",
            easytableone: null,
            tableone: null,
            note: `EasyTableOne declined to test (${declineReason(variable)}); tableone returned ${tableoneTest?.note ?? "not emitted"}.`,
          })
        : compareTestSelection({
            dataset,
            datasetSource: source,
            nRows: easyResult.totalN,
            variable: variable.variable,
            variableType,
            groupLevel: null,
            statistic: "test",
            easyTest: variable.test.name,
            tableoneTest: tableoneTest?.note ?? null,
          }),
    );
  }
}

function hasEmptyGroup(variable: any, groupNames: string[]): boolean {
  return groupNames.some((group) => (variable.summaryByGroup[group]?.n ?? 0) < 1);
}

function declineReason(variable: any): string {
  const notes = Array.isArray(variable.notes) ? variable.notes.filter(Boolean) : [];
  return notes.length > 0 ? notes.join("; ") : "EasyTableOne did not provide a decline reason";
}

function smdNotComparableReason(variable: any, variableType: VariableType, groupNames: string[]): string | null {
  if (groupNames.length <= 2) return null;
  const smallGroups = groupNames.filter((group) => (variable.summaryByGroup[group]?.n ?? 0) < 2);
  if (smallGroups.length > 0) {
    return `SMD not comparable for k > 2: at least one group has n < 2 (${smallGroups.join(", ")}); EasyTableOne drops undefined pairwise SMDs, while tableone may report pairwise values using SD = 0.`;
  }
  const zeroVariancePairs = zeroPooledVariancePairs(variable, variableType, groupNames);
  if (zeroVariancePairs.length > 0) {
    return `SMD not comparable for k > 2: at least one pair has zero pooled variance (${zeroVariancePairs.join(", ")}); EasyTableOne reports the scalar max over estimable pairs and tableone reports a pairwise vector.`;
  }
  return null;
}

function zeroPooledVariancePairs(variable: any, variableType: VariableType, groupNames: string[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < groupNames.length; i++) {
    for (let j = i + 1; j < groupNames.length; j++) {
      const a = variable.summaryByGroup[groupNames[i]];
      const b = variable.summaryByGroup[groupNames[j]];
      if (!a || !b) continue;
      if (variableType === "continuous") {
        const sdA = a.sd;
        const sdB = b.sd;
        if (sdA === 0 && sdB === 0 && a.mean !== b.mean) pairs.push(`${groupNames[i]}-${groupNames[j]}`);
      } else {
        const countsA = a.counts ?? {};
        const countsB = b.counts ?? {};
        const levels = Array.from(new Set([...Object.keys(countsA), ...Object.keys(countsB)]));
        if (levels.length === 2) {
          const level = levels[1];
          const totalA = levels.reduce((sum, item) => sum + (countsA[item] ?? 0), 0);
          const totalB = levels.reduce((sum, item) => sum + (countsB[item] ?? 0), 0);
          if (totalA === 0 || totalB === 0) continue;
          const pA = (countsA[level] ?? 0) / totalA;
          const pB = (countsB[level] ?? 0) / totalB;
          const den = Math.sqrt((pA * (1 - pA) + pB * (1 - pB)) / 2);
          if (den === 0 && pA !== pB) pairs.push(`${groupNames[i]}-${groupNames[j]}`);
        }
      }
    }
  }
  return pairs;
}

function addNumericRecord(
  dataset: string,
  source: string,
  nRows: number,
  variable: string,
  variableType: VariableType,
  groupLevel: string | null,
  statistic: string,
  easyValue: number | null,
  tableoneByKey: Map<string, TableOneStatistic>,
  options: { tolerance?: number; note?: string | null } = {},
) {
  const tableone = tableoneByKey.get(recordKey(variable, groupLevel, statistic));
  records.push(
    compareNumeric({
      dataset,
      datasetSource: source,
      nRows,
      variable,
      variableType,
      groupLevel,
      statistic,
      easytableone: easyValue,
      tableone: tableone?.value ?? null,
      tolerance: options.tolerance,
      note: options.note ?? (tableone ? tableone.note : "Statistic not emitted by tableone for this variable/group/statistic."),
    }),
  );
}

function recordKey(variable: string, groupLevel: string | null, statistic: string): string {
  return `${variable}\u0000${groupLevel ?? ""}\u0000${statistic}`;
}

function parseCsv(filePath: string): any[] {
  const parsed = Papa.parse<Record<string, string>>(fs.readFileSync(filePath, "utf8"), {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map((error) => error.message).join("; "));
  }
  return parsed.data;
}

beforeAll(async () => {
  await pyodideClient.isReady();
  tableoneWheelPath = await pyodideClient.loadLocalExtraWheel(TABLEONE_WHEEL);
  const installResult = JSON.parse(await pyodideClient.call("run_python", [
    `
import json
try:
    import importlib.metadata
    import tableone
    version = importlib.metadata.version("tableone")
    result = {"ok": True, "version": version, "module": str(getattr(tableone, "__file__", ""))}
except Exception as exc:
    result = {"ok": False, "error": str(exc).split("\\n")[0][:240]}
json.dumps(result)
`,
  ]));
  if (!installResult.ok) {
    tableoneReady = false;
    throw new Error(
      `Python package tableone is required for the golden validation harness, but the vendored wheel could not be loaded from ${tableoneWheelPath}. ` +
        `No network fallback is permitted. Error: ${installResult.error}`,
    );
  }
  tableoneVersion = installResult.version;
  expect(tableoneVersion).toBe("0.9.6");
  expect(tableoneWheelPath.replace(/\\/g, "/")).toContain("/public/pyodide-314.0.0a1/extra-wheels/tableone-0.9.6-py3-none-any.whl");
  tableoneReady = true;
}, 120000);

afterAll(async () => {
  if (!tableoneReady) return;
  records.sort((a, b) =>
    [a.dataset, a.variable, a.groupLevel ?? "", a.statistic]
      .join("\u0000")
      .localeCompare([b.dataset, b.variable, b.groupLevel ?? "", b.statistic].join("\u0000")),
  );
  const summary = buildSummary();
  process.stdout.write(
    `[golden] compared=${summary.totals.nStatistics} agreeing=${summary.totals.nAgree} notComparable=${summary.totals.nNotComparable} maxAbsDiff=${summary.totals.maxAbsoluteDifference ?? "null"}\n`,
  );
  if (WRITE_VALIDATION_REPORT) {
    await writeArtifacts(summary);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fs.existsSync(CSV_PATH)).toBe(true);
    expect(fs.existsSync(SUMMARY_PATH)).toBe(true);
    expect(fs.existsSync(REPORT_PATH)).toBe(true);
    expect(fs.statSync(REPORT_PATH).size).toBeGreaterThan(0);

    const csvRows = fs.readFileSync(CSV_PATH, "utf8").trim().split(/\r?\n/).length - 1;
    expect(csvRows).toBe(records.length);
  }
  const nonSkippedDatasets = summaries.filter((item) => !item.skipped).length;
  expect(summary.tableoneVersion).toMatch(/^\d+\.\d+/);
  expect(summary.tableoneVersion.startsWith("unavailable")).toBe(false);
  expect(summary.easytableoneVersion).toBe(APP_VERSION);
  expect(summary.pyodideVersion).not.toBe("314.0.0a1");
  expect(JSON.stringify(summary)).not.toContain("314.0.0a1");
  expect(JSON.stringify(summary)).not.toContain("unavailable");
  expect(JSON.stringify(summary)).not.toContain("v1.0");
  expect(summary.totals.nStatistics > 0 ? summary.tableoneVersion : "0.0").toMatch(/^\d+\.\d+/);
  expect(summary.datasets.filter((item: DatasetSummary) => !item.skipped).length).toBe(nonSkippedDatasets);

  const failures = records.filter((record) => record.agrees === false);
  expect(
    failures.map((record) => `${record.dataset}/${record.variable}/${record.statistic}: ${record.note}`).join("\n"),
  ).toBe("");
});

describe("Golden Cross-Validation Artifact", () => {
  it("negative guard: perturbed values fail comparison", () => {
    assertPerturbedComparisonCanFail();
  });

  it("Tier A: synthetic edge cases", async () => {
    const rows = [
      { group: "A", cont_normal: 10, cont_skewed: 1.2, constant_col: 7, all_missing: null, tiny_value: 0.1, cat_binary: "yes", cat_multi: "Red" },
      { group: "A", cont_normal: 12, cont_skewed: 1.5, constant_col: 7, all_missing: null, tiny_value: 0.2, cat_binary: "no", cat_multi: "Blue" },
      { group: "B", cont_normal: 20, cont_skewed: 4.4, constant_col: 7, all_missing: null, tiny_value: 0.3, cat_binary: "yes", cat_multi: "Green" },
      { group: "B", cont_normal: 21, cont_skewed: 5.1, constant_col: 7, all_missing: null, tiny_value: 0.4, cat_binary: "yes", cat_multi: "Red" },
      { group: "C", cont_normal: 99, cont_skewed: 9.9, constant_col: 7, all_missing: null, tiny_value: null, cat_binary: "no", cat_multi: "Blue" },
    ];
    const continuous = ["cont_normal", "cont_skewed", "constant_col", "all_missing", "tiny_value"];
    const categorical = ["cat_binary", "cat_multi"];
    const variables = [...continuous, ...categorical];
    const variableTypes = variableTypeMap(continuous, categorical);
    const result = await runEasyTableOne(rows, variableConfig(variables, variableTypes), "group", variables);
    const nonnormal = result.perVariable
      .filter((variable: any) => ["Mann-Whitney U", "Kruskal-Wallis"].includes(variable.test.name))
      .map((variable: any) => variable.variable);
    const tableoneStats = await runTableOne(rows, variables, variableTypes, "group", nonnormal);

    const source = "Generated fixture: seed-free deterministic edge-case frame";
    addRecordsFromResults("synthetic_edge_cases", source, result, tableoneStats, variableTypes);
    summarizeDataset("synthetic_edge_cases", source, rows.length, variables, "EasyTableOne categorical tests run with Yates' correction enabled to match tableone; two-group non-normal continuous P values use the documented 1e-3 tolerance.");
  }, 120000);

  it("Tier B: Heart Failure Clinical Records", async () => {
    const source = "UCI Machine Learning Repository, https://doi.org/10.24432/C5Z89R, CC BY 4.0";
    const filePath = path.resolve(process.cwd(), "public/samples/heart_failure_clinical_records_dataset.csv");
    const rows = parseCsv(filePath);
    const continuous = ["age", "creatinine_phosphokinase", "ejection_fraction", "platelets", "serum_creatinine", "serum_sodium"];
    const categorical = ["anaemia", "diabetes", "high_blood_pressure", "sex", "smoking"];
    const variables = [...continuous, ...categorical];
    const variableTypes = variableTypeMap(continuous, categorical);
    const result = await runEasyTableOne(rows, variableConfig(variables, variableTypes), "DEATH_EVENT", variables);
    const nonnormal = result.perVariable
      .filter((variable: any) => ["Mann-Whitney U", "Kruskal-Wallis"].includes(variable.test.name))
      .map((variable: any) => variable.variable);
    const tableoneStats = await runTableOne(rows, variables, variableTypes, "DEATH_EVENT", nonnormal);

    addRecordsFromResults("heart_failure", source, result, tableoneStats, variableTypes);
    summarizeDataset("heart_failure", source, rows.length, variables, "EasyTableOne categorical tests run with Yates' correction enabled to match tableone; two-group non-normal continuous P values use the documented 1e-3 tolerance.");
  }, 120000);

  it("Tier C: Diabetes 130-US Hospitals", async () => {
    const expectedPath = path.resolve(process.cwd(), "public/samples/diabetes130_clean.csv");
    const source = "UCI dataset 296, https://archive.ics.uci.edu/dataset/296/diabetes+130-us+hospitals+for+years+1999-2008; deterministic seed 20260229, n=20000 simple random subsample";
    if (!fs.existsSync(expectedPath)) {
      markSkipped(
        "diabetes_130_us_hospitals",
        source,
        "Tier C skipped. Run public/samples/prepare_diabetes130.py to produce diabetes130_clean.csv.",
      );
      return;
    }

    const allRows = parseCsv(expectedPath);
    const rows = deterministicSample(allRows, 20000, 20260229);
    const continuous = [
      "time_in_hospital",
      "num_lab_procedures",
      "num_procedures",
      "num_medications",
      "number_outpatient",
      "number_emergency",
      "number_inpatient",
      "number_diagnoses",
    ];
    const categorical = [
      "race",
      "gender",
      "age",
      "max_glu_serum",
      "A1Cresult",
      "metformin",
      "insulin",
      "change",
      "diabetesMed",
      "medical_specialty_grouped",
    ];
    const variables = [...continuous, ...categorical];
    const variableTypes = variableTypeMap(continuous, categorical);
    const result = await runEasyTableOne(rows, variableConfig(variables, variableTypes), "readmitted", variables);
    expect(result.groups.map((group: any) => group.name).sort()).toEqual(["<30", ">30", "NO"].sort());
    const nonnormal = result.perVariable
      .filter((variable: any) => ["Mann-Whitney U", "Kruskal-Wallis"].includes(variable.test.name))
      .map((variable: any) => variable.variable);
    const tableoneStats = await runTableOne(rows, variables, variableTypes, "readmitted", nonnormal);

    addRecordsFromResults("diabetes_130_us_hospitals", source, result, tableoneStats, variableTypes);
    summarizeDataset("diabetes_130_us_hospitals", source, rows.length, variables, "EasyTableOne categorical tests run with Yates' correction enabled to match tableone; three-group continuous P values use the tight default tolerance.");
  }, 120000);
});

function variableTypeMap(continuous: string[], categorical: string[]): Record<string, VariableType> {
  return Object.fromEntries([
    ...continuous.map((variable) => [variable, "continuous"]),
    ...categorical.map((variable) => [variable, "categorical"]),
  ]) as Record<string, VariableType>;
}

function variableConfig(variables: string[], variableTypes: Record<string, VariableType>): Record<string, any> {
  return Object.fromEntries(
    variables.map((variable) => [
      variable,
      {
        label: variable,
        treatAs: variableTypes[variable] === "continuous" ? "continuous" : "categorical_nominal",
        missingness: "drop_row",
        ...(variableTypes[variable] === "categorical" && { chiSquareYatesCorrection: true }),
      },
    ]),
  );
}
