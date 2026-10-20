import { useState, useEffect, useMemo, useRef } from "react";
import { useStore } from "../../store";
import type { AnalysisPlan } from "../../core/types";
import { runTable1 } from "../../core/stats/runTable1";
import { defaultGroupOrder, validateGroupingVariable } from "../../core/stats/planUtils";
import { journalRulesets } from "../../core/format/formatTable";
import { runChecks, CHECK_REGISTRY } from "../../core/qa/checkRegistry";
import type { DataQualityRecord } from "../../core/types";
import { getMtcAdvice } from "../../core/stats/mtcAdvice";
import { getBaselineTestingAdvice } from "../../core/stats/baselineTestingAdvice";
import { chooseDefaultBinaryDisplayLevel } from "../../core/format/formatTable";
import { getColumnDiagnosticLabel, getColumnDisplayLabel, resolveLevelLabel } from "../../core/format/columnLabel";
import { APP_VERSION } from "../../core/appVersion";
import {
  SMD_CAVEAT,
  SMD_USE_WHEN,
  SMD_USUALLY_NOT_NEEDED,
  SMD_WHEN_TO_USE_HEADLINE,
} from "../../content/smdGuidance";
import AboutThisStep from "../components/AboutThisStep";
import DecisionExplainer from "../components/DecisionExplainer";
import EmptyState from "../components/EmptyState";
import GlossaryTerm from "../components/GlossaryTerm";
import StepHeader from "../layout/StepHeader";
import StepActionBar from "../layout/StepActionBar";

function normalizeColumnKey(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

type GroupOrderValue = string | number;

export default function PlanStage({ engineReady = true, engineError = false }: { engineReady?: boolean; engineError?: boolean }) {
  const {
    schema,
    data,
    plan,
    setPlan,
    stats,
    setStats,
    setStage,
    dataQualityFindings,
    setDataQualityFindings,
    dataQualityRecords,
    setDataQualityRecords,
    researchPopulation,
    studyDesign,
    unitSystem,
    draftGroupingVariable,
    setDraftGroupingVariable,
  } = useStore();

  const [groupingVariable, setGroupingVariable] = useState<string>("");
  const [includedVariables, setIncludedVariables] = useState<string[]>([]);
  const [excludedReasons, setExcludedReasons] = useState<Record<string, 'grouping' | 'user'>>({});
  const [showSMD, setShowSMD] = useState<boolean>(() => plan?.showSMD ?? false);
  const [showPValue, setShowPValue] = useState<boolean>(() => plan?.showPValue ?? true);
  const [mtc, setMtc] = useState<AnalysisPlan["multipleTestingCorrection"]>(
    () => plan?.multipleTestingCorrection ?? "none",
  );
  const [displayLevelOverrides, setDisplayLevelOverrides] = useState<Record<string, string | number>>({});
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [sortOption, setSortOption] = useState<"default" | "freq_desc" | "val_asc" | "custom">("default");
  const [customSortOrder, setCustomSortOrder] = useState<string>("");
  const [planAcked, setPlanAcked] = useState(false);
  const [baselineAdviceDismissed, setBaselineAdviceDismissed] = useState(false);
  const [pendingHidePValueColumn, setPendingHidePValueColumn] = useState<boolean>(
    () => plan?.userOverrides?.hidePValueColumn ?? false,
  );
  const [pValuesShownNotice, setPValuesShownNotice] = useState(false);

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const runTokenRef = useRef(0);
  const initializedVariablesRef = useRef(false);
  const initializedGroupingRef = useRef(false);

  useEffect(() => {
    return () => {
      runTokenRef.current += 1;
    };
  }, []);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, _index: number) => {
    e.preventDefault();
  };

  const reorderVariable = (from: number, to: number) => {
    if (from < 0 || to < 0 || from >= includedVariables.length || to >= includedVariables.length || from === to) return;
    const next = [...includedVariables];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setIncludedVariables(next);
  };

  const handleDrop = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    reorderVariable(draggedIndex, index);
    setDraggedIndex(null);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    reorderVariable(index, index - 1);
  };

  const moveToTop = (index: number) => {
    if (index === 0) return;
    reorderVariable(index, 0);
  };

  const moveDown = (index: number) => {
    if (index === includedVariables.length - 1) return;
    reorderVariable(index, index + 1);
  };

  const moveToBottom = (index: number) => {
    if (index === includedVariables.length - 1) return;
    reorderVariable(index, includedVariables.length - 1);
  };

  const planFindings = dataQualityFindings.filter(f => {
    const checkDef = CHECK_REGISTRY.find(c => c.id === f.checkId || f.checkId.startsWith(c.id + "_"));
    return checkDef?.stage === 'plan';
  });
  const hasBlockingPlan = planFindings.some(f => f.tier === "blocking");
  const hasReviewPlan = planFindings.some(f => f.tier === "review");

  const eligibleGroupingVars = schema?.columns.filter(c => 
    !c.exclusionReason && ["binary", "categorical_nominal", "categorical_ordinal"].includes(c.confirmedType)
  ) || [];

  const resolveColumnName = (candidate: string | null | undefined): string | null => {
    if (!candidate || !schema) return null;
    const normalized = normalizeColumnKey(candidate);
    const schemaMatch = schema.columns.find((column) => {
      if (normalizeColumnKey(column.name) === normalized) return true;
      if (normalizeColumnKey(column.displayLabel) === normalized) return true;
      if (normalizeColumnKey(column.label) === normalized) return true;
      const dataColumn = data?.columns.find((item) => item.name === column.name);
      return normalizeColumnKey(dataColumn?.originalName) === normalized;
    });
    return schemaMatch?.name ?? null;
  };

  const displayNameFor = (name: string): string => {
    const col = schema?.columns.find((column) => column.name === name);
    return col ? getColumnDiagnosticLabel(col) : name;
  };

  useEffect(() => {
    if (schema && schema.columns.length > 0) {
      const persistedGroup = resolveColumnName(plan?.groupingVariable) ?? resolveColumnName(draftGroupingVariable);
      const defaultGroup = eligibleGroupingVars.find(c => c.name === persistedGroup)?.name ?? (eligibleGroupingVars.length > 0 ? eligibleGroupingVars[0].name : "");
      if (eligibleGroupingVars.length > 0 && !initializedGroupingRef.current && !eligibleGroupingVars.find(c => c.name === groupingVariable)) {
        setGroupingVariable(defaultGroup);
        setDraftGroupingVariable(defaultGroup || null);
        initializedGroupingRef.current = true;
      }
      const allVars = schema.columns.filter(c => !c.exclusionReason && c.confirmedType !== 'id_like').map(c => c.name);
      if (allVars.length > 0 && !initializedVariablesRef.current) {
        const previousIncluded = plan?.includedVariables?.filter((name) => allVars.includes(name) && name !== defaultGroup) ?? [];
        const nextIncluded = previousIncluded.length > 0 ? previousIncluded : allVars.filter(v => v !== defaultGroup);
        setIncludedVariables(nextIncluded);
        initializedVariablesRef.current = true;
        const previousDisplayLevels: Record<string, string | number> = {};
        for (const [name, config] of Object.entries(plan?.variableConfig ?? {})) {
          if (config.displayLevel !== undefined) previousDisplayLevels[name] = config.displayLevel;
        }
        setDisplayLevelOverrides(previousDisplayLevels);

        // Initialize excluded reasons
        const reasons: Record<string, 'grouping' | 'user'> = {};
        schema.columns.forEach(c => {
          if (c.name === defaultGroup) {
            reasons[c.name] = 'grouping';
          } else if (!nextIncluded.includes(c.name)) {
            reasons[c.name] = 'user';
          }
        });
        setExcludedReasons(reasons);
      }
    }
  }, [schema, eligibleGroupingVars, groupingVariable, includedVariables.length, plan?.groupingVariable, plan?.includedVariables, draftGroupingVariable, setDraftGroupingVariable]);

  useEffect(() => {
    if (schema && data && groupingVariable) {
      const planCtx = {
        schema,
        data,
        plan: { groupingVariable } as any
      };
      const newPlanFindings = runChecks("plan", planCtx);
      const currentFindings = useStore.getState().dataQualityFindings;
      const otherFindings = currentFindings.filter(f => {
        if (f.checkId === `smallCategoryLevel_${groupingVariable}`) return false;
        const checkDef = CHECK_REGISTRY.find(c => c.id === f.checkId || f.checkId.startsWith(c.id + "_"));
        return checkDef ? checkDef.stage !== 'plan' : true;
      });
      setDataQualityFindings([...otherFindings, ...newPlanFindings]);
      setPlanAcked(false);
    }
  }, [groupingVariable, schema, data, setDataQualityFindings]);

  const toggleIncluded = (name: string) => {
    if (includedVariables.includes(name)) {
      setIncludedVariables(includedVariables.filter(v => v !== name));
      setDisplayLevelOverrides(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
      setExcludedReasons(prev => ({ ...prev, [name]: 'user' }));
    } else {
      setIncludedVariables([...includedVariables, name]);
      setExcludedReasons(prev => {
        const copy = { ...prev };
        delete copy[name];
        return copy;
      });
    }
  };

  const selectableVariables = schema?.columns.filter(c => !c.exclusionReason && c.name !== groupingVariable) ?? [];
  const selectableAnalysisVariables = selectableVariables.filter(c => c.confirmedType !== 'id_like').map(c => c.name);

  const selectAllVariables = () => {
    setIncludedVariables(selectableAnalysisVariables);
    setExcludedReasons(prev => {
      const copy = { ...prev };
      selectableAnalysisVariables.forEach((name) => {
        delete copy[name];
      });
      if (groupingVariable) copy[groupingVariable] = 'grouping';
      return copy;
    });
  };

  const clearAllVariables = () => {
    setIncludedVariables([]);
    setDisplayLevelOverrides({});
    setExcludedReasons(prev => {
      const copy = { ...prev };
      selectableAnalysisVariables.forEach((name) => {
        copy[name] = 'user';
      });
      if (groupingVariable) copy[groupingVariable] = 'grouping';
      return copy;
    });
  };

  const groupOrderStats = useMemo(() => {
    if (!data || !groupingVariable) return { presentArr: [] as GroupOrderValue[], freq: new Map<GroupOrderValue, number>() };
    const colIdx = data.columns.findIndex(c => c.name === groupingVariable);
    const present = new Set<GroupOrderValue>();
    const freq = new Map<GroupOrderValue, number>();
    if (colIdx < 0) return { presentArr: [] as GroupOrderValue[], freq };
    for (const row of data.rows) {
      const v = row[colIdx];
      if (v !== null && v !== undefined && !Number.isNaN(v as number)) {
        const group = v as GroupOrderValue;
        present.add(group);
        freq.set(group, (freq.get(group) ?? 0) + 1);
      }
    }
    return { presentArr: [...present], freq };
  }, [data, groupingVariable]);

  const computeGroupOrder = (): GroupOrderValue[] => {
    if (!schema || !data || !groupingVariable) return [];
    const { presentArr, freq } = groupOrderStats;

    if (sortOption === "custom") {
      return customSortOrder.split('\n').map(s => s.trim()).filter(s => s.length > 0);
    } else if (sortOption === "freq_desc") {
      return [...presentArr].sort((a, b) => {
        const fd = (freq.get(b) ?? 0) - (freq.get(a) ?? 0);
        return fd !== 0 ? fd : String(a).localeCompare(String(b));
      });
    } else if (sortOption === "val_asc") {
      return [...presentArr].sort((a, b) => {
        const an = typeof a === 'number' ? a : parseFloat(a as string);
        const bn = typeof b === 'number' ? b : parseFloat(b as string);
        return an - bn;
      });
    }
    return defaultGroupOrder(schema, data, groupingVariable);
  };

  const handleRun = async () => {
    if (!schema || !data || !groupingVariable) return;
    const runToken = runTokenRef.current + 1;
    runTokenRef.current = runToken;
    setErrorMsg(null);
    setLoading(true);
    try {
      validateGroupingVariable(schema, groupingVariable);

      // Build variableConfig for included variables
      const variableConfig: AnalysisPlan["variableConfig"] = {};
      
      for (const colName of [groupingVariable, ...includedVariables]) {
        const colDef = schema.columns.find(c => c.name === colName);
        if (colDef) {
          variableConfig[colName] = {
            label: getColumnDisplayLabel(colDef, "stripped"),
            units: colDef.units,
            treatAs: colDef.confirmedType,
            missingness: "drop_row",
          };
          if (colDef.confirmedType === "categorical_ordinal" && colDef.levels && colDef.levels.length > 0) {
            variableConfig[colName].levelOrder = colDef.levels.map(l => l.code);
          }
          if (displayLevelOverrides[colName] !== undefined) {
            variableConfig[colName].displayLevel = displayLevelOverrides[colName];
          }
        }
      }

      const groupOrder = computeGroupOrder();

      // Commit plan findings to records, preserving Stage 5 records
      const planFindingsToCommit = dataQualityFindings.filter(f => {
        const checkDef = CHECK_REGISTRY.find(c => c.id === f.checkId || f.checkId.startsWith(c.id + "_"));
        return checkDef?.stage === 'plan';
      });
      const committedPlan = planFindingsToCommit.map(f => {
        let response: DataQualityRecord["response"] = "acknowledged";
        if (f.tier === "review") {
          response = planAcked ? "acknowledged" : "overridden";
        } else if (f.tier === "blocking") {
          response = "fixed";
        }
        return {
          finding: f,
          response,
          timestamp: new Date().toISOString(),
        };
      });
      const stage5Records = dataQualityRecords.filter(r => {
        const checkDef = CHECK_REGISTRY.find(c => c.id === r.finding.checkId || r.finding.checkId.startsWith(c.id + "_"));
        return checkDef?.stage !== 'plan';
      });
      setDataQualityRecords([...stage5Records, ...committedPlan]);

      const keptTestOverrides = (plan?.testOverrides ?? []).filter((o) => includedVariables.includes(o.variable));
      const mergedUserOverrides = { ...(plan?.userOverrides ?? {}) };
      if (pendingHidePValueColumn) mergedUserOverrides.hidePValueColumn = true; else delete mergedUserOverrides.hidePValueColumn;

      const submittedPlan: AnalysisPlan = {
        rulesetVersion: journalRulesets.EasyTableOne_Ruleset.version,
        appVersion: APP_VERSION,
        researchPopulation,
        studyDesign,
        unitSystem,
        groupingVariable,
        includedVariables,
        variableConfig,
        showSMD,
        showPValue,
        multipleTestingCorrection: mtc,
        groupOrder,
        auditLog: [],
        ...(Object.keys(mergedUserOverrides).length > 0 && { userOverrides: mergedUserOverrides }),
        ...(keptTestOverrides.length > 0 && { testOverrides: keptTestOverrides }),
      };

      setPlan(submittedPlan);
      
      const stats = await runTable1(data, submittedPlan);
      if (runToken !== runTokenRef.current) return;
      setStats(stats);
      setStage(7);
    } catch (err: any) {
      if (runToken !== runTokenRef.current) return;
      console.error(err);
      setErrorMsg(String(err.message || err));
    } finally {
      if (runToken === runTokenRef.current) {
        setLoading(false);
      }
    }
  };

  const cancelRunAndGoBack = () => {
    runTokenRef.current += 1;
    setLoading(false);
    setStage(5);
  };

  if (!schema) {
    return (
      <EmptyState
        title="No variable types available"
        reason="The analysis plan depends on confirmed variable types from Step 4."
        next="Review the variable types first, then return here to choose groups and table rows."
        action={{ label: "Go to Variable Types", onClick: () => setStage(4) }}
      />
    );
  }

  const mtcAdvice = getMtcAdvice({ multipleTestingCorrection: mtc }, includedVariables.length);
  const activePlan = plan ?? ({
    studyDesign,
    userOverrides: pendingHidePValueColumn ? { hidePValueColumn: true } : undefined,
  } as AnalysisPlan);
  const baselineAdvice = !baselineAdviceDismissed && showPValue
    ? getBaselineTestingAdvice(activePlan, showSMD ? "computed" : "enable_before_run")
    : null;
  const smdInStats = Boolean(stats?.perVariable?.some((v) => v.smd !== undefined && v.smd !== null));
  const statsStale = Boolean(stats && (showSMD !== smdInStats));
  const runReason = !groupingVariable
    ? "Choose a grouping variable"
    : includedVariables.length === 0
      ? "Select at least one variable"
      : (hasReviewPlan && !planAcked)
        ? "Acknowledge the group size warning"
        : hasBlockingPlan
          ? "Resolve blocking data-quality findings"
          : undefined;
  const educationContext = {
    schema,
    plan: {
      ...(plan ?? {}),
      groupingVariable,
      includedVariables,
    } as AnalysisPlan,
  };

  const levelCountsFor = (columnName: string): Record<string, number> => {
    if (!data) return {};
    const colIdx = data.columns.findIndex((column) => column.name === columnName);
    if (colIdx < 0) return {};
    const counts: Record<string, number> = {};
    for (const row of data.rows) {
      const value = row[colIdx];
      if (value === null || value === undefined || Number.isNaN(value as number)) continue;
      const key = String(value);
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  };

  const displayLevelOptionsFor = (columnName: string): Array<string | number> => {
    const col = schema.columns.find((column) => column.name === columnName);
    const counts = levelCountsFor(columnName);
    const observed = Object.keys(counts);
    const planned = col?.levels?.map((level) => level.code) ?? [];
    const merged: Array<string | number> = [];
    for (const level of [...planned, ...observed]) {
      if (!merged.some((existing) => String(existing) === String(level))) merged.push(level);
    }
    return merged;
  };

  const defaultDisplayLevelFor = (columnName: string): string => {
    const col = schema.columns.find((column) => column.name === columnName);
    return chooseDefaultBinaryDisplayLevel(levelCountsFor(columnName), col);
  };

  const groupPreview = groupingVariable && data
    ? computeGroupOrder().map((group) => ({
        value: group,
        label: resolveLevelLabel(String(group), schema.columns.find((column) => column.name === groupingVariable)),
        n: levelCountsFor(groupingVariable)[String(group)] ?? 0,
      }))
    : [];
  const smallGroups = groupPreview.filter((group) => group.n < 10);
  const mtcHint: Record<AnalysisPlan["multipleTestingCorrection"], string> = {
    none: "Raw P-values. Acceptable for a descriptive Table 1.",
    bonferroni: "Divides the threshold by the number of tests. Very conservative.",
    holm: "Step-down method; less conservative than Bonferroni while still controlling the familywise error rate.",
    bh: "Controls the false discovery rate. Suited to exploratory analyses with many variables.",
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-4">
      <AboutThisStep stage="plan" />
      <StepHeader n={4} eyebrow="ANALYSIS PLAN" title="Analysis Plan" lede="Choose the groups to compare, the variables to show, and how results are displayed. Tests are chosen automatically from your data and can be changed in Statistical review." next="Statistical review" />
      
      {errorMsg && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded">
          {errorMsg}
        </div>
      )}

      {statsStale && (
        <div className="p-3 bg-blue-50 text-blue-800 border border-blue-200 rounded text-sm">
          Display settings changed — re-run the analysis to update the table.
        </div>
      )}

      {baselineAdvice && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="note">
          <p>{baselineAdvice.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">

              <button
                type="button"
                onClick={() => {
                  setShowSMD(true);
                  setPendingHidePValueColumn(true);
                  if (plan) {
                    setPlan({
                      ...plan,
                      showSMD: true,
                      userOverrides: { ...(plan.userOverrides ?? {}), hidePValueColumn: true },
                    });
                  }


                }}
                className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Show SMD, hide P-values
              </button>

            <button
              type="button"
              onClick={() => setBaselineAdviceDismissed(true)}
              className="rounded border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100"
            >
              Keep P-values
            </button>
          </div>
        </div>
      )}

      {eligibleGroupingVars.length === 0 ? (
        <div className="bg-yellow-50 p-6 rounded shadow border border-yellow-200">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">No eligible grouping variable found.</h3>
          <p className="text-sm text-yellow-700 mb-4">
            A Table 1 must be stratified by a categorical (binary or multi-level)
            variable. Please return to the Variable types step and either:
            <ul className="list-disc pl-5 mt-2">
              <li>mark a numeric-encoded column as binary or categorical, or</li>
              <li>confirm a column type that is currently `unsupported` or `ambiguous`.</li>
            </ul>
          </p>
          <button onClick={() => setStage(4)} className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700">
            Go to Variable types
          </button>
        </div>
      ) : (
      <div className="grid items-start gap-4 min-[1181px]:grid-cols-[minmax(0,1fr)_330px]"><div className="space-y-4">
      <section className="rounded-[14px] border border-gray-200 bg-white p-[18px] shadow-sm space-y-4">
        <div><h2 className="text-[14.5px] font-semibold">What groups do you want to compare?</h2><p className="mb-3.5 text-[13px] text-gray-600">Only binary and categorical variables can define groups. The chosen variable is removed from the variable list below.</p></div>
        <div>
          <label htmlFor="grouping-select" className="block text-sm font-medium mb-1">Grouping Variable</label>
          <select 
            id="grouping-select"
            aria-label="Grouping Variable"
            value={groupingVariable}
            onChange={(e) => {
              const newGroup = e.target.value;
              const oldGroup = groupingVariable;
              setGroupingVariable(newGroup);
              setDraftGroupingVariable(newGroup || null);
              
              setIncludedVariables(prev => {
                let next = prev;
                // If oldGroup was excluded due to grouping, re-include it
                if (oldGroup && excludedReasons[oldGroup] === 'grouping') {
                  if (!next.includes(oldGroup)) {
                    next = [...next, oldGroup];
                  }
                }
                // Exclude newGroup
                return next.filter(v => v !== newGroup);
              });
              
              setExcludedReasons(prev => {
                const nextReasons = { ...prev };
                // If oldGroup was excluded due to grouping, clear it
                if (oldGroup && nextReasons[oldGroup] === 'grouping') {
                  delete nextReasons[oldGroup];
                }
                // Exclude newGroup with reason grouping
                nextReasons[newGroup] = 'grouping';
                return nextReasons;
              });
            }}
            className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <option value="">Select a grouping variable…</option>
            {eligibleGroupingVars.map(c => (
              <option key={c.name} value={c.name}>{getColumnDisplayLabel(c)}{(c.levels?.length ?? c.distinctCount ?? 0) > 2 ? ` (${c.levels?.length ?? c.distinctCount} levels)` : ""}</option>
            ))}
          </select>
          {groupPreview.length > 0 && (
            <div className="mt-3 rounded-[10px] border border-blue-200 bg-blue-50 px-3.5 py-3 text-sm text-blue-950">
              <div className="mb-2 font-semibold">Table Column Order Preview</div>
              <div className="flex flex-wrap gap-2">
                {groupPreview.map((group) => (
                  <span key={String(group.value)} className="rounded border border-blue-200 bg-white px-2 py-1">
                    {group.label} <span className="font-mono text-gray-600">(n = {group.n})</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {!groupingVariable && <p className="mt-2 text-sm text-gray-600">No grouping variable yet. Run Statistics stays disabled until you choose one.</p>}
          <DecisionExplainer decisionId="plan.grouping-variable" context={educationContext} />
        </div>

        <div>
          <label className="block font-medium mb-1">Sort table columns by:</label>
          <p className="mb-2 text-sm text-gray-600">
            This controls the order of the table columns for the grouping variable. Use value order for numeric codes, frequency for common-first tables, or custom order for journal-specific presentation.
          </p>
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-1">
              <input type="radio" name="sortOption" checked={sortOption === 'default'} onChange={() => setSortOption('default')} />
              <span>Default</span>
            </label>
            <label className="flex items-center space-x-1">
              <input type="radio" name="sortOption" checked={sortOption === 'freq_desc'} onChange={() => setSortOption('freq_desc')} />
              <span>Frequency (desc)</span>
            </label>
            <label className="flex items-center space-x-1">
              <input type="radio" name="sortOption" checked={sortOption === 'val_asc'} onChange={() => setSortOption('val_asc')} />
              <span>Value (asc)</span>
            </label>
            <label className="flex items-center space-x-1">
              <input type="radio" name="sortOption" checked={sortOption === 'custom'} onChange={() => setSortOption('custom')} />
              <span>Custom…</span>
            </label>
          </div>
          {sortOption === 'custom' && (
            <div className="mt-2">
              <label className="mb-1 block text-sm font-medium" htmlFor="custom-group-order">Custom group order</label>
              <textarea
                id="custom-group-order"
                className="w-full border p-2 rounded text-sm" 
                rows={3} 
                placeholder="Type one group label per line"
                value={customSortOrder}
                onChange={(e) => setCustomSortOrder(e.target.value)}
              />
              <p className="mt-1 text-xs text-gray-600">Labels must match the data exactly (case-sensitive).</p>
            </div>
          )}
          <DecisionExplainer decisionId="plan.group-order" context={educationContext} />
        </div>
        {groupPreview.length >= 12 && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">This grouping variable has {groupPreview.length} levels. Columns will be wide, and with more than two groups the app uses ANOVA / Kruskal-Wallis for numeric rows. Consider whether it is better shown as a row.</p>}
        {smallGroups.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"><h3 className="font-semibold">Very small group sizes</h3><p>{smallGroups.length} of {groupPreview.length} groups have fewer than 10 participants ({smallGroups.map((group) => `${group.label} n=${group.n}`).join(", ")}). Group-level estimates and tests may be unstable.</p><p className="mt-1">Remedy: combine sparse groups in your source data or choose a different grouping variable.</p></div>}
        {planFindings.length > 0 && <div className="space-y-3">{planFindings.map((f) => <div key={f.checkId} className={`rounded-lg border p-3 text-sm ${f.tier === "blocking" ? "border-red-200 bg-red-50 text-red-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}><h3 className="mb-1 font-semibold">{f.title}</h3><p className="mb-2">{f.detail}</p><p className="text-xs italic">Remedy: {f.remedy}</p>{f.tier === "review" && <label className="mt-3 flex items-start gap-2 font-medium"><input type="checkbox" checked={planAcked} onChange={(e) => setPlanAcked(e.target.checked)} className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500" /><span>I acknowledge this group size warning and want to proceed</span></label>}</div>)}</div>}
      </section>

      <section className="rounded-[14px] border border-gray-200 bg-white p-[18px] shadow-sm"><h2 className="text-[14.5px] font-semibold">Choose Variables</h2><p className="mb-3.5 text-[13px] text-gray-600">Tick the variables to include in Table 1.</p>
        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block font-medium text-gray-900">Choose Variables</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAllVariables}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Select all
                </button>
                <button
                  type="button"
                  onClick={clearAllVariables}
                  className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                >
                  Clear all
                </button>
              </div>
            </div>
            <div className="mt-2 grid max-h-64 grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-x-3.5 gap-y-1.5 overflow-y-auto">
              {selectableVariables.map(c => {
                if (c.name === groupingVariable) return null;
                const isChecked = includedVariables.includes(c.name);
                return (
                  <label key={c.name} className="flex items-center gap-2 rounded-lg px-2 py-[5px] text-[13px] hover:bg-gray-100 cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={isChecked}
                      onChange={() => toggleIncluded(c.name)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                    />
                    <span className="text-sm font-medium text-gray-700" title={c.name}>
                      {getColumnDiagnosticLabel(c)} ({c.confirmedType})
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block font-medium text-gray-900 mb-1">Table Rows Order (Drag to Reorder)</label>
            <p className="mb-2 text-xs text-gray-500">Rows appear in Table 1 in this order. Use the arrows to move a row to the top, up, down or to the bottom.</p>
            {includedVariables.length === 0 ? (
              <div className="h-64 flex items-center justify-center border-2 border-dashed border-gray-200 rounded-lg text-sm text-gray-400 bg-gray-50/20">
                No variables selected.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                {includedVariables.map((v, index) => {
                  const col = schema.columns.find(c => c.name === v);
                  const isBinary = col?.confirmedType === "binary";
                  const options = isBinary ? displayLevelOptionsFor(v) : [];
                  const defaultLevel = isBinary ? defaultDisplayLevelFor(v) : "";
                  const selectedLevel = displayLevelOverrides[v] ?? defaultLevel;
                  return (
                    <div
                      key={v}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDrop={(e) => handleDrop(e, index)}
                      className="mb-1.5 flex flex-wrap items-center gap-2 rounded-[10px] border border-gray-200 bg-white px-2 py-1.5 cursor-grab active:cursor-grabbing select-none"
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                          <svg className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                          </svg>
                          <span className="min-w-[120px] flex-1 break-words text-[13px] font-semibold text-gray-800" title={v}>
                            {displayNameFor(v)}
                          </span>
                          <span className="text-xs text-gray-400">({col?.confirmedType ?? "unknown"})</span>
                        </div>
                        {isBinary && options.length > 0 && (
                          <div className="ml-2 flex shrink-0 items-center gap-1 text-xs">
                            <label
                              htmlFor={`display-level-${v}`}
                              className="text-gray-500"
                              title="Which level of this binary variable is reported as the summarized row in Table 1."
                            >
                              Displayed level
                            </label>
                            <select
                              id={`display-level-${v}`}
                              value={String(selectedLevel)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                const nextValue = event.target.value;
                                if (String(nextValue) === String(defaultLevel)) {
                                  setDisplayLevelOverrides(prev => {
                                    const copy = { ...prev };
                                    delete copy[v];
                                    return copy;
                                  });
                                } else {
                                  setDisplayLevelOverrides(prev => ({ ...prev, [v]: nextValue }));
                                }
                              }}
                              className="max-w-32 rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                            >
                              {options.map((level) => (
                                <option key={String(level)} value={String(level)}>
                                  {resolveLevelLabel(String(level), col)}
                                  {String(level) === String(defaultLevel) ? " (default)" : ""}
                                </option>
                              ))}
                            </select>
                            {displayLevelOverrides[v] !== undefined && (
                              <button
                                type="button"
                                onClick={() => setDisplayLevelOverrides(prev => {
                                  const copy = { ...prev };
                                  delete copy[v];
                                  return copy;
                                })}
                                className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                              >
                                Reset
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          type="button"
                          onClick={() => moveToTop(index)}
                          disabled={index === 0}
                          className="h-9 w-9 rounded-md text-gray-700 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed sm:h-[26px] sm:w-[26px]"
                          title="Move to Top"
                          aria-label={`Move ${displayNameFor(v)} to top`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5 5 5M7 18l5-5 5 5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveUp(index)}
                          disabled={index === 0}
                          className="h-9 w-9 rounded-md text-gray-700 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed sm:h-[26px] sm:w-[26px]"
                          aria-label={`Move ${displayNameFor(v)} up`}
                          title="Move Up"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDown(index)}
                          disabled={index === includedVariables.length - 1}
                          className="h-9 w-9 rounded-md text-gray-700 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed sm:h-[26px] sm:w-[26px]"
                          aria-label={`Move ${displayNameFor(v)} down`}
                          title="Move Down"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveToBottom(index)}
                          disabled={index === includedVariables.length - 1}
                          className="h-9 w-9 rounded-md text-gray-700 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed sm:h-[26px] sm:w-[26px]"
                          title="Move to Bottom"
                          aria-label={`Move ${displayNameFor(v)} to bottom`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 13l5 5 5-5M7 6l5 5 5-5" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <DecisionExplainer decisionId="plan.variable-order" context={educationContext} />
      </section>

      <section className="rounded-[14px] border border-gray-200 bg-white p-[18px] shadow-sm space-y-2"><h2 className="text-[14.5px] font-semibold">Show SMD and P-value</h2>
        <div className="space-y-2">
          <div className="flex space-x-6">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showPValue}
                onChange={(e) => {
                  setShowPValue(e.target.checked);
                  if (!e.target.checked) {
                    setPValuesShownNotice(false);
                  }
                }}
              />
              <span>Show P-value<small className="block text-xs text-gray-600">From the appropriate test for each row. On by default.</small></span>
            </label>
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showSMD}
                onChange={(e) => {
                  const checked = e.target.checked;
                  setShowSMD(checked);
                  if (!checked && (pendingHidePValueColumn || plan?.userOverrides?.hidePValueColumn)) {
                    setPendingHidePValueColumn(false);
                    setPValuesShownNotice(true);
                    if (plan?.userOverrides?.hidePValueColumn) {
                      const nextOverrides = { ...(plan.userOverrides ?? {}) };
                      delete nextOverrides.hidePValueColumn;
                      setPlan({
                        ...plan,
                        showSMD: false,
                        userOverrides: nextOverrides,
                      });
                    }
                  } else if (checked) {
                    setPValuesShownNotice(false);
                  }
                }}
              />
              <span>Show <GlossaryTerm term="SMD" /><small className="block text-xs text-gray-600">Standardized mean difference: size of the baseline difference, independent of sample size.</small></span>
            </label>
          </div>
          {pValuesShownNotice && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 max-w-3xl">
              P values will be shown, because standardised differences are switched off.
            </p>
          )}
          {studyDesign === "observational" && !showSMD && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded p-2 max-w-3xl">
              Comparing treatment or exposure groups in an observational study? SMD is the standard way to show group balance — see “When should I show SMD?”.
            </p>
          )}
          <p className="max-w-3xl text-sm text-gray-600">
            {SMD_WHEN_TO_USE_HEADLINE}
          </p>
          <details className="max-w-3xl text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded p-3 space-y-2">
            <summary className="font-medium cursor-pointer text-gray-800">
              When should I show SMD?
            </summary>
            <div className="mt-2 space-y-2">
              <div>
                <p className="font-semibold text-gray-800">Use SMD when:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {SMD_USE_WHEN.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-800">Usually not needed when:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {SMD_USUALLY_NOT_NEEDED.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-gray-500 italic mt-2">
                {SMD_CAVEAT}
              </p>
            </div>
          </details>
        </div>

      </section>
      <section className="rounded-[14px] border border-gray-200 bg-white p-[18px] shadow-sm space-y-3"><h2 className="text-[14.5px] font-semibold">Multiple Testing Correction</h2>
        <div>
          <label htmlFor="mtc-select" className="block font-medium mb-1">Multiple Testing Correction</label>
          <select 
            id="mtc-select"
            aria-label="Multiple Testing Correction"
            value={mtc}
            onChange={e => setMtc(e.target.value as any)}
            className="border p-2 rounded"
          >
            <option value="none">No correction</option>
            <option value="bonferroni">Bonferroni</option>
            <option value="holm">Holm</option>
            <option value="bh">Benjamini-Hochberg (false discovery rate)</option>
          </select>
          <p className="mt-2 text-xs text-gray-600">{mtcHint[mtc]}</p>
          {mtc !== "none" && showPValue && <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">An advisory appears in Statistical review if the selected correction changes which rows are significant.</p>}
          {mtcAdvice && (
            <div className={`mt-2 max-w-3xl rounded p-3 text-sm ${
              mtcAdvice.severity === "strong"
                ? "border border-red-300 bg-red-50 text-red-700 font-bold"
                : "border border-amber-300 bg-amber-50 text-amber-800"
            }`}>
              {mtcAdvice.message}
              {mtcAdvice.severity === "strong" && (
                <span> For a baseline Table 1 of a randomized trial, see the note about omitting P-values on the Statistical Review step.</span>
              )}
            </div>
          )}
        </div>
      </section>
      </div>
      <aside className="space-y-4">
        <section className="rounded-[14px] border border-gray-200 bg-white p-[18px] shadow-sm"><h2 className="mb-3 text-[14.5px] font-semibold">How tests are chosen</h2><p className="mb-3 text-[13px] text-gray-600">Automatic, from the journal ruleset. {groupPreview.length ? `For ${groupPreview.length} groups:` : "Choose a grouping variable to see the tests."}</p>{groupPreview.length > 0 && <ul className="grid gap-1.5 text-[13px]"><li className="grid grid-cols-[150px_1fr] gap-2.5 border-t border-gray-200 py-1.5"><b>Numeric rows</b><span>{groupPreview.length === 2 ? "Welch's t-test (normal) · Mann-Whitney U (non-normal)" : "ANOVA (normal) · Kruskal-Wallis (non-normal)"}</span></li><li className="grid grid-cols-[150px_1fr] gap-2.5 border-t border-gray-200 py-1.5"><b>Yes/No and category rows</b><span>Chi-square · Fisher's exact (any expected cell &lt; 5)</span></li><li className="grid grid-cols-[150px_1fr] gap-2.5 border-t border-gray-200 py-1.5"><b>Ordered category rows</b><span>{groupPreview.length === 2 ? "Mann-Whitney U (ordered categories)" : "Kruskal-Wallis (ordered categories)"}</span></li></ul>}<p className="mt-3 text-xs text-gray-600">Normality: Shapiro-Wilk for small samples; skewness and kurtosis for large samples. You can override the test per variable in Statistical review.</p></section>
        <section className="rounded-[14px] border border-gray-200 bg-white p-[18px] shadow-sm"><h2 className="mb-3 text-[14.5px] font-semibold">Table summary</h2><dl className="divide-y divide-gray-200 text-[13.5px]"><div className="flex justify-between py-2"><dt className="text-gray-600">Groups</dt><dd className="font-medium text-right">{groupPreview.length ? `${displayNameFor(groupingVariable)} (${groupPreview.length})` : "None"}</dd></div><div className="flex justify-between py-2"><dt className="text-gray-600">Variables</dt><dd className="font-medium">{includedVariables.length}</dd></div><div className="flex justify-between py-2"><dt className="text-gray-600">Columns shown</dt><dd className="font-medium">{showSMD && showPValue ? "SMD + P-value" : showSMD ? "SMD" : showPValue ? "P-value" : "Neither"}</dd></div><div className="flex justify-between py-2"><dt className="text-gray-600">Correction</dt><dd className="font-medium">{({none:"None", bonferroni:"Bonferroni", holm:"Holm", bh:"Benjamini-Hochberg"})[mtc]}</dd></div></dl></section>
      </aside></div>
      )}

      {loading && (
        <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900" role="status" aria-live="polite">
          <div className="font-semibold">Computing Table 1 in your browser…</div>
          <p className="mt-1">
            Large datasets can take a while because the analysis uses this device's CPU and memory. You can stop waiting by going back or navigating away from this step; EasyTableOne will ignore the in-progress result.
          </p>
        </div>
      )}

      <StepActionBar
        onBack={loading ? cancelRunAndGoBack : () => setStage(5)}
        backLabel="Back"
        status={loading ? { tone: "info", text: "Computing in browser…" } : runReason ? { tone: "warn", text: runReason } : { tone: "ok", text: "Ready to run" }}
        engineReady={engineReady}
        engineError={engineError}
        primary={{ label: loading ? "Computing in browser…" : "Run Statistics", onClick: handleRun, disabledReason: loading ? "Analysis is already running" : runReason, needsEngine: !loading && !runReason, testId: "plan-run-statistics" }}
      />
    </div>
  );
}
