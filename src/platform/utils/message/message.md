# 消息工具 (message/)

## 概述

消息工具提供消息格式化、验证和任务委托书处理功能。这些模块负责处理智能体间的消息通信，确保消息格式正确、内容完整。

## 模块列表

### message_formatter.js
- **职责**：消息格式化
- **功能**：
  - 格式化消息为智能体可理解的结构化文本
  - 支持多模态消息（图片附件）
  - 处理文件附件内容
  - 生成来源标识和回复提示
- **主要导出**：
  - `formatMessageForAgent(message, senderInfo)` - 格式化消息
  - `formatMultimodalContent(textContent, attachments, getImageBase64)` - 多模态内容格式化
  - `formatFileAttachmentContent(textContent, attachments, getFileContent)` - 文件附件内容格式化
  - `hasImageAttachments(message)` - 检查是否有图片附件
  - `getImageAttachments(message)` - 获取图片附件
  - `hasFileAttachments(message)` - 检查是否有文件附件
  - `getFileAttachments(message)` - 获取文件附件
  - `isTextFile(filename)` - 判断是否为文本文件

### message_validator.js
- **职责**：消息类型验证
- **功能**：
  - 验证消息格式是否符合 message_type 的要求
  - 支持多种消息类型（task_assignment、introduction_request、status_report 等）
  - 提供详细的验证错误信息
- **主要导出**：
  - `MessageType` - 消息类型枚举
  - `VALID_MESSAGE_TYPES` - 有效消息类型列表
  - `validateMessageFormat(payload)` - 验证消息格式
  - `isValidMessageType(messageType)` - 检查消息类型是否有效

### task_brief.js
- **职责**：任务委托书处理
- **功能**：
  - 验证 TaskBrief 必填字段
  - 格式化 TaskBrief 为可注入上下文的文本
  - 确保子智能体获得完整的任务上下文
- **主要导出**：
  - `validateTaskBrief(taskBrief)` - 验证任务委托书
  - `formatTaskBrief(taskBrief)` - 格式化任务委托书

## 依赖关系

- 三个模块相对独立，无相互依赖
- 都被 Runtime 和其子模块使用
- message_formatter 被 capability_router 使用

## 兼容性

为保持向后兼容，在 `src/platform/` 目录下保留了兼容性导出文件：
- `src/platform/message_formatter.js` - 重新导出 utils/message/message_formatter.js
- `src/platform/message_validator.js` - 重新导出 utils/message/message_validator.js
- `src/platform/task_brief.js` - 重新导出 utils/message/task_brief.js

建议新代码使用新路径导入：
```javascript
import { formatMessageForAgent } from './utils/message/message_formatter.js';
import { validateMessageFormat } from './utils/message/message_validator.js';
import { validateTaskBrief } from './utils/message/task_brief.js';
```

## 注意事项

- 消息格式遵循系统规范，包含来源标识、内容和回复提示
- 验证器支持多种消息类型，每种类型有特定的验证规则
- TaskBrief 是父智能体创建子智能体时必须提供的结构化任务说明
- 文件附件支持文本文件内容读取，二进制文件需要专门的智能体处理
