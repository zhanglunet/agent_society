# HTTP 服务模块

## 概述

HTTP 服务模块提供 HTTP 服务器和客户端功能，支持 Web UI 和智能体的 HTTP 访问能力。

## 模块职责

### http_server.js
- **职责**：HTTP 服务器，提供 Web UI 和 API 接口
- **主要功能**：
  - 启动 HTTP 服务器
  - 提供静态文件服务
  - 提供 API 接口（需求提交、工件查询、智能体状态等）
  - SSE（Server-Sent Events）支持
  - 请求日志记录

### http_client.js
- **职责**：HTTP 客户端，为智能体提供 HTTPS 访问能力
- **主要功能**：
  - 发送 HTTP/HTTPS 请求
  - 请求和响应日志记录
  - 错误处理

## 使用示例

### 创建 HTTP 服务器

```javascript
import { HttpServer } from "./services/http/http_server.js";

const server = new HttpServer({
  port: 3000,
  staticDir: "web",
  runtime: myRuntime,
  logger: myLogger
});

await server.start();
console.log("HTTP 服务器已启动: http://localhost:3000");
```

### 使用 HTTP 客户端

```javascript
import { HttpClient } from "./services/http/http_client.js";

const client = new HttpClient({
  logger: myLogger
});

// 发送 GET 请求
const response = await client.request({
  url: "https://api.example.com/data",
  method: "GET",
  headers: {
    "User-Agent": "Agent-Society/1.0"
  }
});

if (response.error) {
  console.error(`请求失败: ${response.error}`);
} else {
  console.log(`状态码: ${response.statusCode}`);
  console.log(`响应体: ${response.body}`);
}

// 发送 POST 请求
const postResponse = await client.request({
  url: "https://api.example.com/submit",
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ key: "value" })
});
```

## API 接口

### POST /api/submit
提交用户需求

**请求体**：
```json
{
  "requirement": "用户需求文本",
  "workspacePath": "/path/to/workspace" // 可选
}
```

**响应**：
```json
{
  "ok": true,
  "taskId": "task-123"
}
```

### GET /api/artifacts
查询工件列表

**查询参数**：
- `messageId`: 消息 ID（可选）
- `type`: 工件类型（可选）

**响应**：
```json
{
  "artifacts": [
    {
      "id": "artifact-123",
      "type": "text",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

### GET /api/artifact/:id
获取工件内容

**响应**：
```json
{
  "id": "artifact-123",
  "type": "text",
  "content": "工件内容",
  "meta": {}
}
```

### GET /api/agents
获取智能体列表

**响应**：
```json
{
  "agents": [
    {
      "id": "agent-123",
      "roleName": "开发者",
      "status": "active"
    }
  ]
}
```

### GET /api/events
SSE 事件流，实时推送系统事件

**事件类型**：
- `message`: 消息事件
- `agent_created`: 智能体创建事件
- `agent_terminated`: 智能体终止事件
- `artifact_created`: 工件创建事件

## 注意事项

1. **静态文件服务**：HTTP 服务器会自动提供 `staticDir` 目录下的静态文件
2. **CORS 支持**：服务器默认启用 CORS，允许跨域访问
3. **日志记录**：所有 HTTP 请求和响应都会被记录到日志
4. **错误处理**：HTTP 客户端会捕获所有错误并返回错误信息
5. **SSE 连接**：SSE 连接会在客户端断开时自动清理
