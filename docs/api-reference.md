# API 参考

本文档提供 Agent Society 的完整 API 参考。

## 目录

- [AgentSociety 类](#agentsociety-类)
- [Runtime 类](#runtime-类)
- [Agent 类](#agent-类)
- [HTTP API](#http-api)
- [消息格式](#消息格式)
- [工作区格式](#工作区格式)
- [Task Brief 格式](#task-brief-格式)

## AgentSociety 类

用户入口类，提供系统初始化、用户交互和生命周期管理接口。

### 构造函数

```javascript
new AgentSociety(options?)
```

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.configPath` | `string` | `"config/app.json"` | 配置文件路径 |
| `options.dataDir` | `string` | `null` | 数据目录（覆盖配置） |
| `options.maxSteps` | `number` | `200` | 消息循环最大步数 |
| `options.httpPort` | `number` | `3000` | HTTP 服务器端口 |
| `options.enableHttp` | `boolean` | `false` | 是否启用 HTTP 服务器 |
| `options.shutdownTimeoutMs` | `number` | `30000` | 优雅关闭超时时间（毫秒） |

**示例：**

```javascript
const system = new AgentSociety({
  dataDir: "data/my_project",
  enableHttp: true,
  httpPort: 8080
});
```

### init()

初始化系统。

```javascript
async init(): Promise<void>
```

**说明：**
- 加载配置（app.json, logging.json, llmservices.json 等）
- 初始化平台能力（Runtime, MessageBus, WorkspaceManager, OrgPrimitives 等）
- 加载外部模块（Modules）
- 创建根智能体与用户端点
- 启动消息处理循环
- 启动 HTTP 服务器（如果启用）
- 设置优雅关闭钩子（SIGINT/SIGTERM）

### submitRequirement()

提交自然语言需求给根智能体。

```javascript
async submitRequirement(
  text: string,
  options?: { workspacePath?: string }
): Promise<{ taskId: string, workspacePath?: string } | { error: string }>
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `text` | `string` | 需求描述文本 |
| `options.workspacePath` | `string` | 可选，绑定的工作空间路径（绝对路径或相对路径） |

### sendTextToAgent()

向指定智能体发送文本消息。

```javascript
sendTextToAgent(
  agentId: string,
  text: string,
  options?: { taskId?: string }
): { taskId: string, to: string } | { error: string }
```

### onUserMessage()

注册用户消息回调（接收发给 User 端点的消息）。

```javascript
onUserMessage(handler: (message: any) => void): () => void
```

### waitForUserMessage()

等待满足条件的用户消息。

```javascript
async waitForUserMessage(
  predicate: (message: any) => boolean,
  options?: { timeoutMs?: number }
): Promise<any | null>
```

### shutdown()

手动触发优雅关闭流程。

```javascript
async shutdown(): Promise<{
  ok: boolean,
  pendingMessages: number,
  activeAgents: number,
  shutdownDuration: number
}>
```

### HTTP 服务器管理

```javascript
// 获取 HTTP 服务器实例
getHttpServer(): HTTPServer | null

// 检查 HTTP 服务器是否运行
isHttpServerRunning(): boolean

// 停止 HTTP 服务器
async stopHttpServer(): Promise<{ ok: boolean }>
```

## Runtime 类

运行时核心类，通常通过 `AgentSociety.runtime` 访问。

### 构造函数

```javascript
new Runtime(options?)
```

**关键参数：**

- `contextLimit`: 上下文限制配置对象
  - `maxTokens`: 最大 Token 数
  - `warningThreshold`: 警告阈值 (0-1)
  - `criticalThreshold`: 严重警告阈值 (0-1)
  - `hardLimitThreshold`: 硬性限制阈值 (0-1)
- `maxToolRounds`: 单次 LLM 交互最大工具调用轮次
- `idleWarningMs`: 智能体空闲警告阈值（毫秒）

### 核心方法

#### getAgentStatus()

获取智能体运行时状态。

```javascript
getAgentStatus(agentId: string): {
  id: string,
  roleId: string,
  roleName: string,
  status: string, // "active" | "terminated"
  queueDepth: number,
  conversationLength: number
} | null
```

#### getAgentComputeStatus()

获取智能体运算状态。

```javascript
getAgentComputeStatus(agentId: string): 'idle' | 'waiting_llm' | 'processing'
```

#### abortAgentLlmCall()

中断指定智能体的 LLM 调用。

```javascript
abortAgentLlmCall(agentId: string): { 
  ok: boolean, 
  aborted: boolean, 
  reason?: string 
}
```

#### checkIdleAgents()

检查并返回空闲超时的智能体列表。

```javascript
checkIdleAgents(): Array<{ agentId: string, idleTimeMs: number }>
```

#### getToolDefinitions()

获取当前可用的所有工具定义（OpenAI Schema）。

## Agent 类

智能体实例类。

### 属性

- `id`: 智能体唯一 ID
- `roleId`: 岗位 ID
- `roleName`: 岗位名称
- `rolePrompt`: 岗位 System Prompt

### 方法

#### onMessage()

```javascript
async onMessage(ctx: AgentContext, message: Message): Promise<void>
```

## HTTP API

Agent Society 内置 HTTP 服务器提供 RESTful API。

### 基础交互

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/submit` | 提交需求给根智能体 |
| POST | `/api/send` | 发送消息给指定智能体 |
| GET | `/api/messages/:taskId` | 获取指定任务的消息记录 |

### 智能体与组织管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agents` | 获取所有智能体列表 |
| GET | `/api/roles` | 获取所有岗位列表 |
| GET | `/api/org/tree` | 获取组织架构树（智能体层级） |
| GET | `/api/org/role-tree` | 获取岗位架构树（岗位层级） |
| DELETE | `/api/agent/:agentId` | 删除智能体（软删除） |
| DELETE | `/api/role/:roleId` | 删除岗位（软删除） |

### 智能体详情与操作

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agent-messages/:agentId` | 获取智能体全量消息历史 |
| GET | `/api/agent-conversation/:agentId` | 获取智能体对话上下文（含思考过程） |
| POST | `/api/agent/:agentId/custom-name` | 设置智能体自定义名称 |
| GET | `/api/agent-custom-names` | 获取所有自定义名称 |
| POST | `/api/agent/:agentId/abort` | 中断智能体当前的 LLM 生成 |
| POST | `/api/role/:roleId/prompt` | 更新岗位提示词 |

### 模块 (Modules)

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/modules` | 获取已加载模块列表 |
| GET | `/api/modules/:name` | 获取指定模块详情 |
| GET | `/api/modules/:name/web-component` | 获取模块的前端组件定义 |
| ANY | `/api/modules/:name/*` | 调用模块自定义的 HTTP 接口 |

### 静态资源

- `/web/*`: Web 查看器界面
- `/api/workspaces/:workspaceId/*`: 访问工作区文件内容与列表

## 消息格式

### 标准消息结构

```typescript
interface Message {
  id: string;           // UUID
  to: string;           // 接收者 ID
  from: string;         // 发送者 ID
  taskId?: string;      // 关联的任务 ID
  payload: {
    text?: string;      // 文本内容
    kind?: string;      // 消息类型标识 (如 "error")
    [key: string]: any; // 其他结构化数据
  };
  createdAt: string;    // ISO 时间戳
}
```

## 工作区格式

每个智能体拥有独立的工作区。

```typescript
interface WorkspaceFile {
  path: string;         // 相对路径
  mimeType: string;     // MIME 类型
  size: number;         // 文件大小
  updatedAt: string;    // 最后更新时间
  meta?: {              // 元数据
    author?: string;
    messageId?: string;
    [key: string]: any;
  };
}
```

## Task Brief 格式

创建子智能体 (`spawn_agent`) 时必须提供的任务描述结构。

```typescript
interface TaskBrief {
  // 核心必填项
  objective: string;           // 任务目标
  constraints: string[];       // 约束条件
  inputs: string;              // 输入数据说明
  outputs: string;             // 交付物说明
  completion_criteria: string; // 完成标准

  // 可选项
  collaborators?: Array<{      // 预设协作方
    agentId: string;
    role: string;
    description?: string;
  }>;
  references?: string[];       // 参考资料
  priority?: string;           // 优先级
}
```
