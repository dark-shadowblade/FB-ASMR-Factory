# AI Director and Prompt Studio

The first AI Director milestone is implemented in the local orchestrator and desktop dashboard.

## What it does

- Creates exactly five distinct prompts for the five subjects belonging to the selected one of seven ASMR styles.
- Applies one persistent ASMR Style Bible to all five prompts for consistent camera, lighting, surface and sound.
- Uses a built-in prompt composer immediately when no external AI provider is configured.
- Can use an OpenAI-compatible chat-completions endpoint when configured.
- Lets you edit and save each prompt before approval.
- Locks the prompt pack after all five prompts are approved.
- Stores prompts, style rules and job status in the local SQLite database.

## Optional AI provider configuration

The built-in composer requires no API key. To use a compatible AI model, set these environment variables in the PowerShell window that starts the backend:

```powershell
$env:ASMR_AI_BASE_URL = "https://api.openai.com/v1"
$env:ASMR_AI_API_KEY = "YOUR_API_KEY"
$env:ASMR_AI_MODEL = "YOUR_MODEL_NAME"
```

Then restart the backend in that same terminal. For another OpenAI-compatible provider, set its chat-completions base URL and model name. The key is read from the process environment; it is not stored in the repository or SQLite database.

If a configured provider returns an error or malformed output, the API reports an error and does not replace existing prompts. It does not silently pretend that provider-generated prompts succeeded.

## API

- `GET /api/v1/settings/ai` — reports whether a provider is configured (never returns the key).
- `GET /api/v1/style-bible` / `PUT /api/v1/style-bible` — read and save shared creative rules.
- `POST /api/v1/jobs/{job_id}/generate-prompts` — generate five prompts.
- `PATCH /api/v1/jobs/{job_id}/clips/{clip_id}/prompt` — edit one prompt.
- `POST /api/v1/jobs/{job_id}/approve-prompts` — approve and lock all five prompts.

This milestone does not automate Google Flow, generate video files, merge clips or publish to Facebook. Those remain separate milestones.
