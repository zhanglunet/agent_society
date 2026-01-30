# 状态管理设计方案 (State Management)

## 1. 核心原则
- **职责单一**: 每个 Store 仅负责一个特定的业务领域（智能体、组织、聊天、应用配置）。
- **状态流转透明**: 所有的状态修改必须通过 Actions 进行，严禁组件直接修改 Store 的 State。
- **持久化**: 部分关键状态（如主题、选中的智能体 ID）需同步至 `localStorage`。

## 2. Store 结构定义
### 2.1 app Store (全局配置)
- **State**:
    - `theme`: 'light' | 'dark' | 'system'
    - `isSidebarCollapsed`: boolean
    - `activeTabId`: string (当前激活的组织 Tab)
- **Actions**:
    - `toggleTheme()`: 切换主题并持久化。
    - `setSidebarState()`: 控制侧栏收缩。

### 2.2 agents Store (智能体管理)
- **State**:
    - `agents`: Agent[] (智能体原始列表)
    - `selectedAgentId`: string
    - `loading`: boolean
- **Getters**:
    - `currentAgent`: 返回当前选中的智能体详情。
    - `agentsByOrgId`: 根据组织 ID 过滤智能体。
- **Actions**:
    - `fetchAgents()`: 从 API 获取并更新列表。
    - `selectAgent(id)`: 选中特定智能体并重置聊天状态。

### 2.3 chat Store (聊天业务)
- **State**:
    - `messages`: Record<string, Message[]> (按智能体 ID 分组的消息历史)
    - `isTyping`: Record<string, boolean> (智能体输入状态)
    - `lastReadTimestamp`: Record<string, number>
- **Actions**:
    - `sendMessage(agentId, text)`: 发送消息，立即乐观更新 UI。
    - `addMessage(agentId, message)`: 接收来自轮询或 SSE 的新消息。
    - `clearHistory(agentId)`: 清空特定对话。

## 3. 数据流转与异步处理
- **轮询机制**: 使用 `usePolling` Composable 在 `chat Store` 中启动全局轮询，每 2-3 秒同步一次最新消息。
- **并发处理**: 
    - 使用 `AbortController` 取消旧的请求。
    - 聊天发送操作使用排队机制，确保消息顺序正确。

## 4. 状态转换逻辑
- **智能体选中**: `selectAgent` -> 触发 `chatStore.loadHistory` -> 触发 `ui.scrollToBottom`。
- **主题切换**: `toggleTheme` -> 更新 `document.documentElement` -> 持久化到 `localStorage`。

## 5. 错误处理与状态恢复
- **重试机制**: 当 API 调用失败时，Store 中的 `error` 状态会被设为 true，UI 显示重试按钮。
- **乐观更新回滚**: 若 `sendMessage` 失败，Store 负责从列表中移除该“发送中”的消息，并提示用户。
