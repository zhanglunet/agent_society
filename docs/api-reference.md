# API 参考

本文档提供 Agent Society 的完整 API 参考。

## 目录

- [AgentSociety 类](#agentsociety-类)
- [Runtime 类](#runtime-类)
- [Agent 类](#agent-类)
- [消息格式](#消息格式)
- [工件格式](#工件格式)

## AgentSociety 类

用户入口类，提供系统初始化和用户交互接口。

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
| `options.shutdownTimeoutMs` | `number` | `30000` | 关闭超时时间（毫秒） |

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
- 加载配置
- 初始化平台能力组件
- 创建根智能体与用户端点
- 启动消息处理循环
- 启动 HTTP 服务器（如果启用）

**示例：**

```javascript
await system.init();
```

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
| `options.workspacePath` | `string` | 可选，绑定的工作空间路径 |

**返回值：**

成功时返回 `{ taskId, workspacePath? }`，失败时返回 `{ error }`。

**示例：**

```javascript
// 简单需求
const { taskId } = await system.submitRequirement("计算 1+1");

// 带工作空间
const result = await system.submitRequirement(
  "创建一个计算器程序",
  { workspacePath: "./my_project" }
);
```

### sendTextToAgent()

向指定智能体发送文本消息。

```javascript
sendTextToAgent(
  agentId: string,
  text: string,
  options?: { taskId?: string }
): { taskId: string, to: string } | { error: string }
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `agentId` | `string` | 目标智能体 ID |
| `text` | `string` | 消息文本 |
| `options.taskId` | `string` | 可选，任务 ID（不提供则自动生成） |

**返回值：**

成功时返回 `{ taskId, to }`，失败时返回 `{ error }`。

**示例：**

```javascript
system.sendTextToAgent("agent-xxx", "你好", { taskId });
```

### onUserMessage()

注册用户消息回调。

```javascript
onUserMessage(handler: (message: any) => void): () => void
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `handler` | `function` | 消息处理函数 |

**返回值：**

返回取消订阅函数。

**示例：**

```javascript
const unsubscribe = system.onUserMessage((message) => {
  console.log("收到消息:", message.payload?.text);
});

// 取消订阅
unsubscribe();
```

### waitForUserMessage()

等待满足条件的用户消息。

```javascript
async waitForUserMessage(
  predicate: (message: any) => boolean,
  options?: { timeoutMs?: number }
): Promise<any | null>
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `predicate` | `function` | 消息匹配函数 |
| `options.timeoutMs` | `number` | 超时时间（毫秒），0 表示无限等待 |

**返回值：**

匹配的消息，超时返回 `null`。

**示例：**

```javascript
// 等待特定任务的回复
const reply = await system.waitForUserMessage(
  (m) => m?.taskId === taskId && m?.payload?.text,
  { timeoutMs: 60000 }
);

// 等待入口智能体 ID
const entryMsg = await system.waitForUserMessage(
  (m) => m?.from === "root" && m?.payload?.agentId,
  { timeoutMs: 30000 }
);
```

### shutdown()

手动触发优雅关闭。

```javascript
async shutdown(): Promise<{
  ok: boolean,
  pendingMessages: number,
  activeAgents: number,
  shutdownDuration: number
}>
```

**示例：**

```javascript
const result = await system.shutdown();
console.log(`关闭完成，耗时 ${result.shutdownDuration}ms`);
```

### isShuttingDown()

检查系统是否正在关闭。

```javascript
isShuttingDown(): boolean
```

### HTTP 服务器相关

```javascript
// 获取 HTTP 服务器实例
getHttpServer(): HTTPServer | null

// 检查 HTTP 服务器是否运行
isHttpServerRunning(): boolean

// 停止 HTTP 服务器
async stopHttpServer(): Promise<{ ok: boolean }>
```

## Runtime 类

运行时核心类，通常不直接使用，通过 `AgentSociety` 访问。

### 构造函数

```javascript
new Runtime(options?)
```

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `options.maxSteps` | `number` | `200` | 消息循环最大步数 |
| `options.configPath` | `string` | `"config/app.json"` | 配置文件路径 |
| `options.maxToolRounds` | `number` | `200` | 单次 LLM 调用最大工具轮次 |
| `options.maxContextMessages` | `number` | `50` | 最大上下文消息数 |
| `options.idleWarningMs` | `number` | `300000` | 空闲警告时间（毫秒） |
| `options.dataDir` | `string` | `null` | 数据目录 |

### listAgentInstances()

列出已注册的智能体实例。

```javascript
listAgentInstances(): Array<{
  id: string,
  roleId: string,
  roleName: string
}>
```

### getAgentStatus()

获取智能体状态。

```javascript
getAgentStatus(agentId: string): {
  id: string,
  roleId: string,
  roleName: string,
  parentAgentId: string | null,
  status: string,
  queueDepth: number,
  conversationLength: number
} | null
```

### getQueueDepths()

获取所有智能体的队列深度。

```javascript
getQueueDepths(): Array<{
  agentId: string,
  queueDepth: number
}>
```

### getToolDefinitions()

获取 LLM 工具定义。

```javascript
getToolDefinitions(): Array<ToolDefinition>
```

## Agent 类

智能体实例类。

### 构造函数

```javascript
new Agent(options)
```

**参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| `options.id` | `string` | 智能体实例 ID |
| `options.roleId` | `string` | 岗位 ID |
| `options.roleName` | `string` | 岗位名称 |
| `options.rolePrompt` | `string` | 岗位提示词 |
| `options.behavior` | `function` | 行为函数 |

### 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 智能体实例 ID |
| `roleId` | `string` | 岗位 ID |
| `roleName` | `string` | 岗位名称 |
| `rolePrompt` | `string` | 岗位提示词 |

### onMessage()

处理收到的消息。

```javascript
async onMessage(ctx: AgentContext, message: Message): Promise<void>
```

## 消息格式

### 标准消息

```typescript
interface Message {
  id: string;           // 消息 ID（UUID）
  to: string;           // 目标智能体 ID
  from: string;         // 发送者智能体 ID
  taskId?: string;      // 任务 ID
  payload: {            // 消息载荷
    text?: string;      // 文本内容
    [key: string]: any; // 其他数据
  };
}
```

### 入口智能体通知

Root 创建入口智能体后发送给用户的通知：

```javascript
{
  to: "user",
  from: "root",
  taskId: "task-uuid",
  payload: {
    agentId: "entry-agent-id"
  }
}
```

### 文本回复

智能体发送给用户的文本回复：

```javascript
{
  to: "user",
  from: "agent-id",
  taskId: "task-uuid",
  payload: {
    text: "回复内容"
  }
}
```

## 工件格式

### 工件结构

```typescript
interface Artifact {
  id: string;           // 工件 ID（UUID）
  type: string;         // 工件类型
  content: any;         // 工件内容
  meta?: {              // 元数据
    [key: string]: any;
  };
  createdAt: string;    // 创建时间（ISO 8601）
}
```

### 工件引用

```typescript
type ArtifactRef = string;  // 格式: "artifact:<uuid>"
```

### 示例

```javascript
// 写入工件
const ref = await ctx.tools.putArtifact({
  type: "document",
  content: { title: "报告", body: "内容..." },
  meta: { author: "agent-xxx" }
});
// ref = "artifact:abc-123-..."

// 读取工件
const artifact = await ctx.tools.getArtifact(ref);
// artifact = { id, type, content, meta, createdAt }
```

## Task Brief 格式

创建子智能体时必须提供的任务委托书：

```typescript
interface TaskBrief {
  // 必填字段
  objective: string;           // 目标描述
  constraints: string[];       // 技术约束数组
  inputs: string;              // 输入说明
  outputs: string;             // 输出要求
  completion_criteria: string; // 完成标准
  
  // 可选字段
  collaborators?: Array<{      // 协作联系人
    agentId: string;
    role: string;
    description?: string;
  }>;
  references?: string[];       // 参考资料
  priority?: string;           // 优先级
}
```

### 示例

```javascript
await ctx.tools.spawnAgent({
  roleId: "programmer-role-id",
  taskBrief: {
    objective: "实现计算器的核心运算模块",
    constraints: [
      "使用 JavaScript 实现",
      "纯前端代码，无后端依赖",
      "支持四则运算"
    ],
    inputs: "两个数字和一个运算符",
    outputs: "运算结果",
    completion_criteria: "所有四则运算测试通过"
  }
});
```
