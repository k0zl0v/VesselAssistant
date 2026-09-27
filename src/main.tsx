import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { getAutoBackup } from "./autoBackup";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { SessionGate } from "./components/SessionGate";
import { reportError } from "./errorReporting";

window.addEventListener("error", (e) => void reportError("window", e.error ?? e.message));
window.addEventListener("unhandledrejection", (e) => void reportError("unhandledrejection", e.reason));

let autoBackupStarted = false;

function startAutoBackupOnce(): void {
  if (autoBackupStarted) return;
  autoBackupStarted = true;
  getAutoBackup().then(
    (service) => service.startTimer(),
    (e) => reportError("auto-backup", e),
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <SessionGate onStarted={startAutoBackupOnce}>
        <App />
      </SessionGate>
    </ErrorBoundary>
  </React.StrictMode>,
);
