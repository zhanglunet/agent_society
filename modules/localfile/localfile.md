# localfile 模块

## 综述

本地文件访问模块，为智能体提供受控的服务器本地文件系统访问能力。

## 功能

- 文件夹授权管理：可配置多个授权文件夹，每个文件夹独立设置读/写权限
- 文件操作：读取、写入、列出目录内容
- 工作区交互：复制文件到工作区、从工作区复制出来
- 权限检查：智能体可检测目标文件的读写权限
- 访问审计：完整记录所有文件访问日志（时间、智能体、操作、路径、结果）
- Web管理界面：可视化配置文件夹授权、查看访问日志

## 文件结构

```
modules/localfile/
├── localfile.md          # 本说明文档
├── index.js              # 模块入口，导出模块接口
├── tools.js              # 工具定义
├── config_manager.js     # 配置管理器，管理文件夹授权设置
├── permission_manager.js # 权限管理器，检查文件访问权限
├── file_service.js       # 文件服务，执行实际文件操作
├── access_logger.js      # 访问日志记录器
└── web/                  # 前端设置界面目录
    ├── panel.html        # 管理界面HTML
    ├── panel.css         # 管理界面样式
    └── panel.js          # 管理界面逻辑
```

## 配置

配置文件路径：`config/localfile.local.json`

```json
{
  "folders": [
    {
      "id": "uuid-string",
      "path": "/path/to/documents",
      "read": true,
      "write": false,
      "description": "文档目录（只读）"
    },
    {
      "id": "uuid-string-2",
      "path": "/path/to/workspace",
      "read": true,
      "write": true,
      "description": "工作目录（读写）"
    }
  ],
  "logRetentionDays": 30
}
```

### 配置项说明

- `folders`: 授权文件夹列表
  - `id`: 文件夹唯一标识（自动生成）
  - `path`: 文件夹绝对路径
  - `read`: 是否允许读取
  - `write`: 是否允许写入
  - `description`: 描述信息
- `logRetentionDays`: 访问日志保留天数（默认30天）

## 启用模块

在 `config/app.local.json` 中添加模块配置：

```json
{
  "modules": {
    "localfile": {}
  }
}
```

## 智能体工具

### localfile_read

读取本地文件内容。

**参数：**
- `path` (string, 必需): 文件的绝对路径
- `encoding` (string, 可选): 文件编码，默认 utf8

**返回：**
```json
{
  "ok": true,
  "content": "文件内容",
  "path": "/path/to/file",
  "size": 1024
}
```

### localfile_write

写入文件内容。

**参数：**
- `path` (string, 必需): 文件的绝对路径
- `content` (string, 必需): 要写入的内容
- `encoding` (string, 可选): 文件编码，默认 utf8

**返回：**
```json
{
  "ok": true,
  "path": "/path/to/file",
  "isNew": true
}
```

### localfile_list

列出目录内容。

**参数：**
- `path` (string, 必需): 目录的绝对路径

**返回：**
```json
{
  "ok": true,
  "entries": [
    { "name": "file.txt", "isDirectory": false, "isFile": true, "path": "/path/file.txt" },
    { "name": "folder", "isDirectory": true, "isFile": false, "path": "/path/folder" }
  ],
  "path": "/path/to/dir"
}
```

### localfile_copy_to_workspace

将本地文件复制到工作区。

**参数：**
- `sourcePath` (string, 必需): 源文件绝对路径
- `destPath` (string, 必需): 工作区内的目标相对路径

**返回：**
```json
{
  "ok": true,
  "sourcePath": "/local/path/file.txt",
  "destPath": "/workspace/path/file.txt"
}
```

### localfile_copy_from_workspace

从工作区复制文件到本地。

**参数：**
- `sourcePath` (string, 必需): 工作区内的源相对路径
- `destPath` (string, 必需): 本地目标绝对路径

**返回：**
```json
{
  "ok": true,
  "sourcePath": "/workspace/path/file.txt",
  "destPath": "/local/path/file.txt"
}
```

### localfile_check_permission

检查文件权限。

**参数：**
- `path` (string, 必需): 要检查的绝对路径

**返回：**
```json
{
  "ok": true,
  "canRead": true,
  "canWrite": false,
  "folder": { "id": "...", "path": "...", "read": true, "write": false },
  "exists": true
}
```

### localfile_list_authorized_folders

列出所有已授权的文件夹。

**返回：**
```json
{
  "ok": true,
  "folders": [
    { "id": "...", "path": "/path", "read": true, "write": false, "description": "..." }
  ]
}
```

## Web管理界面

访问路径：`http://localhost:2999/web/modules/localfile/web/panel.html`

### 功能

1. **统计概览**：显示授权文件夹数量、权限分布、今日访问次数
2. **文件夹管理**：
   - 添加新的授权文件夹
   - 编辑文件夹权限
   - 删除授权文件夹
   - 路径测试（验证路径可访问性）
3. **访问日志**：
   - 查看所有文件访问记录
   - 按操作类型筛选
   - 按智能体筛选
   - 分页浏览
4. **设置**：
   - 配置日志保留天数

## 安全机制

1. **路径规范化**：所有路径都经过规范化处理，防止路径遍历攻击
2. **权限隔离**：每个授权文件夹独立设置读/写权限
3. **范围限制**：智能体只能访问已授权文件夹内的文件
4. **访问审计**：所有操作记录完整日志，包括时间、智能体、操作、路径、结果
5. **错误隐藏**：向智能体返回友好的错误信息，不暴露系统内部细节

## 日志格式

访问日志存储在 `data/localfile/logs/access-YYYY-MM-DD.log`：

```json
{
  "id": "uuid",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "agentId": "agent-uuid",
  "agentName": "智能体名称",
  "operation": "read",
  "path": "/path/to/file",
  "success": true,
  "error": null,
  "details": {}
}
```

## 依赖

- Node.js 内置模块：fs, path, crypto
- 运行时服务：通过 Runtime 获取工作区路径

## 注意事项

1. 配置文件夹路径时请使用绝对路径
2. 请谨慎授予写入权限，避免数据误操作
3. 日志文件会自动清理，超过保留天数的日志会被删除
4. 模块首次加载时会自动创建配置和数据目录
