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

echo 使用解释器: %PYRUN%
echo 正在安装依赖（约 100 MB），请保持网络连接...
echo.

%PYRUN% -m pip install -r requirements.txt
if errorlevel 1 (
    echo.
    echo 默认源安装失败，改用清华镜像源重试...
    %PYRUN% -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
)
if errorlevel 1 (
    echo.
    echo [错误] 依赖安装失败。请检查网络后重试，或手动执行：
    echo     %PYRUN% -m pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
    pause
    exit /b 1
)

echo.
echo [完成] 依赖已经安装好，以后双击 run.cmd 即可启动 codemv。
pause
endlocal
