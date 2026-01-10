# 设计文档

## 概述

本设计文档描述如何将 `src/platform/runtime.js`（约 3100 行）拆分为多个专注的模块。重构遵循以下原则：

1. **只做结构调整，不修改业务逻辑** - 所有代码逻辑保持原样，只是移动到不同文件
2. **保持向后兼容** - Runtime 类的公共 API 保持不变
3. **详细注释** - 每个模块包含设计初衷、使用流程和协作关系说明

## 架构

### 模块拆分方案

```
src/platform/
├── runtime.js                    # 核心协调器（精简后约 400 行）
├── runtime/                      # 运行时子模块目录
│   ├── tool_executor.js          # 工具执行器（约 500 行）
│   ├── llm_handler.js            # LLM 处理器（约 350 行）
│   ├── agent_manager.js          # 智能体管理器（约 300 行）
│   ├── message_processor.js      # 消息处理器（约 200 行）
│   ├── context_builder.js        # 上下文构建器（约 200 行）
│   ├── shutdown_manager.js       # 关闭管理器（约 200 行）
│   └── javascript_executor.js    # JavaScript 执行器（约 150 行）
```

### 模块协作关系

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Runtime (协调器)                           │
│  - 初始化所有子模块                                                   │
│  - 暴露公共 API                                                      │
│  - 协调模块间通信                                                     │
└─────────────────────────────────────────────────────────────────────┘
        │
        ├──────────────────┬──────────────────┬──────────────────┐
        ▼                  ▼                  ▼                  ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ Agent_Manager │  │Message_Processor│ │  LLM_Handler  │  │Shutdown_Manager│
│ - 智能体生命周期│  │ - 消息调度     │  │ - LLM 交互    │  │ - 优雅关闭    │
│ - 状态管理     │  │ - 并发控制     │  │ - 工具调用循环│  │ - 信号处理    │
└───────────────┘  └───────────────┘  └───────────────┘  └───────────────┘
        │                  │                  │
        │                  │                  ▼
        │                  │          ┌───────────────┐
        │                  │          │ Tool_Executor │
        │                  │          │ - 工具定义    │
        │                  │          │ - 工具执行    │
        │                  │          └───────────────┘
        │                  │                  │
        │                  │                  ▼
        │                  │          ┌───────────────┐
        │                  │          │Context_Builder│
        │                  │          │ - 提示词构建  │
        │                  │          │ - 消息格式化  │
        │                  │          └───────────────┘
        │                  │                  │
        │                  │                  ▼
        │                  │          ┌───────────────┐
        │                  │          │JS_Executor    │
        │                  │          │ - 代码执行    │
        │                  │          │ - Canvas 支持 │
        │                  │          └───────────────┘
```

## 组件和接口

### 1. Runtime（核心协调器）

**职责**：初始化、协调各模块、暴露公共 API

**保留的方法**：
- `constructor(options)` - 初始化配置和子模块
- `init()` - 异步初始化所有组件
- `startProcessing()` - 启动消息处理循环
- `run()` - 运行消息循环直到完成
- 所有公共 getter/setter 方法

**委托给子模块的方法**：
- 工具相关 → `ToolExecutor`
- LLM 相关 → `LlmHandler`
- 智能体管理 → `AgentManager`
- 消息处理 → `MessageProcessor`
- 上下文构建 → `ContextBuilder`
- 关闭管理 → `ShutdownManager`

### 2. ToolExecutor（工具执行器）

**文件**：`src/platform/runtime/tool_executor.js`

**职责**：
- 定义所有工具的 schema
- 执行工具调用
- 处理工具执行错误

**接口**：
```javascript
class ToolExecutor {
  constructor(runtime)
  getToolDefinitions(): ToolDefinition[]
  async executeToolCall(ctx, toolName, args): Promise<any>
}
```

**包含的工具**：
- `find_role_by_name` - 查找岗位
- `create_role` - 创建岗位
- `spawn_agent` - 创建智能体
- `spawn_agent_with_task` - 创建智能体并发送任务
- `send_message` - 发送消息
- `put_artifact` / `get_artifact` - 工件操作
- `console_print` - 控制台输出
- `terminate_agent` - 终止智能体
- `run_javascript` - 执行 JavaScript
- `compress_context` - 压缩上下文
- `get_context_status` - 获取上下文状态
- `http_request` - HTTP 请求
- `read_file` / `write_file` / `list_files` - 文件操作
- `get_workspace_info` - 工作空间信息
- `run_command` - 执行命令

### 3. LlmHandler（LLM 处理器）

**文件**：`src/platform/runtime/llm_handler.js`

**职责**：
- 处理与 LLM 的交互
- 管理工具调用循环
- 处理 LLM 错误和中断

**接口**：
```javascript
class LlmHandler {
  constructor(runtime)
  async handleWithLlm(ctx, message): Promise<void>
  async doLlmProcessing(ctx, message, conv, agentId, llmClient): Promise<void>
  async sendErrorNotificationToParent(agentId, message, errorInfo): Promise<void>
}
```

### 4. AgentManager（智能体管理器）

**文件**：`src/platform/runtime/agent_manager.js`

**职责**：
- 智能体的创建和注册
- 智能体的终止和级联清理
- 智能体状态跟踪
- 从持久化状态恢复智能体

**接口**：
```javascript
class AgentManager {
  constructor(runtime)
  async spawnAgent(input): Promise<Agent>
  async spawnAgentAs(callerAgentId, input): Promise<Agent>
  registerAgentInstance(agent): void
  listAgentInstances(): AgentInfo[]
  getAgentStatus(agentId): AgentStatus | null
  async terminateAgent(ctx, args): Promise<TerminateResult>
  async restoreAgentsFromOrg(): Promise<void>
  findWorkspaceIdForAgent(agentId): string | null
  getAgentTaskId(agentId): string | null
  collectDescendantAgents(parentId): string[]
  updateAgentActivity(agentId): void
  getAgentLastActivityTime(agentId): number | null
  getAgentIdleTime(agentId): number | null
  checkIdleAgents(): IdleAgentInfo[]
}
```

### 5. MessageProcessor（消息处理器）

**文件**：`src/platform/runtime/message_processor.js`

**职责**：
- 消息调度和投递
- 并发控制
- 消息处理循环

**接口**：
```javascript
class MessageProcessor {
  constructor(runtime)
  async processingLoop(): Promise<void>
  async scheduleMessageProcessing(maxConcurrent): Promise<boolean>
  async processAgentMessage(agentId, msg): Promise<void>
  async deliverOneRound(): Promise<boolean>
  async drainAgentQueue(agentId): Promise<void>
}
```

### 6. ContextBuilder（上下文构建器）

**文件**：`src/platform/runtime/context_builder.js`

**职责**：
- 构建系统提示词
- 格式化消息
- 构建智能体执行上下文

**接口**：
```javascript
class ContextBuilder {
  constructor(runtime)
  buildSystemPromptForAgent(ctx): string
  formatMessageForLlm(ctx, message): string
  buildAgentContext(agent): AgentContext
  ensureConversation(agentId, systemPrompt): Message[]
  getSenderInfo(senderId): SenderInfo | null
}
```

### 7. ShutdownManager（关闭管理器）

**文件**：`src/platform/runtime/shutdown_manager.js`

**职责**：
- 优雅关闭流程
- 信号处理
- 状态持久化协调

**接口**：
```javascript
class ShutdownManager {
  constructor(runtime)
  setupGracefulShutdown(options): void
  async shutdown(options): Promise<ShutdownResult>
  isShuttingDown(): boolean
  getShutdownStatus(): ShutdownStatus
}
```

### 8. JavaScriptExecutor（JavaScript 执行器）

**文件**：`src/platform/runtime/javascript_executor.js`

**职责**：
- 安全执行 JavaScript 代码
- 检测危险代码模式
- Canvas 绘图支持
- 结果序列化

**接口**：
```javascript
class JavaScriptExecutor {
  constructor(runtime)
  async execute(args, messageId, agentId): Promise<any>
  detectBlockedTokens(code): string[]
  toJsonSafeValue(value): JsonSafeResult
}
```

## 数据模型

### 模块间共享的数据结构

所有数据结构保持不变，只是访问方式从 `this._xxx` 变为通过 `runtime._xxx` 访问：

```javascript
// 智能体相关
runtime._agents: Map<string, Agent>
runtime._agentMetaById: Map<string, AgentMeta>
runtime._agentLastActivityTime: Map<string, number>
runtime._agentComputeStatus: Map<string, ComputeStatus>
runtime._agentTaskBriefs: Map<string, TaskBrief>

// 任务相关
runtime._rootTaskAgentByTaskId: Map<string, AgentInfo>
runtime._rootTaskRoleByTaskId: Map<string, string>
runtime._rootTaskEntryAgentAnnouncedByTaskId: Set<string>

// 消息相关
runtime._activeProcessingAgents: Set<string>
runtime._conversations: Map<string, Message[]>

// 其他
runtime._behaviorRegistry: Map<string, BehaviorFactory>
runtime._toolCallListeners: Set<Function>
runtime._computeStatusListeners: Set<Function>
```

## 正确性属性

*正确性属性是对系统行为的形式化描述，用于验证实现是否符合规范。每个属性都是一个"对于任意..."的陈述，可以通过属性测试来验证。*

### Property 1: 公共 API 向后兼容

*对于任意* 重构前 Runtime 类的公共方法调用序列，重构后应返回相同的结果，且内部状态变化一致。

**验证: 需求 7.3, 7.5**

### Property 2: 工具执行结果一致性

*对于任意* 工具名称和参数组合，ToolExecutor.executeToolCall() 应返回与原 Runtime.executeToolCall() 相同的结果结构，包括成功结果和错误信息。

**验证: 需求 1.2, 1.5**

### Property 3: 智能体生命周期一致性

*对于任意* 智能体创建和终止操作序列，AgentManager 应产生与原实现相同的智能体状态，包括父子关系、活动时间跟踪和级联终止行为。

**验证: 需求 3.1, 3.2, 3.3, 3.5**

### Property 4: 消息处理一致性

*对于任意* 消息序列和并发配置，MessageProcessor 应以与原实现相同的方式调度和处理消息，包括并发控制和失败隔离。

**验证: 需求 4.1, 4.2, 4.3, 4.5**

### Property 5: 上下文构建一致性

*对于任意* 智能体和消息组合，ContextBuilder 应生成与原实现相同的系统提示词和格式化消息。

**验证: 需求 5.1, 5.2, 5.3, 5.4**

### Property 6: JavaScript 执行一致性

*对于任意* JavaScript 代码输入，JavaScriptExecutor 应产生与原实现相同的执行结果，包括危险代码检测、结果序列化和错误处理。

**验证: 需求 8.1, 8.2, 8.4, 8.5**

## 错误处理

错误处理策略保持不变：

1. **工具执行错误** - 返回结构化错误对象 `{ error: string, ... }`
2. **LLM 调用错误** - 记录日志，通知父智能体，重置状态
3. **消息处理错误** - 隔离失败，继续处理其他消息
4. **关闭错误** - 记录日志，继续关闭流程

## 测试策略

### 单元测试

每个模块应有独立的单元测试文件：
- `test/platform/runtime/tool_executor.test.js`
- `test/platform/runtime/llm_handler.test.js`
- `test/platform/runtime/agent_manager.test.js`
- `test/platform/runtime/message_processor.test.js`
- `test/platform/runtime/context_builder.test.js`
- `test/platform/runtime/shutdown_manager.test.js`
- `test/platform/runtime/javascript_executor.test.js`

### 集成测试

现有的 `test/platform/runtime.test.js` 应继续通过，验证重构后的行为一致性。

### 属性测试

使用 fast-check 进行属性测试，验证正确性属性：
- 公共 API 向后兼容性
- 工具执行结果一致性
- 智能体生命周期一致性
