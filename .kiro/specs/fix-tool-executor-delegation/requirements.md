# Requirements Document

## Introduction

修复工具执行架构问题：`runtime.js` 中的 `executeToolCall` 方法应该委托给 `_toolExecutor.executeToolCall()`，而不是重复实现工具执行逻辑。当前实现导致某些工具（如 `get_artifact`、`put_artifact`）在 `runtime.js` 中缺少处理分支，返回 `unknown_tool` 错误。

## Glossary

- **Runtime**: 运行时核心类，负责协调各个子模块
- **ToolExecutor**: 工具执行器子模块，负责定义和执行所有工具
- **executeToolCall**: 执行工具调用的方法
- **Delegation**: 委托模式，将职责转交给专门的子模块处理

## Requirements

### Requirement 1: 工具执行委托

**User Story:** 作为系统架构师，我希望 Runtime 将工具执行委托给 ToolExecutor 子模块，以避免代码重复和不一致。

#### Acceptance Criteria

1. WHEN Runtime 收到工具调用请求，THE Runtime SHALL 委托给 ToolExecutor 处理
2. WHEN ToolExecutor 处理工具调用，THE ToolExecutor SHALL 返回执行结果给 Runtime
3. THE Runtime SHALL NOT 重复实现工具执行逻辑
4. THE Runtime SHALL 保留模块工具的特殊处理逻辑（因为模块工具不在 ToolExecutor 中）

### Requirement 2: 向后兼容性

**User Story:** 作为开发者，我希望重构不会破坏现有功能，所有工具调用应该继续正常工作。

#### Acceptance Criteria

1. WHEN 重构完成后，THE System SHALL 支持所有现有工具调用
2. WHEN 智能体调用任何工具，THE System SHALL 返回正确的执行结果
3. THE System SHALL 保持相同的错误处理行为
4. THE System SHALL 保持相同的日志记录行为

### Requirement 3: 代码清理

**User Story:** 作为维护者，我希望移除重复的工具执行代码，使代码库更易维护。

#### Acceptance Criteria

1. WHEN 重构完成后，THE Runtime SHALL NOT 包含重复的工具执行逻辑
2. THE ToolExecutor SHALL 是工具执行的唯一实现位置
3. THE Runtime SHALL 只保留必要的协调逻辑
4. THE Code SHALL 遵循单一职责原则

### Requirement 4: 错误修复验证

**User Story:** 作为用户，我希望 `get_artifact` 和 `put_artifact` 工具能够正常工作。

#### Acceptance Criteria

1. WHEN 智能体调用 `get_artifact`，THE System SHALL 成功读取工件内容
2. WHEN 智能体调用 `put_artifact`，THE System SHALL 成功写入工件
3. THE System SHALL NOT 返回 `unknown_tool` 错误对于已定义的工具
4. THE System SHALL 正确处理工件的二进制内容路由
