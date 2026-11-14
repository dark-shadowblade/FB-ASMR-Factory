const ids = ["baseUrl","bridgeToken","profileId","enabled","promptSelector","generateSelector","downloadSelector","modelSelector","resolutionSelector","durationSelector","aspectRatioSelector","selectorsVerified"];
async function load(){const v=await chrome.storage.local.get(ids);for(const id of ids){const el=document.getElementById(id);if(v[id]!==undefined){if(el.type==="checkbox")el.checked=v[id];else el.value=v[id];}}}
document.getElementById("save").addEventListener("click",async()=>{const v={};for(const id of ids){const el=document.getElementById(id);v[id]=el.type==="checkbox"?el.checked:el.value.trim();}await chrome.storage.local.set(v);document.getElementById("status").textContent="Settings saved for this Chrome profile.";chrome.runtime.sendMessage({type:"CONFIG_UPDATED"});});
load();
const diagnosticStatus = document.getElementById("diagnosticStatus");
const diagnosticReport = document.getElementById("diagnosticReport");
const copyReport = document.getElementById("copyReport");
let lastDiagnostic = null;

document.getElementById("scan").addEventListener("click", async () => {
  diagnosticStatus.textContent = "Looking for the active Google Flow tab…";
  diagnosticReport.textContent = "Scanning…";
  copyReport.disabled = true;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.id || !/^https:\\/\\/flow\\.google\\.com\\//i.test(tab.url || "")) {
      throw new Error("Open the target Google Flow project in this Chrome profile and make it the active tab.");
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
