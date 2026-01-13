#Requires -Version 5.0
<#
.SYNOPSIS
    Agent Society 一键打包脚本 (Windows PowerShell)

.DESCRIPTION
    将 Agent Society 项目打包成可直接分发的 zip 文件，
    包含项目源码、node_modules 和 bun 运行时。

.PARAMETER OutputName
    可选，输出文件名（不含.zip后缀）
    默认: agent-society-YYYYMMDD-HHMMSS

.EXAMPLE
    .\pack.ps1
    使用默认文件名打包

.EXAMPLE
    .\pack.ps1 -OutputName "my-release"
    输出 dist\my-release.zip
#>

param(
    [Parameter(Position = 0)]
    [string]$OutputName
)

# 设置错误处理
$ErrorActionPreference = "Stop"

# 切换到项目根目录（脚本位于 scripts\win）
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..") | Select-Object -ExpandProperty Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "           Agent Society 一键打包工具" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================
# 步骤 1: 解析参数
# ============================================================
Write-Host "[1/6] 解析参数..." -ForegroundColor Yellow

# 生成默认文件名
if ([string]::IsNullOrEmpty($OutputName)) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputName = "agent-society-$timestamp"
}

$DistDir = Join-Path $ProjectRoot "dist"
$OutputFile = Join-Path $DistDir "$OutputName.zip"
$TempDir = Join-Path $ProjectRoot ".pack-temp"
$PackDir = Join-Path $TempDir "agent-society"

Write-Host "     输出文件: $OutputFile"
Write-Host ""

# ============================================================
# 步骤 2: 检测 bun 运行时
# ============================================================
Write-Host "[2/6] 检测 bun 运行时..." -ForegroundColor Yellow

$BunPath = Get-Command bun -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source

if (-not $BunPath) {
    Write-Host ""
    Write-Host "错误: 未找到 bun 运行时" -ForegroundColor Red
    Write-Host "解决方案: 请先安装 bun" -ForegroundColor Red
    Write-Host "安装指南: https://bun.sh" -ForegroundColor Red
    exit 1
}

Write-Host "     找到 bun: $BunPath"
Write-Host ""

# ============================================================
# 步骤 3: 检查必要目录
# ============================================================
Write-Host "[3/6] 检查项目目录..." -ForegroundColor Yellow

$RequiredDirs = @("src", "web", "config", "node_modules")
$MissingDirs = @()

foreach ($dir in $RequiredDirs) {
    $dirPath = Join-Path $ProjectRoot $dir
    if (-not (Test-Path $dirPath)) {
        $MissingDirs += $dir
    }
}

if ($MissingDirs.Count -gt 0) {
    Write-Host ""
    Write-Host "错误: 缺少必要目录: $($MissingDirs -join ', ')" -ForegroundColor Red
    Write-Host "解决方案: 请确保在项目根目录运行，并已执行 bun install" -ForegroundColor Red
    exit 1
}

Write-Host "     目录检查通过"
Write-Host ""

# ============================================================
# 步骤 4: 创建临时目录并复制文件
# ============================================================
Write-Host "[4/6] 复制项目文件..." -ForegroundColor Yellow

# 清理可能存在的临时目录
if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force
}
New-Item -ItemType Directory -Path $PackDir -Force | Out-Null

# 创建 runtime 目录并复制 bun
Write-Host "     复制 bun 运行时..."
$RuntimeDir = Join-Path $PackDir "runtime"
New-Item -ItemType Directory -Path $RuntimeDir -Force | Out-Null
Copy-Item $BunPath (Join-Path $RuntimeDir "bun.exe")

# 复制目录的函数
function Copy-ProjectDir {
    param([string]$Name, [switch]$Optional)
    
    $SourcePath = Join-Path $ProjectRoot $Name
    $DestPath = Join-Path $PackDir $Name
    
    if (Test-Path $SourcePath) {
        Write-Host "     复制 $Name..."
        Copy-Item $SourcePath $DestPath -Recurse -Force
    } elseif (-not $Optional) {
        Write-Host "     警告: $Name 不存在" -ForegroundColor Yellow
    }
}

# 复制目录
Copy-ProjectDir "src"
Copy-ProjectDir "web"
Copy-ProjectDir "config"
Copy-ProjectDir "modules" -Optional
Copy-ProjectDir "docs" -Optional
Write-Host "     复制 node_modules（可能需要一些时间）..."
Copy-ProjectDir "node_modules"

# 复制根目录文件
Write-Host "     复制根目录文件..."
$RootFiles = @("start.cmd", "start.sh", "start.js", "package.json", "README.md", "LICENSE", "bun.lock")
foreach ($file in $RootFiles) {
    $filePath = Join-Path $ProjectRoot $file
    if (Test-Path $filePath) {
        Copy-Item $filePath $PackDir
    }
}

Write-Host "     文件复制完成"
Write-Host ""

# ============================================================
# 步骤 5: 创建 zip 文件
# ============================================================
Write-Host "[5/6] 创建 zip 文件..." -ForegroundColor Yellow

# 确保 dist 目录存在
if (-not (Test-Path $DistDir)) {
    New-Item -ItemType Directory -Path $DistDir -Force | Out-Null
}

# 删除已存在的同名文件
if (Test-Path $OutputFile) {
    Remove-Item $OutputFile -Force
}

try {
    Compress-Archive -Path $PackDir -DestinationPath $OutputFile -Force
    Write-Host "     zip 文件创建成功"
} catch {
    Write-Host ""
    Write-Host "错误: 创建 zip 文件失败" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "正在清理临时文件..."
    if (Test-Path $TempDir) {
        Remove-Item $TempDir -Recurse -Force
    }
    exit 1
}

Write-Host ""

# ============================================================
# 步骤 6: 清理并显示结果
# ============================================================
Write-Host "[6/6] 清理临时文件..." -ForegroundColor Yellow
Remove-Item $TempDir -Recurse -Force

# 获取文件大小
$FileInfo = Get-Item $OutputFile
$FileSizeBytes = $FileInfo.Length
$FileSizeMB = [math]::Round($FileSizeBytes / 1MB, 2)

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "                     打包完成!" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "输出文件: $OutputFile"
Write-Host "文件大小: $FileSizeMB MB ($FileSizeBytes bytes)"
Write-Host ""
Write-Host "使用说明:"
Write-Host "  1. 将 zip 文件分发给用户"
Write-Host "  2. 用户解压后运行 agent-society\start.cmd 即可启动"
Write-Host ""

exit 0
