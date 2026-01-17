# HTTP 服务 (http/)

## 概述

HTTP 服务负责 HTTP 服务器和客户端功能。

## 模块列表

### http_server.js
- **职责**：HTTP 服务器
- **功能**：
  - 启动 HTTP 服务器
  - 处理 API 请求
  - 提供静态文件服务
  - WebSocket 支持（可选）
  - 请求路由和中间件

### http_client.js
- **职责**：HTTP 客户端
- **功能**：
  - 发送 HTTP 请求
  - 请求重试
  - 超时控制
  - 错误处理

## 依赖关系

- http_server.js 依赖 Runtime 和各种服务
- http_client.js 相对独立

## 注意事项

- HTTP 服务器应该有完善的错误处理
- HTTP 客户端应该支持重试和超时
- 应该支持 CORS 和安全头
