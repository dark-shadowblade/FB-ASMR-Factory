const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");

let backendProcess = null;

function startBundledBackend() {
  if (!app.isPackaged) return;
  const executable = path.join(process.resourcesPath, "backend", "asmr-orchestrator", "asmr-orchestrator.exe");
  backendProcess = spawn(executable, [], {
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ASMR_FACTORY_DATA: path.join(app.getPath("userData"), "data")
    }
  });
  backendProcess.on("error", error => console.error("Could not start ASMR Factory backend:", error));
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

  if (!app.isPackaged) {
    win.loadURL("http://127.0.0.1:5173");
  } else {
    win.loadFile(path.join(__dirname, "../dist/index.html"));
  }
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
