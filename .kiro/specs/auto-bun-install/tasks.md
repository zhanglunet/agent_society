# Implementation Plan: Auto Bun Install

## Overview

修改现有的启动脚本（start.cmd 和 start.sh），实现 bun 的自动检测、用户确认、安装和依赖管理功能。

## Tasks

- [x] 1. 更新 Windows 启动脚本 (start.cmd)
  - [x] 1.1 添加 bun 检测和用户确认逻辑
    - 使用 `where bun` 检测 bun 是否存在
    - 如果不存在，使用 `set /p` 询问用户是否安装
    - 用户拒绝时显示手动安装指引并退出
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_
  - [x] 1.2 添加 bun 自动安装逻辑
    - 使用 PowerShell 执行 `irm bun.sh/install.ps1 | iex`
    - 从注册表刷新 PATH 环境变量
    - 验证安装是否成功
    - _Requirements: 3.1, 3.3, 3.4_
  - [x] 1.3 添加依赖安装逻辑
    - 执行 `bun install` 安装依赖
    - 检查安装结果，失败时显示错误信息
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 1.4 添加用户反馈信息
    - 显示检测状态、安装进度、错误信息
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 2. 更新 Unix/macOS 启动脚本 (start.sh)
  - [x] 2.1 添加 bun 检测和用户确认逻辑
    - 使用 `command -v bun` 检测 bun 是否存在
    - 如果不存在，使用 `read` 询问用户是否安装
    - 用户拒绝时显示手动安装指引并退出
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_
  - [x] 2.2 添加 bun 自动安装逻辑
    - 使用 curl 执行 `curl -fsSL https://bun.sh/install | bash`
    - 添加 `~/.bun/bin` 到 PATH
    - 验证安装是否成功
    - _Requirements: 3.2, 3.3, 3.4_
  - [x] 2.3 添加依赖安装逻辑
    - 执行 `bun install` 安装依赖
    - 检查安装结果，失败时显示错误信息
    - _Requirements: 4.1, 4.2, 4.3_
  - [x] 2.4 添加用户反馈信息
    - 显示检测状态、安装进度、错误信息
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 3. Checkpoint - 手动测试验证
  - 在 Windows 系统上测试 start.cmd
  - 在 Unix/macOS 系统上测试 start.sh
  - 验证用户确认流程正常工作
  - 验证错误处理正确显示

## Notes

- 本功能主要是 shell 脚本修改，不涉及 JavaScript 代码
- 由于是系统集成功能，主要通过手动测试验证
- 保持现有的命令行参数支持不变
