(() => {
  if (window.__asmrFlowWorkerInstalled) return;
  window.__asmrFlowWorkerInstalled = true;
  let currentTask = null;
  let observer = null;
  let executingTaskId = null;
  let executingPromise = null;
  let lastState = "";
  let baselineMediaIds = [];
  let targetMediaId = null;

  const send = (event, payload = {}) => chrome.runtime.sendMessage({ type: "FLOW_EVENT", event, payload }).catch(() => {});
  const visible = el => !!(el && el.isConnected && (el.getClientRects().length || el.offsetWidth || el.offsetHeight));
  const isTextEntry = el => /^(TEXTAREA|INPUT)$/.test(el?.tagName || "") ||
    Boolean(el?.isContentEditable) || el?.getAttribute?.("role") === "textbox";
  // Never include user-entered prompt text in diagnostic/event labels.
  const labelOf = el => [
    el.getAttribute?.("aria-label"), el.getAttribute?.("placeholder"),
    el.getAttribute?.("data-placeholder"), el.getAttribute?.("title"),
    isTextEntry(el) ? "" : el.innerText || el.textContent
  ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();

  function projectIdentity(url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" || parsed.hostname !== "flow.google.com") return null;
      const match = parsed.pathname.match(/^\/project\/([A-Za-z0-9-]{12,})\/?$/);
      return match ? { projectId: match[1], path: "/project/" + match[1] } : null;
    } catch (_) { return null; }
  }
  function sameProject(left, right) {
    const a = projectIdentity(left);
    const b = projectIdentity(right);
    return Boolean(a && b && a.projectId === b.projectId);
  }
  function findPromptField() {
    const explicit = document.querySelector("[data-asmr-flow-prompt]");
    if (explicit && visible(explicit)) return explicit;
    // Selector patterns observed in the supplied Veo Automation reference extension.
    // Prefer Flow's rich-text editor over generic textboxes, but require uniqueness.
    const preferred = [
      "div.ProseMirror[contenteditable='true']",
      "flow-rich-text-editor [contenteditable='true']",
      '[contenteditable="true"][role="textbox"]',
      '[contenteditable="true"]'
    ];
    for (const selector of preferred) {
      const matches = [...document.querySelectorAll(selector)].filter(visible);
      if (matches.length === 1) return matches[0];
      if (matches.length > 1) return null;
    }
    const candidates = [...document.querySelectorAll('textarea, [role="textbox"], input:not([type])')]
      .filter(visible).filter(el => /prompt|describe|create|video/.test(labelOf(el).toLowerCase()));
    return candidates.length === 1 ? candidates[0] : null;
  }
  function findButton(regex) {
    const buttons = [...document.querySelectorAll("button,[role=button]")].filter(visible);
    const matches = buttons.filter(el => regex.test(labelOf(el).toLowerCase()));
    return matches.length === 1 ? matches[0] : null;
  }
  function selectedText(selector) {
    if (!selector) return "";
    try {
      const el = document.querySelector(selector);
      if (!visible(el)) return "";
      return [el.getAttribute("aria-label"), el.getAttribute("aria-valuetext"),
        el.value, el.innerText, el.textContent].filter(Boolean).join(" ").trim();
    } catch (_) { return ""; }
  }
  function autoSelectedText(expected) {
    const wanted = String(expected || "").toLowerCase().replace(/\s+/g, "");
    if (!wanted) return "";
    const nodes = [
      ...document.querySelectorAll('[aria-selected="true"],[aria-pressed="true"],[aria-checked="true"],[data-state="on"],input:checked'),
      ...[...document.querySelectorAll("select")].filter(visible).flatMap(el => [...el.selectedOptions])
    ];
    const matches = [...new Set(nodes)].filter(el => {
      const text = [el.getAttribute?.("aria-label"), el.getAttribute?.("aria-valuetext"),
        el.value, el.innerText, el.textContent].filter(Boolean).join(" ").toLowerCase().replace(/\s+/g, "");
      return text.includes(wanted);
    });
    return matches.length === 1
      ? [matches[0].getAttribute?.("aria-label"), matches[0].getAttribute?.("aria-valuetext"),
         matches[0].value, matches[0].innerText, matches[0].textContent].filter(Boolean).join(" ").trim()
      : "";
  }
  function verifySettings(settings, requested) {
    const actual = {};
    try {
      actual.model = selectedText(settings.modelSelector) || autoSelectedText(requested.model);
      actual.resolution = selectedText(settings.resolutionSelector) || autoSelectedText(requested.resolution);
      actual.duration = selectedText(settings.durationSelector) || autoSelectedText(String(requested.durationSeconds) + " seconds") || autoSelectedText(String(requested.durationSeconds) + "s");
      actual.aspectRatio = selectedText(settings.aspectRatioSelector) || autoSelectedText(requested.aspectRatio);
    } catch (_) {
      return { ok: false, reason: "One or more selected-setting CSS selectors are invalid.", actual };
    }
    const expectedModel = String(requested.model || "");
    const expectedResolution = String(requested.resolution || "");
    const expectedDuration = Number(requested.durationSeconds);
    const expectedRatio = String(requested.aspectRatio || "").replace(/\s/g, "");
    if (!expectedModel || !expectedResolution || !Number.isFinite(expectedDuration) || expectedDuration <= 0) {
      return { ok: false, reason: "The assigned task is missing model, resolution or duration settings from the desktop app.", actual };
    }

    if (!actual.model.toLowerCase().includes(expectedModel.toLowerCase())) return { ok: false, reason: "Selected model does not match " + expectedModel + ".", actual };
    if (!actual.resolution.toLowerCase().includes(expectedResolution.toLowerCase())) return { ok: false, reason: "Selected resolution does not match " + expectedResolution + ".", actual };
    const selectedDurations = [...actual.duration.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(?:s|sec|seconds?)/g)].map(match => Number(match[1]));
    if (!selectedDurations.includes(expectedDuration)) return { ok: false, reason: "Selected duration does not match " + expectedDuration + " seconds.", actual };
    if (expectedRatio && !actual.aspectRatio.replace(/\s/g, "").includes(expectedRatio)) {
      return { ok: false, reason: "Selected aspect ratio does not match " + expectedRatio + ".", actual };
    }
    return { ok: true, actual, aspectRatioVerified: Boolean(actual.aspectRatio) };
  }
  function setFieldValue(field, value) {
    field.focus();
    if (field.isContentEditable) {
      // Use browser editing commands rather than assigning textContent directly.
      // This lets the editor's normal input pipeline observe the change without
      // reaching into private React/framework internals.
      const selection = window.getSelection();
      if (selection) {
        const range = document.createRange();
        range.selectNodeContents(field);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      try { document.execCommand("delete", false); } catch (_) {}
      try { document.execCommand("insertText", false, value); } catch (_) {}
      field.dispatchEvent(new InputEvent("beforeinput", {
        bubbles: true, cancelable: true, composed: true, inputType: "insertText", data: value
      }));
      field.dispatchEvent(new InputEvent("input", {
        bubbles: true, composed: true, inputType: "insertText", data: value
      }));
    } else {
      const proto = field.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(field, value); else field.value = value;
      field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  function videoReady() {
    if (baselineMediaIds.length && window.ASMRFlowControls) {
      const freshId = targetMediaId || window.ASMRFlowControls.findNewMediaId(baselineMediaIds);
      if (!freshId) return false;
      targetMediaId = freshId;
      return window.ASMRFlowControls.mediaTileReady(freshId);
    }
    const playable = [...document.querySelectorAll("video")].some(v =>
      visible(v) && v.readyState >= 2 && Number.isFinite(v.duration) && v.duration > 0 && !!v.currentSrc
    );
    return playable && !!findButton(/download/);
  }
  function detectState() {
    const text = (document.body?.innerText || "").toLowerCase();
    if (/sign in|choose an account|session expired/.test(text) && location.hostname === "flow.google.com") return "SESSION_CHECK";
    if (/generating|creating video|in progress|queued/.test(text)) return "GENERATING";
    if (videoReady()) return "VIDEO_READY";
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
    if (!sameProject(location.href, task.projectUrl)) {
      send("PROJECT_URL_MISMATCH", { actual: location.href, expected: task.projectUrl });
      return;
    }
    const baselineState = await chrome.storage.local.get("flowBaselineByTask");
    const baselineMap = baselineState.flowBaselineByTask || {};
    if (Array.isArray(baselineMap[task.taskId])) {
      baselineMediaIds = baselineMap[task.taskId];
    } else {
      baselineMediaIds = window.ASMRFlowControls ? window.ASMRFlowControls.mediaIds() : [];
      baselineMap[task.taskId] = baselineMediaIds;
      const keys = Object.keys(baselineMap);
      for (const key of keys.slice(0, Math.max(0, keys.length - 20))) delete baselineMap[key];
      await chrome.storage.local.set({ flowBaselineByTask: baselineMap });
    }
    targetMediaId = null;
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
        if (settings.selectorsVerified === true && settings.promptSelector) {
          const configured = document.querySelector(settings.promptSelector);
          if (visible(configured)) return configured;
        }
        return findPromptField();
      } catch (_) { return findPromptField(); }
    };
    const field = await waitForPromptField(resolveField);
    if (!field || !visible(field)) {
      send("FLOW_UI_UNVERIFIED", { reason: "Flow project did not expose one verified prompt field before the page readiness timeout", state });
      return;
    }
    // Use an explicitly verified selector when supplied; otherwise act only on a unique,
    // semantically labelled control discovered in the current Flow page.
    let configuredField = field;
    let generate = null;
    if (settings.selectorsVerified === true && settings.promptSelector && settings.generateSelector) {
      try {
        configuredField = document.querySelector(settings.promptSelector);
        generate = document.querySelector(settings.generateSelector);
      } catch (_) {
        send("FLOW_UI_UNVERIFIED", { reason: "A configured CSS selector is invalid." });
        return;
      }
    } else {
      // Prefer unique, semantically labelled controls discovered on the live page.
      generate = findButton(/generate|create video|make video|start generation|arrow_forward/i);
    }
    if (!visible(configuredField) || !visible(generate) ||
        (!/button/i.test(generate.tagName) && generate.getAttribute("role") !== "button") ||
        generate.disabled || generate.getAttribute("aria-disabled") === "true" ||
        configuredField.disabled || configuredField.readOnly) {
      send("FLOW_UI_UNVERIFIED", { reason: "Configured prompt/generate selectors did not resolve to visible, enabled controls." });
      return;
    }
    if (!window.ASMRFlowControls || typeof window.ASMRFlowControls.applySettings !== "function") {
      send("SETTINGS_UNVERIFIED", { requested: task.settings || {}, reason: "The Flow controls adapter did not load." });
      return;
    }
    const settingsCheck = await window.ASMRFlowControls.applySettings(task.settings || {});
    if (!settingsCheck.ok) {
      send("SETTINGS_UNVERIFIED", { requested: task.settings || {}, reason: settingsCheck.reason, actual: settingsCheck.actual, available: settingsCheck.available || [] });
      return;
    }
    send("SETTINGS_VERIFIED", { actual: settingsCheck.actual, verification: settingsCheck.verified });
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
  async function requestDownload() {
    if (downloadRequested) return;
    downloadRequested = true;
    if (targetMediaId && window.ASMRFlowControls) {
      const result = await window.ASMRFlowControls.downloadMediaTile(targetMediaId);
      if (!result.ok) {
        downloadRequested = false;
        send("DOWNLOAD_SELECTOR_UNVERIFIED", { reason: result.reason, mediaId: targetMediaId });
        return;
      }
      chrome.storage.local.set({ downloadRequestedTaskId: currentTask?.taskId });
      send("DOWNLOAD_CLICKED", { source: "generated media tile menu", mediaId: targetMediaId });
      return;
    }
    chrome.storage.local.get(["downloadSelector", "selectorsVerified", "downloadRequestedTaskId"], settings => {
      if (!currentTask) { downloadRequested = false; return; }
      if (settings.downloadRequestedTaskId === currentTask.taskId) return;
      let button = null;
      if (settings.selectorsVerified === true && settings.downloadSelector) {
        try { button = document.querySelector(settings.downloadSelector); } catch (_) {}
      }
      if (!visible(button)) button = findButton(/download/i);
      if (!visible(button)) {
        downloadRequested = false;
        send("DOWNLOAD_SELECTOR_UNVERIFIED", { reason: "No unique visible Download control could be detected on this Flow page." });
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
  const detectedProject = projectIdentity(location.href);
  if (detectedProject) {
    chrome.storage.local.set({ lastFlowProject: { ...detectedProject, url: location.href, title: document.title, detectedAt: new Date().toISOString() } });
  }
  chrome.runtime.sendMessage({ type: "FLOW_PAGE_READY", title: document.title, project: detectedProject }, response => {
    if (chrome.runtime.lastError || !response?.task) return;
    execute(response.task);
  });

  // Read-only DOM diagnostic. It never clicks controls, changes settings or reads prompt contents.
  function diagnosticSelector(el) {
    const unique = selector => {
      try { return document.querySelectorAll(selector).length === 1 && document.querySelector(selector) === el; }
      catch (_) { return false; }
    };
    if (el.id) {
      const selector = "#" + CSS.escape(el.id);
      if (unique(selector)) return { selector, confidence: "high", basis: "unique id" };
    }
    for (const attr of ["data-testid", "data-test-id", "aria-label", "placeholder", "name", "title"]) {
      const value = el.getAttribute(attr);
      if (!value) continue;
      const selector = el.tagName.toLowerCase() + "[" + attr + "=\"" + CSS.escape(value) + "\"]";
      if (unique(selector)) return { selector, confidence: attr.startsWith("data-") || attr === "id" ? "high" : "medium", basis: "unique " + attr };
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
      let part = node.tagName.toLowerCase();
      if (node.id) {
        part += "#" + CSS.escape(node.id);
        parts.unshift(part);
        break;
      }
      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter(x => x.tagName === node.tagName);
        if (siblings.length > 1) part += ":nth-of-type(" + (siblings.indexOf(node) + 1) + ")";
      }
      parts.unshift(part);
      const candidate = parts.join(" > ");
      if (unique(candidate)) return { selector: candidate, confidence: "low", basis: "structural path; may change with UI updates" };
      node = parent;
    }
    return { selector: parts.join(" > "), confidence: "low", basis: "structural path; verify manually" };
  }
  function diagnosticElement(el) {
    const rect = el.getBoundingClientRect();
    const selector = diagnosticSelector(el);
    const isTextEntry = /^(TEXTAREA|INPUT)$/.test(el.tagName) || el.isContentEditable || el.getAttribute("role") === "textbox";
    const safeLabel = [
      el.getAttribute("aria-label"), el.getAttribute("placeholder"),
      el.getAttribute("data-placeholder"), el.getAttribute("title"),
      isTextEntry ? "" : el.innerText
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim().slice(0, 180);
    return {
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || "",
      type: el.getAttribute("type") || "",
      label: safeLabel,
      iconText: isTextEntry(el) ? "" : [...el.querySelectorAll("mat-icon, i, svg")].map(node => (node.textContent || "").trim()).filter(Boolean).join(" ").slice(0, 80),
      placeholder: el.getAttribute("placeholder") || "",
      ariaLabel: el.getAttribute("aria-label") || "",
      disabled: Boolean(el.disabled) || el.getAttribute("aria-disabled") === "true",
      contentEditable: Boolean(el.isContentEditable),
      visible: visible(el),
      bounds: { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) },
      selector: selector.selector,
      selectorConfidence: selector.confidence,
      selectorBasis: selector.basis
    };
  }
  function runDomDiagnostic() {
    const visibleElements = selector => [...document.querySelectorAll(selector)].filter(visible);
    const promptNodes = visibleElements('textarea, input, [contenteditable="true"], [role="textbox"]');
    const buttonNodes = visibleElements('button, [role="button"]');
    const settingNodes = visibleElements('select, [role="combobox"], [role="listbox"], [role="option"], [role="menuitem"], button, [role="button"]');
    const videoNodes = visibleElements("video");
    const promptCandidates = promptNodes.map(diagnosticElement);
    const buttonCandidates = buttonNodes.map(diagnosticElement);
    const downloadCandidates = buttonCandidates.filter(x => /download|save|export/i.test(x.label + " " + x.iconText));
    const settingCandidates = settingNodes.map(diagnosticElement).filter(x => /model|veo|quality|resolution|720|1080|duration|seconds|aspect|ratio|vertical|portrait|landscape|8s/i.test(x.label));
    return {
      schemaVersion: 1,
      capturedAt: new Date().toISOString(),
      page: { url: location.href, title: document.title, hostname: location.hostname, readyState: document.readyState },
      safety: { readOnly: true, clickedAnything: false, changedAnything: false, promptTextCaptured: false },
      counts: { prompts: promptCandidates.length, buttons: buttonCandidates.length, settings: settingCandidates.length, videos: videoNodes.length },
      promptCandidates,
      generateCandidates: buttonCandidates.filter(x => /generate|create|submit|make video|start generation|arrow_forward/i.test(x.label + " " + x.iconText)),
      downloadCandidates,
      settingCandidates,
      otherButtons: buttonCandidates.filter(x => !/generate|create|submit|make video|start generation|arrow_forward|download|save|export/i.test(x.label + " " + x.iconText)).slice(0, 100),
      videos: videoNodes.map(v => ({
        selector: diagnosticSelector(v).selector,
        readyState: v.readyState,
        durationSeconds: Number.isFinite(v.duration) ? v.duration : null,
        hasCurrentSource: Boolean(v.currentSrc),
        sourceProtocol: v.currentSrc ? (() => { try { return new URL(v.currentSrc).protocol; } catch (_) { return "unknown"; } })() : ""
      }))
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type !== "RUN_DOM_DIAGNOSTIC") return false;
    if (location.hostname !== "flow.google.com") {
      sendResponse({ ok: false, error: "Active tab is not Google Flow." });
      return false;
    }
    try { sendResponse({ ok: true, report: runDomDiagnostic() }); }
    catch (error) { sendResponse({ ok: false, error: String(error).slice(0, 300) }); }
    return false;
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