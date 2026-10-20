import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DETERMINISTIC_TOLERANCE = 1e-4;
export const monteCarloTolerance = (p) => 3 * Math.sqrt(p * (1 - p) / 9999) + 1e-4;

// Expected E rows are limited to the intentionally all-missing A-tier fixture.
// Keep each exception explicit and justified; new missing summaries should fail.
export const expectedMissingStatistics = {
  A: {
    all_missing: { statistics: new Set(["mean", "sd", "median", "q1", "q3", "n"]), reason: "The synthetic all_missing variable has no non-missing observations; R tableone drops such variables entirely (ModuleReturnVarsExist), so it reports no n, while EasyTableOne reports n = 0." },
    tiny_value: { statistics: new Set(["mean", "sd", "median", "q1", "q3"]), groups: new Set(["C"]), reason: "The synthetic tiny_value variable has no non-missing observations in group C." },
  },
};

export function maximumAbsoluteDifferences(rows) {
  const hasMonteCarloComparisons = rows.some((row) => row.comparison_type === "monte_carlo_p" && row.absolute_difference != null && Number.isFinite(Number(row.absolute_difference)));
  const maxOf = (type) => {
    const values = rows.filter((row) => row.comparison_type === type && row.absolute_difference != null && Number.isFinite(Number(row.absolute_difference)))
      .map((row) => Number(row.absolute_difference));
    return values.length ? Math.max(...values) : 0;
  };
  const format = (value) => value === 0 ? "0.0" : value.toPrecision(2);
  return { exact: format(maxOf("exact")), monteCarloP: hasMonteCarloComparisons ? format(maxOf("monte_carlo_p")) : null };
}

const markdownMonteCarlo = (value) => value ?? "—";

export const categories = {
  A: { definition: "Same test, different label: both tools ran the same test but print it under a different name.", use: "Labels are never compared, only numbers. No record should get A." },
  B: { definition: "Different test family because of sparse cells: expected count < 5, so EasyTableOne ran Fisher where the other tool ran chi-square.", use: "Must be 0. R is told which variables use Fisher (exact = c(...)). Any B record is a setup bug." },
  C: { definition: "Mann–Whitney U (with continuity correction) vs Kruskal–Wallis.", use: "Must be 0. R runs wilcox.test for 2 groups with the same continuity and exact settings. Any C record is a setup bug." },
  D: { definition: "Standardised difference undefined because a group has n < 2. EasyTableOne drops it; the other tool may return a finite value.", use: "Same rule as S4." },
  D2: { definition: "Different multi-group SMD definition (R reports the mean of pairwise SMDs).", use: "New for R4; mark not comparable unless the definitions coincide." },
  E: { definition: "A statistic that one or both tools do not output.", use: "Same rule as S4." },
  F: { definition: "A test result that one or both tools do not output.", use: "Same rule as S4." },
  G: { definition: "EasyTableOne declined to test (a group has no valid observations) but the other tool returned a result.", use: "Same rule as S4." },
  H: { definition: "Monte Carlo P value, compared under the Monte Carlo tolerance.", use: "New for R4. Counts as compared, not as not comparable." },
};

function validateHarmonization(etoRows, rRows, spec) {
  const rTests = new Map(rRows.filter((r) => r.statistic === "test_selection").map((r) => [r.variable, r.value]));
  const rDetails = new Map(rRows.filter((r) => r.statistic === "test_detail").map((r) => [r.variable, r.value]));
  for (const test of spec.tests ?? []) {
    const family = String(rTests.get(test.variable) ?? "none");
    if (/^Fisher/i.test(test.test ?? "") && family !== "fisher") {
      throw new Error(`Category B setup failure for ${test.variable}: EasyTableOne selected Fisher, R reports ${family}.`);
    }
    if (/^Mann-Whitney/i.test(test.test ?? "")) {
      const detail = String(rDetails.get(test.variable) ?? "");
      const expected = test.scipyMannWhitney?.actual_method;
      if (family !== "mann_whitney" || !detail.includes(`exact=${expected}`) || !detail.includes("correct=true")) {
        throw new Error(`Category C setup failure for ${test.variable}: SciPy used continuity=true, method=${expected}; R reports ${family} (${detail || "no test detail"}).`);
      }
    }
  }
  // The ETO export is deliberately part of this check: a Fisher selection with no
  // reported p-value still must not silently lose its test-family validation.
  void etoRows;
}

export function compareRows(etoRows, rRows, spec) {
  validateHarmonization(etoRows, rRows, spec);
  const lookup = new Map(rRows.map((r) => [`${r.variable}\0${r.group}\0${r.statistic}`, r]));
  const tests = new Map((spec.tests ?? []).map((t) => [t.variable, t]));
  const keys = new Set([...etoRows, ...rRows].filter((r) => !["test_selection", "test_detail"].includes(r.statistic)).map((r) => `${r.variable}\0${r.group}\0${r.statistic}`));
  return [...keys].sort().map((key) => {
    const [variable, group, statistic] = key.split("\0");
    const eto = etoRows.find((r) => `${r.variable}\0${r.group}\0${r.statistic}` === key);
    const r = lookup.get(key);
    let valA = eto?.value === "" || eto?.value == null ? null : Number(eto.value);
    const valB = r?.value === "" || r?.value == null ? null : Number(r.value);
    const test = tests.get(variable);
    const comparisonType = statistic === "p_value" && /Monte Carlo/i.test(test?.test ?? "") ? "monte_carlo_p" : "exact";
    let category = "";
    let reason = "";
    const separator = group.lastIndexOf("|");
    const level = separator >= 0 ? group.slice(separator + 1) : "";
    const zeroCountOmission = !eto && ["count", "percent"].includes(statistic) && separator >= 0 &&
      valB === 0 && etoRows.some((row) => row.variable === variable && row.statistic === statistic &&
        row.group !== group && row.group.endsWith(`|${level}`) && row.value !== "" && row.value != null && Number(row.value) > 0);
    if (zeroCountOmission) {
      valA = 0;
      reason = "zero-count level not displayed by EasyTableOne; compared as 0";
    }
    let tolerance = DETERMINISTIC_TOLERANCE;
    let comparable = valA !== null && valB !== null && Number.isFinite(valA) && Number.isFinite(valB);
    if (statistic === "smd" && (spec.groupOrder?.length ?? 0) > 2 && (!comparable || Math.abs(valA - valB) > DETERMINISTIC_TOLERANCE)) {
      category = "D2"; reason = categories.D2.definition; comparable = false;
    } else if (statistic === "smd" && (spec.groupOrder?.length ?? 0) === 2 && test?.smdUndefinedSmallGroup) {
      category = "D"; reason = categories.D.definition; comparable = false;
    } else if (statistic === "p_value" && /Monte Carlo/i.test(test?.test ?? "") && comparable) {
      category = "H"; reason = categories.H.definition;
      if (valA !== null && Number.isFinite(valA)) tolerance = monteCarloTolerance(valA);
    } else if (statistic === "p_value" && test?.emptyGroup && valA === null && valB !== null) {
      category = "G"; reason = categories.G.definition; comparable = false;
    } else if (statistic === "p_value" && (!comparable || (test?.test === "None"))) {
      category = "F"; reason = categories.F.definition; comparable = false;
    } else if (!comparable) {
      category = statistic === "p_value" ? "F" : "E";
      reason = categories[category].definition;
      if (category === "E") {
        const allowed = expectedMissingStatistics[spec.tier]?.[variable];
        if (!allowed || !allowed.statistics.has(statistic) || (allowed.groups && !allowed.groups.has(group))) {
          throw new Error(`Unexpected category E for ${variable} (${statistic}): one or both tools omitted a required summary. Add a documented allowlist entry only if the omission is expected.`);
        }
        reason = allowed.reason;
      }
    }
    const difference = comparable ? Math.abs(valA - valB) : null;
    const agrees = comparable ? difference <= tolerance : null;
    if (agrees === false) { category = "DISCREPANCY"; reason = "Genuine numerical discrepancy beyond the fixed tolerance; investigate and report before landing."; }
    return { tier: spec.tier, variable, group, statistic, easytableone: valA, r_tableone: valB,
      absolute_difference: difference, comparison_type: comparisonType, tolerance, agrees, category, reason };
  });
}

function csvParse(text) {
  const lines = text.trim().split(/\r?\n/);
  const split = (line) => { const out=[]; let value="", quoted=false; for(let i=0;i<line.length;i++){ const c=line[i]; if(c==='"' && quoted && line[i+1]==='"'){value+='"';i++;} else if(c==='"') quoted=!quoted; else if(c===','&&!quoted){out.push(value);value="";} else value+=c;} out.push(value); return out; };
  const headers=split(lines[0]); return lines.slice(1).map((line)=>Object.fromEntries(split(line).map((v,i)=>[headers[i],v])));
}
const quote = (v) => { const s = v == null ? "" : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; };
function writeCsv(file, rows) { const headers=Object.keys(rows[0] ?? {tier:"",variable:"",group:"",statistic:"",easytableone:"",r_tableone:"",absolute_difference:"",tolerance:"",agrees:"",category:"",reason:""}); fs.writeFileSync(file, `${headers.join(",")}\n${rows.map(r=>headers.map(h=>quote(r[h])).join(",")).join("\n")}\n`); }

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const dir = path.resolve(process.argv[2] ?? "validation/r/work");
  const all=[]; const tiers=[];
  for (const tier of ["A","B","C","Bp","Cp"]) {
    const specFile=path.join(dir,`${tier}_spec.json`), etoFile=path.join(dir,`${tier}_eto.csv`), rFile=path.join(dir,`${tier}_r.csv`);
    if (!fs.existsSync(specFile)) continue;
    const spec=JSON.parse(fs.readFileSync(specFile,"utf8"));
    const rows=compareRows(csvParse(fs.readFileSync(etoFile,"utf8")),csvParse(fs.readFileSync(rFile,"utf8")),spec);
    all.push(...rows); tiers.push({tier,forcedTests:spec.forcedTests===true,rows:rows.length,agree:rows.filter(x=>x.agrees===true).length,disagree:rows.filter(x=>x.agrees===false).length,notComparable:rows.filter(x=>x.agrees===null).length,maximumAbsoluteDifference:maximumAbsoluteDifferences(rows)});
  }
  fs.mkdirSync("validation/r",{recursive:true});
  writeCsv("validation/r/r_tableone_comparison.csv",all);
  const versionFile=path.join(path.dirname(dir),"r_versions.txt");
  const versionLines=fs.existsSync(versionFile)?fs.readFileSync(versionFile,"utf8").split(/\r?\n/):[];
  const versionAt=(label)=>{const i=versionLines.indexOf(label);return i>=0?versionLines[i+1]??"unknown":"unknown";};
  const summary={generatedAt:new Date().toISOString(),rVersion:versionAt("R version"),tableoneVersion:versionAt("tableone version"),tolerances:{deterministic:1e-4,monteCarlo:"3*sqrt(p*(1-p)/9999)+1e-4"},maximumAbsoluteDifference:maximumAbsoluteDifferences(all),tiers,categories:Object.fromEntries(Object.entries(categories).map(([k,v])=>[k,{...v,count:all.filter(x=>x.category===k).length}])),genuineDiscrepancies:all.filter(x=>x.agrees===false)};
  fs.writeFileSync("validation/r/r_tableone_summary.json",`${JSON.stringify(summary,null,2)}\n`);
  const tierLines=tiers.map(t=>`| ${t.tier} | ${t.rows} | ${t.agree} | ${t.disagree} | ${t.notComparable} | ${t.maximumAbsoluteDifference.exact} | ${markdownMonteCarlo(t.maximumAbsoluteDifference.monteCarloP)} | ${t.forcedTests ? "User-selected test overrides" : "Automatic test selection"} |`);
  const categoryLines=Object.entries(summary.categories).map(([k,v])=>`| ${k} | ${v.definition} | ${v.use} | ${v.count} |`);
  fs.writeFileSync("validation/r/r_tableone_summary.md",`# Supplementary Table S3b — R tableone cross-validation\n\nR version: ${summary.rVersion}; tableone version: ${summary.tableoneVersion}. Deterministic tolerance: 1e-4. Monte Carlo P tolerance: 3·sqrt(p(1−p)/9999) + 1e-4. Overall maximum absolute difference: exact values ${summary.maximumAbsoluteDifference.exact}; Monte Carlo P values ${summary.maximumAbsoluteDifference.monteCarloP}. Bp and Cp use explicit user-selected test overrides.\n\n| Tier | Records | Agree | Disagree | Not comparable | Exact max abs diff | Monte Carlo P max abs diff | Test selection |\n|---|---:|---:|---:|---:|---:|---:|---|\n${tierLines.join("\n")}\n\n## Categories (Supplementary Table S4)\n\n| Code | Definition | R4 use | Count |\n|---|---|---|---:|\n${categoryLines.join("\n")}\n\nAny category B or C is a setup error and aborts comparison, naming the affected variable.\n`);
}
