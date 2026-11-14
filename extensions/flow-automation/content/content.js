(() => {
  if (window.__asmrFlowWorkerInstalled) return;
  window.__asmrFlowWorkerInstalled = true;
  let currentTask = null;
  let observer = null;
  let executingTaskId = null;
  let executingPromise = null;
  let lastState = "";

  const send = (event, payload = {}) => chrome.runtime.sendMessage({ type: "FLOW_EVENT", event, payload }).catch(() => {});
  const visible = el => !!(el && el.isConnected && (el.getClientRects().length || el.offsetWidth || el.offsetHeight));
  const labelOf = el => [
    el.getAttribute?.("aria-label"), el.getAttribute?.("placeholder"),
    el.getAttribute?.("data-placeholder"), el.innerText, el.textContent,
    el.getAttribute?.("title")
  ].filter(Boolean).join(" ").trim();

  function findPromptField() {
    const explicit = document.querySelector("[data-asmr-flow-prompt]");
    if (explicit && visible(explicit)) return explicit;
    const candidates = [...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"], input:not([type])')]
      .filter(visible).filter(el => {
        const label = labelOf(el).toLowerCase();
        return /prompt|describe|create|video/.test(label) || el.getAttribute("role") === "textbox";
      });
    return candidates.length === 1 ? candidates[0] : null;
  }
  function findButton(regex) {
    const buttons = [...document.querySelectorAll("button,[role=button]")].filter(visible);
    const matches = buttons.filter(el => regex.test(labelOf(el).toLowerCase()));
    return matches.length === 1 ? matches[0] : null;
  }
  function selectedText(selector) {
    if (!selector) return "";
    const el = document.querySelector(selector);
    if (!visible(el)) return "";
    return [el.getAttribute("aria-label"), el.getAttribute("aria-valuetext"),
      el.value, el.innerText, el.textContent].filter(Boolean).join(" ").trim();
  }
  function verifySettings(settings, requested) {
    const actual = {};
    try {
      actual.model = selectedText(settings.modelSelector);
      actual.resolution = selectedText(settings.resolutionSelector);
      actual.duration = selectedText(settings.durationSelector);
      actual.aspectRatio = selectedText(settings.aspectRatioSelector);
    } catch (_) {
      return { ok: false, reason: "One or more selected-setting CSS selectors are invalid.", actual };
    }
    const expectedModel = String(requested.model || "Veo 3.1 Lite");
    const expectedResolution = String(requested.resolution || "720p");
    const expectedDuration = Number(requested.durationSeconds || 8);
    const expectedRatio = String(requested.aspectRatio || "9:16").replace(/\s/g, "");
    if (!settings.modelSelector || !settings.resolutionSelector || !settings.durationSelector) {
      return { ok: false, reason: "Model, resolution and duration selectors must all be configured.", actual };
    }
    if (!actual.model.toLowerCase().includes(expectedModel.toLowerCase())) return { ok: false, reason: "Selected model does not match " + expectedModel + ".", actual };
    if (!actual.resolution.toLowerCase().includes(expectedResolution.toLowerCase())) return { ok: false, reason: "Selected resolution does not match " + expectedResolution + ".", actual };
    if (!new RegExp("\\b" + expectedDuration + "\\b").test(actual.duration)) return { ok: false, reason: "Selected duration does not match " + expectedDuration + " seconds.", actual };
    if (settings.aspectRatioSelector && !actual.aspectRatio.replace(/\s/g, "").includes(expectedRatio)) {
      return { ok: false, reason: "Selected aspect ratio does not match " + expectedRatio + ".", actual };
    }
    return { ok: true, actual, aspectRatioVerified: Boolean(settings.aspectRatioSelector) };
  }
  function setFieldValue(field, value) {
    field.focus();
    if (field.isContentEditable) {
      field.textContent = value;
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    } else {
      const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(field, value); else field.value = value;
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  function videoReady() {
    const playable = [...document.querySelectorAll("video")].some(v =>
      visible(v) && v.readyState >= 2 && Number.isFinite(v.duration) && v.duration > 0 && !!v.currentSrc
    );
    return playable && !!findButton(/download/);
  }
  function detectState() {
    const text = (document.body?.innerText || "").toLowerCase();
    if (/sign in|choose an account|session expired/.test(text) && location.hostname === "flow.google.com") return "SESSION_CHECK";
    if (/generating|creating video|in progress|queued/.test(text)) return "GENERATING";
    if (videoReady() || /download video|download/.test(text)) return "VIDEO_READY";
    return "PROJECT_LOADED";
  }
  function waitForPromptField(resolveField, timeoutMs = 45000) {
    const immediate = resolveField();
    if (immediate && visible(immediate)) return Promise.resolve(immediate);
    return new Promise(resolve => {
      let finished = false;
      const finish = value => {
        if (finished) return;
        finished = true;
        observer.disconnect();
        clearTimeout(timeout);
        resolve(value);
      };
      const observer = new MutationObserver(() => {
        const field = resolveField();
        if (field && visible(field)) finish(field);
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
      const timeout = setTimeout(() => finish(null), timeoutMs);
    });
  }
  function execute(task) {
    if (executingPromise) return executingTaskId === task.taskId ? executingPromise : Promise.resolve(false);
    executingTaskId = task.taskId;
    executingPromise = runTask(task).finally(() => {
      executingTaskId = null;
      executingPromise = null;
    });
    return executingPromise;
  }
  async function runTask(task) {
    currentTask = task;
    if (location.href.split("?")[0] !== task.projectUrl.split("?")[0]) {
      send("PROJECT_URL_MISMATCH", { actual: location.href, expected: task.projectUrl });
      return;
    }
    const state = detectState();
    if (state === "SESSION_CHECK") {
      send("SESSION_REQUIRED", { url: location.href });
      return;
    }
    if (state === "GENERATING") {
      send("GENERATION_ALREADY_ACTIVE", { reason: "Existing generation detected; refusing to submit again." });
      lastState = "GENERATING";
      startMonitor();
      return;
    }
    if (state === "VIDEO_READY") {
      send("GENERATION_ALREADY_COMPLETE", { reason: "Existing video detected; refusing to submit another generation." });
      lastState = "VIDEO_READY";
      startMonitor();
      requestDownload();
      return;
    }
    // Wait for the Flow app to hydrate. A URL change alone is not treated as a loaded project.
    const settings = await chrome.storage.local.get(["promptSelector", "generateSelector", "downloadSelector", "modelSelector", "resolutionSelector", "durationSelector", "aspectRatioSelector", "selectorsVerified"]);
    const resolveField = () => {
      try {
        return settings.selectorsVerified === true && settings.promptSelector
          ? document.querySelector(settings.promptSelector)
          : findPromptField();
      } catch (_) { return null; }
    };
    const field = await waitForPromptField(resolveField);
    if (!field || !visible(field)) {
      send("FLOW_UI_UNVERIFIED", { reason: "Flow project did not expose one verified prompt field before the page readiness timeout", state });
      return;
    }
    // Safe-by-default: never click an unverified Flow control. The extension reports
    // the detected controls; selectors must be verified against the live account UI.
    if (settings.selectorsVerified !== true || !settings.promptSelector || !settings.generateSelector) {
      send("FLOW_UI_UNVERIFIED", {
        reason: "Live Flow selectors have not been verified for this account.",
        candidates: { prompt: field.tagName, promptLabel: labelOf(field).slice(0, 100) },
        detectedState: state
      });
      return;
    }
    let configuredField = null;
    let generate = null;
    try {
      configuredField = document.querySelector(settings.promptSelector);
      generate = document.querySelector(settings.generateSelector);
    } catch (_) {
      send("FLOW_UI_UNVERIFIED", { reason: "A configured CSS selector is invalid." });
      return;
    }
    if (!visible(configuredField) || !visible(generate) ||
        (!/button/i.test(generate.tagName) && generate.getAttribute("role") !== "button") ||
        generate.disabled || generate.getAttribute("aria-disabled") === "true" ||
        configuredField.disabled || configuredField.readOnly) {
      send("FLOW_UI_UNVERIFIED", { reason: "Configured prompt/generate selectors did not resolve to visible, enabled controls." });
      return;
    }
    const settingsCheck = verifySettings(settings, task.settings || {});
    if (!settingsCheck.ok) {
      send("SETTINGS_UNVERIFIED", { requested: task.settings || {}, reason: settingsCheck.reason, actual: settingsCheck.actual });
      return;
    }
    send("SETTINGS_VERIFIED", { actual: settingsCheck.actual, aspectRatioVerified: settingsCheck.aspectRatioVerified });
    if ((configuredField.value || configuredField.textContent || "").trim() === task.prompt.trim()) {
      send("PROMPT_ALREADY_PRESENT", { reason: "Prompt is already present; refusing to click Generate a second time." });
      return;
    }
    setFieldValue(configuredField, task.prompt);
    if ((configuredField.value || configuredField.textContent || "").trim() !== task.prompt.trim()) {
      send("PROMPT_INSERT_FAILED", {});
      return;
    }
    generate.click();
    send("GENERATE_CLICKED", { promptLength: task.prompt.length });
    lastState = "PROJECT_LOADED";
    startMonitor();
  }
  let downloadRequested = false;
  function requestDownload() {
    if (downloadRequested) return;
    downloadRequested = true;
    chrome.storage.local.get(["downloadSelector", "selectorsVerified", "downloadRequestedTaskId"], settings => {
      if (settings.downloadRequestedTaskId === currentTask.taskId) return;
      if (settings.selectorsVerified !== true || !settings.downloadSelector) {
        send("DOWNLOAD_SELECTOR_UNVERIFIED", { reason: "A verified download selector is required." });
        return;
      }
      let button = null;
      try { button = document.querySelector(settings.downloadSelector); } catch (_) {}
      if (!visible(button)) {
        send("DOWNLOAD_SELECTOR_UNVERIFIED", { reason: "Configured download selector did not resolve to a visible element." });
        return;
      }
      chrome.storage.local.set({ downloadRequestedTaskId: currentTask.taskId }, () => {
        try {
          button.click();
          send("DOWNLOAD_CLICKED", { source: "configured Flow download control" });
        } catch (error) {
          chrome.storage.local.remove("downloadRequestedTaskId");
          send("DOWNLOAD_FAILED", { error: String(error).slice(0, 200) });
        }
      });
    });
  }
  function startMonitor() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      const state = detectState();
      if (state !== lastState) {
        lastState = state;
        if (state === "SESSION_CHECK") send("SESSION_REQUIRED", { url: location.href });
        if (state === "GENERATING") send("GENERATION_STARTED", {});
        if (state === "VIDEO_READY") {
          send("GENERATION_COMPLETED", { videoElements: document.querySelectorAll("video").length });
          requestDownload();
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const state = detectState();
    if (state === "GENERATING") send("GENERATION_STARTED", {});
    if (state === "VIDEO_READY") {
      send("GENERATION_COMPLETED", {});
      requestDownload();
    }
  }
  chrome.runtime.sendMessage({ type: "FLOW_PAGE_READY", title: document.title }, response => {
    if (chrome.runtime.lastError || !response?.task) return;
    execute(response.task);
  });
  chrome.runtime.onMessage.addListener(message => {
    if (!currentTask) return;
    if (message?.type === "TASK_ASSIGNED" && message.task) execute(message.task);
    if (message?.type === "PAUSE") { if (observer) observer.disconnect(); send("TASK_PAUSED", {}); }
    if (message?.type === "RESUME") {
      chrome.storage.local.get("activeDownloadIds", saved => {
        if (!(saved.activeDownloadIds || []).length) downloadRequested = false;
        execute(currentTask);
        send("TASK_RESUMED", { detectedState: detectState() });
      });
    }
    if (message?.type === "CANCEL") { if (observer) observer.disconnect(); send("TASK_CANCELLED", {}); }
    if (message?.type === "CHECK_STATUS") send("STATUS_CHECKED", { detectedState: detectState(), url: location.href });
    if (message?.type === "DOWNLOAD_VIDEO") requestDownload();
    if (message?.type === "SUBMIT_PROMPT") execute(currentTask);
  });
})();