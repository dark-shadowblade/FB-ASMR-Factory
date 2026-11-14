# FB-ASMR-Factory

**Seven-style automated AI ASMR video production, compilation and Facebook publishing for Windows.**

FB-ASMR-Factory is a Windows desktop application under active development that coordinates five independent Google Flow/Veo browser profiles, generates short ASMR clips, validates and combines five clips into a vertical MP4, and is being extended with automatic publishing to a configured Facebook Page through supported Meta APIs.

> **Current implementation status:** Desktop dashboard, seven-style AI Director, five-profile extension bridge, Flow prompt/Generate code path, download event tracking, FFmpeg/FFprobe assembly API, generated Facebook Reel metadata and basic local video library details are committed. Live Flow settings and generation still require verification in the user's signed-in accounts. Meta authentication and actual Reel publishing, restart recovery and a richer searchable/playable library remain in development. See [PROJECT_STATUS.md](PROJECT_STATUS.md) and [DEVELOPMENT_LOG.md](DEVELOPMENT_LOG.md).

## Product goal

Turn a topic into one finished, publication-ready ASMR video with as little repetitive manual work as possible:

1. Enter a topic or theme in the desktop dashboard.
2. Generate exactly five distinct subject prompts for the selected job.
3. Assign one prompt to each of up to five independently authenticated Google Flow browser sessions.
4. Generate and download five clips using the configured Flow settings.
5. Validate the downloads and combine the clips into one vertical video.
6. Save the result, metadata, logs and job history locally.
7. Automatically publish the finished video as a Reel to a configured Facebook Page once the Meta publishing integration is enabled.
8. Recover safely from interrupted or failed steps without mixing files or publishing duplicates.

## Seven active ASMR styles

All seven styles are active in the production planner. Every selected style creates exactly **five unique, coordinated prompts** for five different subjects within that style. The shared Style Bible keeps the visual identity consistent while the subject, material and action vary.

| Weekly day | Style | Five subjects |
|---|---|---|
| Monday | Fruits | Watermelon, Kiwi, Orange, Pineapple, Strawberry |
| Tuesday | Soaps | Rose, Transparent, Rainbow, Marble, Glitter soap |
| Wednesday | Clay | Red, Blue, Rainbow, Pastel, Metallic clay |
| Thursday | Kinetic Sand | Golden, Blue, Pink, Rainbow, Layered kinetic sand |
| Friday | Slime | Clear, Crunchy, Glossy, Glitter, Fluffy slime |
| Saturday | Satisfying Objects / Materials | Jelly, Wax, Soft foam, Coloured blocks, Sensory material |
| Sunday | Mixed ASMR | Layered sensory block, Jelly-filled object, Soft wax object, Foam-and-clay object, Multi-texture sensory object |

Each clip targets **8 seconds**, for an approximately **40-second** compilation. Flow defaults remain **Veo 3.1 Lite, 720p, 8 seconds**, subject to account availability. Final target: vertical **9:16 MP4**, H.264 video and AAC audio where supported. A job never mixes themes.

## Key capabilities

### Desktop control centre
- Windows desktop dashboard with topic entry, theme selection and Generate action.
- Job queue with queued, running, waiting, downloading, processing, completed, failed and paused states.
- Progress for each of the five clips and the overall job.
- Pause, resume, retry and cancel controls where safe.
- Settings for Flow accounts, browser profiles, output folders, prompt provider and Facebook Pages.

### Five independent Flow sessions
- Support up to five separately authenticated browser sessions/profiles.
- Assign a specific prompt to a specific account/session for a job.
- Show session readiness and generation status.
- Keep each account's login session separate; do not share cookies or credentials between accounts.
- Provide visible login and a manual fallback when automation cannot proceed.
- Remember each browser/account's Flow project URL and reopen that project directly on later runs.
- Do not assume account credits, permissions or availability; show what can actually be observed.

### Prompt generation and AI Director
- Produce five distinct subjects for the selected ASMR style.
- Maintain a shared, persistent **ASMR Style Bible** so the visual language, camera, lighting, sound and quality remain consistent.
- Generate structured prompts tailored to each subject rather than repeating one generic prompt.
- Include a Prompt Studio for review, editing and approval.
- Support a configurable OpenAI-compatible model provider and a manual prompt fallback.
- Record the exact prompt assigned to each clip.
- Clear/discard the active prompt from the automation input after it has been submitted, and never accidentally reuse it for the next clip.

### Flow browser automation
- Chrome extension (Manifest V3) works with the desktop orchestrator.
- Open the saved Flow project directly for the assigned account.
- Use the configured defaults: Veo 3.1 Lite, 720p and 8 seconds.
- Detect the prompt input, submit the assigned prompt, wait for completion and initiate download.
- Verify the expected generation/download state instead of relying only on fixed delays.
- Expose status and useful error details to the desktop app.
- Provide a safe manual recovery path if Flow's UI changes or an automation step is uncertain.

### Video processing and local library
- Associate every source clip with a unique job ID, topic, prompt and account/session.
- Wait until downloads are complete before processing.
- Validate file existence, size, media readability, duration and stream information with FFprobe.
- Detect missing, empty, duplicate or corrupt clips.
- Merge the five clips in the intended order using FFmpeg.
- Produce a vertical 9:16 MP4 output with consistent dimensions, frame rate and audio handling.
- Keep source clips and logs for troubleshooting according to retention settings.
- Show thumbnails, title/topic, creation date, duration and publication state in the Video Library.
- Support opening the output folder and replaying completed videos.

### Facebook publishing
- Connect a Facebook account and select a Page the account is authorised to manage.
- Use official Meta Graph API publishing capabilities where supported by the Page, media type and current API permissions.
- Store access tokens securely; never hardcode tokens or commit secrets.
- Prepare a title/caption/description and relevant tags/hashtags for review.
- Upload only after the user has configured a Page and approved the publication workflow.
- Record the returned post/video identifier, publication time, target Page and result.
- Verify publication outcome where the API provides a reliable result.
- Prevent accidental duplicate publishing and provide clear retry behavior.
- Keep manual upload available as a fallback.

### Recovery, safety and reliability
- Unique job IDs and isolated per-job output folders.
- Atomic/temporary download handling and file validation before accepting a clip.
- No overwriting existing clips or finished videos.
- Persistent job state so interrupted jobs can resume.
- Retry only the failed step when safe; do not regenerate or republish successful work unnecessarily.
- Detect incomplete downloads, missing files, corrupted media, failed merges and API errors.
- Detailed timestamped logs with secrets and tokens redacted.
- Back up the local database and job metadata.
- Make uncertain actions visible and require manual intervention rather than guessing.

### Optional scheduler
A scheduler may run jobs at configured times while the application and computer are awake and available. It cannot execute generation while the PC is powered off or asleep. Missed schedules should be marked and handled transparently when the app starts again.

## Proposed technology

| Layer | Proposed technology |
|---|---|
| Windows desktop application | Electron + React + TypeScript |
| Local service/orchestrator | Python + FastAPI |
| Job and settings database | SQLite |
| Browser automation bridge | Chrome Extension (Manifest V3) + Chrome DevTools Protocol (CDP) |
| Video validation/processing | FFmpeg + FFprobe |
| Prompt provider | Configurable OpenAI-compatible API, with manual fallback |
| Facebook publishing | Meta Graph API, subject to current permissions and supported endpoints |
| Packaging | Windows installer / desktop executable |

These are proposed implementation choices; Flow automation, media processing and Facebook publishing are not yet verified.

## Suggested repository layout

```text
FB-ASMR-Factory/
├── README.md
├── PROJECT_STATUS.md
├── DEVELOPMENT_LOG.md
├── docs/
│   ├── PROJECT_SPECIFICATION.md
│   ├── ARCHITECTURE.md
│   └── DEVELOPMENT_ROADMAP.md
├── apps/
│   └── desktop/
├── services/
│   └── orchestrator/
├── extensions/
│   └── flow-automation/
├── packages/
│   └── shared-contracts/
├── tests/
├── scripts/
└── .github/
    └── workflows/
```

The folders are a target structure; create them as implementation begins.

## Development principles

1. Build in small, testable milestones.
2. Do not claim Flow automation works until tested against the actual Flow UI and accounts.
3. Keep user authentication separate per browser profile.
4. Do not bypass Google Flow access controls, account limits or platform safeguards.
5. Treat downloaded media and browser state as untrusted inputs.
6. Keep secrets out of source control and logs.
7. Make all generated outputs traceable to their prompts and job.
8. Preserve manual controls and recovery paths.
9. Test Facebook publishing with a controlled Page before enabling unattended publishing.
10. Update [PROJECT_STATUS.md](PROJECT_STATUS.md) whenever a milestone changes.

## Getting started

On Windows, install Node.js 20+ and Python 3.10+ once, extract the repository ZIP, then double-click [INSTALL.bat](INSTALL.bat). It prepares the Python environment, installs dependencies, starts the backend and launches the dashboard. See [docs/DEVELOPMENT_SETUP.md](docs/DEVELOPMENT_SETUP.md) for details. The current build supports all seven ASMR styles, five distinct prompts per job, a persistent Style Bible, editing/approval and an optional OpenAI-compatible prompt provider. It also includes five isolated Flow profile slots, an extension task bridge and a five-clip FFmpeg/FFprobe assembly endpoint. Install FFmpeg and FFprobe and ensure they are on PATH. Flow settings and live generation still need verification against authenticated accounts; Meta publishing is not implemented yet. See [docs/AI_DIRECTOR_PROMPT_STUDIO.md](docs/AI_DIRECTOR_PROMPT_STUDIO.md) and [PROJECT_STATUS.md](PROJECT_STATUS.md).

Track implementation in [PROJECT_STATUS.md](PROJECT_STATUS.md) and follow [docs/DEVELOPMENT_ROADMAP.md](docs/DEVELOPMENT_ROADMAP.md).

## Important limitations

- Google Flow's UI, available models, generation options and download behavior may change. Automation must be tested against the current interface.
- Availability of Veo 3.1 Lite, 720p and 8-second generation depends on the signed-in account and Flow product availability.
- Facebook publishing depends on Meta's current Graph API support, Page permissions, app review and token requirements.
- Scheduler execution requires the computer to be awake and the app/service to be running.
