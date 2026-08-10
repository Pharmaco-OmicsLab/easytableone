import { create } from "zustand";
import type { SheetInfo } from "./core/parser/xlsx";
import type { AnalysisPlan, AuditEntry, DataFrame, DataQualityReport, Schema, SchemaColumn, StatisticalResults, DataQualityFinding, DataQualityRecord, StudyDesign } from "./core/types";
import type { EDAResults } from "./core/eda/types";
import type { ModelingResults, ModelingSetup } from "./core/modeling/types";
import type { ExplanationDepth } from "./core/education/educationTypes";
import type { ResearchPopulation, UnitSystem } from "./core/bounds/boundsChecker";
import { POLISH_REGISTRY } from "./core/qa/polishRegistry";
import type { PolishFinding } from "./core/qa/polishRegistry";
import { computeModelingFingerprint } from "./core/modeling/types";

function computeDataFingerprint(data: DataFrame | null): string {
  if (!data) return "no-data";
  return JSON.stringify({
    columns: data.columns.map((c) => c.name),
    rows: data.rows,
  });
}

function computePlanModelingFingerprint(plan: AnalysisPlan | null): string {
  if (!plan) return "no-plan";
  return JSON.stringify({
    groupingVariable: plan.groupingVariable ?? null,
    randomSeed: plan.randomSeed ?? null,
    includedVariables: plan.includedVariables ?? [],
  });
}

function computeSetupFingerprint(setup: ModelingSetup | null): string {
  if (!setup) return "no-setup";
  return JSON.stringify({
    outcome: setup.outcome,
    predictors: setup.predictors,
    referenceLevels: setup.referenceLevels,
    imputation: setup.imputation,
    goal: setup.goal,
    seed: setup.seed,
    model: setup.model,
    lambdaRule: setup.lambdaRule,
    validationB: setup.validationB,
    ciBootstrapB: setup.ciBootstrapB,
    fastMode: setup.fastMode,
    validationCiMethod: setup.validationCiMethod,
  });
}

interface AppState {
  stage: number;
  setStage: (stage: number) => void;

  file: File | null;
  setFile: (file: File | null) => void;

  // XLSX specific
  sheets: SheetInfo[];
  setSheets: (sheets: SheetInfo[]) => void;
  selectedSheet: string | null;
  setSelectedSheet: (sheet: string | null) => void;

  headerRowIndex: number;
  setHeaderRowIndex: (idx: number) => void;

  data: DataFrame | null;
  setData: (data: DataFrame | null) => void;

  schema: Schema | null;
  setSchema: (schema: Schema | null) => void;
  updateSchemaColumn: (name: string, update: Partial<SchemaColumn>) => void;
  edaResults: EDAResults | null;
  setEdaResults: (results: EDAResults | null) => void;
  modelingEnabled: boolean;
  setModelingEnabled: (enabled: boolean) => void;
  modelingSetup: ModelingSetup | null;
  setModelingSetup: (setup: ModelingSetup | null) => void;
  modelingResults: ModelingResults | null;
  setModelingResults: (results: ModelingResults | null) => void;

  qaReport: DataQualityReport | null;
  setQaReport: (report: DataQualityReport | null) => void;

  outlierActions: Record<string, import("./core/types").OutlierAction[]>;
  setOutlierAction: (col: string, action: import("./core/types").OutlierAction) => void;

  plan: AnalysisPlan | null;
  setPlan: (plan: AnalysisPlan | null) => void;
  draftGroupingVariable: string | null;
  setDraftGroupingVariable: (variable: string | null) => void;
  researchPopulation: ResearchPopulation;
  setResearchPopulation: (population: ResearchPopulation) => void;
  studyDesign: StudyDesign;
  setStudyDesign: (studyDesign: StudyDesign) => void;
  unitSystem: UnitSystem;
  setUnitSystem: (unitSystem: UnitSystem) => void;

  stats: StatisticalResults | null;
  setStats: (stats: StatisticalResults | null) => void;

  journalId: string;
  setJournalId: (id: string) => void;

  error: string | null;
  setError: (err: string | null) => void;

  includeInputDataHashInRepro: boolean;
  setIncludeInputDataHashInRepro: (val: boolean) => void;

  auditLog: AuditEntry[];
  setAuditLog: (log: AuditEntry[]) => void;
  addAuditEntry: (action: string, details?: AuditEntry["details"]) => void;

  dataQualityFindings: DataQualityFinding[];
  setDataQualityFindings: (findings: DataQualityFinding[]) => void;
  dataQualityRecords: DataQualityRecord[];
  setDataQualityRecords: (records: DataQualityRecord[]) => void;

  dismissedPolishFindings: Set<string>;
  dismissPolishFinding: (finding: PolishFinding, canonicalValue?: string) => void;
  clearDismissedPolishFindings: () => void;
  ordinalReorderFocusColumn: string | null;
  setOrdinalReorderFocusColumn: (col: string | null) => void;
  applyPolishFinding: (finding: PolishFinding, canonical?: string) => void;

  tutorialOpen: boolean;
  setTutorialOpen: (open: boolean) => void;
  faqOpen: boolean;
  setFaqOpen: (open: boolean) => void;
  aboutOpen: boolean;
  setAboutOpen: (open: boolean) => void;
  welcomeOpen: boolean;
  setWelcomeOpen: (open: boolean) => void;

  explanationDepth: ExplanationDepth;
  setExplanationDepth: (depth: ExplanationDepth) => void;
}

export const useStore = create<AppState>((set) => ({
  stage: 1,
  setStage: (stage) => set({ stage }),

  file: null,
  setFile: (file) => set({ file }),

  sheets: [],
  setSheets: (sheets) => set({ sheets }),
  selectedSheet: null,
  setSelectedSheet: (selectedSheet) => set({ selectedSheet }),

  headerRowIndex: 0,
  setHeaderRowIndex: (headerRowIndex) => set({ headerRowIndex }),

  data: null,
  setData: (data) =>
    set((state) => {
      const changed = computeDataFingerprint(state.data) !== computeDataFingerprint(data);
      return changed ? { data, edaResults: null, modelingSetup: null, modelingResults: null } : { data };
    }),

  schema: null,
  setSchema: (schema) =>
    set((state) => {
      const changed = computeModelingFingerprint(state.data, state.schema) !== computeModelingFingerprint(state.data, schema);
      return changed ? { schema, edaResults: null, modelingSetup: null, modelingResults: null } : { schema };
    }),
  updateSchemaColumn: (name, update) =>
    set((state) => {
      if (!state.schema) return state;
      const oldFingerprint = computeModelingFingerprint(state.data, state.schema);
      const columns = state.schema.columns.map((c) => (
        c.name === name ? { ...c, ...update } : c
      ));
      const schema = { ...state.schema, columns };
      const changed = oldFingerprint !== computeModelingFingerprint(state.data, schema);
      return changed ? { schema, edaResults: null, modelingSetup: null, modelingResults: null } : { schema };
    }),
  edaResults: null,
  setEdaResults: (edaResults) => set({ edaResults }),
  modelingEnabled: false,
  setModelingEnabled: (modelingEnabled) => set({ modelingEnabled }),
  modelingSetup: null,
  setModelingSetup: (modelingSetup) =>
    set((state) => {
      const existingResultSetup = state.modelingResults?.setup ?? null;
      const changed = computeSetupFingerprint(modelingSetup) !== computeSetupFingerprint(existingResultSetup);
      return changed ? { modelingSetup, modelingResults: null } : { modelingSetup };
    }),
  modelingResults: null,
  setModelingResults: (modelingResults) => set({ modelingResults }),

  qaReport: null,
  setQaReport: (qaReport) => set({ qaReport }),

  outlierActions: {},
  setOutlierAction: (col, action) =>
    set((state) => {
      const existing = state.outlierActions[col] || [];
      const filtered = existing.filter((a) => a.rowIndex !== action.rowIndex);
      filtered.push(action);
      return { outlierActions: { ...state.outlierActions, [col]: filtered } };
    }),

  plan: null,
  setPlan: (plan) =>
    set((state) => {
      const changed = computePlanModelingFingerprint(state.plan) !== computePlanModelingFingerprint(plan);
      return changed ? { plan, modelingResults: null } : { plan };
    }),
  draftGroupingVariable: null,
  setDraftGroupingVariable: (draftGroupingVariable) => set({ draftGroupingVariable }),
  researchPopulation: "adult",
  setResearchPopulation: (researchPopulation) => set({ researchPopulation, edaResults: null }),
  studyDesign: "unspecified",
  setStudyDesign: (studyDesign) => set({ studyDesign }),
  unitSystem: "metric",
  setUnitSystem: (unitSystem) => set({ unitSystem, edaResults: null }),

  stats: null,
  setStats: (stats) => set({ stats }),

  journalId: "NEJM",
  setJournalId: (journalId) => set({ journalId }),

  error: null,
  setError: (error) => set({ error }),

  includeInputDataHashInRepro: false,
  setIncludeInputDataHashInRepro: (val) => set({ includeInputDataHashInRepro: val }),

  auditLog: [],
  setAuditLog: (auditLog) => set({ auditLog }),
  addAuditEntry: (action, details = {}) =>
    set((state) => ({
      auditLog: [
        ...state.auditLog,
        { timestamp: new Date().toISOString(), action, details },
      ],
    })),

  dataQualityFindings: [],
  setDataQualityFindings: (dataQualityFindings) => set({ dataQualityFindings }),
  dataQualityRecords: [],
  setDataQualityRecords: (dataQualityRecords) => set({ dataQualityRecords }),

  dismissedPolishFindings: new Set<string>(),
  dismissPolishFinding: (finding, canonicalValue) =>
    set((state) => {
      const key = `${finding.detectorId}:${finding.variable}:${canonicalValue ?? finding.suggestedCanonical ?? ''}`;
      const next = new Set(state.dismissedPolishFindings);
      next.add(key);

      const timestamp = new Date().toISOString();
      const auditMsg = `Dismissed suggestion: ${finding.detectorId} on column '${finding.variable}'`;
      const nextAuditLog = [
        ...state.auditLog,
        { timestamp, action: auditMsg, details: { detectorId: finding.detectorId, variable: finding.variable, canonicalValue: canonicalValue ?? finding.suggestedCanonical ?? null } }
      ];

      const record: DataQualityRecord = {
        finding: {
          checkId: `${finding.detectorId}_${finding.variable}`,
          tier: 'advisory',
          category: finding.category,
          variable: finding.variable,
          title: finding.title,
          detail: `User dismissed suggestion for ${finding.detectorId} on column '${finding.variable}'`,
          remedy: '',
          affectedCount: finding.affectedCount,
          sampleValues: finding.variants,
          affectedRowsSample: finding.sampleRows,
        },
        response: 'dismissed',
        timestamp,
        fixDetails: canonicalValue ? `Canonical: ${canonicalValue}` : (finding.suggestedCanonical ? `Canonical: ${finding.suggestedCanonical}` : undefined),
      };

      return {
        dismissedPolishFindings: next,
        auditLog: nextAuditLog,
        dataQualityRecords: [...state.dataQualityRecords, record],
      };
    }),
  clearDismissedPolishFindings: () => set({ dismissedPolishFindings: new Set() }),

  ordinalReorderFocusColumn: null,
  setOrdinalReorderFocusColumn: (col) => set({ ordinalReorderFocusColumn: col }),

  applyPolishFinding: (finding, canonical) =>
    set((state) => {
      if (!state.data || !state.schema) return {};

      const detector = POLISH_REGISTRY.find((d) => d.id === finding.detectorId);
      if (!detector) return {};

      const result = detector.apply(state.data, state.schema, finding, canonical);
      const timestamp = new Date().toISOString();

      if (result.applyKind === 'route-to-schema') {
        const auditMsg = `Mixed type encountered: ${result.auditDescriptor}`;
        const nextAuditLog = [
          ...state.auditLog,
          { timestamp, action: auditMsg, details: { detectorId: finding.detectorId, variable: finding.variable } }
        ];
        return {
          auditLog: nextAuditLog,
        };
      }

      if (result.applyKind === 'open-ordinal-ui') {
        const nextColumns = state.schema.columns.map((c) => {
          if (c.name === result.column && c.levels) {
            const sortedLevels = [...c.levels].sort((a, b) => {
              const idxA = result.seedOrder.indexOf(String(a.code));
              const idxB = result.seedOrder.indexOf(String(b.code));
              return idxA - idxB;
            });
            return { ...c, levels: sortedLevels };
          }
          return c;
        });

        const auditMsg = `Open Ordinal UI: ${result.auditDescriptor}`;
        const nextAuditLog = [
          ...state.auditLog,
          { timestamp, action: auditMsg, details: { detectorId: finding.detectorId, variable: finding.variable } }
        ];

        return {
          schema: { ...state.schema, columns: nextColumns },
          ordinalReorderFocusColumn: result.column,
          auditLog: nextAuditLog,
          edaResults: null,
          modelingSetup: null,
          modelingResults: null,
        };
      }

      const auditMsg = `Applied polish: ${result.auditDescriptor}`;
      const nextAuditLog = [
        ...state.auditLog,
        { timestamp, action: auditMsg, details: { detectorId: finding.detectorId, variable: finding.variable, recode: result.recode as any } }
      ];

      const record: DataQualityRecord = {
        finding: {
          checkId: `${finding.detectorId}_${finding.variable}`,
          tier: 'advisory',
          category: finding.category,
          variable: finding.variable,
          title: finding.title,
          detail: `Applied polish fix: ${result.auditDescriptor}`,
          remedy: '',
          affectedCount: finding.affectedCount,
          sampleValues: finding.variants,
          affectedRowsSample: finding.sampleRows,
        },
        response: 'applied',
        timestamp,
        fixDetails: canonical ? `Canonical: ${canonical}` : undefined,
      };

      return {
        data: result.df,
        schema: result.schema,
        auditLog: nextAuditLog,
        dataQualityRecords: [...state.dataQualityRecords, record],
        edaResults: null,
        modelingSetup: null,
        modelingResults: null,
      };
    }),

  tutorialOpen: false,
  setTutorialOpen: (open) => set({ tutorialOpen: open }),
  faqOpen: false,
  setFaqOpen: (open) => set({ faqOpen: open }),
  aboutOpen: false,
  setAboutOpen: (open) => set({ aboutOpen: open }),
  welcomeOpen: false,
  setWelcomeOpen: (open) => set({ welcomeOpen: open }),

  explanationDepth: "concise",
  setExplanationDepth: (explanationDepth) => set({ explanationDepth }),
}));
