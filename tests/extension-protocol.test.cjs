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
