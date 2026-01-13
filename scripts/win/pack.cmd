@echo off
echo ========== pack.cmd 启动 ==========
echo.

REM 设置 UTF-8 编码
chcp 65001 >nul 2>nul
echo [DEBUG] 编码设置完成

setlocal enabledelayedexpansion
echo [DEBUG] enabledelayedexpansion 已启用

REM 显示当前目录
echo [DEBUG] 当前目录: %CD%
echo [DEBUG] 脚本路径: %~dp0

REM 切换到项目根目录（脚本位于 scripts\win）
cd /d "%~dp0..\.."
echo [DEBUG] 切换后目录: %CD%

set "PROJECT_ROOT=%CD%"
echo [DEBUG] PROJECT_ROOT=%PROJECT_ROOT%

echo.
echo ============================================================
echo           Agent Society 一键打包工具
echo ============================================================
echo.

REM ============================================================
REM 步骤 1: 解析命令行参数
REM ============================================================
echo [1/6] 解析参数...
echo [DEBUG] 参数1: %~1

REM 生成默认文件名（使用 PowerShell 获取时间戳）
echo [DEBUG] 正在获取时间戳...
for /f "delims=" %%i in ('powershell -NoProfile -Command "Get-Date -Format 'yyyyMMdd-HHmmss'"') do (
    set "TIMESTAMP=%%i"
    echo [DEBUG] 时间戳: %%i
)

if "%~1"=="" (
    set "OUTPUT_NAME=agent-society-!TIMESTAMP!"
    echo [DEBUG] 使用默认文件名
) else (
    set "OUTPUT_NAME=%~1"
    echo [DEBUG] 使用自定义文件名
)

set "DIST_DIR=%PROJECT_ROOT%\dist"
set "OUTPUT_FILE=!DIST_DIR!\!OUTPUT_NAME!.zip"
set "TEMP_DIR=%PROJECT_ROOT%\.pack-temp"
set "PACK_DIR=!TEMP_DIR!\agent-society"

echo [DEBUG] OUTPUT_NAME=!OUTPUT_NAME!
echo [DEBUG] DIST_DIR=!DIST_DIR!
echo [DEBUG] OUTPUT_FILE=!OUTPUT_FILE!
echo [DEBUG] TEMP_DIR=!TEMP_DIR!
echo [DEBUG] PACK_DIR=!PACK_DIR!

echo      输出文件: !OUTPUT_FILE!
echo.

REM ============================================================
REM 步骤 2: 检测 bun 运行时
REM ============================================================
echo [2/6] 检测 bun 运行时...

REM 查找真正的 bun.exe（不是 shim 脚本）
REM 优先级: 1. %USERPROFILE%\.bun\bin\bun.exe  2. %BUN_INSTALL%\bin\bun.exe
set "BUN_PATH="
set "BUN_DIR="

REM 检查默认安装路径
if exist "%USERPROFILE%\.bun\bin\bun.exe" (
    set "BUN_PATH=%USERPROFILE%\.bun\bin\bun.exe"
    set "BUN_DIR=%USERPROFILE%\.bun"
    echo [DEBUG] 在默认路径找到 bun: !BUN_PATH!
    goto :found_bun
)

REM 检查 BUN_INSTALL 环境变量
if defined BUN_INSTALL (
    if exist "!BUN_INSTALL!\bin\bun.exe" (
        set "BUN_PATH=!BUN_INSTALL!\bin\bun.exe"
        set "BUN_DIR=!BUN_INSTALL!"
        echo [DEBUG] 在 BUN_INSTALL 路径找到 bun: !BUN_PATH!
        goto :found_bun
    )
)

REM 尝试通过 where bun 找到 shim，然后解析真实路径
echo [DEBUG] 尝试通过 shim 查找...
for /f "delims=" %%i in ('where bun 2^>nul') do (
    set "SHIM_PATH=%%i"
    echo [DEBUG] 找到 shim: %%i
    REM 检查 shim 所在目录的上级是否有 bin\bun.exe
    for %%j in ("%%~dpi..") do (
        if exist "%%~fj\bin\bun.exe" (
            set "BUN_PATH=%%~fj\bin\bun.exe"
            set "BUN_DIR=%%~fj"
            echo [DEBUG] 从 shim 解析到: !BUN_PATH!
            goto :found_bun
        )
    )
)

REM 没找到
echo.
echo 错误: 未找到 bun 运行时
echo 已检查路径:
echo   - %USERPROFILE%\.bun\bin\bun.exe
if defined BUN_INSTALL echo   - %BUN_INSTALL%\bin\bun.exe
echo.
echo 解决方案: 请先安装 bun
echo 安装指南: https://bun.sh
echo.
pause
exit /b 1

:found_bun
echo      找到 bun: !BUN_PATH!
echo      bun 目录: !BUN_DIR!
echo.

REM ============================================================
REM 步骤 3: 检查必要目录
REM ============================================================
echo [3/6] 检查项目目录...

set "MISSING_DIRS="
echo [DEBUG] 检查 src...
if not exist "%PROJECT_ROOT%\src" (
    set "MISSING_DIRS=!MISSING_DIRS! src"
    echo [DEBUG] src 不存在
) else (
    echo [DEBUG] src 存在
)

echo [DEBUG] 检查 web...
if not exist "%PROJECT_ROOT%\web" (
    set "MISSING_DIRS=!MISSING_DIRS! web"
    echo [DEBUG] web 不存在
) else (
    echo [DEBUG] web 存在
)

echo [DEBUG] 检查 config...
if not exist "%PROJECT_ROOT%\config" (
    set "MISSING_DIRS=!MISSING_DIRS! config"
    echo [DEBUG] config 不存在
) else (
    echo [DEBUG] config 存在
)

echo [DEBUG] 检查 node_modules...
if not exist "%PROJECT_ROOT%\node_modules" (
    set "MISSING_DIRS=!MISSING_DIRS! node_modules"
    echo [DEBUG] node_modules 不存在
) else (
    echo [DEBUG] node_modules 存在
)

if not "!MISSING_DIRS!"=="" (
    echo.
    echo 错误: 缺少必要目录:!MISSING_DIRS!
    echo 解决方案: 请确保在项目根目录运行，并已执行 bun install
    echo.
    pause
    exit /b 1
)
echo      目录检查通过
echo.

REM ============================================================
REM 步骤 4: 创建临时目录并复制文件
REM ============================================================
echo [4/6] 复制项目文件...

REM 清理可能存在的临时目录
echo [DEBUG] 清理临时目录...
if exist "!TEMP_DIR!" (
    echo [DEBUG] 删除已存在的临时目录
    rmdir /s /q "!TEMP_DIR!"
)

echo [DEBUG] 创建临时目录: !PACK_DIR!
mkdir "!PACK_DIR!"

REM 创建 runtime 目录并复制整个 bun 运行时
echo      复制 bun 运行时...
mkdir "!PACK_DIR!\runtime"
echo [DEBUG] 复制整个 bun 目录: !BUN_DIR! 到 !PACK_DIR!\runtime\bun
xcopy "!BUN_DIR!" "!PACK_DIR!\runtime\bun" /E /I /Q >nul
echo [DEBUG] bun 运行时复制完成

REM 复制目录
echo      复制 src...
xcopy "%PROJECT_ROOT%\src" "!PACK_DIR!\src" /E /I /Q >nul
echo [DEBUG] src 复制完成

echo      复制 web...
xcopy "%PROJECT_ROOT%\web" "!PACK_DIR!\web" /E /I /Q >nul
echo [DEBUG] web 复制完成

echo      复制 config...
xcopy "%PROJECT_ROOT%\config" "!PACK_DIR!\config" /E /I /Q >nul
echo [DEBUG] config 复制完成

REM 删除敏感配置文件（不应包含在发布包中）
echo      排除敏感配置文件...
if exist "!PACK_DIR!\config\app.local.json" (
    del "!PACK_DIR!\config\app.local.json"
    echo [DEBUG] 已排除 app.local.json
)
if exist "!PACK_DIR!\config\llmservices.json" (
    del "!PACK_DIR!\config\llmservices.json"
    echo [DEBUG] 已排除 llmservices.json
)

if exist "!PACK_DIR!\config\llmservices.local.json" (
    del "!PACK_DIR!\config\llmservices.local.json"
    echo [DEBUG] 已排除 llmservices.json
)

echo      复制 modules...
if exist "%PROJECT_ROOT%\modules" (
    xcopy "%PROJECT_ROOT%\modules" "!PACK_DIR!\modules" /E /I /Q >nul
    echo [DEBUG] modules 复制完成
) else (
    echo [DEBUG] modules 不存在，跳过
)

echo      复制 docs...
if exist "%PROJECT_ROOT%\docs" (
    xcopy "%PROJECT_ROOT%\docs" "!PACK_DIR!\docs" /E /I /Q >nul
    echo [DEBUG] docs 复制完成
) else (
    echo [DEBUG] docs 不存在，跳过
)

echo      复制 node_modules（可能需要几分钟，请耐心等待）...
xcopy "%PROJECT_ROOT%\node_modules" "!PACK_DIR!\node_modules" /E /I /Q >nul
echo [DEBUG] node_modules 复制完成

REM 复制根目录文件
echo      复制根目录文件...
if exist "%PROJECT_ROOT%\start.cmd" copy "%PROJECT_ROOT%\start.cmd" "!PACK_DIR!\" >nul
if exist "%PROJECT_ROOT%\start.sh" copy "%PROJECT_ROOT%\start.sh" "!PACK_DIR!\" >nul
if exist "%PROJECT_ROOT%\start.js" copy "%PROJECT_ROOT%\start.js" "!PACK_DIR!\" >nul
if exist "%PROJECT_ROOT%\package.json" copy "%PROJECT_ROOT%\package.json" "!PACK_DIR!\" >nul
if exist "%PROJECT_ROOT%\README.md" copy "%PROJECT_ROOT%\README.md" "!PACK_DIR!\" >nul
if exist "%PROJECT_ROOT%\LICENSE" copy "%PROJECT_ROOT%\LICENSE" "!PACK_DIR!\" >nul
if exist "%PROJECT_ROOT%\bun.lock" copy "%PROJECT_ROOT%\bun.lock" "!PACK_DIR!\" >nul
echo [DEBUG] 根目录文件复制完成

echo      文件复制完成
echo.

REM ============================================================
REM 步骤 5: 创建 zip 文件
REM ============================================================
echo [5/6] 创建 zip 文件...

REM 确保 dist 目录存在
if not exist "!DIST_DIR!" (
    echo [DEBUG] 创建 dist 目录
    mkdir "!DIST_DIR!"
)

REM 删除已存在的同名文件
if exist "!OUTPUT_FILE!" (
    echo [DEBUG] 删除已存在的 zip 文件
    del "!OUTPUT_FILE!"
)

REM 使用 PowerShell 创建 zip
echo [DEBUG] 执行 PowerShell Compress-Archive...
powershell -NoProfile -Command "Compress-Archive -Path '!PACK_DIR!' -DestinationPath '!OUTPUT_FILE!' -Force"

set "ZIP_RESULT=!ERRORLEVEL!"
echo [DEBUG] Compress-Archive 返回码: !ZIP_RESULT!

if !ZIP_RESULT! NEQ 0 (
    echo.
    echo 错误: 创建 zip 文件失败
    echo 正在清理临时文件...
    rmdir /s /q "!TEMP_DIR!" 2>nul
    echo.
    pause
    exit /b 1
)

echo      zip 文件创建成功
echo.

REM ============================================================
REM 步骤 6: 清理并显示结果
REM ============================================================
echo [6/6] 清理临时文件...
rmdir /s /q "!TEMP_DIR!"
echo [DEBUG] 临时目录已清理

REM 获取文件大小
for %%A in ("!OUTPUT_FILE!") do set "FILE_SIZE=%%~zA"
set /a "FILE_SIZE_MB=!FILE_SIZE! / 1048576"

echo.
echo ============================================================
echo                     打包完成!
echo ============================================================
echo.
echo 输出文件: !OUTPUT_FILE!
echo 文件大小: !FILE_SIZE_MB! MB (!FILE_SIZE! bytes)
echo.
echo 使用说明:
echo   1. 将 zip 文件分发给用户
echo   2. 用户解压后运行 agent-society\start.cmd 即可启动
echo.

pause
endlocal
exit /b 0
