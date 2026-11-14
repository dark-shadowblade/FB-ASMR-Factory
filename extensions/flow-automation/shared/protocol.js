(function (root) {
  const VERSION = 1;
  const PROFILES = ["flow-1", "flow-2", "flow-3", "flow-4", "flow-5"];
  const COMMANDS = ["OPEN_PROJECT", "SUBMIT_PROMPT", "CHECK_STATUS", "DOWNLOAD_VIDEO", "PAUSE", "RESUME", "CANCEL"];
  function validTask(task, expectedProfile) {
    return !!task && task.protocolVersion === VERSION &&
      typeof task.taskId === "string" && typeof task.jobId === "string" &&
      typeof task.clipId === "string" && task.profileId === expectedProfile &&
      PROFILES.includes(task.profileId) && typeof task.projectUrl === "string" &&
      /^https:\/\/flow\.google\.com\/project\/[A-Za-z0-9-]{12,}/.test(task.projectUrl) &&
      typeof task.prompt === "string" && task.prompt.trim().length >= 40;
  }
  function makeMessage(type, task, payload = {}) {
    return { protocolVersion: VERSION, messageId: crypto.randomUUID(), type,
      taskId: task?.taskId || null, jobId: task?.jobId || null,
      clipId: task?.clipId || null, profileId: task?.profileId || null,
      timestamp: new Date().toISOString(), payload };
  }
  const api = { VERSION, PROFILES, COMMANDS, validTask, makeMessage };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.ASMRFlowProtocol = api;
})(typeof self !== "undefined" ? self : globalThis);