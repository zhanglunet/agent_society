# 删除 spawn_agent 功能设计文档

## 设计概述

本设计文档描述如何全面删除 `spawn_agent` 功能，保留并优化 `spawn_agent_with_task` 作为唯一的智能体创建接口。

## 架构影响

### 当前架构
```
ToolExecutor
├── spawn_agent (待删除)
│   └── _executeSpawnAgent()
└── spawn_agent_with_task (保留)
    └── _executeSpawnAgentWithTask()
```

### 目标架构
```
ToolExecutor
└── spawn_agent_with_task (唯一接口)
    └── _executeSpawnAgentWithTask()
```

## 详细设计

### 1. 工具定义删除

**文件**: `src/platform/runtime/tool_executor.js`

**删除内容**:
```javascript
{
  type: "function",
  function: {
    name: "spawn_agent",
    description: "...",
    parameters: { ... }
  }
}
```

**保留内容**:
```javascript
{
  type: "function", 
  function: {
    name: "spawn_agent_with_task",
    description: "创建智能体实例并立即发送任务消息...",
    parameters: { ... }
  }
}
```

### 2. 方法实现删除

**删除方法**: `_executeSpawnAgent(ctx, args)`
- 完整删除方法实现
- 删除 switch case 中的对应分支

**保留方法**: `_executeSpawnAgentWithTask(ctx, args)`
- 保持现有实现不变
- 这是唯一的智能体创建入口

### 3. 工具权限更新

**文件**: `src/platform/runtime/runtime_tools.js`

**修改**: 从工具列表中移除 `spawn_agent`
```javascript
// 修改前
const orgTools = ["find_role_by_name", "create_role", "spawn_agent", "spawn_agent_with_task", "terminate_agent", "send_message"];

// 修改后  
const orgTools = ["find_role_by_name", "create_role", "spawn_agent_with_task", "terminate_agent", "send_message"];
```

### 4. 测试用例处理

#### 4.1 删除专用测试文件
- `test/platform/spawn_agent_enhanced.test.js` - 完整删除

#### 4.2 更新通用测试文件
**文件**: `test/platform/tool_executor.test.js`
- 删除 `spawn_agent` 相关测试用例
- 保留 `spawn_agent_with_task` 测试
- 更新工具列表验证

**文件**: `test/platform/runtime_tools.test.js`  
- 更新工具权限测试
- 移除 `spawn_agent` 权限检查

**文件**: `test/platform/runtime.test.js`
- 将 `spawn_agent` 测试逻辑迁移到 `spawn_agent_with_task`
- 保持测试覆盖的业务逻辑不变

### 5. 文档更新

#### 5.1 工具文档
**文件**: `docs/tools.md`
- 删除 `spawn_agent` 章节
- 强调 `spawn_agent_with_task` 为唯一接口
- 更新使用示例

#### 5.2 示例文档  
**文件**: `docs/examples.md`
- 将所有 `spawn_agent` 示例改为 `spawn_agent_with_task`
- 更新最佳实践说明

#### 5.3 API文档
**文件**: `docs/api-reference.md`
- 更新工具列表
- 删除 `spawn_agent` API说明

#### 5.4 改进建议文档
**文件**: `docs/improvement-suggestions.md`
- 更新完成状态
- 记录删除决策

### 6. 提示词更新

**文件**: `config/prompts/tool_rules.txt`
- 删除 `spawn_agent` 使用说明
- 强调 `spawn_agent_with_task` 为标准做法
- 更新工具使用指导

### 7. 其他文件更新

#### 7.1 内容路由器
**文件**: `src/platform/services/artifact/content_router.js`
- 确保使用 `spawn_agent_with_task`
- 更新生成的指导文本

#### 7.2 模块文档
**文件**: `src/platform/runtime/runtime.md`
- 更新工具列表描述
- 删除 `spawn_agent` 引用

## 实现策略

### 阶段1: 核心代码删除
1. 删除工具定义
2. 删除方法实现  
3. 更新工具权限配置
4. 运行基础测试验证

### 阶段2: 测试用例更新
1. 删除专用测试文件
2. 更新通用测试文件
3. 迁移必要的测试逻辑
4. 确保测试覆盖率

### 阶段3: 文档同步更新
1. 更新所有技术文档
2. 更新示例代码
3. 更新提示词模板
4. 验证文档一致性

### 阶段4: 全面验证
1. 运行完整测试套件
2. 验证系统启动正常
3. 检查功能完整性
4. 确认无遗留引用

## 质量保证

### 代码质量检查
- 搜索确认无 `spawn_agent` 残留
- 确保所有测试通过
- 验证工具列表正确

### 功能完整性检查  
- 智能体创建功能正常
- 任务分配流程正确
- 系统稳定性不受影响

### 文档一致性检查
- 所有文档同步更新
- 示例代码可执行
- 提示词准确无误

## 风险缓解

### 测试失败风险
- **缓解**: 逐步删除，每步验证
- **回滚**: 保留git历史，可快速回滚

### 遗漏引用风险  
- **缓解**: 使用全局搜索确认
- **检测**: 运行时错误监控

### 文档不一致风险
- **缓解**: 系统性检查所有文档
- **验证**: 交叉引用检查

## 性能影响

### 正面影响
- 减少工具调用次数
- 降低内存占用
- 简化代码路径

### 无负面影响
- 核心逻辑不变
- 现有功能保持
- 性能不会下降

## 兼容性说明

这是一个**破坏性变更**，不提供向后兼容性：
- 现有使用 `spawn_agent` 的代码将失效
- 需要手动迁移到 `spawn_agent_with_task`
- 不提供过渡期或兼容模式

## 验收标准

### 代码层面
- [ ] `spawn_agent` 工具定义已删除
- [ ] `_executeSpawnAgent` 方法已删除  
- [ ] 工具权限配置已更新
- [ ] 所有相关测试已删除或更新

### 功能层面
- [ ] `spawn_agent_with_task` 功能正常
- [ ] 智能体创建流程无异常
- [ ] 系统启动无错误
- [ ] 现有功能不受影响

### 文档层面
- [ ] 所有文档已更新
- [ ] 示例代码已修正
- [ ] 提示词已同步
- [ ] 无遗留引用

### 测试层面
- [ ] 所有测试用例通过
- [ ] 测试覆盖率保持
- [ ] 无测试失败或错误
- [ ] 性能测试正常