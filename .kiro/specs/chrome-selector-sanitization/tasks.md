# Implementation Plan: Chrome Selector Sanitization

## Overview

为 Chrome 模块的 PageActions 类添加选择器清理功能，解决 LLM 生成的选择器参数包含多余引号的问题。

## Tasks

- [x] 1. 实现 _sanitizeSelector 核心方法
  - [x] 1.1 在 PageActions 类中添加 _sanitizeSelector 私有方法
    - 实现双引号、单引号、空白字符的清理逻辑
    - 返回 `{original, cleaned, modified}` 结构
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_
  - [x] 1.2 编写 _sanitizeSelector 的属性测试
    - **Property 1: Outer Quote Removal**
    - **Property 2: Clean Selector Idempotence**
    - **Property 3: Internal Quote Preservation**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5**

- [x] 2. 集成到页面交互方法
  - [x] 2.1 修改 click 方法集成选择器清理
    - 调用 _sanitizeSelector 清理选择器
    - 修改日志输出显示清理信息
    - 修改错误响应包含原始选择器
    - _Requirements: 2.2, 2.3, 3.1, 3.2_
  - [x] 2.2 修改 type 方法集成选择器清理
    - _Requirements: 2.2, 2.3, 3.1, 3.2_
  - [x] 2.3 修改 fill 方法集成选择器清理
    - _Requirements: 2.2, 2.3, 3.1, 3.2_
  - [x] 2.4 修改 waitFor 方法集成选择器清理
    - _Requirements: 2.2, 2.3, 3.1, 3.2_

- [x] 3. 集成到内容获取方法
  - [x] 3.1 修改 getText 方法集成选择器清理
    - _Requirements: 2.2, 2.3, 3.1, 3.2_
  - [x] 3.2 修改 getContent 方法集成选择器清理
    - _Requirements: 2.2, 2.3, 3.1, 3.2_
  - [x] 3.3 修改 screenshot 方法集成选择器清理（可选参数）
    - _Requirements: 2.2, 2.3, 3.1, 3.2_

- [x] 4. Checkpoint - 确保所有测试通过
  - 运行属性测试验证清理逻辑
  - 确保所有修改的方法正常工作
  - 如有问题请询问用户

## Notes

- 每个任务都引用了具体的需求条款以便追溯
- 属性测试验证核心清理逻辑的正确性
- 所有任务都必须完成
