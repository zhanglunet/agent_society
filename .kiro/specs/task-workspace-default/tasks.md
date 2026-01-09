# 实现计划: 任务工作空间默认能力

## 概述

本实现计划将任务工作空间默认能力分解为可执行的编码任务。实现采用增量方式，每个任务都建立在前一个任务的基础上。

## 任务列表

- [x] 1. 扩展 WorkspaceManager 支持懒加载
  - [x] 1.1 添加 assignWorkspace 方法（仅记录路径，不创建文件夹）
    - 在 `src/platform/workspace_manager.js` 中添加 `assignWorkspace(workspaceId, workspacePath)` 方法
    - 修改 `_workspaces` Map 的值结构，添加 `lazyCreated: boolean` 字段
    - 方法只记录工作空间信息，不调用 `mkdir`
    - _需求: 1.1, 1.3, 2.1_

  - [x] 1.2 添加 hasWorkspace 方法
    - 添加 `hasWorkspace(workspaceId)` 方法，检查工作空间是否已分配
    - 返回 boolean 值
    - _需求: 1.1_

  - [x] 1.3 修改 writeFile 支持懒加载创建
    - 修改 `writeFile` 方法，在首次写入时创建工作空间文件夹
    - 更新 `lazyCreated` 标志
    - _需求: 2.2, 3.1, 3.5_

  - [x] 1.4 修改 readFile 和 listFiles 处理不存在的工作空间
    - 修改 `readFile`，当工作空间文件夹不存在时返回 `file_not_found` 错误
    - 修改 `listFiles`，当工作空间文件夹不存在时返回空列表而不是错误
    - _需求: 2.3, 3.2, 3.3_

  - [x] 1.5 编写 WorkspaceManager 懒加载属性测试
    - **属性 1: 懒加载创建**
    - **验证: 需求 1.3, 2.1, 2.4**

  - [x] 1.6 编写文件读写往返属性测试
    - **属性 3: 文件读写往返**
    - **验证: 需求 3.1, 3.2**

- [x] 2. 扩展 Runtime 支持工作空间分配和查找
  - [x] 2.1 添加 findWorkspaceIdForAgent 方法
    - 在 `src/platform/runtime.js` 中添加 `findWorkspaceIdForAgent(agentId)` 方法
    - 实现祖先链向上查找逻辑
    - 使用 `_agentMetaById` 获取父智能体信息
    - 使用 `workspaceManager.hasWorkspace()` 检查工作空间
    - _需求: 7.1, 7.2_

  - [x] 2.2 修改 spawnAgent 自动分配工作空间
    - 修改 `spawnAgent` 方法
    - 当 `parentAgentId === "root"` 时，调用 `workspaceManager.assignWorkspace()`
    - 工作空间路径格式: `{dataDir}/workspaces/{agentId}`
    - _需求: 1.1, 1.2_

  - [x] 2.3 编写工作空间继承属性测试
    - **属性 6: 工作空间继承（通过祖先链查找）**
    - **验证: 需求 1.4, 5.2, 7.1, 7.2**

  - [x] 2.4 编写新工作空间分配属性测试
    - **属性 8: 新工作空间分配**
    - **验证: 需求 7.3**

- [x] 3. 检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户询问。

- [x] 4. 添加工作空间文件操作工具
  - [x] 4.1 添加 write_file 工具定义和处理
    - 在 `getToolDefinitions()` 中添加 `write_file` 工具定义
    - 在工具处理逻辑中添加 `write_file` 处理
    - 调用 `findWorkspaceIdForAgent` 获取工作空间
    - 调用 `workspaceManager.writeFile` 执行写入
    - _需求: 3.1, 3.4_

  - [x] 4.2 添加 read_file 工具定义和处理
    - 在 `getToolDefinitions()` 中添加 `read_file` 工具定义
    - 在工具处理逻辑中添加 `read_file` 处理
    - _需求: 3.2, 3.4_

  - [x] 4.3 添加 list_files 工具定义和处理
    - 在 `getToolDefinitions()` 中添加 `list_files` 工具定义
    - 在工具处理逻辑中添加 `list_files` 处理
    - _需求: 3.3, 3.4_

  - [x] 4.4 添加 get_workspace_info 工具定义和处理
    - 在 `getToolDefinitions()` 中添加 `get_workspace_info` 工具定义
    - 在工具处理逻辑中添加 `get_workspace_info` 处理
    - _需求: 6.1, 6.2, 6.3_

  - [x] 4.5 编写路径遍历防护属性测试
    - **属性 5: 路径遍历防护**
    - **验证: 需求 4.1, 4.2, 4.3**
    - 已在 workspace_manager.test.js 中实现 Property 1: 路径安全验证

- [x] 5. 添加工作空间隔离验证
  - [x] 5.1 确保路径安全检查在所有文件操作中生效
    - 验证 `_isPathSafe` 方法在 writeFile、readFile、listFiles 中被调用
    - 确保拒绝包含 `..` 的路径
    - 确保拒绝绝对路径
    - _需求: 4.1, 4.2, 4.3, 4.4_

  - [x] 5.2 编写工作空间隔离属性测试
    - **属性 7: 工作空间隔离**
    - **验证: 需求 5.1**
    - 已在 runtime_workspace.test.js 中实现 Property 9: 工作空间隔离

- [x] 6. 检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户询问。

- [x] 7. 集成测试和文档
  - [x] 7.1 编写端到端集成测试
    - 测试完整流程：root 创建子智能体 → 子智能体写入文件 → 孙智能体读取文件
    - 验证工作空间隔离：不同任务的智能体无法访问彼此的文件
    - _需求: 1.4, 5.3, 7.1_
    - 已在 runtime_workspace.test.js 中实现

  - [x] 7.2 编写写入触发创建属性测试
    - **属性 2: 写入触发创建**
    - **验证: 需求 2.2**
    - 已在 workspace_manager.test.js 中实现 Property 6: 写入触发创建

  - [x] 7.3 编写空工作空间列出属性测试
    - **属性 4: 空工作空间列出**
    - **验证: 需求 2.3**
    - 已在 workspace_manager.test.js 中实现 Property 7: 空工作空间列出

  - [x] 7.4 编写自动创建父目录属性测试
    - **属性 9: 自动创建父目录**
    - **验证: 需求 3.5**
    - 已在 workspace_manager.test.js 中实现 Property 8: 自动创建父目录

  - [x] 7.5 编写工作空间信息准确性属性测试
    - **属性 10: 工作空间信息准确性**
    - **验证: 需求 6.1, 6.2, 6.3**
    - 已在 workspace_manager.test.js 中实现 Property 9: 工作空间信息准确性

- [x] 8. 最终检查点 - 确保所有测试通过
  - 确保所有测试通过，如有问题请向用户询问。
  - 所有 19 个测试通过

## 备注

- 每个任务都引用了具体的需求以便追溯
- 检查点任务用于确保增量验证
- 属性测试验证通用的正确性属性
- 单元测试验证具体的示例和边界情况
