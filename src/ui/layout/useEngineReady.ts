import { useCallback, useEffect, useRef, useState } from "react";
import { pyodideClient } from "../../workers/pyodide.client";

// Keep this aligned with vite.config.ts's Pyodide hookTimeout.
export const ENGINE_READY_TIMEOUT_MS = 180_000;
export type EngineState = "loading" | "ready" | "error";

export function useEngineReady() {
  const [state, setState] = useState<EngineState>("loading");
  const [message, setMessage] = useState<string>();
  const attemptRef = useRef(0);

  const initialize = useCallback(async (restart = false) => {
    const attempt = ++attemptRef.current;
    setState("loading");
    setMessage(undefined);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const isCurrentAttempt = () => attemptRef.current === attempt;
    try {
      const initialization = restart ? pyodideClient.restart() : pyodideClient.isReady();
      timeout = setTimeout(() => {
        if (!isCurrentAttempt()) return;
        setMessage("Initialization timed out after 180 seconds.");
        setState("error");
      }, ENGINE_READY_TIMEOUT_MS);
      const ready = await initialization;
      if (!isCurrentAttempt()) return;
      if (!ready) throw new Error("The engine did not report ready.");
      setMessage(undefined);
      setState("ready");
    } catch (error) {
      if (!isCurrentAttempt()) return;
      setMessage(error instanceof Error ? error.message : String(error));
      setState("error");
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  const retry = useCallback(() => void initialize(true), [initialize]);
  return { state, message, retry };
}
