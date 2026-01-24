# SSH模块使用说明

## 概述

SSH模块为agent society系统提供SSH远程操作能力。

## 快速开始

### 1. 配置主机

复制 `config.template.json` 为 `ssh-config.json` 并修改配置：

```bash
cp modules/ssh/config.template.json config/ssh-config.json
```

编辑配置文件，添加你的SSH主机信息。详细配置说明请参考 [CONFIG.md](CONFIG.md)。

**配置示例：**

```json
{
  "maxConnections": 10,
  "connectionTimeout": 30000,
  "hosts": {
    "my-server": {
      "description": "我的服务器",
      "host": "192.168.1.100",
      "port": 22,
      "username": "root",
      "password": "password123"
    }
  }
}
```

**安全提示：** 配置文件包含敏感信息，请妥善保管。

### 2. 使用工具

#### 连接管理

```javascript
// 列出可用主机
ssh_list_hosts()

// 建立连接
ssh_connect({ hostName: "my-server" })

// 列出活动连接
ssh_list_connections()

// 断开连接
ssh_disconnect({ connectionId: "conn_xxx" })
```

#### 交互式会话

```javascript
// 创建shell会话
ssh_shell_create({ connectionId: "conn_xxx" })

// 发送命令（异步）
ssh_shell_send({ shellId: "shell_xxx", command: "ls -la\n" })

// 读取输出（从偏移0开始）
ssh_shell_read({ shellId: "shell_xxx", offset: 0 })

// 关闭会话
ssh_shell_close({ shellId: "shell_xxx" })
```

#### 文件传输

```javascript
// 上传文件（异步）
ssh_upload({ 
  connectionId: "conn_xxx", 
  artifactId: "artifact_xxx", 
  remotePath: "/tmp/file.txt" 
})

// 下载文件（异步）
ssh_download({ 
  connectionId: "conn_xxx", 
  remotePath: "/tmp/file.txt",
  fileName: "downloaded_file.txt"
})

// 查询传输状态
ssh_transfer_status({ taskId: "task_xxx" })

// 取消传输
ssh_transfer_cancel({ taskId: "task_xxx" })
```

## 工作流程示例

### 执行远程命令并查看输出

```javascript
// 1. 连接服务器
const conn = await ssh_connect({ hostName: "my-server" });

// 2. 创建shell会话
const shell = await ssh_shell_create({ connectionId: conn.connectionId });

// 3. 发送命令
await ssh_shell_send({ shellId: shell.shellId, command: "pwd\n" });

// 4. 等待一段时间让命令执行
await sleep(1000);

// 5. 读取输出
const output = await ssh_shell_read({ shellId: shell.shellId, offset: 0 });
console.log(output.output);

// 6. 关闭会话
await ssh_shell_close({ shellId: shell.shellId });

// 7. 断开连接
await ssh_disconnect({ connectionId: conn.connectionId });
```

### 上传文件并监控进度

```javascript
// 1. 连接服务器
const conn = await ssh_connect({ hostName: "my-server" });

// 2. 启动上传
const task = await ssh_upload({
  connectionId: conn.connectionId,
  artifactId: "my_artifact",
  remotePath: "/tmp/upload.txt"
});

// 3. 轮询查询进度
while (true) {
  const status = await ssh_transfer_status({ taskId: task.taskId });
  console.log(`进度: ${status.progress}%`);
  
  if (status.status === 'completed') {
    console.log('上传完成');
    break;
  } else if (status.status === 'failed') {
    console.log('上传失败:', status.result.error);
    break;
  }
  
  await sleep(1000);
}

// 4. 断开连接
await ssh_disconnect({ connectionId: conn.connectionId });
```

## 注意事项

1. **主机名称**: 智能体使用主机名称（如"my-server"）连接，无需知道IP地址和认证信息
2. **异步操作**: shell命令发送和文件传输都是异步的，需要轮询查询结果
3. **窗口读取**: shell输出通过窗口读取，每次最多5000字符，需要管理偏移位置
4. **资源清理**: 使用完毕后记得关闭会话和断开连接

## 错误处理

所有工具调用失败时返回错误对象：

```javascript
{
  error: "error_type",
  message: "错误描述"
}
```

常见错误类型：
- `connection_not_found`: 连接不存在
- `connection_closed`: 连接已关闭
- `shell_not_found`: Shell会话不存在
- `shell_closed`: Shell会话已关闭
- `invalid_host_name`: 主机名称无效

## 开发状态

✅ 核心功能已完成：
- 连接管理（列出主机、建立连接、断开连接、列出连接）
- Shell会话管理（创建会话、发送命令、读取输出、关闭会话）
- 文件传输（上传、下载、查询状态、取消任务）

⚠️ 待完善：
- 单元测试
- 集成测试
- 性能优化
- 文档完善

## 测试

运行测试：

```bash
# 连接测试
bun test/ssh/test_connect.js

# 综合功能测试
bun test/ssh/test_all_features.js
```

注意：测试需要真实的SSH服务器才能完整运行。

