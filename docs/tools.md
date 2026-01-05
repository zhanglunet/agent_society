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

**示例：**

```javascript
const role = find_role_by_name({ name: "程序员" });
if (role) {
  console.log(`找到岗位: ${role.id}`);
}
```

### create_role

创建新岗位。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | `string` | 是 | 岗位名称 |
| `rolePrompt` | `string` | 是 | 岗位提示词 |

**返回值：**

```javascript
{
  id: "role-uuid",
  name: "岗位名称",
  rolePrompt: "岗位提示词...",
  createdBy: "creator-agent-id",
  createdAt: "2026-01-06T..."
}
```

**说明：**
- 如果同名岗位已存在，返回已有岗位（不重复创建）
- `createdBy` 自动设置为调用者智能体 ID

**示例：**

```javascript
const role = create_role({
  name: "程序员",
  rolePrompt: `
你是一名程序员，负责编写代码。

职责：
1. 根据需求编写代码
2. 测试代码功能
3. 向上级汇报完成情况

约束：
- 代码必须符合规范
- 单个文件不超过 500 行
  `.trim()
});
```

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
// 成功
{
  id: "agent-uuid",
  roleId: "role-uuid",
  roleName: "岗位名称"
}

// 失败
{
  error: "错误类型",
  // 可能包含其他错误信息
}
```

**约束：**
- 只能在自己创建的子岗位上创建智能体
- `parentAgentId` 由系统自动填充
- Root 对每个 taskId 只能创建一个直属子智能体

**示例：**

```javascript
const agent = spawn_agent({
  roleId: "role-xxx",
  taskBrief: {
    objective: "实现用户登录功能",
    constraints: [
      "使用 JavaScript",
      "前端实现",
      "支持邮箱和手机号登录"
    ],
    inputs: "用户输入的账号和密码",
    outputs: "登录结果（成功/失败）",
    completion_criteria: "登录功能可正常使用，包含错误处理"
  }
});
```

### terminate_agent

终止子智能体实例。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `agentId` | `string` | 是 | 要终止的智能体 ID |
| `reason` | `string` | 否 | 终止原因 |

**返回值：**

```javascript
// 成功
{ ok: true }

// 失败
{ error: "错误信息" }
```

**约束：**
- 只能终止自己创建的子智能体

**示例：**

```javascript
terminate_agent({
  agentId: "agent-xxx",
  reason: "任务已完成"
});
```

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

**示例：**

```javascript
// 发送文本消息给用户
send_message({
  to: "user",
  payload: { text: "任务已完成" }
});

// 发送结构化消息给其他智能体
send_message({
  to: "agent-xxx",
  payload: {
    type: "task_result",
    status: "success",
    artifactRef: "artifact:xxx"
  }
});
```

### wait_for_message

进入等待状态，等待下一条消息。

**参数：** 无

**说明：**
- 结束当前消息的处理
- 等待下一条消息到达后继续

**示例：**

```javascript
// 发送问题后等待回复
send_message({
  to: "user",
  payload: { text: "请确认是否继续？" }
});
wait_for_message();
```

## 工件管理工具

### put_artifact

写入工件。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | `string` | 是 | 工件类型 |
| `content` | `any` | 是 | 工件内容 |
| `meta` | `object` | 否 | 元数据 |

**返回值：**

```javascript
"artifact:uuid"  // 工件引用
```

**示例：**

```javascript
// 保存文档
const ref = put_artifact({
  type: "document",
  content: {
    title: "设计文档",
    body: "详细内容..."
  },
  meta: {
    author: "architect-agent",
    version: "1.0"
  }
});

// 保存代码
const codeRef = put_artifact({
  type: "code",
  content: "function add(a, b) { return a + b; }",
  meta: {
    language: "javascript",
    filename: "math.js"
  }
});
```

### get_artifact

读取工件。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ref` | `string` | 是 | 工件引用 |

**返回值：**

```javascript
{
  id: "uuid",
  type: "document",
  content: { ... },
  meta: { ... },
  createdAt: "2026-01-06T..."
}
```

**示例：**

```javascript
const artifact = get_artifact({ ref: "artifact:xxx" });
console.log(artifact.content);
```

## 文件操作工具

### read_file

读取工作空间内的文件。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 文件相对路径 |

**返回值：**

```javascript
// 成功
{
  ok: true,
  content: "文件内容..."
}

// 失败
{
  ok: false,
  error: "错误信息"
}
```

**示例：**

```javascript
const result = read_file({ path: "src/index.js" });
if (result.ok) {
  console.log(result.content);
}
```

### write_file

在工作空间内创建或修改文件。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 是 | 文件相对路径 |
| `content` | `string` | 是 | 文件内容 |

**返回值：**

```javascript
// 成功
{ ok: true }

// 失败
{
  ok: false,
  error: "错误信息"
}
```

**示例：**

```javascript
write_file({
  path: "src/calculator.js",
  content: `
function add(a, b) {
  return a + b;
}

module.exports = { add };
  `.trim()
});
```

### list_files

列出工作空间内的文件和目录。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `path` | `string` | 否 | 目录相对路径，默认根目录 |

**返回值：**

```javascript
{
  ok: true,
  entries: [
    { name: "src", type: "directory" },
    { name: "package.json", type: "file" },
    // ...
  ]
}
```

**示例：**

```javascript
const result = list_files({ path: "src" });
result.entries.forEach(e => {
  console.log(`${e.type}: ${e.name}`);
});
```

### get_workspace_info

获取工作空间状态信息。

**参数：** 无

**返回值：**

```javascript
{
  ok: true,
  info: {
    fileCount: 10,
    directoryCount: 3,
    totalSize: 12345,
    lastModified: "2026-01-06T..."
  }
}
```

## 命令执行工具

### run_command

在工作空间内执行终端命令。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `command` | `string` | 是 | 要执行的命令 |
| `timeoutMs` | `number` | 否 | 超时时间（毫秒），默认 60000 |

**返回值：**

```javascript
// 成功
{
  ok: true,
  stdout: "命令输出...",
  stderr: "",
  exitCode: 0
}

// 失败
{
  ok: false,
  error: "错误信息"
}
```

**安全限制：**
- 危险命令会被拦截（如 `sudo`、`rm -rf /` 等）
- 命令在工作空间目录下执行

**示例：**

```javascript
// 运行测试
const result = run_command({ command: "npm test" });

// 安装依赖
run_command({ command: "npm install", timeoutMs: 120000 });
```

## 网络请求工具

### http_request

发起 HTTPS 请求。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 请求 URL（必须 HTTPS） |
| `method` | `string` | 否 | HTTP 方法，默认 GET |
| `headers` | `object` | 否 | 请求头 |
| `body` | `any` | 否 | 请求体 |
| `timeoutMs` | `number` | 否 | 超时时间，默认 30000 |

**返回值：**

```javascript
{
  ok: true,
  status: 200,
  headers: { ... },
  body: "响应内容"
}
```

**示例：**

```javascript
// GET 请求
const result = http_request({
  url: "https://api.example.com/data"
});

// POST 请求
http_request({
  url: "https://api.example.com/submit",
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: { name: "test" }
});
```

## 上下文管理工具

### get_context_status

查询当前上下文使用状态。

**参数：** 无

**返回值：**

```javascript
{
  usedTokens: 5000,
  maxTokens: 12000,
  usagePercent: 41.67,
  status: "normal"  // normal | warning | critical | exceeded
}
```

### compress_context

压缩会话历史。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `summary` | `string` | 是 | 被压缩历史的摘要 |
| `keepRecentCount` | `number` | 否 | 保留最近消息数，默认 10 |

**返回值：**

```javascript
{
  ok: true,
  compressedCount: 25,
  remainingCount: 10
}
```

**示例：**

```javascript
// 检查上下文状态
const status = get_context_status();
if (status.status === "warning" || status.status === "critical") {
  // 压缩上下文
  compress_context({
    summary: "之前讨论了用户登录功能的设计，确定使用 JWT 认证方案",
    keepRecentCount: 5
  });
}
```

## 辅助工具

### console_print

向控制台输出文本。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 输出文本 |

**示例：**

```javascript
console_print({ text: "处理进度: 50%" });
```

### run_javascript

运行 JavaScript 代码。

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | `string` | 是 | JavaScript 代码（函数体形式） |
| `input` | `any` | 否 | 传入代码的输入数据 |

**说明：**
- 代码在隔离环境中执行
- 需要显式 `return` 返回值
- 不提供文件系统、网络等能力
- 适合精确计算、数据处理

**示例：**

```javascript
// 数学计算
const result = run_javascript({
  code: "return input.a + input.b",
  input: { a: 123, b: 456 }
});
// result = 579

// 日期处理
run_javascript({
  code: `
    const date = new Date(input.timestamp);
    return date.toISOString();
  `,
  input: { timestamp: 1704499200000 }
});

// 数据转换
run_javascript({
  code: `
    return input.items
      .filter(x => x.active)
      .map(x => x.name);
  `,
  input: {
    items: [
      { name: "A", active: true },
      { name: "B", active: false },
      { name: "C", active: true }
    ]
  }
});
// result = ["A", "C"]
```
