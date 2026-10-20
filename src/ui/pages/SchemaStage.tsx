import { useRef, useState, useEffect, useMemo } from "react";
import type React from "react";
import { runQA } from "../../core/qa";
import type { ColumnType, Schema, SchemaColumn } from "../../core/types";
import { useStore } from "../../store";
import { stripBracketCodes } from "../../core/format/tableTitle";
import { deriveSchemaReviewSignal, type SchemaReviewSignal } from "../../core/schema/reviewSignal";
import DecisionExplainer from "../components/DecisionExplainer";
import EmptyState from "../components/EmptyState";
import { formatStatisticalNumber } from "../../core/format/numberFormat";
import { MissingCodesPanel } from "../components/MissingCodesPanel";
import StepHeader from "../layout/StepHeader";
import StepActionBar from "../layout/StepActionBar";

const TYPE_OPTIONS: ColumnType[] = [
  "continuous",
  "binary",
  "categorical_nominal",
  "categorical_ordinal",
  "id_like",
  "unsupported",
];

const TYPE_META: Record<ColumnType, { label: string; example: string; consequence: string }> = {
  continuous: {
    label: "Numeric",
    example: "age in years",
    consequence: "shown as mean +/- SD or median [IQR]",
  },
  binary: {
    label: "Yes/No category (binary)",
    example: "two levels",
    consequence: "shown as n (%)",
  },
  categorical_nominal: {
    label: "Category (no order)",
    example: "blood type: A/B/O",
    consequence: "shown as n (%)",
  },
  categorical_ordinal: {
    label: "Ordered category (ordinal)",
    example: "stage I/II/III",
    consequence: "shown in the order you set",
  },
  date: {
    label: "Date",
    example: "enrollment date",
    consequence: "not used in Table 1",
  },
  id_like: {
    label: "Identifier",
    example: "patient ID",
    consequence: "excluded from the table",
  },
  numeric_encoded_categorical_ambiguous: {
    label: "Needs review",
    example: "1/2/3 may be codes or numbers",
    consequence: "choose a final type before continuing",
  },
  unsupported: {
    label: "Unsupported",
    example: "free text notes",
    consequence: "excluded unless recoded",
  },
};

function typeExampleForColumn(col: SchemaColumn, exampleValues: string[]): string {
  if (
    (col.confirmedType === "binary" ||
      col.confirmedType === "categorical_nominal" ||
      col.confirmedType === "categorical_ordinal") &&
    col.levels?.length
  ) {
    const labels = col.levels.slice(0, 3).map((level) => level.label).join("/");
    const suffix = col.levels.length > 3 ? "/..." : "";
    return `${stripBracketCodes(col.displayLabel || col.name)}: ${labels}${suffix}`;
  }

  if (
    (col.confirmedType === "continuous" || col.confirmedType === "id_like" || col.confirmedType === "unsupported") &&
    exampleValues.length > 0
  ) {
    const values = exampleValues.map((value) => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue)
        ? formatStatisticalNumber(numericValue, {
            thousandSeparator: false,
            suppressTrailingZero: true,
            decimalPrecision: 1,
          })
        : value;
    });
    const unit = col.units ? ` ${col.units}` : "";
    return `${stripBracketCodes(col.displayLabel || col.name)}: e.g. ${values.join(", ")}${unit}`;
  }

  return TYPE_META[col.confirmedType].example;
}

const STATUS_META = {
  ok: { label: "OK", icon: "✓", className: "bg-green-100 text-green-800" },
  warn: { label: "Check", icon: "!", className: "bg-yellow-100 text-yellow-800" },
  flag: { label: "Needs review", icon: "!", className: "bg-red-100 text-red-800" },
};

export default function SchemaStage() {
  const {
    schema,
    data,
    updateSchemaColumn,
    setStage,
    setQaReport,
    addAuditEntry,
    ordinalReorderFocusColumn,
    setOrdinalReorderFocusColumn,
    setSchema,
  } = useStore();

  const [initialSchema, setInitialSchema] = useState<Schema | null>(null);
  const [lastSchemaBeforeBulk, setLastSchemaBeforeBulk] = useState<Schema | null>(null);
  const [pendingBulkType, setPendingBulkType] = useState<ColumnType | null>(null);
  const [rowFilter, setRowFilter] = useState<"all" | "review" | "excluded">("all");
  const [search, setSearch] = useState("");
  const [activeExplainer, setActiveExplainer] = useState<string | null>(null);
  const [columnWidths, setColumnWidths] = useState([180, 190, 130, 240, 220, 180]);

  // Capture the initial schema when this stage loads, to allow "Reset to Default"
  useEffect(() => {
    if (schema && !initialSchema) {
      setInitialSchema(JSON.parse(JSON.stringify(schema)));
    }
  }, [schema, initialSchema]);

  const ambiguousColumns = schema?.columns.filter((col) => col.confirmedType === "numeric_encoded_categorical_ambiguous") ?? [];
  const counts = useMemo(() => {
    const columns = schema?.columns ?? [];
    return { numeric: columns.filter((c) => c.confirmedType === "continuous").length, categorical: columns.filter((c) => ["binary", "categorical_nominal", "categorical_ordinal"].includes(c.confirmedType)).length, excluded: columns.filter((c) => Boolean(c.exclusionReason)).length, review: columns.filter((c) => c.confirmedType === "numeric_encoded_categorical_ambiguous" || (c.confirmedType === "unsupported" && !c.exclusionReason)).length };
  }, [schema?.columns]);
  const visibleColumns = useMemo(() => (schema?.columns ?? []).filter((col) => {
    const review = col.confirmedType === "numeric_encoded_categorical_ambiguous" || (col.confirmedType === "unsupported" && !col.exclusionReason);
    const matches = rowFilter === "all" || (rowFilter === "review" && review) || (rowFilter === "excluded" && Boolean(col.exclusionReason));
    const term = search.trim().toLocaleLowerCase();
    return matches && (!term || col.name.toLocaleLowerCase().includes(term) || (col.displayLabel ?? "").toLocaleLowerCase().includes(term));
  }), [schema?.columns, rowFilter, search]);
  const exampleValuesByColumn = useMemo(() => {
    const values = (schema?.columns ?? []).map(() => [] as string[]);
    if (!data || values.length === 0) return values;

    for (const row of data.rows) {
      let complete = true;
      for (let columnIndex = 0; columnIndex < values.length; columnIndex++) {
        const examples = values[columnIndex];
        if (examples.length >= 3) continue;
        complete = false;
        const value = row[columnIndex];
        if (value !== null && value !== "") examples.push(String(value));
      }
      if (complete || values.every((examples) => examples.length >= 3)) break;
    }

    return values;
  }, [data, schema?.columns]);

  const applyBulkTypeChange = (targetType: ColumnType) => {
    if (!schema) return;
    // Save snapshot for revert
    setLastSchemaBeforeBulk(JSON.parse(JSON.stringify(schema)));

    // Update all columns with confirmedType === "numeric_encoded_categorical_ambiguous"
    let updatedCount = 0;
    schema.columns.forEach((col) => {
      if (col.confirmedType === "numeric_encoded_categorical_ambiguous") {
        updateSchemaColumn(col.name, { confirmedType: targetType });
        updatedCount++;
      }
    });

    if (updatedCount > 0) {
      addAuditEntry(`Bulk set ${updatedCount} ambiguous columns to '${targetType}'.`, {
        count: updatedCount,
        type: targetType,
      });
    }
  };

  const handleRevertBulk = () => {
    if (lastSchemaBeforeBulk) {
      setSchema(JSON.parse(JSON.stringify(lastSchemaBeforeBulk)));
      setLastSchemaBeforeBulk(null);
      addAuditEntry("Reverted last bulk column type assignment.");
    }
  };

  const handleResetToDefault = () => {
    if (initialSchema) {
      setSchema(JSON.parse(JSON.stringify(initialSchema)));
      setLastSchemaBeforeBulk(null);
      setPendingBulkType(null);
      addAuditEntry("Reset all manual schema changes in Stage 4 to default.");
    }
  };

  const handleNext = () => {
    if (!schema || !data) return;
    const hasAmbiguous = schema.columns.some(
      (c) => c.confirmedType === "numeric_encoded_categorical_ambiguous",
    );
    if (hasAmbiguous) {
      alert("Please resolve all ambiguous columns before proceeding.");
      return;
    }
    const hasUnsupported = schema.columns.some(
      (c) => c.confirmedType === "unsupported" && !c.exclusionReason,
    );
    if (hasUnsupported) {
      // Just auto exclude them
      schema.columns.forEach((c) => {
        if (c.confirmedType === "unsupported" && !c.exclusionReason) {
          updateSchemaColumn(c.name, { exclusionReason: "Excluded by default - unsupported type" });
        }
      });
    }

    // Run QA (pass full schema so compliance check can run when dictionary is imported)
    const report = runQA(data, schema);
    setQaReport(report);
    setOrdinalReorderFocusColumn(null);
    setStage(5);
  };

  if (!schema) {
    return (
      <EmptyState
        title="No variable types available"
        reason="Variable types are created after you upload data and confirm the sheet header."
        next="Return to the data dictionary step so the app can prepare the variables for review."
        action={{ label: "Go to Data Dictionary", onClick: () => setStage(3) }}
      />
    );
  }
  const educationContext = { schema };

  return (
    <div className="max-w-6xl mx-auto">
      <StepHeader n={2} eyebrow="VARIABLE TYPES" title="Review & adjust variable types" lede="The app inferred a type for every column. Check the ones that look wrong; the type decides how each variable is summarized in Table 1." next="Data checks" />
      <MissingCodesPanel />

      <p className="mb-4 text-sm text-gray-600">
        The <strong>Display label</strong> is what appears in the published table (e.g.
        "Gestational age" instead of "[b1]GA"). The raw column name from your source data
        is shown on the left and stays as the join key — only the display label changes.
      </p>

      <p className="mb-4 text-sm text-gray-600">
        For categorical variables, imported dictionary levels are used as labels. Mark a variable as ordered only when the category order matters clinically; ordered levels can then be moved up or down in the Levels / Ordinality column.
      </p>

      <section className="mb-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="Variable summary and filters">
        <div className="mb-3 flex flex-wrap gap-2" aria-label="Variable counts">
          <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{counts.numeric} numeric</span>
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">{counts.categorical} categorical</span>
          <span className="rounded-full border border-gray-200 bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">{counts.excluded} excluded</span>
          <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">{counts.review} need review</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Filter variables" className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-1">
            {([['all', `All ${schema.columns.length}`], ['review', `Needs review ${counts.review}`], ['excluded', `Excluded ${counts.excluded}`]] as const).map(([key, label]) => <button key={key} type="button" data-testid={key === "all" ? "schema-filter" : undefined} aria-pressed={rowFilter === key} onClick={() => setRowFilter(key)} className={`rounded-full px-3 py-1 text-xs ${rowFilter === key ? "bg-white font-semibold shadow-sm" : "text-gray-600"}`}>{label}</button>)}
          </div>
          <label className="min-w-[200px] flex-1 sm:max-w-xs"><span className="sr-only">Search variables</span><input data-testid="schema-search" type="search" placeholder="Search variables" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-lg border border-gray-300 px-3 text-sm" /></label>
        </div>
      </section>

      <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200 flex flex-wrap gap-4 items-center justify-between">
        <div className="flex flex-wrap gap-4 items-center">
          <span className="text-sm font-medium text-gray-700">Bulk action for unresolved columns:</span>
          <div className="inline-flex gap-2">
            <button
              onClick={() => setPendingBulkType("binary")}
              className="px-3 py-1 text-xs bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm text-gray-700 transition disabled:opacity-50"
              disabled={ambiguousColumns.length === 0}
            >
              Set all to {TYPE_META.binary.label}
            </button>
            <button
              onClick={() => setPendingBulkType("continuous")}
              className="px-3 py-1 text-xs bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm text-gray-700 transition disabled:opacity-50"
              disabled={ambiguousColumns.length === 0}
            >
              Set all to {TYPE_META.continuous.label}
            </button>
            <button
              onClick={() => setPendingBulkType("categorical_nominal")}
              className="px-3 py-1 text-xs bg-white border border-gray-300 hover:bg-gray-50 rounded shadow-sm text-gray-700 transition disabled:opacity-50"
              disabled={ambiguousColumns.length === 0}
            >
              Set all to {TYPE_META.categorical_nominal.label}
            </button>
          </div>
          {lastSchemaBeforeBulk && (
            <button
              onClick={handleRevertBulk}
              className="px-3 py-1 text-xs bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-800 rounded transition shadow-sm"
            >
              Revert Bulk Action
            </button>
          )}
        </div>
        <button
          onClick={handleResetToDefault}
          className="px-3 py-1 text-xs bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 rounded transition shadow-sm"
        >
          Reset to Default
        </button>
      </div>
      {pendingBulkType && (
        <div role="alertdialog" aria-label="Confirm bulk type change" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="font-semibold">
            Apply {TYPE_META[pendingBulkType].label} to {ambiguousColumns.length} unresolved column{ambiguousColumns.length === 1 ? "" : "s"}?
          </div>
          <div className="mt-1 text-xs">{ambiguousColumns.map((col) => col.name).join(", ")}</div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => {
                applyBulkTypeChange(pendingBulkType);
                setPendingBulkType(null);
              }}
              className="rounded bg-amber-700 px-3 py-1 text-xs font-medium text-white hover:bg-amber-800"
            >
              Apply bulk change
            </button>
            <button
              type="button"
              onClick={() => setPendingBulkType(null)}
              className="rounded border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="mb-6 grid items-start gap-3 md:grid-cols-2">
        {(["schema.type-inference", "schema.reference-level", "schema.ordinal-order", "schema.exclusions"] as const).map((decisionId, index) => {
          const labels = ["Why these inferred variable types?", "Why these reference levels?", "Why confirm ordinal order?", "Why exclude these variables?"];
          return <DecisionExplainer key={decisionId} decisionId={decisionId} label={labels[index]} context={educationContext} open={activeExplainer === decisionId} onToggle={() => setActiveExplainer((current) => current === decisionId ? null : decisionId)} />;
        })}
      </div>

      <div className="overflow-x-auto overflow-y-visible rounded-lg bg-white shadow">
        <table
          className="w-full table-fixed border-collapse divide-y divide-gray-200 text-[13px]"
        >
          <colgroup><col style={{ width: "15%" }} /><col style={{ width: "19%" }} /><col style={{ width: "10%" }} /><col style={{ width: "26%" }} /><col style={{ width: "17%" }} /><col style={{ width: "13%" }} /></colgroup>
          <thead className="sticky top-0 z-10 bg-gray-100 max-[1199px]:sr-only">
            <tr>
              <ResizableHeader index={0} widths={columnWidths} setWidths={setColumnWidths}>Raw column</ResizableHeader>
              <ResizableHeader index={1} widths={columnWidths} setWidths={setColumnWidths}>Display label</ResizableHeader>
              <ResizableHeader index={2} widths={columnWidths} setWidths={setColumnWidths}>Units</ResizableHeader>
              <ResizableHeader index={3} widths={columnWidths} setWidths={setColumnWidths}>Type</ResizableHeader>
              <ResizableHeader index={4} widths={columnWidths} setWidths={setColumnWidths}>Levels / Ordinality</ResizableHeader>
              <ResizableHeader index={5} widths={columnWidths} setWidths={setColumnWidths}>Status</ResizableHeader>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {visibleColumns.map((col) => (
              <SchemaRow
                key={col.name}
                col={col}
                exampleValues={exampleValuesByColumn[schema.columns.indexOf(col)] ?? []}
                update={updateSchemaColumn}
                onAudit={addAuditEntry}
                ordinalReorderFocusColumn={ordinalReorderFocusColumn}
                setOrdinalReorderFocusColumn={setOrdinalReorderFocusColumn}
              />
            ))}
          </tbody>
        </table>
      </div>
      <StepActionBar onBack={() => setStage(3)} backLabel="Back" status={{ tone: counts.review ? "warn" : "ok", text: counts.review ? `Resolve ${schema.columns.filter((c) => c.confirmedType === "numeric_encoded_categorical_ambiguous" || (c.confirmedType === "unsupported" && !c.exclusionReason)).map((c) => c.name).join(", ")} (Needs review) to continue` : `All ${schema.columns.length} variables are confirmed.` }} primary={{ label: "Proceed", testId: "schema-proceed", onClick: handleNext, disabledReason: counts.review ? `Resolve ${schema.columns.filter((c) => c.confirmedType === "numeric_encoded_categorical_ambiguous" || (c.confirmedType === "unsupported" && !c.exclusionReason)).map((c) => c.name).join(", ")} (Needs review) to continue` : undefined }} />
    </div>
  );
}

function ResizableHeader({
  index,
  widths,
  setWidths,
  children,
}: {
  index: number;
  widths: number[];
  setWidths: React.Dispatch<React.SetStateAction<number[]>>;
  children: React.ReactNode;
}) {
  const startResize = (event: React.PointerEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = widths[index];
    const minWidth = index === 2 ? 90 : 110;
    const onMove = (moveEvent: PointerEvent) => {
      const next = Math.max(minWidth, startWidth + moveEvent.clientX - startX);
      setWidths((current) => current.map((width, widthIndex) => (widthIndex === index ? next : width)));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <th className="relative border-r border-gray-300 px-3 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 last:border-r-0">
      {children}
      <span
        role="separator"
        aria-label={`Resize ${children} column`}
        aria-orientation="vertical"
        title={`Drag to resize ${children}`}
        onPointerDown={startResize}
        className="absolute right-0 top-0 h-full w-3 cursor-col-resize border-r-2 border-gray-400 bg-transparent hover:border-blue-500 hover:bg-blue-50"
      />
    </th>
  );
}

function SchemaRow({
  col,
  exampleValues,
  update,
  onAudit,
  ordinalReorderFocusColumn,
  setOrdinalReorderFocusColumn,
}: {
  col: SchemaColumn;
  exampleValues: string[];
  update: (name: string, up: Partial<SchemaColumn>) => void;
  onAudit: (action: string, details?: Record<string, string | number | boolean | null>) => void;
  ordinalReorderFocusColumn: string | null;
  setOrdinalReorderFocusColumn: (col: string | null) => void;
}) {
  const isAmbiguous = col.confirmedType === "numeric_encoded_categorical_ambiguous";
  const isExcluded = !!col.exclusionReason;
  const reviewSignal = deriveSchemaReviewSignal(col);
  // Capture the pre-edit value at focus so the blur handler can diff against it.
  const labelOnFocus = useRef<string>(col.displayLabel ?? "");
  const unitsOnFocus = useRef<string>(col.units ?? "");

  const handleLevelMove = (idx: number, dir: number) => {
    if (!col.levels) return;
    const newLevels = [...col.levels];
    const target = idx + dir;
    if (target < 0 || target >= newLevels.length) return;
    [newLevels[idx], newLevels[target]] = [newLevels[target], newLevels[idx]];
    // Update order property
    newLevels.forEach((l, i) => {
      l.order = i;
    });
    update(col.name, { levels: newLevels });
  };

  return (
    <tr className={isExcluded ? "bg-gray-50 opacity-60" : ""}>
      <td data-label="Raw column" className="overflow-hidden border-r border-gray-200 px-3 py-3 align-top max-[1199px]:block max-[1199px]:w-full max-[1199px]:border-r-0" title={col.name}>
        <div className="max-w-full truncate font-mono text-xs text-gray-700">{col.name}</div>
        {isExcluded && (
          <div className="mt-1 max-w-full truncate text-xs text-gray-600" title={`Excluded from Table 1: ${col.exclusionReason}`}>
            Excluded from Table 1: {col.exclusionReason}
          </div>
        )}
      </td>
      <td data-label="Display label" className="overflow-hidden border-r border-gray-200 px-3 py-3 align-top max-[1199px]:block max-[1199px]:w-full max-[1199px]:border-r-0">
        <input
          type="text"
          aria-label={`Display label for ${col.name}`}
          placeholder={stripBracketCodes(col.name)}
          title={col.displayLabel || stripBracketCodes(col.name)}
          className="block w-full rounded border border-gray-300 p-1 text-sm"
          value={col.displayLabel ?? ""}
          onChange={(e) => update(col.name, { displayLabel: e.target.value })}
          onFocus={() => {
            labelOnFocus.current = col.displayLabel ?? "";
          }}
          onBlur={(e) => {
            const next = e.target.value.trim();
            const prev = labelOnFocus.current;
            if (next !== prev) {
              onAudit(`User changed display label for '${col.name}' from '${prev}' to '${next}'.`, {
                column: col.name,
                from: prev,
                to: next,
              });
            }
          }}
        />
      </td>
      <td data-label="Units" className="overflow-hidden border-r border-gray-200 px-3 py-3 align-top max-[1199px]:block max-[1199px]:w-full max-[1199px]:border-r-0">
        <input
          type="text"
          aria-label={`Units for ${col.name}`}
          placeholder="e.g. mg/dL"
          title="Shown in Table 1 row labels"
          className="block w-full rounded border border-gray-300 p-1 text-sm"
          value={col.units ?? ""}
          onChange={(e) => update(col.name, { units: e.target.value })}
          onFocus={() => {
            unitsOnFocus.current = col.units ?? "";
          }}
          onBlur={(e) => {
            const next = e.target.value.trim();
            const prev = unitsOnFocus.current;
            if (next !== prev) {
              onAudit(`User changed units for '${col.name}' from '${prev}' to '${next}'.`, {
                column: col.name,
                from: prev,
                to: next,
              });
            }
          }}
        />
      </td>
      <td data-label="Type" className="overflow-hidden border-r border-gray-200 px-3 py-3 align-top max-[1199px]:block max-[1199px]:w-full max-[1199px]:border-r-0">
        {isAmbiguous ? (
          <div className="flex min-w-0 flex-col space-y-1">
            <span className="text-xs text-red-600 font-medium">Ambiguous Numeric</span>
            <span className="text-xs text-gray-600">
              Recommended: {TYPE_META[col.inferredType].label}
            </span>
            <span className="text-xs text-gray-500">
              {TYPE_META[col.inferredType].example}; {TYPE_META[col.inferredType].consequence}
            </span>
            {col.inferredType !== "numeric_encoded_categorical_ambiguous" && (
              <button
                type="button"
                onClick={() => update(col.name, { confirmedType: col.inferredType })}
                className="w-fit rounded border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-800 hover:bg-blue-100"
              >
                Use recommended
              </button>
            )}
            <select
              data-testid="schema-type-select"
              data-ambiguous="true"
              className="w-full rounded border border-red-300 bg-red-50 p-1 text-sm"
              value=""
              onChange={(e) => update(col.name, { confirmedType: e.target.value as ColumnType })}
            >
              <option value="" disabled>
                Select true type…
              </option>
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <select
            data-testid="schema-type-select"
            className="w-full rounded border border-gray-300 p-1 text-sm"
            value={col.confirmedType}
            onChange={(e) => {
              update(col.name, { confirmedType: e.target.value as ColumnType });
              setOrdinalReorderFocusColumn(null);
            }}
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {TYPE_META[t].label}
              </option>
            ))}
          </select>
        )}
        <div className="mt-1 break-words text-xs text-gray-500">
          {typeExampleForColumn(col, exampleValues)}; {TYPE_META[col.confirmedType].consequence}
        </div>
        {reviewSignal.message && (
          <div
            className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900"
            title={reviewSignal.message}
          >
            <span className="block">{reviewSignal.message}</span>
          </div>
        )}
      </td>
      <td data-label="Levels / ordinality" className="overflow-hidden border-r border-gray-200 px-3 py-3 align-top max-[1199px]:block max-[1199px]:w-full max-[1199px]:border-r-0">
        {(col.confirmedType === "categorical_nominal" ||
          col.confirmedType === "categorical_ordinal" ||
          col.confirmedType === "binary") &&
        col.levels ? (
          <div className="text-sm">
            <div className="mb-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={col.confirmedType === "categorical_ordinal"}
                  onChange={(e) => {
                    update(col.name, {
                      confirmedType: e.target.checked
                        ? "categorical_ordinal"
                        : col.levels?.length === 2
                          ? "binary"
                          : "categorical_nominal",
                    });
                    setOrdinalReorderFocusColumn(null);
                  }}
                  className="rounded text-blue-600"
                />
                <span>Mark as ordinal</span>
              </label>
              {ordinalReorderFocusColumn === col.name && col.confirmedType !== "categorical_ordinal" && (
                <div className="text-xs text-indigo-600 font-semibold mt-1 animate-pulse">
                  👉 Check "Mark as ordinal" to set order.
                </div>
              )}
            </div>
            {col.confirmedType === "categorical_ordinal" && (
              <div className="border border-gray-200 rounded p-2 bg-gray-50 max-h-32 overflow-y-auto">
                {col.levels.map((lvl, idx) => (
                  <div
                    key={lvl.code}
                    className="flex items-center justify-between py-1 border-b border-gray-100 last:border-0"
                  >
                    <span className="min-w-0 truncate">{lvl.label}</span>
                    <div className="flex space-x-1">
                      <button
                        type="button"
                        aria-label={`Move ${lvl.label} up`}
                        onClick={() => handleLevelMove(idx, -1)}
                        disabled={idx === 0}
                        className="px-1 text-gray-500 hover:text-black disabled:opacity-30"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${lvl.label} down`}
                        onClick={() => handleLevelMove(idx, 1)}
                        disabled={idx === (col.levels?.length ?? 0) - 1}
                        className="px-1 text-gray-500 hover:text-black disabled:opacity-30"
                      >
                        ↓
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {col.confirmedType !== "categorical_ordinal" && (
              <div className="text-xs text-gray-500">{col.levels?.length ?? 0} levels</div>
            )}
          </div>
        ) : (
          <span className="text-gray-400 text-sm">-</span>
        )}
      </td>
      <td data-label="Status" className="overflow-hidden px-3 py-3 align-top max-[1199px]:block max-[1199px]:w-full">
        {isExcluded ? (
          <div className="flex min-h-16 flex-col items-start gap-2">
            {reviewSignal.level !== "ok" && <StatusBadge signal={reviewSignal} rawTier={col.cardinalityTier} />}
            <button
              type="button"
              onClick={() => update(col.name, { exclusionReason: undefined })}
              title="Re-include this variable in Table 1. Your source data is unchanged."
              className="mt-auto rounded border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              Re-include
            </button>
          </div>
        ) : (
          <div className="flex min-h-16 flex-col items-start gap-2">
            {reviewSignal.level !== "ok" && <StatusBadge signal={reviewSignal} rawTier={col.cardinalityTier} />}
            <button
              type="button"
              onClick={() => update(col.name, { exclusionReason: "Manually excluded" })}
              title="Your data is unchanged; this only removes the variable from Table 1."
              className="mt-auto rounded border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
            >
              Exclude
            </button>
            <span className="sr-only">Your data is unchanged; this only removes the variable from Table 1.</span>
          </div>
        )}
      </td>
    </tr>
  );
}

function StatusBadge({
  signal,
  rawTier,
}: {
  signal: SchemaReviewSignal;
  rawTier: SchemaColumn["cardinalityTier"];
}) {
  const meta = STATUS_META[signal.level];
  return (
    <span
      title={`${signal.message ?? "No variable-type review issue."} Cardinality is how many distinct values a column has. Raw tier: ${rawTier}.`}
      aria-label={`Variable type status ${meta.label}${signal.message ? `: ${signal.message}` : ""}`}
      className={`text-[10px] px-2 py-0.5 rounded-full inline-flex gap-1 ${meta.className}`}
    >
      <span aria-hidden="true">{meta.icon}</span>
      {meta.label}
    </span>
  );
}
