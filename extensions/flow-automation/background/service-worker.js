importScripts("../shared/protocol.js");
const P = self.ASMRFlowProtocol;
const POLL_ALARM = "asmr-flow-poll";
let activeTask = null;
let pollBusy = false;
let activeTabId = null;
let activeDownloadId = null;
let activeDownloadIds = new Set();
async function restoreTask() {
  if (!activeTask) {
    const saved = await chrome.storage.local.get(["activeTask", "activeTabId", "activeDownloadIds"]);
    activeTask = saved.activeTask || null;
    activeTabId = saved.activeTabId || null;
    activeDownloadIds = new Set(saved.activeDownloadIds || []);
  }
}

async function config() {
  const v = await chrome.storage.local.get(["baseUrl", "bridgeToken", "profileId", "enabled"]);
  return {
    baseUrl: (v.baseUrl || "http://127.0.0.1:8765").replace(/\/$/, ""),
    bridgeToken: v.bridgeToken || "",
    profileId: v.profileId || "",
    enabled: v.enabled === true
  };
}
async function api(path, options = {}) {
  const c = await config();
  if (!c.bridgeToken) throw new Error("BRIDGE_NOT_CONFIGURED");
  const response = await fetch(c.baseUrl + path, {
    ...options,
    headers: { "Content-Type": "application/json", "X-ASMR-Bridge-Token": c.bridgeToken, ...(options.headers || {}) }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || ("HTTP_" + response.status));
  }
  return response.status === 204 ? null : response.json();
}
async function report(type, payload = {}) {
  const c = await config();
  if (!c.profileId || !activeTask) return;
  try {
    await api("/api/v1/extension/events", { method: "POST", body: JSON.stringify({
      protocolVersion: P.VERSION, messageId: crypto.randomUUID(), type,
      taskId: activeTask.taskId, jobId: activeTask.jobId, clipId: activeTask.clipId,
      profileId: c.profileId, timestamp: new Date().toISOString(), payload
    })});
  } catch (error) {
    console.warn("[ASMR Flow] event report failed", error.message);
  }
}
async function poll() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    await restoreTask();
    const c = await config();
    if (!c.enabled || !c.bridgeToken || !P.PROFILES.includes(c.profileId)) return;
    const stored = await chrome.storage.local.get("instanceId");
    const instanceId = stored.instanceId || crypto.randomUUID();
    if (!stored.instanceId) await chrome.storage.local.set({ instanceId });
    await api("/api/v1/extension/register", { method: "POST", body: JSON.stringify({
      protocolVersion: P.VERSION, profileId: c.profileId,
      instanceId, extensionVersion: chrome.runtime.getManifest().version
    })});
    if (activeTask) return;
    const result = await api("/api/v1/extension/next-task?profile_id=" + encodeURIComponent(c.profileId));
    if (!result.task) return;
    if (!P.validTask(result.task, c.profileId)) {
      console.error("[ASMR Flow] rejected task: profile or payload mismatch");
      return;
    }
    activeTask = result.task;
    await chrome.storage.local.set({ instanceId: (await chrome.storage.local.get("instanceId")).instanceId || crypto.randomUUID(),
      activeTask });
    const tab = await chrome.tabs.create({ url: activeTask.projectUrl, active: true });
    activeTabId = tab.id;
    await chrome.storage.local.set({ activeTabId });
    await report("TASK_ACCEPTED", { projectUrl: activeTask.projectUrl });
  } catch (error) {
    console.warn("[ASMR Flow] poll failed", error.message);
  } finally {
    pollBusy = false;
  }
}
chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  poll();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 0.5 });
  poll();
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === POLL_ALARM) poll(); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    await restoreTask();
    if (message?.type === "FLOW_PAGE_READY" && activeTask) {
      await report("PROJECT_PAGE_READY", { url: sender.tab?.url || "", title: message.title || "" });
      sendResponse({ task: activeTask });
      return;
    }
    if (message?.type === "FLOW_EVENT" && activeTask) {
      await report(message.event, message.payload || {});
      if (message.event === "TASK_FAILED" || message.event === "DOWNLOAD_FAILED" || message.event === "DOWNLOAD_COMPLETED" || message.event === "TASK_CANCELLED") {
        activeTask = null;
        activeTabId = null;
        await chrome.storage.local.remove(["activeTask", "activeTabId", "activeDownloadId"]);
      }
      sendResponse({ ok: true });
      return;
    }
    if (message?.type === "GET_ACTIVE_TASK") {
      sendResponse({ task: activeTask });
      return;
    }
    sendResponse({ ok: false, error: "UNKNOWN_MESSAGE" });
  })().catch(error => sendResponse({ ok: false, error: error.message }));
  return true;
});
chrome.downloads.onCreated.addListener(async item => {
  // Associate only downloads initiated by the tab opened for this task. Never
  // attribute an unrelated browser download to the active ASMR clip.
  await restoreTask();
  if (!activeTask || !Number.isInteger(activeTabId) || item.tabId !== activeTabId) return;
  activeDownloadIds.add(item.id);
  await chrome.storage.local.set({ activeDownloadIds: [...activeDownloadIds] });
  chrome.runtime.sendMessage({ type: "DOWNLOAD_CREATED", downloadId: item.id }).catch(() => {});
});
chrome.downloads.onChanged.addListener(async delta => {
  await restoreTask();
  if (!activeTask || !activeDownloadIds.has(delta.id) || !delta.state) return;
  if (delta.state.current === "interrupted") {
    await report("DOWNLOAD_FAILED", { downloadId: delta.id, error: "Browser download interrupted" });
    activeDownloadIds.delete(delta.id);
    await chrome.storage.local.set({ activeDownloadIds: [...activeDownloadIds] });
    return;
  }
  if (delta.state.current !== "complete") return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;
  await report("DOWNLOAD_COMPLETED", { downloadId: item.id, filename: item.filename || "", fileSize: item.fileSize || 0 });
  activeDownloadIds.delete(delta.id);
  activeTask = null;
  activeTabId = null;
  await chrome.storage.local.remove(["activeTask", "activeTabId", "activeDownloadIds"]);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CONFIG_UPDATED") {
    activeTask = null;
    activeTabId = null;
    chrome.storage.local.remove(["activeTask", "activeTabId"]);
    poll();
    sendResponse({ ok: true });
  }
});

async function pollCommands() {
  try {
    await restoreTask();
    const c = await config();
    if (!c.enabled || !activeTask) return;
    const result = await api("/api/v1/extension/commands?profile_id=" + encodeURIComponent(c.profileId));
    for (const item of (result.commands || [])) {
      if (item.task_id !== activeTask.taskId) continue;
      if (activeTabId) await chrome.tabs.sendMessage(activeTabId, { type: item.command }).catch(() => {});

    }
  } catch (error) { console.warn("[ASMR Flow] command poll failed", error.message); }
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === POLL_ALARM) pollCommands(); });
