# Implementation Plan: Fix Tool Executor Delegation

## Overview

重构 Runtime.executeToolCall() 方法，将工具执行逻辑委托给 ToolExecutor 子模块，消除代码重复并修复 get_artifact/put_artifact 工具无法执行的问题。

## Tasks

- [x] 1. 重构 Runtime.executeToolCall() 方法
  - 移除所有重复的工具执行逻辑（20+ 个 if 分支）
  - 简化为委托调用 `this._toolExecutor.executeToolCall(ctx, toolName, args)`
  - 保留 try-catch 错误处理和日志记录
  - _Requirements: 1.1, 1.2, 1.3, 3.1, 3.2, 3.3_

- [x] 1.1 编写单元测试验证委托行为
  - 测试 Runtime.executeToolCall() 正确委托给 ToolExecutor
  - 测试错误正确传播
  - _Requirements: 2.3, 2.4_

- [x] 2. 验证所有现有工具仍然正常工作
  - 运行现有的工具执行测试套件
  - 确保没有回归问题
  - _Requirements: 2.1, 2.2_

- [ ] 2.1 编写集成测试验证工具执行
  - 测试所有内置工具的执行
  - 测试模块工具的执行
  - _Requirements: 2.1, 2.2_

- [ ] 3. 测试 get_artifact 工具
  - 创建测试工件
  - 调用 get_artifact 读取工件
  - 验证返回正确的工件内容
  - 验证二进制内容路由正常工作
  - _Requirements: 4.1, 4.3_

- [ ] 3.1 编写 get_artifact 的单元测试
  - 测试读取文本工件
  - 测试读取二进制工件
  - 测试读取不存在的工件
  - 测试工件内容路由
  - _Requirements: 4.1_

- [ ] 4. 测试 put_artifact 工具
  - 调用 put_artifact 写入工件
  - 验证返回工件引用
  - 验证工件正确保存
  - _Requirements: 4.2, 4.3_

- [ ] 4.1 编写 put_artifact 的单元测试
  - 测试写入文本工件
  - 测试写入二进制工件
  - 测试工件元数据
  - _Requirements: 4.2_

- [ ] 5. 端到端测试
  - 创建测试智能体
  - 让智能体调用 get_artifact 和 put_artifact
  - 验证工具在实际场景中正常工作
  - _Requirements: 2.1, 4.1, 4.2_

- [ ] 5.1 编写端到端测试用例
  - 测试智能体工件读写流程
  - 测试图片工件处理
  - 测试文件工件处理
  - _Requirements: 4.1, 4.2_

- [ ] 6. 最终验证
  - 确保所有测试通过
  - 确认没有遗留的代码重复
  - 验证日志输出正确
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3_

## Notes

- 所有测试任务都是必需的，以确保完整验证
- 重构的核心是任务 1：将 Runtime.executeToolCall() 简化为委托调用
- 任务 3-5 验证修复后 get_artifact 和 put_artifact 工具正常工作
- 保持向后兼容性是关键要求
