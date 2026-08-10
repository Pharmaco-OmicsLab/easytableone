import { describe, it, expect, beforeEach } from "vitest";
import { classifyColumnsFromDict } from "../src/core/dictionary/importer";
import { applyDetectedDictionary } from "../src/core/dictionary/applyDetected";
import type { DetectedDictionarySheet } from "../src/core/dictionary/sheetDetector";
import { sha256Hex } from "../src/lib/hash";
import { formatTable, journalRulesets } from "../src/core/format/formatTable";
import { generateAnalysisHistory } from "../src/core/export/analysisHistory";
import { generateReproducibilityJson } from "../src/core/export/reproducibilityJson";
import type { AnalysisPlan, Schema, SchemaColumn, StatisticalResults } from "../src/core/types";
import { useStore } from "../src/store";

describe("dictionary", () => {
  const rawSchema: SchemaColumn[] = [
    { name: "[h3] necrotizing enterocolitis", inferredType: "numeric_encoded_categorical_ambiguous", confirmedType: "numeric_encoded_categorical_ambiguous", cardinalityTier: "ok" },
    { name: "[h8] Congenital heart disease", inferredType: "numeric_encoded_categorical_ambiguous", confirmedType: "numeric_encoded_categorical_ambiguous", cardinalityTier: "ok" },
  ];

  const dictRows = {
    "[h3] necrotizing enterocolitis": { levels: [{ code: "1", label: "Yes" }, { code: "2", label: "No" }], label: "NEC" },
    "[h8] Congenital heart disease": { levels: [{ code: "1", label: "Yes" }, { code: "2", label: "No" }], label: "CHD" }
  };

  it("dictionary-applied columns with parseable encoding strings auto-classify as binary/categorical", () => {
    const updated = classifyColumnsFromDict(rawSchema, dictRows);
    expect(updated[0].confirmedType).toBe("binary");
    expect(updated[1].confirmedType).toBe("binary");
    
    // Labels propagate
    expect(updated[0].label).toBe("NEC");
    expect(updated[1].label).toBe("CHD");
    
    // Levels propagate
    expect(updated[0].levels).toEqual([{code: "1", label: "Yes"}, {code: "2", label: "No"}]);
  });

  it("columns matched by label-only dictionary entry auto-classify as binary (G-3 fallback)", () => {
    const schemaWithAmbiguous: SchemaColumn[] = [
      { name: "[h3] necrotizing enterocolitis", inferredType: "numeric_encoded_categorical_ambiguous", confirmedType: "numeric_encoded_categorical_ambiguous", cardinalityTier: "ok", levels: [{code: 0, label: "0"}, {code: 1, label: "1"}] }
    ];
    // Dictionary only provides a label, NO encoding string
    const labelOnlyDict = {
      "[h3] necrotizing enterocolitis": { label: "NEC" }
    };
    const updated = classifyColumnsFromDict(schemaWithAmbiguous, labelOnlyDict);
    expect(updated[0].confirmedType).toBe("binary");
    expect(updated[0].label).toBe("NEC");
  });

  it("dictionary fingerprint is set after import", async () => {
    const fingerprintInput = JSON.stringify({
      rows: Object.entries(dictRows).sort((a, b) => a[0].localeCompare(b[0]))
    });
    const dictionaryFingerprint = await sha256Hex(fingerprintInput);
    
    expect(dictionaryFingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("applyDetectedDictionary populates displayLabel and units on matching columns (Step 7b.5.2)", () => {
    const inferred: SchemaColumn[] = [
      { name: "[b1]GA", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      { name: "[c10]Edema", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
      { name: "untouched_col", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
    ];
    const detected: DetectedDictionarySheet = {
      sheetName: "250113_variablecoding",
      rawColumn: "Original_Var_InDATA",
      labelColumn: "Report_variable_names_v2",
      unitsColumn: "Units",
      matchScore: 0.97,
      preview: [],
      mapping: {
        "[b1]GA": { label: "Gestational age", units: "weeks" },
        "[c10]Edema": { label: "Edema" },
      },
    };
    const { columns, matched, total } = applyDetectedDictionary(inferred, detected);
    expect(matched).toBe(2);
    expect(total).toBe(3);
    expect(columns[0].displayLabel).toBe("Gestational age");
    expect(columns[0].units).toBe("weeks");
    expect(columns[1].displayLabel).toBe("Edema");
    expect(columns[1].units).toBeUndefined();
    // Untouched column gets no displayLabel and is returned unchanged.
    expect(columns[2].displayLabel).toBeUndefined();
    expect(columns[2]).toBe(inferred[2]);
  });

  it("applyDetectedDictionary preserves pre-existing units on a column (no overwrite)", () => {
    const inferred: SchemaColumn[] = [
      {
        name: "[b1]GA",
        inferredType: "continuous",
        confirmedType: "continuous",
        cardinalityTier: "ok",
        units: "wk",
      },
    ];
    const detected: DetectedDictionarySheet = {
      sheetName: "dict",
      rawColumn: "raw",
      labelColumn: "lbl",
      unitsColumn: "u",
      matchScore: 1.0,
      preview: [],
      mapping: { "[b1]GA": { label: "GA", units: "weeks" } },
    };
    const { columns } = applyDetectedDictionary(inferred, detected);
    expect(columns[0].displayLabel).toBe("GA");
    expect(columns[0].units).toBe("wk");
  });

  it("docx formatTable uses displayLabel for variable row labels (Step 7b.5.5)", () => {
    const stats: StatisticalResults = {
      perVariable: [
        {
          variable: "[b1]GA",
          summaryByGroup: {
            "Yes": { mean: 29.6, sd: 4.1, n: 29 },
            "No": { mean: 31.0, sd: 3.8, n: 108 },
          },
          overallSummary: { mean: 30.6, sd: 3.9, n: 137 },
          test: { name: "Welch's t-test", statistic: -3.2, pValue: 0.22 },
          notes: [],
        },
      ],
      groups: [
        { name: "Yes", n: 29 },
        { name: "No", n: 108 },
      ],
      totalN: 137,
      computeMetadata: { libVersions: { scipy: "1.17.0" }, seed: 42 },
    };
    const plan: AnalysisPlan = {
      rulesetVersion: "1.2",
      appVersion: "1.0",
      researchPopulation: "adult",
      unitSystem: "metric",
      groupingVariable: "[c10]Edema",
      includedVariables: ["[b1]GA"],
      variableConfig: {},
      showSMD: false,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      auditLog: [],
    };
    const schema: Schema = {
      columns: [
        {
          name: "[b1]GA",
          inferredType: "continuous",
          confirmedType: "continuous",
          cardinalityTier: "ok",
          displayLabel: "Gestational age",
        },
        {
          name: "[c10]Edema",
          inferredType: "binary",
          confirmedType: "binary",
          cardinalityTier: "ok",
          displayLabel: "Edema",
        },
      ],
    };
    const formatted = formatTable(stats, "NEJM", plan, schema, "1.0");
    // Variable row uses display label, not raw "[b1]GA"
    const firstVarCell = formatted.rows[0].cells[0];
    expect(firstVarCell).toMatch(/^Gestational age/);
    expect(firstVarCell).not.toMatch(/\[b1\]/);
    // Title also strips brackets from grouping label
    expect(formatted.title).toContain("Edema");
    expect(formatted.title).not.toContain("[c10]");
  });

  it("docx formatTable falls back to bracket-stripped raw name when no displayLabel", () => {
    const stats: StatisticalResults = {
      perVariable: [
        {
          variable: "[b1]GA",
          summaryByGroup: {
            "Yes": { mean: 29.6, sd: 4.1, n: 29 },
            "No": { mean: 31.0, sd: 3.8, n: 108 },
          },
          overallSummary: { mean: 30.6, sd: 3.9, n: 137 },
          test: { name: "Welch's t-test", statistic: -3.2, pValue: 0.22 },
          notes: [],
        },
      ],
      groups: [
        { name: "Yes", n: 29 },
        { name: "No", n: 108 },
      ],
      totalN: 137,
      computeMetadata: { libVersions: { scipy: "1.17.0" }, seed: 42 },
    };
    const plan: AnalysisPlan = {
      rulesetVersion: "1.2",
      appVersion: "1.0",
      researchPopulation: "adult",
      unitSystem: "metric",
      groupingVariable: "[c10]Edema",
      includedVariables: ["[b1]GA"],
      variableConfig: {},
      showSMD: false,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      auditLog: [],
    };
    const schema: Schema = {
      columns: [
        {
          name: "[b1]GA",
          inferredType: "continuous",
          confirmedType: "continuous",
          cardinalityTier: "ok",
        },
        {
          name: "[c10]Edema",
          inferredType: "binary",
          confirmedType: "binary",
          cardinalityTier: "ok",
        },
      ],
    };
    const formatted = formatTable(stats, "NEJM", plan, schema, "1.0");
    // No displayLabel → bracket-stripped raw name
    expect(formatted.rows[0].cells[0]).toMatch(/^GA/);
    expect(formatted.rows[0].cells[0]).not.toMatch(/\[b1\]/);
    expect(formatted.title).toContain("Edema");
  });

  it("analysis_history.py comments use displayLabel (Step 7b.5.5)", () => {
    const stats: StatisticalResults = {
      perVariable: [
        {
          variable: "[b1]GA",
          summaryByGroup: {
            "Yes": { mean: 29.6, sd: 4.1, n: 29 },
            "No": { mean: 31.0, sd: 3.8, n: 108 },
          },
          overallSummary: { mean: 30.6, sd: 3.9, n: 137 },
          test: { name: "Welch's t-test", statistic: -3.2, pValue: 0.22 },
          notes: [],
        },
      ],
      groups: [
        { name: "Yes", n: 29 },
        { name: "No", n: 108 },
      ],
      totalN: 137,
      computeMetadata: { libVersions: { scipy: "1.17.0" }, seed: 42 },
    };
    const plan: AnalysisPlan = {
      rulesetVersion: "1.2",
      appVersion: "1.0",
      researchPopulation: "adult",
      unitSystem: "metric",
      groupingVariable: "Edema",
      includedVariables: ["[b1]GA"],
      variableConfig: {},
      showSMD: false,
      showPValue: true,
      multipleTestingCorrection: "none",
      randomSeed: 42,
      auditLog: [],
    };
    const schema: Schema = {
      columns: [
        {
          name: "[b1]GA",
          inferredType: "continuous",
          confirmedType: "continuous",
          cardinalityTier: "ok",
          displayLabel: "Gestational age",
        },
      ],
    };
    const py = generateAnalysisHistory(plan, stats, schema, { filename: "fungi.xlsx" });
    expect(py).toContain("# === Gestational age ===");
    expect(py).not.toContain("# === [b1]GA ===");
  });

  it("reproducibility.json schema.columns[] includes displayLabel (Step 7b.5.5)", () => {
    const schema: Schema = {
      columns: [
        {
          name: "[b1]GA",
          inferredType: "continuous",
          confirmedType: "continuous",
          cardinalityTier: "ok",
          displayLabel: "Gestational age",
        },
      ],
    };
    const json = generateReproducibilityJson({
      plan: {
        rulesetVersion: "1.2",
        appVersion: "1.0",
        researchPopulation: "adult",
        unitSystem: "metric",
        groupingVariable: "g",
        includedVariables: [],
        variableConfig: {},
        showSMD: false,
        showPValue: true,
        multipleTestingCorrection: "none",
        randomSeed: 42,
        auditLog: [],
      },
      schema,
      results: {
        perVariable: [],
        groups: [],
        totalN: 0,
        computeMetadata: { libVersions: {}, seed: 42 },
      },
      formattedTable: {
        journal: "NEJM",
        rulesetVersion: "1.2",
        title: "t",
        header: [],
        rows: [],
        footnotes: [],
        methodsParagraph: "",
      },
      appVersion: "1.0",
    });
    const parsed = JSON.parse(json);
    expect(parsed.schema.columns[0].displayLabel).toBe("Gestational age");
  });

  it("dictionary fingerprint is stable across re-imports of identical content", async () => {
    const fingerprintInput1 = JSON.stringify({
      rows: Object.entries(dictRows).sort((a, b) => a[0].localeCompare(b[0]))
    });
    const dictionaryFingerprint1 = await sha256Hex(fingerprintInput1);

    const fingerprintInput2 = JSON.stringify({
      rows: Object.entries(dictRows).sort((a, b) => a[0].localeCompare(b[0]))
    });
    const dictionaryFingerprint2 = await sha256Hex(fingerprintInput2);

    expect(dictionaryFingerprint1).toBe(dictionaryFingerprint2);
  });

  // ── 7c.1 ─ displayLabel round-trip regression ────────────────────────────
  it("displayLabel written via updateSchemaColumn survives repro JSON round-trip (7c.1 regression)", () => {
    // This test would have caught the artifact bug where displayLabel was null
    // in reproducibility.json even after the user typed labels in SchemaStage.
    useStore.setState({
      schema: {
        columns: [
          {
            name: "[b1]GA",
            inferredType: "continuous",
            confirmedType: "continuous",
            cardinalityTier: "ok",
          },
        ],
      },
    } as any);

    // Simulate SchemaStage onChange → updateSchemaColumn
    useStore.getState().updateSchemaColumn("[b1]GA", { displayLabel: "Gestational age (weeks)" });

    const { schema } = useStore.getState();
    const json = generateReproducibilityJson({
      plan: {
        rulesetVersion: "1.2",
        appVersion: "1.0",
        researchPopulation: "adult",
        unitSystem: "metric",
        groupingVariable: "g",
        includedVariables: [],
        variableConfig: {},
        showSMD: false,
        showPValue: true,
        multipleTestingCorrection: "none",
        randomSeed: 42,
        auditLog: [],
      },
      schema: schema!,
      results: { perVariable: [], groups: [], totalN: 0, computeMetadata: { libVersions: {}, seed: 42 } },
      formattedTable: {
        journal: "NEJM", rulesetVersion: "1.2", title: "t",
        header: [], rows: [], footnotes: [], methodsParagraph: "",
      },
      appVersion: "1.0",
    });
    const parsed = JSON.parse(json);
    expect(parsed.schema.columns[0].displayLabel).toBe("Gestational age (weeks)");
  });

  // ── 7c.2 ─ auditLog store → repro JSON ──────────────────────────────────
  describe("auditLog (7c.2)", () => {
    beforeEach(() => {
      useStore.setState({ auditLog: [] } as any);
    });

    it("addAuditEntry appends to store auditLog with an ISO timestamp", () => {
      useStore.getState().addAuditEntry("test action", { col: "x" });
      const { auditLog } = useStore.getState();
      expect(auditLog).toHaveLength(1);
      expect(auditLog[0].action).toBe("test action");
      expect(auditLog[0].details).toEqual({ col: "x" });
      expect(auditLog[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("multiple addAuditEntry calls accumulate without overwrite", () => {
      useStore.getState().addAuditEntry("action 1", {});
      useStore.getState().addAuditEntry("action 2", {});
      useStore.getState().addAuditEntry("action 3", {});
      expect(useStore.getState().auditLog).toHaveLength(3);
      expect(useStore.getState().auditLog.map((e) => e.action)).toEqual([
        "action 1", "action 2", "action 3",
      ]);
    });

    it("auditLog from store is included in repro JSON when plan.auditLog is empty (7c.2 regression)", () => {
      // addAuditEntry writes to state.auditLog (top-level).
      // FormatExportStage merges it into plan via { ...plan, auditLog }.
      // This test verifies that merge produces the correct JSON.
      useStore.getState().addAuditEntry("User changed display label for '[b1]GA'", { column: "[b1]GA" });

      const { auditLog } = useStore.getState();
      const planBase: AnalysisPlan = {
        rulesetVersion: "1.2",
        appVersion: "1.0",
        researchPopulation: "adult",
        unitSystem: "metric",
        groupingVariable: "g",
        includedVariables: [],
        variableConfig: {},
        showSMD: false,
        showPValue: true,
        multipleTestingCorrection: "none",
        randomSeed: 42,
        auditLog: [],  // plan's own auditLog is empty (as built by PlanStage)
      };
      const json = generateReproducibilityJson({
        plan: { ...planBase, auditLog },  // ← the FormatExportStage merge
        schema: { columns: [] },
        results: { perVariable: [], groups: [], totalN: 0, computeMetadata: { libVersions: {}, seed: 42 } },
        formattedTable: {
          journal: "NEJM", rulesetVersion: "1.2", title: "t",
          header: [], rows: [], footnotes: [], methodsParagraph: "",
        },
        appVersion: "1.0",
      });
      const parsed = JSON.parse(json);
      expect(parsed.analysisPlan.auditLog).toHaveLength(1);
      expect(parsed.analysisPlan.auditLog[0].action).toContain("[b1]GA");
    });
  });

  // ── 7c.3 ─ rulesetVersion reads dynamically ─────────────────────────────
  it("AnalysisPlan.rulesetVersion from journalRulesets matches loaded version at serialization time (7c.3)", () => {
    const liveVersion = journalRulesets.EasyTableOne_Ruleset.version;
    expect(liveVersion).toBeTruthy();

    const json = generateReproducibilityJson({
      plan: {
        rulesetVersion: liveVersion,
        appVersion: "1.0",
        researchPopulation: "adult",
        unitSystem: "metric",
        groupingVariable: "g",
        includedVariables: [],
        variableConfig: {},
        showSMD: false,
        showPValue: true,
        multipleTestingCorrection: "none",
        randomSeed: 42,
        auditLog: [],
      },
      schema: { columns: [] },
      results: { perVariable: [], groups: [], totalN: 0, computeMetadata: { libVersions: {}, seed: 42 } },
      formattedTable: {
        journal: "NEJM",
        rulesetVersion: liveVersion,
        title: "t",
        header: [], rows: [], footnotes: [], methodsParagraph: "",
      },
      appVersion: "1.0",
    });
    const parsed = JSON.parse(json);
    // The top-level rulesetVersion comes from formattedTable.rulesetVersion.
    expect(parsed.rulesetVersion).toBe(liveVersion);
    // The plan's rulesetVersion must not be the old hardcoded value.
    expect(parsed.analysisPlan.rulesetVersion).toBe(liveVersion);
    expect(parsed.analysisPlan.rulesetVersion).not.toBe("1.1");
  });

  // ── 7d.1 ─ applyDetectedDictionary preserves pre-existing displayLabel ────
  it("applyDetectedDictionary does not overwrite pre-existing displayLabel (7d.1)", () => {
    const inferred: SchemaColumn[] = [
      {
        name: "[b1]GA",
        inferredType: "continuous",
        confirmedType: "continuous",
        cardinalityTier: "ok",
        displayLabel: "My custom label",  // manually set by user
      },
    ];
    const detected: DetectedDictionarySheet = {
      sheetName: "dict",
      rawColumn: "raw",
      labelColumn: "lbl",
      matchScore: 1.0,
      preview: [],
      mapping: { "[b1]GA": { label: "Gestational age", units: "weeks" } },
    };
    const { columns } = applyDetectedDictionary(inferred, detected);
    // Pre-existing displayLabel must be preserved
    expect(columns[0].displayLabel).toBe("My custom label");
    // units is unset so it can be populated
    expect(columns[0].units).toBe("weeks");
  });

  // ── 7d.4 ─ trim and drop whitespace-only values ───────────────────────────
  it("applyDetectedDictionary trims whitespace from displayLabel (7d.4)", () => {
    const inferred: SchemaColumn[] = [
      { name: "[b1]GA", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
    ];
    const detected: DetectedDictionarySheet = {
      sheetName: "dict", rawColumn: "raw", labelColumn: "lbl", matchScore: 1.0, preview: [],
      mapping: { "[b1]GA": { label: "  Gestational age  " } },
    };
    const { columns } = applyDetectedDictionary(inferred, detected);
    expect(columns[0].displayLabel).toBe("Gestational age");
  });

  it("applyDetectedDictionary drops whitespace-only displayLabel (7d.4)", () => {
    const inferred: SchemaColumn[] = [
      { name: "[b1]GA", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
    ];
    const detected: DetectedDictionarySheet = {
      sheetName: "dict", rawColumn: "raw", labelColumn: "lbl", matchScore: 1.0, preview: [],
      mapping: { "[b1]GA": { label: "   " } },
    };
    const { columns } = applyDetectedDictionary(inferred, detected);
    expect(columns[0].displayLabel).toBeUndefined();
  });

  it("applyDetectedDictionary trims and drops whitespace-only units (7d.4)", () => {
    const inferred: SchemaColumn[] = [
      { name: "[b1]GA", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
    ];
    const detectedWhitespace: DetectedDictionarySheet = {
      sheetName: "dict", rawColumn: "raw", labelColumn: "lbl", unitsColumn: "u", matchScore: 1.0, preview: [],
      mapping: { "[b1]GA": { label: "Gestational age", units: " " } },
    };
    const { columns: colsWs } = applyDetectedDictionary(inferred, detectedWhitespace);
    expect(colsWs[0].units).toBeUndefined();

    const detectedTrimmed: DetectedDictionarySheet = {
      sheetName: "dict", rawColumn: "raw", labelColumn: "lbl", unitsColumn: "u", matchScore: 1.0, preview: [],
      mapping: { "[b1]GA": { label: "Gestational age", units: "  weeks  " } },
    };
    const { columns: colsTrim } = applyDetectedDictionary(inferred, detectedTrimmed);
    expect(colsTrim[0].units).toBe("weeks");
  });

  // ── 7c.5 ─ encoding strings must not pollute the units field ─────────────
  describe("applyDetectedDictionary units guard (7c.5)", () => {
    it("encoding string in the units column entry is not applied to SchemaColumn.units", () => {
      const inferred: SchemaColumn[] = [
        {
          name: "[c6]AbdominalDistension",
          inferredType: "binary",
          confirmedType: "binary",
          cardinalityTier: "ok",
        },
      ];
      const detected: DetectedDictionarySheet = {
        sheetName: "coding",
        rawColumn: "Var",
        labelColumn: "Label",
        unitsColumn: "Definition_categorical_variables_or_Units",
        matchScore: 1.0,
        preview: [],
        mapping: {
          "[c6]AbdominalDistension": {
            label: "Abdominal distension",
            units: "1: Yes, 2: No",  // encoding string masquerading as units
          },
        },
      };
      const { columns } = applyDetectedDictionary(inferred, detected);
      expect(columns[0].displayLabel).toBe("Abdominal distension");
      // Encoding string must NOT end up in the units field.
      expect(columns[0].units).toBeUndefined();
    });

    it("no units column in dictionary leaves SchemaColumn.units unset (7c.5)", () => {
      const inferred: SchemaColumn[] = [
        {
          name: "[b1]GA",
          inferredType: "continuous",
          confirmedType: "continuous",
          cardinalityTier: "ok",
        },
      ];
      const detected: DetectedDictionarySheet = {
        sheetName: "coding",
        rawColumn: "Var",
        labelColumn: "Label",
        // no unitsColumn
        matchScore: 1.0,
        preview: [],
        mapping: {
          "[b1]GA": { label: "Gestational age" },  // no units key at all
        },
      };
      const { columns } = applyDetectedDictionary(inferred, detected);
      expect(columns[0].displayLabel).toBe("Gestational age");
      expect(columns[0].units).toBeUndefined();
    });

    it("real unit string in units column entry is applied correctly (7c.5 control)", () => {
      const inferred: SchemaColumn[] = [
        {
          name: "[b1]GA",
          inferredType: "continuous",
          confirmedType: "continuous",
          cardinalityTier: "ok",
        },
      ];
      const detected: DetectedDictionarySheet = {
        sheetName: "coding",
        rawColumn: "Var",
        labelColumn: "Label",
        unitsColumn: "Units",
        matchScore: 1.0,
        preview: [],
        mapping: {
          "[b1]GA": { label: "Gestational age", units: "weeks" },
        },
      };
      const { columns } = applyDetectedDictionary(inferred, detected);
      expect(columns[0].units).toBe("weeks");
    });
  });

  // ── 7g.4 ─ classifyColumnsFromDict: encoding-string label rejection ────────
  describe("classifyColumnsFromDict — encoding-string label rejection (7g.4)", () => {
    it("does not write displayLabel when the label cell is an encoding string (Malnutrition fix)", () => {
      const schema: SchemaColumn[] = [
        { name: "[c11]Malnutrition", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
      ];
      const dict = { "[c11]Malnutrition": { label: "1: Yes, 2: No" } };
      const result = classifyColumnsFromDict(schema, dict);
      // Row-misalignment: the label cell has encoding text, not a human label.
      expect(result[0].displayLabel).toBeUndefined();
    });

    it("does not write label when the label cell is an encoding string", () => {
      const schema: SchemaColumn[] = [
        { name: "[c11]Malnutrition", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
      ];
      const dict = { "[c11]Malnutrition": { label: "1: Mild, 2: Moderate, 3: Severe" } };
      const result = classifyColumnsFromDict(schema, dict);
      expect(result[0].label).toBeUndefined();
    });

    it("preserves a clean label even when a different column has encoding-shaped text", () => {
      const schema: SchemaColumn[] = [
        { name: "[c10]Edema", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
      ];
      const dict = { "[c10]Edema": { label: "Edema" } };
      const result = classifyColumnsFromDict(schema, dict);
      expect(result[0].displayLabel).toBe("Edema");
    });
  });

  // ── 7e.1 ─ classifyColumnsFromDict: displayLabel + units writes ───────────
  describe("classifyColumnsFromDict — displayLabel and units (7e.1)", () => {
    it("writes displayLabel and units from the mapping", () => {
      const schema: SchemaColumn[] = [
        { name: "[b1]GA", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ];
      const dict = { "[b1]GA": { label: "Gestational age", units: "weeks" } };
      const result = classifyColumnsFromDict(schema, dict);
      expect(result[0].displayLabel).toBe("Gestational age");
      expect(result[0].units).toBe("weeks");
    });

    it("trims displayLabel and units; drops whitespace-only values (7e.1 + 7d.4)", () => {
      const schema: SchemaColumn[] = [
        { name: "[b1]GA", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "[e3]PLT", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ];
      const dict = {
        "[b1]GA": { label: "  Gestational age  ", units: "  weeks  " },
        "[e3]PLT": { label: "Platelet count", units: " " },
      };
      const result = classifyColumnsFromDict(schema, dict);
      expect(result[0].displayLabel).toBe("Gestational age");
      expect(result[0].units).toBe("weeks");
      // Whitespace-only units must be dropped (the [e3] bug from 7d acceptance)
      expect(result[1].units).toBeUndefined();
    });

    it("preserves a pre-existing displayLabel and does not overwrite it (7d.1)", () => {
      const schema: SchemaColumn[] = [
        {
          name: "[b1]GA",
          inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok",
          displayLabel: "My custom label",
        },
      ];
      const dict = { "[b1]GA": { label: "Gestational age", units: "weeks" } };
      const result = classifyColumnsFromDict(schema, dict);
      expect(result[0].displayLabel).toBe("My custom label");
    });

    it("preserves a pre-existing units value and does not overwrite it", () => {
      const schema: SchemaColumn[] = [
        {
          name: "[b1]GA",
          inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok",
          units: "wk",
        },
      ];
      const dict = { "[b1]GA": { label: "GA", units: "weeks" } };
      const result = classifyColumnsFromDict(schema, dict);
      expect(result[0].units).toBe("wk");
    });

    it("does not let dictionary levels convert clearly continuous variables to categorical", () => {
      const schema: SchemaColumn[] = [
        {
          name: "SpO2",
          inferredType: "continuous",
          confirmedType: "continuous",
          cardinalityTier: "ok",
        },
      ];
      const dict = {
        SpO2: {
          label: "Peripheral oxygen saturation",
          units: "%",
          levels: [
            { code: 90, label: "Low" },
            { code: 95, label: "Normal" },
          ],
        },
      };

      const result = classifyColumnsFromDict(schema, dict);

      expect(result[0].displayLabel).toBe("Peripheral oxygen saturation");
      expect(result[0].units).toBe("%");
      expect(result[0].confirmedType).toBe("continuous");
      expect(result[0].levels).toBeUndefined();
    });

    it("returns the schema unchanged when no mapping entries match any column", () => {
      const schema: SchemaColumn[] = [
        { name: "[b1]GA", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
      ];
      const dict = { "Completely_Different": { label: "Nothing" } };
      const result = classifyColumnsFromDict(schema, dict);
      expect(result[0]).toBe(schema[0]);
    });

    it("writes displayLabel using bracket normalization (manual path integration — 7e.1)", () => {
      // Simulates the fungi scenario: dict has stripped names, data columns have brackets.
      const schema: SchemaColumn[] = [
        { name: "[b1]GA", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "[b2]BW", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "[c10]Edema", inferredType: "binary", confirmedType: "binary", cardinalityTier: "ok" },
      ];
      const dict = {
        "GA": { label: "Gestational age", units: "weeks" },
        "BW": { label: "Birth weight", units: "g" },
        "Edema": { label: "Edema" },
      };
      const result = classifyColumnsFromDict(schema, dict);
      // All three should match via bracket normalization
      expect(result[0].displayLabel).toBe("Gestational age");
      expect(result[0].units).toBe("weeks");
      expect(result[1].displayLabel).toBe("Birth weight");
      expect(result[1].units).toBe("g");
      expect(result[2].displayLabel).toBe("Edema");
    });
  });
});
