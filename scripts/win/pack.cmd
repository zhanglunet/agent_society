@echo off
REM Agent Society 一键打包脚本 (Windows CMD)
REM
REM 用法:
REM   pack.cmd [输出文件名]
REM
REM 参数:
REM   输出文件名  可选，不含.zip后缀，默认: agent-society-YYYYMMDD-HHMMSS
REM
REM 示例:
REM   pack.cmd                    # 使用默认文件名
REM   pack.cmd my-release         # 输出 dist\my-release.zip

setlocal enabledelayedexpansion

REM 切换到项目根目录（脚本位于 scripts\win）
cd /d "%~dp0..\.."
set "PROJECT_ROOT=%CD%"

echo.
echo ============================================================
echo           Agent Society 一键打包工具
echo ============================================================
echo.

REM ============================================================
REM 步骤 1: 解析命令行参数
REM ============================================================
echo [1/6] 解析参数...

REM 生成默认文件名（基于时间戳）
for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set "DATE_STR=%%a%%b%%c"
for /f "tokens=1-2 delims=: " %%a in ('time /t') do set "TIME_STR=%%a%%b"
REM 移除可能的空格
set "DATE_STR=%DATE_STR: =%"
set "TIME_STR=%TIME_STR: =%"

if "%~1"=="" (
    set "OUTPUT_NAME=agent-society-%DATE_STR%-%TIME_STR%"
) else (
    set "OUTPUT_NAME=%~1"
)

set "DIST_DIR=%PROJECT_ROOT%\dist"
set "OUTPUT_FILE=%DIST_DIR%\%OUTPUT_NAME%.zip"
set "TEMP_DIR=%PROJECT_ROOT%\.pack-temp"
set "PACK_DIR=%TEMP_DIR%\agent-society"

echo      输出文件: %OUTPUT_FILE%
echo.

REM ============================================================
REM 步骤 2: 检测 bun 运行时
REM ============================================================
echo [2/6] 检测 bun 运行时...

where bun >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 错误: 未找到 bun 运行时
    echo 解决方案: 请先安装 bun
    echo 安装指南: https://bun.sh
    exit /b 1
)

REM 获取 bun.exe 的完整路径
for /f "delims=" %%i in ('where bun') do (
    set "BUN_PATH=%%i"
    goto :found_bun
)
:found_bun
echo      找到 bun: %BUN_PATH%
echo.

REM ============================================================
REM 步骤 3: 检查必要目录
REM ============================================================
echo [3/6] 检查项目目录...

set "MISSING_DIRS="
if not exist "%PROJECT_ROOT%\src" set "MISSING_DIRS=!MISSING_DIRS! src"
if not exist "%PROJECT_ROOT%\web" set "MISSING_DIRS=!MISSING_DIRS! web"
if not exist "%PROJECT_ROOT%\config" set "MISSING_DIRS=!MISSING_DIRS! config"
if not exist "%PROJECT_ROOT%\node_modules" set "MISSING_DIRS=!MISSING_DIRS! node_modules"

if not "!MISSING_DIRS!"=="" (
    echo.
    echo 错误: 缺少必要目录:!MISSING_DIRS!
    echo 解决方案: 请确保在项目根目录运行，并已执行 bun install
    exit /b 1
)
echo      目录检查通过
echo.

REM ============================================================
REM 步骤 4: 创建临时目录并复制文件
REM ============================================================
echo [4/6] 复制项目文件...

REM 清理可能存在的临时目录
if exist "%TEMP_DIR%" rmdir /s /q "%TEMP_DIR%"
mkdir "%PACK_DIR%"

REM 创建 runtime 目录并复制 bun
echo      复制 bun 运行时...
mkdir "%PACK_DIR%\runtime"
copy "%BUN_PATH%" "%PACK_DIR%\runtime\bun.exe" >nul

REM 复制目录
echo      复制 src...
xcopy "%PROJECT_ROOT%\src" "%PACK_DIR%\src" /E /I /Q >nul
echo      复制 web...
xcopy "%PROJECT_ROOT%\web" "%PACK_DIR%\web" /E /I /Q >nul
echo      复制 config...
xcopy "%PROJECT_ROOT%\config" "%PACK_DIR%\config" /E /I /Q >nul
echo      复制 modules...
if exist "%PROJECT_ROOT%\modules" xcopy "%PROJECT_ROOT%\modules" "%PACK_DIR%\modules" /E /I /Q >nul
echo      复制 docs...
if exist "%PROJECT_ROOT%\docs" xcopy "%PROJECT_ROOT%\docs" "%PACK_DIR%\docs" /E /I /Q >nul
echo      复制 node_modules（可能需要一些时间）...
xcopy "%PROJECT_ROOT%\node_modules" "%PACK_DIR%\node_modules" /E /I /Q >nul

REM 复制根目录文件
echo      复制根目录文件...
if exist "%PROJECT_ROOT%\start.cmd" copy "%PROJECT_ROOT%\start.cmd" "%PACK_DIR%\" >nul
if exist "%PROJECT_ROOT%\start.sh" copy "%PROJECT_ROOT%\start.sh" "%PACK_DIR%\" >nul
if exist "%PROJECT_ROOT%\start.js" copy "%PROJECT_ROOT%\start.js" "%PACK_DIR%\" >nul
if exist "%PROJECT_ROOT%\package.json" copy "%PROJECT_ROOT%\package.json" "%PACK_DIR%\" >nul
if exist "%PROJECT_ROOT%\README.md" copy "%PROJECT_ROOT%\README.md" "%PACK_DIR%\" >nul
if exist "%PROJECT_ROOT%\LICENSE" copy "%PROJECT_ROOT%\LICENSE" "%PACK_DIR%\" >nul
if exist "%PROJECT_ROOT%\bun.lock" copy "%PROJECT_ROOT%\bun.lock" "%PACK_DIR%\" >nul

echo      文件复制完成
echo.

REM ============================================================
REM 步骤 5: 创建 zip 文件
REM ============================================================
echo [5/6] 创建 zip 文件...

REM 确保 dist 目录存在
if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"

REM 删除已存在的同名文件
if exist "%OUTPUT_FILE%" del "%OUTPUT_FILE%"

REM 使用 PowerShell 创建 zip
powershell -NoProfile -Command "Compress-Archive -Path '%PACK_DIR%' -DestinationPath '%OUTPUT_FILE%' -Force"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo 错误: 创建 zip 文件失败
    echo 正在清理临时文件...
    rmdir /s /q "%TEMP_DIR%" 2>nul
    exit /b 1
)

echo      zip 文件创建成功
echo.

REM ============================================================
REM 步骤 6: 清理并显示结果
REM ============================================================
echo [6/6] 清理临时文件...
rmdir /s /q "%TEMP_DIR%"

REM 获取文件大小
for %%A in ("%OUTPUT_FILE%") do set "FILE_SIZE=%%~zA"
set /a "FILE_SIZE_MB=%FILE_SIZE% / 1048576"

echo.
echo ============================================================
echo                     打包完成!
echo ============================================================
echo.
echo 输出文件: %OUTPUT_FILE%
echo 文件大小: %FILE_SIZE_MB% MB (%FILE_SIZE% bytes)
echo.
echo 使用说明:
echo   1. 将 zip 文件分发给用户
echo   2. 用户解压后运行 agent-society\start.cmd 即可启动
echo.

endlocal
exit /b 0
