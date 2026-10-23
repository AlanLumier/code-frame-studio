@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0create_shortcut.ps1"
pause
endlocal
