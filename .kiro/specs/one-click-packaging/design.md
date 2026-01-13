# Design Document: One-Click Packaging

## Overview

本设计实现 Windows 环境下的一键打包功能，将 Agent Society 项目打包成可直接分发的 zip 文件。打包内容包括项目源码、node_modules 依赖和 bun 运行时。设计重点是确保最终用户解压后无需任何环境配置即可运行。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Packaging Process                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  pack.cmd    │    │  pack.ps1    │    │   Output     │  │
│  │  (CMD版本)   │ OR │ (PowerShell) │ -> │   dist/      │  │
│  └──────────────┘    └──────────────┘    │   *.zip      │  │
│         │                   │            └──────────────┘  │
│         v                   v                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Packaging Steps                         │   │
│  │  1. Validate environment (bun exists)               │   │
│  │  2. Create temp staging directory                   │   │
│  │  3. Copy project files (with exclusions)            │   │
│  │  4. Copy node_modules                               │   │
│  │  5. Copy bun runtime to runtime/                    │   │
│  │  6. Create zip archive                              │   │
│  │  7. Cleanup temp directory                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                Distribution Package Structure                │
├─────────────────────────────────────────────────────────────┤
│  agent-society/                                              │
│  ├── runtime/                                                │
│  │   └── bun.exe          <- Bundled bun runtime            │
│  ├── src/                 <- Source code                     │
│  ├── web/                 <- Web assets                      │
│  ├── config/              <- Configuration                   │
│  ├── modules/             <- Module extensions               │
│  ├── docs/                <- Documentation                   │
│  ├── node_modules/        <- Dependencies                    │
│  ├── start.cmd            <- Modified startup script         │
│  ├── start.js             <- Main entry point                │
│  ├── package.json                                            │
│  └── README.md                                               │
└─────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Packaging Script (CMD Version) - `scripts/win/pack.cmd`

CMD 批处理脚本，执行打包流程。

**Interface:**
```batch
pack.cmd [output_name]

参数:
  output_name  可选，输出文件名（不含.zip后缀）
               默认: agent-society-YYYYMMDD-HHMMSS

输出:
  dist/<output_name>.zip
```

**主要功能:**
- 检测 bun 运行时位置
- 创建临时打包目录
- 复制项目文件（排除指定目录）
- 复制 bun.exe 到 runtime 目录
- 使用 PowerShell 的 Compress-Archive 创建 zip
- 清理临时文件

### 2. Packaging Script (PowerShell Version) - `scripts/win/pack.ps1`

PowerShell 脚本，提供相同功能但语法更现代。

**Interface:**
```powershell
.\pack.ps1 [-OutputName <string>]

参数:
  -OutputName  可选，输出文件名（不含.zip后缀）
               默认: agent-society-YYYYMMDD-HHMMSS

输出:
  dist/<OutputName>.zip
```

### 3. Modified Startup Script - `start.cmd`

修改现有的 start.cmd，增加本地 bun 运行时检测逻辑。

**新增逻辑:**
```
1. 检查 %~dp0runtime\bun.exe 是否存在
2. 如果存在，设置 BUN_PATH 为本地路径，跳过安装检测
3. 如果不存在，执行原有的系统 bun 检测逻辑
4. 检查 .git 目录是否存在，不存在则跳过 git pull
```

## Data Models

### 打包配置

```javascript
// 排除的目录和文件模式
const EXCLUDE_PATTERNS = [
  '.git',           // Git 版本控制
  '.kiro/specs',    // 规格文档
  'test',           // 测试文件
  'dist',           // 输出目录
  '*.log',          // 日志文件
  '.tmp',           // 临时文件
  'agent-society-data/logs'  // 运行日志
];

// 必须包含的目录
const INCLUDE_DIRS = [
  'src',
  'web', 
  'config',
  'modules',
  'docs',
  'node_modules'
];

// 必须包含的文件
const INCLUDE_FILES = [
  'start.cmd',
  'start.sh',
  'start.js',
  'package.json',
  'README.md',
  'LICENSE'
];
```

### 输出文件命名

```
格式: agent-society-YYYYMMDD-HHMMSS.zip
示例: agent-society-20260113-143052.zip
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: File Inclusion/Exclusion Consistency

*For any* project directory structure and *for any* file or directory matching an exclusion pattern (`.git`, `test`, `.kiro/specs`, `*.log`, `.tmp`), the resulting Distribution_Package SHALL NOT contain that file or directory, AND *for any* file in the required include list (`src`, `web`, `config`, `modules`, `node_modules`, `start.cmd`, `start.js`, `package.json`), the Distribution_Package SHALL contain that file.

**Validates: Requirements 2.1, 6.3**

### Property 2: Local Bun Runtime Priority

*For any* execution of the Startup_Script where `runtime/bun.exe` exists in the script's directory, the script SHALL use the local bun executable instead of searching the system PATH.

**Validates: Requirements 4.2**

### Property 3: Custom Output Filename

*For any* valid filename string passed as an argument to the Packaging_Script, the output zip file SHALL be named with that exact string (plus `.zip` extension) in the `dist` directory.

**Validates: Requirements 6.1**

### Property 4: Error Exit Code

*For any* error condition during packaging (bun not found, missing directories, zip creation failure), the Packaging_Script SHALL exit with a non-zero exit code.

**Validates: Requirements 7.4**

## Error Handling

### Bun Runtime Not Found
- **Detection**: `where bun` returns non-zero exit code
- **Action**: Display error message with bun installation URL, exit with code 1
- **Message**: "错误: 未找到 bun 运行时。请先安装 bun: https://bun.sh"

### Missing Required Directories
- **Detection**: Check existence of `src`, `web`, `config`, `node_modules` before packaging
- **Action**: List missing directories, exit with code 1
- **Message**: "错误: 缺少必要目录: <dir_list>"

### Zip Creation Failure
- **Detection**: PowerShell Compress-Archive returns error
- **Action**: Display error, cleanup temp directory, exit with code 1
- **Message**: "错误: 创建 zip 文件失败: <error_detail>"

### Insufficient Disk Space
- **Detection**: Copy or zip operation fails with disk space error
- **Action**: Display error, cleanup partial files, exit with code 1

## Testing Strategy

### Unit Tests
由于本功能主要是脚本文件，单元测试将聚焦于：
- 验证脚本文件存在于正确位置
- 验证 start.cmd 包含本地 bun 检测逻辑
- 验证排除模式正确配置

### Property-Based Tests
使用 fast-check 进行属性测试：
- **Property 1**: 生成随机文件结构，验证包含/排除逻辑
- **Property 3**: 生成随机有效文件名，验证输出命名
- **Property 4**: 模拟各种错误条件，验证退出码

### Integration Tests
- 执行完整打包流程，验证 zip 内容
- 解压 zip，验证目录结构
- 从解压目录运行 start.cmd，验证应用启动

### Test Configuration
- Property-based tests: 最少 100 次迭代
- 测试框架: Bun test + fast-check
- 测试标签格式: **Feature: one-click-packaging, Property N: <property_text>**

