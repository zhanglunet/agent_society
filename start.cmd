@echo off
REM Agent Society 服务器启动脚本 (Windows)
REM
REM 用法:
REM   start.cmd [数据目录] [选项]
REM
REM 选项:
REM   --port, -p <端口>  HTTP 服务器端口 (默认: 3000)
REM   --no-browser       不自动打开浏览器
REM
REM 示例:
REM   start.cmd                           # 使用默认配置
REM   start.cmd ./my-data                 # 自定义数据目录
REM   start.cmd --port 3001               # 自定义端口
REM   start.cmd ./my-data -p 3001 --no-browser

setlocal enabledelayedexpansion

REM 切换到脚本所在目录
cd /d "%~dp0"

echo.
echo ============================================================
echo           Agent Society 启动脚本
echo ============================================================
echo.

REM ============================================================
REM 步骤 0: 检查是否需要更新代码
REM ============================================================
if exist ".git" (
    echo [0/3] 尝试更新代码...
    git pull 2>nul || echo      git pull 跳过（可能未安装 git 或网络问题）
    echo.
) else (
    echo [0/3] 跳过代码更新（分发包模式）
    echo.
)

REM ============================================================
REM 步骤 1: 检测 bun 运行时
REM ============================================================
echo [1/3] 检测 bun 运行时...

REM 首先检查本地 runtime 目录
set "LOCAL_BUN=%~dp0runtime\bun.exe"
if exist "!LOCAL_BUN!" (
    echo      使用本地 bun: !LOCAL_BUN!
    set "BUN_CMD=!LOCAL_BUN!"
    goto :install_deps
)

REM 检查系统 PATH 中的 bun
where bun >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo      使用系统 bun
    set "BUN_CMD=bun"
    goto :install_deps
)

REM bun 未安装，询问用户是否安装
echo      bun 未安装
echo.
echo bun 是本项目所需的 JavaScript 运行时。
echo 是否自动安装 bun? (安装来源: https://bun.sh)
echo.
set /p INSTALL_BUN="请输入 Y 安装，N 退出 [Y/N]: "

if /i "!INSTALL_BUN!"=="Y" goto :install_bun
if /i "!INSTALL_BUN!"=="y" goto :install_bun

REM 用户拒绝安装
echo.
echo 您选择不安装 bun。
echo 请手动安装 bun 后重新运行此脚本。
echo 安装指南: https://bun.sh
exit /b 0

:install_bun
REM 安装 bun
echo.
echo [1/3] 正在安装 bun...
echo      执行: powershell -c "irm bun.sh/install.ps1 | iex"
echo.
powershell -c "irm bun.sh/install.ps1 | iex"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 错误: bun 安装失败
    echo 解决方案: 请手动安装 bun
    echo 安装指南: https://bun.sh
    exit /b 1
)

REM 刷新 PATH 环境变量（从注册表读取用户 PATH）
echo.
echo      刷新环境变量...
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul') do set "USER_PATH=%%b"
set "PATH=!USER_PATH!;%PATH%"

REM 验证 bun 安装
where bun >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 错误: bun 安装后无法找到
    echo 解决方案: 请关闭此窗口，重新打开命令行后再运行此脚本
    echo 或手动安装 bun: https://bun.sh
    exit /b 1
)
echo      bun 安装成功
set "BUN_CMD=bun"

:install_deps
REM 安装依赖
echo.
echo [2/3] 安装项目依赖...
echo      执行: "!BUN_CMD!" install
echo.
"!BUN_CMD!" install

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 错误: 依赖安装失败
    echo 解决方案: 请检查网络连接，或检查 package.json 是否正确
    exit /b 1
)

REM 启动服务器
echo.
echo [3/3] 启动服务器...
echo.
"!BUN_CMD!" run start.js %*

endlocal
