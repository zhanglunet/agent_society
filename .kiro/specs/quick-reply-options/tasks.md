# Implementation Plan: Quick Reply Options

## Overview

为 `send_message` 工具函数添加可选的快速回复建议功能，包括后端验证、消息传递和前端 UI 渲染。

## Tasks

- [x] 1. 更新 send_message 工具定义
  - 在 `src/platform/runtime/tool_executor.js` 中更新工具 schema
  - 添加 `quickReplies` 参数定义（字符串数组，最多10个）
  - 更新工具描述，说明这是可选的建议选项
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 2. 实现 quickReplies 验证逻辑
  - [x] 2.1 在 `_executeSendMessage` 方法中添加验证函数
    - 验证数组类型
    - 验证长度不超过10
    - 验证元素为非空字符串
    - 空数组视为未提供
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 2.2 编写验证逻辑的属性测试
    - **Property 1: 输入验证完整性**
    - **Validates: Requirements 1.2, 1.3, 1.5, 1.6**

- [x] 3. 实现消息传递
  - [x] 3.1 修改 `_executeSendMessage` 传递 quickReplies
    - 将验证通过的 quickReplies 添加到 payload
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 编写消息传递的属性测试
    - **Property 2: 消息传递完整性**
    - **Validates: Requirements 2.1, 2.2, 2.3**

- [x] 4. Checkpoint - 确保后端测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 5. 实现前端快速回复按钮渲染
  - [x] 5.1 在 ChatPanel 中添加 `renderQuickReplies` 方法
    - 渲染按钮列表
    - 按数组顺序显示
    - _Requirements: 3.1, 3.2_

  - [x] 5.2 在消息渲染中集成快速回复按钮
    - 在 `render` 方法中调用 `renderQuickReplies`
    - 将按钮显示在消息气泡下方
    - _Requirements: 3.1_

- [x] 6. 实现快速回复点击处理
  - [x] 6.1 添加 `handleQuickReply` 方法
    - 发送选中的文本作为回复
    - 禁用该消息的所有快速回复按钮
    - _Requirements: 3.3, 3.4_

  - [x] 6.2 添加自定义回复后禁用快速回复按钮的逻辑
    - 在 `sendMessage` 方法中检测并禁用相关按钮
    - _Requirements: 3.6_

- [x] 7. 添加快速回复按钮样式
  - 在 CSS 中添加 `.quick-replies` 和 `.quick-reply-btn` 样式
  - 添加禁用状态样式
  - _Requirements: 3.1_

- [x] 8. Final Checkpoint - 确保所有测试通过
  - 确保所有测试通过，如有问题请询问用户

## Notes

- 所有任务均为必需，包括属性测试
- 每个任务都引用了具体的需求条款以便追溯
- 检查点用于确保增量验证
