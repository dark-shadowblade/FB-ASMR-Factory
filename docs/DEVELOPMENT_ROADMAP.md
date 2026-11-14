# Development Roadmap

This roadmap is intentionally milestone-based. Build and verify the local workflow before connecting real browser automation or publishing.

## Phase 1 — Foundation

**Deliverables**
- Electron desktop shell using React and TypeScript.
- Python FastAPI service.
- SQLite database with migrations.
- Typed desktop-to-service communication.
- Dashboard and navigation shell.
- Fruits-only Create Job form.
- Five prompt/clip task records per job.
- Persistent job queue and event history.
- Mock mode for development without Google Flow.

**Verification**
- Create multiple jobs with the same topic without file collisions.
- Restart the app and confirm jobs remain visible.
- Confirm every Fruits job creates exactly five clip records.
- Confirm non-fruit theme choices are unavailable or visibly marked planned.

## Phase 2 — AI Director

**Deliverables**
- Versioned ASMR Style Bible.
- Structured prompt schema and prompt templates.
- Configurable OpenAI-compatible provider.
- Manual prompt mode.
- Prompt Studio with edit/approve/regenerate-one controls.

**Verification**
- Five distinct fruit subjects are produced.
- All prompts preserve shared style constraints.
- Exact approved prompt text is persisted.
- Provider failure falls back to manual mode without losing the job.

## Phase 3 — Browser profile and extension foundation

**Deliverables**
- Chrome Manifest V3 extension.
- Local authenticated bridge.
- Up to five browser profile records.
- Per-profile Flow project URL storage.
- Visible sign-in/readiness and manual fallback.
- Extension event reporting.

**Verification**
- Each profile opens its own project URL.
- A task sent to one profile cannot be received by another.
- Session loss is visible and does not corrupt job state.

## Phase 4 — Flow automation

**Deliverables**
- Current Flow UI inspection and documented selectors.
- Page-state detection.
- Model/quality/duration selection and verification.
- Job-scoped prompt paste and submit.
- Prompt input clearing after confirmed submission.
- Completion detection and download initiation.
- Download completion reporting.

**Verification**
- One controlled test clip completes reliably.
- Then test all five sessions and account mappings.
- Test timeout, UI change, sign-out and download failure.
- Never claim success from a click alone.

## Phase 5 — Media pipeline

**Deliverables**
- FFmpeg/FFprobe setup and diagnostics.
- Download association and validation.
- Normalization and concatenation.
- Final output verification.
- Thumbnail generation and metadata storage.

**Verification**
- Five valid clips yield one playable vertical MP4 around 40 seconds.
- Missing/corrupt input prevents silent completion.
- Retry does not overwrite valid source clips or final outputs.

## Phase 6 — Library and resilience

**Deliverables**
- Searchable Video Library.
- Job/clip detail screen.
- Safe retry, pause, resume and cancel.
- Restart recovery and filesystem reconciliation.
- Backup and redacted log export.

**Verification**
- Simulate app shutdown during generation, download and merge.
- Restart and confirm safe recovery.
- Confirm completed work is not repeated unnecessarily.

## Phase 7 — Facebook publishing

**Deliverables**
- Supported Meta authentication flow.
- Page discovery and selection.
- Secure token storage.
- Caption/title/hashtag editor.
- Supported video publishing.
- Publication history and status verification.
- Duplicate protection and manual fallback.

**Verification**
- Test against a Page the user controls.
- Test expired token, permission denial and network failure.
- Test uncertain upload response and ensure duplicate post is not blindly created.

## Phase 8 — Scheduling and release

**Deliverables**
- Optional scheduler.
- Missed-run policy.
- Windows installer.
- Setup and troubleshooting guide.
- Diagnostics and clean-install checks.

**Verification**
- Confirm schedule behavior while awake.
- Confirm sleep/off limitation is clearly shown.
- Verify clean installation, upgrade, logs and backups.

## Definition of done for each task

A task is complete only when:
1. Code exists in the repository.
2. Relevant automated tests pass, or a documented manual test is completed.
3. Errors and limitations are documented.
4. No secrets or user data are committed.
5. `PROJECT_STATUS.md` is updated with the evidence and remaining blockers.
