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
    const field = findPromptField();
    if (!field) {
      send("FLOW_UI_UNVERIFIED", { reason: "Could not identify exactly one accessible prompt field", state });
      return;
    }
    // Safe-by-default: never click an unverified Flow control. The extension reports
    // the detected controls; selectors must be verified against the live account UI.
    const settings = await chrome.storage.local.get(["promptSelector", "generateSelector", "downloadSelector", "selectorsVerified"]);
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
    if (configuredField.value === task.prompt || configuredField.textContent === task.prompt) {
      send("PROMPT_ALREADY_PRESENT", {});
    } else {
      setFieldValue(configuredField, task.prompt);
    }
    if ((configuredField.value || configuredField.textContent || "").trim() !== task.prompt.trim()) {
      send("PROMPT_INSERT_FAILED", {});
      return;
    }
    generate.click();
    send("PROMPT_SUBMITTED", { promptLength: task.prompt.length });
    lastState = "GENERATING";
    startMonitor();
  }
  function startMonitor() {
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => {
      const state = detectState();
      if (state !== lastState) {
        lastState = state;
        if (state === "SESSION_CHECK") send("SESSION_REQUIRED", { url: location.href });
        if (state === "GENERATING") send("GENERATION_STARTED", {});
        if (state === "VIDEO_READY") send("GENERATION_COMPLETED", { videoElements: document.querySelectorAll("video").length });
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    const state = detectState();
    if (state === "GENERATING") send("GENERATION_STARTED", {});
    if (state === "VIDEO_READY") send("GENERATION_COMPLETED", {});
  }
  chrome.runtime.sendMessage({ type: "FLOW_PAGE_READY", title: document.title }, response => {
    if (chrome.runtime.lastError || !response?.task) return;
    execute(response.task);
  });
  chrome.runtime.onMessage.addListener(message => {
    if (!currentTask) return;
    if (message?.type === "PAUSE") { if (observer) observer.disconnect(); send("TASK_PAUSED", {}); }
    if (message?.type === "RESUME") startMonitor();
    if (message?.type === "CANCEL") { if (observer) observer.disconnect(); send("TASK_CANCELLED", {}); }
  });
})();