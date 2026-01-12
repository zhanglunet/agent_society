# Requirements Document

## Introduction

本功能为 `send_message` 工具函数增加可选的快速回复选项列表功能。当智能体发送消息时，可以附带一组预定义的快速回复选项（字符串数组），让收件方（特别是用户）能够从中快速选择一个进行回复，同时也保留自由编写回复的能力。

## Glossary

- **Send_Message_Tool**: 智能体用于发送异步消息的工具函数
- **Quick_Replies**: 消息中附带的可选快速回复选项列表，为字符串数组
- **Message_Bus**: 消息总线，负责消息的发送和投递
- **Chat_Panel**: 前端对话面板组件，负责显示消息和处理用户输入
- **Recipient**: 消息接收方，可以是智能体或用户

## Requirements

### Requirement 1: 工具参数扩展

**User Story:** As a 智能体开发者, I want to 在 send_message 工具中添加快速回复选项参数, so that 智能体可以为收件方提供预定义的回复选择。

#### Acceptance Criteria

1. THE Send_Message_Tool SHALL 支持一个可选的 `quickReplies` 参数
2. WHEN `quickReplies` 参数被提供时，THE Send_Message_Tool SHALL 验证其为字符串数组类型
3. WHEN `quickReplies` 数组长度超过 10 时，THE Send_Message_Tool SHALL 返回验证错误
4. WHEN `quickReplies` 数组为空时，THE Send_Message_Tool SHALL 将其视为未提供该参数
5. WHEN `quickReplies` 数组中包含非字符串元素时，THE Send_Message_Tool SHALL 返回验证错误
6. WHEN `quickReplies` 数组中包含空字符串时，THE Send_Message_Tool SHALL 返回验证错误

### Requirement 2: 消息传递

**User Story:** As a 系统架构师, I want to 确保快速回复选项能够正确传递到收件方, so that 收件方能够看到并使用这些选项。

#### Acceptance Criteria

1. WHEN 消息包含有效的 `quickReplies` 时，THE Message_Bus SHALL 将其作为 payload 的一部分传递
2. THE Message_Bus SHALL 保持 `quickReplies` 数组的顺序不变
3. WHEN 消息被投递时，THE Recipient SHALL 能够从 payload 中获取 `quickReplies` 数组

### Requirement 3: 用户界面呈现

**User Story:** As a 用户, I want to 在收到带有快速回复选项的消息时看到可点击的选项按钮, so that 我可以快速选择一个选项进行回复。

#### Acceptance Criteria

1. WHEN 用户收到包含 `quickReplies` 的消息时，THE Chat_Panel SHALL 在消息下方显示选项按钮列表
2. THE Chat_Panel SHALL 按照数组顺序显示快速回复选项按钮
3. WHEN 用户点击某个快速回复选项时，THE Chat_Panel SHALL 将该选项字符串作为回复消息发送
4. WHEN 用户点击快速回复选项后，THE Chat_Panel SHALL 禁用该消息的所有快速回复按钮
5. THE Chat_Panel SHALL 保留用户自由输入回复的能力，不强制使用快速回复选项
6. WHEN 用户通过输入框发送自定义回复后，THE Chat_Panel SHALL 禁用该消息的快速回复按钮

### Requirement 4: 工具定义更新

**User Story:** As a LLM 模型, I want to 在工具定义中看到 quickReplies 参数的完整 schema, so that 我能够正确使用该功能。

#### Acceptance Criteria

1. THE Send_Message_Tool 的工具定义 SHALL 包含 `quickReplies` 参数的 JSON Schema
2. THE 工具定义 SHALL 说明 `quickReplies` 是可选参数
3. THE 工具定义 SHALL 说明数组最大长度为 10
4. THE 工具定义 SHALL 说明数组元素为字符串类型
