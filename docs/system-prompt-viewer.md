# System Prompt 查看功能

## 概述

在智能体属性面板中，现在可以查看完整的、真正在对话中使用的 system prompt。这个功能帮助开发者和用户更好地理解智能体的行为和配置。

## 功能特性

- **完整显示**：显示智能体在 LLM 调用时实际使用的完整 system prompt
- **实时获取**：每次打开属性面板时，从后端实时获取最新的 system prompt
- **格式化显示**：使用等宽字体和预格式化文本，保持原始格式
- **字符统计**：显示 system prompt 的字符长度
- **错误处理**：当获取失败时，显示友好的错误信息

## 使用方法

1. 在智能体列表中，点击任意智能体
2. 在聊天界面的标题栏，点击 "ℹ️" 按钮
3. 在弹出的属性面板中，找到 "System Prompt" 部分
4. 查看完整的 system prompt 内容

## 技术实现

### 后端 API

新增了一个 API 接口来获取智能体的 system prompt：

```
GET /api/agent/:agentId/system-prompt
```

响应格式：
```json
{
  "agentId": "agent-123",
  "systemPrompt": "完整的 system prompt 内容...",
  "length": 1234
}
```

### 前端实现

1. **API 客户端** (`web/js/api.js`)
   - 添加了 `getAgentSystemPrompt(agentId)` 方法

2. **智能体详情弹窗** (`web/js/components/agent-detail-modal.js`)
   - 在 `show()` 方法中并行加载统计数据和 system prompt
   - 添加了 `loadAgentSystemPrompt()` 方法来获取数据
   - 在 `renderContent()` 方法中渲染 system prompt 部分

3. **样式** (`web/css/style.css`)
   - 添加了 `.system-prompt-container` 样式
   - 添加了 `.system-prompt-text` 样式
   - 添加了 `.error-message` 样式

### System Prompt 构建逻辑

System prompt 的构建使用了 `ContextBuilder.buildSystemPromptForAgent()` 方法，包含以下部分：

1. **基础提示词** (`base.txt`)
2. **岗位提示词** (rolePrompt)
3. **运行时信息** (agentId, parentAgentId)
4. **任务委托书** (TaskBrief)
5. **联系人列表**
6. **工具调用规则** (`tool_rules.txt`)

对于 root 智能体，只使用岗位提示词和运行时信息。

## 注意事项

- System prompt 可能包含敏感信息，请谨慎分享
- 对于大型 system prompt，界面提供了滚动查看功能
- 如果智能体尚未初始化，可能无法获取 system prompt

## 未来改进

- [ ] 添加复制到剪贴板功能
- [ ] 添加导出为文件功能
- [ ] 添加语法高亮显示
- [ ] 添加搜索和过滤功能
- [ ] 支持对比不同智能体的 system prompt
