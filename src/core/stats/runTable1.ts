import { pyodideClient } from "../../workers/pyodide.client";
import type { AnalysisPlan, DataFrame, RecomputeVariableResult, StatisticalResults, TestMethod } from "../types";
import { RecomputeVariableResultSchema, StatisticalResultsSchema } from "../types";
import { sha256Hex } from "../../lib/hash";

async function computeDerivedSeed(data: DataFrame, plan: AnalysisPlan): Promise<number> {
  const groupColIndex = data.columns.findIndex((c) => c.name === plan.groupingVariable);
  let groupColumnSortedValues: any[] = [];
  if (groupColIndex !== -1) {
    const values = data.rows
      .map((r) => r[groupColIndex])
      .filter((v) => v !== null && v !== undefined);
    groupColumnSortedValues = Array.from(new Set(values)).sort();
  }
  const variableNamesSorted = [...plan.includedVariables].sort();
  const totalN = data.rows.length;

  const serialized = JSON.stringify({
    grouping: groupColumnSortedValues,
    variables: variableNamesSorted,
    n: totalN,
  });

  const hash = await sha256Hex(serialized);
  const last8 = hash.slice(-8);
  return parseInt(last8, 16);
}

export async function runTable1(data: DataFrame, plan: AnalysisPlan): Promise<StatisticalResults> {
  await pyodideClient.isReady();

  let effectivePlan = plan;
  if (plan.randomSeed === undefined) {
    const derivedSeed = await computeDerivedSeed(data, plan);
    effectivePlan = { ...plan, randomSeed: derivedSeed };
  }

  const dataJson = JSON.stringify(data);
  const planJson = JSON.stringify(effectivePlan);

  const resultJsonStr = await pyodideClient.call("run_table1", [dataJson, planJson]);

  let resultObj: unknown;
  try {
    resultObj = JSON.parse(resultJsonStr);
  } catch (err) {
    // (S-10) no `err: any`
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse statistical engine output: ${message}`);
  }

  // (S-11) removed defensive computeMetadata fallback — Zod will surface missing fields
  const parseResult = StatisticalResultsSchema.safeParse(resultObj);

  if (!parseResult.success) {
    // (S-9) surface detailed field-level issues instead of a single opaque message
    const issueDetails = parseResult.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(`Statistical engine output did not match expected schema:\n${issueDetails}`);
  }

  return parseResult.data;
}

export async function recomputeVariable(
  data: DataFrame,
  plan: AnalysisPlan,
  results: StatisticalResults,
  variable: string,
  method?: TestMethod,
): Promise<StatisticalResults["perVariable"][0]> {
  await pyodideClient.isReady();

  let effectivePlan = plan;
  if (plan.randomSeed === undefined) {
    const derivedSeed = await computeDerivedSeed(data, plan);
    effectivePlan = { ...plan, randomSeed: derivedSeed };
  }

  const rawPvals: Record<string, number | null> = {};
  for (const v of results.perVariable) {
    rawPvals[v.variable] = v.test.originalPValue !== undefined && v.test.originalPValue !== null
      ? v.test.originalPValue
      : v.test.pValue;
  }
  const existingRawPvalsJson = JSON.stringify(rawPvals);

  const dataJson = JSON.stringify(data);
  const planJson = JSON.stringify(effectivePlan);

  const resultJsonStr = await pyodideClient.call("recompute_variable", [
    dataJson,
    planJson,
    variable,
    method ?? null,
    existingRawPvalsJson,
  ]);

  let resultObj: unknown;
  try {
    resultObj = JSON.parse(resultJsonStr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse statistical engine output for recompute: ${message}`);
  }

  const parseResult = RecomputeVariableResultSchema.safeParse(resultObj);

  if (!parseResult.success) {
    const issueDetails = parseResult.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(`Statistical engine recompute output did not match expected schema:\n${issueDetails}`);
  }

  return "result" in parseResult.data ? parseResult.data.result : parseResult.data;
}

export async function recomputeVariableWithAdjustments(
  data: DataFrame,
  plan: AnalysisPlan,
  results: StatisticalResults,
  variable: string,
  method?: TestMethod,
): Promise<RecomputeVariableResult> {
  await pyodideClient.isReady();

  let effectivePlan = plan;
  if (plan.randomSeed === undefined) {
    const derivedSeed = await computeDerivedSeed(data, plan);
    effectivePlan = { ...plan, randomSeed: derivedSeed };
  }

  const rawPvals: Record<string, number | null> = {};
  for (const v of results.perVariable) {
    rawPvals[v.variable] = v.test.originalPValue !== undefined && v.test.originalPValue !== null
      ? v.test.originalPValue
      : v.test.pValue;
  }

  const resultJsonStr = await pyodideClient.call("recompute_variable", [
    JSON.stringify(data),
    JSON.stringify(effectivePlan),
    variable,
    method ?? null,
    JSON.stringify(rawPvals),
  ]);

  let resultObj: unknown;
  try {
    resultObj = JSON.parse(resultJsonStr);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to parse statistical engine output for recompute: ${message}`);
  }

  const parseResult = RecomputeVariableResultSchema.safeParse(resultObj);
  if (!parseResult.success) {
    const issueDetails = parseResult.error.issues
      .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("\n");
    throw new Error(`Statistical engine recompute output did not match expected schema:\n${issueDetails}`);
  }

  return parseResult.data;
}
