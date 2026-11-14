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
- [x] Initial dashboard UI with seven-style job creation and job history.
- [x] Python/FastAPI local orchestrator scaffold.
- [x] SQLite persistence for jobs, clips and job events.
- [x] Backend API to create/list/read jobs and approve the five-clip placeholder plan.
- [x] Windows development setup guide.
- [x] One-click `INSTALL.bat` launcher committed; it prepares the Python virtual environment, installs dependencies, starts the backend and launches the desktop dashboard (not yet tested on the user's PC).
- [x] Initial unit tests for five-clip job rules (written; execution still needs local verification).
- [x] AI prompt generation API supports all seven ASMR styles with exactly five distinct subjects/prompts per selected style.
- [x] Persistent shared ASMR Style Bible stored in local SQLite and reused across styles.
- [x] Prompt Studio UI with five editable prompts and explicit approval/locking.
- [x] Dashboard selector exposes all seven styles.
- [x] Backend tests cover all seven styles and five unique prompts per style (execution on user's Windows PC still pending).
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

**Current truthful milestone:** Desktop/backend scaffold, seven-style job planning, and AI Director Prompt Studio are committed. The code supports five distinct subjects/prompts for each style using a shared persistent Style Bible, with optional OpenAI-compatible provider support and a built-in fallback. Local test execution remains pending. Google Flow browser automation, media processing and Facebook publishing remain unimplemented.

## 2. Product rules that must not be lost

- Weekly rotation: Monday Fruits; Tuesday Soaps; Wednesday Clay; Thursday Kinetic Sand; Friday Slime; Saturday Satisfying Objects / Materials; Sunday Mixed ASMR.

- All seven styles are active: Fruits, Soaps, Clay, Kinetic Sand, Slime, Satisfying Objects / Materials and Mixed ASMR.
- Every selected style creates exactly **five distinct subject prompts**, all within that style.
- Weekly rotation: Monday Fruits; Tuesday Soaps; Wednesday Clay; Thursday Kinetic Sand; Friday Slime; Saturday Satisfying Objects / Materials; Sunday Mixed ASMR.
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
- Never mix styles within one job. Use the selected style's five subjects and preserve a shared Style Bible across its five prompts.

## 3. Development roadmap

### Milestone 0 — Repository and documentation
- [x] Create repository.
- [x] Add README.
- [x] Add detailed product specification.
- [x] Add progress tracker.
- [x] Add Windows development setup guide and one-click launcher.

**Exit condition:** Requirements and first milestone are clear enough to implement without guessing.

### Milestone 1 — Desktop foundation and local job engine
- [x] Create initial Electron + React + TypeScript scaffold.
- [x] Create initial Python FastAPI local service.
- [x] Add SQLite persistence for jobs, clips and job events.
- [x] Implement initial dashboard and navigation shell.
- [x] Implement topic input and seven-style theme selection.
- [x] Implement job creation with exactly five style-specific clip records and unique IDs.
- [x] Implement job listing/detail retrieval and draft-plan approval endpoint.
- [x] Add Windows setup instructions and one-click `INSTALL.bat` launcher.
- [ ] Install dependencies and run the desktop app on Windows.
- [ ] Execute backend unit tests and fix any failures.
- [ ] Add safe job pause/resume/cancel and robust state transition rules.
- [ ] Add explicit mock-generation mode and better queue controls.

**Exit condition:** User can create a job, inspect five persisted clip tasks, see progress and reopen the app without losing job state. This milestone is scaffolded but not yet verified end-to-end.

### Milestone 2 — AI Director and Prompt Studio
- [x] Define and store the shared ASMR Style Bible.
- [x] Define a structured five-prompt response contract.
- [x] Implement exactly five distinct subject prompts for each of the seven styles.
- [x] Add configurable OpenAI-compatible provider settings via environment variables.
- [x] Add built-in prompt composer fallback when no provider is configured.
- [x] Add prompt review, editing, approval and regeneration before approval.
- [x] Save exact prompt text and generation source in job events.

**Exit condition:** Five distinct prompts can be generated, edited, approved and persisted per job. Provider-based generation requires the user to configure their own compatible API credentials.

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

1. Pull the latest repository changes and restart the local backend and desktop app.
2. Create test jobs for each of the seven styles; verify five distinct prompts per style.
3. Run backend tests and fix any issues found on Windows.
4. Continue with Chrome extension/profile management and Flow session connection.

## 5. Working rules for contributors and AI coding agents

- Read this file, `DEVELOPMENT_LOG.md`, `README.md` and `docs/PROJECT_SPECIFICATION.md` before changing architecture or scope.
- Preserve the seven-style / five-subject-prompts-per-style / eight-second / approximately-40-second production rule.
- All seven ASMR styles are active; never silently disable or collapse them into Fruits-only.
- Do not claim a feature is implemented without code and a test or reproducible verification.
- Do not put API keys, Facebook tokens, Google credentials, browser cookies or personal data in Git.
- Do not overwrite user data or generated media during retries.
- Prefer complete, runnable files and explain exact setup commands.
- Keep the app usable with mock/manual modes when external services are unavailable.
- Record blockers and decisions here instead of silently changing requirements.
