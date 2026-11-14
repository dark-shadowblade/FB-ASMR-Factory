@echo off
setlocal EnableExtensions
title FB-ASMR-Factory Setup

echo.
echo  ==========================================
echo       FB-ASMR-FACTORY - ONE CLICK START
echo  ==========================================
echo.

set "ROOT=%~dp0"
set "BACKEND=%ROOT%services\orchestrator"
set "DESKTOP=%ROOT%apps\desktop"
set "VENV=%BACKEND%\.venv"
set "VENV_PY=%VENV%\Scripts\python.exe"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed.
  echo Install Node.js 20 or newer from https://nodejs.org/
  goto :fail
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node.split('.')[0]"') do set "NODE_MAJOR=%%V"
if %NODE_MAJOR% LSS 20 (
  echo [ERROR] Node.js 20 or newer is required. Detected:
  node --version
  echo Update Node.js from https://nodejs.org/
  goto :fail
)

set "PY_CMD="
where py >nul 2>nul
if not errorlevel 1 (
  py -3 --version >nul 2>nul
  if not errorlevel 1 set "PY_CMD=py -3"
)
if not defined PY_CMD (
  where python >nul 2>nul
  if not errorlevel 1 set "PY_CMD=python"
)
if not defined PY_CMD (
  echo [ERROR] Python 3.10 or newer is not installed.
  echo Install Python from https://www.python.org/downloads/windows/
  goto :fail
)

echo [1/4] Preparing the Python environment...
if not exist "%VENV_PY%" (
  %PY_CMD% -m venv "%VENV%"
  if errorlevel 1 goto :fail
)

echo [2/4] Installing backend dependencies...
"%VENV_PY%" -m pip install --upgrade pip
if errorlevel 1 goto :fail
"%VENV_PY%" -m pip install -r "%BACKEND%\requirements.txt"
if errorlevel 1 goto :fail

echo [3/4] Installing desktop dependencies (first run only)...
if not exist "%DESKTOP%\node_modules\electron\dist\electron.exe" (
  pushd "%DESKTOP%"
  call npm install
  if errorlevel 1 (
    popd
    goto :fail
  )
  popd
)

echo [4/4] Starting the local service...
start "FB-ASMR-Factory Backend" /D "%BACKEND%" cmd /k ""%VENV_PY%" -m uvicorn app.main:app --host 127.0.0.1 --port 8765"

echo Waiting for the backend to become ready...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ready=$false; for($i=0;$i -lt 30;$i++){ try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8765/api/v1/health -TimeoutSec 2; if($r.StatusCode -eq 200){$ready=$true; break} } catch {}; Start-Sleep -Seconds 1 }; if(-not $ready){exit 1}"
if errorlevel 1 (
  echo [ERROR] The backend did not become ready. Check its terminal window.
  goto :fail
)

echo Launching the desktop dashboard...
pushd "%DESKTOP%"
call npm run dev
popd

echo.
echo FB-ASMR-Factory has been closed.
pause
exit /b 0

:fail
echo.
echo Setup could not continue. Fix the error above and run INSTALL.bat again.
pause
exit /b 1
