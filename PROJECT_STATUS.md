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
At verification on 2026-11-14, GitHub reports repository visibility as **Public**. If this project should be private, change it in GitHub repository Settings → General → Danger Zone → Change repository visibility. No visibility change was made.

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
- [x] Chrome Manifest V3 extension package with profile binding, persistent worker state and authenticated localhost bridge.
- [x] Five isolated persistent Chrome profile directories and profile manager.
- [x] SQLite-backed saved Flow project URL per profile (five account slots).
- [x] Desktop UI to paste/save each project's URL and open it directly.
- [x] One-click endpoint opens all five saved Flow projects in parallel in their isolated Chrome profiles; desktop production start waits up to 60 seconds for all five extension workers before dispatch.
- [x] Reuse each profile's persistent Chrome session; first sign-in is required once per profile.
- [x] Reference-informed Flow prompt discovery and guarded prompt insertion / Generate code path (live interaction still needs an authenticated Flow verification).
- [x] DOM-observation generation-state monitor and safe reload/duplicate-generation guards (live Flow behavior not yet verified).
- [x] Configurable selected-value checks for Veo 3.1 Lite, 720p and 8 seconds (requires real selectors to be configured).
- [x] Redesigned responsive Flow Worker options page with per-profile setup, validated local bridge settings, explicit selector-verification toggle, read-only tab diagnostic and JSON copy.
- [x] Extension settings save preserves active task/download state and blocks profile reassignment during an active task.
- [x] Improved generation-state detection to require playable video plus a download control before treating output as ready; interrupted/non-video downloads are reported as retryable failures.
- [ ] Automatic selection/change of model, resolution, duration and 9:16 aspect ratio in the live Flow UI; current extension only checks configured selected-value selectors, and aspect-ratio verification is optional.
- [x] Associate browser downloads with the active Flow tab and report completed video path/size.
- [x] FFprobe validates all five downloaded MP4 files during assembly, enforces approximately 8 seconds per source clip, and marks clips ready only after the final MP4 also passes validation.
- [x] FFmpeg/FFprobe pipeline validates five compatible vertical 9:16 H.264/AAC MP4 clips, concatenates them, and probes the final output.
- [x] Generate Facebook Reel title, caption, description and hashtags after assembly using the configured AI provider with a built-in fallback; expose metadata through job/library APIs and desktop details.
- [x] Initial extension task queue, five-profile dispatch, unique Chrome instance binding, idempotent task/event identity validation, persistent event outbox and pause/resume/cancel command queue.
- [x] Guarded retry for failed/blocked individual clip tasks, with live-worker checks and optional profile reassignment at the API layer.
- [x] Desktop pairing token display/copy and five-worker readiness check before dispatch.
- [x] One-click automatic production start: generates missing prompts, auto-approves the pack and dispatches five Flow tasks once all five project URLs and workers are ready.
- [x] Configurable prompt/Generate/download and model/resolution/duration/aspect-ratio selector fields.
- [x] Safe content script with app-hydration wait, duplicate-submit guard, DOM mutation monitoring and download-to-active-tab correlation.
- [x] Persistent extension event outbox retries unacknowledged events after temporary local-service failures.
- [x] GitHub Actions backend tests, extension protocol tests, extension bridge tests and desktop build passed on commit `eb1fae1` (14 Nov 2026). Newest HEAD `4ef0a82` has fresh backend and extension/bridge workflows running; Chrome extension tests already passed on `4ef0a82`.
- [ ] Full job recovery and retry behavior; current per-task retry and interrupted-download reporting are implemented, but restart reconciliation and automatic retry/backoff are not.
- [x] Basic local Video Library API and UI, including inline MP4 playback and download; thumbnails, search/filtering and richer library browsing remain.
- [x] Initial Facebook Page Reel publishing through Meta Graph API using a locally configured Page ID and Page access token (OAuth onboarding and Page picker are not yet implemented).
- [x] Persist per-job Facebook publication state, poll Meta processing status, and block automatic re-upload for published or uncertain jobs.
- [ ] Optional scheduler.
- [x] Windows installer artifact successfully built for commit `f380ca1` (run `43600477183`) and an earlier artifact for `0a2ae59` (run `43598548348`). A newer installer build for commit `ee26516`, including the one-click five-profile launch, is still running; it does not yet include the latest Flow Worker options polish.
- [ ] Full five-account end-to-end test on the user's Windows PC.

**Current truthful milestone:** The desktop/backend scaffold, seven-style AI Director, five isolated Chrome profiles, extension task bridge, reference-informed Flow prompt discovery, five-profile dispatch, download event correlation, and backend media assembly API are implemented. The media API accepts only the five task-associated MP4 downloads under the configured Downloads directory, verifies each clip with FFprobe, requires vertical 9:16 compatible H.264/AAC streams, assembles them with FFmpeg, validates the final file, and records it in the local library. The desktop exposes the merge action, final-video details and generated social title/caption/hashtags. Social metadata uses the configured OpenAI-compatible provider with a built-in fallback. Google Flow setting selection and live prompt/Generate/download behavior still require testing against the user's signed-in accounts. The current content script inserts a prompt and clicks Generate after configured selectors/settings pass, but it does not yet clear the prompt after confirmed submission; the live state detector and download association still need real-account testing. Meta authentication and actual Reel publishing, robust restart recovery, thumbnails/search and richer library browsing, OAuth-based Meta account onboarding/Page selection, real Page upload verification, robust restart recovery, thumbnails/search and richer library browsing, and a full five-account end-to-end test remain outstanding.



### Facebook publishing implementation update (14 Nov 2026)
- [x] Added Meta Graph API Page connection check using environment-configured Page ID and Page access token.
- [x] Added three-stage Facebook Reels upload: initialize, stream local MP4 to Meta's upload URL in 4 MB chunks, then finish with title and SEO description.
- [x] Added editable Reel title, caption, description and hashtags in the desktop job view.
- [x] Added per-job publication ledger, duplicate submission guard, uncertain-upload lockout and Meta processing-status refresh.
- [x] Added basic client tests for missing credentials and invalid source files.
- [ ] CI validation and real Facebook Page test are pending; no actual Reel has been published from this environment.
- [ ] Full OAuth login, managed Page discovery/selection and secure token onboarding remain future work. For now, the Page token is supplied through environment variables and is not written to SQLite.

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

### Milestone 3 — Persistent Chrome profiles and account configuration
- [x] Add five stable profile IDs with isolated persistent Chrome user-data directories.
- [x] Store each account label and Flow project URL in SQLite.
- [x] Add desktop controls to save and open each configured project.
- [x] Open the saved project URL directly in its own Chrome profile.
- [x] Reuse the same profile directory across application restarts.
- [x] Detect Google sign-in redirects and report when first sign-in is required.
- [x] Add URL validation restricted to HTTPS flow.google.com/project/ URLs.
- [x] Add unit tests for profile IDs, URL validation and profile isolation.
- [ ] Verify five real Chrome sessions on a Windows machine with the user's accounts.

**Exit condition:** App can open five configured Flow projects in five independent persistent Chrome profiles without mixing account sessions.

### Milestone 4 — Google Flow generation
- [ ] Inspect and document the current Flow UI in an authenticated browser.
- [x] Implement safe DOM discovery, hydration wait, mutation-observer state monitoring and profile/task identity checks.
- [x] Add configurable CSS selectors and selected-value verification for Veo 3.1 Lite, 720p and 8 seconds.
- [ ] Implement and verify automatic setting selection where values are not already correct.
- [ ] Verify selectors and settings against the live Flow UI.
- [ ] Enable prompt submission only after selector and settings verification.
- [ ] Clear the input after confirmed generation start.
- [x] Track downloads initiated by the active Flow tab and report completed video files.
- [ ] Validate downloads with FFprobe and recover incomplete/incorrect files.
- [ ] Test each of the five independent sessions.

**Exit condition:** Five test prompts can be generated and downloaded into the correct job/clip records without prompt/account mix-ups.

### Milestone 5 — Media validation and compilation
- [ ] Bundle or locate FFmpeg and FFprobe.
- [ ] Detect completed downloads.
- [ ] Validate size, duration, streams and media readability.
- [ ] Normalize dimensions/aspect ratio/frame rate/audio.
- [ ] Merge five clips in the approved order.
- [ ] Validate the final MP4.
- [ ] Generate thumbnail.
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

### Milestone 4 — Extension dispatch and live worker status
- [x] Expose extension worker registration and task status to the desktop app.
- [x] Show live worker count (heartbeat must be within two minutes).
- [x] Add a Start five Flow tasks action for approved prompt packs.
- [x] Prevent dispatch until all five extension workers are connected.
- [x] Show per-clip task status and last error/download path in the job panel.
- [x] Add backend coverage for the five worker status slots.
- [ ] Verify all five unpacked extensions are paired and polling on the user's Windows installation.
- [ ] Verify live Flow prompt field, Generate and Download controls before enabling clicks.

**Exit condition:** An approved five-prompt job can be dispatched only when all five profile-bound extension workers are recently connected, and task state is visible in the desktop app.

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


## 2026-11-14 — Chrome extension foundation

### Implemented in main
- Added `extensions/flow-automation/` Manifest V3 package with background service worker, Flow content script, options page and shared protocol module.
- Added profile-bound task polling and registration for `flow-1` through `flow-5`.
- Added authenticated loopback API bridge. A random bridge token is generated in the orchestrator data directory as `extension-bridge.token`; the user enters it in each profile's extension options.
- Added persistent task identity, task/event correlation and pause/resume/cancel command queue endpoints.
- Added dispatch endpoint assigning five approved clip tasks deterministically to five profile IDs, rejecting missing project URLs or busy profiles.
- Added idempotent event ingestion and strict task/profile/job/clip identity checks.
- Added Node protocol tests and Python API tests for profile isolation and bridge authentication.
- Content script is intentionally safe-by-default: it refuses to submit or click when Flow selectors/settings are not verified. The live website has not been inspected in an authenticated browser during this implementation, so no Flow selector is claimed as working.

### Not yet verified
- Real Chrome extension load in the five managed browser profiles.
- Live Flow prompt field, Generate, model/quality/duration/aspect ratio selectors.
- Reliable completion detection and actual download-button behavior.
- Download-to-clip association on Windows and FFprobe validation.
- Desktop UI wiring for dispatch and extension status.

### Next
1. Test bridge/API and extension protocol tests.
2. Install extension into each of the five persistent Chrome profiles and pair each profile ID.
3. Inspect the live Flow DOM on an authorised account, then add verified selectors and settings interaction.
4. Implement download reconciliation and FFprobe validation before marking any clip ready.


## 2026-11-14 — Extension integration update

The Manifest V3 worker is now connected to the existing desktop/orchestrator flow. The desktop can display the locally generated bridge token, show which of the five extension workers have sent a recent heartbeat, and dispatch an approved five-prompt job only when all five workers are online. Each Chrome profile has a persistent instance ID; backend polling, commands and events are checked against both the profile ID and instance ID. The extension reuses the exact saved Flow project tab, waits for the app DOM to hydrate, monitors state changes, and correlates completed video downloads with the active Flow tab. Selected model/resolution/duration checks are configurable, but real Flow selectors are not verified. The extension remains fail-closed until those controls are configured and match the target values.

A GitHub Actions workflow was added for the Node protocol tests and Python bridge tests. The workflow has been committed but its run result has not yet been observed in this session.


## 2026-11-14 — Read-only Google Flow DOM diagnostic

Added a diagnostic command to the MV3 content script and a **Scan selected Flow tab** panel to extension Options, including a tab picker for multiple open projects. It inventories visible prompt-entry candidates, Generate-like buttons, download-like buttons, model/quality/duration/aspect-ratio controls, other visible buttons and video metadata. It proposes CSS selectors with confidence/basis annotations. The report is saved in that Chrome profile's local extension storage and can be copied as JSON.

Safety properties: the scan is read-only; it does not click, change settings, submit prompts, or include the entered prompt text/value. It does not mark suggested selectors verified or enable automation. Live DOM evidence still needs to be collected from an authorised signed-in Flow session.

Validation performed in this development session: JavaScript syntax checks passed for the content script, options script, background worker and shared protocol. Manifest V3 and diagnostic UI wiring were inspected. A real-browser scan and end-to-end Flow interaction were not available here.


## 2026-11-14 — Veo Automation reference integration

Inspected the user-provided Veo Automation 2.0.1 Chrome extension ZIP. Applied only the relevant, auditable Flow DOM patterns to the existing worker:

- Prompt discovery now prioritises the observed ProseMirror and Flow rich-text editor selectors before generic textbox candidates.
- Contenteditable prompt insertion uses browser editing commands and normal input events rather than direct `textContent` replacement or private React internals.
- DOM diagnostics now include available icon text so icon-only Generate/Download controls (for example, an `arrow_forward` icon) can be identified more easily.
- Text-entry labels no longer include entered prompt contents in event/diagnostic labels.
- README documents the reference-derived selector patterns and why the reference extension's CDP debugger/drag-drop techniques were not copied.

Validation: updated content script and existing background, protocol and options JavaScript files pass syntax parsing. This is not a live Flow test. Current Flow selectors, setting controls, prompt acceptance, generation completion and download behavior remain unverified against an authenticated browser session; selector verification remains required.


## 2026-11-14 — Flow Worker audit and options UI improvements

Reviewed the extension content script, background service worker, options page and protocol tests.

Changes committed:
- Replaced the plain options page with a responsive dark control panel, clearer five-profile labels, grouped connection/selector/diagnostic sections and mobile-friendly layout.
- Added form validation for the local bridge URL, required bridge token when polling is enabled, and required selector fields before the verified checkbox can be saved.
- Improved save feedback, including a warning when a profile reassignment is attempted during an active task.
- Fixed a task-state hazard: saving options no longer unconditionally clears the active task and its download tracking.
- Tightened VIDEO_READY detection so generic page text containing “download” cannot prematurely mark a generation as complete; a playable video plus a download control is required.
- Made download-selector failures retryable after the selector is corrected.
- Improved diagnostic classification for icon-labelled Generate controls and added regression checks for the above behaviors.

Validation performed: all modified JavaScript files pass syntax parsing. Added Node regression tests to the existing extension test suite. These tests have not yet been executed in a local Node environment or confirmed by a GitHub Actions run. No live Flow browser generation test has been performed; actual selectors and settings remain unverified.
