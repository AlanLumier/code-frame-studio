@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo [ERROR] Electron runtime not found. Run install.cmd first.
  pause
  exit /b 1
)
if not exist ".userdata" mkdir ".userdata"
start "" "node_modules\electron\dist\electron.exe" . --no-sandbox
endlocal
