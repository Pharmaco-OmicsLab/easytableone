import { describe, it, expect } from "vitest";
import { detectMissingCodes, recodeToMissing } from "./missingCodes";
import type { DataFrame, Schema } from "../types";
import { inferSchema } from "../schema/inference";
import { formatTable } from "../format/formatTable";
import { useStore } from "../../store";

function makeDf(colName: string, values: any[]): DataFrame {
  return {
    columns: [{ originalName: colName, name: colName }],
    rows: values.map((v) => [v]),
    meta: {
      sourceFile: "test.csv",
      parseWarnings: [],
      locale: { decimalSeparator: ".", thousandSeparator: "," },
      detectedHeaderRow: 0,
      confirmedHeaderRow: 0,
      encoding: "utf-8",
      missingSentinels: [],
    },
  };
}

function makeSchema(df: DataFrame): Schema {
  return { columns: inferSchema(df) };
}

describe("detectMissingCodes (Step 2 - D102a)", () => {
  it("detects the same numeric sentinels in an equivalent 200,000-row column", () => {
    const smallValues = Array.from({ length: 100 }, (_, index) => 20 + (index % 60));
    smallValues.push(-99, 9);
    const largeValues = Array.from({ length: 200_000 }, (_, index) => 20 + (index % 60));
    largeValues.push(-99, 9);

    const small = makeDf("age", smallValues);
    const large = makeDf("age", largeValues);
    expect(detectMissingCodes(large, makeSchema(large))).toEqual(detectMissingCodes(small, makeSchema(small)));
  });

  it("Age with fifty values in 20-90 plus three 999 -> one candidate, count 3", () => {
    // 50 values evenly distributed between 20 and 90
    const ages: any[] = [];
    for (let i = 0; i < 50; i++) {
      ages.push(20 + Math.floor((i * 70) / 49));
    }
    ages.push(999, 999, 999);

    const df = makeDf("age", ages);
    const schema = makeSchema(df);
    const candidates = detectMissingCodes(df, schema);

    expect(candidates.length).toBe(1);
    expect(candidates[0].column).toBe("age");
    expect(candidates[0].code).toBe("999");
    expect(candidates[0].count).toBe(3);
    expect(candidates[0].kind).toBe("numeric_sentinel");
    expect(candidates[0].reason).toBe(
      "999 is far outside the other values in this column and is a common missing-data code.",
    );
  });

  it("Age with -9 and otherwise non-negative -> candidate", () => {
    const ages: any[] = [25, 30, 45, 50, 60, -9];
    const df = makeDf("age", ages);
    const schema = makeSchema(df);
    const candidates = detectMissingCodes(df, schema);

    expect(candidates.length).toBe(1);
    expect(candidates[0].code).toBe("-9");
    expect(candidates[0].count).toBe(1);
    expect(candidates[0].kind).toBe("numeric_sentinel");
    expect(candidates[0].reason).toContain("-9 is far outside the other values in this column");
  });

  it("Systolic BP legitimately containing 99 among 80-180 -> not a candidate", () => {
    const sbp: any[] = [];
    for (let v = 80; v <= 180; v += 2) {
      sbp.push(v);
    }
    // Ensure 99 is included among legitimate BP values
    sbp.push(99);

    const df = makeDf("sbp", sbp);
    const schema = makeSchema(df);
    const candidates = detectMissingCodes(df, schema);

    expect(candidates).toEqual([]);
  });

  it("Sex 1/2/9 -> 9 candidate; sex 1/2 -> none", () => {
    const sexWith9 = makeDf("sex", [1, 2, 1, 2, 1, 2, 9, 9]);
    const schema9 = makeSchema(sexWith9);
    const cand9 = detectMissingCodes(sexWith9, schema9);

    expect(cand9.length).toBe(1);
    expect(cand9[0].code).toBe("9");
    expect(cand9[0].count).toBe(2);
    expect(cand9[0].kind).toBe("numeric_sentinel");

    const sexClean = makeDf("sex", [1, 2, 1, 2, 1, 2]);
    const schemaClean = makeSchema(sexClean);
    const candClean = detectMissingCodes(sexClean, schemaClean);

    expect(candClean).toEqual([]);
  });

  it("Creatinine numeric + one 'Unknown' (column inferred unsupported) -> Unknown candidate", () => {
    // 25 distinct numeric values repeated twice so cardinality (26) < n (51), avoiding id_like
    const crValues: any[] = [];
    for (let i = 1; i <= 25; i++) {
      crValues.push((0.6 + i * 0.1).toFixed(1));
      crValues.push((0.6 + i * 0.1).toFixed(1));
    }
    crValues.push("Unknown");

    const df = makeDf("creatinine", crValues);
    const schema = makeSchema(df);
    // Verify it is inferred as unsupported due to non-numeric "Unknown" and >20 levels
    expect(schema.columns[0].inferredType).toBe("unsupported");

    const candidates = detectMissingCodes(df, schema);
    expect(candidates.length).toBe(1);
    expect(candidates[0].column).toBe("creatinine");
    expect(candidates[0].code).toBe("Unknown");
    expect(candidates[0].count).toBe(1);
    expect(candidates[0].kind).toBe("text_token");
    expect(candidates[0].reason).toBe("Text value often used to mean 'missing'.");
  });

  it("Smoking 'None'/'Current'/'Former' -> no candidate", () => {
    const df = makeDf("smoking", ["None", "Current", "Former", "None", "Current"]);
    const schema = makeSchema(df);
    const candidates = detectMissingCodes(df, schema);
    expect(candidates).toEqual([]);
  });

  it("Vietnamese 'Không rõ' (capitalized, trailing space) -> candidate", () => {
    const df = makeDf("status", ["Bình thường", "Không rõ ", "Bình thường"]);
    const schema = makeSchema(df);
    const candidates = detectMissingCodes(df, schema);

    expect(candidates.length).toBe(1);
    expect(candidates[0].code).toBe("Không rõ");
    expect(candidates[0].kind).toBe("text_token");
    expect(candidates[0].reason).toBe("Text value often used to mean 'missing'.");
  });

  it("Dictionary declares 9 = 'Unknown' -> candidate with declaredLabel: 'Unknown'", () => {
    const df = makeDf("sex", [1, 2, 1, 9, 2]);
    const schema: Schema = {
      dictionarySource: "imported",
      columns: [
        {
          name: "sex",
          inferredType: "categorical_nominal",
          confirmedType: "categorical_nominal",
          cardinalityTier: "ok",
          levels: [
            { code: 1, label: "Male" },
            { code: 2, label: "Female" },
            { code: 9, label: "Unknown" },
          ],
        },
      ],
    };

    const candidates = detectMissingCodes(df, schema);
    expect(candidates.length).toBe(1);
    expect(candidates[0].code).toBe("9");
    expect(candidates[0].declaredLabel).toBe("Unknown");
  });

  it("Step 4 (D102a): No dictionary with 1/2/9 -> candidate 9 has no declaredLabel", () => {
    const df = makeDf("sex", [1, 2, 1, 9, 2]);
    const schema: Schema = {
      columns: [
        {
          name: "sex",
          inferredType: "categorical_nominal",
          confirmedType: "categorical_nominal",
          cardinalityTier: "ok",
          levels: [
            { code: 1, label: "1" },
            { code: 2, label: "2" },
            { code: 9, label: "9" },
          ],
        },
      ],
    };

    const candidates = detectMissingCodes(df, schema);
    expect(candidates.length).toBe(1);
    expect(candidates[0].code).toBe("9");
    expect(candidates[0].declaredLabel).toBeUndefined();
  });

  it("Step 3 (D107(b)): NFD 'Không rõ' is detected and recoded", () => {
    const nfd = "Không rõ".normalize("NFD");
    const df = makeDf("status", ["Bình thường", nfd, nfd, "Bình thường"]);
    const schema = makeSchema(df);
    const candidates = detectMissingCodes(df, schema);

    expect(candidates.length).toBe(1);
    expect(candidates[0].count).toBe(2);

    const { df: newDf, changed } = recodeToMissing(df, schema, "status", ["Không rõ"]);
    expect(changed).toBe(2);
    expect(newDf.rows[1][0]).toBeNull();
    expect(newDf.rows[2][0]).toBeNull();
  });

  it("Step 3 (D107(b)): mixed NFC/NFD column is counted as one candidate with combined count", () => {
    const nfc = "Không rõ".normalize("NFC");
    const nfd = "Không rõ".normalize("NFD");
    const df = makeDf("status", ["Bình thường", nfc, nfd, nfd]);
    const schema = makeSchema(df);
    const candidates = detectMissingCodes(df, schema);

    expect(candidates.length).toBe(1);
    expect(candidates[0].count).toBe(3);
  });

  it("Step 6: Pain score 0-10 (>=10 values, including several 9s) plus 999 -> 999 is candidate, 9 is not", () => {
    const painValues = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 9, 9, 10, 999];
    const df = makeDf("pain", painValues);
    const schema = makeSchema(df);
    const candidates = detectMissingCodes(df, schema);

    expect(candidates.some((c) => c.code === "999")).toBe(true);
    expect(candidates.some((c) => c.code === "9")).toBe(false);
  });
});

describe("recodeToMissing & applyMissingCodeRecode (Step 3 - D102b)", () => {
  it("Creatinine + Unknown -> after recode, column is continuous, exclusionReason cleared, included", () => {
    const crValues: any[] = [];
    for (let i = 1; i <= 25; i++) {
      crValues.push((0.6 + i * 0.1).toFixed(1));
      crValues.push((0.6 + i * 0.1).toFixed(1));
    }
    crValues.push("Unknown");

    const df = makeDf("creatinine", crValues);
    const schema = makeSchema(df);
    expect(schema.columns[0].inferredType).toBe("unsupported");
    expect(schema.columns[0].exclusionReason).toBeDefined();

    const { df: newDf, schema: newSchema, changed } = recodeToMissing(df, schema, "creatinine", ["Unknown"]);
    expect(changed).toBe(1);
    expect(newDf.rows[50][0]).toBeNull();

    const col = newSchema.columns[0];
    expect(col.inferredType).toBe("continuous");
    expect(col.confirmedType).toBe("continuous");
    expect(col.exclusionReason).toBeUndefined();
    expect(col.cardinalityTier).toBe("ok");
  });

  it("Sex 1/2/9 -> after recoding 9, binary", () => {
    const df = makeDf("sex", [1, 2, 1, 2, 9, 9]);
    const schema = makeSchema(df);
    expect(schema.columns[0].inferredType).toBe("categorical_nominal");

    const { df: newDf, schema: newSchema, changed } = recodeToMissing(df, schema, "sex", ["9"]);
    expect(changed).toBe(2);
    expect(newDf.rows[4][0]).toBeNull();
    expect(newDf.rows[5][0]).toBeNull();

    const col = newSchema.columns[0];
    expect(col.inferredType).toBe("binary");
    expect(col.confirmedType).toBe("binary");
  });

  it("A user-set confirmedType survives recode", () => {
    const df = makeDf("sex", [1, 2, 1, 2, 9]);
    const schema = makeSchema(df);
    // User manually set confirmedType to categorical_nominal before recode
    schema.columns[0].confirmedType = "categorical_nominal";
    // Artificially change inferredType to simulate user override
    schema.columns[0].inferredType = "unsupported";

    const { schema: newSchema } = recodeToMissing(df, schema, "sex", ["9"]);
    const col = newSchema.columns[0];
    // Inferred type re-evaluated to binary, but confirmedType kept as user-set categorical_nominal
    expect(col.inferredType).toBe("binary");
    expect(col.confirmedType).toBe("categorical_nominal");
  });

  it("Dictionary levels lose the recoded code and keep the others", () => {
    const df = makeDf("sex", [1, 2, 1, 9]);
    const schema: Schema = {
      columns: [
        {
          name: "sex",
          inferredType: "categorical_nominal",
          confirmedType: "categorical_nominal",
          cardinalityTier: "ok",
          displayLabel: "Biological Sex",
          units: "n/a",
          levels: [
            { code: 1, label: "Male" },
            { code: 2, label: "Female" },
            { code: 9, label: "Unknown" },
          ],
        },
      ],
    };

    const { schema: newSchema } = recodeToMissing(df, schema, "sex", ["9"]);
    const col = newSchema.columns[0];
    expect(col.displayLabel).toBe("Biological Sex");
    expect(col.units).toBe("n/a");
    expect(col.levels).toEqual([
      { code: 1, label: "Male" },
      { code: 2, label: "Female" },
    ]);
  });

  it("applyMissingCodeRecode in store updates state, auditLog, dataQualityRecords, and invalidates caches", () => {
    const df = makeDf("sex", [1, 2, 1, 9]);
    const schema = makeSchema(df);

    useStore.setState({
      data: df,
      schema,
      auditLog: [],
      dataQualityRecords: [],
      edaResults: { some: "eda" } as any,
      modelingSetup: { some: "setup" } as any,
      modelingResults: { some: "results" } as any,
      stats: { some: "stats" } as any,
    });

    useStore.getState().applyMissingCodeRecode("sex", ["9"]);

    const state = useStore.getState();
    expect(state.data?.rows[3][0]).toBeNull();
    expect(state.schema?.columns[0].inferredType).toBe("binary");
    expect(state.edaResults).toBeNull();
    expect(state.modelingSetup).toBeNull();
    expect(state.modelingResults).toBeNull();
    expect(state.stats).toBeNull();

    // Check audit log
    expect(state.auditLog.length).toBe(1);
    expect(state.auditLog[0].action).toBe("missing_code_recoded");
    expect(state.auditLog[0].details).toEqual({
      column: "sex",
      codes: "9",
      count: 1,
    });

    // Check DataQualityRecord
    expect(state.dataQualityRecords.length).toBe(1);
    const rec = state.dataQualityRecords[0];
    expect(rec.finding.checkId).toBe("missing_code_sex");
    expect(rec.finding.tier).toBe("advisory");
    expect(rec.finding.category).toBe("quality");
    expect(rec.response).toBe("applied");
    expect(rec.finding.affectedCount).toBe(1);
    expect(rec.finding.sampleValues).toEqual(["9"]);
    expect(rec.finding.title).toBe("Missing-value codes recoded");
  });

  it("Acceptance Criterion 2: serum_creatinine 'Unknown' + age '999' before/after recode", () => {
    // 30 patients
    const rows: any[][] = [];
    for (let i = 0; i < 30; i++) {
      const crVal = (0.7 + (i % 25) * 0.1).toFixed(1);
      const ageVal = 40 + (i % 15) * 2;
      rows.push([ageVal, crVal]);
    }
    // Row 5 edited to Unknown (index 4)
    rows[4][1] = "Unknown";
    // Row 7 edited to 999 (index 6)
    rows[6][0] = 999;

    const df: DataFrame = {
      columns: [
        { originalName: "age", name: "age" },
        { originalName: "serum_creatinine", name: "serum_creatinine" },
      ],
      rows,
      meta: {
        sourceFile: "sample.csv",
        parseWarnings: [],
        locale: { decimalSeparator: ".", thousandSeparator: "," },
        detectedHeaderRow: 0,
        confirmedHeaderRow: 0,
        encoding: "utf-8",
        missingSentinels: [],
      },
    };

    const schema = makeSchema(df);

    // Before recode:
    // serum_creatinine is unsupported and excluded
    const crColBefore = schema.columns.find((c) => c.name === "serum_creatinine")!;
    expect(crColBefore.inferredType).toBe("unsupported");
    expect(crColBefore.exclusionReason).toBeDefined();

    // age is continuous and includes 999
    const ageColBefore = schema.columns.find((c) => c.name === "age")!;
    expect(ageColBefore.inferredType).toBe("continuous");
    const ageMeanBefore = rows.reduce((sum, r) => sum + Number(r[0]), 0) / rows.length;
    expect(ageMeanBefore).toBeGreaterThan(80); // pulled up by 999

    // Detector lists both
    const candidates = detectMissingCodes(df, schema);
    expect(candidates.some((c) => c.column === "serum_creatinine" && c.code === "Unknown")).toBe(true);
    expect(candidates.some((c) => c.column === "age" && c.code === "999")).toBe(true);

    // Set up store and recode both
    useStore.setState({
      data: df,
      schema,
      auditLog: [],
      dataQualityRecords: [],
    });

    useStore.getState().applyMissingCodeRecode("serum_creatinine", ["Unknown"]);
    useStore.getState().applyMissingCodeRecode("age", ["999"]);

    const state = useStore.getState();
    const crColAfter = state.schema!.columns.find((c) => c.name === "serum_creatinine")!;
    const ageColAfter = state.schema!.columns.find((c) => c.name === "age")!;

    // After recode:
    // creatinine is continuous and included
    expect(crColAfter.inferredType).toBe("continuous");
    expect(crColAfter.confirmedType).toBe("continuous");
    expect(crColAfter.exclusionReason).toBeUndefined();
    expect(ageColAfter.confirmedType).toBe("continuous");

    // age 999 is null, mean matches dataset without that row
    const nonNullAges = state.data!.rows.map((r) => r[0]).filter((v) => v !== null) as number[];
    expect(nonNullAges.length).toBe(29);
    const ageMeanAfter = nonNullAges.reduce((sum, a) => sum + a, 0) / nonNullAges.length;
    expect(ageMeanAfter).toBeLessThan(60);

    // Formatter outputs table notes and methods paragraph
    const formatted = formatTable(
      {
        perVariable: [
          {
            variable: "age",
            summaryByGroup: {},
            overallSummary: { mean: ageMeanAfter, sd: 8.5, n: 29 },
            test: { name: "None", statistic: null, pValue: null },
            notes: [],
          },
          {
            variable: "serum_creatinine",
            summaryByGroup: {},
            overallSummary: { mean: 1.8, sd: 0.7, n: 29 },
            test: { name: "None", statistic: null, pValue: null },
            notes: [],
          },
        ],
        groups: [],
        totalN: 29,
        computeMetadata: { libVersions: {}, seed: 42 },
      },
      "NEJM",
      {
        rulesetVersion: "1.3",
        appVersion: "1.0",
        researchPopulation: "adult",
        studyDesign: "unspecified",
        unitSystem: "metric",
        groupingVariable: "age",
        includedVariables: ["age", "serum_creatinine"],
        variableConfig: {},
        showSMD: false,
        showPValue: false,
        multipleTestingCorrection: "none",
        randomSeed: 42,
        auditLog: state.auditLog,
      },
      state.schema!,
      "1.0",
      state.dataQualityRecords,
    );

    // Table notes mention recode
    expect(formatted.dataQualityNotes).toBeDefined();
    expect(formatted.dataQualityNotes!.some((n) => n.includes("serum_creatinine") && n.includes("Unknown"))).toBe(true);
    expect(formatted.dataQualityNotes!.some((n) => n.includes("age") && n.includes("999"))).toBe(true);

    // Methods paragraph mentions recode
    expect(formatted.methodsParagraph).toContain("missing-data codes");
    expect(formatted.methodsParagraph).toContain('Values recorded as missing-data codes (for example "Unknown" or 999) were set to missing before analysis at user direction.');
  });

  it("Step 5 (D102d): Two recodes on the same column preserve both codes and sum counts", () => {
    const ages: any[] = [];
    for (let i = 0; i < 20; i++) {
      ages.push(30 + i);
    }
    ages.push(999, 999, 999, -9);
    const df = makeDf("Age", ages);
    const schema = makeSchema(df);

    useStore.setState({
      data: df,
      schema,
      auditLog: [],
      dataQualityRecords: [],
    });

    useStore.getState().applyMissingCodeRecode("Age", ["999"]);
    let state = useStore.getState();
    expect(state.dataQualityRecords.length).toBe(1);
    expect(state.dataQualityRecords[0].finding.sampleValues).toEqual(["999"]);
    expect(state.dataQualityRecords[0].finding.affectedCount).toBe(3);
    expect(state.auditLog.length).toBe(1);

    useStore.getState().applyMissingCodeRecode("Age", ["-9"]);
    state = useStore.getState();
    expect(state.dataQualityRecords.length).toBe(1);
    expect(state.dataQualityRecords[0].finding.sampleValues).toEqual(["999", "-9"]);
    expect(state.dataQualityRecords[0].finding.affectedCount).toBe(4);
    expect(state.auditLog.length).toBe(2);

    const formatted = formatTable(
      {
        perVariable: [
          {
            variable: "Age",
            summaryByGroup: {},
            overallSummary: { mean: 40, sd: 5, n: 20 },
            test: { name: "None", statistic: null, pValue: null },
            notes: [],
          },
        ],
        groups: [],
        totalN: 20,
        computeMetadata: { libVersions: {}, seed: 42 },
      },
      "NEJM",
      {
        rulesetVersion: "1.3",
        appVersion: "1.0",
        researchPopulation: "adult",
        studyDesign: "unspecified",
        unitSystem: "metric",
        groupingVariable: "Age",
        includedVariables: ["Age"],
        variableConfig: {},
        showSMD: false,
        showPValue: false,
        multipleTestingCorrection: "none",
        randomSeed: 42,
        auditLog: state.auditLog,
      },
      state.schema!,
      "1.0",
      state.dataQualityRecords,
    );

    expect(formatted.dataQualityNotes).toBeDefined();
    expect(
      formatted.dataQualityNotes!.some((n) =>
        n.includes("4 value(s) coded 999, -9 in *Age* were treated as missing."),
      ),
    ).toBe(true);
  });
});
