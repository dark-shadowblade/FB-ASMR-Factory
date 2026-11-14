const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const fs = require("node:fs");

let backendProcess = null;
function recordDiagnostic(source, level, message) {
  const text = String(message).slice(0, 4000);
  writeStartupLog('[' + source + '] [' + level + '] ' + text);
  const dataDir = app.isPackaged ? path.join(app.getPath('userData'), 'data') : path.resolve(__dirname, '../../../services/orchestrator/data');
  try {
    const token = fs.readFileSync(path.join(dataDir, 'extension-bridge.token'), 'utf8').trim();
    if (token) fetch('http://127.0.0.1:8765/api/v1/extension/diagnostics/log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-ASMR-Bridge-Token': token }, body: JSON.stringify({ source, level, message: text }) }).catch(() => {});
  } catch (_) {}
}

function writeStartupLog(message) {
  try {
    const logPath = path.join(app.getPath("userData"), "startup.log");
    fs.appendFileSync(logPath, new Date().toISOString() + " " + message + "\n", "utf8");
  } catch (error) {
    console.error("Could not write startup log:", error);
  }
}

function startBundledBackend() {
  if (!app.isPackaged) return;
  const executable = path.join(process.resourcesPath, "backend", "asmr-orchestrator", "asmr-orchestrator.exe");
  writeStartupLog("Starting backend: " + executable);
  backendProcess = spawn(executable, [], {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ASMR_FACTORY_DATA: path.join(app.getPath("userData"), "data")
    }
  });
  backendProcess.stdout?.on("data", chunk => recordDiagnostic("BACKEND", "info", chunk.toString("utf8").trim()));
  backendProcess.stderr?.on("data", chunk => recordDiagnostic("BACKEND", "error", chunk.toString("utf8").trim()));
  backendProcess.on("spawn", () => recordDiagnostic("ELECTRON", "info", "Backend process started."));
  backendProcess.on("error", error => {
    recordDiagnostic("ELECTRON", "error", "Backend startup error: " + error.message);
    dialog.showErrorBox("ASMR Factory backend failed to start", error.message + "\n\nSee startup.log in the app's user data folder.");
  });
  backendProcess.on("exit", (code, signal) => recordDiagnostic("ELECTRON", "warn", "Backend exited. code=" + code + " signal=" + signal));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0b0d12",
    title: "ASMR Factory",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    recordDiagnostic("RENDERER", "error", "Renderer load failed. code=" + errorCode + " description=" + errorDescription + " url=" + validatedURL);
    dialog.showErrorBox("ASMR Factory could not load", errorDescription + " (" + errorCode + ").\n\nSee startup.log in the app's user data folder.");
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    recordDiagnostic("RENDERER", "error", "Renderer process gone: " + JSON.stringify(details));
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) recordDiagnostic("RENDERER", level >= 3 ? "error" : "warn", message + " at " + sourceId + ":" + line);
  });

  const page = app.isPackaged
    ? win.loadFile(path.join(__dirname, "../dist/index.html"))
    : win.loadURL("http://127.0.0.1:5173");
  page.catch(error => {
    recordDiagnostic("ELECTRON", "error", "Window page load rejected: " + error.message);
    dialog.showErrorBox("ASMR Factory could not load", error.message + "\n\nSee startup.log in the app's user data folder.");
  });
}

app.whenReady().then(() => {
  startBundledBackend();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  if (backendProcess && !backendProcess.killed) backendProcess.kill();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
