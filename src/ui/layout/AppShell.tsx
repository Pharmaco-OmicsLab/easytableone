import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import AppFooter from "./AppFooter";
import WorkflowRail from "./WorkflowRail";
import TopBar from "./TopBar";
import type { EngineState } from "./useEngineReady";
export interface AppShellProps {
  children: React.ReactNode; stage: number; statsAvailable: boolean; modelingEnabled: boolean; setModelingEnabled: (enabled: boolean) => void; setStage: (stage: number) => void; includeInputDataHashInRepro: boolean; setIncludeInputDataHashInRepro: (value: boolean) => void; settingsOpen: boolean; setSettingsOpen: (open: boolean) => void;
  engine: { state: EngineState; message?: string; retry: () => void }; saveSession: () => void; onTutorial: () => void; onFaq: () => void; onAbout: () => void;
}
export default function AppShell(props: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null); const settingsRef = useRef<HTMLDivElement>(null); const mainRef = useRef<HTMLElement>(null); const hamburgerRef = useRef<HTMLButtonElement>(null); const wasOpen = useRef(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  useFocusTrap(drawerRef, drawerOpen, closeDrawer);
  useFocusTrap(settingsRef, props.settingsOpen, useCallback(() => props.setSettingsOpen(false), [props.setSettingsOpen]));
  useEffect(() => {
    if (drawerOpen) wasOpen.current = true;
    else if (wasOpen.current) { wasOpen.current = false; hamburgerRef.current?.focus(); }
  }, [drawerOpen]);
  useEffect(() => { if (mainRef.current) mainRef.current.scrollTop = 0; }, [props.stage]);
  return <div className="grid h-full min-h-0 grid-cols-1 overflow-hidden bg-gray-50 lg:grid-cols-[272px_minmax(0,1fr)]">
    <a href="#main" className="sr-only z-[70] rounded bg-white p-3 text-blue-700 focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Skip to main content</a>
    <div className="hidden min-h-0 lg:flex"><WorkflowRail {...props} setSettingsOpen={props.setSettingsOpen} /></div>
    <main id="main" ref={mainRef} tabIndex={-1} className="min-h-0 overflow-y-auto focus:outline-none"><div className="mx-auto w-full max-w-[1120px] px-4 pt-6 sm:px-6 lg:px-8"><TopBar {...props} hamburgerRef={hamburgerRef} onOpenDrawer={() => setDrawerOpen(true)} drawerOpen={drawerOpen} /><div id="main-scroll-container" className="pt-6">{props.children}<AppFooter /></div></div></main>
    {drawerOpen && <div className="fixed inset-0 z-40 lg:hidden"><div className="absolute inset-0 bg-gray-900/40" onClick={closeDrawer} /><div id="stage-drawer" ref={drawerRef} role="dialog" aria-modal="true" aria-label="Workflow" tabIndex={-1} className="absolute inset-y-0 left-0 flex w-[272px] max-w-[85vw] flex-col bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-200 px-4 py-3"><span className="text-sm font-semibold text-gray-900">Workflow</span><button type="button" onClick={closeDrawer} aria-label="Close navigation" className="h-9 w-9 rounded-lg border border-gray-300 text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">×</button></div><div className="flex min-h-0 flex-1 flex-col"><WorkflowRail {...props} variant="drawer" setSettingsOpen={props.setSettingsOpen} closeAfterNavigate closeDrawer={closeDrawer} /></div></div></div>}
    {props.settingsOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) props.setSettingsOpen(false); }}><div ref={settingsRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="settings-title" className="w-full max-w-md rounded-2xl bg-white shadow-xl"><div className="flex items-center justify-between border-b border-gray-200 px-6 py-4"><h2 id="settings-title" className="text-lg font-bold text-gray-900">Settings</h2><button type="button" aria-label="Close Settings" onClick={() => props.setSettingsOpen(false)} className="h-9 w-9 rounded-lg text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">×</button></div><div className="max-h-[80vh] overflow-auto p-6"><label className="flex items-start gap-3"><input type="checkbox" className="mt-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" checked={props.includeInputDataHashInRepro} onChange={(e) => props.setIncludeInputDataHashInRepro(e.target.checked)} /><span className="text-sm text-gray-700"><strong className="block mb-1">Include input data hash in reproducibility JSON</strong>When enabled, the SHA-256 hash of your input file will be embedded in the reproducibility JSON. This helps verify identity across re-runs but is a fingerprint of your data. Off by default.</span></label></div><div className="flex justify-end border-t border-gray-200 px-6 py-4"><button type="button" onClick={() => props.setSettingsOpen(false)} className="min-h-9 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">Done</button></div></div></div>}
  </div>;
}
