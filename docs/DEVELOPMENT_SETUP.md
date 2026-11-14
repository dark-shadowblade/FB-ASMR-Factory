# Windows Quick Start

The easiest way to run the current development build is the one-click launcher.

## One-click setup

1. Install **Node.js 20 or newer** from https://nodejs.org/ and **Python 3.10 or newer** from https://www.python.org/downloads/windows/.
2. Download this repository using **Code → Download ZIP** and extract it.
3. Open the extracted folder and double-click **INSTALL.bat**.
4. On the first run, the script creates an isolated Python environment and installs the required Python and Node dependencies. It then starts the local backend and opens the Electron dashboard.
5. Keep the backend terminal window open while using the app. Close the dashboard with its normal window close button; close the backend terminal when finished.

Run **INSTALL.bat** again for later launches. It reuses the installed environments and checks/installs backend dependencies.

## What the launcher checks

- Node.js 20+ and Python 3.10+
- Creates `services/orchestrator/.venv` if missing
- Installs the backend requirements
- Installs desktop npm packages on the first run
- Starts the backend and waits for its health endpoint before launching Electron

If Node.js or Python is missing or too old, install it from the official links above, restart Windows if needed, and run the launcher again.

## Manual setup (optional)

If you prefer PowerShell, use the commands below from the repository root.

Backend terminal:

```powershell
cd services/orchestrator
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

Desktop terminal:

```powershell
cd apps/desktop
npm install
npm run dev
```

## Current limitations

This is still a development build. It supports local Fruits job planning with five persisted placeholder clip tasks. AI prompt generation, Google Flow automation, downloads, FFmpeg compilation, Facebook publishing and a packaged Windows installer are not implemented yet. The launcher does not install Node.js or Python for you; those two prerequisites must be installed once.
