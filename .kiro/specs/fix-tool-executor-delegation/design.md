# Design Document: Fix Tool Executor Delegation

## Overview

本设计文档描述如何修复 Runtime 中的工具执行架构问题。当前 `runtime.js` 重复实现了工具执行逻辑，导致与 `ToolExecutor` 子模块不一致。解决方案是让 `runtime.js` 的 `executeToolCall` 方法委托给 `_toolExecutor.executeToolCall()`，消除代码重复并确保所有工具都能正确执行。

## Architecture

### Current Architecture (Problem)

```
Runtime.executeToolCall()
├── 检查模块工具 (moduleLoader)
├── if (toolName === "find_role_by_name") { ... }
├── if (toolName === "create_role") { ... }
├── if (toolName === "spawn_agent") { ... }
├── ... (20+ 个 if 分支)
└── default: return { error: "unknown_tool" }

ToolExecutor.executeToolCall()  // 从未被调用！
├── 检查模块工具 (moduleLoader)
├── switch (toolName)
│   ├── case "find_role_by_name": ...
│   ├── case "create_role": ...
│   ├── case "get_artifact": ...  // ✓ 已实现
│   ├── case "put_artifact": ...  // ✓ 已实现
│   └── default: return { error: "unknown_tool" }
```

**问题**：
- Runtime 和 ToolExecutor 都实现了工具执行逻辑
- Runtime 缺少 `get_artifact` 和 `put_artifact` 的处理
- 代码重复，难以维护

### Target Architecture (Solution)

```
Runtime.executeToolCall()
├── 检查模块工具 (moduleLoader) - 特殊处理
└── 委托给 _toolExecutor.executeToolCall()

ToolExecutor.executeToolCall()
├── 检查模块工具 (moduleLoader)
├── switch (toolName)
│   ├── case "find_role_by_name": ...
│   ├── case "create_role": ...
│   ├── case "get_artifact": ...
│   ├── case "put_artifact": ...
│   └── default: return { error: "unknown_tool" }
```

**优势**：
- 单一职责：ToolExecutor 负责所有工具执行
- 无代码重复
- 易于添加新工具
- 所有工具都能正确执行

## Components and Interfaces

### Runtime.executeToolCall()

**职责**：
- 接收工具调用请求
- 处理模块工具的特殊逻辑（如果需要）
- 委托给 ToolExecutor

**接口**：
```javascript
/**
 * 执行一次工具调用并返回可序列化结果。
 * @param {any} ctx - 智能体上下文
 * @param {string} toolName - 工具名称
 * @param {any} args - 工具参数
 * @returns {Promise<any>} 执行结果
 */
async executeToolCall(ctx, toolName, args)
```

**实现策略**：
```javascript
async executeToolCall(ctx, toolName, args) {
  try {
    void this.log.debug("执行工具调用", {
      agentId: ctx.agent?.id ?? null,
      toolName,
      args: args ?? null
    });
    
    // 委托给 ToolExecutor
    return await this._toolExecutor.executeToolCall(ctx, toolName, args);
  } catch (err) {
    const message = err && typeof err.message === "string" 
      ? err.message 
      : String(err ?? "unknown error");
    void this.log.error("工具调用执行失败", { toolName, message });
    return { error: "tool_execution_failed", toolName, message };
  }
}
```

### ToolExecutor.executeToolCall()

**职责**：
- 执行所有工具调用
- 处理工具特定的逻辑
- 返回执行结果

**当前实现**：已经完整实现，无需修改

**包含的工具**：
- find_role_by_name
- create_role
- spawn_agent
- spawn_agent_with_task
- send_message
- put_artifact ✓
- get_artifact ✓
- console_print
- terminate_agent
- run_javascript
- compress_context
- get_context_status
- http_request
- read_file
- write_file
- list_files
- get_workspace_info
- run_command

## Data Models

无需修改数据模型。

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: 工具执行委托一致性

*For any* 工具调用请求（toolName, args），Runtime.executeToolCall() 的结果应该等于 ToolExecutor.executeToolCall() 的结果

**Validates: Requirements 1.1, 1.2**

### Property 2: 所有已定义工具可执行

*For any* 在 ToolExecutor.getToolDefinitions() 中定义的工具，调用该工具不应返回 `unknown_tool` 错误

**Validates: Requirements 2.1, 2.2, 4.3**

### Property 3: get_artifact 工具正常工作

*For any* 有效的工件引用，调用 get_artifact 应该返回工件内容或明确的错误（不是 `unknown_tool`）

**Validates: Requirements 4.1**

### Property 4: put_artifact 工具正常工作

*For any* 有效的工件内容，调用 put_artifact 应该返回工件引用或明确的错误（不是 `unknown_tool`）

**Validates: Requirements 4.2**

## Error Handling

### 错误传播

- ToolExecutor 中的错误应该正确传播到 Runtime
- 保持现有的错误格式和错误码
- 保持现有的日志记录行为

### 错误类型

- `unknown_tool`: 工具不存在
- `tool_execution_failed`: 工具执行过程中发生异常
- 工具特定的错误（如 `artifact_not_found`）

## Testing Strategy

### Unit Tests

1. **测试 Runtime 委托行为**
   - 验证 Runtime.executeToolCall() 调用 ToolExecutor.executeToolCall()
   - 验证错误正确传播

2. **测试 get_artifact 工具**
   - 测试读取存在的工件
   - 测试读取不存在的工件
   - 测试二进制内容路由

3. **测试 put_artifact 工具**
   - 测试写入文本工件
   - 测试写入二进制工件

### Property-Based Tests

1. **Property 1: 工具执行委托一致性**
   - 生成随机工具调用
   - 验证结果一致性

2. **Property 2: 所有已定义工具可执行**
   - 遍历所有工具定义
   - 验证每个工具都能执行（不返回 unknown_tool）

### Integration Tests

1. **端到端测试**
   - 创建智能体
   - 让智能体调用 get_artifact 和 put_artifact
   - 验证工具正常工作

## Implementation Notes

### 重构步骤

1. **第一步：简化 Runtime.executeToolCall()**
   - 移除所有 if 分支
   - 添加对 _toolExecutor.executeToolCall() 的委托
   - 保留 try-catch 错误处理

2. **第二步：验证功能**
   - 运行现有测试
   - 确保所有工具调用正常工作

3. **第三步：测试 get_artifact 和 put_artifact**
   - 创建测试用例
   - 验证工具正常工作

### 向后兼容性

- 保持相同的方法签名
- 保持相同的返回值格式
- 保持相同的错误处理行为
- 保持相同的日志记录

### 性能考虑

- 委托调用的性能开销可忽略不计
- 无需额外的数据复制
- 保持相同的异步执行模式
