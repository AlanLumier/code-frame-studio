@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 没有找到 Node.js，请先安装 Node 18 或更新版本。
    pause
    exit /b 1
)

echo 正在安装 p5 / p5.brush / puppeteer-core ...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo.
    echo 安装失败，尝试使用 npmmirror 镜像...
    call npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
)
if errorlevel 1 (
    echo [错误] 依赖安装失败，请检查网络。
    pause
    exit /b 1
)

echo.
echo [完成] p5.brush 手绘渲染后端已准备好。
pause
endlocal
