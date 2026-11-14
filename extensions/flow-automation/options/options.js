const ids = ["baseUrl","bridgeToken","profileId","enabled","promptSelector","generateSelector","downloadSelector","modelSelector","resolutionSelector","durationSelector","aspectRatioSelector","selectorsVerified"];
async function load(){const v=await chrome.storage.local.get(ids);for(const id of ids){const el=document.getElementById(id);if(v[id]!==undefined){if(el.type==="checkbox")el.checked=v[id];else el.value=v[id];}}}
document.getElementById("save").addEventListener("click", async () => {
  const status = document.getElementById("status");
  const v = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    v[id] = el.type === "checkbox" ? el.checked : el.value.trim();
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost):8765\/?$/.test(v.baseUrl)) {
    status.textContent = "Use the local orchestrator URL http://127.0.0.1:8765.";
    return;
  }
  if (v.enabled && !v.bridgeToken) {
    status.textContent = "Add the desktop bridge token before enabling task polling.";
    return;
  }
  if (v.selectorsVerified && (!v.promptSelector || !v.generateSelector || !v.downloadSelector ||
      !v.modelSelector || !v.resolutionSelector || !v.durationSelector)) {
    status.textContent = "To verify automation, provide prompt, Generate, download, model, resolution and duration selectors.";
    return;
  }
  const savedBefore = await chrome.storage.local.get("profileId");
  if (savedBefore.profileId && savedBefore.profileId !== v.profileId) {
    const active = await chrome.runtime.sendMessage({ type: "GET_ACTIVE_TASK" }).catch(() => null);
    if (active?.task) {
      status.textContent = "Cannot change this profile assignment while a task is active. Finish or recover the task first.";
      return;
    }
  }
  await chrome.storage.local.set(v);
  status.textContent = "Saving…";
  chrome.runtime.sendMessage({ type: "CONFIG_UPDATED" }, response => {
    if (chrome.runtime.lastError) {
      status.textContent = "Saved locally. Worker refresh will retry the connection.";
      return;
    }
    if (response?.error === "PROFILE_CHANGE_BLOCKED_ACTIVE_TASK") {
      status.textContent = "Settings saved, but profile change is blocked while a task is active. Finish or recover that task first.";
      return;
    }
    status.textContent = "Settings saved for this browser profile.";
  });
});
load();
const diagnosticStatus = document.getElementById("diagnosticStatus");
const diagnosticReport = document.getElementById("diagnosticReport");
const copyReport = document.getElementById("copyReport");
let lastDiagnostic = null;

const flowTabSelect = document.getElementById("flowTab");
async function refreshFlowTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const flowTabs = tabs.filter(tab => {
    try { return new URL(tab.url || "").hostname === "flow.google.com"; } catch (_) { return false; }
  }).sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  flowTabSelect.replaceChildren();
  for (const tab of flowTabs) {
    const option = document.createElement("option");
    option.value = String(tab.id);
    let project = "Google Flow";
    try { project = new URL(tab.url).pathname.split("/").filter(Boolean).slice(-1)[0] || project; } catch (_) {}
    option.textContent = (tab.title || "Google Flow") + " · " + project + " · tab " + tab.id;
    flowTabSelect.append(option);
  }
  if (!flowTabs.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "No Google Flow tabs found in this window";
    flowTabSelect.append(option);
  }
  return flowTabs;
}
document.getElementById("refreshTabs").addEventListener("click", async () => {
  try {
    const tabs = await refreshFlowTabs();
    diagnosticStatus.textContent = tabs.length ? tabs.length + " Flow project tab(s) found in this browser profile." : "Open a Google Flow project in this browser profile first.";
  } catch (error) { diagnosticStatus.textContent = String(error?.message || error); }
});
document.getElementById("scan").addEventListener("click", async () => {
  diagnosticStatus.textContent = "Scanning selected Google Flow tab…";
  diagnosticReport.textContent = "Scanning…";
  copyReport.disabled = true;
  try {
    const tabId = Number(flowTabSelect.value);
    if (!Number.isInteger(tabId)) throw new Error("Find Flow tabs and select a project first.");
    const tab = await chrome.tabs.get(tabId);
    const activeUrl = new URL(tab.url || "");
    if (activeUrl.protocol !== "https:" || activeUrl.hostname !== "flow.google.com") {
      throw new Error("The selected tab is no longer a Google Flow page. Refresh the tab list.");
    }
    const response = await chrome.tabs.sendMessage(tab.id, { type: "RUN_DOM_DIAGNOSTIC" });
    if (!response?.ok) throw new Error(response?.error || "The Flow diagnostic did not return a report.");
    lastDiagnostic = response.report;
    await chrome.storage.local.set({ lastFlowDomDiagnostic: lastDiagnostic });
    diagnosticReport.textContent = JSON.stringify(lastDiagnostic, null, 2);
    const c = lastDiagnostic.counts;
    diagnosticStatus.textContent = "Scan complete · " + c.prompts + " prompt candidates · " + c.buttons +
      " buttons · " + c.settings + " settings candidates · " + c.videos + " videos. No controls were clicked.";
    copyReport.disabled = false;
  } catch (error) {
    lastDiagnostic = null;
    diagnosticReport.textContent = "No report available.";
    diagnosticStatus.textContent = String(error?.message || error);
  }
});

copyReport.addEventListener("click", async () => {
  if (!lastDiagnostic) return;
  try {
    await navigator.clipboard.writeText(JSON.stringify(lastDiagnostic, null, 2));
    diagnosticStatus.textContent = "Diagnostic JSON copied to clipboard.";
  } catch (error) {
    diagnosticStatus.textContent = "Clipboard unavailable: " + String(error?.message || error);
  }
});

(async () => {
  const saved = await chrome.storage.local.get("lastFlowDomDiagnostic");
  if (saved.lastFlowDomDiagnostic) {
    lastDiagnostic = saved.lastFlowDomDiagnostic;
    diagnosticReport.textContent = JSON.stringify(lastDiagnostic, null, 2);
    diagnosticStatus.textContent = "Showing the last saved diagnostic. Run a new scan after the Flow page changes.";
    copyReport.disabled = false;
  }
})();

refreshFlowTabs().catch(error => { diagnosticStatus.textContent = String(error?.message || error); });
