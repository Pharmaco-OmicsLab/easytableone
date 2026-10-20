import fs from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { APP_VERSION } from "../../src/core/appVersion";
import { pyodideClient } from "../../src/workers/pyodide.client";
import { deterministicSample } from "../../scripts/bench/deterministic-sample.mjs";

const enabled = process.env.ETO_EXPORT_FOR_R === "1";
const work = path.resolve("validation/r/work");
const variableType = (continuous: string[], categorical: string[]) => Object.fromEntries([
  ...continuous.map((name) => [name, "continuous"]), ...categorical.map((name) => [name, "categorical"]),
]);
const csvRows = (file: string) => Papa.parse<Record<string, unknown>>(fs.readFileSync(file, "utf8"), {
  header: true, skipEmptyLines: true, dynamicTyping: true,
}).data;
const variableConfig = (vars: string[], roles: Record<string, string>) => Object.fromEntries(vars.map((v) => [v, {
  // Omit chiSquareYatesCorrection: easytable_stats.py defaults it to False.
  label: v, treatAs: roles[v] === "continuous" ? "continuous" : "categorical_nominal", missingness: "drop_row",
}]));
function writeCsv(file: string, rows: Record<string, unknown>[]) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const q = (v: unknown) => v == null ? "" : /[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  fs.writeFileSync(file, `${headers.join(",")}\n${rows.map((row) => headers.map((h) => q(row[h])).join(",")).join("\n")}\n`);
}

async function exportTier(tier: string, rows: Record<string, any>[], grouping: string, continuous: string[], categorical: string[], forcedMethods: Record<string, string> = {}) {
  const variables = [...continuous, ...categorical];
  const roles = variableType(continuous, categorical) as Record<string, string>;
  const groups = [...new Set(rows.map((r) => String(r[grouping])))].sort();
  const cols = Object.keys(rows[0]).map((name) => ({ name, originalName: name }));
  const matrix = rows.map((r) => cols.map((c) => r[c.name] ?? null));
  const data = { columns: cols, rows: matrix };
  const plan = { groupingVariable: grouping, includedVariables: variables, variableConfig: variableConfig(variables, roles), showSMD: true, showPValue: true, multipleTestingCorrection: "none", randomSeed: 20260229,
    testOverrides: Object.entries(forcedMethods).map(([variable, method]) => ({ variable, method, timestamp: "2026-10-11T00:00:00.000Z" })) };
  const expression = `run_table1(${JSON.stringify(JSON.stringify(data))}, ${JSON.stringify(JSON.stringify(plan))})`;
  const result = JSON.parse(await pyodideClient.call("run_python", [expression]));
  const fisher = result.perVariable.filter((v: any) => /fisher/i.test(v.test.name)).map((v: any) => v.variable);
  const specs = result.perVariable.map((v: any) => {
    let actualMwuMethod: string | null = null;
    if (/Mann-Whitney/i.test(v.test.name)) {
      const arrays = groups.map((g) => rows.filter((r) => String(r[grouping]) === g && r[v.variable] != null && Number.isFinite(Number(r[v.variable]))).map((r) => Number(r[v.variable])));
      const pooled = arrays.flat();
      const hasTies = new Set(pooled).size !== pooled.length;
      actualMwuMethod = arrays.some((a) => a.length <= 8) && !hasTies ? "exact" : "asymptotic";
    }
    return { variable: v.variable, role: roles[v.variable], test: v.test.name, statistic: v.test.statistic,
      pValue: v.test.originalPValue ?? v.test.pValue, auxiliary: v.test.auxiliary ?? {},
      scipyMannWhitney: actualMwuMethod ? { use_continuity: true, requested_method: "auto", actual_method: actualMwuMethod } : null,
      exact: fisher.includes(v.variable), smdUndefinedSmallGroup: v.smd == null && Object.values(v.summaryByGroup ?? {}).some((s: any) => (s.n ?? 0) < 2),
      emptyGroup: Boolean(v.notes?.some((n: string) => /one or more groups have no valid observations|empty group/i.test(n))) };
  });
  const spec = { tier, groupingVariable: grouping, groupOrder: result.groups.map((g: any) => String(g.name)), roles, tests: specs, fisherVariables: fisher, forcedTests: Object.keys(forcedMethods).length > 0,
    expectedMissingStatistics: tier === "A" ? {
      all_missing: { statistics: ["mean", "sd", "median", "q1", "q3"], reason: "The synthetic all_missing variable has no non-missing observations." },
      tiny_value: { groups: ["C"], statistics: ["mean", "sd", "median", "q1", "q3"], reason: "The synthetic tiny_value variable has no non-missing observations in group C." },
    } : {},
    settings: { scipyMannWhitneyUseContinuity: true, scipyMannWhitneyRequestedMethod: "auto", chiSquareYatesCorrection: false,
      fisherMonteCarloB: 9999, randomSeed: 20260229, deterministicTolerance: 1e-4, monteCarloTolerance: "3*sqrt(p*(1-p)/9999)+1e-4" } };
  const output: Record<string, unknown>[] = [];
  for (const v of result.perVariable) {
    const add = (group: string, summary: Record<string, unknown>) => {
      for (const [statistic, key] of [["mean","mean"],["sd","sd"],["median","median"],["q1","q25"],["q3","q75"],["n","n"]]) {
        if (summary[key] !== undefined && summary[key] !== null) output.push({ tier, variable: v.variable, group, statistic, value: summary[key] });
      }
      for (const [category, count] of Object.entries((summary.counts ?? {}) as Record<string, unknown>)) {
        output.push({ tier, variable: v.variable, group: `${group}|${category}`, statistic: "count", value: count });
      }
      for (const [category, percent] of Object.entries((summary.percentages ?? {}) as Record<string, unknown>)) {
        output.push({ tier, variable: v.variable, group: `${group}|${category}`, statistic: "percent", value: percent });
      }
    };
    for (const [group, summary] of Object.entries(v.summaryByGroup ?? {})) add(group, summary as Record<string, unknown>);
    add("Overall", v.overallSummary ?? {});
    if (v.test.originalPValue != null || v.test.pValue != null) output.push({ tier, variable: v.variable, group: "", statistic: "p_value", value: v.test.originalPValue ?? v.test.pValue });
    if (v.smd != null) output.push({ tier, variable: v.variable, group: "", statistic: "smd", value: v.smd });
  }
  fs.mkdirSync(work, { recursive: true });
  writeCsv(path.join(work, `${tier}_data.csv`), rows);
  fs.writeFileSync(path.join(work, `${tier}_spec.json`), `${JSON.stringify(spec, null, 2)}\n`);
  writeCsv(path.join(work, `${tier}_eto.csv`), output);
}

describe.skipIf(!enabled)("R tableone export", () => {
  it("exports the fixed Tier A/B/C analysis inputs and unrounded results", async () => {
    await pyodideClient.isReady();
    const synthetic = [
      { group:"A", cont_normal:10, cont_skewed:1.2, constant_col:7, all_missing:null, tiny_value:0.1, cat_binary:"yes", cat_multi:"Red" },
      { group:"A", cont_normal:12, cont_skewed:1.5, constant_col:7, all_missing:null, tiny_value:0.2, cat_binary:"no", cat_multi:"Blue" },
      { group:"B", cont_normal:20, cont_skewed:4.4, constant_col:7, all_missing:null, tiny_value:0.3, cat_binary:"yes", cat_multi:"Green" },
      { group:"B", cont_normal:21, cont_skewed:5.1, constant_col:7, all_missing:null, tiny_value:0.4, cat_binary:"yes", cat_multi:"Red" },
      { group:"C", cont_normal:99, cont_skewed:9.9, constant_col:7, all_missing:null, tiny_value:null, cat_binary:"no", cat_multi:"Blue" },
      { group:"C", cont_normal:101, cont_skewed:10.1, constant_col:7, all_missing:null, tiny_value:null, cat_binary:"no", cat_multi:"Green" },
    ];
    await exportTier("A", synthetic, "group", ["cont_normal","cont_skewed","constant_col","all_missing","tiny_value"], ["cat_binary","cat_multi"]);
    const heart = csvRows(path.resolve("public/samples/heart_failure_clinical_records_dataset.csv"));
    await exportTier("B", heart, "DEATH_EVENT", ["age","creatinine_phosphokinase","ejection_fraction","platelets","serum_creatinine","serum_sodium"], ["anaemia","diabetes","high_blood_pressure","sex","smoking"]);
    const heartContinuous = ["age","creatinine_phosphokinase","ejection_fraction","platelets","serum_creatinine","serum_sodium"];
    const heartCategorical = ["anaemia","diabetes","high_blood_pressure","sex","smoking"];
    await exportTier("Bp", heart, "DEATH_EVENT", heartContinuous, heartCategorical,
      Object.fromEntries([...heartContinuous.map((v) => [v, "welch_t_test"]), ...heartCategorical.map((v) => [v, "fishers_exact"])]));
    const diabetesPath = path.resolve("public/samples/diabetes130_clean.csv");
    if (fs.existsSync(diabetesPath)) {
      const sampled = deterministicSample(csvRows(diabetesPath), 20000, 20260229);
      await exportTier("C", sampled, "readmitted", ["time_in_hospital","num_lab_procedures","num_procedures","num_medications","number_outpatient","number_emergency","number_inpatient","number_diagnoses"], ["race","gender","age","max_glu_serum","A1Cresult","metformin","insulin","change","diabetesMed","medical_specialty_grouped"]);
      const diabetesContinuous = ["time_in_hospital","num_lab_procedures","num_procedures","num_medications","number_outpatient","number_emergency","number_inpatient","number_diagnoses"];
      const diabetesCategorical = ["race","gender","age","max_glu_serum","A1Cresult","metformin","insulin","change","diabetesMed","medical_specialty_grouped"];
      await exportTier("Cp", sampled, "readmitted", diabetesContinuous, diabetesCategorical,
        Object.fromEntries(diabetesContinuous.map((v) => [v, "oneway_anova"])));
    }
    for (const tier of ["A", "B", "C", "Bp", "Cp"]) {
      for (const suffix of ["spec.json", "data.csv", "eto.csv"]) expect(fs.existsSync(path.join(work, `${tier}_${suffix}`))).toBe(true);
    }
    const bpSpec = JSON.parse(fs.readFileSync(path.join(work, "Bp_spec.json"), "utf8"));
    expect(bpSpec.tests.filter((t: any) => t.role === "continuous").every((t: any) => /Welch/i.test(t.test))).toBe(true);
    expect(bpSpec.tests.filter((t: any) => t.role === "categorical").every((t: any) => /Fisher/i.test(t.test))).toBe(true);
    expect(bpSpec.fisherVariables).toHaveLength(heartCategorical.length);
    expect(bpSpec.groupOrder).toHaveLength(2);
    const bpData = csvRows(path.join(work, "Bp_data.csv"));
    expect(heartCategorical.every((variable) => new Set(bpData.map((row) => String(row[variable]))).size === 2)).toBe(true);
    const cpSpec = JSON.parse(fs.readFileSync(path.join(work, "Cp_spec.json"), "utf8"));
    expect(cpSpec.tests.filter((t: any) => t.role === "continuous").every((t: any) => /ANOVA/i.test(t.test))).toBe(true);
    expect(APP_VERSION).toMatch(/^\d/);
  }, 120000);
});
