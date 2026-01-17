# 工作空间服务模块

## 概述

工作空间服务模块负责管理任务工作空间的文件操作和命令执行，确保路径安全和命令安全。

## 模块职责

### workspace_manager.js
- **职责**：工作空间管理器，负责任务工作空间的文件操作
- **主要功能**：
  - 工作空间绑定和分配
  - 懒加载创建工作空间文件夹
  - 文件读写操作
  - 目录列表
  - 路径安全验证（防止路径遍历攻击）
  - 工作空间元信息管理
  - 工作空间统计信息

### command_executor.js
- **职责**：命令执行器，在工作空间内安全执行终端命令
- **主要功能**：
  - 命令执行
  - 命令安全检查（禁止危险命令）
  - 超时控制
  - 跨平台支持（Windows/Unix）

## 核心概念

### 工作空间绑定
- **bindWorkspace**: 为任务绑定工作空间，立即创建文件夹
- **assignWorkspace**: 为工作空间分配路径，懒加载创建文件夹
- **ensureWorkspaceExists**: 确保工作空间文件夹存在（懒加载创建）

### 路径安全
- 拒绝绝对路径
- 拒绝包含 `..` 的路径
- 验证解析后的路径是否在工作空间内

### 命令安全
禁止执行以下危险命令：
- `rm -rf /`、`rm -rf /*`
- `sudo`、`su`
- `chmod 777`
- `mkfs`、`dd if=`
- `shutdown`、`reboot`
- fork bomb: `:(){ :|:& };:`
- Windows: `format c:`、`del /f /s /q c:`

## 使用示例

### 创建工作空间管理器

```javascript
import { WorkspaceManager } from "./services/workspace/workspace_manager.js";

const manager = new WorkspaceManager({
  logger: myLogger
});
```

### 绑定和管理工作空间

```javascript
// 绑定工作空间（立即创建）
await manager.bindWorkspace(taskId, "/path/to/workspace");

// 分配工作空间（懒加载）
await manager.assignWorkspace(workspaceId, "/path/to/workspace");

// 检查工作空间是否已分配
const hasWorkspace = manager.hasWorkspace(workspaceId);

// 确保工作空间文件夹存在
await manager.ensureWorkspaceExists(workspaceId);

// 获取工作空间路径
const workspacePath = manager.getWorkspacePath(taskId);
```

### 文件操作

```javascript
// 读取文件
const result = await manager.readFile(taskId, "README.md");
if (result.content) {
  console.log(result.content);
} else {
  console.error(result.error);
}

// 写入文件（带元信息）
await manager.writeFile(
  taskId,
  "output.txt",
  "Hello, World!",
  { messageId: "msg-123", agentId: "agent-456" }
);

// 列出目录
const listResult = await manager.listFiles(taskId, ".");
if (listResult.files) {
  for (const file of listResult.files) {
    console.log(`${file.name} (${file.type}, ${file.size} bytes)`);
  }
}

// 获取工作空间统计信息
const info = await manager.getWorkspaceInfo(taskId);
console.log(`文件数: ${info.fileCount}, 总大小: ${info.totalSize} bytes`);
```

### 执行命令

```javascript
import { CommandExecutor } from "./services/workspace/command_executor.js";

const executor = new CommandExecutor({
  defaultTimeoutMs: 60000,
  logger: myLogger
});

// 执行命令
const result = await executor.execute(
  workspacePath,
  "npm install",
  { timeoutMs: 120000 }
);

if (result.error) {
  console.error(`命令失败: ${result.error}`);
  if (result.timedOut) {
    console.error(`超时: ${result.timeoutMs}ms`);
  }
} else {
  console.log(`退出码: ${result.exitCode}`);
  console.log(`标准输出: ${result.stdout}`);
  console.log(`标准错误: ${result.stderr}`);
}
```

## 工作空间元信息

工作空间元信息保存在工作空间目录的上一级，文件名为 `{workspaceId}.meta.json`：

```json
{
  "workspaceId": "workspace-123",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "files": {
    "README.md": {
      "messageId": "msg-123",
      "agentId": "agent-456",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

## 安全特性

### 路径安全
1. **拒绝绝对路径**：只允许相对路径
2. **拒绝路径遍历**：拒绝包含 `..` 的路径
3. **路径验证**：确保解析后的路径在工作空间内

### 命令安全
1. **危险命令拦截**：禁止执行危险命令
2. **超时控制**：防止命令无限执行
3. **进程树终止**：Windows 使用 taskkill，Unix 使用 SIGKILL

## 注意事项

1. **懒加载**：使用 `assignWorkspace` 时，文件夹不会立即创建，首次写入时才创建
2. **路径规范化**：所有路径都会被规范化，确保安全
3. **跨平台**：命令执行器支持 Windows 和 Unix 系统
4. **超时处理**：命令执行超时后会强制终止进程树
5. **元信息可选**：文件元信息是可选的，写入失败不影响主流程
