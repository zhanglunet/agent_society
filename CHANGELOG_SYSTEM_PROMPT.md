# System Prompt 查看功能更新日志

## 更新时间
2026-01-15

## 更新内容

### 新增功能
在智能体属性面板中添加了查看完整 system prompt 的功能。

### 修改的文件

#### 后端
1. **src/platform/http_server.js**
   - 添加了新的 API 路由：`GET /api/agent/:agentId/system-prompt`
   - 实现了 `_handleGetAgentSystemPrompt()` 方法来处理请求
   - 使用 `ContextBuilder.buildSystemPromptForAgent()` 构建 system prompt

#### 前端
2. **web/js/api.js**
   - 添加了 `getAgentSystemPrompt(agentId)` 方法来调用后端 API

3. **web/js/components/agent-detail-modal.js**
   - 修改了 `show()` 方法，并行加载统计数据和 system prompt
   - 添加了 `loadAgentSystemPrompt()` 方法来获取 system prompt
   - 修改了 `renderContent()` 方法，添加了 System Prompt 部分的渲染

4. **web/css/style.css**
   - 添加了 `.system-prompt-container` 样式
   - 添加了 `.system-prompt-text` 样式
   - 添加了 `.error-message` 样式
   - 调整了 `.agent-detail-modal` 的最大宽度从 500px 到 700px

#### 文档
5. **docs/system-prompt-viewer.md**
   - 新增功能说明文档

### 技术细节

#### API 接口
```
GET /api/agent/:agentId/system-prompt
```

**响应格式：**
```json
{
  "agentId": "agent-123",
  "systemPrompt": "完整的 system prompt 内容...",
  "length": 1234
}
```

#### System Prompt 构建
使用 `ContextBuilder.buildSystemPromptForAgent()` 方法构建，包含：
- 基础提示词 (base.txt)
- 岗位提示词 (rolePrompt)
- 运行时信息 (agentId, parentAgentId)
- 任务委托书 (TaskBrief)
- 联系人列表
- 工具调用规则 (tool_rules.txt)

#### 错误处理
- 如果智能体不存在，返回 404 错误
- 如果 society 未初始化，返回 500 错误
- 前端显示友好的错误信息

### 使用方法
1. 在智能体列表中选择一个智能体
2. 点击聊天界面标题栏的 "ℹ️" 按钮
3. 在属性面板中查看 "System Prompt" 部分

### 兼容性
- 向后兼容，不影响现有功能
- 支持所有类型的智能体（包括 root 和 user）
- 如果 `_contextBuilder` 不可用，会降级使用 `_buildSystemPromptForAgent()` 方法

### 测试
- 所有修改的文件通过了语法检查
- 不影响现有测试

### 未来改进计划
- 添加复制到剪贴板功能
- 添加导出为文件功能
- 添加语法高亮显示
- 添加搜索和过滤功能
