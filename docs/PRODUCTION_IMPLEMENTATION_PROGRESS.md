# Production Implementation Progress

**Updated:** 2026-11-16  
**Working branch:** `production-pipeline-foundation`  
**Base branch:** `main` at `03d99d30086ebb5d88212b22e7cdd59c277ed02c`

This file tracks only the production-pipeline implementation work. Existing project status remains in `PROJECT_STATUS.md`.

## Current objective

Implement the production workflow step by step, with backend/orchestrator reliability as the priority. Preserve the existing desktop UI. Do not touch the separate `ASMR-Factory` repository.

## Completed in this implementation branch

- [x] Added `docs/PRODUCTION_PIPELINE_ARCHITECTURE.md` — component boundaries, job lifecycle, clip lifecycle, five-profile scheduling, extension evidence protocol, media contract, recovery rules, publication rules and implementation order.
- [x] Added `services/orchestrator/app/workflow_state.py` — pure, central transition maps and validation for job, clip and extension-task states.
- [x] Added `services/orchestrator/tests/test_workflow_state.py` — positive/negative transition tests, same-state idempotency and unknown-state checks.
- [x] Added this implementation progress ledger.

## Partially complete / not yet verified

- [x] Extension event ingestion validates task transitions before persisting events; illegal/out-of-order events return HTTP 409 and are not recorded.
- [ ] The validator is not yet wired into every job/clip API route or all state mutation paths.
- [ ] State + job-event writes are not yet centralised into one transactional service.
- [ ] Unique active profile leases and stale-lease reconciliation are not yet implemented.
- [ ] Backend CI for this branch is pending; the PR will trigger the pytest suite.
- [ ] No live Google Flow or Facebook account behaviour has been verified by this implementation step.

## Next steps

1. Make job-start idempotent and add automatic Flow project creation/detection for profiles without saved project URLs.
2. Add atomic state-and-event persistence helpers and tests for rollback/idempotency.
3. Add database-enforced per-profile task leasing and concurrency tests.
4. Build a single idempotent job-start orchestrator (prompt generation → auto-approval → preflight → dispatch).
5. Continue through extension execution, download ingestion, restart recovery, media normalization and publication reconciliation.

## Latest implementation step (2026-11-16)\n\n- Commit `715c3d5`: validate incoming extension task-state transitions before persistence.\n- Commit `8e08d77`: test the ordered worker lifecycle and verify invalid events are rejected without persistence.\n- Commit `398f6ab`: fix backend CI to run pytest; the previous unittest discovery command would not collect the repository's pytest-style tests.\n- Added a PR to `main` to run CI; no merge has been performed.\n\n## Latest implementation step (2026-11-16, Generate Video orchestration)\n\n- Commit `ab7f76f`: connected the existing Generate Video action to prompt generation, automatic approval and five-task Flow dispatch after opening all five persistent browsers. Existing desktop UI is unchanged.\n- Commit `92b1d3a`: corrected the bridge lifecycle test to count all seven accepted events in its full ordered sequence.\n- Existing UI already auto-runs assembly when all five extension tasks report downloaded; Facebook publishing is invoked by the backend assembly route when a Page is configured.\n- GitHub Actions for the latest commit are queued at last check; do not treat as passed until completed.\n- Important remaining blocker: dispatch currently requires saved project URLs for all five profiles. The desired create-project-if-missing behavior is not yet implemented.\n\n## Latest implementation step (2026-11-16, Flow startup reliability)

- Added automatic Flow-home project discovery: the extension clicks only a unique visible "New project" control, reports the resulting project URL, and the orchestrator now waits for all five saved project URLs before allowing one-click dispatch.
- Added a startup handshake that verifies each extension service worker successfully registers with the local orchestrator; opening a Chrome window alone is no longer treated as a ready worker.
- Fixed profile status after orchestrator restart so a Chrome instance reattached over CDP is still reported as open even when this process has no original Popen handle.
- Added backend tests for asynchronous project creation, extension registration configuration, and CDP reattachment status.
- Backend tests and Flow extension/bridge tests passed on commit `e918a236690986f14af59215ad8fb4184d90635c`.
- Windows installer workflow for that commit is still running; no installer artifact is claimed from this commit yet.
- No live Google Flow generation, real download, Facebook Reel publication, or five-account end-to-end test has been performed.

## Verification record

| Check | Status |
|---|---|
| Architecture document committed | Done |
| State transition module committed | Done |
| State transition tests committed | Done |
| Backend CI for this branch | Pending latest run |
| Extension bridge CI for this branch | Pending / not checked |
| Windows installer for this branch | Not built |
| Live five-profile Flow test | Not performed |
| Live Facebook Page test | Not performed |

## Rules for future updates

- Update this file after every implementation step.
- Mark a task complete only when the code and its test/verification evidence exist.
- Report branch, commit SHA and CI status.
- Never describe a planned feature as implemented.
- Keep UI redesign out of scope unless explicitly requested.
