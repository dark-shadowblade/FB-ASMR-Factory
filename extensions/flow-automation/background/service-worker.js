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
  const v = await chrome.storage.local.get(["baseUrl", "bridgeToken", "profileId", "enabled", "instanceId"]);
  return {
    baseUrl: (v.baseUrl || "http://127.0.0.1:8765").replace(/\/$/, ""),
    bridgeToken: v.bridgeToken || "",
    profileId: v.profileId || "",
    instanceId: v.instanceId || "",
    enabled: v.enabled === true
  };
}
async function api(path, options = {}) {
  const c = await config();
  if (!c.bridgeToken) throw new Error("BRIDGE_NOT_CONFIGURED");
  const bridgeUrl = new URL(c.baseUrl);
  if (bridgeUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(bridgeUrl.hostname) || bridgeUrl.port !== "8765") {
    throw new Error("BRIDGE_URL_MUST_BE_LOCALHOST_8765");
  }
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
let flushingEvents = false;
async function flushEvents() {
  if (flushingEvents) return;
  flushingEvents = true;
  try {
    while (true) {
      const saved = await chrome.storage.local.get("pendingEvents");
      const queue = saved.pendingEvents || [];
      if (!queue.length) break;
      const event = queue[0];
      try {
        await api("/api/v1/extension/events", { method: "POST", body: JSON.stringify(event) });
      } catch (error) {
        console.warn("[ASMR Flow] event retained for retry", error.message);
        break;
      }
      const latest = await chrome.storage.local.get("pendingEvents");
      const remaining = latest.pendingEvents || [];
      if (remaining[0]?.messageId === event.messageId) remaining.shift();
      else {
        const index = remaining.findIndex(item => item.messageId === event.messageId);
        if (index >= 0) remaining.splice(index, 1);
      }
      await chrome.storage.local.set({ pendingEvents: remaining });
    }
  } finally {
    flushingEvents = false;
  }
}
async function report(type, payload = {}) {
  const c = await config();
  if (!c.profileId || !c.instanceId || !activeTask) return;
  const event = {
    protocolVersion: P.VERSION, messageId: crypto.randomUUID(), type,
    taskId: activeTask.taskId, jobId: activeTask.jobId, clipId: activeTask.clipId,
    profileId: c.profileId, instanceId: c.instanceId,
    timestamp: new Date().toISOString(), payload
  };
  const saved = await chrome.storage.local.get("pendingEvents");
  const queue = [...(saved.pendingEvents || []), event];
  await chrome.storage.local.set({ pendingEvents: queue });
  await flushEvents();
}
async function poll() {
  if (pollBusy) return;
  pollBusy = true;
  try {
    await restoreTask();
    await flushEvents();
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
    const result = await api("/api/v1/extension/next-task?profile_id=" + encodeURIComponent(c.profileId) + "&instance_id=" + encodeURIComponent(instanceId));
    if (!result.task) return;
    if (!P.validTask(result.task, c.profileId)) {
      console.error("[ASMR Flow] rejected task: profile or payload mismatch");
      return;
    }
    activeTask = result.task;
    await chrome.storage.local.set({ instanceId: (await chrome.storage.local.get("instanceId")).instanceId || crypto.randomUUID(),
      activeTask });
    const projectTabs = await chrome.tabs.query({ url: "https://flow.google.com/project/*" });
    const expectedPath = activeTask.projectUrl.split("?")[0];
    const existing = projectTabs.find(tab => (tab.url || "").split("?")[0] === expectedPath);
    const tab = existing
      ? await chrome.tabs.update(existing.id, { url: activeTask.projectUrl, active: true })
      : await chrome.tabs.create({ url: activeTask.projectUrl, active: true });
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
      if (message.event === "TASK_FAILED" || message.event === "PROMPT_INSERT_FAILED" || message.event === "DOWNLOAD_FAILED" || message.event === "DOWNLOAD_COMPLETED" || message.event === "TASK_CANCELLED") {
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
    await chrome.storage.local.remove("downloadRequestedTaskId");
    activeDownloadIds.delete(delta.id);
    activeTask = null;
    activeTabId = null;
    activeDownloadIds.clear();
    await chrome.storage.local.remove(["activeTask", "activeTabId", "activeDownloadIds", "downloadRequestedTaskId"]);
    return;
  }
  if (delta.state.current !== "complete") return;
  const [item] = await chrome.downloads.search({ id: delta.id });
  if (!item) return;
  const isVideo = /\.(mp4|webm|mov|m4v)$/i.test(item.filename || "") || /video\//i.test(item.mime || "");
  if (!isVideo) {
    activeDownloadIds.delete(delta.id);
    await chrome.storage.local.set({ activeDownloadIds: [...activeDownloadIds] });
    return;
  }
  await report("DOWNLOAD_COMPLETED", { downloadId: item.id, filename: item.filename || "", fileSize: item.fileSize || 0 });
  activeDownloadIds.delete(delta.id);
  activeTask = null;
  activeTabId = null;
  await chrome.storage.local.remove(["activeTask", "activeTabId", "activeDownloadIds", "downloadRequestedTaskId"]);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CONFIG_UPDATED") {
    activeTask = null;
    activeTabId = null;
    chrome.storage.local.remove(["activeTask", "activeTabId", "activeDownloadIds", "downloadRequestedTaskId"]);
    poll();
    sendResponse({ ok: true });
  }
});

async function pollCommands() {
  try {
    await restoreTask();
    const c = await config();
    if (!c.enabled || !activeTask) return;
    const result = await api("/api/v1/extension/commands?profile_id=" + encodeURIComponent(c.profileId) + "&task_id=" + encodeURIComponent(activeTask.taskId) + "&instance_id=" + encodeURIComponent(c.instanceId));
    for (const item of (result.commands || [])) {
      if (item.task_id !== activeTask.taskId) continue;
      if (item.command === "OPEN_PROJECT" && activeTabId) {
        await chrome.tabs.update(activeTabId, { url: activeTask.projectUrl });
      } else if (activeTabId) {
        await chrome.tabs.sendMessage(activeTabId, { type: item.command }).catch(() => {});
      }

    }
  } catch (error) { console.warn("[ASMR Flow] command poll failed", error.message); }
}
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === POLL_ALARM) pollCommands(); });

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url) return;
  await restoreTask();
  if (!activeTask || tabId !== activeTabId) return;
  try {
    const host = new URL(changeInfo.url).hostname;
    if (host === "accounts.google.com") {
      await report("SESSION_REQUIRED", { url: changeInfo.url, reason: "Google redirected this profile to sign-in." });
    }
  } catch (_) {}
});
