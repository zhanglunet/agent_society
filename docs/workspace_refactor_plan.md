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
  - 在每个工作区根目录维护 `.workspace.json`。
  - **文件当前状态**：记录每个文件的 MIME 类型、创建信息、最后修改信息及关联的消息 ID。
  - **操作历史记录 (Audit Log)**：
    - 记录所有 `create`, `update`, `delete` 操作。
    - 包含：操作时间 (`timestamp`)、操作类型 (`operation`)、操作者 (`operator`: agentId/userId)、关联消息 (`messageId`)、文件路径 (`path`)。
    - **注意**：仅记录操作行为和元数据，不保留历史版本的文件内容。
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

  // 文件操作 (自动维护 .workspace.json 中的历史记录)
  async writeFile(relativePath, content, options = { operator, messageId }) {}
  async readFile(relativePath) {}
  async listFiles(subDir) {}
  async deleteFile(relativePath, options = { operator, messageId }) {}
  async getMetadata(relativePath) {}
  async getHistory() {} // 获取该工作区的操作审计日志
  async getTree() {} // 从元数据推断并返回完整的树状目录结构
  async sync() {} // 重新扫描物理磁盘，同步新增/删除的文件到元数据，记录 operator: 'user'
}
```

## 3. 实施步骤

### 第一阶段：预备与文档更新
1. 更新重构预案，明确调用点和 UI 迁移细节。
2. 预案审核通过后，删除 `src/platform/services/artifact/` 源码及 `test/platform/services/artifact/` 相关测试。
3. 清理所有对 `artifact` 模块的引用。

### 第二阶段：调用点迁移 (Call Sites Migration)

#### 2.1 HTTP Server 迁移
- **文件上传接口** (`/api/upload`):
  - 修改 `_handleUpload` 逻辑。
  - 从请求中获取目标 `workspaceId`。
  - **存储路径**：所有上传的文件统一存放在对应工作区的 `/upload` 目录下。
  - **自动更名策略**：
    - 检查目标路径是否存在同名文件。
    - 若存在，则采用 `文件名 (n).后缀` 的格式进行自动更名（例如 `data.csv` -> `data (1).csv`），确保不覆盖原有文件且文件名不重复。
  - 通过 `workspaceManager.getWorkspace(workspaceId)` 获取对象，并调用 `ws.writeFile(path, buffer, { operator: 'user', messageId: req.body.messageId })`。
  - 返回格式提供新的 `fileRef` 结构（例如 `workspace:upload/data (1).csv`）。
- **工作区服务接口** (`/api/workspace/:workspaceId/*`):
  - `GET /api/workspace/:workspaceId/list`: 获取文件列表。
  - `GET /api/workspace/:workspaceId/tree`: **新增：获取完整树状目录结构**。
  - `GET /api/workspace/:workspaceId/read/:path`: 读取文件内容。
  - `GET /api/workspace/:workspaceId/history`: **新增：获取操作审计日志**。
  - `POST /api/workspace/:workspaceId/sync`: **新增：手动触发文件系统同步**。
  - `DELETE /api/workspace/:workspaceId/delete/:path`: **新增：删除指定文件**（需传入 `operator: 'user'`）。
  - 内部逻辑均先获取 `Workspace` 对象再操作。

#### 2.2 工具执行器迁移 (Tool Executor)
- **上下文绑定**:
  - `ToolExecutor` 在分发工具调用时，必须从 `ctx` (上下文) 中识别当前所属的任务 ID (`taskId`)。
  - 执行器先通过 `workspaceManager.getWorkspace(ctx.taskId)` 获取工作区对象。
  - 智能体定义的 `read_file`, `write_file` 等工具参数中**不再包含 `workspaceId`**。
- **write_file (原 put_artifact)**:
  - 接口：`write_file(path, content)`
  - 逻辑：获取 `Workspace` 对象后调用 `ws.writeFile(path, content, { operator: ctx.agentId, messageId: ctx.messageId })`。
- **read_file (原 get_artifact)**:
  - 接口：`read_file(path)`
  - 逻辑：获取 `Workspace` 对象后调用 `ws.readFile(path)`。
- **delete_file (新增)**:
  - 接口：`delete_file(path)`
  - 逻辑：调用 `ws.deleteFile(path, { operator: ctx.agentId, messageId: ctx.messageId })`。
- **list_files**:
  - 接口：`list_files([subDir])`
  - 逻辑：获取 `Workspace` 对象后调用 `ws.listFiles(subDir)`。
  - **注意**：仅返回文件列表数据，不触发 UI 展示。
- **show_files (原 show_artifacts 的 UI 职责)**:
  - 接口：`show_files(paths)`
  - 逻辑：接受一个或多个文件相对路径，向前端返回特定的 UI 指令/数据结构，使这些文件在聊天界面或工件面板中高亮展示，引起用户注意。
  - **返回值**：返回包含文件元数据和 UI 展示指令的对象。

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

### 第五阶段：清理与废弃 (Final Cleanup)
1. **彻底删除**：删除 `src/platform/services/artifact/` 及其相关测试、引用。
**交付物**：干净、高效的单中心文件管理系统。

---

## 4. 关键设计约束

- **路径规范化**：所有 `relativePath` 在处理前必须进行规范化处理（正斜杠统一）。
- **元数据同步**：文件操作成功后，必须同步更新 `.workspace.json`，确保一致性。

## 5. 风险评估与切换策略

- **非兼容性重构**：本次重构为**破坏性变更**，不考虑任何向后兼容性。旧版工件系统和工作区系统的所有接口、文件结构、历史数据将被废弃。
- **全量切换**：系统启动后将直接启用全新的工作区管理逻辑，所有依赖模块必须同步完成接口适配。
- **清理工作**：重构完成后，旧有的工件存储目录和不符合新规范的工作区目录应进行清理。

---
**设计模式：**
- **Facade (外观模式)**：WorkspaceManager 作为文件系统的统一入口。
- **Strategy (策略模式)**：未来可以扩展不同的存储后端（如 S3、云盘）。
