@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

rem 优先使用项目虚拟环境，其次 py 启动器，最后 python 命令
set "PYRUN="
if exist ".venv\Scripts\python.exe" (
    set "PYRUN=.venv\Scripts\python.exe"
)
if not defined PYRUN (
    py -3 --version >nul 2>nul
    if not errorlevel 1 set "PYRUN=py -3"
)
if not defined PYRUN (
    python --version >nul 2>nul
    if not errorlevel 1 set "PYRUN=python"
)

if not defined PYRUN (
    echo [错误] 没有找到可用的 Python 3。
    echo 请安装 Python 3.10+（安装时勾选 Add Python to PATH），然后重新打开本窗口重试。
    pause
    exit /b 1
)

%PYRUN% -c "import PySide6" >nul 2>nul
if errorlevel 1 (
    echo [提示] 依赖还没有安装。
    echo 请先双击运行 install.cmd，或手动执行：
    echo     %PYRUN% -m pip install -r requirements.txt
    pause
    exit /b 1
)

if /i "%~1"=="--check" (
    %PYRUN% -c "import sys, PySide6; print('Python :', sys.version.split()[0]); print('PySide6:', PySide6.__version__)"
    exit /b 0
)

echo 正在启动 codemv ...
%PYRUN% -m codemv gui
if errorlevel 1 (
    echo.
    echo [错误] codemv 启动失败。请把上面的报错信息发给开发者。
    pause
)
endlocal
