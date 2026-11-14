# Development Setup (Windows)

This guide starts the first local development build. It currently supports creating and listing persisted Fruits jobs with five planned clip tasks. It does not yet connect to Google Flow or Facebook.

## Prerequisites

- Windows 10/11
- Node.js 20 or newer (includes npm)
- Python 3.10 or newer
- Git

## 1. Start the Python orchestrator

Open PowerShell at the repository root:

```powershell
cd services/orchestrator
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

Leave this terminal running. Confirm the service responds at:

`http://127.0.0.1:8765/api/v1/health`

## 2. Start the desktop app

Open a second PowerShell window:

```powershell
cd apps/desktop
npm install
npm run dev
```

Electron should open the ASMR Factory dashboard. The local service must already be running for job creation and history.

## 3. Run backend tests

Open a third PowerShell window:

```powershell
cd services/orchestrator
.\.venv\Scripts\Activate.ps1
python -m unittest discover -s tests -v
```

## Local data

By default, the SQLite database is created at:

`services/orchestrator/data/asmr_factory.sqlite3`

This directory is ignored by Git. To store data elsewhere, set `ASMR_FACTORY_DATA` before starting the service.

## Current limitations

- The prompt cards are planned placeholders, not generated AI prompts.
- The five clip subjects are deterministic starter data for the first UI/backend milestone.
- No Google Flow browser automation or download handling is connected.
- No FFmpeg compilation pipeline is connected.
- No Facebook login or publishing is connected.
- The Electron production packaging/installer is not configured yet.

Do not use this prototype for unattended publishing.