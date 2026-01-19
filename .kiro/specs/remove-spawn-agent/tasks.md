# 删除 spawn_agent 功能任务列表

## 1. 核心代码删除

### 1.1 删除工具定义和实现
- [ ] 1.1.1 从 `src/platform/runtime/tool_executor.js` 删除 `spawn_agent` 工具定义
- [ ] 1.1.2 从 `src/platform/runtime/tool_executor.js` 删除 `_executeSpawnAgent` 方法实现
- [ ] 1.1.3 从 `executeToolCall` switch 语句中删除 `spawn_agent` case
- [ ] 1.1.4 验证 `spawn_agent_with_task` 功能保持完整

### 1.2 更新工具权限配置
- [ ] 1.2.1 从 `src/platform/runtime/runtime_tools.js` 的工具列表中移除 `spawn_agent`
- [ ] 1.2.2 验证工具权限检查逻辑正确
- [ ] 1.2.3 确保 root 智能体仍可使用 `spawn_agent_with_task`

## 2. 测试用例更新

### 2.1 删除专用测试文件
- [ ] 2.1.1 删除 `test/platform/spawn_agent_enhanced.test.js` 文件
- [ ] 2.1.2 确认该文件中的重要测试逻辑已在其他地方覆盖

### 2.2 更新通用测试文件
- [ ] 2.2.1 更新 `test/platform/tool_executor.test.js`
  - [ ] 删除 `spawn_agent` 相关测试用例
  - [ ] 更新工具列表验证测试
  - [ ] 保留 `spawn_agent_with_task` 测试
- [ ] 2.2.2 更新 `test/platform/runtime_tools.test.js`
  - [ ] 移除 `spawn_agent` 权限检查测试
  - [ ] 更新工具列表验证
- [ ] 2.2.3 更新 `test/platform/runtime.test.js`
  - [ ] 将 `spawn_agent` 测试逻辑迁移到 `spawn_agent_with_task`
  - [ ] 保持业务逻辑测试覆盖不变
- [ ] 2.2.4 更新 `test/platform/integration.test.js`
  - [ ] 将 `spawn_agent` 调用改为 `spawn_agent_with_task`
- [ ] 2.2.5 更新 `test/platform/llm_handler.test.js`
  - [ ] 移除 `spawn_agent` 相关的工具调用检测测试

### 2.3 运行测试验证
- [ ] 2.3.1 运行单元测试确保无失败
- [ ] 2.3.2 运行集成测试确保功能正常
- [ ] 2.3.3 验证测试覆盖率保持在合理水平

## 3. 文档更新

### 3.1 技术文档更新
- [ ] 3.1.1 更新 `docs/tools.md`
  - [ ] 删除 `spawn_agent` 章节
  - [ ] 强调 `spawn_agent_with_task` 为唯一接口
  - [ ] 更新工具使用说明
- [ ] 3.1.2 更新 `docs/api-reference.md`
  - [ ] 从工具列表中移除 `spawn_agent`
  - [ ] 更新 Task Brief 使用说明
- [ ] 3.1.3 更新 `docs/examples.md`
  - [ ] 将所有 `spawn_agent` 示例改为 `spawn_agent_with_task`
  - [ ] 更新最佳实践章节
- [ ] 3.1.4 更新 `docs/improvement-suggestions.md`
  - [ ] 标记 `spawn_agent` 删除为已完成
  - [ ] 记录删除决策和原因

### 3.2 模块文档更新
- [ ] 3.2.1 更新 `src/platform/runtime/runtime.md`
  - [ ] 删除 `spawn_agent` 工具描述
  - [ ] 更新工具分类说明
- [ ] 3.2.2 检查其他 `.md` 文件中的 `spawn_agent` 引用并更新

### 3.3 规范文档更新
- [ ] 3.3.1 更新 `.kiro/specs/agent-society-refactoring/design.md`
  - [ ] 移除 `spawn_agent` 相关流程描述
- [ ] 3.3.2 更新 `.kiro/specs/agent-society-refactoring/compatibility-cleanup-report.md`
  - [ ] 记录 `spawn_agent` 删除情况

## 4. 提示词和配置更新

### 4.1 提示词模板更新
- [ ] 4.1.1 检查 `config/prompts/` 目录下所有文件
- [ ] 4.1.2 删除 `spawn_agent` 相关说明
- [ ] 4.1.3 强调使用 `spawn_agent_with_task` 的指导
- [ ] 4.1.4 更新工具使用规则和最佳实践

### 4.2 配置文件检查
- [ ] 4.2.1 检查 `config/` 目录下是否有 `spawn_agent` 相关配置
- [ ] 4.2.2 确保配置文件与代码变更保持一致

## 5. 代码中的引用更新

### 5.1 服务模块更新
- [ ] 5.1.1 更新 `src/platform/services/artifact/content_router.js`
  - [ ] 确保生成的指导文本使用 `spawn_agent_with_task`
  - [ ] 验证工件处理流程正确

### 5.2 其他模块检查
- [ ] 5.2.1 搜索整个 `src/` 目录确认无遗漏的 `spawn_agent` 引用
- [ ] 5.2.2 检查注释和字符串中的引用
- [ ] 5.2.3 更新相关的错误消息和日志

## 6. 全面验证

### 6.1 代码完整性验证
- [ ] 6.1.1 全局搜索 `spawn_agent` 确认只剩 `spawn_agent_with_task`
- [ ] 6.1.2 验证所有工具调用路径正确
- [ ] 6.1.3 确认无语法错误或引用错误

### 6.2 功能完整性验证
- [ ] 6.2.1 启动系统确认无错误
- [ ] 6.2.2 测试智能体创建功能
- [ ] 6.2.3 验证任务分配流程
- [ ] 6.2.4 确认现有功能不受影响

### 6.3 性能验证
- [ ] 6.3.1 对比删除前后的性能指标
- [ ] 6.3.2 确认内存使用优化
- [ ] 6.3.3 验证响应时间改善

## 7. 最终清理

### 7.1 代码清理
- [ ] 7.1.1 删除无用的导入和依赖
- [ ] 7.1.2 清理注释中的过时信息
- [ ] 7.1.3 优化代码结构和格式

### 7.2 文档最终检查
- [ ] 7.2.1 交叉检查所有文档的一致性
- [ ] 7.2.2 确认示例代码可执行
- [ ] 7.2.3 验证链接和引用正确

### 7.3 提交准备
- [ ] 7.3.1 整理提交信息
- [ ] 7.3.2 准备变更说明
- [ ] 7.3.3 记录破坏性变更影响

## 验收标准

### 代码层面验收
- [ ] 搜索 `spawn_agent` 只返回 `spawn_agent_with_task` 相关结果
- [ ] 所有测试用例通过（100% 通过率）
- [ ] 系统启动无错误或警告
- [ ] 工具列表中不包含 `spawn_agent`

### 功能层面验收  
- [ ] 智能体创建功能完全正常
- [ ] 任务分配流程无异常
- [ ] 现有业务功能不受影响
- [ ] 性能有所提升（减少工具调用）

### 文档层面验收
- [ ] 所有文档已同步更新
- [ ] 示例代码使用正确的工具
- [ ] 提示词准确反映当前功能
- [ ] 无遗留的错误引用

## 风险控制

### 高风险任务
- 1.1.2 删除 `_executeSpawnAgent` 方法 - 可能影响系统稳定性
- 2.2.3 迁移 runtime.test.js 测试逻辑 - 可能丢失重要测试覆盖

### 风险缓解措施
- 每个阶段完成后立即运行测试
- 保留详细的git提交历史便于回滚
- 优先处理核心功能，最后处理文档
- 分步骤验证，确保每步都正确

## 完成标准

当所有任务项都标记为完成 ✅ 且通过所有验收标准时，本次删除工作即告完成。