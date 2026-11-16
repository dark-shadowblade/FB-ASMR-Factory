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

- [ ] The transition validator is not yet wired into every API route or extension event handler.
- [ ] State + job-event writes are not yet centralised into one transactional service.
- [ ] Unique active profile leases and stale-lease reconciliation are not yet implemented.
- [ ] Tests added in this branch have not yet been run by GitHub Actions in this session.
- [ ] No live Google Flow or Facebook account behaviour has been verified by this implementation step.

## Next steps

1. Integrate transition validation into task event ingestion and job/clip update paths, preserving existing statuses and compatibility.
2. Add atomic state-and-event persistence helpers and tests for rollback/idempotency.
3. Add database-enforced per-profile task leasing and concurrency tests.
4. Build a single idempotent job-start orchestrator (prompt generation → auto-approval → preflight → dispatch).
5. Continue through extension execution, download ingestion, restart recovery, media normalization and publication reconciliation.

## Verification record

| Check | Status |
|---|---|
| Architecture document committed | Done |
| State transition module committed | Done |
| State transition tests committed | Done |
| Backend CI for this branch | Pending / not checked |
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
