# SSH模块设计文档

## 1. 架构设计

### 1.1 模块结构
```
modules/ssh/
├── ssh.md                    # 模块说明文档
├── index.js                  # 模块入口，导出模块接口
├── connection_manager.js     # 连接管理器，负责SSH连接的生命周期
├── shell_manager.js          # Shell会话管理器，负责交互式会话
├── file_transfer.js          # 文件传输，负责SFTP操作
├── tools.js                  # 工具定义，定义所有SSH工具
└── README.md                 # 使用说明和示例
```

### 1.2 模块职责划分

#### 1.2.1 index.js（模块入口）
**职责：**
- 模块初始化和配置
- 工具定义导出
- 工具调用路由分发
- 模块生命周期管理（init、shutdown）
- 子模块实例管理

**接口：**
- `init(runtime, config)`: 初始化模块
- `getToolDefinitions()`: 获取工具定义列表
- `executeToolCall(ctx, toolName, args)`: 执行工具调用
- `shutdown()`: 关闭模块并释放资源

**依赖：**
- ConnectionManager
- ShellManager
- FileTransfer

#### 1.2.2 connection_manager.js（连接管理器）
**职责：**
- SSH连接的建立、维护和关闭
- 连接池管理
- 连接状态监控
- 连接认证（密码、密钥）
- 连接超时处理

**核心方法：**
- `listHosts()`: 列出已配置的主机
  - 返回配置文件中定义的所有主机名称和描述
  - 不返回IP、端口、认证等敏感信息
- `connect(hostName)`: 建立SSH连接
  - 参数：hostName（主机名称）
  - 从配置文件通过主机名称查找IP地址和认证信息
  - 返回：connectionId, status
- `disconnect(connectionId)`: 断开指定连接
- `getConnection(connectionId)`: 获取连接实例
- `listConnections()`: 列出所有活动连接
- `closeAll()`: 关闭所有连接

**数据结构：**
```javascript
{
  connectionId: string,        // 连接唯一标识
  client: SSH2Client,          // ssh2客户端实例
  hostName: string,            // 主机名称（配置中的标识符）
  host: string,                // 主机地址（IP或域名）
  port: number,                // 端口
  username: string,            // 用户名
  status: string,              // 连接状态：connected, disconnected, error
  createdAt: Date,             // 创建时间
  lastUsedAt: Date            // 最后使用时间
}
```

#### 1.2.3 shell_manager.js（Shell会话管理器）
**职责：**
- 创建和管理交互式shell会话
- 异步接收会话输出并保存到本地文件
- 提供文件偏移读取功能（窗口大小5000字符）
- 处理并发读写，避免冲突
- 会话生命周期管理

**核心方法：**
- `createShell(connectionId)`: 创建shell会话
  - 返回：shellId
  - 自动生成输出文件路径（对智能体透明）
  - 启动后台监听，持续接收输出并追加到文件
- `sendCommand(shellId, command)`: 发送命令到会话
  - 立即返回，不等待命令完成
  - 返回：{ok: true}
- `readOutput(shellId, offset)`: 读取指定偏移的窗口内容
  - 从文件偏移位置读取最多5000字符
  - 使用文件锁或安全读取方式，避免与写入冲突
  - 返回：{output, offset, totalLength}
- `closeShell(shellId)`: 关闭会话
  - 停止输出监听
  - 保留输出文件供后续查看

**数据结构：**
```javascript
{
  shellId: string,             // 会话唯一标识
  connectionId: string,        // 所属连接ID
  stream: Stream,              // shell流
  outputFile: string,          // 输出文件路径
  writeStream: WriteStream,    // 写入流
  windowSize: 5000,            // 窗口大小（字符）
  createdAt: Date,             // 创建时间
  isListening: boolean         // 是否正在监听输出
}
```

**文件管理：**
- 输出文件存储在数据目录：`{dataDir}/ssh/`（dataDir 从 runtime.config 获取）
- 文件命名格式：`YYYYMMDD-HHmmss-hostname.log`
- 持续监听shell输出流，追加到文件
- 文件无大小限制，完整保存所有输出
- 会话关闭后文件保留，可供后续查看
- 模块关闭时清理所有输出文件（可选保留）

**并发读写处理（协程环境）：**
- JavaScript 单线程事件循环模型，无真正的并发问题
- 写入：使用追加模式的 WriteStream，持续监听 shell 输出并追加
- 读取：使用 `fs.open()` + `fs.read()` 进行随机位置读取
- 性能优化：
  - 写入流保持打开状态，避免频繁打开关闭文件
  - 读取使用独立的文件描述符，每次读取后立即关闭
  - 读取操作是异步的，不会阻塞写入流
  - 避免使用 `fs.readFile()` 读取整个文件，只读取需要的窗口
- 协程调度：读写操作通过事件循环自然交替执行，无需额外同步机制

**依赖：**
- ConnectionManager（获取连接实例）
- fs模块（文件读写，使用 `node:fs` 和 `node:fs/promises`）
- path模块（路径操作，使用 `node:path`）

#### 1.2.4 file_transfer.js（文件传输）
**职责：**
- SFTP连接管理
- 从工件上传文件到远程服务器（异步）
- 从远程服务器下载文件并保存为工件（异步）
- 传输任务管理（创建、跟踪、取消）
- 传输进度跟踪

**核心方法：**
- `upload(connectionId, artifactId, remotePath, ctx)`: 启动上传任务
  - 从工件系统读取文件内容
  - 创建传输任务并返回任务ID
  - 后台执行SFTP上传
  - 返回：{taskId, fileSize, status: 'pending'}
- `download(connectionId, remotePath, fileName, ctx)`: 启动下载任务
  - 创建传输任务并返回任务ID
  - 后台执行SFTP下载
  - 保存到工件系统
  - 返回：{taskId, fileSize, status: 'pending'}
- `getTransferStatus(taskId)`: 查询传输任务状态
  - 返回：{status, progress, bytesTransferred, totalBytes, result}
- `cancelTransfer(taskId)`: 取消传输任务
  - 中止SFTP传输
  - 清理临时资源
  - 返回：{ok: true}

**数据结构：**
```javascript
{
  taskId: string,              // 任务唯一标识
  type: 'upload'|'download',   // 任务类型
  connectionId: string,        // 所属连接ID
  status: string,              // 任务状态：pending, transferring, completed, failed, cancelled
  progress: number,            // 传输进度（0-100）
  bytesTransferred: number,    // 已传输字节数
  totalBytes: number,          // 总字节数
  remotePath: string,          // 远程文件路径
  artifactId: string|null,     // 工件ID（上传时为源，下载时为目标）
  error: string|null,          // 错误信息（失败时）
  createdAt: Date,             // 创建时间
  completedAt: Date|null       // 完成时间
}
```

**说明：**
- 上传时需要通过ctx.tools.getArtifact获取工件内容
- 下载时需要通过ctx.tools.putArtifact保存工件
- 目录操作（列出、创建、删除等）可以通过执行shell命令完成，不需要单独实现
- 传输任务在后台执行，不阻塞工具调用
- 任务完成后保留状态信息供查询

**依赖：**
- ConnectionManager（获取连接实例）
- ctx.tools（工件系统接口）

#### 1.2.5 tools.js（工具定义）
**职责：**
- 定义所有SSH工具的接口规范
- 提供工具描述和参数定义
- 为大模型提供工具使用指导

**导出：**
- `getToolDefinitions()`: 返回工具定义数组

### 1.3 模块间协作关系

```
index.js (模块入口)
    ├── 初始化 ──> ConnectionManager
    ├── 初始化 ──> ShellManager
    ├── 初始化 ──> FileTransfer
    └── 路由工具调用 ──> 各子模块

ShellManager ──依赖──> ConnectionManager
FileTransfer ──依赖──> ConnectionManager
```
ShellManager ──依赖──> ConnectionManager
FileTransfer ──依赖──> ConnectionManager
```

**协作流程：**
1. index.js初始化时创建所有子模块实例
2. 工具调用通过index.js路由到对应子模块
3. 子模块通过ConnectionManager获取SSH连接
4. 子模块执行具体操作并返回结果
5. index.js将结果返回给调用者

### 1.4 Task与Connection的关系（内部处理）

**设计原则：对外接口简单，内部自动处理复杂情况**

#### 1.4.1 基本关系
- 每个传输Task关联一个Connection（通过connectionId）
- Connection断开时，正在进行的Task自动失败
- 代码内部处理所有依赖关系，不暴露给大模型

#### 1.4.2 自动处理策略
1. **断开连接时**：自动将该连接上所有进行中的Task标记为failed
2. **Task执行时连接断开**：Task自动失败，error记录原因
3. **模块关闭时**：自动清理所有连接和任务

#### 1.4.3 Task池管理
- 使用Map存储所有Task
- 定期清理已完成的Task（保留24小时）
- 避免内存泄漏

### 1.5 错误处理策略

#### 1.4.1 错误分类
- **连接错误**: 网络不可达、认证失败、超时等
- **连接状态错误**: 连接不存在、连接已关闭、会话不存在、会话已关闭
- **命令错误**: 命令不存在、权限不足、执行超时等
- **文件错误**: 文件不存在、权限不足、磁盘空间不足等
- **参数错误**: 参数缺失、参数格式错误等

#### 1.4.2 错误处理原则
1. 所有错误必须捕获并记录详细日志
2. 返回友好的错误信息给调用者
3. 不在日志中记录敏感信息（密码、密钥）
4. 错误不扩散，保护系统稳定性

#### 1.4.3 错误返回格式
```javascript
{
  error: "error_type",        // 错误类型
  message: "错误描述",         // 友好的错误信息
  details: {...}              // 详细错误信息（可选）
}
```

#### 1.4.4 具体错误场景和消息

**连接相关错误：**
- **连接不存在**
  - 错误类型：`connection_not_found`
  - 错误消息：`连接不存在：{connectionId}`
  - 触发场景：使用不存在的connectionId调用任何需要连接的操作
  
- **连接已关闭**
  - 错误类型：`connection_closed`
  - 错误消息：`连接已关闭：{connectionId}`
  - 触发场景：在已断开的连接上执行操作

- **主机名称无效**
  - 错误类型：`invalid_host_name`
  - 错误消息：`主机名称无效：{hostName}，请使用ssh_list_hosts查看可用主机`
  - 触发场景：使用配置文件中不存在的主机名称连接

- **连接失败**
  - 错误类型：`connection_failed`
  - 错误消息：`连接失败：{原因}`（如：网络不可达、认证失败、超时等）
  - 触发场景：SSH连接建立失败

**会话相关错误：**
- **会话不存在**
  - 错误类型：`shell_not_found`
  - 错误消息：`Shell会话不存在：{shellId}`
  - 触发场景：使用不存在的shellId调用shell操作

- **会话已关闭**
  - 错误类型：`shell_closed`
  - 错误消息：`Shell会话已关闭：{shellId}`
  - 触发场景：在已关闭的会话上执行操作

- **会话创建失败**
  - 错误类型：`shell_creation_failed`
  - 错误消息：`创建Shell会话失败：{原因}`
  - 触发场景：shell流创建失败

**文件操作错误：**
- **文件不存在**
  - 错误类型：`file_not_found`
  - 错误消息：`文件不存在：{remotePath}`
  - 触发场景：下载不存在的远程文件

- **权限不足**
  - 错误类型：`permission_denied`
  - 错误消息：`权限不足：{操作描述}`
  - 触发场景：没有权限读写文件或目录

- **磁盘空间不足**
  - 错误类型：`disk_full`
  - 错误消息：`磁盘空间不足`
  - 触发场景：上传文件时远程磁盘空间不足

- **工件不存在**
  - 错误类型：`artifact_not_found`
  - 错误消息：`工件不存在：{artifactId}`
  - 触发场景：上传时指定的工件ID不存在

**参数错误：**
- **参数缺失**
  - 错误类型：`missing_parameter`
  - 错误消息：`缺少必需参数：{参数名}`
  - 触发场景：调用工具时缺少必需参数

- **参数格式错误**
  - 错误类型：`invalid_parameter`
  - 错误消息：`参数格式错误：{参数名} - {错误描述}`
  - 触发场景：参数类型或格式不符合要求

**系统错误：**
- **超时错误**
  - 错误类型：`timeout`
  - 错误消息：`操作超时：{操作描述}`
  - 触发场景：操作执行时间超过配置的超时时间

- **未知错误**
  - 错误类型：`unknown_error`
  - 错误消息：`未知错误：{错误描述}`
  - 触发场景：捕获到未预期的异常

### 1.5 资源管理

#### 1.5.1 连接池管理
- 维护活动连接映射表
- 连接空闲超时自动清理（可配置）
- 模块关闭时自动清理所有连接

#### 1.5.2 会话管理
- 维护活动会话映射表
- 会话空闲超时自动清理（可配置）
- 连接关闭时自动清理关联会话

#### 1.5.3 内存管理
- 命令输出限制大小，避免内存溢出
- 文件传输使用流式处理
- 及时释放不再使用的资源

### 1.6 错误处理实现指导

#### 1.6.1 错误检查时机
- **调用前检查**：在执行操作前验证连接/会话是否存在且有效
- **操作中捕获**：捕获SSH操作过程中的所有异常
- **参数验证**：在工具调用入口验证所有必需参数

#### 1.6.2 错误处理流程
```javascript
// 示例：连接状态检查
function getConnection(connectionId) {
  const conn = this.connections.get(connectionId);
  
  if (!conn) {
    return {
      error: 'connection_not_found',
      message: `连接不存在：${connectionId}`
    };
  }
  
  if (conn.status === 'disconnected') {
    return {
      error: 'connection_closed',
      message: `连接已关闭：${connectionId}`
    };
  }
  
  return { ok: true, connection: conn };
}

// 示例：会话状态检查
function getShell(shellId) {
  const shell = this.shells.get(shellId);
  
  if (!shell) {
    return {
      error: 'shell_not_found',
      message: `Shell会话不存在：${shellId}`
    };
  }
  
  if (!shell.isActive) {
    return {
      error: 'shell_closed',
      message: `Shell会话已关闭：${shellId}`
    };
  }
  
  return { ok: true, shell };
}
```

#### 1.6.3 日志记录规范
- **错误日志**：记录完整的错误堆栈和上下文信息
- **敏感信息过滤**：不记录密码、密钥等敏感信息
- **日志级别**：
  - ERROR：连接失败、操作失败等
  - WARN：连接超时、会话空闲等
  - INFO：连接建立、会话创建等
  - DEBUG：详细的操作流程

#### 1.6.4 错误恢复策略
- **连接断开**：标记连接状态为disconnected，清理关联会话
- **会话异常**：关闭会话，保留输出文件
- **文件传输失败**：清理临时文件，返回错误信息
- **参数错误**：立即返回，不执行任何操作

## 2. 数据流设计

### 2.1 连接建立流程
```
用户请求 ssh_connect (hostName)
    ↓
index.js 接收请求
    ↓
ConnectionManager.connect(hostName)
    ↓
从配置文件通过主机名称查找配置
    ↓
获取IP地址、端口、用户名、认证信息
    ↓
创建ssh2客户端
    ↓
执行认证（密码/密钥）
    ↓
连接成功 → 生成connectionId → 保存到连接池
    ↓
返回 {connectionId, status}
```

### 2.2 Shell会话交互流程
```
创建会话：
用户请求 ssh_shell_create
    ↓
ShellManager.createShell()
    ↓
生成输出文件路径（{dataDir}/ssh/YYYYMMDD-HHmmss-hostname.log）
    ↓
创建本地输出文件
    ↓
创建shell流并启动后台监听
    ↓
返回 {shellId}

发送命令：
用户请求 ssh_shell_send
    ↓
ShellManager.sendCommand()
    ↓
写入命令到shell流
    ↓
立即返回 {ok: true}
    ↓
后台持续接收输出并追加到文件

读取输出：
用户请求 ssh_shell_read (offset)
    ↓
ShellManager.readOutput(shellId, offset)
    ↓
使用fs.open()打开文件获取文件描述符
    ↓
使用fs.read()从偏移位置读取最多5000字符
    ↓
关闭文件描述符
    ↓
返回 {output, offset, totalLength}
```

### 2.3 文件上传流程
```
用户请求 ssh_upload
    ↓
index.js 接收请求
    ↓
FileTransfer.upload()
    ↓
从ConnectionManager获取连接
    ↓
通过ctx.tools.getArtifact获取工件内容
    ↓
生成任务ID
    ↓
立即返回 {taskId, fileSize, status: 'pending'}
    ↓
后台执行：
    ├─ 建立SFTP会话
    ├─ 上传文件到远程服务器（流式）
    ├─ 更新传输进度
    └─ 完成后更新任务状态
```

### 2.4 文件下载流程
```
用户请求 ssh_download
    ↓
index.js 接收请求
    ↓
FileTransfer.download()
    ↓
从ConnectionManager获取连接
    ↓
生成任务ID
    ↓
立即返回 {taskId, fileSize, status: 'pending'}
    ↓
后台执行：
    ├─ 建立SFTP会话
    ├─ 从远程服务器下载文件（流式）
    ├─ 更新传输进度
    ├─ 通过ctx.tools.putArtifact保存为工件
    └─ 完成后更新任务状态（包含artifactId）
```

### 2.5 查询传输状态流程
```
用户请求 ssh_transfer_status (taskId)
    ↓
index.js 接收请求
    ↓
FileTransfer.getTransferStatus(taskId)
    ↓
返回 {status, progress, bytesTransferred, totalBytes, result}
```

## 3. 接口设计

### 3.1 工具接口列表

#### 连接管理
- `ssh_list_hosts`: 列出已配置的主机
- `ssh_connect`: 建立SSH连接
- `ssh_disconnect`: 断开SSH连接
- `ssh_list_connections`: 列出所有活动连接

#### 交互式会话
- `ssh_shell_create`: 创建交互式shell会话
- `ssh_shell_send`: 在shell会话中发送命令（异步）
- `ssh_shell_read`: 读取shell会话输出窗口（指定偏移）
- `ssh_shell_close`: 关闭shell会话

#### 文件传输
- `ssh_upload`: 上传文件（异步）
- `ssh_download`: 下载文件（异步）
- `ssh_transfer_status`: 查询传输任务状态
- `ssh_transfer_cancel`: 取消传输任务

**说明：** 所有命令执行都通过交互式shell会话完成。目录操作（如ls、mkdir、rm等）可以通过shell会话执行命令完成，不需要单独的工具。文件传输是异步的，立即返回任务ID，通过 `ssh_transfer_status` 查询进度。

### 3.2 详细接口定义
（详见 tools.js 实现）

## 4. 安全设计

### 4.1 认证安全
- 认证信息存储在配置文件中，对大模型透明
- 支持密码认证和SSH密钥认证
- 密码不在日志中明文记录
- 支持known_hosts验证（可配置）

### 4.2 数据安全
- 所有数据通过SSH加密传输
- 不在内存中长期保存敏感信息
- 连接断开后清理相关数据

### 4.3 访问控制
- 每个连接独立管理，互不干扰
- 连接ID随机生成，不可预测

## 5. 性能优化

### 5.1 连接复用
- 同一主机的多次操作复用连接
- 避免频繁建立和断开连接

### 5.2 并发控制
- 支持多连接并发操作
- 单连接内串行执行命令（避免冲突）

### 5.3 资源限制
- 限制最大连接数（可配置）
- 限制命令输出大小（通过窗口读取避免内存问题）
- 限制文件传输大小（可配置）
- 写入流保持打开，避免频繁打开关闭
- 读取使用独立文件描述符，用完即关闭

## 6. 测试策略

### 6.1 单元测试
- 测试各子模块的核心功能
- 测试错误处理逻辑
- 测试边界条件

### 6.2 集成测试
- 测试完整的工具调用流程
- 测试多连接并发场景
- 测试资源清理逻辑

### 6.3 测试环境
- 需要可访问的SSH测试服务器
- 测试用户和密钥
- 测试文件和目录

## 7. 配置项

### 7.1 模块配置
```javascript
{
  maxConnections: 10,           // 最大连接数
  connectionTimeout: 30000,     // 连接超时（毫秒）
  commandTimeout: 30000,        // 命令超时（毫秒）
  idleTimeout: 300000,          // 空闲超时（毫秒）
  maxOutputSize: 10485760,      // 最大输出大小（10MB）
  verifyHostKey: false,         // 是否验证主机密钥
  keepaliveInterval: 10000,     // 保活间隔（毫秒）
  hosts: {                      // 主机配置
    "production-server": {      // 主机名称（智能体使用）
      description: "生产服务器",
      host: "192.168.1.100",    // IP地址或域名
      port: 22,
      username: "root",
      password: "password123"   // 或使用privateKey
    },
    "dev-server": {
      description: "开发服务器",
      host: "example.com",
      port: 2222,
      username: "admin",
      privateKey: "/path/to/key"
    }
  }
}
```

### 7.2 配置说明
- 主机名称是智能体使用的标识符，可以是任意有意义的名称
- 智能体只能看到主机名称和描述，无法获取IP、端口、认证信息
- 系统通过主机名称查找完整的连接配置
- 支持为每个主机配置独立的认证方式
- 支持密码认证和密钥认证
- 配置文件应妥善保管，避免泄露

## 8. 开发计划

### 8.1 开发顺序
1. 创建模块目录结构和基础文件
2. 实现 ConnectionManager（连接管理）
3. 实现 ShellManager（会话管理）
4. 实现 FileTransfer（文件传输）
5. 实现 tools.js（工具定义）
6. 实现 index.js（模块入口和路由）
7. 编写单元测试
8. 编写集成测试
9. 完善文档

### 8.2 测试驱动开发
- 每完成一个子模块，立即编写单元测试
- 每完成一个工具，立即进行集成测试
- 小步快跑，及时发现问题

## 9. 待确认事项

### 9.1 需要用户确认的设计决策
1. 是否需要支持SSH代理跳转（ProxyJump）？
2. 是否需要支持端口转发功能？
3. 文件传输是否需要支持断点续传？
4. 是否需要Web管理界面（类似chrome模块）？
5. 连接空闲超时时间设置为多少合适？

### 9.2 技术选型确认
1. 使用ssh2库是否合适？（已确认）
2. 是否需要支持其他SSH库作为备选？

## 10. 附录

### 10.1 ssh2库核心API
- `Client.connect(config)`: 建立连接
- `Client.exec(command, callback)`: 执行命令
- `Client.shell(callback)`: 创建shell
- `Client.sftp(callback)`: 创建SFTP会话
- `Client.end()`: 关闭连接

### 10.2 Bun 和 Node.js 兼容性最佳实践
- 使用 `node:` 前缀导入内置模块：`import fs from "node:fs"`
- 使用 ES 模块语法：`import`/`export`
- 避免使用 Bun 特有 API（如 `Bun.file()`），使用标准 Node.js API
- 文件操作使用 `node:fs` 和 `node:fs/promises`
- 路径操作使用 `node:path`
- 子进程使用 `node:child_process`

### 10.3 参考文档
- ssh2库文档：https://github.com/mscdex/ssh2
- SSH协议规范：RFC 4251-4254
- chrome模块实现：modules/chrome/
- Bun 文档：https://bun.sh/docs
- Node.js 文档：https://nodejs.org/docs
