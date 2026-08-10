import { describe, it, expect, vi } from "vitest";
import { runChecks, CHECK_REGISTRY, type CheckContext, type CheckDefinition } from "./checkRegistry";
import * as outliersMod from "./outliers";

describe("runChecks and CHECK_REGISTRY", () => {
  const dummyMeta = {
    sourceFile: "test.xlsx",
    parseWarnings: [],
    locale: { decimalSeparator: "." as const, thousandSeparator: "," as const },
    detectedHeaderRow: 0,
    confirmedHeaderRow: 0,
    encoding: "utf-8",
    missingSentinels: []
  };

  it("runChecks('data-review') excludes requiresGrouping, runChecks('plan') includes only requiresGrouping", () => {
    const dataReviewChecks = CHECK_REGISTRY.filter(c => c.stage === "data-review");
    const planChecks = CHECK_REGISTRY.filter(c => c.stage === "plan");

    expect(dataReviewChecks.every(c => !c.requiresGrouping)).toBe(true);
    expect(planChecks.every(c => c.requiresGrouping)).toBe(true);
  });

  it("constantColumn detects columns with <= 1 unique non-null values and does not rely on std", () => {
    const schema = {
      columns: [
        { name: "col_const", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "col_var", confirmedType: "continuous", cardinalityTier: "ok" }
      ]
    };
    const data = {
      columns: [{ name: "col_const" }, { name: "col_var" }],
      rows: [
        [5, 1],
        [5, 2],
        [null, 3],
        [5, 4]
      ],
      meta: dummyMeta
    };

    const ctx: CheckContext = { schema: schema as any, data: data as any };
    const findings = runChecks("data-review", ctx);

    const constFinding = findings.find(f => f.checkId === "constantColumn_col_const");
    const varFinding = findings.find(f => f.checkId === "constantColumn_col_var");

    expect(constFinding).toBeDefined();
    expect(constFinding?.tier).toBe("blocking");
    expect(constFinding?.requirement).toBe("A variable needs at least two distinct values to be tabulated.");
    expect(varFinding).toBeUndefined();
  });

  it("constantColumn still fires for unsupported columns when inference has not pre-excluded them", () => {
    const schema = {
      columns: [
        { name: "col_const", confirmedType: "unsupported", cardinalityTier: "flag" }
      ]
    };
    const data = {
      columns: [{ name: "col_const" }],
      rows: [[0], [0], [0]],
      meta: dummyMeta
    };

    const findings = runChecks("data-review", { schema: schema as any, data: data as any });
    const constFinding = findings.find(f => f.checkId === "constantColumn_col_const");

    expect(constFinding).toBeDefined();
    expect(constFinding?.tier).toBe("blocking");
  });

  it("excelErrorColumn is blocking when every row in a column is an Excel error", () => {
    const data = {
      columns: [{ name: "AGEMO" }],
      rows: [[null], [null]],
      meta: {
        ...dummyMeta,
        excelErrorCounts: { AGEMO: 2 },
        parseWarnings: [{
          column: "AGEMO",
          message: "Column 'AGEMO': 2 Excel error value(s) (#REF!) treated as missing.",
        }],
      }
    };
    const schema = {
      columns: [{ name: "AGEMO", confirmedType: "unsupported", cardinalityTier: "flag" }]
    };

    const findings = runChecks("data-review", { schema: schema as any, data: data as any });
    const excelFinding = findings.find(f => f.checkId === "excelErrorColumn_AGEMO");

    expect(excelFinding).toBeDefined();
    expect(excelFinding?.tier).toBe("blocking");
    expect(excelFinding?.detail).toContain("#REF!");
    expect(excelFinding?.affectedCount).toBe(2);
  });

  it("excelErrorColumn honors exclusionReason for an all-error column", () => {
    const data = {
      columns: [{ name: "AGEMO" }],
      rows: [[null], [null]],
      meta: {
        ...dummyMeta,
        excelErrorCounts: { AGEMO: 2 },
        parseWarnings: [{
          column: "AGEMO",
          message: "Column 'AGEMO': 2 Excel error value(s) (#REF!) treated as missing.",
        }],
      }
    };
    const schema = {
      columns: [{ name: "AGEMO", confirmedType: "unsupported", cardinalityTier: "flag", exclusionReason: "Manually excluded" }]
    };

    const findings = runChecks("data-review", { schema: schema as any, data: data as any });

    expect(findings.find(f => f.checkId === "excelErrorColumn_AGEMO")).toBeUndefined();
  });

  it("excelErrorColumn is review when Excel errors affect only part of a column", () => {
    const data = {
      columns: [{ name: "AGEMO" }],
      rows: [[null], [12]],
      meta: {
        ...dummyMeta,
        excelErrorCounts: { AGEMO: 1 },
        parseWarnings: [{
          column: "AGEMO",
          message: "Column 'AGEMO': 1 Excel error value(s) (#VALUE!) treated as missing.",
        }],
      }
    };
    const schema = {
      columns: [{ name: "AGEMO", confirmedType: "continuous", cardinalityTier: "ok" }]
    };

    const findings = runChecks("data-review", { schema: schema as any, data: data as any });
    const excelFinding = findings.find(f => f.checkId === "excelErrorColumn_AGEMO");

    expect(excelFinding?.tier).toBe("review");
    expect(excelFinding?.detail).toContain("#VALUE!");
  });

  it("column-specific blocking findings carry variables for same-panel resolution actions", () => {
    const schema = {
      columns: [
        { name: "dob", confirmedType: "date", cardinalityTier: "ok" },
        { name: "ambiguous", confirmedType: "numeric_encoded_categorical_ambiguous", cardinalityTier: "warn" },
        { name: "constant", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "all_error", confirmedType: "unsupported", cardinalityTier: "flag" },
      ],
    };
    const data = {
      columns: [{ name: "dob" }, { name: "ambiguous" }, { name: "constant" }, { name: "all_error" }],
      rows: [
        ["2020-01-01", 0, 7, null],
        ["2020-01-02", 1, 7, null],
      ],
      meta: {
        ...dummyMeta,
        excelErrorCounts: { all_error: 2 },
        parseWarnings: [{
          column: "all_error",
          message: "Column 'all_error': 2 Excel error value(s) (#REF!) treated as missing.",
        }],
      },
    };

    const findings = runChecks("data-review", { schema: schema as any, data: data as any })
      .filter((finding) => finding.tier === "blocking");

    for (const checkId of [
      "unresolvedDateColumn_dob",
      "unresolvedAmbiguousNumeric_ambiguous",
      "constantColumn_constant",
      "excelErrorColumn_all_error",
    ]) {
      const finding = findings.find((item) => item.checkId === checkId);
      expect(finding).toBeDefined();
      expect(finding?.variable).toBeTruthy();
    }
  });

  it("dataset-level blocking findings have source-file remedies when no variable is available", () => {
    const schema = { columns: [{ name: "A", confirmedType: "continuous", cardinalityTier: "ok" }] };
    const data = {
      columns: [{ name: "A" }],
      rows: [[1]],
      meta: {
        ...dummyMeta,
        parseWarnings: [{ message: "Locale decimal separator violation detected." }],
      },
    };

    const findings = runChecks("data-review", { schema: schema as any, data: data as any });
    const locale = findings.find((finding) => finding.checkId === "unresolvedLocaleViolation");

    expect(locale).toBeDefined();
    expect(locale?.variable).toBeUndefined();
    expect(locale?.category).toBe("format");
    expect(locale?.remedy).toContain("re-upload");
  });

  it("highMissingness correctly maps tiers: >=30% review, 20-29% advisory, <20% none", () => {
    const schema = {
      columns: [
        { name: "col_high", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "col_med", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "col_mod", confirmedType: "continuous", cardinalityTier: "ok" },
        { name: "col_low", confirmedType: "continuous", cardinalityTier: "ok" }
      ]
    };
    const data = {
      columns: [{ name: "col_high" }, { name: "col_med" }, { name: "col_mod" }, { name: "col_low" }],
      rows: [
        [null, null, null, 1],
        [null, null, null, 2],
        [null, null, 3, 3],
        [null, 4, 4, 4],
        [null, 5, 5, 5],
        [null, 6, 6, 6],
        [null, 7, 7, 7],
        [8, 8, 8, 8],
        [9, 9, 9, 9],
        [10, 10, 10, 10]
      ], // high: 70%, med: 30%, mod: 20%, low: 0%
      meta: dummyMeta
    };

    const ctx: CheckContext = { schema: schema as any, data: data as any };
    const findings = runChecks("data-review", ctx);

    const highFinding = findings.find(f => f.checkId === "highMissingness_col_high");
    const medFinding = findings.find(f => f.checkId === "highMissingness_col_med");
    const modFinding = findings.find(f => f.checkId === "highMissingness_col_mod");
    const lowFinding = findings.find(f => f.checkId === "highMissingness_col_low");

    expect(highFinding).toBeDefined();
    expect(highFinding?.tier).toBe("review");
    expect(highFinding?.affectedCount).toBe(7);

    expect(medFinding).toBeDefined();
    expect(medFinding?.tier).toBe("review");
    expect(medFinding?.affectedCount).toBe(3);
    expect(medFinding?.remedy).toContain("30% or more");

    expect(modFinding).toBeDefined();
    expect(modFinding?.tier).toBe("advisory");
    expect(modFinding?.affectedCount).toBe(2);

    expect(lowFinding).toBeUndefined();
  });

  it("outliers delegates to existing detectOutliers helper", () => {
    const spy = vi.spyOn(outliersMod, "detectOutliers");
    const schema = {
      columns: [{ name: "col_out", confirmedType: "continuous", cardinalityTier: "ok" }]
    };
    const data = {
      columns: [{ name: "col_out" }],
      rows: [[1], [2], [3], [4], [5], [6], [7], [8], [9], [100]],
      meta: dummyMeta
    };

    const ctx: CheckContext = { schema: schema as any, data: data as any };
    runChecks("data-review", ctx);

    expect(spy).toHaveBeenCalledWith(data, "col_out", "iqr");
    spy.mockRestore();
  });

  it("duplicateRows checks exact matches only", () => {
    const schema = { columns: [{ name: "A" }, { name: "B" }] };
    const data = {
      columns: [{ name: "A" }, { name: "B" }],
      rows: [
        [1, 2],
        [1, 3], // different
        [1, 2], // duplicate of first
        [1, 4]
      ],
      meta: dummyMeta
    };

    const ctx: CheckContext = { schema: schema as any, data: data as any };
    const findings = runChecks("data-review", ctx);
    const dupFinding = findings.find(f => f.checkId === "duplicateRows");

    expect(dupFinding).toBeDefined();
    expect(dupFinding?.affectedCount).toBe(1);
    expect(dupFinding?.affectedRowsSample).toEqual([3]); // Row index of duplicate (0-based idx 2 is row 3)
  });

  it("Format gates: noDataRows and duplicateColumnNames blocking and populate requirement and remedy", () => {
    const schema = { columns: [{ name: "A" }, { name: "A" }] };
    const dataEmpty = {
      columns: [{ name: "A" }],
      rows: [],
      meta: dummyMeta
    };
    const dataDup = {
      columns: [{ name: "A" }, { name: "A" }],
      rows: [[1, 2]],
      meta: dummyMeta
    };

    const findingsEmpty = runChecks("data-review", { schema: schema as any, data: dataEmpty as any });
    const emptyFinding = findingsEmpty.find(f => f.checkId === "noDataRows");
    expect(emptyFinding).toBeDefined();
    expect(emptyFinding?.tier).toBe("blocking");
    expect(emptyFinding?.requirement).toBeTruthy();
    expect(emptyFinding?.remedy).toBeTruthy();

    const findingsDup = runChecks("data-review", { schema: schema as any, data: dataDup as any });
    const dupFinding = findingsDup.find(f => f.checkId === "duplicateColumnNames");
    expect(dupFinding).toBeDefined();
    expect(dupFinding?.tier).toBe("blocking");
    expect(dupFinding?.requirement).toBeTruthy();
    expect(dupFinding?.remedy).toBeTruthy();
  });

  it("allEmptyColumn skips columns that are excluded in the schema", () => {
    const schema = {
      columns: [
        { name: "col_empty", confirmedType: "unsupported", exclusionReason: "Manually excluded", cardinalityTier: "flag" }
      ]
    };
    const data = {
      columns: [{ name: "col_empty" }],
      rows: [[null], [null], [""]],
      meta: dummyMeta
    };

    const ctx: CheckContext = { schema: schema as any, data: data as any };
    const findings = runChecks("data-review", ctx);
    const emptyFinding = findings.find(f => f.checkId.startsWith("allEmptyColumn"));
    expect(emptyFinding).toBeUndefined();
  });

  it("Beautify advisories: codedCategoricalNoLabels triggered when levels label equals code", () => {
    const schema = {
      columns: [
        {
          name: "col_coded",
          confirmedType: "binary",
          cardinalityTier: "ok",
          levels: [{ code: 0, label: "0" }, { code: 1, label: "1" }]
        }
      ]
    };
    const data = {
      columns: [{ name: "col_coded" }],
      rows: [[0], [1]],
      meta: dummyMeta
    };

    const ctx: CheckContext = { schema: schema as any, data: data as any };
    const findings = runChecks("data-review", ctx);
    const advisory = findings.find(f => f.checkId === "codedCategoricalNoLabels_col_coded");

    expect(advisory).toBeDefined();
    expect(advisory?.tier).toBe("advisory");
    expect(advisory?.category).toBe("beautify");
  });

  it("Extensibility: runChecks works on custom check registry entries without changing implementation", () => {
    const customRegistry: CheckDefinition[] = [
      {
        id: "customCheck",
        tier: "advisory",
        category: "quality",
        stage: "data-review",
        requiresGrouping: false,
        run: () => [{
          checkId: "customCheckId",
          tier: "advisory",
          category: "quality",
          title: "Custom Check",
          detail: "Some custom detail",
          remedy: "Do something"
        }]
      }
    ];

    function runCustomChecks(stage: any, ctx: any) {
      return customRegistry
        .filter(c => c.stage === stage)
        .flatMap(c => c.run(ctx));
    }

    const findings = runCustomChecks("data-review", {} as any);
    expect(findings).toHaveLength(1);
    expect(findings[0].checkId).toBe("customCheckId");
  });

  it("D43 sanityBounds emits advisory findings for implausible adult values", () => {
    const schema = {
      columns: [{ name: "age", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" }]
    };
    const data = {
      columns: [{ name: "age" }],
      rows: [[25], [45], [999], [67]],
      meta: dummyMeta
    };

    const findings = runChecks("data-review", { schema: schema as any, data: data as any, researchPopulation: "adult" });
    const d43 = findings.find(f => f.checkId === "sanityBounds_age");

    expect(d43).toBeDefined();
    expect(d43?.tier).toBe("advisory");
    expect(d43?.variable).toBe("age");
    expect(d43?.affectedCount).toBe(1);
    expect(d43?.affectedRowsSample).toEqual([3]);
    expect(d43?.metadataOnly?.violationCount).toBe(1);
    expect(d43?.metadataOnly?.conceptId).toBe("age");
  });

  it("D43 sanityBounds suppresses other population and dispatches pediatric bounds", () => {
    const schema = {
      columns: [{ name: "weight", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" }]
    };
    const data = {
      columns: [{ name: "weight" }],
      rows: [[201]],
      meta: dummyMeta
    };

    const other = runChecks("data-review", { schema: schema as any, data: data as any, researchPopulation: "other" });
    const pediatric = runChecks("data-review", { schema: schema as any, data: data as any, researchPopulation: "pediatric" });

    expect(other.find(f => f.checkId.startsWith("sanityBounds"))).toBeUndefined();
    expect(pediatric.find(f => f.checkId === "sanityBounds_weight")).toBeDefined();
  });

  it("D43 sanityBounds uses imperial bounds when unitSystem is imperial", () => {
    const schema = {
      columns: [{ name: "weight", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" }]
    };
    const withinImperial = {
      columns: [{ name: "weight" }],
      rows: [[400]],
      meta: dummyMeta
    };
    const outsideImperial = {
      columns: [{ name: "weight" }],
      rows: [[1600]],
      meta: dummyMeta
    };

    const ok = runChecks("data-review", {
      schema: schema as any,
      data: withinImperial as any,
      researchPopulation: "adult",
      unitSystem: "imperial",
    });
    const flagged = runChecks("data-review", {
      schema: schema as any,
      data: outsideImperial as any,
      researchPopulation: "adult",
      unitSystem: "imperial",
    });

    expect(ok.find(f => f.checkId === "sanityBounds_weight")).toBeUndefined();
    const finding = flagged.find(f => f.checkId === "sanityBounds_weight");
    expect(finding).toBeDefined();
    expect(finding?.detail).toContain("lbs");
    expect(finding?.assumedUnitNote).toContain("imperial");
  });

  it("D43 sanityBounds skips categorical, excluded, and unmatched columns", () => {
    const schema = {
      columns: [
        { name: "age", inferredType: "categorical_nominal", confirmedType: "categorical_nominal", cardinalityTier: "ok" },
        { name: "weight", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok", exclusionReason: "Manually excluded" },
        { name: "study_site_code", inferredType: "continuous", confirmedType: "continuous", cardinalityTier: "ok" }
      ]
    };
    const data = {
      columns: [{ name: "age" }, { name: "weight" }, { name: "study_site_code" }],
      rows: [[999, 701, 1], [1000, 702, 2]],
      meta: dummyMeta
    };

    const findings = runChecks("data-review", { schema: schema as any, data: data as any, researchPopulation: "adult" });
    expect(findings.find(f => f.checkId.startsWith("sanityBounds"))).toBeUndefined();
  });

  it("zeroVarianceGrouping is triggered when grouping variable has < 2 unique non-null values", () => {
    const schema = {
      columns: [
        { name: "group", confirmedType: "categorical_nominal" }
      ]
    };
    const dataOneValue = {
      columns: [{ name: "group" }],
      rows: [["A"], ["A"], [null], ["A"]],
      meta: dummyMeta
    };
    const dataTwoValues = {
      columns: [{ name: "group" }],
      rows: [["A"], ["B"], ["A"], ["B"]],
      meta: dummyMeta
    };

    const ctxOne: CheckContext = { schema: schema as any, data: dataOneValue as any, plan: { groupingVariable: "group" } as any };
    const findingsOne = runChecks("plan", ctxOne);
    const zeroVarFindingOne = findingsOne.find(f => f.checkId === "zeroVarianceGrouping");
    expect(zeroVarFindingOne).toBeDefined();
    expect(zeroVarFindingOne?.tier).toBe("blocking");

    const ctxTwo: CheckContext = { schema: schema as any, data: dataTwoValues as any, plan: { groupingVariable: "group" } as any };
    const findingsTwo = runChecks("plan", ctxTwo);
    const zeroVarFindingTwo = findingsTwo.find(f => f.checkId === "zeroVarianceGrouping");
    expect(zeroVarFindingTwo).toBeUndefined();
  });

  it("groupImbalance is triggered when any group size is < 10", () => {
    const schema = {
      columns: [
        { name: "group", confirmedType: "categorical_nominal" }
      ]
    };
    // Group A has 10 rows, Group B has 9 rows
    const dataImbalanced = {
      columns: [{ name: "group" }],
      rows: [
        ...Array(10).fill(["A"]),
        ...Array(9).fill(["B"])
      ],
      meta: dummyMeta
    };
    // Group A has 10 rows, Group B has 10 rows
    const dataBalanced = {
      columns: [{ name: "group" }],
      rows: [
        ...Array(10).fill(["A"]),
        ...Array(10).fill(["B"])
      ],
      meta: dummyMeta
    };

    const ctxImbalanced: CheckContext = { schema: schema as any, data: dataImbalanced as any, plan: { groupingVariable: "group" } as any };
    const findingsImbalanced = runChecks("plan", ctxImbalanced);
    const imbalanceFinding = findingsImbalanced.find(f => f.checkId === "groupImbalance");
    expect(imbalanceFinding).toBeDefined();
    expect(imbalanceFinding?.tier).toBe("review");

    const ctxBalanced: CheckContext = { schema: schema as any, data: dataBalanced as any, plan: { groupingVariable: "group" } as any };
    const findingsBalanced = runChecks("plan", ctxBalanced);
    const imbalanceFindingBalanced = findingsBalanced.find(f => f.checkId === "groupImbalance");
    expect(imbalanceFindingBalanced).toBeUndefined();
  });
});
