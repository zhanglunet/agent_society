# 工具参考

本文档详细介绍 Agent Society 中智能体可用的工具。

## 目录

- [组织管理工具](#组织管理工具)
- [消息通信工具](#消息通信工具)
- [工件管理工具](#工件管理工具)
- [文件操作工具](#文件操作工具)
- [命令执行工具](#命令执行工具)
- [网络请求工具](#网络请求工具)
- [上下文管理工具](#上下文管理工具)
- [辅助工具](#辅助工具)

## 组织管理工具

### find_role_by_name

按岗位名查找岗位。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 岗位名称 |

**返回值：**

```javascript
// 找到时
{
  id: "role-uuid",
  name: "岗位名称",
  rolePrompt: "岗位提示词...",
  createdBy: "creator-agent-id",
  createdAt: "2026-01-06T..."
}

// 未找到时
null
```

### create_role

创建新岗位。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 岗位名称 |
| `rolePrompt` | `string` | 是 | 岗位提示词 |

**说明：**
- 如果同名岗位已存在，返回已有岗位（不重复创建）
- 系统会自动根据 `rolePrompt` 分析岗位需求，并从配置的 LLM 服务中选择最合适的一个绑定到该岗位（如为"程序员"绑定擅长 Coding 的模型）

### spawn_agent

在指定岗位上创建智能体实例。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `roleId` | `string` | 是 | 岗位 ID |
| `taskBrief` | `object` | 是 | 任务委托书 |

**Task Brief 结构：**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `objective` | `string` | 是 | 目标描述 |
| `constraints` | `string[]` | 是 | 技术约束数组 |
| `inputs` | `string` | 是 | 输入说明 |
| `outputs` | `string` | 是 | 输出要求 |
| `completion_criteria` | `string` | 是 | 完成标准 |
| `collaborators` | `array` | 否 | 协作联系人 |
| `references` | `string[]` | 否 | 参考资料 |
| `priority` | `string` | 否 | 优先级 |

**返回值：**

```javascript
{
  id: "agent-uuid",
  roleId: "role-uuid",
  roleName: "岗位名称"
}
```

### spawn_agent_with_task

创建智能体实例并立即发送任务消息（`spawn_agent` + `send_message` 的原子操作）。推荐在需要立即分配任务时使用，可节省一次工具调用。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `roleId` | `string` | 是 | 岗位 ID |
| `taskBrief` | `object` | 是 | 任务委托书（同 spawn_agent） |
| `initialMessage` | `object` | 是 | 初始任务消息内容 (payload) |

**返回值：**

```javascript
{
  id: "agent-uuid",
  roleId: "role-uuid",
  roleName: "岗位名称",
  messageId: "msg-uuid"
}
```

### terminate_agent

终止子智能体实例。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agentId` | `string` | 是 | 要终止的智能体 ID |
| `reason` | `string` | 否 | 终止原因 |

**约束：**
- 只能终止自己创建的子智能体

## 消息通信工具

### send_message

发送异步消息。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `to` | `string` | 是 | 目标智能体 ID |
| `payload` | `object` | 是 | 消息载荷 |

**说明：**
- `from` 自动设置为当前智能体 ID
- `taskId` 自动继承当前消息的 taskId
- 推荐在 `payload` 中包含 `message_type` 字段（如 `task_assignment`, `status_update`, `task_result`）

## 工件管理工具

### put_artifact

写入工件。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | 是 | 工件类型 |
| `content` | `any` | 是 | 工件内容 |
| `meta` | `object` | 否 | 元数据 |

**返回值：** `artifact:uuid` (工件引用)

### get_artifact

读取工件。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ref` | `string` | 是 | 工件引用 |

## 文件操作工具

### read_file

读取工作空间内的文件。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 文件相对路径 |

### write_file

在工作空间内创建或修改文件。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 文件相对路径 |
| `content` | `string` | 是 | 文件内容 |

### list_files

列出工作空间内的文件和目录。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 否 | 目录相对路径，默认根目录 |

### get_workspace_info

获取工作空间状态信息（文件数、大小等）。

**参数：** 无

## 命令执行工具

### run_command

在工作空间内执行终端命令。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | `string` | 是 | 要执行的命令 |
| `timeoutMs` | `number` | 否 | 超时时间（毫秒），默认 60000 |

**安全限制：** 危险命令会被拦截（如 `sudo`, `rm -rf /` 等）。

## 网络请求工具

### http_request

发起 HTTPS 请求访问外部 API 或网页。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 请求 URL (必须 HTTPS) |
| `method` | `string` | 否 | GET, POST, PUT, DELETE 等 (默认 GET) |
| `headers` | `object` | 否 | 请求头 |
| `body` | `any` | 否 | 请求体 (对象会自动 JSON 序列化) |
| `timeoutMs` | `number` | 否 | 超时时间 (默认 30000) |

**返回值：**

```javascript
{
  ok: true,
  status: 200,
  headers: { ... },
  body: "响应内容",
  latencyMs: 120
}
```

## 上下文管理工具

### get_context_status

查询当前智能体的上下文使用状态。

**参数：** 无

**返回值：**

```javascript
{
  usedTokens: 5000,
  maxTokens: 12000,
  usagePercent: 0.41,
  status: "normal" // normal | warning | critical | exceeded
}
```

### compress_context

【强制要求】压缩会话历史，保留系统提示词、最近消息和指定的重要内容摘要。当上下文使用率达到警告阈值(70%)或更高时**必须**调用。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `summary` | `string` | 是 | 对被压缩历史的重要内容摘要 |
| `keepRecentCount` | `number` | 否 | 保留最近多少条消息 (默认 10) |

**返回值：**

```javascript
{
  ok: true,
  compressed: true,
  originalCount: 50,
  newCount: 12
}
```

## 辅助工具

### console_print

向控制台输出文本。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 输出文本 |

### run_javascript

运行 JavaScript 代码（沙箱环境）。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | `string` | 是 | JavaScript 代码（函数体形式） |
| `input` | `any` | 否 | 传入代码的输入数据 |

**特性：**
- 每次调用都是全新环境，无状态
- 不支持 `require`, `fs`, `process` 等系统 API
- 必须显式 `return` 结果
- 适合纯计算、数据转换、复杂逻辑判断

**示例：**

```javascript
run_javascript({
  code: `
    const dates = input.dates.map(d => new Date(d));
    const maxDate = new Date(Math.max.apply(null, dates));
    return maxDate.toISOString();
  `,
  input: { dates: ["2023-01-01", "2024-01-01"] }
});
```
