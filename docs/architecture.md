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

- 跨岗位/跨阶段信息优先写入工件并用引用传递
- 不在对话中无限堆叠上下文
- 一任务对象绑定一个智能体实例
- 结构化的任务委托书 (Task Brief) 明确输入输出边界

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
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ • submitRequirement()  - 提交需求                        │   │
│  │ • sendTextToAgent()    - 发送消息                        │   │
│  │ • waitForUserMessage() - 等待回复                        │   │
│  │ • onUserMessage()      - 注册回调                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌────────────────────── HTTPServer ───────────────────────┐   │
│  │ • /api/agents, /api/messages, /api/modules              │   │
│  │ • Static File Serving (Web UI, Artifacts)               │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                          Runtime                                │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │  MessageBus   │  │ OrgPrimitives │  │ ArtifactStore │       │
│  │  (消息总线)    │  │  (组织原语)    │  │  (工件存储)   │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │  PromptLoader │  │ LlmSvcRegistry│  │  HttpClient   │       │
│  │  (提示词加载)  │  │ (多模型注册)   │  │  (HTTP 客户端) │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │WorkspaceManager│ │CommandExecutor│  │ContactManager │       │
│  │  (工作空间)    │  │  (命令执行)   │  │  (联系人管理)  │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │ ModuleLoader  │  │ConversetionMgr│  │ConcurrencyCtrl│       │
│  │  (模块加载)    │  │ (会话管理)    │  │  (并发控制)   │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
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

## 核心组件

### AgentSociety

用户入口类，隐藏运行时与根智能体的构建细节，同时集成了 HTTP 服务器。

**职责：**
- 初始化系统与运行时
- 提供用户交互接口
- 启动/停止 HTTP 服务器
- 管理用户端点智能体与根智能体

### Runtime

运行时核心，连接平台能力与智能体行为，是整个系统的中枢。

**职责：**
- 管理智能体实例注册与恢复
- 执行主消息循环（生产者-消费者模式）
- 提供工具调用接口
- 协调各子模块工作

### MessageBus

异步消息总线，实现智能体间通信。

**特性：**
- 按智能体 ID 隔离队列
- 支持消息排队与投递
- 提供 `waitForMessage` 和 `receiveNext` 接口

### OrgPrimitives

组织构建原语，管理岗位与智能体实例的元数据。

**功能：**
- 创建/查询岗位 (Role)
- 创建智能体实例 (Agent)
- 维护父子链关系与层级结构
- 持久化组织状态

### LlmServiceRegistry & ModelSelector

多模型支持系统的核心。

**LlmServiceRegistry**：
- 加载和管理多个 LLM 服务配置（OpenAI, Anthropic, Local 等）
- 提供服务池化与复用

**ModelSelector**：
- 基于岗位提示词（Role Prompt）自动分析岗位所需能力
- 智能选择最匹配的 LLM 服务/模型

### ModuleLoader

模块化系统的核心，负责加载外部扩展模块。

**功能：**
- 动态加载 `modules/` 目录下的插件
- 注册模块提供的工具 (Tools)
- 注册模块提供的 Web 组件
- 注册模块提供的 HTTP 路由

### ContactManager

联系人管理器，维护智能体之间的协作关系网。

**功能：**
- 记录父子关系（自动添加）
- 记录首次通信关系（自动添加）
- 记录任务委托书中的协作者（Task Brief Collaborators）
- 为智能体构建动态的"通讯录"，注入到系统提示词中

### ConversationManager

会话与上下文管理器，负责 LLM 对话历史的维护与优化。

**功能：**
- 维护对话历史 (Conversation History)
- 监控 Token 使用率与上下文限制
- 执行上下文压缩 (Compression) 与摘要
- 持久化对话记录

### ConcurrencyController

并发控制器，保护 LLM 服务不被过载。

**功能：**
- 限制全局或服务级的最大并发请求数
- 协调消息处理循环的调度

### WorkspaceManager & CommandExecutor

任务执行环境管理。

- **WorkspaceManager**: 管理任务绑定的文件系统工作空间，提供文件读写能力。
- **CommandExecutor**: 在工作空间内安全执行 Shell 命令。

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
