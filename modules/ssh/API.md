# SSH模块 API文档

## 概述

SSH模块为Agent Society提供远程服务器连接、交互式Shell会话和文件传输功能。所有功能通过工具接口暴露给智能体使用。

## 工具列表

### 连接管理工具

#### ssh_list_hosts
列出配置文件中所有可用的SSH主机。

**参数**：无

**返回**：
```json
{
  "hosts": [
    {
      "name": "server1",
      "description": "生产服务器"
    }
  ]
}
```

**错误码**：
- `config_not_found`: 配置文件不存在
- `config_parse_error`: 配置文件格式错误

---

#### ssh_connect
连接到指定的SSH主机。

**参数**：
- `hostName` (string, 必需): 主机名称（在配置文件中定义）

**返回**：
```json
{
  "connectionId": "conn_abc123",
  "host": "192.168.1.100",
  "port": 22,
  "username": "user"
}
```

**错误码**：
- `host_not_found`: 主机配置不存在
- `connection_failed`: 连接失败
- `auth_failed`: 认证失败
- `timeout`: 连接超时

---

#### ssh_disconnect
断开指定的SSH连接。

**参数**：
- `connectionId` (string, 必需): 连接ID

**返回**：
```json
{
  "success": true,
  "message": "连接已断开"
}
```

**错误码**：
- `connection_not_found`: 连接不存在

---

#### ssh_list_connections
列出所有活动的SSH连接。

**参数**：无

**返回**：
```json
{
  "connections": [
    {
      "connectionId": "conn_abc123",
      "host": "192.168.1.100",
      "port": 22,
      "username": "user",
      "status": "connected",
      "connectedAt": "2024-01-20T10:30:00.000Z"
    }
  ]
}
```

---

### Shell会话工具

#### ssh_shell_create
在指定连接上创建交互式Shell会话。

**参数**：
- `connectionId` (string, 必需): 连接ID

**返回**：
```json
{
  "shellId": "shell_xyz789",
  "outputFile": "/path/to/output.txt",
  "message": "Shell会话已创建"
}
```

**错误码**：
- `connection_not_found`: 连接不存在
- `shell_creation_failed`: Shell创建失败

**说明**：
- Shell输出会实时写入到outputFile
- 使用ssh_shell_read读取输出内容

---

#### ssh_shell_send
向Shell会话发送命令（异步）。

**参数**：
- `shellId` (string, 必需): Shell会话ID
- `command` (string, 必需): 要执行的命令

**返回**：
```json
{
  "success": true,
  "message": "命令已发送"
}
```

**错误码**：
- `shell_not_found`: Shell会话不存在
- `shell_closed`: Shell会话已关闭

**说明**：
- 命令立即返回，不等待执行完成
- 使用ssh_shell_read读取命令输出

---

#### ssh_shell_read
读取Shell会话的输出（窗口模式）。

**参数**：
- `shellId` (string, 必需): Shell会话ID
- `offset` (number, 可选): 读取起始位置，默认0
- `length` (number, 可选): 读取长度，默认5000字符

**返回**：
```json
{
  "content": "命令输出内容...",
  "offset": 0,
  "length": 1234,
  "totalSize": 5678,
  "hasMore": true
}
```

**错误码**：
- `shell_not_found`: Shell会话不存在
- `read_failed`: 读取失败

**说明**：
- 支持从任意位置读取指定长度的输出
- hasMore表示是否还有更多内容
- 建议每次读取5000字符以内

---

#### ssh_shell_close
关闭Shell会话。

**参数**：
- `shellId` (string, 必需): Shell会话ID

**返回**：
```json
{
  "success": true,
  "message": "Shell会话已关闭"
}
```

**错误码**：
- `shell_not_found`: Shell会话不存在

---

### 文件传输工具

#### ssh_upload
上传文件到远程服务器（异步）。

**参数**：
- `connectionId` (string, 必需): 连接ID
- `localPath` (string, 必需): 本地文件路径
- `remotePath` (string, 必需): 远程文件路径

**返回**：
```json
{
  "taskId": "task_upload_123",
  "fileSize": 1048576,
  "message": "上传任务已创建"
}
```

**错误码**：
- `connection_not_found`: 连接不存在
- `file_not_found`: 本地文件不存在
- `sftp_failed`: SFTP会话创建失败

**说明**：
- 上传立即返回taskId
- 使用ssh_transfer_status查询进度

---

#### ssh_download
从远程服务器下载文件（异步）。

**参数**：
- `connectionId` (string, 必需): 连接ID
- `remotePath` (string, 必需): 远程文件路径
- `localPath` (string, 必需): 本地文件路径

**返回**：
```json
{
  "taskId": "task_download_456",
  "fileSize": 2097152,
  "message": "下载任务已创建"
}
```

**错误码**：
- `connection_not_found`: 连接不存在
- `file_not_found`: 远程文件不存在
- `sftp_failed`: SFTP会话创建失败

**说明**：
- 下载立即返回taskId
- 使用ssh_transfer_status查询进度

---

#### ssh_transfer_status
查询文件传输任务状态。

**参数**：
- `taskId` (string, 必需): 任务ID

**返回**：
```json
{
  "taskId": "task_upload_123",
  "type": "upload",
  "status": "in_progress",
  "transferred": 524288,
  "total": 1048576,
  "progress": 50.0,
  "startTime": "2024-01-20T10:30:00.000Z",
  "error": null
}
```

**状态值**：
- `pending`: 等待开始
- `in_progress`: 传输中
- `completed`: 已完成
- `failed`: 失败
- `cancelled`: 已取消

**错误码**：
- `task_not_found`: 任务不存在

---

#### ssh_transfer_cancel
取消文件传输任务。

**参数**：
- `taskId` (string, 必需): 任务ID

**返回**：
```json
{
  "success": true,
  "message": "传输任务已取消"
}
```

**错误码**：
- `task_not_found`: 任务不存在
- `task_completed`: 任务已完成，无法取消

---

## 配置文件格式

SSH模块使用JSON格式的配置文件，位于 `modules/ssh/config.local.json`。

### 配置示例

```json
{
  "hosts": [
    {
      "name": "server1",
      "description": "生产服务器",
      "host": "192.168.1.100",
      "port": 22,
      "username": "admin",
      "password": "secret123"
    },
    {
      "name": "server2",
      "description": "测试服务器",
      "host": "test.example.com",
      "port": 2222,
      "username": "testuser",
      "privateKey": "/path/to/private/key",
      "passphrase": "key_password"
    }
  ],
  "options": {
    "connectionTimeout": 30000,
    "keepaliveInterval": 10000,
    "idleTimeout": 300000
  }
}
```

### 配置字段说明

#### hosts数组
每个主机配置包含以下字段：

- `name` (string, 必需): 主机名称，用于工具调用时引用
- `description` (string, 可选): 主机描述
- `host` (string, 必需): 主机地址（IP或域名）
- `port` (number, 可选): SSH端口，默认22
- `username` (string, 必需): 登录用户名
- `password` (string, 可选): 密码认证
- `privateKey` (string, 可选): 私钥文件路径
- `passphrase` (string, 可选): 私钥密码

**认证方式**：
- 密码认证：提供password字段
- 密钥认证：提供privateKey字段（可选passphrase）
- 优先使用密钥认证

#### options对象
全局选项配置：

- `connectionTimeout` (number, 可选): 连接超时时间（毫秒），默认30000
- `keepaliveInterval` (number, 可选): 保活间隔（毫秒），默认10000
- `idleTimeout` (number, 可选): 空闲超时（毫秒），默认300000

---

## 使用示例

### 示例1：连接并执行命令

```javascript
// 1. 列出可用主机
const hosts = await executeToolCall('ssh_list_hosts', {});

// 2. 连接到服务器
const conn = await executeToolCall('ssh_connect', {
  hostName: 'server1'
});

// 3. 创建Shell会话
const shell = await executeToolCall('ssh_shell_create', {
  connectionId: conn.connectionId
});

// 4. 发送命令
await executeToolCall('ssh_shell_send', {
  shellId: shell.shellId,
  command: 'ls -la\n'
});

// 5. 等待并读取输出
await new Promise(resolve => setTimeout(resolve, 1000));
const output = await executeToolCall('ssh_shell_read', {
  shellId: shell.shellId,
  offset: 0
});

console.log(output.content);

// 6. 关闭Shell
await executeToolCall('ssh_shell_close', {
  shellId: shell.shellId
});

// 7. 断开连接
await executeToolCall('ssh_disconnect', {
  connectionId: conn.connectionId
});
```

### 示例2：文件传输

```javascript
// 1. 连接到服务器
const conn = await executeToolCall('ssh_connect', {
  hostName: 'server1'
});

// 2. 上传文件
const upload = await executeToolCall('ssh_upload', {
  connectionId: conn.connectionId,
  localPath: './local/file.txt',
  remotePath: '/remote/path/file.txt'
});

// 3. 轮询传输状态
let status;
do {
  await new Promise(resolve => setTimeout(resolve, 1000));
  status = await executeToolCall('ssh_transfer_status', {
    taskId: upload.taskId
  });
  console.log(`进度: ${status.progress}%`);
} while (status.status === 'in_progress');

if (status.status === 'completed') {
  console.log('上传完成');
} else {
  console.error('上传失败:', status.error);
}

// 4. 断开连接
await executeToolCall('ssh_disconnect', {
  connectionId: conn.connectionId
});
```

### 示例3：多连接并发

```javascript
// 同时连接多个服务器
const connections = await Promise.all([
  executeToolCall('ssh_connect', { hostName: 'server1' }),
  executeToolCall('ssh_connect', { hostName: 'server2' }),
  executeToolCall('ssh_connect', { hostName: 'server3' })
]);

// 在每个连接上执行命令
const results = await Promise.all(
  connections.map(async (conn) => {
    const shell = await executeToolCall('ssh_shell_create', {
      connectionId: conn.connectionId
    });
    
    await executeToolCall('ssh_shell_send', {
      shellId: shell.shellId,
      command: 'hostname\n'
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const output = await executeToolCall('ssh_shell_read', {
      shellId: shell.shellId
    });
    
    await executeToolCall('ssh_shell_close', {
      shellId: shell.shellId
    });
    
    return output.content;
  })
);

// 断开所有连接
await Promise.all(
  connections.map(conn =>
    executeToolCall('ssh_disconnect', {
      connectionId: conn.connectionId
    })
  )
);
```

---

## 错误处理

所有工具调用失败时会抛出错误对象，包含以下字段：

```javascript
{
  code: 'error_code',        // 错误码
  message: '错误描述',        // 用户友好的错误信息
  details: { ... }           // 详细错误信息（可选）
}
```

### 常见错误码

| 错误码 | 说明 | 处理建议 |
|--------|------|----------|
| `config_not_found` | 配置文件不存在 | 创建配置文件 |
| `config_parse_error` | 配置文件格式错误 | 检查JSON格式 |
| `host_not_found` | 主机配置不存在 | 检查主机名称 |
| `connection_failed` | 连接失败 | 检查网络和主机地址 |
| `auth_failed` | 认证失败 | 检查用户名和密码/密钥 |
| `timeout` | 操作超时 | 增加超时时间或检查网络 |
| `connection_not_found` | 连接不存在 | 先调用ssh_connect |
| `shell_not_found` | Shell会话不存在 | 先调用ssh_shell_create |
| `shell_closed` | Shell会话已关闭 | 重新创建Shell会话 |
| `task_not_found` | 传输任务不存在 | 检查taskId |
| `file_not_found` | 文件不存在 | 检查文件路径 |
| `sftp_failed` | SFTP会话创建失败 | 检查连接状态 |

---

## 最佳实践

### 1. 连接管理
- 使用完连接后及时断开，避免资源泄漏
- 对于长时间运行的任务，定期检查连接状态
- 使用ssh_list_connections监控活动连接

### 2. Shell会话
- 发送命令后等待适当时间再读取输出
- 使用窗口模式读取大量输出，避免一次性读取
- 命令结束后添加换行符（\n）
- 关闭不再使用的Shell会话

### 3. 文件传输
- 大文件传输使用异步模式，定期查询进度
- 传输失败时检查error字段获取详细信息
- 支持取消长时间运行的传输任务
- 传输完成后验证文件完整性

### 4. 错误处理
- 捕获所有工具调用的错误
- 根据错误码采取相应的处理措施
- 记录详细的错误日志便于排查问题

### 5. 性能优化
- 复用连接，避免频繁建立和断开
- 并发执行独立的操作
- 合理设置超时时间
- 定期清理不再使用的资源

---

## 技术限制

1. **并发限制**：每个连接同时只能有一个活动的Shell会话
2. **文件大小**：建议单个文件不超过1GB
3. **输出缓冲**：Shell输出文件会持续增长，需要定期清理
4. **连接数量**：建议同时保持的连接数不超过10个
5. **超时设置**：默认连接超时30秒，可在配置中调整

---

## 版本历史

### v1.0.0 (2024-01-20)
- 初始版本发布
- 支持SSH连接管理
- 支持交互式Shell会话
- 支持异步文件传输
- 支持多连接并发

---

## 相关文档

- [模块说明](./ssh.md)
- [使用指南](./README.md)
- [配置模板](./config.template.json)
- [变更日志](./CHANGELOG.md)
