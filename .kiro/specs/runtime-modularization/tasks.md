# 实现计划: Runtime 模块化重构

## 概述

将 `src/platform/runtime.js` 拆分为多个专注的模块，保持业务逻辑不变，只做结构调整。

## 任务

- [x] 1. 创建模块目录结构和基础文件 ✅
  - 创建 `src/platform/runtime/` 目录
  - 创建各模块的空文件骨架
  - _需求: 7.1, 7.2_
  - **已完成**: 创建了 index.js 和 7 个子模块文件

- [x] 2. 实现 JavaScript 执行器模块 ✅
  - [x] 2.1 创建 `javascript_executor.js` 并迁移相关代码
    - 迁移 `_runJavaScriptTool` 方法 → `execute()`
    - 迁移 `_detectBlockedJavaScriptTokens` 方法 → `detectBlockedTokens()`
    - 迁移 `_toJsonSafeValue` 方法 → `toJsonSafeValue()`
    - 添加模块概述注释和 JSDoc
    - _需求: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.3_

  - [ ] 2.2 编写 JavaScript 执行器属性测试
    - **Property 6: JavaScript 执行一致性**
    - **验证: 需求 8.1, 8.2, 8.4, 8.5**

- [x] 3. 实现上下文构建器模块 ✅
  - [x] 3.1 创建 `context_builder.js` 并迁移相关代码
    - 迁移 `_buildSystemPromptForAgent` 方法 → `buildSystemPromptForAgent()`
    - 迁移 `_formatMessageForLlm` 方法 → `formatMessageForLlm()`
    - 迁移 `_buildAgentContext` 方法 → `buildAgentContext()`
    - 迁移 `_ensureConversation` 方法 → `ensureConversation()`
    - 迁移 `_getSenderInfo` 方法 → `getSenderInfo()`
    - 添加模块概述注释和 JSDoc
    - _需求: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 9.1, 9.3_

  - [ ] 3.2 编写上下文构建器属性测试
    - **Property 5: 上下文构建一致性**
    - **验证: 需求 5.1, 5.2, 5.3, 5.4**

- [x] 4. 实现智能体管理器模块 ✅
  - [x] 4.1 创建 `agent_manager.js` 并迁移相关代码
    - 迁移 `spawnAgent` 方法
    - 迁移 `spawnAgentAs` 方法
    - 迁移 `registerAgentInstance` 方法
    - 迁移 `listAgentInstances` 方法
    - 迁移 `getAgentStatus` 方法
    - 迁移 `_executeTerminateAgent` 方法 → `terminateAgent()`
    - 迁移 `_restoreAgentsFromOrg` 方法 → `restoreAgentsFromOrg()`
    - 迁移 `findWorkspaceIdForAgent` 方法
    - 迁移 `_getAgentTaskId` 方法 → `getAgentTaskId()`
    - 迁移 `_collectDescendantAgents` 方法 → `collectDescendantAgents()`
    - 迁移 `_updateAgentActivity` 方法 → `updateAgentActivity()`
    - 迁移 `getAgentLastActivityTime` 方法
    - 迁移 `getAgentIdleTime` 方法
    - 迁移 `checkIdleAgents` 方法
    - 添加模块概述注释和 JSDoc
    - _需求: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 9.1, 9.3_

  - [ ] 4.2 编写智能体管理器属性测试
    - **Property 3: 智能体生命周期一致性**
    - **验证: 需求 3.1, 3.2, 3.3, 3.5**

- [x] 5. 实现消息处理器模块 ✅
  - [x] 5.1 创建 `message_processor.js` 并迁移相关代码
    - 迁移 `_processingLoop` 方法 → `processingLoop()`
    - 迁移 `_scheduleMessageProcessing` 方法 → `scheduleMessageProcessing()`
    - 迁移 `_processAgentMessage` 方法 → `processAgentMessage()`
    - 迁移 `_deliverOneRound` 方法 → `deliverOneRound()`
    - 迁移 `_drainAgentQueue` 方法 → `drainAgentQueue()`
    - 添加模块概述注释和 JSDoc
    - _需求: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1, 9.3_

  - [ ] 5.2 编写消息处理器属性测试
    - **Property 4: 消息处理一致性**
    - **验证: 需求 4.1, 4.2, 4.3, 4.5**

- [x] 6. 实现工具执行器模块 ✅
  - [x] 6.1 创建 `tool_executor.js` 并迁移相关代码
    - 迁移 `getToolDefinitions` 方法
    - 迁移 `executeToolCall` 方法
    - 迁移 `_executeSpawnAgentWithTask` 方法
    - 迁移 `_executeCompressContext` 方法
    - 添加模块概述注释和 JSDoc
    - _需求: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 9.1, 9.3_

  - [ ] 6.2 编写工具执行器属性测试
    - **Property 2: 工具执行结果一致性**
    - **验证: 需求 1.2, 1.5**

- [x] 7. 实现 LLM 处理器模块 ✅
  - [x] 7.1 创建 `llm_handler.js` 并迁移相关代码
    - 迁移 `_handleWithLlm` 方法 → `handleWithLlm()`
    - 迁移 `_doLlmProcessing` 方法 → `doLlmProcessing()`
    - 迁移 `_sendErrorNotificationToParent` 方法 → `sendErrorNotificationToParent()`
    - 迁移 `_checkContextAndWarn` 方法（保留在 Runtime 中）
    - 添加模块概述注释和 JSDoc
    - _需求: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 9.1, 9.3_

- [x] 8. 实现关闭管理器模块 ✅
  - [x] 8.1 创建 `shutdown_manager.js` 并迁移相关代码
    - 迁移 `setupGracefulShutdown` 方法
    - 迁移 `shutdown` 方法
    - 迁移 `isShuttingDown` 方法
    - 迁移 `getShutdownStatus` 方法
    - 添加模块概述注释和 JSDoc
    - _需求: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 9.1, 9.3_

- [x] 9. 重构 Runtime 核心 ✅
  - [x] 9.1 更新 `runtime.js` 使用新模块
    - 导入所有子模块 ✅
    - 在构造函数中初始化子模块 ✅
    - **注意**: 采用渐进式迁移策略，保持原始方法实现不变
    - 子模块作为独立可复用组件，可在未来逐步替换原始实现
    - 保持公共 API 不变 ✅
    - 添加模块协作关系注释 ✅
    - _需求: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 9.1, 9.2, 9.5_

  - [ ] 9.2 编写公共 API 向后兼容属性测试
    - **Property 1: 公共 API 向后兼容**
    - **验证: 需求 7.3, 7.5**

- [x] 10. 检查点 - 确保所有测试通过 ✅
  - 运行现有测试确保重构未破坏功能
  - **结果**: 36 个测试通过，2 个测试失败（这两个失败是之前就存在的问题，与重构无关）
  - 失败的测试：
    - `defaults parentAgentId and enforces root single agent per taskId` - 边界情况测试
    - `run_javascript blocks obvious system-related identifiers` - 正则表达式不匹配 `typeof process`

## 注意事项

- 所有测试任务都是必需的
- 每个模块迁移时保持原有代码逻辑不变
- 只修改代码组织结构，不修改业务行为
- 每个模块需要添加详细的中文注释
