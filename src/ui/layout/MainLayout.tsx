import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../../store";
import { pyodideClient } from "../../workers/pyodide.client";
import FormatExportStage from "../pages/FormatExportStage";
import ImportStage from "../pages/ImportStage";
import ModelingStage from "../pages/ModelingStage";
import PlanStage from "../pages/PlanStage";
import QAStage from "../pages/QAStage";
import SchemaStage from "../pages/SchemaStage";
import StatsPreviewStage from "../pages/StatsPreviewStage";
import AboutModal from "../components/AboutModal";
import FaqModal from "../components/FaqModal";
import TutorialModal from "../components/TutorialModal";
import WelcomeModal, { WELCOME_SEEN_KEY } from "../components/WelcomeModal";
import ExplanationDepthToggle from "../components/ExplanationDepthToggle";
import AppFooter from "./AppFooter";
import { useFocusTrap } from "../hooks/useFocusTrap";

const RAIL_GROUPS = [
  { label: "1. Import data", stages: [1, 2, 3], target: 1 },
  { label: "2. Variable types", stages: [4], target: 4 },
  { label: "3. Data checks", stages: [5], target: 5 },
  { label: "4. Analysis plan", stages: [6], target: 6 },
  { label: "5. Statistical review", stages: [7], target: 7 },
  { label: "6. Modeling (optional)", stages: [8], target: 8 },
  { label: "7. Format and export", stages: [9], target: 9 },
];

const STAGE_DISPLAY_LABELS: Record<number, string> = {
  1: "1. Import data",
  2: "1. Import data",
  3: "1. Import data",
  4: "2. Variable types",
  5: "3. Data checks",
  6: "4. Analysis plan",
  7: "5. Statistical review",
  8: "6. Modeling (optional)",
  9: "7. Format and export",
};

const STAGE_GATE_HINTS: Record<number, string> = {
  2: "Upload a dataset first",
  3: "Choose the sheet and header first",
  4: "Review the data dictionary first",
  5: "Confirm variable types first",
  6: "Run the data checks before planning",
  7: "Set up your plan first",
  8: "Complete statistical review first",
  9: "Complete statistical review first",
};

function groupIndexForStage(stage: number) {
  return Math.max(0, RAIL_GROUPS.findIndex((group) => group.stages.includes(stage)));
}

export default function MainLayout() {
  const { stage, setStage, includeInputDataHashInRepro, setIncludeInputDataHashInRepro, setTutorialOpen, setFaqOpen, setAboutOpen, setWelcomeOpen, modelingEnabled, setModelingEnabled, stats } = useStore();
  const [pyodideReady, setPyodideReady] = React.useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpenRef = useRef(false);

  const closeDrawer = React.useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const saveSession = React.useCallback(() => {
    const state = useStore.getState();
    const generatedAt = new Date().toISOString();
    const snapshot = {
      schemaVersion: 1,
      app: "EasyTableOne",
      generatedAt,
      note: "Session restore is planned; this JSON captures the current browser-only analysis state for local recordkeeping and future import.",
      sourceFile: state.file
        ? {
            name: state.file.name,
            size: state.file.size,
            type: state.file.type,
            lastModified: state.file.lastModified,
          }
        : null,
      stage: state.stage,
      sheets: state.sheets,
      selectedSheet: state.selectedSheet,
      headerRowIndex: state.headerRowIndex,
      data: state.data,
      schema: state.schema,
      qaReport: state.qaReport,
      outlierActions: state.outlierActions,
      plan: state.plan,
      draftGroupingVariable: state.draftGroupingVariable,
      researchPopulation: state.researchPopulation,
      unitSystem: state.unitSystem,
      stats: state.stats,
      journalId: state.journalId,
      includeInputDataHashInRepro: state.includeInputDataHashInRepro,
      auditLog: state.auditLog,
      dataQualityFindings: state.dataQualityFindings,
      dataQualityRecords: state.dataQualityRecords,
      dismissedPolishFindings: Array.from(state.dismissedPolishFindings),
      edaResults: state.edaResults,
      modelingEnabled: state.modelingEnabled,
      modelingSetup: state.modelingSetup,
      modelingResults: state.modelingResults,
      explanationDepth: state.explanationDepth,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `easytableone_session_${generatedAt.replace(/[:.]/g, "-")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  useFocusTrap(drawerRef, drawerOpen, closeDrawer);
  useFocusTrap(settingsRef, showSettings, React.useCallback(() => setShowSettings(false), []));

  React.useEffect(() => {
    let mounted = true;
    pyodideClient
      .isReady()
      .then(() => {
        if (mounted) setPyodideReady(true);
      })
      .catch(console.error);
    return () => {
      mounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.localStorage.getItem(WELCOME_SEEN_KEY)) {
      setWelcomeOpen(true);
    }
  }, [setWelcomeOpen]);

  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [stage]);

  useEffect(() => {
    if (drawerOpen) {
      drawerWasOpenRef.current = true;
      return;
    }

    if (drawerWasOpenRef.current) {
      drawerWasOpenRef.current = false;
      hamburgerRef.current?.focus();
    }
  }, [drawerOpen]);

  const renderStageRail = (closeAfterNavigate = false) => (
    <>
      <nav className="flex-1 overflow-y-auto p-4 space-y-2">
        {RAIL_GROUPS.map((group) => {
          const groupMaxStage = Math.max(...group.stages);
          const num = group.target;
          const isActive = group.stages.includes(stage);
          const isFuture = stage < Math.min(...group.stages);
          const modelingAvailable = stats !== null;
          const isModelingOptIn = groupMaxStage === 8 && modelingAvailable && !modelingEnabled;
          const isDisabled = (isFuture && !isModelingOptIn) || (groupMaxStage === 8 && !modelingAvailable);
          const gateHint = isDisabled ? STAGE_GATE_HINTS[groupMaxStage] : undefined;
          const hintId = `stage-${num}-gate-hint-${closeAfterNavigate ? "drawer" : "rail"}`;
          return (
            <button
              key={group.label}
              onClick={() => {
                if (isModelingOptIn) {
                  setModelingEnabled(true);
                  setStage(8);
                  if (closeAfterNavigate) closeDrawer();
                  return;
                }
                if (!isFuture) {
                  setStage(group.target);
                  if (closeAfterNavigate) closeDrawer();
                }
              }}
              disabled={isDisabled}
              aria-current={isActive ? "step" : undefined}
              aria-describedby={gateHint ? hintId : undefined}
              title={gateHint}
              className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                isActive ? "bg-blue-50 text-blue-700 font-bold" : isModelingOptIn ? "text-gray-500 border border-dashed border-gray-300 hover:bg-gray-50" : isDisabled ? "text-gray-400 cursor-not-allowed" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="flex items-center gap-2">
                <span aria-hidden="true" className="inline-block w-3 text-center">{isActive ? ">" : !isFuture || isModelingOptIn ? "*" : ""}</span>
                <span>
                  {group.label}
                </span>
              </span>
              {gateHint && <span id={hintId} className="sr-only">{gateHint}</span>}
              {isModelingOptIn && <span className="mt-1 block pl-5 text-xs font-normal text-blue-600">Enable modeling</span>}
            </button>
          );
        })}
      </nav>
      <div data-testid="stage-rail-bottom" className="p-4 border-t border-gray-200 flex items-center gap-2">
        <button
          onClick={() => {
            setShowSettings(true);
            if (closeAfterNavigate) closeDrawer();
          }}
          className="flex items-center text-sm text-gray-600 hover:text-gray-900 flex-1"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Settings
        </button>
      </div>
    </>
  );

  const currentGroupIndex = groupIndexForStage(stage);
  const currentGroupStep = currentGroupIndex + 1;

  return (
    <div className="flex h-full min-h-0 bg-gray-50 overflow-hidden">
      <aside className="hidden w-64 bg-white border-r border-gray-200 md:flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">EasyTableOne</h1>
          <div className="mt-2 flex items-center">
            <span className={`w-3 h-3 rounded-full mr-2 ${pyodideReady ? "bg-green-500" : "bg-yellow-500"}`} />
            <span className="text-sm text-gray-600">
              {pyodideReady ? "Analysis engine ready" : "Starting analysis engine..."}
            </span>
          </div>
        </div>
        {renderStageRail()}
      </aside>

      <main id="main-scroll-container" ref={mainRef} className="min-h-0 flex-1 overflow-y-auto">
        <div data-testid="app-top-bar" className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur md:px-8">
          <button
            ref={hamburgerRef}
            type="button"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            aria-controls="stage-drawer"
            onClick={() => setDrawerOpen(true)}
            className="md:hidden w-9 h-9 flex flex-shrink-0 items-center justify-center rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 md:flex-none">
            <div className="hidden text-sm font-semibold text-gray-900 md:block">{STAGE_DISPLAY_LABELS[stage]}</div>
            <div className="md:hidden">
              <div className="truncate text-sm font-semibold text-gray-900">
                Step {currentGroupStep} / {RAIL_GROUPS.length} - {STAGE_DISPLAY_LABELS[stage]}
              </div>
              <div
                role="progressbar"
                aria-valuenow={currentGroupStep}
                aria-valuemin={1}
                aria-valuemax={RAIL_GROUPS.length}
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-200"
              >
                <div className="h-full rounded-full bg-blue-600" style={{ width: `${(currentGroupStep / RAIL_GROUPS.length) * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="ml-auto flex flex-shrink-0 items-center gap-2 sm:gap-3">
            <ExplanationDepthToggle />
            <button
              id="global-save-session-button"
              onClick={saveSession}
              title="Save session JSON"
              aria-label="Save the current EasyTableOne session as JSON"
              className="h-8 flex flex-shrink-0 items-center justify-center rounded-full bg-blue-50 px-3 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
            >
              Save
            </button>
            <button
              id="global-tutorial-button"
              onClick={() => setTutorialOpen(true)}
              title="Open the EasyTableOne tutorial"
              aria-label="Open tutorial"
              className="h-8 flex flex-shrink-0 items-center justify-center rounded-full bg-blue-50 px-3 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
            >
              Tutorial
            </button>
            <button
              id="global-faq-button"
              onClick={() => setFaqOpen(true)}
              title="Open the EasyTableOne FAQ"
              aria-label="Open FAQ"
              className="h-8 flex flex-shrink-0 items-center justify-center rounded-full bg-blue-50 px-3 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
            >
              FAQ
            </button>
            <button
              id="global-about-button"
              onClick={() => setAboutOpen(true)}
              title="About EasyTableOne"
              aria-label="About EasyTableOne"
              className="h-8 flex flex-shrink-0 items-center justify-center rounded-full bg-blue-50 px-3 text-xs font-bold text-blue-600 transition-colors hover:bg-blue-100"
            >
              About
            </button>
          </div>
        </div>
        <div className="p-4 md:p-8">
          {stage <= 3 && <ImportStage />}
          {stage === 4 && <SchemaStage />}
          {stage === 5 && <QAStage />}
          {stage === 6 && <PlanStage />}
          {stage === 7 && <StatsPreviewStage />}
          {stage === 8 && (modelingEnabled ? <ModelingStage /> : <StatsPreviewStage />)}
          {stage === 9 && <FormatExportStage />}
          <AppFooter />
        </div>
      </main>

      {drawerOpen && (
        <div className="md:hidden">
          <div className="fixed inset-0 z-30 bg-black bg-opacity-40" onClick={closeDrawer} />
          <div
            id="stage-drawer"
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Stages"
            tabIndex={-1}
            className="fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-gray-200 p-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">EasyTableOne</h2>
                <div className="mt-2 flex items-center">
                  <span className={`w-3 h-3 rounded-full mr-2 ${pyodideReady ? "bg-green-500" : "bg-yellow-500"}`} />
                  <span className="text-sm text-gray-600">
                    {pyodideReady ? "Analysis engine ready" : "Starting analysis engine..."}
                  </span>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close navigation"
                onClick={closeDrawer}
                className="flex h-9 w-9 items-center justify-center rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {renderStageRail(true)}
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div
            ref={settingsRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
            tabIndex={-1}
            className="bg-white rounded-lg p-6 max-w-md w-full"
          >
            <h2 id="settings-title" className="text-xl font-bold mb-4">Settings</h2>
            <div className="mb-6">
              <label className="flex items-start">
                <input
                  type="checkbox"
                  className="mt-1 mr-3"
                  checked={includeInputDataHashInRepro}
                  onChange={(e) => setIncludeInputDataHashInRepro(e.target.checked)}
                />
                <span className="text-sm text-gray-700">
                  <strong className="block mb-1">Include input data hash in reproducibility JSON</strong>
                  When enabled, the SHA-256 hash of your input file will be embedded in the reproducibility JSON. This helps verify identity across re-runs but is a fingerprint of your data. Off by default.
                </span>
              </label>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setShowSettings(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <TutorialModal onOpenSettings={() => setShowSettings(true)} />
      <WelcomeModal />
      <AboutModal />
      <FaqModal />
    </div>
  );
}
