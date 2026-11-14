importScripts("../shared/protocol.js");
const P = self.ASMRFlowProtocol;
const POLL_ALARM = "asmr-flow-poll";
let activeTask = null;
let pollBusy = false;
let activeTabId = null;
let activeDownloadIds = new Set();
function flowProjectIdentity(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.hostname !== "flow.google.com") return null;
    const match = parsed.pathname.match(/^\/project\/([A-Za-z0-9-]{12,})\/?$/);
    return match ? { projectId: match[1], path: "/project/" + match[1] } : null;
  } catch (_) { return null; }
}
function sameFlowProject(left, right) {
  const a = flowProjectIdentity(left);
  const b = flowProjectIdentity(right);
  return Boolean(a && b && a.projectId === b.projectId);
}
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
async function ensureActiveTaskTab() {
  if (!activeTask) return;
  const expectedProject = flowProjectIdentity(activeTask.projectUrl);
  if (!expectedProject) { await report("PROJECT_URL_INVALID", { expected: activeTask.projectUrl }); return; }
  if (Number.isInteger(activeTabId)) {
    try {
      const current = await chrome.tabs.get(activeTabId);
      const currentUrl = current.url || "";
      if (new URL(currentUrl).hostname === "accounts.google.com") {
        await report("SESSION_REQUIRED", { url: currentUrl, reason: "Google redirected this profile to sign-in." });
        return;
      }
      if (sameFlowProject(currentUrl, activeTask.projectUrl)) return;
    } catch (_) {}
  }
  const tabs = await chrome.tabs.query({ url: "https://flow.google.com/project/*" });
  const existing = tabs.find(tab => sameFlowProject(tab.url || "", activeTask.projectUrl));
  const tab = existing
    ? await chrome.tabs.update(existing.id, { url: activeTask.projectUrl, active: true })
    : await chrome.tabs.create({ url: activeTask.projectUrl, active: true });
  activeTabId = tab.id;
  await chrome.storage.local.set({ activeTabId });
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
    if (activeTask) {
      await ensureActiveTaskTab();
      return;
    }
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
    const existing = projectTabs.find(tab => sameFlowProject(tab.url || "", activeTask.projectUrl));
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
      const senderUrl = sender.tab?.url || "";
      const detectedProject = flowProjectIdentity(senderUrl);
      if (detectedProject) {
        const c = await config();
        await chrome.storage.local.set({ lastFlowProject: { ...detectedProject, url: senderUrl, title: message.title || "", profileId: c.profileId, detectedAt: new Date().toISOString() } });
      }
      if (sender.tab?.id && sameFlowProject(senderUrl, activeTask.projectUrl)) {
        activeTabId = sender.tab.id;
        await chrome.storage.local.set({ activeTabId });
      }
      await report("PROJECT_PAGE_READY", { url: senderUrl, title: message.title || "", projectId: detectedProject?.projectId || null, matchesAssignedProject: sameFlowProject(senderUrl, activeTask.projectUrl) });
      sendResponse({ task: activeTask });
      return;
    }
    if (message?.type === "FLOW_EVENT" && activeTask) {
      await report(message.event, message.payload || {});
      const releasesWorker = [
        "TASK_FAILED", "PROMPT_INSERT_FAILED", "DOWNLOAD_FAILED", "DOWNLOAD_COMPLETED",
        "TASK_CANCELLED", "FLOW_UI_UNVERIFIED", "SETTINGS_UNVERIFIED",
        "DOWNLOAD_SELECTOR_UNVERIFIED", "PROJECT_URL_MISMATCH",
        "PROMPT_ALREADY_PRESENT", "SESSION_REQUIRED"
      ];
      if (releasesWorker.includes(message.event)) {
        // A blocked task remains persisted in the orchestrator. Release this
        // worker lease so an explicit retry can be polled, including on the
        // same profile; otherwise activeTask prevents next-task polling forever.
        activeTask = null;
        activeTabId = null;
        activeDownloadIds.clear();
        await chrome.storage.local.remove(["activeTask", "activeTabId", "activeDownloadIds", "downloadRequestedTaskId"]);
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
  await report("DOWNLOAD_STARTED", { downloadId: item.id, filename: item.filename || "", mime: item.mime || "" });
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
    if (activeDownloadIds.size === 0) {
      await report("DOWNLOAD_FAILED", { downloadId: item.id, error: "Flow download completed but the file was not recognised as video media." });
      activeTask = null;
      activeTabId = null;
      activeDownloadIds.clear();
      await chrome.storage.local.remove(["activeTask", "activeTabId", "activeDownloadIds", "downloadRequestedTaskId"]);
    } else {
      await chrome.storage.local.set({ activeDownloadIds: [...activeDownloadIds] });
    }
    return;
  }
  await report("DOWNLOAD_COMPLETED", { downloadId: item.id, filename: item.filename || "", fileSize: item.fileSize || 0 });
  activeDownloadIds.clear();
  activeTask = null;
  activeTabId = null;
  await chrome.storage.local.remove(["activeTask", "activeTabId", "activeDownloadIds", "downloadRequestedTaskId"]);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CONFIG_UPDATED") {
    // Saving options must not discard an in-flight task or its download association.
    // Profile reassignment is rejected while a task is active; finish/recover it first.
    (async () => {
      await restoreTask();
      const next = message.config;
      if (!next || typeof next !== "object" || !P.PROFILES.includes(next.profileId)) {
        sendResponse({ ok: false, error: "INVALID_PROFILE_CONFIGURATION" });
        return;
      }
      if (activeTask && activeTask.profileId !== next.profileId) {
        sendResponse({ ok: false, error: "PROFILE_CHANGE_BLOCKED_ACTIVE_TASK" });
        return;
      }
      // Persist only after the worker confirms the active task keeps its assigned profile.
      await chrome.storage.local.set(next);
      await poll();
      sendResponse({ ok: true });
    })().catch(error => sendResponse({ ok: false, error: error.message }));
    return true;
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
  await restoreTask();
  if (!activeTask || tabId !== activeTabId) return;
  const currentUrl = changeInfo.url || tab?.url || "";
  if (!currentUrl) return;
  try {
    const parsed = new URL(currentUrl);
    if (parsed.hostname === "accounts.google.com") {
      await report("SESSION_REQUIRED", { url: currentUrl, reason: "Google redirected this profile to sign-in." });
      return;
    }
    if (parsed.hostname === "flow.google.com" &&
        sameFlowProject(currentUrl, activeTask.projectUrl)) {
      chrome.tabs.sendMessage(tabId, { type: "TASK_ASSIGNED", task: activeTask }).catch(() => {});
    }
  } catch (_) {}
});
