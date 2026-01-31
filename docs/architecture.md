# 架构设计

本文档详细介绍 Agent Society 的架构设计、核心概念和设计原则。

## 目录

- [设计理念](#设计理念)
- [系统架构](#系统架构)
- [核心组件](#核心组件)
- [智能体模型](#智能体模型)
- [消息流转](#消息流转)
- [组织结构](#组织结构)
- [上下文管理](#上下文管理)
- [模块化系统](#模块化系统)
- [多模型架构](#多模型架构)

## 设计理念

### 最小化系统原则

Agent Society 遵循"最小化系统"原则：

- **系统只提供能力，不提供组织社会规则**
- 系统不预置任何岗位/智能体清单与推荐组织结构
- 组织结构、岗位职责、协作规则由智能体自主决定

### 自组织

智能体负责"组织社会规则"的生成与执行：

- 组织结构如何演化
- 岗位职责如何定义
- 升级/汇报/对齐如何运行
- 冲突如何裁决
- 质量标准与完成条件如何设定

### 上下文最小化

通过合理拆解需求，让每个智能体只控制必要的最小上下文：

- 跨岗位/跨阶段信息优先写入工作区并用引用传递
- 不在对话中无限堆叠上下文
- 一任务对象绑定一个智能体实例
- 结构化的任务委托书 (Task Brief) 明确输入输出边界

### 模块化与可维护性

系统采用模块化架构设计，遵循以下原则：

- **单一职责**：每个模块只负责一项功能
- **高内聚低耦合**：相关功能集中，模块间依赖最小化
- **代码行数限制**：每个文件不超过500行（不含注释）
- **清晰的目录结构**：按功能域组织，目录层级不超过3层
- **向后兼容**：提供兼容性导出，保持API接口稳定

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                          │
│                    (CLI / HTTP API / SDK)                       │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                        AgentSociety                             │
│                      (core/agent_society.js)                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • submitRequirement()  - 提交需求                        │   │
│  │ • sendTextToAgent()    - 发送消息                        │   │
│  │ • waitForUserMessage() - 等待回复                        │   │
│  │ • onUserMessage()      - 注册回调                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────── HTTPServer ───────────────────────┐   │
│  │              (services/http/http_server.js)             │   │
│  │ • /api/agents, /api/messages, /api/modules              │   │
│  │ • Static File Serving (Web UI, Workspaces)              │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Runtime                                │
│                      (core/runtime.js)                          │
│                                                                 │
│  ┌──────────────── 核心模块 (core/) ─────────────────┐         │
│  │  MessageBus   │ OrgPrimitives │                   │         │
│  │  (消息总线)    │  (组织原语)    │                   │         │
│  └───────────────────────────────────────────────────┘         │
│                                                                 │
│  ┌──────────────── 服务模块 (services/) ─────────────┐         │
│  │ • workspace/    - 工作区管理、文件操作、内容路由   │         │
│  │ • llm/          - LLM客户端、服务注册、模型选择    │         │
│  │ • conversation/ - 会话管理、上下文压缩            │         │
│  │ • http/         - HTTP服务器、HTTP客户端          │         │
│  │ • contact/      - 联系人管理                      │         │
│  └───────────────────────────────────────────────────┘         │
│                                                                 │
│  ┌──────────────── Runtime子模块 (runtime/) ─────────┐         │
│  │ • runtime_state.js      - 状态管理                │         │
│  │ • runtime_events.js     - 事件系统                │         │
│  │ • runtime_lifecycle.js  - 智能体生命周期          │         │
│  │ • runtime_messaging.js  - 消息处理循环            │         │
│  │ • runtime_tools.js      - 工具管理                │         │
│  │ • runtime_llm.js        - LLM交互                 │         │
│  │ • agent_manager.js      - 智能体管理器            │         │
│  │ • message_processor.js  - 消息处理器              │         │
│  │ • tool_executor.js      - 工具执行器              │         │
│  │ • llm_handler.js        - LLM处理器               │         │
│  │ • context_builder.js    - 上下文构建器            │         │
│  │ • javascript_executor.js - JS执行器               │         │
│  │ • shutdown_manager.js   - 关闭管理器              │         │
│  └───────────────────────────────────────────────────┘         │
│                                                                 │
│  ┌──────────────── 工具模块 (utils/) ────────────────┐         │
│  │ • message/  - 消息格式化、验证、任务委托书         │         │
│  │ • content/  - 内容适配、能力路由                  │         │
│  │ • config/   - 配置加载、配置服务                  │         │
│  │ • logger/   - 日志系统                            │         │
│  └───────────────────────────────────────────────────┘         │
│                                                                 │
│  ┌──────────────── 扩展模块 (extensions/) ───────────┐         │
│  │ • module_loader.js      - 模块加载器              │         │
│  │ • tool_group_manager.js - 工具组管理器            │         │
│  └───────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Instances                            │
│  ┌─────────┐                                                    │
│  │  User   │◄──────────────────────────────────────────────┐   │
│  │Endpoint │                                                │   │
│  └─────────┘                                                │   │
│       ▲                                                     │   │
│       │                                                     │   │
│  ┌─────────┐      ┌─────────┐      ┌─────────┐             │   │
│  │  Root   │─────▶│ Agent A │─────▶│ Agent C │─────────────┘   │
│  │         │      │         │      │         │                  │
│  └─────────┘      └─────────┘      └─────────┘                  │
│                         │                                       │
│                         ▼                                       │
│                   ┌─────────┐                                   │
│                   │ Agent B │                                   │
│                   │         │                                   │
│                   └─────────┘                                   │
└─────────────────────────────────────────────────────────────────┘
```

### 模块依赖关系图

```
src/platform/
│
├── core/                          # 核心模块（系统基础）
│   ├── agent_society.js           # 系统入口
│   │   └─→ runtime.js
│   ├── runtime.js                 # 运行时核心（协调器）
│   │   ├─→ message_bus.js
│   │   ├─→ org_primitives.js
│   │   ├─→ services/*
│   │   ├─→ runtime/*
│   │   ├─→ utils/*
│   │   └─→ extensions/*
│   ├── message_bus.js             # 消息总线
│   └── org_primitives.js          # 组织原语
│
├── services/                      # 服务模块（独立功能）
│   ├── workspace/
│   │   ├── workspace_manager.js   # 工作区管理
│   │   ├── workspace.js           # 工作区实例
│   │   └── content_router.js      # 内容路由
│   ├── llm/
│   │   ├── llm_client.js          # LLM客户端
│   │   ├── llm_service_registry.js # 服务注册表
│   │   ├── model_selector.js      # 模型选择器
│   │   └── concurrency_controller.js # 并发控制
│   ├── conversation/
│   │   └── conversation_manager.js # 会话管理
│   ├── http/
│   │   ├── http_server.js         # HTTP服务器
│   │   └── http_client.js         # HTTP客户端
│   └── contact/
│       └── contact_manager.js     # 联系人管理
│
├── runtime/                       # Runtime子模块
│   ├── runtime_state.js           # 状态管理
│   ├── runtime_events.js          # 事件系统
│   ├── runtime_lifecycle.js       # 智能体生命周期
│   ├── runtime_messaging.js       # 消息处理循环
│   ├── runtime_tools.js           # 工具管理
│   ├── runtime_llm.js             # LLM交互
│   ├── agent_manager.js           # 智能体管理器
│   ├── message_processor.js       # 消息处理器
│   ├── tool_executor.js           # 工具执行器
│   ├── llm_handler.js             # LLM处理器
│   ├── context_builder.js         # 上下文构建器
│   ├── javascript_executor.js     # JS执行器
│   ├── browser_javascript_executor.js # 浏览器JS执行器
│   └── shutdown_manager.js        # 关闭管理器
│
├── utils/                         # 工具模块（辅助功能）
│   ├── message/
│   │   ├── message_formatter.js   # 消息格式化
│   │   ├── message_validator.js   # 消息验证
│   │   └── task_brief.js          # 任务委托书
│   ├── content/
│   │   ├── content_adapter.js     # 内容适配
│   │   └── capability_router.js   # 能力路由
│   ├── config/
│   │   ├── config_loader.js       # 配置加载
│   │   └── config_service.js      # 配置服务
│   └── logger/
│       └── logger.js              # 日志系统
│
├── extensions/                    # 扩展模块（可插拔）
│   ├── module_loader.js           # 模块加载器
│   └── tool_group_manager.js      # 工具组管理器
│
├── prompt_loader.js               # 提示词加载器
└── index.js                       # 统一导出
```

## 核心组件

### AgentSociety (core/agent_society.js)

用户入口类，隐藏运行时与根智能体的构建细节，同时集成了 HTTP 服务器。

**职责：**
- 初始化系统与运行时
- 提供用户交互接口
- 启动/停止 HTTP 服务器
- 管理用户端点智能体与根智能体

### Runtime (core/runtime.js)

运行时核心，连接平台能力与智能体行为，是整个系统的中枢。经过重构后，Runtime 作为核心协调器，将职责分散到多个子模块中。

**职责：**
- 初始化和配置管理
- 协调各个服务模块
- 组合和管理 Runtime 子模块
- 提供统一的公共接口

**子模块：**
- **runtime_state.js**: 状态管理（智能体注册表、运算状态、插话队列、对话历史等）
- **runtime_events.js**: 事件系统（工具调用、错误、LLM重试、运算状态变更事件）
- **runtime_lifecycle.js**: 智能体生命周期管理（创建、恢复、注册、查询、中断）
- **runtime_messaging.js**: 消息处理循环（消息调度、处理、插话处理、并发控制）
- **runtime_tools.js**: 工具管理（工具定义、执行、工具组管理、权限检查）
- **runtime_llm.js**: LLM交互（LLM调用、上下文构建、错误处理）
- **agent_manager.js**: 智能体管理器
- **message_processor.js**: 消息处理器
- **tool_executor.js**: 工具执行器
- **llm_handler.js**: LLM处理器
- **context_builder.js**: 上下文构建器
- **javascript_executor.js**: JavaScript执行器
- **browser_javascript_executor.js**: 浏览器JavaScript执行器
- **shutdown_manager.js**: 优雅关闭管理器

### MessageBus (core/message_bus.js)

异步消息总线，实现智能体间通信。

**特性：**
- 按智能体 ID 隔离队列
- 支持消息排队与投递
- 提供 `waitForMessage` 和 `receiveNext` 接口

### OrgPrimitives (core/org_primitives.js)

组织构建原语，管理岗位与智能体实例的元数据。

**功能：**
- 创建/查询岗位 (Role)
- 创建智能体实例 (Agent)
- 维护父子链关系与层级结构
- 持久化组织状态

### 服务模块 (services/)

服务模块提供独立的功能服务，按功能域组织：

#### 工作区服务 (services/workspace/)
- **workspace_manager.js**: 工作区生命周期管理
- **workspace.js**: 工作区实例，提供文件操作、元数据管理
- **content_router.js**: 内容路由，处理多模态内容、文件到提示词的转换

#### LLM服务 (services/llm/)
- **llm_client.js**: LLM客户端，与LLM服务通信
- **llm_service_registry.js**: LLM服务注册表，管理多个LLM服务配置
- **model_selector.js**: 模型选择器，基于岗位提示词自动选择最匹配的LLM服务
- **concurrency_controller.js**: 并发控制器，保护LLM服务不被过载

#### 会话服务 (services/conversation/)
- **conversation_manager.js**: 会话管理器，负责LLM对话历史的维护与优化

#### HTTP服务 (services/http/)
- **http_server.js**: HTTP服务器
- **http_client.js**: HTTP客户端

#### 联系人服务 (services/contact/)
- **contact_manager.js**: 联系人管理器，维护智能体之间的协作关系网

### 工具模块 (utils/)

工具模块提供辅助功能，可以被多个模块复用：

#### 消息工具 (utils/message/)
- **message_formatter.js**: 消息格式化
- **message_validator.js**: 消息验证
- **task_brief.js**: 任务委托书处理

#### 内容工具 (utils/content/)
- **content_adapter.js**: 内容适配
- **capability_router.js**: 能力路由（从 content_router 中提取的通用部分）

#### 配置工具 (utils/config/)
- **config_loader.js**: 配置加载（原 config.js）
- **config_service.js**: 配置服务

#### 日志工具 (utils/logger/)
- **logger.js**: 日志系统

### 扩展模块 (extensions/)

扩展模块提供可插拔的功能扩展：

- **module_loader.js**: 模块加载器，负责加载外部扩展模块
- **tool_group_manager.js**: 工具组管理器

### LlmServiceRegistry & ModelSelector (services/llm/)

多模型支持系统的核心。

**LlmServiceRegistry**：
- 加载和管理多个 LLM 服务配置（OpenAI, Anthropic, Local 等）
- 提供服务池化与复用

**ModelSelector**：
- 基于岗位提示词（Role Prompt）自动分析岗位所需能力
- 智能选择最匹配的 LLM 服务/模型

### ModuleLoader (extensions/module_loader.js)

模块化系统的核心，负责加载外部扩展模块。

**功能：**
- 动态加载 `modules/` 目录下的插件
- 注册模块提供的工具 (Tools)
- 注册模块提供的 Web 组件
- 注册模块提供的 HTTP 路由

### ContactManager (services/contact/contact_manager.js)

联系人管理器，维护智能体之间的协作关系网。

**功能：**
- 记录父子关系（自动添加）
- 记录首次通信关系（自动添加）
- 记录任务委托书中的协作者（Task Brief Collaborators）
- 为智能体构建动态的"通讯录"，注入到系统提示词中

### ConversationManager (services/conversation/conversation_manager.js)

会话与上下文管理器，负责 LLM 对话历史的维护与优化。

**功能：**
- 维护对话历史 (Conversation History)
- 监控 Token 使用率与上下文限制
- 执行上下文压缩 (Compression) 与摘要
- 持久化对话记录

### ConcurrencyController (services/llm/concurrency_controller.js)

并发控制器，保护 LLM 服务不被过载。

**功能：**
- 限制全局或服务级的最大并发请求数
- 协调消息处理循环的调度

### WorkspaceManager (services/workspace/)

任务执行环境管理。

- **WorkspaceManager**: 管理任务绑定的文件系统工作空间，提供文件读写能力。

## 智能体模型

### Agent 类

```javascript
class Agent {
  constructor(options) {
    this.id = options.id;           // 智能体实例 ID
    this.roleId = options.roleId;   // 岗位 ID
    this.roleName = options.roleName; // 岗位名称
    this.rolePrompt = options.rolePrompt; // 岗位提示词
    this._behavior = options.behavior; // 行为函数
  }

  async onMessage(ctx, message) {
    await this._behavior(ctx, message);
  }
}
```

### 生命周期状态

智能体在运行时具有明确的状态：
- `idle`: 空闲，等待消息
- `waiting_llm`: 已发起 LLM 请求，正在等待响应
- `processing`: 正在处理消息或执行工具调用
- `terminated`: 已终止，不再处理消息

### 智能体上下文 (Context)

每个智能体在处理消息时获得的上下文对象 `ctx`：

```javascript
{
  runtime: Runtime,        // 运行时引用
  agent: Agent,           // 当前智能体
  currentMessage: Message, // 当前处理的消息
  tools: {
    findRoleByName(name),
    createRole({ name, rolePrompt }),
    spawnAgent({ roleId, taskBrief }),
    spawnAgentWithTask({ roleId, taskBrief, initialMessage }), // 新增：创建并发送
    sendMessage({ to, payload }),
    putArtifact({ type, content, meta }),
    getArtifact(ref),
    compressContext({ summary }), // 新增：压缩上下文
    httpRequest({ url, ... }),    // 新增：网络请求
    runJavascript({ code, input }), // 新增：JS沙箱
    // ... 更多工具及模块提供的工具
  }
}
```

## 消息流转

### 消息结构

```javascript
{
  id: "msg-uuid",           // 消息 ID
  to: "agent-id",           // 目标智能体
  from: "sender-id",        // 发送者智能体
  taskId: "task-uuid",      // 任务 ID
  payload: {                // 消息载荷
    text: "消息内容",
    message_type: "task_assignment", // 推荐的消息类型字段
    // ... 其他结构化数据
  }
}
```

### 任务委托书 (Task Brief)

标准化的任务分发载体，在创建智能体时传递：

```javascript
{
  objective: "目标描述",
  constraints: ["约束1", "约束2"],
  inputs: "输入说明",
  outputs: "输出要求",
  completion_criteria: "完成标准",
  collaborators: [ // 预设协作关系
    { agentId: "agent-x", role: "reviewer", description: "代码审查人" }
  ],
  references: ["doc-ref-1"],
  priority: "high"
}
```

## 组织结构

### 岗位 (Role)

```javascript
{
  id: "role-uuid",
  name: "岗位名称",
  rolePrompt: "岗位提示词...",
  llmServiceId: "gpt4", // 可选：绑定特定的 LLM 服务
  createdBy: "creator-agent-id",
  createdAt: "2026-01-06T..."
}
```

### 智能体实例 (Agent Instance)

```javascript
{
  id: "agent-uuid",
  roleId: "role-uuid",
  parentAgentId: "parent-agent-id",
  status: "active" // active | terminated
}
```

## 上下文管理

### 上下文限制策略

```javascript
{
  maxTokens: 12000,          // 最大 token 数
  warningThreshold: 0.7,     // 警告阈值 (70%) - 触发警告日志
  criticalThreshold: 0.9,    // 临界阈值 (90%) - 强烈建议压缩
  hardLimitThreshold: 0.95   // 硬性限制 (95%) - 拒绝 LLM 调用，防止 Token 溢出错误
}
```

### 压缩机制

当上下文过长时，智能体**必须**调用 `compress_context` 工具。
系统将保留：
1. System Prompt (包含岗位设定、运行时信息、工具规则)
2. 压缩后的摘要 (Summary)
3. 最近 N 条消息 (Recent Messages)

## 模块化系统

Agent Society 支持通过模块 (Modules) 扩展系统能力。

### 模块结构

一个模块通常包含：
- **Tools**: 扩展智能体的能力（如 Chrome 浏览、数据库访问）
- **Web Component**: 扩展 Web UI 的展示能力（如自定义渲染消息类型）
- **HTTP Handler**: 扩展后端 API（如 Webhook 接收）

### 加载机制

1. 在 `config/app.json` 中配置 `modules` 列表
2. `ModuleLoader` 动态 `import` 模块入口
3. 调用模块的 `init` 方法并注册资源

## 多模型架构

系统支持同时连接多个 LLM 服务，实现"大模型路由"。

1. **配置**: `config/llmservices.json` 定义多个服务 (Service)
2. **选择**: 
   - **手动指定**: 创建岗位时指定 `llmServiceId`
   - **自动选择**: `ModelSelector` 根据岗位提示词分析所需的 `capabilityTags` (如 `coding`, `reasoning`, `creative`)，自动匹配最佳服务
3. **调用**: 运行时根据智能体绑定的服务 ID，从池中获取对应的 `LlmClient` 执行调用


## 代码重构说明

### 重构目标

Agent Society 经历了一次全面的代码重构，目标是优化代码组织结构，提高可维护性和可扩展性，同时保持所有现有功能不变。

### 重构原则

1. **功能保持不变**：重构不改变任何功能，只改变代码组织方式
2. **向后兼容**：保持对外 API 接口不变，提供兼容性导出
3. **渐进式重构**：分阶段执行，每个阶段都能保持系统可运行
4. **测试覆盖**：重构前后测试必须通过
5. **遵循项目规范**：按照架构原则和编码规范

### 主要变更

#### 1. 目录结构优化

将原来平铺在 `src/platform/` 目录下的27个文件重新组织为清晰的层次结构：

- **core/**: 核心模块（agent_society, runtime, message_bus, org_primitives）
- **services/**: 服务模块（artifact, llm, conversation, workspace, http, contact）
- **runtime/**: Runtime子模块（状态管理、事件系统、生命周期等）
- **utils/**: 工具模块（message, content, config, logger）
- **extensions/**: 扩展模块（module_loader, tool_group_manager）

#### 2. Runtime类拆分

将原来庞大的 Runtime 类拆分为多个职责明确的子模块：

- **runtime_state.js**: 状态管理（智能体注册表、运算状态、插话队列等）
- **runtime_events.js**: 事件系统（工具调用、错误、LLM重试等事件）
- **runtime_lifecycle.js**: 智能体生命周期管理
- **runtime_messaging.js**: 消息处理循环
- **runtime_tools.js**: 工具管理
- **runtime_llm.js**: LLM交互

Runtime 主类保留为核心协调器，负责初始化、配置管理和组合各个子模块。

#### 3. 模块合并

合并了职责重叠的模块：

- **配置模块**: config.js 重命名为 config_loader.js，与 config_service.js 共同组成配置工具
- **内容路由**: artifact_content_router 和 capability_router 合并为 content_router.js
- **消息工具**: message_formatter、message_validator、task_brief 统一管理

#### 4. 服务模块化

将相关服务按功能域组织：

- **工件服务**: artifact_store, binary_detector, content_router
- **LLM服务**: llm_client, llm_service_registry, model_selector, concurrency_controller
- **会话服务**: conversation_manager
- **工作空间服务**: workspace_manager
- **HTTP服务**: http_server, http_client
- **联系人服务**: contact_manager

#### 5. 兼容性保证

所有路径变更都提供了兼容性导出，确保：

- 旧的导入路径仍然可用
- 函数名称变更提供别名导出
- API接口保持不变
- 系统行为与重构前完全一致

### 重构成果

- ✅ 代码结构清晰，易于理解和维护
- ✅ 模块职责明确，高内聚低耦合
- ✅ 目录组织合理，便于快速定位
- ✅ 每个文件代码行数不超过500行
- ✅ 无循环依赖
- ✅ 测试覆盖完整，所有测试通过
- ✅ 向后兼容，不影响现有代码使用者

### 迁移指南

如果您的代码使用了旧的导入路径，建议更新为新路径：

```javascript
// 旧路径（仍然可用，但建议更新）
import { Runtime } from './src/platform/runtime.js';
import { ArtifactStore } from './src/platform/artifact_store.js';

// 新路径（推荐）
import { Runtime } from './src/platform/core/runtime.js';
import { ArtifactStore } from './src/platform/services/artifact/artifact_store.js';

// 或使用统一导出
import { Runtime, ArtifactStore } from './src/platform/index.js';
```

详细的迁移指南请参阅 [重构迁移指南](./refactoring-migration-guide.md)（待创建）。
