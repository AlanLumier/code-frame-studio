@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 需要 Node.js 18 或更新版本。
  pause
  exit /b 1
)
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo [错误] 安装失败，请检查网络。
  pause
  exit /b 1
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo [提示] Electron 运行时没有下载完整，请重新运行本脚本。
) else (
  echo [完成] 以后双击 run.cmd 启动 codemv。
)
pause
endlocal
