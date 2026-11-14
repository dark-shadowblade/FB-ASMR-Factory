# FB-ASMR-Factory — Detailed Project Specification

**Document type:** Product and functional requirements  
**Project:** FB-ASMR-Factory  
**Target platform:** Windows 10/11  
**Primary outcome:** One validated vertical ASMR compilation created from five AI-generated clips and automatically published as a Reel to the configured Facebook Page when Meta publishing is connected.

---

## 1. Vision and operating model

FB-ASMR-Factory is a local-first production control centre. It coordinates prompt creation, multiple authenticated Google Flow browser sessions, media downloads, validation, editing/merging, local cataloguing and Facebook publishing.

The desktop app is the source of truth for jobs and files. The Chrome extension performs the Flow-page interaction within the user's own signed-in browser profiles. The local orchestrator coordinates work and communicates job state between the app, extension, database and media tools.

The system must not pretend that a generation, download or upload succeeded merely because a button was clicked. Each stage must wait for observable evidence and validate its result.

## 2. Release scope and theme rules

### 2.1 First release
The first production system supports **all seven ASMR styles**. Every selected style produces exactly five coordinated but distinct subject prompts; the five clips in a job always belong to that selected style.

1. **Fruits:** Watermelon, Kiwi, Orange, Pineapple, Strawberry.
2. **Soaps:** Rose soap, Transparent soap, Rainbow soap, Marble soap, Glitter soap.
3. **Clay:** Red clay, Blue clay, Rainbow clay, Pastel clay, Metallic clay.
4. **Kinetic Sand:** Golden, Blue, Pink, Rainbow and Layered kinetic sand.
5. **Slime:** Clear, Crunchy, Glossy, Glitter and Fluffy slime.
6. **Satisfying Objects / Materials:** Jelly, Wax, Soft foam, Coloured blocks and Sensory material.
7. **Mixed ASMR:** Layered sensory block, Jelly-filled object, Soft wax object, Foam-and-clay object and Multi-texture sensory object.

Each job creates five different subjects and one prompt per subject. Prompts must be materially distinct, not generic duplicates with only a noun swapped. A shared persistent Style Bible maintains camera, lighting, background, pacing and audio identity, while the subject and material-specific action change for each clip. Each clip targets eight seconds; five clips produce an approximately 40-second compilation. Do not mix styles within one job.

## 3. User journeys

### Journey A — Create a video
1. User opens the Windows desktop app.
2. Dashboard displays browser session readiness, recent jobs and library summary.
3. User enters a topic/theme instruction.
4. User selects one of the seven ASMR styles.
5. App requests five distinct fruit concepts/prompts from the configured prompt provider, or opens manual prompt entry if no provider is configured.
6. AI Director applies the shared ASMR Style Bible and returns structured prompts.
7. Prompt Studio allows review/edit/approval before generation.
8. User starts the job.
9. Orchestrator creates a unique job ID and isolated job folder.
10. Each prompt is assigned to a configured Flow session.
11. Browser extension opens the saved project URL, checks configured settings, submits the prompt and waits for the generation.
12. Extension initiates the download and reports the resulting file to the orchestrator.
13. Orchestrator validates all five source clips.
14. FFmpeg/FFprobe prepare and merge the clips.
15. App validates the final output and records metadata.
16. The final video and AI-generated metadata are recorded in the Library. If a Facebook Page is configured, the app automatically publishes the Reel without requiring a manual video preview or approval. If Meta is not configured, the finished video remains safely in the Library.

### Journey B — Configure Flow accounts
1. User adds or maps up to five Chrome profiles/sessions.
2. Each profile is opened visibly so the user can sign in to their own Google account.
3. User selects/records the Flow project URL for that profile.
4. App stores the profile mapping and project URL locally.
5. A readiness check reports whether the profile/project can be opened.
6. If a session expires or is unavailable, the app requests user attention and offers manual continuation.

No passwords, session cookies or raw authentication tokens should be requested in chat or embedded in project source code.

### Journey C — Automatic Facebook Reel publishing
1. User configures the Meta/Facebook connection through the supported authentication process.
2. App lists Pages the connected identity is authorised to manage, where supported.
3. User chooses the destination Page once in settings.
4. After the final MP4 passes validation, the app generates the title, caption, description and hashtags automatically. Metadata editing is optional and must not become a mandatory approval gate.
5. The app automatically uploads the completed video as a Reel through a supported Meta API workflow. Do not require a manual video preview or publishing confirmation in the default workflow.
6. App stores the response identifiers, destination Page and final publication status.
7. App checks publication status where possible and prevents duplicate attempts after retries or restarts.

If API permissions or media publishing support are unavailable, keep the completed video in the local Library, explain the exact missing permission/configuration and provide a manual upload fallback. Do not scrape or automate private Facebook UI actions as a substitute for unsupported API access.

## 4. Functional requirements

### FR-01 — Dashboard
- Show create-job controls, queue, recent outputs and session health.
- Clearly distinguish planned features from available features.
- Display actionable errors and current stage.
- Provide a settings area for accounts, paths, prompt provider, video defaults and Facebook.

### FR-02 — Topic and prompt planning
- Accept a topic or theme instruction.
- Every selected style creates exactly five style-specific subjects/prompts.
- Prompt records include job ID, subject, prompt text, order, assigned session, approval state and generation status.
- Provide edit, regenerate-individual-prompt and approve controls.
- Store the exact approved prompt used for each generation.

### FR-03 — AI Director and Style Bible
- Maintain a persistent shared Style Bible for visual consistency.
- Style Bible should specify the intended ASMR look and production constraints: subject presentation, cutting/action style, camera framing, lighting, background, material detail, pacing, audio expectations and negative constraints.
- Generate subject-specific prompts with a consistent style.
- Allow a configurable OpenAI-compatible provider, model and endpoint.
- Never require an external provider: manual prompt entry must remain possible.
- Log provider/model metadata without storing API secrets in plain text.

### FR-04 — Five independent Flow sessions
- Support up to five independent browser profiles/sessions.
- Map each session to a user-selected Google account/profile and Flow project URL.
- Show profile label, configured project, readiness and current task.
- Keep authentication isolated.
- Assign one clip task to one session; do not let concurrent jobs accidentally reuse the same browser tab/session.
- Provide visible login and manual fallback.
- Detect missing project URLs and session failures before starting a job where possible.

### FR-05 — Flow automation extension
- Use a Chrome Manifest V3 extension paired with the desktop orchestrator.
- Receive a job-scoped task containing job ID, clip ID, prompt and target settings.
- Navigate directly to the remembered Flow project URL for that profile.
- Defaults: Veo 3.1 Lite, 720p, 8 seconds.
- Confirm the visible UI selections before generation where reliable.
- Paste only the prompt assigned to the current task.
- Submit once; prevent accidental duplicate clicks.
- Clear the prompt input after confirmed submission so it cannot be reused in a later task.
- Wait for completion using page-state observation and bounded polling, not a single blind fixed sleep.
- Start download and wait for a completed file.
- Report progress, errors and download metadata to the orchestrator.
- If selectors/UI behavior are uncertain, stop and ask for manual intervention instead of making a risky guess.

The extension must not attempt to bypass product access restrictions, quotas, account controls, CAPTCHAs or other security protections.

### FR-06 — Download association and validation
- Each job has a unique ID; each clip has a unique clip ID.
- Store downloads in a job-specific directory, never in a shared ambiguous folder.
- Associate a download with the task that initiated it.
- Wait for temporary download extensions/partial files to disappear.
- Validate existence, non-zero size, media readability, duration and video/audio streams with FFprobe.
- Record codec, resolution, frame rate, duration and audio stream presence.
- Detect duplicates, corrupt clips and wrong/unknown files.
- Do not merge until all required clips pass validation, unless the user explicitly chooses a documented partial-output mode.

### FR-07 — Video assembly
- Expected source count: five clips.
- Target sequence order is the approved prompt order unless the user reorders clips.
- Target output aspect ratio: 9:16.
- Target container: MP4.
- Target video codec: H.264.
- Target audio codec: AAC when audio exists and can be encoded appropriately.
- Normalize incompatible dimensions, frame rates, pixel formats and audio layouts as needed.
- Avoid stretching; use an intentional scale/crop/pad policy.
- Preserve audio where appropriate; provide a documented fallback for silent clips.
- Use FFmpeg for processing and FFprobe for verification.
- Validate final file readability, duration and streams before marking the job completed.
- Keep source clips unless the user changes retention settings.

### FR-08 — Job management and recovery
- Persist job and clip states in SQLite.
- Suggested job states: draft, awaiting_approval, queued, running, paused, processing, completed, failed, cancelled.
- Suggested clip states: planned, assigned, opening_project, generating, waiting_for_completion, downloading, validating, ready, failed, skipped.
- Persist stage transitions and timestamps.
- Resume after app restart where safe.
- Retry failed clips individually.
- Do not repeat successful generation or publishing steps without explicit intent.
- Provide pause/cancel semantics that do not corrupt active downloads or database state.
- Keep structured logs with secret redaction.

### FR-09 — Local Video Library
- List all completed compilations.
- Display thumbnail, title/topic, creation date/time, duration, file path and Facebook status.
- Filter/search by topic, date and publication state.
- Open/play the video and open its containing folder.
- Show source clips and job details.
- Allow title/caption edits before publishing.
- Preserve publication history and post identifiers.

### FR-10 — Facebook Page management and publishing
- Connect using supported Meta authentication and permissions.
- Support selecting a Page the user is authorised to manage.
- Use official Graph API endpoints supported for the configured Page and media type.
- Make required permissions/app-review prerequisites explicit.
- Securely store tokens using OS-appropriate secure storage; never commit secrets.
- Prepare caption/title/description and hashtags for review.
- Require an explicit publish action unless the user later enables a clearly configured scheduling policy.
- Record Page ID, post/video ID, request time, response state and result.
- Avoid duplicate posts by using an idempotency/job publication record and checking prior successful attempts.
- Retry only when the outcome is known to be safe; uncertain outcomes require status lookup/manual review.
- Provide manual upload fallback.

### FR-11 — Scheduler
- Optional; not a prerequisite for the first working release.
- Configure time and recurrence for a job.
- Run only while Windows is awake and the app/service is active.
- Mark missed runs clearly and decide whether to skip or queue them based on user settings.
- Do not imply that jobs can run while the computer is shut down or asleep.

### FR-12 — Settings, diagnostics and backup
- Configure output root, browser profiles, project URLs, generation defaults, prompt provider and Facebook Page.
- Provide a diagnostics view for FFmpeg/FFprobe availability, extension connection, database health and profile readiness.
- Back up SQLite and job metadata.
- Provide exportable logs with secrets redacted.

## 5. Non-functional requirements

### Reliability
- Every stage must have a timeout, observable success condition and actionable failure reason.
- Never mark a clip or job complete based only on a click event.
- Use unique IDs and safe filesystem operations.
- Avoid data loss during restart or partial failure.

### Security and privacy
- Keep Google sessions in their own browser profiles.
- Store tokens/secrets in OS secure storage where possible.
- Do not write credentials, cookies or access tokens to logs.
- Do not commit secrets, local databases, downloaded videos or personal browser data.
- Use least-privilege Meta permissions.
- Keep local files local unless the user initiates an upload or backup.

### Maintainability
- Separate desktop UI, orchestrator, extension, shared contracts and media pipeline.
- Define typed messages between components.
- Use structured logs and automated tests.
- Keep selectors and Flow-specific logic isolated so UI changes are easier to repair.

### Usability
- Show progress per clip and overall.
- Explain failures in plain language.
- Preserve manual controls for uncertain browser steps.
- Make defaults visible and editable.

## 6. Proposed architecture

```text
┌─────────────────────────────────────────────────────────┐
│ Electron Desktop App (React + TypeScript)               │
│ Dashboard • Prompt Studio • Queue • Library • Settings  │
└───────────────────────┬─────────────────────────────────┘
                        │ Local authenticated IPC/API
┌───────────────────────▼─────────────────────────────────┐
│ Python FastAPI Orchestrator                             │
│ Job engine • Prompt service • Account mapping • Logs    │
│ Recovery • Facebook service • Scheduler                 │
└──────────┬──────────────────┬──────────────────┬────────┘
           │                  │                  │
     ┌─────▼──────┐     ┌─────▼──────┐     ┌──────▼──────┐
     │ SQLite DB  │     │ Chrome     │     │ FFmpeg /    │
     │ Jobs/Clips │     │ Extension  │     │ FFprobe     │
     │ Settings   │     │ + CDP      │     │ Media jobs  │
     └────────────┘     └─────┬──────┘     └─────────────┘
                              │
                ┌─────────────┼─────────────┐
                ▼             ▼             ▼
             Flow #1       Flow #2       Flow #3 ... #5
             Profile 1     Profile 2     Independent sessions

                        ┌──────────────────────────────┐
                        │ Meta Graph API               │
                        │ Facebook Page publishing     │
                        └──────────────────────────────┘
```

### Component responsibilities
- **Desktop UI:** user actions, visual progress, settings and library.
- **Orchestrator:** authoritative job state, task assignment, recovery, communication and logging.
- **Chrome extension:** Flow-page interaction only; it does not own the job database.
- **SQLite:** persistent job, clip, prompt, profile mapping, output and publication records.
- **FFmpeg/FFprobe:** media inspection, normalization, concatenation and output verification.
- **Meta service:** Page discovery, supported media upload, publication verification and history.

## 7. Data model outline

Suggested entities:
- `BrowserProfile`: profile ID, user label, project URL, enabled state, last readiness check.
- `Theme`: theme ID, display name, implementation state.
- `Job`: job ID, topic, theme, status, created/updated timestamps, output path.
- `Prompt`: prompt ID, job ID, subject, prompt text, order, approval state, provider metadata.
- `ClipTask`: clip ID, job ID, prompt ID, browser profile ID, status, download path, media metadata, error.
- `StyleBible`: version, content, updated timestamp.
- `VideoOutput`: output ID, job ID, file path, thumbnail path, duration, codec, dimensions.
- `FacebookPage`: Page ID, display name and secure credential reference.
- `Publication`: publication ID, output ID, Page ID, post/video ID, state, timestamps and response summary.
- `JobEvent`: event ID, job ID, clip ID, timestamp, stage, severity and redacted message.

Never store raw passwords or browser cookies in these records.

## 8. Filesystem layout

Example:

```text
<OutputRoot>/
  Videos/
    <topic-slug>/
      <YYYY-MM-DD>/
        <job-id>/
          prompts/
            prompt-01.md
            ...
          clips/
            clip-01.mp4
            ...
          thumbnails/
          final/
            <topic>-<date>-<job-id>.mp4
          logs/
            job.jsonl
```

Use sanitized topic slugs and unique job IDs. The database remains the source of truth; paths must not be inferred from user-visible titles alone.

## 9. Error handling matrix

| Failure | Required behavior |
|---|---|
| Flow profile signed out | Pause that task; request visible login; preserve other task states |
| Project URL missing/unavailable | Mark session not ready; ask user to configure or open project |
| Generation did not start | Detect timeout/state; offer safe retry |
| Generation still running | Keep waiting within a configurable limit; show status |
| Download incomplete | Wait for completion; do not accept partial file |
| Download missing/corrupt | Mark clip failed; retain logs; retry only that clip |
| Wrong clip associated | Quarantine it; do not merge |
| FFmpeg failure | Preserve source clips; show command/error summary; allow retry |
| Final output invalid | Do not mark completed or offer publishing |
| Facebook token expired | Pause publishing; request reconnection |
| Facebook result uncertain | Check status before retry to avoid duplicate post |
| App closed/restarted | Recover persisted states and reconcile temporary files |

## 10. Acceptance criteria for first end-to-end release

The first release is considered functionally ready only when all of the following are demonstrated:

1. User can create a selected-style job from the desktop dashboard.
2. Exactly five distinct fruit prompts are produced and saved.
3. Each prompt is assigned to the intended independent Flow session.
4. Flow defaults are set/verified as Veo 3.1 Lite, 720p and 8 seconds when those options are available to the account.
5. Each generated clip is downloaded and associated with the correct clip task.
6. The system detects a missing, partial or invalid clip and refuses to silently merge it.
7. Five valid clips are compiled into a playable vertical MP4 of approximately 40 seconds.
8. Output, prompts, metadata and logs are saved under the correct job folder.
9. App restart does not lose job history or cause accidental duplicate generation.
10. Video Library displays the completed output and its publication state.
11. A configured Facebook Page can receive a test publication through an officially supported API workflow, or the app clearly explains why the API path is unavailable and offers manual upload.
12. Duplicate publication is prevented or an uncertain outcome is flagged for review.

## 11. Out of scope for the initial release

- Generating non-fruit themes.
- Running while the PC is shut down or asleep.
- Bypassing Flow account restrictions, quotas or security controls.
- Guaranteeing model/quality/duration options that Google does not expose to a particular account.
- Unattended Facebook publishing before the connection, permissions and duplicate safeguards have been tested.
- Cloud hosting or remote execution as a requirement.

## 12. Open implementation decisions

These should be settled during implementation and recorded in the architecture docs:
- Exact local IPC/API authentication and port strategy.
- Chrome profile discovery and safe launch strategy on Windows.
- Flow selectors and page-state detection for the current UI.
- Download destination strategy per browser profile.
- Exact FFmpeg normalization/concat settings based on real Flow outputs.
- Current Meta Graph API endpoint, permissions and app-review requirements for Page video/Reel publishing.
- Secure token storage implementation for Windows.
- Scheduler behavior for missed jobs.
