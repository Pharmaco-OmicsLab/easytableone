import "./zodConfig.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

if (new URLSearchParams(window.location.search).get("bench") === "1") {
  void import("./workers/pyodide.client.ts").then(({ pyodideClient }) => {
    Object.assign(window, { __etoBench: { getMemoryStats: () => pyodideClient.getMemoryStats() } });
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
