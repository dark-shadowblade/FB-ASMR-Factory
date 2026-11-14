# Project Progress & Remaining Work

**Project:** FB-ASMR-Factory  
**Repository:** https://github.com/dark-shadowblade/FB-ASMR-Factory  
**Last updated:** 2026-11-14

This file is the project handover and live progress tracker. Update it whenever implementation or testing changes. A planned feature is not complete merely because it is described in the specification.

## 1. Current verified state

### Completed
- [x] User created the GitHub repository `dark-shadowblade/FB-ASMR-Factory`.
- [x] GitHub integration can access the repository with push/admin permissions.
- [x] Default branch confirmed as `main`.
- [x] Product direction and first-release scope documented.
- [x] Detailed requirements, architecture proposal, workflows, safeguards and acceptance criteria documented in `docs/PROJECT_SPECIFICATION.md`.
- [x] Main project overview documented in `README.md`.
- [x] This progress tracker created.

### Important repository setting
At verification on 2026-11-14, GitHub reported repository visibility as **Public**. The earlier requested setting was Private. This has not been changed automatically. Decide whether to change it in GitHub repository Settings → General → Danger Zone → Change repository visibility.

### Not yet implemented or verified
- [x] Initial Electron + React + TypeScript desktop scaffold.
- [x] Initial dashboard UI with Fruits-only job creation and job history.
- [x] Python/FastAPI local orchestrator scaffold.
- [x] SQLite persistence for jobs, clips and job events.
- [x] Backend API to create/list/read jobs and approve the five-clip placeholder plan.
- [x] Windows development setup guide.
- [x] Initial unit tests for five-clip job rules (written; execution still needs local verification).
- [ ] AI prompt generation provider integration.
- [ ] Persistent ASMR Style Bible and Prompt Studio.
- [ ] Chrome Manifest V3 extension.
- [ ] Chrome profile/session management.
- [ ] Saved Flow project URL per profile.
- [ ] Actual Google Flow UI automation.
- [ ] Veo 3.1 Lite / 720p / 8-second settings detection and selection.
- [ ] Prompt submission, clearing and generation completion detection.
- [ ] Download association and validation.
- [ ] FFmpeg/FFprobe media pipeline.
- [ ] Job recovery and retry behavior.
- [ ] Video Library and thumbnails.
- [ ] Meta authentication, Page selection and Graph API publishing.
- [ ] Publication verification and duplicate prevention.
- [ ] Optional scheduler.
- [ ] Windows installer and end-to-end tests.

**Current truthful milestone:** Initial desktop/backend scaffold committed. The local job-planning path is implemented in code, but it has not yet been run or verified on the user's Windows machine. Flow generation, media processing and Facebook publishing remain unimplemented.

## 2. Product rules that must not be lost

- First implementation generates **fruit-cutting ASMR only**.
- A Fruits job creates exactly **five distinct fruit prompts**.
- Each clip targets **8 seconds**, giving an approximately **40-second** compilation.
- Flow defaults: **Veo 3.1 Lite, 720p, 8 seconds**, subject to availability in the signed-in account.
- Up to five separate Google Flow browser profiles/accounts, with each prompt assigned to its own session.
- Remember each profile's Flow project URL and open it directly on subsequent jobs.
- Clear the submitted prompt from the input after confirmed submission to avoid accidental reuse.
- Keep every job's clips, prompts, logs and final output isolated by unique job ID and topic/date.
- Do not merge incomplete/corrupt clips.
- Preserve manual recovery paths.
- Facebook publishing must use supported official API capabilities, secure credentials and duplicate safeguards.
- Scheduler is optional and only runs when the computer is awake and the app/service is active.
- Other reserved themes (Soaps, Clay, Kinetic Sand, Slime, Satisfying Objects/Materials, Mixed ASMR) are future scope and must not enter a Fruits job.

## 3. Development roadmap

### Milestone 0 — Repository and documentation
- [x] Create repository.
- [x] Add README.
- [x] Add detailed product specification.
- [x] Add progress tracker.
- [ ] Add architecture decision records and development setup guide.

**Exit condition:** Requirements and first milestone are clear enough to implement without guessing.

### Milestone 1 — Desktop foundation and local job engine
- [x] Create initial Electron + React + TypeScript scaffold.
- [x] Create initial Python FastAPI local service.
- [x] Add SQLite persistence for jobs, clips and job events.
- [x] Implement initial dashboard and navigation shell.
- [x] Implement topic input and Fruits-only theme selection.
- [x] Implement job creation with exactly five placeholder clip records and unique IDs.
- [x] Implement job listing/detail retrieval and draft-plan approval endpoint.
- [x] Add Windows setup instructions.
- [ ] Install dependencies and run the desktop app on Windows.
- [ ] Execute backend unit tests and fix any failures.
- [ ] Add safe job pause/resume/cancel and robust state transition rules.
- [ ] Add explicit mock-generation mode and better queue controls.

**Exit condition:** User can create a job, inspect five persisted clip tasks, see progress and reopen the app without losing job state. This milestone is scaffolded but not yet verified end-to-end.

### Milestone 2 — AI Director and Prompt Studio
- [ ] Define and store the shared ASMR Style Bible.
- [ ] Define a structured prompt schema.
- [ ] Implement exactly five distinct fruit concepts per Fruits job.
- [ ] Add configurable OpenAI-compatible provider settings.
- [ ] Add manual prompt fallback.
- [ ] Add prompt review, editing, approval and per-prompt regeneration.
- [ ] Save the exact approved prompt text and provider metadata.

**Exit condition:** Five distinct approved fruit prompts are stored and tied to one job.

### Milestone 3 — Chrome extension and browser sessions
- [ ] Build Manifest V3 extension skeleton.
- [ ] Define typed message contracts between extension and orchestrator.
- [ ] Register up to five browser profiles.
- [ ] Provide visible sign-in/readiness checks.
- [ ] Store a Flow project URL for each profile.
- [ ] Open the remembered project URL directly.
- [ ] Show session status in the desktop app.
- [ ] Add safe manual fallback.

**Exit condition:** App can identify the correct profile and open its configured Flow project without mixing accounts.

### Milestone 4 — Google Flow generation
- [ ] Inspect and document the current Flow UI.
- [ ] Implement robust page-state detection and selectors.
- [ ] Detect/select Veo 3.1 Lite, 720p and 8 seconds when available.
- [ ] Submit one job-scoped prompt exactly once.
- [ ] Clear the input after confirmed submission.
- [ ] Wait for observable generation completion.
- [ ] Initiate and track download.
- [ ] Report success/failure to the orchestrator.
- [ ] Test each of the five independent sessions.

**Exit condition:** Five test prompts can be generated and downloaded into the correct job/clip records without prompt/account mix-ups.

### Milestone 5 — Media validation and compilation
- [ ] Bundle or locate FFmpeg and FFprobe.
- [ ] Detect completed downloads.
- [ ] Validate size, duration, streams and media readability.
- [ ] Normalize dimensions/aspect ratio/frame rate/audio.
- [ ] Merge five clips in the approved order.
- [ ] Validate the final MP4.
- [ ] Generate thumbnail and metadata.
- [ ] Preserve source files and diagnostics.

**Exit condition:** Five valid source clips produce one verified vertical MP4 of approximately 40 seconds.

### Milestone 6 — Video Library and recovery
- [ ] Build searchable Library UI.
- [ ] Show thumbnails, topic, timestamp, duration and status.
- [ ] Open/play output and reveal containing folder.
- [ ] Show job details and source clips.
- [ ] Implement retry of failed clip only.
- [ ] Implement pause/resume/cancel safely.
- [ ] Recover interrupted jobs after restart.
- [ ] Add database backup/export and redacted logs.

**Exit condition:** User can inspect prior outputs and safely recover from simulated failures/restarts.

### Milestone 7 — Facebook publishing
- [ ] Confirm current Meta Graph API publishing requirements.
- [ ] Implement supported Meta authentication.
- [ ] Retrieve/manage authorised Pages.
- [ ] Securely store tokens using Windows secure storage.
- [ ] Build caption/title/hashtag editor.
- [ ] Implement supported video/Reel upload workflow.
- [ ] Record post ID and publication status.
- [ ] Verify status where API permits.
- [ ] Prevent duplicate publishing.
- [ ] Add manual upload fallback.

**Exit condition:** A test video can be published to a controlled Page, the result is recorded, and uncertain/repeated requests do not create accidental duplicate posts.

### Milestone 8 — Scheduler, packaging and release testing
- [ ] Add optional scheduler and missed-run policy.
- [ ] Ensure scheduler reports PC sleep/off limitations.
- [ ] Add Windows installer and app update strategy.
- [ ] Add diagnostics screen.
- [ ] Test clean installation and upgrade.
- [ ] Run end-to-end tests across five sessions.
- [ ] Test Flow session expiry, missing downloads, corrupt files, FFmpeg failure and Meta token expiry.
- [ ] Document user setup and troubleshooting.

**Exit condition:** A clean Windows installation can complete the documented workflow reliably with recoverable failures.

## 4. Recommended immediate next actions

1. Run the Windows setup in `docs/DEVELOPMENT_SETUP.md`.
2. Verify backend tests and fix any dependency/runtime issues.
3. Exercise create/list/approve job flows from the Electron dashboard.
4. Add persistent queue controls, proper state transition rules and test coverage.
5. Continue Milestone 1 until its exit condition is verified; then implement AI Director/Prompt Studio.

## 5. Working rules for contributors and AI coding agents

- Read this file and `docs/PROJECT_SPECIFICATION.md` before changing architecture or scope.
- Preserve the five-fruit / five-clip / eight-second / approximately-40-second first-release rule.
- Do not implement other ASMR themes in the first generation release.
- Do not claim a feature is implemented without code and a test or reproducible verification.
- Do not put API keys, Facebook tokens, Google credentials, browser cookies or personal data in Git.
- Do not overwrite user data or generated media during retries.
- Prefer complete, runnable files and explain exact setup commands.
- Keep the app usable with mock/manual modes when external services are unavailable.
- Record blockers and decisions here instead of silently changing requirements.
