# Requirements Document

## Introduction

本功能为 Agent Society 项目提供一键打包能力，将当前工程代码、node_modules 依赖和 bun 运行时打包成一个 zip 文件。最终用户解压后可直接运行，无需安装任何环境依赖。该功能仅针对 Windows 环境，支持 CMD 和 PowerShell 两种运行方式。

## Glossary

- **Packaging_Script**: 执行打包操作的脚本，位于 `scripts/win` 目录
- **Bundled_Runtime**: 打包到 zip 中的 bun 运行时环境
- **Distribution_Package**: 最终生成的 zip 分发包
- **Startup_Script**: 启动应用的脚本（start.cmd），需要修改以支持本地 bun 运行时
- **Local_Bun**: 工程目录内的 bun 运行时（`runtime/bun.exe`）
- **System_Bun**: 系统 PATH 中安装的 bun 运行时

## Requirements

### Requirement 1: 打包脚本创建

**User Story:** As a developer, I want to run a packaging script, so that I can create a distributable zip package with one click.

#### Acceptance Criteria

1. THE Packaging_Script SHALL be located in the `scripts/win` directory
2. THE Packaging_Script SHALL provide both CMD (`pack.cmd`) and PowerShell (`pack.ps1`) versions
3. WHEN the Packaging_Script is executed, THE Packaging_Script SHALL create a zip file containing the complete distribution package
4. THE Packaging_Script SHALL display progress information during the packaging process
5. WHEN packaging completes successfully, THE Packaging_Script SHALL display the output file path and size

### Requirement 2: 打包内容完整性

**User Story:** As a developer, I want the package to include all necessary files, so that end users can run the application without additional setup.

#### Acceptance Criteria

1. THE Distribution_Package SHALL include all project source files (excluding `.git`, `test`, `.kiro/specs` directories)
2. THE Distribution_Package SHALL include the complete `node_modules` directory
3. THE Distribution_Package SHALL include the bun runtime executable in a `runtime` subdirectory
4. THE Distribution_Package SHALL include modified startup scripts that use the bundled runtime
5. THE Distribution_Package SHALL include configuration files (`config` directory)
6. THE Distribution_Package SHALL include web assets (`web` directory)
7. THE Distribution_Package SHALL include documentation files (`docs` directory, `README.md`)

### Requirement 3: Bun 运行时打包

**User Story:** As a developer, I want the current bun runtime to be included in the package, so that end users don't need to install bun separately.

#### Acceptance Criteria

1. WHEN packaging, THE Packaging_Script SHALL locate the bun executable from the system PATH
2. WHEN bun is found, THE Packaging_Script SHALL copy it to the `runtime` directory within the package
3. IF bun is not found in the system PATH, THEN THE Packaging_Script SHALL display an error message and exit
4. THE Bundled_Runtime SHALL be a complete, standalone bun.exe file

### Requirement 4: 启动脚本修改

**User Story:** As a developer, I want the startup script to prioritize the bundled runtime, so that the packaged application works independently.

#### Acceptance Criteria

1. THE Startup_Script SHALL first check for bun in the `runtime` directory relative to the script location
2. WHEN Local_Bun exists, THE Startup_Script SHALL use it instead of System_Bun
3. WHEN Local_Bun does not exist, THE Startup_Script SHALL fall back to System_Bun (current behavior)
4. THE Startup_Script SHALL skip the bun installation prompt when Local_Bun is available
5. THE Startup_Script SHALL skip the `git pull` step when running from a distribution package (no `.git` directory)
6. THE Startup_Script SHALL display which bun runtime is being used (local or system)

### Requirement 5: 分发包可用性

**User Story:** As an end user, I want to extract and run the application directly, so that I can use it without any technical setup.

#### Acceptance Criteria

1. WHEN the Distribution_Package is extracted, THE extracted folder SHALL contain a ready-to-run application
2. WHEN the user runs `start.cmd`, THE application SHALL start using the bundled bun runtime
3. THE Distribution_Package SHALL work on Windows systems without any pre-installed dependencies
4. THE Distribution_Package SHALL preserve the original directory structure for proper operation

### Requirement 6: 打包配置

**User Story:** As a developer, I want to customize the packaging process, so that I can control what gets included in the distribution.

#### Acceptance Criteria

1. THE Packaging_Script SHALL support specifying an output filename via command line argument
2. THE Packaging_Script SHALL use a default output filename based on project name and timestamp if not specified
3. THE Packaging_Script SHALL exclude unnecessary files (`.git`, `test`, `.kiro/specs`, `*.log`, temporary files)
4. THE Packaging_Script SHALL create the output zip in a `dist` directory

### Requirement 7: 错误处理

**User Story:** As a developer, I want clear error messages when packaging fails, so that I can quickly identify and fix issues.

#### Acceptance Criteria

1. IF the bun runtime cannot be found, THEN THE Packaging_Script SHALL display a clear error message with installation instructions
2. IF the zip creation fails, THEN THE Packaging_Script SHALL display the error reason and cleanup partial files
3. IF required source directories are missing, THEN THE Packaging_Script SHALL display which directories are missing
4. WHEN an error occurs, THE Packaging_Script SHALL exit with a non-zero exit code
