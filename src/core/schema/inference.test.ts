import fs from "node:fs";
import { describe, expect, it } from "vitest";
import path from "node:path";
import * as XLSX from "xlsx";
import { runChecks } from "../qa/checkRegistry";
import type { DataFrame } from "../types";
import { parseXLSXSheet } from "../parser/xlsx";
import { ID_LIKE_MIN_COVERAGE, inferSchema } from "./inference";
import { deriveSchemaReviewSignal } from "./reviewSignal";

function makeFrame(columns: string[], rows: unknown[][]): DataFrame {
  return {
    columns: columns.map((name) => ({ originalName: name, name })),
    rows: rows as DataFrame["rows"],
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

describe("inferSchema D18a integer cardinality band", () => {
  it("soft-flags 5-10 distinct whole-Numeric values while preserving categorical default", () => {
    const df = makeFrame(["ENVHOXY"], [[92], [93], [94], [95], [96], [97], [98], [99], [100]]);
    const [col] = inferSchema(df);

    expect(col.confirmedType).toBe("categorical_nominal");
    expect(col.cardinalityTier).toBe("ok");
    expect(col.distinctCount).toBe(9);
    expect(col.isWholeNumberNumeric).toBe(true);
    expect(deriveSchemaReviewSignal(col).message).toContain("Numeric");
    expect(col.levels).toHaveLength(9);
  });

  it("keeps 4 distinct integers as categorical without a soft flag", () => {
    const [col] = inferSchema(makeFrame(["code4"], [[1], [2], [3], [4]]));
    expect(col.confirmedType).toBe("categorical_nominal");
    expect(col.cardinalityTier).toBe("ok");
    expect(deriveSchemaReviewSignal(col).level).toBe("ok");
  });

  it("keeps 2 distinct integers as binary", () => {
    const [col] = inferSchema(makeFrame(["sex"], [[1], [2], [1]]));
    expect(col.confirmedType).toBe("binary");
    expect(deriveSchemaReviewSignal(col).level).toBe("ok");
  });

  it("keeps more than 10 distinct integers continuous", () => {
    const rows = Array.from({ length: 12 }, (_, index) => [index + 1]);
    const [col] = inferSchema(makeFrame(["gestational_weeks"], rows));
    expect(col.confirmedType).toBe("continuous");
    expect(deriveSchemaReviewSignal(col).level).toBe("ok");
  });

  it("does not soft-flag distinct non-whole numeric values", () => {
    const rows = [[1.1], [2.2], [3.3], [4.4], [5.5], [6.6], [7.7]];
    const [col] = inferSchema(makeFrame(["marker"], rows));
    expect(col.confirmedType).toBe("continuous");
    expect(deriveSchemaReviewSignal(col).level).toBe("ok");
  });

  it("uses a constant-column exclusion reason instead of unable-to-determine text", () => {
    const [col] = inferSchema(makeFrame(["ENSALTEMP"], [["0"], ["0"], ["0"]]));
    expect(col.confirmedType).toBe("unsupported");
    expect(col.exclusionReason).toContain("Constant column");
    expect(col.exclusionReason).toContain('"0"');
  });

  it("covers D18a, constants, and Excel-error QA in one synthetic pass", () => {
    const data = makeFrame(
      ["SpO2", "route", "constant0", "AGEMO", "decimal"],
      [
        [92, 1, 0, null, 1.1],
        [93, 2, 0, null, 2.2],
        [94, 3, 0, null, 3.3],
        [95, 4, 0, null, 4.4],
        [96, 1, 0, null, 5.5],
        [97, 2, 0, null, 6.6],
        [98, 3, 0, null, 7.7],
        [99, 4, 0, null, 8.8],
        [100, 1, 0, null, 9.9],
      ],
    );
    data.meta.excelErrorCounts = { AGEMO: 9 };
    data.meta.parseWarnings = [{
      column: "AGEMO",
      message: "Column 'AGEMO': 9 Excel error value(s) (#REF!) treated as missing.",
    }];

    const columns = inferSchema(data);
    const spo2 = columns.find((col) => col.name === "SpO2");
    expect(spo2 && deriveSchemaReviewSignal(spo2).message).toContain("Numeric");
    expect(columns.find((col) => col.name === "route")?.confirmedType).toBe("categorical_nominal");
    expect(columns.find((col) => col.name === "constant0")?.exclusionReason).toContain("Constant column");
    expect(columns.find((col) => col.name === "decimal")?.confirmedType).toBe("continuous");

    const activeColumns = columns.map((col) => col.name === "AGEMO" ? { ...col, exclusionReason: undefined } : col);
    const findings = runChecks("data-review", { data, schema: { columns: activeColumns } });
    const excel = findings.find((finding) => finding.checkId === "excelErrorColumn_AGEMO");
    expect(excel?.tier).toBe("blocking");
    expect(excel?.detail).toContain("#REF!");
  });
});

describe("inferSchema large arrays", () => {
  it("matches the first 1,000 rows when inferring a 200,000-row frame", () => {
    const makeRows = (count: number) => Array.from({ length: count }, (_, index) => [
      index + 1,
      (index % 1000) / 10,
      index % 3 === 0 ? "A" : index % 3 === 1 ? "B" : "C",
    ]);
    const columns = ["record_id", "measurement", "category"];
    const small = inferSchema(makeFrame(columns, makeRows(1_000)));
    const large = inferSchema(makeFrame(columns, makeRows(200_000)));

    expect(large.map((column) => column.confirmedType)).toEqual(small.map((column) => column.confirmedType));
  });
});

describe("inferSchema D91 ordered range labels", () => {
  it("infers bracketed age and weight bins as ordinal with numeric order", () => {
    const [age, weight] = inferSchema(makeFrame(
      ["age", "weight"],
      [
        ["[70-80)", ">200"],
        ["[0-10)", "[25-50)"],
        ["[90-100)", "[175-200)"],
        ["[10-20)", "[0-25)"],
        ["[50-60)", "[150-175)"],
      ],
    ));

    expect(age.confirmedType).toBe("categorical_ordinal");
    expect(age.inferredType).toBe("categorical_ordinal");
    expect(age.levels?.map((level) => level.label)).toEqual(["[0-10)", "[10-20)", "[50-60)", "[70-80)", "[90-100)"]);
    expect(age.levels?.map((level) => level.order)).toEqual([0, 1, 2, 3, 4]);
    expect(weight.confirmedType).toBe("categorical_ordinal");
    expect(weight.levels?.map((level) => level.label)).toEqual(["[0-25)", "[25-50)", "[150-175)", "[175-200)", ">200"]);
  });

  it("keeps ordinary color labels nominal", () => {
    const [col] = inferSchema(makeFrame(["color"], [["Red"], ["Green"], ["Blue"]]));
    expect(col.confirmedType).toBe("categorical_nominal");
  });

  it("does not reclassify numeric-coded categorical labels", () => {
    const [col] = inferSchema(makeFrame(["code"], [["0"], ["1"], ["2"]]));
    expect(col.confirmedType).toBe("categorical_nominal");
  });

  it("does not reclassify two-level threshold labels", () => {
    const [col] = inferSchema(makeFrame(["age50"], [["<50"], [">=50"], ["<50"]]));
    expect(col.confirmedType).toBe("binary");
  });
});

describe("inferSchema D99 identifier narrowing", () => {
  const distinctRows = (populated: number, valueForIndex: (index: number) => unknown) =>
    Array.from({ length: 40 }, (_, index) => [index < populated ? valueForIndex(index) : null]);

  it("requires near-complete coverage and non-negative whole numbers for unnamed numeric identifiers", () => {
    expect(ID_LIKE_MIN_COVERAGE).toBe(0.9);
    expect(inferSchema(makeFrame(["delta"], distinctRows(22, (index) => index - 11)))[0].confirmedType).toBe("continuous");
    expect(inferSchema(makeFrame(["record_number"], distinctRows(40, (index) => index + 1)))[0].confirmedType).toBe("id_like");
    expect(inferSchema(makeFrame(["record_number"], distinctRows(36, (index) => index + 1)))[0].confirmedType).toBe("id_like");
    expect(inferSchema(makeFrame(["record_number"], distinctRows(35, (index) => index + 1)))[0].confirmedType).toBe("continuous");
  });

  it("keeps all-distinct strings and explicitly named sparse identifiers as id_like", () => {
    expect(inferSchema(makeFrame(["record"], distinctRows(40, (index) => `person-${index + 1}`)))[0].confirmedType).toBe("id_like");
    expect(inferSchema(makeFrame(["patient_id"], distinctRows(5, (index) => index + 1)))[0].confirmedType).toBe("id_like");
  });

  const internalStudy = path.resolve(__dirname, "../../../_materials/samples/DrKhanh/15082026_modified.xlsx");
  describe.skipIf(!fs.existsSync(internalStudy))("internal fixture: DrKhanh/15082026_modified.xlsx", () => {
  it("finds only Ma_BN as id_like in both real study sheets", () => {
    const workbook = XLSX.readFile(internalStudy);

    for (const sheetName of ["Data", "Datafull"]) {
      const schema = inferSchema(parseXLSXSheet(workbook, sheetName, 0));
      expect(schema.filter((column) => column.confirmedType === "id_like").map((column) => column.name)).toEqual(["Ma_BN"]);
      expect(schema.find((column) => column.name === "Delta_NH3")?.confirmedType).toBe("continuous");
    }
  });
  });
});
