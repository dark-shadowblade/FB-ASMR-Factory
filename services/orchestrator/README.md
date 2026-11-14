# Local Orchestrator

## Windows setup

Use Python 3.10+.

```powershell
cd services/orchestrator
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8765 --reload
```

Health check: http://127.0.0.1:8765/api/v1/health

The SQLite database is created automatically under `services/orchestrator/data/` by default. Override its location with `ASMR_FACTORY_DATA`.

This first service milestone creates and lists durable Fruits jobs with exactly five planned clip records. It does not yet generate AI prompts or automate Flow.
