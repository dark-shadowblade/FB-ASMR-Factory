(() => {
  if (window.__asmrFlowWorkerInstalled) return;
  window.__asmrFlowWorkerInstalled = true;
  let currentTask = null;
  let observer = null;
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
    return [...document.querySelectorAll("video")].some(v => visible(v) && (v.readyState >= 2 || v.currentSrc));
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
    if (immediate) return Promise.resolve(immediate);
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
  async function execute(task) {
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
    const settings = await chrome.storage.local.get(["promptSelector", "generateSelector", "downloadSelector", "selectorsVerified"]);
    const resolveField = () => settings.selectorsVerified === true && settings.promptSelector
      ? document.querySelector(settings.promptSelector)
      : findPromptField();
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
    const configuredField = document.querySelector(settings.promptSelector);
    const generate = document.querySelector(settings.generateSelector);
    if (!visible(configuredField) || !visible(generate) || !/button/i.test(generate.tagName) && generate.getAttribute("role") !== "button") {
      send("FLOW_UI_UNVERIFIED", { reason: "Configured prompt/generate selectors did not resolve to visible controls." });
      return;
    }
    if (task.settings?.model && !task.settingsVerified) {
      send("SETTINGS_UNVERIFIED", { requested: task.settings, reason: "Model/quality/duration verification is not yet implemented for the live Flow UI." });
      return;
    }
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
    send("PROMPT_SUBMITTED", { promptLength: task.prompt.length });
    lastState = "GENERATING";
    startMonitor();
  }
  let downloadRequested = false;
  function requestDownload() {
    if (downloadRequested) return;
    downloadRequested = true;
    chrome.storage.local.get(["downloadSelector", "selectorsVerified"], settings => {
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
      button.click();
      send("DOWNLOAD_STARTED", { source: "configured Flow download control" });
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
    if (message?.type === "PAUSE") { if (observer) observer.disconnect(); send("TASK_PAUSED", {}); }
    if (message?.type === "RESUME") { startMonitor(); send("TASK_RESUMED", { detectedState: detectState() }); }
    if (message?.type === "CANCEL") { if (observer) observer.disconnect(); send("TASK_CANCELLED", {}); }
    if (message?.type === "CHECK_STATUS") send("STATUS_CHECKED", { detectedState: detectState(), url: location.href });
    if (message?.type === "DOWNLOAD_VIDEO") requestDownload();
    if (message?.type === "SUBMIT_PROMPT") execute(currentTask);
  });
})();