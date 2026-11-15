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
let diagnosticQueue = [];
async function sendDiagnostic(level, message) {
  try {
    const c = await config();
    if (!c.bridgeToken || !c.enabled) return;
    await fetch(c.baseUrl + "/api/v1/extension/diagnostics/log", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-ASMR-Bridge-Token": c.bridgeToken },
      body: JSON.stringify({ source: "FLOW_EXTENSION", level, message: String(message).slice(0, 3500), profileId: c.profileId || null, taskId: activeTask?.taskId || null })
    });
  } catch (_) {}
}
function installDiagnosticCapture() {
  for (const level of ["warn", "error"]) {
    const original = console[level].bind(console);
    console[level] = (...args) => {
      original(...args);
      sendDiagnostic(level, args.map(value => value instanceof Error ? value.stack || value.message : String(value)).join(" "));
    };
  }
  self.addEventListener("error", event => sendDiagnostic("error", event.message + " at " + event.filename + ":" + event.lineno));
  self.addEventListener("unhandledrejection", event => sendDiagnostic("error", "Unhandled rejection: " + String(event.reason?.stack || event.reason)));
}
installDiagnosticCapture();

let flushingEvents = false;
async function flushEvents() {
  if (flushingEvents) return false;
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
    const finalState = await chrome.storage.local.get("pendingEvents");
    return !(finalState.pendingEvents || []).length;
  } finally {
    flushingEvents = false;
  }
}
async function report(type, payload = {}) {
  const c = await config();
  if (!c.profileId || !c.instanceId || !activeTask) return false;
  const event = {
    protocolVersion: P.VERSION, messageId: crypto.randomUUID(), type,
    taskId: activeTask.taskId, jobId: activeTask.jobId, clipId: activeTask.clipId,
    profileId: c.profileId, instanceId: c.instanceId,
    timestamp: new Date().toISOString(), payload
  };
  const saved = await chrome.storage.local.get("pendingEvents");
  const queue = [...(saved.pendingEvents || []), event];
  await chrome.storage.local.set({ pendingEvents: queue });
  return await flushEvents();
}
async function clearCompletedTask(taskId) {
  if (activeTask?.taskId !== taskId) return;
  activeTask = null;
  activeTabId = null;
  activeDownloadIds.clear();
  await chrome.storage.local.remove([
    "activeTask", "activeTabId", "activeDownloadIds",
    "downloadRequestedTaskId", "extensionTaskSnapshot"
  ]);
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
    await chrome.storage.local.set({ extensionWorkerStatus: {
      profileId: c.profileId, connected: true, registeredAt: new Date().toISOString(), error: ""
    }});
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
    const assignedSettings = activeTask.settings || {};
    await chrome.storage.local.set({
      instanceId: (await chrome.storage.local.get("instanceId")).instanceId || crypto.randomUUID(),
      activeTask,
      extensionTaskSnapshot: {
        taskId: activeTask.taskId,
        jobId: activeTask.jobId,
        clipId: activeTask.clipId,
        profileId: activeTask.profileId,
        projectUrl: activeTask.projectUrl,
        projectId: flowProjectIdentity(activeTask.projectUrl)?.projectId || null,
        settings: {
          model: assignedSettings.model || "",
          resolution: assignedSettings.resolution || "",
          durationSeconds: assignedSettings.durationSeconds ?? null,
          aspectRatio: assignedSettings.aspectRatio || ""
        },
        receivedAt: new Date().toISOString(),
        state: "TASK_ASSIGNED"
      }
    });
    const projectTabs = await chrome.tabs.query({ url: "https://flow.google.com/project/*" });
    const existing = projectTabs.find(tab => sameFlowProject(tab.url || "", activeTask.projectUrl));
    const tab = existing
      ? await chrome.tabs.update(existing.id, { url: activeTask.projectUrl, active: true })
      : await chrome.tabs.create({ url: activeTask.projectUrl, active: true });
    activeTabId = tab.id;
    await chrome.storage.local.set({ activeTabId });
    await report("TASK_ACCEPTED", { projectUrl: activeTask.projectUrl });
  } catch (error) {
    const c = await config().catch(() => ({}));
    await chrome.storage.local.set({ extensionWorkerStatus: {
      profileId: c.profileId || "", connected: false, error: String(error.message || error), checkedAt: new Date().toISOString()
    }});
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
    if (message?.type === "FLOW_PAGE_READY") {
      const senderUrl = sender.tab?.url || "";
      const detectedProject = flowProjectIdentity(senderUrl);
      const c = await config();
      if (detectedProject && c.enabled && c.profileId && c.instanceId) {
        await chrome.storage.local.set({ lastFlowProject: { ...detectedProject, url: senderUrl, title: message.title || "", profileId: c.profileId, detectedAt: new Date().toISOString() } });
        await api("/api/v1/extension/project-detected", { method: "POST", body: JSON.stringify({
          protocolVersion: P.VERSION, profileId: c.profileId, instanceId: c.instanceId,
          projectUrl: senderUrl, projectTitle: message.title || ""
        }) });
      }
      if (activeTask && sender.tab?.id && sameFlowProject(senderUrl, activeTask.projectUrl)) {
        activeTabId = sender.tab.id;
        await chrome.storage.local.set({ activeTabId });
        await report("PROJECT_PAGE_READY", { url: senderUrl, title: message.title || "", projectId: detectedProject?.projectId || null, matchesAssignedProject: true });
        sendResponse({ task: activeTask });
      } else {
        sendResponse({ task: null, projectDetected: Boolean(detectedProject) });
      }
      return;
    }
    if (message?.type === "FLOW_EVENT" && activeTask) {
      const snapshot = (await chrome.storage.local.get("extensionTaskSnapshot")).extensionTaskSnapshot || {};
      await chrome.storage.local.set({ extensionTaskSnapshot: {
        ...snapshot, state: message.event, lastEvent: message.event,
        lastEventAt: new Date().toISOString(), lastEventPayload: message.payload || {}
      }});
      const taskId = activeTask.taskId;
      const acknowledged = await report(message.event, message.payload || {});
      if (acknowledged && (message.event === "TASK_FAILED" || message.event === "PROMPT_INSERT_FAILED" || message.event === "DOWNLOAD_FAILED" || message.event === "DOWNLOAD_COMPLETED" || message.event === "TASK_CANCELLED")) {
        await clearCompletedTask(taskId);
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
  const completedTaskId = activeTask.taskId;
  const acknowledged = await report("DOWNLOAD_COMPLETED", { downloadId: item.id, filename: item.filename || "", fileSize: item.fileSize || 0 });
  if (acknowledged) await clearCompletedTask(completedTaskId);
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CONFIG_UPDATED") {
    // Saving options must not discard an in-flight task or its download association.
    // Profile reassignment is rejected while a task is active; finish/recover it first.
    (async () => {
      await restoreTask();
      const c = await config();
      if (activeTask && activeTask.profileId !== c.profileId) {
        sendResponse({ ok: false, error: "PROFILE_CHANGE_BLOCKED_ACTIVE_TASK" });
        return;
      }
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
