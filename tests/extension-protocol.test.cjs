const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../extensions/flow-automation/shared/protocol.js");
const base = { protocolVersion: 1, taskId:"t1", jobId:"j1", clipId:"c1", profileId:"flow-1",
  projectUrl:"https://flow.google.com/project/12345678-abcd", prompt:"A sufficiently long approved ASMR prompt that describes a complete video scene." };
test("accepts a task assigned to the same profile",()=>assert.equal(P.validTask(base,"flow-1"),true));
test("rejects cross-profile task delivery",()=>assert.equal(P.validTask(base,"flow-2"),false));
test("rejects unsupported profile IDs",()=>assert.equal(P.validTask({...base,profileId:"flow-6"},"flow-6"),false));
test("rejects malformed project URLs",()=>assert.equal(P.validTask({...base,projectUrl:"https://example.com/project/12345678"},"flow-1"),false));
test("rejects short prompts",()=>assert.equal(P.validTask({...base,prompt:"short"},"flow-1"),false));
test("message includes immutable task identity",()=>{const m=P.makeMessage("GENERATION_STARTED",base);assert.equal(m.taskId,base.taskId);assert.equal(m.profileId,base.profileId);assert.equal(m.protocolVersion,1);});

const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
test("extension JavaScript files parse without syntax errors", () => {
  const root = path.resolve(__dirname, "../extensions/flow-automation");
  for (const file of ["background/service-worker.js", "content/flow-controls.js", "content/content.js", "shared/protocol.js", "options/options.js"]) {
    new vm.Script(fs.readFileSync(path.join(root, file), "utf8"), { filename: file });
  }
});
test("Manifest V3 permissions and Flow host scope are declared", () => {
  const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes("downloads"));
  assert.ok(manifest.host_permissions.includes("https://flow.google.com/*"));
  assert.ok(manifest.host_permissions.includes("http://127.0.0.1:8765/*"));
});

test("saving extension settings preserves an in-flight task", () => {
  const worker = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/background/service-worker.js"), "utf8");
  const configHandler = worker.slice(worker.indexOf('message?.type === "CONFIG_UPDATED"'));
  assert.match(configHandler, /Saving options must not discard an in-flight task/);
  assert.doesNotMatch(configHandler.slice(0, configHandler.indexOf('chrome.runtime.onMessage.addListener', 10)), /activeTask\s*=\s*null/);
});
test("Flow ready state requires playable video and a download control", () => {
  const content = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/content/content.js"), "utf8");
  assert.match(content, /if \(videoReady\(\)\) return "VIDEO_READY"/);
  assert.doesNotMatch(content, /download video\|download/);
});
test("options page exposes profile, diagnostics and responsive stylesheet", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/options/options.html"), "utf8");
  assert.match(html, /id="profileId"/);
  assert.match(html, /id="scan"/);
  assert.match(html, /href="options.css"/);
});

test("Flow project identity is persisted and compared by project ID", () => {
  const content = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/content/content.js"), "utf8");
  const worker = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/background/service-worker.js"), "utf8");
  assert.match(content, /function projectIdentity\(url\)/);
  assert.match(content, /lastFlowProject:/);
  assert.match(content, /sameProject\(location\.href, task\.projectUrl\)/);
  assert.match(worker, /function flowProjectIdentity\(url\)/);
  assert.match(worker, /sameFlowProject\(tab\.url \|\| "", activeTask\.projectUrl\)/);
  assert.match(worker, /matchesAssignedProject:/);
});

test("Flow generation settings are actively applied from the assigned desktop task", () => {
  const content = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/content/content.js"), "utf8");
  const controls = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/content/flow-controls.js"), "utf8");
  assert.match(content, /window\.ASMRFlowControls\.applySettings\(task\.settings \|\| \{\}\)/);
  assert.match(controls, /settings\.model/);
  assert.match(controls, /settings\.resolution/);
  assert.match(controls, /settings\.durationSeconds/);
  assert.match(controls, /settings\.aspectRatio/);
  assert.match(controls, /button\[aria-label="Select model family"\]/);
  assert.match(controls, /flow-duration-slider input\[type="range"\]/);
});

test("Flow adapter uses reference-informed selectors and targets only the new output tile", () => {
  const content = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/content/content.js"), "utf8");
  const controls = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/content/flow-controls.js"), "utf8");
  assert.match(content, /div\.ProseMirror\[contenteditable='true'\]/);
  assert.match(content, /button\.generate-icon-button\[type="submit"\]/);
  assert.match(content, /flowBaselineByTask/);
  assert.match(controls, /\[data-media-id\]/);
  assert.match(controls, /findNewMediaId/);
  assert.match(controls, /downloadMediaTile/);
  assert.match(controls, /more options/i);
});

test("extension options render live profile, project and assigned settings", () => {
  const html = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/options/options.html"), "utf8");
  const js = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/options/options.js"), "utf8");
  for (const id of ["liveProfile","liveConnection","liveProject","liveProjectMeta","liveModel","liveQuality","liveDuration","liveRatio","liveTaskMeta","refreshLiveStatus"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(js, /extensionTaskSnapshot/);
  assert.match(js, /lastFlowProject/);
  assert.match(js, /chrome\.storage\.onChanged/);
  assert.match(js, /Waiting for worker registration/);
});

test("background stores assigned generation settings and task events for the extension panel", () => {
  const worker = fs.readFileSync(path.resolve(__dirname, "../extensions/flow-automation/background/service-worker.js"), "utf8");
  assert.match(worker, /extensionTaskSnapshot:/);
  assert.match(worker, /durationSeconds: assignedSettings\.durationSeconds/);
  assert.match(worker, /extensionWorkerStatus:/);
  assert.match(worker, /lastEvent: message\.event/);
});
