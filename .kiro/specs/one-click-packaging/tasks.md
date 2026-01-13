# Implementation Plan: One-Click Packaging

## Overview

实现 Windows 环境下的一键打包功能，包括 CMD 和 PowerShell 两个版本的打包脚本，以及修改启动脚本以支持本地 bun 运行时优先。

## Tasks

- [x] 1. 创建打包脚本目录结构
  - 创建 `scripts/win` 目录
  - _Requirements: 1.1_

- [x] 2. 实现 CMD 版本打包脚本
  - [x] 2.1 创建 `scripts/win/pack.cmd` 基础框架
    - 实现命令行参数解析（可选的输出文件名）
    - 实现进度显示功能
    - _Requirements: 1.2, 1.4, 6.1, 6.2_

  - [x] 2.2 实现环境检测和 bun 定位
    - 检测 bun 是否在 PATH 中
    - 获取 bun.exe 的完整路径
    - 错误处理：bun 未找到时显示错误并退出
    - _Requirements: 3.1, 3.3, 7.1, 7.4_

  - [x] 2.3 实现文件复制逻辑
    - 创建临时打包目录
    - 复制项目文件（排除 .git, test, .kiro, *.log, .tmp，agent-society-data，data）
    - 复制 node_modules
    - 复制 bun.exe 到 runtime 目录
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 3.2, 6.3_

  - [x] 2.4 实现 zip 创建和清理
    - 使用 PowerShell Compress-Archive 创建 zip
    - 输出到 dist 目录
    - 清理临时目录
    - 显示完成信息（路径和大小）
    - _Requirements: 1.3, 1.5, 6.4, 7.2_

- [x] 3. 实现 PowerShell 版本打包脚本
  - [x] 3.1 创建 `scripts/win/pack.ps1`
    - 实现与 pack.cmd 相同的功能
    - 使用 PowerShell 原生语法
    - _Requirements: 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4_

- [x] 4. 修改启动脚本支持本地 bun
  - [x] 4.1 修改 `start.cmd` 添加本地 bun 检测
    - 检查 runtime\bun.exe 是否存在
    - 存在时设置 BUN_PATH 并跳过安装检测
    - 不存在时保持原有逻辑
    - 显示使用的 bun 来源（本地/系统）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6_

  - [x] 4.2 修改 `start.cmd` 跳过 git pull
    - 检查 .git 目录是否存在
    - 不存在时跳过 git pull 步骤
    - _Requirements: 4.5_

- [x] 5. Checkpoint - 验证基本功能
  - 确保所有脚本可以正常执行
  - 手动测试打包流程
  - 验证解压后的包可以运行
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 6. 编写测试
  - [x] 6.1 编写单元测试验证脚本文件存在
    - 验证 scripts/win/pack.cmd 存在
    - 验证 scripts/win/pack.ps1 存在
    - 验证 start.cmd 包含本地 bun 检测逻辑
    - _Requirements: 1.1, 1.2, 4.1_

  - [x] 6.2 编写属性测试 - 文件包含/排除一致性
    - **Property 1: File Inclusion/Exclusion Consistency**
    - **Validates: Requirements 2.1, 6.3**

  - [x] 6.3 编写属性测试 - 自定义输出文件名
    - **Property 3: Custom Output Filename**
    - **Validates: Requirements 6.1**

  - [x] 6.4 编写属性测试 - 错误退出码
    - **Property 4: Error Exit Code**
    - **Validates: Requirements 7.4**

- [x] 7. Final Checkpoint - 确保所有测试通过
  - 运行所有测试
  - 确保打包功能完整可用
  - 如有问题请询问用户

## Notes

- 本功能仅针对 Windows 环境
- CMD 和 PowerShell 脚本提供相同功能，用户可根据偏好选择
- Property 2 (Local Bun Priority) 需要在实际环境中手动验证，不适合自动化测试
