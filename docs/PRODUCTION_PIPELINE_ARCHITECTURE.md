# Production Pipeline Architecture

**Status:** Foundation design for implementation  
**Scope:** Main production workflow first; desktop UI is a thin control/observability layer.

This document defines how the existing desktop app, FastAPI orchestrator, SQLite store, five persistent Chrome profiles, Flow extension, media pipeline and Meta publisher work together. It is an implementation contract, not a claim that every stage is already production-ready.

## 1. Core architecture

- **Desktop app — control plane:** submits a job request and renders authoritative job/clip state. It must not own workflow state or coordinate browser tabs itself.
- **Orchestrator — source of truth:** validates requests, persists jobs/tasks/events, assigns work to profiles, handles retries/recovery, and invokes media/publishing services.
- **SQLite — durable ledger:** records every job, clip, task attempt, event, output and publication attempt. Browser memory is never authoritative.
- **Five Flow workers — execution plane:** one persistent Chrome profile and one extension instance per profile. A profile executes at most one active clip task at a time.
- **Extension — Flow adapter:** detects the active project, verifies the visible controls/settings, submits the assigned prompt once, observes generation, downloads the result and reports evidence.
- **Media worker — deterministic processing:** validates task-associated files, normalizes/assembles five clips and verifies the final MP4.
- **Meta adapter — publication boundary:** uploads the final artifact through supported Graph API operations and persists the returned identifiers/status.

The extension must never decide that a job is complete. Only the orchestrator may advance durable job state after receiving and validating evidence.

## 2. Job pipeline

```text
CREATE JOB
  -> PLAN FIVE CLIPS
  -> GENERATE / EDIT PROMPTS
  -> APPROVE PROMPT PACK
  -> PREFLIGHT FIVE PROFILES
  -> CREATE FIVE CLIP TASKS
  -> DISPATCH TO MATCHING PROFILES
  -> OPEN / VERIFY FLOW PROJECT
  -> VERIFY SETTINGS
  -> SUBMIT PROMPT ONCE
  -> OBSERVE GENERATION
  -> DOWNLOAD TO JOB/CLIP DESTINATION
  -> VALIDATE EACH SOURCE CLIP
  -> ASSEMBLE FIVE CLIPS
  -> VALIDATE FINAL MP4
  -> SAVE LIBRARY OUTPUT + METADATA
  -> PUBLISH IF PAGE IS CONFIGURED
  -> VERIFY PUBLICATION STATUS
```

Prompt planning and browser preparation may overlap only when their dependencies are satisfied. A clip cannot be dispatched until its exact prompt is persisted and approved. Assembly cannot start until all five clip records have validated downloads.

## 3. Job and clip ownership

A job owns exactly five ordered clip records for the selected ASMR style. Each clip has:
- stable clip ID and order;
- subject and exact approved prompt;
- assigned Flow profile;
- current state and attempt count;
- current task ID;
- download path and FFprobe metadata, once validated;
- last error code/message and timestamps.

A task is an execution attempt for one clip. Retries create a new task-attempt identity or an explicitly versioned attempt; they must not overwrite successful clip media or erase the prior attempt history. A profile lease prevents two active tasks from using the same browser profile concurrently.

## 4. Durable state machines

### Job states

```text
draft -> prompts_ready -> prompts_approved -> queued -> running
running -> processing -> media_ready -> publishing -> completed
any nonterminal state -> paused | failed | cancelled
```

The implementation may retain existing status names for compatibility, but transitions must be validated centrally. A status update must be committed with its event record in one SQLite transaction.

### Clip states

```text
planned -> prompt_ready -> approved -> queued -> leased
leased -> project_open -> settings_verified -> submitted
submitted -> generating -> generation_completed
generation_completed -> downloading -> downloaded
downloaded -> validating -> ready
any active state -> paused | failed | blocked_ui | blocked_settings | needs_login
```

A clip reaches `ready` only after the file passes media validation. A browser event saying “download completed” is evidence to inspect the file, not by itself proof of a valid clip.

## 5. Five-profile scheduling rules

- Stable profile IDs: `flow-1` through `flow-5`.
- Initial assignment: clip order 1–5 maps to profiles 1–5.
- Each extension instance is paired to exactly one profile ID and unique instance ID.
- A worker claims only tasks assigned to its own profile.
- A profile may hold at most one active lease.
- Offline workers leave tasks queued; they do not cause tasks to be reassigned silently.
- A saved Flow project URL is preferred. If no project exists, the workflow must explicitly create/select a project using a verified Flow UI path or stop for user action. It must not guess at project-creation controls.
- Google sign-in challenges, CAPTCHAs, changed UI, quota limits and account restrictions are stop conditions requiring user attention, not conditions to bypass.

## 6. Extension protocol and evidence

Every task and event carries protocol version, message ID, job ID, clip ID, task ID, profile ID, extension instance ID and timestamp. The backend validates the full identity tuple.

Expected evidence events:
1. task accepted;
2. target project opened and identity matched;
3. settings visibly verified;
4. prompt inserted and verified;
5. Generate action confirmed;
6. generation observed;
7. generation completion observed;
8. download initiated;
9. download completed with path and size;
10. task blocked or failed with a machine-readable reason.

Event delivery is at-least-once. The backend deduplicates by message ID and applies transitions idempotently. The extension keeps an outbox until the backend acknowledges each event. Never infer success from a click alone.

Prompt submission and Generate must remain disabled unless the prompt field, Generate control and requested settings are verified against the live Flow page. A selector diagnostic is read-only; it does not itself verify that a control is safe to operate.

## 7. File and media contract

Use an isolated directory per job, with stable clip-specific destinations, for example:

```text
data/
  jobs/<job-id>/
    clips/
      01-<clip-id>.mp4
      02-<clip-id>.mp4
      ...
    work/
    final.mp4
    metadata.json
    logs/
```

The extension reports the browser download identity/path; the orchestrator validates that the resolved path is inside the configured download/job root before accepting it. The preferred final design is to move/copy a completed download atomically into its job/clip destination after the browser download is stable.

Validation requirements:
- file exists, is non-empty and no longer changing;
- FFprobe can read it;
- expected video and audio streams are present (or an explicitly supported silent-clip policy is applied);
- duration is within the configured clip tolerance;
- dimensions/aspect ratio meet the output policy;
- codec/frame-rate differences are normalized before concatenation.

Do not require identical source codecs/resolutions as a substitute for normalization. Produce a temporary normalized intermediate for each source, concatenate in approved clip order, probe the final file, and only then register it in Library. Keep source clips for recovery.

## 8. Recovery and retry rules

On orchestrator startup and before resuming a job:
1. load nonterminal jobs and task attempts;
2. compare database state with worker heartbeats, extension outboxes and actual files;
3. verify whether a generation is still active before issuing another submit;
4. verify whether a download is complete before restarting it;
5. re-run FFprobe on any uncommitted candidate file;
6. preserve already-ready clips and completed outputs;
7. requeue only tasks whose last confirmed state is safely retryable.

Retry is per clip, not per job. A failed clip can be retried without regenerating the other four. A task in an uncertain generation state must be reconciled with the live Flow page before retrying. A publication with an uncertain result must never be automatically uploaded again; query the existing Meta video/post status or require manual review.

Pause stops new task claims and asks active workers to pause at a safe boundary. Cancel prevents new work and records cancellation; it must not delete source media or interrupt a file write in progress. Resume reconciles first, then requeues safe work.

## 9. Assembly and publication

Assembly is a job-level operation guarded by a database claim/lock so two triggers cannot assemble the same job concurrently. It consumes exactly five ready clip records in approved order. The output is written to a temporary path, validated, and atomically promoted to the final path before the output row is committed.

Metadata is generated once per job after the clip subjects are known and stored with the output. Publishing is a separate durable state machine:
```text
not_configured -> ready -> uploading -> processing -> published
                                      -> failed | uncertain
```
Store the selected Page/account ID, Meta video ID, post ID, attempt timestamps and last response. A unique publication record per job prevents duplicate posts. If Meta returns an ambiguous network result, mark it uncertain and require status reconciliation; do not retry blindly.

## 10. Implementation order

1. **Workflow invariants and durable state:** central transition helpers, job/clip/task attempt records, unique active profile leases, idempotent event application.
2. **Preflight and dispatch:** validate five approved prompts and five profile mappings; permit offline workers to claim later; explicit missing-project handling.
3. **Flow execution contract:** live selector verification, exact prompt-to-profile assignment, single-submit guard, bounded generation observation and download evidence.
4. **Download ingestion:** stable-file detection, safe path validation, per-job/per-clip storage and FFprobe metadata.
5. **Recovery engine:** startup reconciliation, stale lease handling, per-clip retry and safe pause/resume/cancel.
6. **Media pipeline:** normalization, ordered assembly, final validation and atomic Library registration.
7. **Publication pipeline:** Meta upload ledger, status polling and duplicate-safe recovery.
8. **Desktop integration:** connect existing controls to these APIs and show real job/clip state. Do not redesign the UI as part of backend work.

## 11. Current implementation boundary

Already present in the repository: five prompt generation, saved Flow profile URLs, persistent Chrome profile launching, authenticated extension bridge, per-profile task queue, event deduplication, task retry endpoint, download event reporting, FFmpeg/FFprobe assembly, Library output records, AI metadata fallback and Meta Reels publishing code.

Known gaps to address before claiming full automation:
- the current Generate Video action is temporarily limited to opening the five browsers;
- dispatch currently requires saved project URLs for all five profiles;
- Flow selectors and settings have not been verified against the user's live signed-in Flow UI;
- the current media assembler expects already-compatible vertical H.264/AAC clips instead of normalizing varied valid inputs;
- full startup reconciliation and automatic safe retry/backoff are incomplete;
- Meta Page onboarding and real Page publishing remain to be verified on the user's account.

This document is the architectural contract for closing those gaps in the order above. Do not mark a stage complete until code, tests and evidence support it.
