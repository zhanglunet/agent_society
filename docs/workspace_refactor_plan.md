# Workspace Manager Refactoring Plan (重构预案)

## 1. 背景与目标

当前系统中存在“工件 (Artifact)”和“工作区 (Workspace)”两个重叠的概念。工件主要用于点对点文件传递，而工作区用于多智能体协作。为了简化架构，提高系统的可维护性和一致性，我们将彻底删除工件管理器，并将所有文件管理功能收拢到重构后的工作区管理器中。

**核心目标：**
- 删除 `src/platform/services/artifact/` 及其相关测试。
- 完全重构 `src/platform/services/workspace/`，建立一个纯净、高效、安全的文件协作基础。
- 统一文件引用方式：不再使用 `artifactId`，统一使用 `workspaceId + relativePath`。

## 2. 架构设计

### 2.1 职责划分与访问模型
新版 `WorkspaceManager` 将承担以下职责：
- **空间管理**：分配、创建、销毁工作区目录。
- **文件操作**：提供安全的文件读写、删除、重命名、列举功能。
- **元数据与历史追踪 (Metadata & History Tracking)**：
  - **位置与结构**：在每个工作区根目录下创建 `.meta` 隐藏文件夹。
    - **全局元数据 (`.meta/.meta`)**：存储工作区的全局状态、最后同步时间。**关键：存储所有文件和目录的基本信息（高频数据）**，包括路径、类型、大小、修改时间、MIME 类型。只要读取此文件，即可推断出完整的目录结构。
    - **文件级元数据 (`.meta/{path}`)**：存储单个文件的详细、低频数据。例如：详细修改历史、关联的消息 ID 列表、复杂的状态数据。
  - **加载策略**：UI 导航和目录树构建仅读取 `.meta/.meta`；具体查看文件属性或操作审计日志时才读取文件级元数据。
  - **同步要求**：文件操作成功后，必须同步更新对应的文件级元数据，并增量或全量更新全局元数据。**若写入或同步时未提供 MIME 类型，系统必须通过技术手段（如扩展名或内容嗅探）自动探测并记录。**
- **并发处理与安全性**：
  - **无锁设计**：由于 Node.js 的单线程特性，且文件操作多为异步非阻塞，不引入复杂的锁机制。不考虑写入原子性问题。
  - **磁盘配额监控**：提供 `diskUsage` 统计功能，允许智能体和用户通过 UI 查看空间占用。
- **路径安全**：强制执行路径安全检查，防止路径遍历攻击。
- **分层访问模型 (关键设计原则)**：
  - **智能体层 (Agent Tier)**: 智能体在处理任务时，其工作区是天然隔离且隐式的。智能体调用的工具（如 `read_file`, `write_file`）**不需要提供 `workspaceId`**，只需要提供相对路径。系统负责从智能体的执行上下文中自动提取并注入 `workspaceId`。
  - **系统/UI层 (System/UI Tier)**: 用户或系统管理逻辑在跨工作区访问时，**必须提供 `workspaceId + relativePath`**。这保证了全局唯一性和安全性。

### 2.2 核心接口设计

```javascript
// 工作区管理器：负责工作区的生命周期和索引
class WorkspaceManager {
  constructor(workspacesDir) {
    this.workspacesDir = workspacesDir; // 基础工作区目录，例如 data/workspaces
  }

  // 获取工作区对象 (单例管理，确保同一个 ID 返回同一个对象)
  async getWorkspace(workspaceId) {}
  
  // 创建并返回工作区对象
  async createWorkspace(workspaceId, options) {}

  // 删除工作区
  async deleteWorkspace(workspaceId) {}
}

// 工作区对象：负责具体的文件操作
class Workspace {
  constructor(id, workspacesDir) {
    this.id = id;
    this.workspacesDir = workspacesDir;
  }

  // 动态计算根路径
  get rootPath() {
    return path.join(this.workspacesDir, this.id);
  }

  // 元数据目录
  get metaDir() {
    return path.join(this.rootPath, ".meta");
  }

  // 文件操作 (维护 .meta/ 下的对应元数据文件)
  // options 包含 { operator, messageId, mimeType }
  async writeFile(relativePath, content, options) {}
  
  // 随机读写支持：返回 { content, start, total, readLength }
  // length 限制：文本文件最大 5000 字符 (UTF-8)，二进制最大 5000 字节
  async readFile(relativePath, options = { offset: 0, length: 5000 }) {}

  async listFiles(subDir) {} // 获取指定目录下的文件列表（包含基本信息）
  async deleteFile(relativePath, options = { operator, messageId }) {}
  async getMetadata(relativePath) {}
  async getHistory(limit = 100) {} // 从 .meta/.meta 读取全局日志
  async getFileHistory(relativePath) {} // 从 .meta/{path} 读取该文件的详细历史
  async getTree() {} // 从 .meta/.meta 中推断并返回纯目录树结构（不含文件节点）
  async sync() {} // 同步外部变更并更新 .meta/ 结构（需包含 MIME 自动探测）
  async getDiskUsage() {} // 获取当前工作区的磁盘占用情况
}
```

## 3. 实施步骤

### 第一阶段：预备与文档更新
1. 更新重构预案，明确调用点和 UI 迁移细节。
2. 预案审核通过后，删除 `src/platform/services/artifact/` 源码及 `test/platform/services/artifact/` 相关测试。
3. 清理所有对 `artifact` 模块的引用。

### 第二阶段：调用点迁移 (Call Sites Migration)

#### 2.1 HTTP Server 迁移
- **彻底移除 ArtifactId**: 
  - 删除 `ArtifactIdCodec` 在 HTTP 路由中的所有应用。
  - 所有接口统一返回 `path` (相对路径)，前端通过 `workspaceId + path` 进行文件定位和预览。
- **文件上传接口** (`/api/upload`):
  - 修改 `_handleUpload` 逻辑。
  - 从请求中获取目标 `workspaceId`。
  - **存储路径**：所有上传的文件统一存放在对应工作区的 `/upload` 目录下。
  - **自动更名策略**：
    - 检查目标路径是否存在同名文件。
    - 若存在，则采用 `文件名 (n).后缀` 的格式进行自动更名（例如 `data.csv` -> `data (1).csv`），确保不覆盖原有文件且文件名不重复。
  - 通过 `workspaceManager.getWorkspace(workspaceId)` 获取对象，并调用 `ws.writeFile(path, buffer, { operator: 'user', messageId: req.body.messageId })`。
  - 返回格式提供新的 `fileRef` 结构（例如 `workspace:upload/data (1).csv`），不再包含 `artifactId`。
- **工作区服务接口** (`/api/workspace/:workspaceId/*`):
  - `GET /api/workspace/:workspaceId/list?path=xxx`: 获取指定目录下的**所有文件和子文件夹**的基本信息。
  - `GET /api/workspace/:workspaceId/tree`: **获取完整的纯目录树结构（仅文件夹）**。用于 UI 侧边栏导航。
  - `GET /api/workspace/:workspaceId/read/:path`: 读取文件内容。
  - `GET /api/workspace/:workspaceId/history`: **新增：获取操作审计日志**。
  - `POST /api/workspace/:workspaceId/sync`: **新增：手动触发文件系统同步**。
  - `DELETE /api/workspace/:workspaceId/delete/:path`: **新增：删除指定文件**（需传入 `operator: 'user'`）。
  - 内部逻辑均先获取 `Workspace` 对象再操作。

#### 2.2 工具执行器迁移 (Tool Executor)
- **清理废弃工具**:
  - 从 `ToolExecutor` 的 `executeToolCall` 开关语句中物理删除 `put_artifact`, `get_artifact`, `show_artifacts` 的执行分支。
- **上下文绑定**:
  - `ToolExecutor` 在分发工具调用时，必须从 `ctx` (上下文) 中识别当前所属的任务 ID (`taskId`)。
  - 执行器先通过 `workspaceManager.getWorkspace(ctx.taskId)` 获取工作区对象。
  - 智能体定义的 `read_file`, `write_file` 等工具参数中**不再包含 `workspaceId`**。
- **write_file (原 put_artifact)**:
  - 接口：`write_file(path, content, mimeType)`
  - 逻辑：获取 `Workspace` 对象后调用 `ws.writeFile(path, content, { operator: ctx.agentId, messageId: ctx.messageId, mimeType })`。
- **read_file (原 get_artifact)**:
  - 接口：`read_file(path, offset = 0, length = 5000)`
  - 逻辑：获取 `Workspace` 对象后调用 `ws.readFile(path, { offset, length })`。
  - **限制**：单次读取长度限制为 5000（文本字符或二进制字节）。
  - **返回值**：包含 `content`, `start`, `total`, `readLength`。
- **delete_file (新增)**:
  - 接口：`delete_file(path)`
  - 逻辑：调用 `ws.deleteFile(path, { operator: ctx.agentId, messageId: ctx.messageId })`。
- **list_files**:
  - 接口：`list_files([subDir])`
  - 逻辑：获取 `Workspace` 对象后调用 `ws.listFiles(subDir)`。
  - **注意**：仅返回文件列表数据，不触发 UI 展示。
- **show_files (原 show_artifacts 的 UI 职责)**:
  - 接口：`show_files(paths)`
  - 逻辑：接受一个或多个文件相对路径，向前端返回特定的 UI 指令/数据结构，使这些文件在聊天界面或文件浏览器面板中高亮展示。
  - **返回值**：返回包含文件元数据和 UI 展示指令的对象。
- **get_workspace_info**:
  - 接口：`get_workspace_info()`
  - 逻辑：返回工作区的统计信息（文件数、总大小/diskUsage、最后修改时间等）。

#### 2.3 扩展模块迁移 (Modules Migration)
- **SSH 模块** (`modules/ssh/file_transfer.js`):
  - 将 `upload` 和 `download` 中的 `getArtifact` / `putArtifact` 替换为 `workspaceManager` 的文件读写调用。
- **FFmpeg 模块** (`modules/ffmpeg/ffmpeg_manager.js`):
  - **参数简化**：直接接收完整的 ffmpeg 参数字符串，使用相对路径表达输入输出文件。
  - **执行策略**：运行 `ffmpeg` 时，将 `cwd` (当前工作目录) 设置为对应的 **工作区物理目录**。
  - **路径映射**：不再需要 `$FFMPEG_INPUT` / `$FFMPEG_OUTPUT` 占位符逻辑。
  - **同步要求**：命令执行完成后，必须显式调用 `workspace.sync()`，以确保 ffmpeg 生成的新文件被同步到 `.workspace.json` 元数据中。
  - **日志处理**：ffmpeg 的 stdout/stderr 日志直接作为文件写入工作区的指定目录（如 `.logs/ffmpeg/`），不再依赖工件系统。
- **Chrome 模块** (`modules/chrome/page_actions.js`):
  - 将 `screenshot` 和 `saveResource` 中调用的 `saveImage` (底层依赖工件系统) 迁移到工作区。
- **模块测试迁移**:
  - 同步更新 `test/modules/` 下的 `ssh.test.js`, `ffmpeg.test.js`, `chrome_save_resource.test.js` 等测试用例，将工件断言替换为工作区文件断言。

## 3. 分步迁移计划 (Step-by-Step Migration)

为了让重构效果“可见”，我们将优先建立后端核心接口与 UI 层的连接，确保用户能第一时间在界面上看到工作区文件的变化。

### 第一阶段：后端可见性基础 (Backend Visibility Base)
**目标**：提供 UI 所需的最小化数据接口。
1. **重构 `WorkspaceManager` 与 `Workspace` 类**：
   - 实现动态 `rootPath` 计算与元数据追踪。
2. **实现 HTTP 核心接口**：
   - `/api/workspace/:workspaceId/tree`：提供全量目录树数据。
   - `/api/workspace/:workspaceId/upload`：支持文件上传到 `/upload`。
   - `/api/workspace/:workspaceId/delete/:path`：支持文件删除。
**交付物**：可通过 API 访问的工作区管理后端。

### 第二阶段：UI 全量适配 (UI Migration & Visibility)
**目标**：在界面上彻底移除“工件”概念，展示“工作区”内容。
1. **前端 API 服务适配**：修改 `web/v3/src/services/api.ts`，新增工作区相关接口（`getWorkspaceTree`, `uploadWorkspaceFile`, `deleteWorkspaceFile` 等），移除对旧工件接口的引用。
2. **组件重构 (v3)**：
   - 重构 `ArtifactsList.vue`：更名为更符合工作区语意的组件或调整其逻辑，使其作为工作区文件浏览器运行，并对接新版 API。
   - 适配 `ChatPanel.vue` 和相关附件管理组件：支持工作区文件的预览、上传与引用，移除工件（Artifact）术语。
3. **上传服务更新**：修改 `web/v3/src/utils/upload-service.js`（或对应 v3 位置），对接工作区上传接口，并处理自动更名后的返回结果。
**交付物**：**可视化效果达成**。用户可以在 UI 上直接管理、查看和上传工作区文件。

### 第三阶段：核心工具可见性 (Agent Tools Visibility)
**目标**：使智能体的操作在 UI 上实时反馈。
1. **ToolExecutor 工具迁移**：
   - 迁移 `read_file`, `write_file`, `list_files`, `show_files`, `delete_file`。
   - **效果**：智能体写一个文件，UI 目录树即时更新；智能体调用 `show_files`，UI 立即高亮展示。
**测试交付**：通过智能体指令验证 UI 的实时联动。

### 第四阶段：业务模块逐个迁移 (Modules Migration)
**目标**：按依赖关系迁移重型业务模块。
1. **SSH 模块**：文件传输目标切换至工作区。
2. **Chrome 模块**：截图/资源保存写入工作区。
3. **FFmpeg 模块**：音视频处理结果写入工作区。
**测试交付**：每迁移一个模块，通过 UI 观测其生成的文件结果。

### 第五阶段：内容路由器重构 (Content Router Refactoring)
**目标**：适配工作区路径。
1. **重构 ContentRouter**：使其能够从 `workspaceId + relativePath` 中提取内容并转换为模型消息，不再依赖 `artifact/`。

### 第六阶段：清理与废弃 (Final Cleanup)
1. **彻底删除**：删除 `src/platform/services/artifact/` 及其相关测试、引用。
**交付物**：干净、高效的单中心文件管理系统。

---

## 4. 关键设计约束

- **路径规范化**：所有 `relativePath` 在处理前必须进行规范化处理（正斜杠统一）。
- **元数据同步**：文件操作成功后，必须同步更新 `.meta/`，确保一致性。
- **读取限制**：所有读操作强制执行 5000 单位限制（字符或字节），超过部分需通过 `offset` 分片读取。
- **MIME 探测**：若操作未显式提供 MIME，系统需具备自动探测能力。
- **不考虑原子性**：接受并发导致的非关键性数据偏差，不引入复杂的原子写入保证。
- **不考虑兼容性**：本次重构不考虑任何向后兼容性。

## 5. 风险评估与切换策略

- **非兼容性重构**：本次重构为**破坏性变更**，不考虑任何向后兼容性。旧版工件系统和工作区系统的所有接口、文件结构、历史数据将被废弃。
- **全量切换**：系统启动后将直接启用全新的工作区管理逻辑，所有依赖模块必须同步完成接口适配。
- **清理工作**：重构完成后，旧有的工件存储目录和不符合新规范的工作区目录应进行清理。

---
**设计模式：**
- **Facade (外观模式)**：WorkspaceManager 作为文件系统的统一入口。
- **Strategy (策略模式)**：未来可以扩展不同的存储后端（如 S3、云盘）。
