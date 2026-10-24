@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is required. Install Node 18+ first.
  pause
  exit /b 1
)
if not exist "legacy\server.js" (
  echo [ERROR] legacy CodeMV files are missing.
  pause
  exit /b 1
)
set "EDGE=C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=C:\Program Files\Microsoft\Edge\Application\msedge.exe"
start "" /min node legacy\server.js
timeout /t 2 /nobreak >nul
if exist "%EDGE%" (
  start "" "%EDGE%" --app=http://127.0.0.1:8899/ --window-size=1440,900 --user-data-dir="%~dp0.edge-profile" --no-first-run --no-default-browser-check
) else (
  start "" http://127.0.0.1:8899/
)
endlocal
