# 自动历史消息压缩配置说明

## 概述

自动历史消息压缩功能可以在智能体的上下文使用率达到阈值时，自动压缩较早的历史消息，避免因上下文超限而导致的调用失败。

## 配置项说明

在 `config/app.json` 文件中的 `conversation.autoCompression` 部分配置自动压缩功能：

```json
{
  "conversation": {
    "autoCompression": {
      "enabled": true,
      "threshold": 0.8,
      "keepRecentCount": 10,
      "summaryMaxTokens": 1000,
      "summaryModel": "gpt-4o-mini",
      "summaryTimeout": 30000
    }
  }
}
```

### 配置项详细说明

#### `enabled` (boolean)
- **默认值**: `true`
- **说明**: 是否启用自动压缩功能
- **示例**: `true` 或 `false`

#### `threshold` (number)
- **默认值**: `0.8`
- **范围**: `0.0` - `1.0`
- **说明**: 触发自动压缩的上下文使用率阈值
- **示例**: `0.8` 表示当上下文使用率达到 80% 时触发自动压缩

#### `keepRecentCount` (integer)
- **默认值**: `10`
- **范围**: `>= 1`
- **说明**: 压缩时保留的最近消息数量
- **注意**: 压缩后会保留系统提示词、摘要和最近的 N 条消息

#### `summaryMaxTokens` (integer)
- **默认值**: `1000`
- **范围**: `>= 100`
- **说明**: 生成摘要的最大 token 数量
- **注意**: 限制摘要长度，避免摘要过长影响上下文

#### `summaryModel` (string, 必需)
- **默认值**: `null`（必须由用户配置）
- **说明**: 用于生成压缩摘要的 LLM 模型名称
- **建议**: 使用较快的模型，如 `gpt-4o-mini`、`gpt-3.5-turbo` 等
- **注意**: 如果未配置此项，自动压缩功能将无法使用

#### `summaryTimeout` (integer)
- **默认值**: `30000`
- **范围**: `>= 1000`
- **单位**: 毫秒
- **说明**: 摘要生成的超时时间
- **注意**: 超过此时间未完成则视为失败，不执行压缩

## 配置示例

### 基础配置
```json
{
  "conversation": {
    "autoCompression": {
      "enabled": true,
      "summaryModel": "gpt-4o-mini"
    }
  }
}
```

### 保守配置（较晚触发压缩）
```json
{
  "conversation": {
    "autoCompression": {
      "enabled": true,
      "threshold": 0.9,
      "keepRecentCount": 15,
      "summaryModel": "gpt-4o-mini"
    }
  }
}
```

### 积极配置（较早触发压缩）
```json
{
  "conversation": {
    "autoCompression": {
      "enabled": true,
      "threshold": 0.7,
      "keepRecentCount": 8,
      "summaryModel": "gpt-3.5-turbo",
      "summaryTimeout": 20000
    }
  }
}
```

### 禁用自动压缩
```json
{
  "conversation": {
    "autoCompression": {
      "enabled": false
    }
  }
}
```

## 工作原理

1. **触发检查**: 在每次 LLM 调用前，检查上下文使用率
2. **阈值判断**: 如果使用率达到配置的阈值，触发自动压缩
3. **消息提取**: 提取需要压缩的历史消息（保留系统提示词和最近消息）
4. **摘要生成**: 调用配置的模型生成压缩摘要
5. **执行压缩**: 用摘要替换被压缩的消息
6. **继续调用**: 使用压缩后的上下文继续 LLM 调用

## 注意事项

### 必需配置
- `summaryModel` 是必需配置项，如果未配置，自动压缩功能将无法使用
- 确保配置的模型在您的 LLM 服务中可用

### 性能考虑
- 摘要生成会增加额外的 LLM 调用，可能延长响应时间
- 建议使用较快的模型生成摘要
- 合理设置超时时间，避免长时间等待

### 兼容性
- 自动压缩与手动压缩（`compress_context` 工具）可以共存
- 智能体仍可主动调用 `compress_context` 工具
- 自动压缩失败不会影响正常的 LLM 调用

### 故障处理
- 如果摘要生成失败，系统会跳过本次压缩
- 当上下文超过硬性限制时，系统会截断消息历史
- 所有错误都会记录在日志中，便于排查问题

## 最佳实践

### 阈值设置
- **开发环境**: 可以设置较低的阈值（如 0.7）进行测试
- **生产环境**: 建议设置 0.8-0.9 的阈值，平衡性能和效果

### 保留消息数量
- **短对话场景**: 可以设置较少的保留数量（5-8 条）
- **长对话场景**: 建议保留更多消息（10-15 条）
- **复杂任务**: 可能需要保留更多上下文（15-20 条）

### 模型选择
- **快速响应**: 使用 `gpt-3.5-turbo` 或 `gpt-4o-mini`
- **高质量摘要**: 使用 `gpt-4` 或 `gpt-4-turbo`
- **成本考虑**: 优先选择成本较低的模型

### 监控和调优
- 定期检查日志，了解自动压缩的触发频率
- 根据实际使用情况调整阈值和保留数量
- 监控摘要生成的成功率和耗时

## 故障排查

### 自动压缩未触发
1. 检查 `enabled` 是否为 `true`
2. 检查 `summaryModel` 是否已配置
3. 检查上下文使用率是否达到阈值
4. 查看日志中的相关信息

### 摘要生成失败
1. 检查配置的模型是否可用
2. 检查网络连接和 API 密钥
3. 检查超时设置是否合理
4. 查看错误日志获取详细信息

### 压缩效果不佳
1. 调整 `keepRecentCount` 保留更多上下文
2. 增加 `summaryMaxTokens` 生成更详细的摘要
3. 尝试使用质量更高的摘要模型
4. 考虑调整触发阈值

## 相关文档

- [会话管理器 API 文档](../docs/conversation-manager.md)
- [LLM 处理器配置](../docs/llm-handler.md)
- [日志配置说明](../docs/logging.md)