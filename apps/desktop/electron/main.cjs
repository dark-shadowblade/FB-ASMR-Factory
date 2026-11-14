const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const crypto = require("node:crypto");

let desktopToken = "";

let backendProcess = null;

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
    stdio: "ignore",
    env: {
      ...process.env,
      ASMR_FACTORY_DATA: path.join(app.getPath("userData"), "data"),
      ASMR_FACTORY_DESKTOP_TOKEN: desktopToken
    }
  });
  backendProcess.on("spawn", () => writeStartupLog("Backend process started."));
  backendProcess.on("error", error => {
    writeStartupLog("Backend startup error: " + error.message);
    dialog.showErrorBox("ASMR Factory backend failed to start", error.message + "\n\nSee startup.log in the app's user data folder.");
  });
  backendProcess.on("exit", (code, signal) => writeStartupLog("Backend exited. code=" + code + " signal=" + signal));
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

  win.webContents.session.webRequest.onBeforeSendHeaders(
    { urls: ["http://127.0.0.1:8765/*"] },
    (details, callback) => {
      details.requestHeaders["X-ASMR-Desktop-Token"] = desktopToken;
      callback({ requestHeaders: details.requestHeaders });
    }
  );

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame) return;
    writeStartupLog("Renderer load failed. code=" + errorCode + " description=" + errorDescription + " url=" + validatedURL);
    dialog.showErrorBox("ASMR Factory could not load", errorDescription + " (" + errorCode + ").\n\nSee startup.log in the app's user data folder.");
  });
  win.webContents.on("render-process-gone", (_event, details) => {
    writeStartupLog("Renderer process gone: " + JSON.stringify(details));
  });
  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) writeStartupLog("Renderer console error: " + message + " at " + sourceId + ":" + line);
  });

  const page = app.isPackaged
    ? win.loadFile(path.join(__dirname, "../dist/index.html"))
    : win.loadURL("http://127.0.0.1:5173");
  page.catch(error => {
    writeStartupLog("Window page load rejected: " + error.message);
    dialog.showErrorBox("ASMR Factory could not load", error.message + "\n\nSee startup.log in the app's user data folder.");
  });
}

app.whenReady().then(() => {
  desktopToken = crypto.randomBytes(32).toString("hex");
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
