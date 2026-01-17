# 会话服务模块

## 概述

会话服务模块负责管理智能体的会话上下文，包括对话历史管理、上下文压缩、Token 使用统计和持久化存储。

## 模块职责

### conversation_manager.js
- **职责**：会话上下文管理器
- **主要功能**：
  - 会话上下文管理（创建、获取、删除）
  - 上下文压缩（保留系统提示词和最近消息）
  - Token 使用统计和监控
  - 上下文状态检查（normal/warning/critical/exceeded）
  - 对话历史持久化到磁盘
  - 对话历史一致性验证

## 核心概念

### 上下文结构
每个智能体的会话上下文是一个消息数组，包含：
- 系统提示词（第一条消息）
- 历史摘要（压缩后添加）
- 对话消息（用户、助手、工具消息）

### Token 限制
- **maxTokens**: 最大 Token 数（默认 128000）
- **warningThreshold**: 警告阈值（默认 70%）
- **criticalThreshold**: 严重警告阈值（默认 90%）
- **hardLimitThreshold**: 硬性限制阈值（默认 95%）

### 上下文状态
- **normal**: 正常状态，Token 使用率低于警告阈值
- **warning**: 警告状态，Token 使用率超过警告阈值
- **critical**: 严重警告状态，Token 使用率超过严重警告阈值
- **exceeded**: 超限状态，Token 使用率超过硬性限制阈值

## 使用示例

### 创建会话管理器

```javascript
import { ConversationManager } from "./services/conversation/conversation_manager.js";

const manager = new ConversationManager({
  maxContextMessages: 50,
  conversationsDir: "data/runtime/state/conversations",
  contextLimit: {
    maxTokens: 128000,
    warningThreshold: 0.7,
    criticalThreshold: 0.9,
    hardLimitThreshold: 0.95
  },
  logger: myLogger
});
```

### 管理会话上下文

```javascript
// 获取或创建会话
const conversation = manager.ensureConversation(agentId, systemPrompt);

// 添加消息
conversation.push({ role: "user", content: "Hello" });
conversation.push({ role: "assistant", content: "Hi there!" });

// 更新 Token 使用统计
manager.updateTokenUsage(agentId, {
  promptTokens: 1000,
  completionTokens: 500,
  totalTokens: 1500
});

// 检查上下文状态
const status = manager.getContextStatus(agentId);
console.log(`状态: ${status.status}, 使用率: ${(status.usagePercent * 100).toFixed(1)}%`);
```

### 压缩上下文

```javascript
// 压缩会话上下文
const result = manager.compress(
  agentId,
  "用户询问了关于产品的问题，我提供了详细的解答",
  10 // 保留最近 10 条消息
);

if (result.compressed) {
  console.log(`压缩完成: ${result.originalCount} -> ${result.newCount} 条消息`);
}
```

### 持久化对话历史

```javascript
// 加载所有对话历史
await manager.loadAllConversations();

// 持久化单个对话（带防抖）
await manager.persistConversation(agentId);

// 立即持久化（无防抖）
await manager.persistConversationNow(agentId);

// 等待所有待保存的对话完成
await manager.flushAll();

// 删除持久化文件
await manager.deletePersistedConversation(agentId);
```

### 生成上下文状态提示

```javascript
// 生成上下文状态提示文本
const statusPrompt = manager.buildContextStatusPrompt(agentId);

// 将提示注入到用户消息中
const userMessage = {
  role: "user",
  content: originalContent + statusPrompt
};
```

## 持久化格式

对话历史以 JSON 格式保存到 `{conversationsDir}/{agentId}.json`：

```json
{
  "agentId": "agent-123",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant" },
    { "role": "user", "content": "Hello" },
    { "role": "assistant", "content": "Hi there!" }
  ],
  "tokenUsage": {
    "promptTokens": 1000,
    "completionTokens": 500,
    "totalTokens": 1500,
    "updatedAt": 1234567890
  },
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

## 注意事项

1. **防抖保存**：`persistConversation` 使用 500ms 防抖，避免频繁写入磁盘
2. **立即保存**：关键时刻使用 `persistConversationNow` 或 `flushAll` 确保数据保存
3. **Token 统计**：基于 LLM 返回的实际值，需要在每次 LLM 调用后更新
4. **上下文压缩**：保留系统提示词和最近消息，中间历史用摘要替代
5. **一致性验证**：使用 `verifyHistoryConsistency` 检查工具调用和响应的对应关系
