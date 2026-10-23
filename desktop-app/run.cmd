@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo [提示] 还没有安装 Electron 运行环境，请先双击 install.cmd。
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
endlocal
