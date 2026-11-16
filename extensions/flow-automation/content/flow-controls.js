(() => {
  if (window.ASMRFlowControls) return;

  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const visible = el => Boolean(el && el.isConnected && (el.getClientRects().length || el.offsetWidth || el.offsetHeight));
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  const label = el => clean([
    el?.getAttribute?.("aria-label"),
    el?.getAttribute?.("aria-valuetext"),
    el?.getAttribute?.("title"),
    el?.innerText,
    el?.textContent
  ].filter(Boolean).join(" "));
  const enabled = el => visible(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true";
  const normalized = value => clean(value).toLowerCase().replace(/\s+/g, "").replace(/[×✕]/g, "x");
  const selected = el => Boolean(
    el?.getAttribute("aria-checked") === "true" ||
    el?.getAttribute("aria-pressed") === "true" ||
    el?.getAttribute("aria-selected") === "true" ||
    el?.getAttribute("data-state") === "on" ||
    el?.classList?.contains("mat-radio-checked") ||
    el?.classList?.contains("mat-button-toggle-checked") ||
    el?.classList?.contains("selected")
  );

  function uniqueVisible(selector, root = document) {
    let nodes;
    try { nodes = [...root.querySelectorAll(selector)].filter(visible); }
    catch (_) { return { element: null, reason: "Invalid selector: " + selector }; }
    if (nodes.length !== 1) return { element: null, reason: nodes.length ? "Ambiguous control (" + nodes.length + " matches): " + selector : "Control not found: " + selector };
    return { element: nodes[0], reason: "" };
  }

  function exactOption(candidates, expected, kind) {
    const wanted = normalized(expected);
    const matches = candidates.filter(el => {
      const values = [
        el.getAttribute("aria-label"),
        el.getAttribute("value"),
        el.innerText,
        el.textContent
      ].map(normalized).filter(Boolean);
      return values.some(value => value === wanted || value.startsWith(wanted + "(") || value.startsWith(wanted + " "));
    });
    if (matches.length !== 1) {
      return { element: null, reason: matches.length ? "Ambiguous " + kind + " option for " + expected : kind + " option not offered: " + expected };
    }
    return { element: matches[0], reason: "" };
  }

  async function clickAndVerify(element, description) {
    if (!enabled(element)) return { ok: false, reason: description + " is not visible and enabled." };
    if (!selected(element)) {
      element.click();
      await sleep(300);
    }
    if (!selected(element)) {
      const state = element.getAttribute("aria-checked") || element.getAttribute("aria-pressed") || element.getAttribute("data-state") || "";
      // Some Flow menu items close their menu after selection without exposing an ARIA state.
      if (element.isConnected && state !== "false") return { ok: true, verified: "clicked" };
      return { ok: false, reason: description + " was clicked but Flow did not expose a selected state." };
    }
    return { ok: true, verified: "selected" };
  }

  async function openSettingsPanel() {
    const existing = [...document.querySelectorAll('.cdk-overlay-pane button[role="radio"], [role="dialog"] button[role="radio"]')].filter(visible);
    if (existing.length) return { ok: true, openedByUs: false };
    const candidates = [...document.querySelectorAll("button.settings-trigger-button, button[aria-label='Settings trigger']")].filter(enabled);
    if (candidates.length !== 1) return { ok: false, reason: candidates.length ? "Settings panel trigger is ambiguous." : "Settings panel trigger was not found." };
    candidates[0].click();
    for (let i = 0; i < 30; i++) {
      await sleep(150);
      const radios = [...document.querySelectorAll('.cdk-overlay-pane button[role="radio"], [role="dialog"] button[role="radio"]')].filter(visible);
      if (radios.length) return { ok: true, openedByUs: true };
    }
    return { ok: false, reason: "Flow settings panel did not open." };
  }

  async function selectVideoMode() {
    const candidates = [...document.querySelectorAll('.cdk-overlay-pane button[role="radio"], [role="dialog"] button[role="radio"]')].filter(visible);
    const video = candidates.filter(el => /^video$/i.test(label(el)));
    if (!video.length) return { ok: true, verified: "not-exposed" };
    if (video.length !== 1) return { ok: false, reason: "Video mode option is ambiguous." };
    return clickAndVerify(video[0], "Video mode");
  }


  async function selectOutputCount(count = 1) {
    const expected = "x" + Number(count);
    const candidates = [...document.querySelectorAll('button[role="radio"], [role="radio"]')].filter(visible);
    const matches = candidates.filter(el => normalized(label(el)) === normalized(expected));
    if (!matches.length) return { ok: true, verified: "not-exposed" };
    if (matches.length !== 1) return { ok: false, reason: "Output-count option is ambiguous: " + expected };
    return clickAndVerify(matches[0], "Output count " + expected);
  }

  async function selectAspectRatio(value) {
    if (!value) return { ok: true, verified: "not-requested" };
    const iconNames = { "1:1": "crop_square", "4:3": "crop_landscape", "3:4": "crop_portrait", "16:9": "crop_16_9", "9:16": "crop_9_16" };
    const wanted = normalized(value);
    const radios = [...document.querySelectorAll('button[role="radio"], [role="radio"]')].filter(visible);
    let matches = radios.filter(el => {
      const text = normalized(label(el));
      const icon = [...el.querySelectorAll("mat-icon, i")].map(node => clean(node.textContent)).join(" ");
      return text.includes(wanted) || (iconNames[value] && icon.includes(iconNames[value]));
    });
    if (matches.length !== 1) return { ok: false, reason: matches.length ? "Aspect-ratio option is ambiguous: " + value : "Aspect-ratio option not found: " + value };
    return clickAndVerify(matches[0], "Aspect ratio " + value);
  }

  function modelTokens(value) {
    return normalized(value).match(/[a-z]+|\d+(?:\.\d+)?/g) || [];
  }
  async function selectModel(value) {
    if (!value) return { ok: false, reason: "Task did not provide a model." };
    const triggerResult = uniqueVisible('button[aria-label="Select model family"]');
    if (!triggerResult.element) return { ok: false, reason: "Model picker trigger unavailable: " + triggerResult.reason };
    const trigger = triggerResult.element;
    const current = label(trigger);
    const aliases = { "nano banana 2": "Nano Banana 2.1", "omni flash": "Omni 1.1 Flash" };
    const wantedModel = aliases[String(value).toLowerCase()] || value;
    const wantedTokens = modelTokens(wantedModel);
    const currentTokens = modelTokens(current);
    if (wantedTokens.length && wantedTokens.every(token => currentTokens.includes(token))) {
      return { ok: true, actual: current, verified: "already-selected" };
    }
    trigger.click();
    let options = [];
    for (let i = 0; i < 20; i++) {
      await sleep(150);
      options = [...document.querySelectorAll('.flow-model-picker-panel button[role="menuitem"], [role="menu"].flow-model-picker-panel button[role="menuitem"], [role="menu"] button[role="menuitem"]')]
        .filter(enabled)
        .filter(el => /veo|nano|banana|omni|flash|imagen/i.test(label(el)));
      if (options.length) break;
    }
    const matches = options.filter(el => {
      const tokens = modelTokens(label(el));
      return wantedTokens.length && wantedTokens.every(token => tokens.includes(token));
    });
    if (matches.length !== 1) return { ok: false, reason: matches.length ? "Model option is ambiguous: " + wantedModel : "Model option not found in Flow menu: " + wantedModel, available: options.map(label).slice(0, 20) };
    const chosenLabel = label(matches[0]);
    matches[0].click();
    await sleep(350);
    const updated = label(trigger);
    const updatedTokens = modelTokens(updated);
    if (!wantedTokens.every(token => updatedTokens.includes(token)) && !wantedTokens.every(token => modelTokens(chosenLabel).includes(token))) {
      return { ok: false, reason: "Flow did not confirm the requested model after selection.", actual: updated };
    }
    return { ok: true, actual: chosenLabel, verified: "menu-selection" };
  }

  async function selectResolution(value) {
    if (!value) return { ok: false, reason: "Task did not provide a resolution." };
    const wanted = normalized(value);
    const candidates = [...document.querySelectorAll('button[role="radio"], [role="radio"]')].filter(visible);
    const matching = candidates.filter(el => {
      const text = normalized(label(el));
      return text === wanted || text.startsWith(wanted);
    });
    if (matching.length === 1) return clickAndVerify(matching[0], "Resolution " + value);
    if (matching.length > 1) return { ok: false, reason: "Resolution option is ambiguous: " + value };
    return { ok: false, reason: "Resolution option not offered by this model: " + value };
  }

  async function selectDuration(seconds) {
    const target = Number(seconds);
    if (!Number.isFinite(target) || target <= 0) return { ok: false, reason: "Task duration is missing or invalid." };
    const slider = document.querySelector('flow-duration-slider input[type="range"], input[type="range"][aria-label="Length"]');
    if (!slider || !visible(slider)) {
      // Some Flow models have a fixed duration and do not expose a duration slider.
      // Do not claim it was set; the orchestrator's media validation must check the downloaded clip.
      return { ok: true, verified: "model-fixed-or-not-exposed", requestedSeconds: target };
    }
    const min = Number(slider.min || 0);
    const max = Number(slider.max || 12);
    // The reference Flow UI maps slider value 0 to a 3-second clip.
    const raw = target - 3 + min;
    if (raw < min || raw > max) return { ok: false, reason: "Requested duration " + target + "s is outside the visible Flow slider range." };
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    slider.focus();
    if (setter) setter.call(slider, String(raw)); else slider.value = String(raw);
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    slider.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(300);
    const display = document.querySelector("flow-duration-slider .duration-slider-value");
    const actualText = clean(display?.textContent || slider.getAttribute("aria-valuetext") || "");
    if (actualText && !new RegExp("^" + target + "\\s*(s|sec|seconds?)?$", "i").test(actualText)) {
      return { ok: false, reason: "Flow duration did not match the requested value.", actual: actualText };
    }
    return { ok: true, actual: actualText || target + "s", verified: actualText ? "display" : "slider-value" };
  }


  function mediaIds() {
    const ids = new Set();
    for (const node of document.querySelectorAll("[data-media-id]")) {
      const id = clean(node.getAttribute("data-media-id"));
      if (id) ids.add(id);
    }
    return [...ids];
  }

  function mediaTile(mediaId) {
    const marker = [...document.querySelectorAll("[data-media-id]")].find(node => node.getAttribute("data-media-id") === mediaId);
    if (!marker) return null;
    return marker.closest("flow-grid-tile-container, flow-tile-container, .tile-row, [class*='tile-row']") || marker.parentElement;
  }

  function findNewMediaId(baselineIds = []) {
    const baseline = new Set(baselineIds);
    const candidates = [...document.querySelectorAll("[data-media-id]")]
      .map(node => clean(node.getAttribute("data-media-id")))
      .filter(Boolean);
    const fresh = [...new Set(candidates)].filter(id => !baseline.has(id));
    return fresh.length === 1 ? fresh[0] : null;
  }

  function mediaTileReady(mediaId) {
    const tile = mediaTile(mediaId);
    if (!tile || !visible(tile)) return false;
    const playable = [...tile.querySelectorAll("video")].some(video =>
      visible(video) && video.readyState >= 2 && Number.isFinite(video.duration) && video.duration > 0
    );
    return playable;
  }

  async function downloadMediaTile(mediaId) {
    const tile = mediaTile(mediaId);
    if (!tile) return { ok: false, reason: "Generated media tile not found for " + mediaId };
    const buttons = [...tile.querySelectorAll("button,[role='button']")].filter(enabled);
    let menuButton = buttons.find(button => /more options|more actions/i.test(label(button)));
    if (!menuButton) menuButton = buttons.find(button => [...button.querySelectorAll("mat-icon,i")].some(icon => /more_vert|more_horiz|more/i.test(clean(icon.textContent))));
    if (!menuButton) return { ok: false, reason: "More-options control not found inside generated tile." };
    menuButton.click();
    let download = null;
    for (let i = 0; i < 25; i++) {
      await sleep(120);
      const items = [...document.querySelectorAll("[role='menu'] button[role='menuitem'], [role='menu'] [role='menuitem']")].filter(enabled);
      const matches = items.filter(item => /\bdownload\b/i.test(label(item)));
      if (matches.length === 1) { download = matches[0]; break; }
      if (matches.length > 1) return { ok: false, reason: "Download menu item is ambiguous for generated tile." };
    }
    if (!download) return { ok: false, reason: "Flow tile menu did not expose a Download action." };
    download.click();
    return { ok: true, mediaId, method: "tile-menu" };
  }

  async function applySettings(settings = {}) {
    const actual = {};
    const panel = await openSettingsPanel();
    if (!panel.ok) return { ok: false, reason: panel.reason, actual };
    const mode = await selectVideoMode();
    if (!mode.ok) return { ok: false, reason: mode.reason, actual };
    actual.mode = "video";
    const ratio = await selectAspectRatio(settings.aspectRatio || "9:16");
    if (!ratio.ok) return { ok: false, reason: ratio.reason, actual };
    actual.aspectRatio = settings.aspectRatio || "9:16";
    const outputCount = await selectOutputCount(settings.outputCount ?? 1);
    if (!outputCount.ok) return { ok: false, reason: outputCount.reason, actual };
    actual.outputCount = settings.outputCount ?? 1;
    if (panel.openedByUs) {
      const close = uniqueVisible("button.settings-trigger-button, button[aria-label='Settings trigger']");
      if (close.element) {
        close.element.click();
        await sleep(250);
      }
    }
    const model = await selectModel(settings.model);
    if (!model.ok) return { ok: false, reason: model.reason, actual, available: model.available || [] };
    actual.model = model.actual || settings.model;
    const resolution = await selectResolution(settings.resolution);
    if (!resolution.ok) return { ok: false, reason: resolution.reason, actual };
    actual.resolution = settings.resolution;
    const duration = await selectDuration(settings.durationSeconds);
    if (!duration.ok) return { ok: false, reason: duration.reason, actual };
    actual.duration = duration.actual || settings.durationSeconds + "s";
    actual.durationVerification = duration.verified;
    return { ok: true, actual, verified: { model: model.verified, aspectRatio: ratio.verified, resolution: resolution.verified, duration: duration.verified } };
  }

  window.ASMRFlowControls = Object.freeze({ applySettings, mediaIds, findNewMediaId, mediaTileReady, downloadMediaTile });
})();