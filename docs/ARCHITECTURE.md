# Architecture and Component Contracts

## 1. Architectural goals

- The desktop app owns the user experience.
- The Python orchestrator owns durable job state and coordination.
- The browser extension owns only the interaction with the active Google Flow tab.
- SQLite is the local source of truth for jobs and history.
- FFmpeg/FFprobe own media inspection and transformation.
- The Meta integration is a separate service boundary.
- External services must be replaceable by mock adapters for testing.

## 2. Windows process model

**Electron main process**
- Starts/stops the local Python service.
- Creates the application window.
- Exposes a narrow, validated IPC surface to the renderer.
- Never exposes arbitrary shell execution to renderer code.

**React renderer**
- Dashboard, Create Job, Prompt Studio, Queue, Video Library, Accounts and Settings.
- Calls typed IPC methods only.
- Renders authoritative state returned by the orchestrator.

**Python FastAPI service**
- Binds to localhost only.
- Uses an app-generated local authentication secret for desktop-to-service calls.
- Validates all request payloads.
- Persists state transitions transactionally.
- Coordinates extension tasks, media processing and publishing.

**Chrome extension**
- Manifest V3 service worker plus content scripts limited to Flow pages.
- Connects to the local service using a documented, authenticated local bridge.
- Receives one task at a time per browser profile.
- Sends structured events; it must not be the durable job database.

## 3. Suggested package boundaries

```text
apps/desktop/
  electron/
  src/
    app/
    features/dashboard/
    features/create-job/
    features/prompt-studio/
    features/queue/
    features/library/
    features/settings/
    shared/

services/orchestrator/
  app/
    api/
    domain/
    jobs/
    prompts/
    browser/
    media/
    facebook/
    persistence/
    security/
  tests/

extensions/flow-automation/
  manifest.json
  src/background/
  src/content/
  src/shared/

packages/shared-contracts/
  json-schema/
  typescript/
  python/

tests/
  integration/
  fixtures/
```

This is a target layout; it can be adjusted if a concrete implementation reason is documented.

## 4. Job lifecycle

A job is created as a durable record before any browser automation starts.

```text
draft
  -> awaiting_approval
  -> queued
  -> running
  -> processing
  -> completed

Any active state may transition to paused, failed or cancelled
according to explicit transition rules.
```

Each job has five clip task records in the initial Fruits workflow. A clip has its own state machine:

```text
planned -> assigned -> opening_project -> generating
        -> waiting_for_completion -> downloading
        -> validating -> ready
```

A failure records the last confirmed stage and a machine-readable error code. Recovery must inspect the actual browser/file state before repeating an action.

## 5. Local API outline

Example endpoints (final names can evolve with versioning):

| Method | Path | Purpose |
|---|---|---|
| GET | /api/v1/health | Service and dependency health |
| GET | /api/v1/jobs | List jobs |
| POST | /api/v1/jobs | Create a draft job |
| GET | /api/v1/jobs/{job_id} | Job detail and clip states |
| POST | /api/v1/jobs/{job_id}/approve | Approve prompts |
| POST | /api/v1/jobs/{job_id}/start | Start approved job |
| POST | /api/v1/jobs/{job_id}/pause | Pause safely |
| POST | /api/v1/jobs/{job_id}/resume | Resume after reconciliation |
| POST | /api/v1/jobs/{job_id}/cancel | Cancel safely |
| POST | /api/v1/clips/{clip_id}/retry | Retry one failed clip |
| GET | /api/v1/profiles | Browser profile status |
| PUT | /api/v1/profiles/{profile_id} | Save profile/project mapping |
| POST | /api/v1/extension/events | Receive extension status event |
| GET | /api/v1/library | Search completed outputs |
| POST | /api/v1/outputs/{output_id}/publish | Request explicit publication |

All endpoints require schema validation and local authentication. Do not expose the service on a public network interface by default.

## 6. Extension message contracts

Every message should include:
- protocol version
- message ID
- job ID
- clip ID
- browser profile ID
- event type
- timestamp
- structured payload

Example task (illustrative contract only):

```json
{
  "protocolVersion": 1,
  "type": "FLOW_GENERATION_TASK",
  "messageId": "unique-message-id",
  "jobId": "job-id",
  "clipId": "clip-id",
  "profileId": "profile-id",
  "projectUrl": "user-configured-flow-project-url",
  "prompt": "approved prompt text",
  "settings": {
    "model": "Veo 3.1 Lite",
    "quality": "720p",
    "durationSeconds": 8
  }
}
```

The extension should emit distinct events for project opened, settings verified, prompt submitted, generation observed complete, download started, download completed and task failed. Events must be idempotently processed by message ID.

Do not put credentials, cookies or tokens in task messages.

## 7. Persistence and transaction rules

- Use SQLite foreign keys and migrations.
- Persist every important state transition.
- Use unique constraints for job IDs, clip IDs and publication attempts.
- Keep a structured event log.
- Store secrets separately from ordinary settings.
- Treat filesystem operations and database updates as a recoverable two-step process; reconcile after restart.
- Do not hold a database transaction open while waiting for browser generation or network uploads.

## 8. Media pipeline

1. Receive a completed-download event.
2. Resolve the file path only inside the configured job directory.
3. Wait for file stability and completion.
4. Run FFprobe and persist discovered media metadata.
5. Reject invalid or unexpected media.
6. Prepare normalized intermediate files.
7. Merge in approved order.
8. Probe the final output.
9. Generate thumbnail.
10. Mark output ready only after verification.

Use argument arrays for FFmpeg process invocation; do not build shell command strings from user-controlled topic text or paths.

## 9. Security boundaries

- Local API binds to loopback.
- Electron renderer uses context isolation and no Node integration.
- Validate all IPC and HTTP payloads.
- Restrict file operations to configured output roots.
- Redact secrets in logs and error reports.
- Use Windows Credential Manager or another OS-backed secure store for tokens.
- Never store raw Google passwords or browser cookies.
- Do not circumvent platform access controls, quotas, CAPTCHAs or authentication challenges.

## 10. Test strategy

- Unit tests for state transitions, prompt count/uniqueness, path sanitization and publication idempotency.
- Contract tests for desktop/orchestrator/extension message schemas.
- Integration tests using a fake Flow adapter and fixture videos.
- Media tests using valid, corrupt, silent, portrait and landscape fixtures.
- Recovery tests that terminate/restart the app at each stage.
- Meta tests using mocked API responses before a controlled Page test.
- End-to-end tests only with user-authorised accounts and supported product behavior.
