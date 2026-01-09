# 设计文档

## 概述

本设计文档描述了任务工作空间默认能力的实现方案。核心思想是：当 root 智能体创建直接子级智能体时，系统自动为该智能体分配一个独立的工作空间，该工作空间由该智能体及其所有后代共享。

工作空间采用懒加载策略，只有在实际写入文件时才创建文件夹。智能体通过相对路径操作文件，无法感知工作空间的绝对路径。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                        Runtime                               │
│  ┌─────────────────┐  ┌─────────────────────────────────┐   │
│  │ WorkspaceManager│  │        工具调用处理               │   │
│  │                 │  │                                   │   │
│  │ - _workspaces   │◄─┤  1. 获取调用者 agentId            │   │
│  │ - assignWorkspace│  │  2. 向上查找祖先链               │   │
│  │ - writeFile     │  │  3. 找到第一个有工作空间的祖先    │   │
│  │ - readFile      │  │  4. 使用该工作空间执行操作        │   │
│  │ - listFiles     │  │                                   │   │
│  └─────────────────┘  └─────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │                   spawnAgent                         │    │
│  │  if parentAgentId === "root":                        │    │
│  │    workspaceId = newAgentId                          │    │
│  │    assignWorkspace(workspaceId, path)                │    │
│  │  // 非 root 子智能体不需要任何工作空间操作            │    │
│  │  // 工作空间通过运行时查找祖先链来确定                │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘

智能体层级与工作空间查找:
                    root
                   /    \
            agent-001   agent-004     ← root 的直接子智能体，各自有工作空间
               |           |
           agent-002   agent-005      ← 继承父智能体的工作空间（通过查找祖先链）
               |
           agent-003                  ← 继承 agent-001 的工作空间

当 agent-003 调用 write_file 时:
1. 获取 agent-003 的 parentAgentId = agent-002
2. agent-002 没有工作空间，继续向上
3. 获取 agent-002 的 parentAgentId = agent-001
4. agent-001 有工作空间（因为是 root 的直接子智能体）
5. 使用 agent-001 的工作空间

文件系统:
{dataDir}/
└── workspaces/
    ├── {agent-001}/     # root 的第一个直接子智能体的工作空间
    │   ├── src/
    │   └── index.html
    └── {agent-004}/     # root 的第二个直接子智能体的工作空间
        └── main.py
```

## 组件和接口

### WorkspaceManager 扩展

现有的 `WorkspaceManager` 需要扩展以支持懒加载和基于 workspaceId 的绑定。

```javascript
class WorkspaceManager {
  /**
   * 工作空间映射: workspaceId -> { workspacePath, createdAt, lazyCreated }
   * @type {Map<string, {workspacePath: string, createdAt: string, lazyCreated: boolean}>}
   */
  _workspaces;

  /**
   * 为工作空间分配路径（懒加载，不立即创建文件夹）
   * @param {string} workspaceId - 工作空间ID（通常是 root 直接子智能体的 agentId）
   * @param {string} workspacePath - 工作空间绝对路径
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async assignWorkspace(workspaceId, workspacePath);

  /**
   * 获取工作空间路径（内部使用，不暴露给智能体）
   * @param {string} workspaceId
   * @returns {string|null}
   */
  getWorkspacePath(workspaceId);

  /**
   * 确保工作空间文件夹存在（懒加载创建）
   * @param {string} workspaceId
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async ensureWorkspaceExists(workspaceId);

  /**
   * 写入文件（触发懒加载创建）
   * @param {string} workspaceId
   * @param {string} relativePath
   * @param {string} content
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async writeFile(workspaceId, relativePath, content);

  /**
   * 读取文件
   * @param {string} workspaceId
   * @param {string} relativePath
   * @returns {Promise<{content?: string, error?: string}>}
   */
  async readFile(workspaceId, relativePath);

  /**
   * 列出目录内容
   * @param {string} workspaceId
   * @param {string} relativePath
   * @returns {Promise<{files?: Array<{name: string, type: string, size: number}>, error?: string}>}
   */
  async listFiles(workspaceId, relativePath);

  /**
   * 获取工作空间信息
   * @param {string} workspaceId
   * @returns {Promise<{fileCount: number, dirCount: number, totalSize: number, lastModified: string}|{error: string}>}
   */
  async getWorkspaceInfo(workspaceId);

  /**
   * 验证路径安全性
   * @param {string} workspacePath
   * @param {string} targetPath
   * @returns {boolean}
   */
  _isPathSafe(workspacePath, targetPath);
}
```

### Runtime 扩展

`Runtime` 需要扩展以支持工作空间的自动分配和通过祖先链查找。

```javascript
class Runtime {
  /**
   * 创建智能体时自动处理工作空间
   * @param {Object} input
   * @returns {Promise<Agent>}
   */
  async spawnAgent(input) {
    // ... 现有逻辑 ...
    
    // 工作空间处理：只有 root 的直接子智能体需要分配工作空间
    if (input.parentAgentId === "root") {
      const workspaceId = newAgent.id;
      const workspacePath = path.join(this.config.dataDir, "workspaces", workspaceId);
      await this.workspaceManager.assignWorkspace(workspaceId, workspacePath);
    }
    // 非 root 的子智能体不需要任何操作，工作空间通过查找祖先链确定
    
    return newAgent;
  }

  /**
   * 通过祖先链查找智能体的工作空间ID
   * 从当前智能体开始向上查找，直到找到第一个有工作空间的祖先
   * @param {string} agentId
   * @returns {string|null} 工作空间ID，如果没有则返回 null
   */
  findWorkspaceIdForAgent(agentId) {
    let currentAgentId = agentId;
    
    while (currentAgentId && currentAgentId !== "root" && currentAgentId !== "user") {
      // 检查当前智能体是否有工作空间
      if (this.workspaceManager.hasWorkspace(currentAgentId)) {
        return currentAgentId;
      }
      
      // 获取父智能体ID
      const meta = this._agentMetaById.get(currentAgentId);
      if (!meta || !meta.parentAgentId) {
        break;
      }
      currentAgentId = meta.parentAgentId;
    }
    
    return null;
  }
}
```

### 工具定义扩展

在 `getToolDefinitions()` 中添加工作空间相关工具：

```javascript
{
  type: "function",
  function: {
    name: "write_file",
    description: "在工作空间中写入文件。路径必须是相对路径。",
    parameters: {
      type: "object",
      properties: {
        path: { 
          type: "string", 
          description: "相对于工作空间的文件路径" 
        },
        content: { 
          type: "string", 
          description: "文件内容" 
        }
      },
      required: ["path", "content"]
    }
  }
},
{
  type: "function",
  function: {
    name: "read_file",
    description: "从工作空间读取文件内容。路径必须是相对路径。",
    parameters: {
      type: "object",
      properties: {
        path: { 
          type: "string", 
          description: "相对于工作空间的文件路径" 
        }
      },
      required: ["path"]
    }
  }
},
{
  type: "function",
  function: {
    name: "list_files",
    description: "列出工作空间中的文件和目录。路径必须是相对路径，默认为根目录。",
    parameters: {
      type: "object",
      properties: {
        path: { 
          type: "string", 
          description: "相对于工作空间的目录路径，默认为 '.'" 
        }
      }
    }
  }
},
{
  type: "function",
  function: {
    name: "get_workspace_info",
    description: "获取工作空间的统计信息，包括文件数量、目录数量、总大小等。",
    parameters: {
      type: "object",
      properties: {}
    }
  }
}
```

## 数据模型

### 工作空间记录

```javascript
// WorkspaceManager._workspaces: Map<workspaceId, WorkspaceRecord>
{
  workspaceId: string,      // 工作空间ID（root 直接子智能体的 agentId）
  workspacePath: string,    // 绝对路径
  createdAt: string,        // 分配时间（ISO 8601）
  lazyCreated: boolean      // 文件夹是否已实际创建
}
```

### 智能体元数据（现有）

```javascript
// Runtime._agentMetaById: Map<agentId, AgentMeta>
{
  id: string,               // 智能体ID
  roleId: string,           // 岗位ID
  parentAgentId: string     // 父智能体ID（用于祖先链查找）
}
```

### 工作空间查找流程

```
智能体调用 write_file("src/main.js", content)
    │
    ▼
Runtime.findWorkspaceIdForAgent(agentId)
    │
    ├─► 检查当前智能体是否有工作空间
    │   └─► 有 → 返回 workspaceId
    │
    ├─► 获取 parentAgentId
    │   └─► 递归检查父智能体
    │
    └─► 到达 root 或无父智能体 → 返回 null
    
    │
    ▼
WorkspaceManager.writeFile(workspaceId, "src/main.js", content)
```

## 正确性属性

正确性属性是一种特征或行为，应该在系统的所有有效执行中保持为真。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。

### 属性 1: 懒加载创建

**对于任意**工作空间，在分配后且未写入任何文件之前，对应的文件夹不应存在于文件系统中。

**验证: 需求 1.3, 2.1, 2.4**

### 属性 2: 写入触发创建

**对于任意**工作空间和任意有效的相对路径，当首次写入文件时，工作空间文件夹应被自动创建。

**验证: 需求 2.2**

### 属性 3: 文件读写往返

**对于任意**有效的文件内容和相对路径，写入文件后读取应返回相同的内容。

**验证: 需求 3.1, 3.2**

### 属性 4: 空工作空间列出

**对于任意**未写入过文件的工作空间，调用 list_files 应返回空列表而不是错误。

**验证: 需求 2.3**

### 属性 5: 路径遍历防护

**对于任意**包含 ".." 或以 "/" 开头的路径，文件操作应被拒绝并返回 path_traversal_blocked 错误。

**验证: 需求 4.1, 4.2, 4.3**

### 属性 6: 工作空间继承（通过祖先链查找）

**对于任意**智能体，调用工作空间相关 API 时，应通过祖先链向上查找，使用第一个具有工作空间的祖先的工作空间。

**验证: 需求 1.4, 5.2, 7.1, 7.2**

### 属性 7: 工作空间隔离

**对于任意**两个由 root 直接创建的不同智能体，它们的工作空间路径应该不同。

**验证: 需求 5.1**

### 属性 8: 新工作空间分配

**对于任意**由 root 直接创建的智能体，其 workspaceId 应等于自己的 agentId。

**验证: 需求 7.3**

### 属性 9: 自动创建父目录

**对于任意**嵌套路径（如 "a/b/c.txt"），写入文件时应自动创建所有父目录。

**验证: 需求 3.5**

### 属性 10: 工作空间信息准确性

**对于任意**工作空间，get_workspace_info 返回的文件数量应等于工作空间中实际的文件数量。

**验证: 需求 6.1, 6.2, 6.3**

## 错误处理

### 错误类型

| 错误码 | 描述 | 触发条件 |
|--------|------|----------|
| `workspace_not_assigned` | 工作空间未分配 | 智能体没有关联的工作空间 |
| `path_traversal_blocked` | 路径遍历被阻止 | 路径包含 ".." 或是绝对路径 |
| `file_not_found` | 文件不存在 | 读取不存在的文件 |
| `permission_denied` | 权限被拒绝 | 文件系统权限问题 |
| `write_failed` | 写入失败 | 文件写入过程中出错 |
| `read_failed` | 读取失败 | 文件读取过程中出错 |

### 错误处理策略

1. **路径安全错误**: 立即拒绝，不执行任何文件操作
2. **文件不存在**: 返回明确的错误信息，不抛出异常
3. **权限错误**: 记录日志并返回错误信息
4. **工作空间未分配**: 返回错误，提示智能体没有工作空间

## 测试策略

### 单元测试

1. **WorkspaceManager 测试**
   - 测试 assignWorkspace 不创建文件夹
   - 测试 writeFile 触发文件夹创建
   - 测试 readFile 在文件不存在时返回错误
   - 测试 listFiles 在空工作空间返回空列表
   - 测试 _isPathSafe 拒绝危险路径

2. **Runtime 工作空间分配测试**
   - 测试 root 创建子智能体时分配新工作空间
   - 测试非 root 创建子智能体时不分配工作空间
   - 测试 findWorkspaceIdForAgent 正确查找祖先链

### 属性测试

使用 fast-check 进行属性测试，每个属性至少运行 100 次迭代。

1. **懒加载属性测试**: 生成随机工作空间ID，验证分配后文件夹不存在
2. **文件读写往返测试**: 生成随机文件内容和路径，验证写入后读取一致
3. **路径遍历防护测试**: 生成包含 ".." 的随机路径，验证被拒绝
4. **工作空间继承测试**: 生成随机智能体层级，验证通过祖先链查找正确
5. **工作空间隔离测试**: 生成多个 root 直接子智能体，验证路径不同
