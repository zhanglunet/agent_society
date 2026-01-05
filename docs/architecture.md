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
│  │  PromptLoader │  │   LlmClient   │  │  HttpClient   │       │
│  │  (提示词加载)  │  │  (LLM 调用)   │  │  (HTTP 客户端) │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐       │
│  │WorkspaceManager│ │CommandExecutor│  │ContactManager │       │
│  │  (工作空间)    │  │  (命令执行)   │  │  (联系人管理)  │       │
│  └───────────────┘  └───────────────┘  └───────────────┘       │
│  ┌───────────────────────────────────────────────────────┐     │
│  │              ConversationManager                       │     │
│  │              (会话与上下文管理)                          │     │
│  └───────────────────────────────────────────────────────┘     │
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

用户入口类，隐藏运行时与根智能体的构建细节。

**职责：**
- 初始化系统
- 提供用户交互接口
- 管理用户端点智能体
- 管理根智能体

### Runtime

运行时核心，连接平台能力与智能体行为。

**职责：**
- 管理智能体实例注册
- 执行消息循环
- 提供工具调用接口
- 管理会话上下文

### MessageBus

异步消息总线，实现智能体间通信。

**特性：**
- 按智能体 ID 隔离队列
- 支持消息排队与投递
- 提供等待消息接口

### OrgPrimitives

组织构建原语，管理岗位与智能体实例。

**功能：**
- 创建/查询岗位
- 创建智能体实例
- 维护父子链关系
- 持久化组织状态

### ArtifactStore

工件存储，管理任务产物。

**功能：**
- 写入工件（返回引用）
- 读取工件（通过引用）
- 持久化存储

### PromptLoader

提示词加载器，管理系统提示词模板。

**功能：**
- 加载系统预置提示词
- 支持模板变量替换
- 提示词拼接

### LlmClient

LLM 客户端，封装大语言模型调用。

**功能：**
- 兼容 OpenAI API
- 支持工具调用
- 流式响应（可选）

### WorkspaceManager

工作空间管理器，管理任务文件系统。

**功能：**
- 绑定任务工作空间
- 文件读写操作
- 目录列举

### CommandExecutor

命令执行器，在工作空间内执行终端命令。

**功能：**
- 命令执行
- 危险命令拦截
- 超时控制

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

### 特殊智能体

**Root（根智能体）：**
- ID 固定为 `"root"`
- 随系统启动创建
- 接收用户需求
- 为每个 taskId 创建直属子智能体

**User Endpoint（用户端点）：**
- ID 固定为 `"user"`
- 接收组织内智能体发给用户的消息
- 输出到控制台与日志
- 通知注册的消息监听器

### 智能体上下文

每个智能体在处理消息时获得的上下文：

```javascript
{
  runtime: Runtime,        // 运行时引用
  agent: Agent,           // 当前智能体
  currentMessage: Message, // 当前处理的消息
  tools: {
    findRoleByName(name),
    createRole({ name, rolePrompt }),
    spawnAgent({ roleId, taskBrief }),
    sendMessage({ to, payload }),
    putArtifact({ type, content, meta }),
    getArtifact(ref),
    // ... 更多工具
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
    // 或其他结构化数据
  }
}
```

### 消息流转流程

```
1. 用户提交需求
   submitRequirement("需求文本")
        │
        ▼
2. 系统生成 taskId，发送消息到 root
   { to: "root", from: "user", taskId, payload: { text } }
        │
        ▼
3. Root 处理消息，创建子智能体
   create_role() → spawn_agent()
        │
        ▼
4. Root 通知用户入口智能体 ID
   send_message({ to: "user", payload: { agentId } })
        │
        ▼
5. 子智能体处理任务，可能创建更多子智能体
   create_role() → spawn_agent() → send_message()
        │
        ▼
6. 智能体完成任务，回复用户
   send_message({ to: "user", payload: { text: "结果" } })
        │
        ▼
7. 用户端点接收消息，输出到控制台
   [user] from=agent-xxx taskId=xxx
   结果内容
```

## 组织结构

### 岗位（Role）

```javascript
{
  id: "role-uuid",
  name: "岗位名称",
  rolePrompt: "岗位提示词...",
  createdBy: "creator-agent-id",
  createdAt: "2026-01-06T..."
}
```

### 智能体实例（Agent Instance）

```javascript
{
  id: "agent-uuid",
  roleId: "role-uuid",
  parentAgentId: "parent-agent-id"
}
```

### 父子链约束

1. **spawn_agent 的 parentAgentId 由系统自动填充**
2. **所有智能体只能在"自己创建的子岗位"上 spawn_agent**
3. **Root 对每个 taskId 只能创建 1 个直属子智能体**

### 组织演化

```
初始状态:
  root

用户提交需求后:
  root
    └── task-entry-agent (任务入口)

任务入口创建子岗位:
  root
    └── task-entry-agent
          ├── worker-a
          └── worker-b

Worker 继续分工:
  root
    └── task-entry-agent
          ├── worker-a
          │     └── sub-worker-a1
          └── worker-b
```

## 上下文管理

### 上下文限制

```javascript
{
  maxTokens: 12000,          // 最大 token 数
  warningThreshold: 0.7,     // 警告阈值 (70%)
  criticalThreshold: 0.9,    // 临界阈值 (90%)
  hardLimitThreshold: 0.95   // 硬性限制 (95%)
}
```

### 上下文状态

| 状态 | 使用率 | 说明 |
|------|--------|------|
| `normal` | < 70% | 正常状态 |
| `warning` | 70% - 90% | 建议压缩 |
| `critical` | 90% - 95% | 必须压缩 |
| `exceeded` | > 95% | 超出限制 |

### 上下文压缩

智能体可调用 `compress_context` 工具压缩历史：

```javascript
compress_context({
  summary: "对被压缩历史的重要内容摘要",
  keepRecentCount: 10  // 保留最近 10 条消息
})
```

压缩后的会话结构：

```
[系统提示词]
[压缩摘要: "之前的对话摘要..."]
[最近 N 条消息]
```
