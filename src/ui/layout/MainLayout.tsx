import { useCallback, useEffect, useState } from "react";
import { useStore } from "../../store";
import ImportStage from "../pages/ImportStage";
import ModelingStage from "../pages/ModelingStage";
import PlanStage from "../pages/PlanStage";
import QAStage from "../pages/QAStage";
import SchemaStage from "../pages/SchemaStage";
import StatsPreviewStage from "../pages/StatsPreviewStage";
import FormatExportStage from "../pages/FormatExportStage";
import TutorialModal from "../components/TutorialModal";
import WelcomeModal, { WELCOME_SEEN_KEY } from "../components/WelcomeModal";
import AboutModal from "../components/AboutModal";
import FaqModal from "../components/FaqModal";
import AppShell from "./AppShell";
import ToastProvider from "./Toast";
import { useEngineReady } from "./useEngineReady";

export default function MainLayout() {
  const state = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const engine = useEngineReady();
  const saveSession = useCallback(() => {
    const snapshot = useStore.getState();
    const generatedAt = new Date().toISOString();
    const archive = {
      schemaVersion: 1, app: "EasyTableOne", generatedAt,
      note: "Session restore is planned; this JSON captures the current browser-only analysis state for local recordkeeping and future import.",
      sourceFile: snapshot.file ? { name: snapshot.file.name, size: snapshot.file.size, type: snapshot.file.type, lastModified: snapshot.file.lastModified } : null,
      stage: snapshot.stage, sheets: snapshot.sheets, selectedSheet: snapshot.selectedSheet, headerRowIndex: snapshot.headerRowIndex,
      data: snapshot.data, schema: snapshot.schema, qaReport: snapshot.qaReport, outlierActions: snapshot.outlierActions, plan: snapshot.plan,
      draftGroupingVariable: snapshot.draftGroupingVariable, researchPopulation: snapshot.researchPopulation, unitSystem: snapshot.unitSystem,
      stats: snapshot.stats, journalId: snapshot.journalId, includeInputDataHashInRepro: snapshot.includeInputDataHashInRepro,
      auditLog: snapshot.auditLog, dataQualityFindings: snapshot.dataQualityFindings, dataQualityRecords: snapshot.dataQualityRecords,
      dismissedPolishFindings: Array.from(snapshot.dismissedPolishFindings), edaResults: snapshot.edaResults, modelingEnabled: snapshot.modelingEnabled,
      modelingSetup: snapshot.modelingSetup, modelingResults: snapshot.modelingResults, explanationDepth: snapshot.explanationDepth,
    };
    const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `easytableone_session_${generatedAt.replace(/[:.]/g, "-")}.json`; link.click(); URL.revokeObjectURL(url);
  }, []);
  useEffect(() => { if (typeof window !== "undefined" && !window.localStorage.getItem(WELCOME_SEEN_KEY)) state.setWelcomeOpen(true); }, [state.setWelcomeOpen]);
  return <ToastProvider><AppShell stage={state.stage} statsAvailable={state.stats !== null} modelingEnabled={state.modelingEnabled} setModelingEnabled={state.setModelingEnabled} setStage={state.setStage}
      includeInputDataHashInRepro={state.includeInputDataHashInRepro} setIncludeInputDataHashInRepro={state.setIncludeInputDataHashInRepro} engine={engine} saveSession={saveSession}
      settingsOpen={settingsOpen} setSettingsOpen={setSettingsOpen}
      onTutorial={() => state.setTutorialOpen(true)} onFaq={() => state.setFaqOpen(true)} onAbout={() => state.setAboutOpen(true)}>
      {state.stage <= 3 && <ImportStage />}{state.stage === 4 && <SchemaStage />}{state.stage === 5 && <QAStage />}{state.stage === 6 && <PlanStage engineReady={engine.state === "ready"} engineError={engine.state === "error"} />}
      {state.stage === 7 && <StatsPreviewStage />}{state.stage === 8 && (state.modelingEnabled ? <ModelingStage /> : <StatsPreviewStage />)}{state.stage === 9 && <FormatExportStage engineReady={engine.state === "ready"} engineError={engine.state === "error"} />}
    </AppShell><TutorialModal onOpenSettings={() => setSettingsOpen(true)} /><WelcomeModal /><AboutModal /><FaqModal /></ToastProvider>;
}
