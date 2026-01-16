# 设计文档：智能体并发请求管理（简化版）

## 概述

本设计实现一个简单的并发请求管理系统，确保每个智能体只维持一条LLM请求序列，并支持在工具调用循环中插话。

### 核心设计原则

1. **简单性**：插话逻辑集中在工具调用前检查，不需要复杂的状态管理
2. **最小侵入**：只修改LlmHandler的工具调用循环，不改变现有架构
3. **数据结构优先**：利用对话历史的数据结构特性，通过删除最后一条assistant消息实现插话

## 架构设计

### 高层流程

```
用户发送消息
    ↓
MessageBus检查智能体是否活跃
    ↓
    ├─ 不活跃 → 正常处理消息
    │
    └─ 活跃 → 加入插话队列
            ↓
        LLM处理循环
            ↓
        每次工具调用前检查插话
            ↓
            ├─ 无插话 → 执行工具调用
            │
            └─ 有插话 → 删除最后一条assistant消息
                      → 追加所有插话消息
                      → 清空插话队列
                      → 继续LLM循环
```

### 组件职责

1. **Runtime**
   - 维护 `_activeProcessingAgents` Set（已存在）
   - 维护 `_interruptionQueues` Map（新增）：存储每个智能体的插话消息数组
   - 提供 `addInterruption(agentId, message)` 方法
   - 提供 `getAndClearInterruptions(agentId)` 方法

2. **MessageBus**
   - 检查目标智能体是否在 `_activeProcessingAgents` 中
   - 如果活跃，调用 `Runtime.addInterruption()` 加入插话队列
   - 消息仍然正常入队（保持现有行为）

3. **LlmHandler**
   - 在 `doLlmProcessing()` 开始时标记智能体为活跃
   - 在工具调用循环中，每次执行工具前调用 `checkAndHandleInterruptions()`
   - 在LLM返回无工具调用时，调用 `checkAndHandleInterruptions()`
   - 处理完成后标记智能体为空闲

## 数据结构

### 插话队列

```javascript
// Runtime 中新增
_interruptionQueues: Map<string, Array<Message>>

// Message 结构
{
  id: string,
  from: string,
  to: string,
  payload: any,
  taskId?: string,
  createdAt: string
}
```

### 对话历史结构

```javascript
// 对话历史数组
[
  { role: "system", content: "..." },
  { role: "user", content: "..." },
  { role: "assistant", content: "...", tool_calls: [...] },  // ← 插话时删除这条
  { role: "tool", tool_call_id: "...", content: "..." },
  // ... 更多消息
]
```

## 核心方法设计

### 1. Runtime.addInterruption()

```javascript
/**
 * 添加插话消息到智能体的插话队列
 * @param {string} agentId - 智能体ID
 * @param {object} message - 插话消息
 */
addInterruption(agentId, message) {
  if (!this._interruptionQueues.has(agentId)) {
    this._interruptionQueues.set(agentId, []);
  }
  this._interruptionQueues.get(agentId).push(message);
  
  void this.log.info("添加插话消息", {
    agentId,
    messageFrom: message.from,
    queueLength: this._interruptionQueues.get(agentId).length
  });
}
```

### 2. Runtime.getAndClearInterruptions()

```javascript
/**
 * 获取并清空智能体的插话队列
 * @param {string} agentId - 智能体ID
 * @returns {Array<object>} 插话消息数组
 */
getAndClearInterruptions(agentId) {
  const interruptions = this._interruptionQueues.get(agentId) ?? [];
  this._interruptionQueues.delete(agentId);
  
  if (interruptions.length > 0) {
    void this.log.info("获取插话消息", {
      agentId,
      count: interruptions.length
    });
  }
  
  return interruptions;
}
```

### 3. LlmHandler.checkAndHandleInterruptions()

```javascript
/**
 * 检查并处理插话消息
 * @param {string} agentId - 智能体ID
 * @param {Array} conv - 对话历史
 * @param {object} ctx - 智能体上下文
 * @returns {boolean} 是否有插话被处理
 */
checkAndHandleInterruptions(agentId, conv, ctx) {
  const runtime = this.runtime;
  const interruptions = runtime.getAndClearInterruptions(agentId);
  
  if (interruptions.length === 0) {
    return false;
  }
  
  void runtime.log.info("处理插话消息", {
    agentId,
    count: interruptions.length
  });
  
  // 删除最后一条assistant消息（如果包含tool_calls）
  if (conv.length > 0) {
    const lastMsg = conv[conv.length - 1];
    if (lastMsg.role === "assistant" && lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
      conv.pop();
      void runtime.log.info("删除最后一条assistant消息", {
        agentId,
        toolCallsCount: lastMsg.tool_calls.length
      });
    }
  }
  
  // 追加所有插话消息
  for (const interruption of interruptions) {
    const userContent = runtime._formatMessageForLlm(ctx, interruption);
    conv.push({ role: "user", content: userContent });
  }
  
  void runtime.log.info("已追加插话消息到对话历史", {
    agentId,
    count: interruptions.length,
    newConvLength: conv.length
  });
  
  return true;
}
```

### 4. 修改 LlmHandler.doLlmProcessing()

在工具调用循环中添加插话检查：

```javascript
async doLlmProcessing(ctx, message, conv, agentId, llmClient) {
  const runtime = this.runtime;
  
  // 标记智能体为活跃
  runtime._activeProcessingAgents.add(agentId);
  
  try {
    // ... 现有的消息格式化和添加到conv的代码 ...
    
    for (let i = 0; i < runtime.maxToolRounds; i += 1) {
      // ... 现有的LLM调用代码 ...
      
      const toolCalls = msg.tool_calls ?? [];
      if (!toolCalls || toolCalls.length === 0) {
        // LLM完成回复，检查插话
        const hasInterruption = this.checkAndHandleInterruptions(agentId, conv, ctx);
        if (hasInterruption) {
          // 有插话，继续循环处理
          continue;
        }
        
        // 无插话，正常结束
        // ... 现有的自动发送消息代码 ...
        return;
      }
      
      // 有工具调用，先检查插话
      const hasInterruption = this.checkAndHandleInterruptions(agentId, conv, ctx);
      if (hasInterruption) {
        // 有插话，跳过工具调用，继续循环
        continue;
      }
      
      // 无插话，执行工具调用
      for (const call of toolCalls) {
        await this._processToolCall(ctx, call, conv, msg, message);
      }
      
      // ... 现有的yield检查代码 ...
    }
  } finally {
    // 标记智能体为空闲
    runtime._activeProcessingAgents.delete(agentId);
    runtime.setAgentComputeStatus?.(agentId, 'idle');
  }
}
```

### 5. 修改 MessageBus.send()

```javascript
send(message) {
  // ... 现有的状态检查代码 ...
  
  // 检查目标智能体是否正在活跃处理
  if (this._isAgentActivelyProcessing && this._isAgentActivelyProcessing(message.to)) {
    // 触发插话回调
    if (this._onInterruptionNeeded) {
      try {
        this._onInterruptionNeeded(message.to, message);
      } catch (err) {
        void this.log.warn("插话回调执行失败", { 
          error: err?.message ?? String(err),
          agentId: message.to
        });
      }
    }
  }
  
  // ... 现有的消息入队代码 ...
}
```

## 错误处理

### 场景1：插话队列为空
- 行为：`checkAndHandleInterruptions()` 返回 false，继续正常流程
- 日志：Debug级别

### 场景2：最后一条消息不是assistant
- 行为：不删除任何消息，直接追加插话
- 日志：Info级别，记录跳过删除

### 场景3：插话消息格式错误
- 行为：跳过该消息，继续处理其他插话
- 日志：Warn级别，记录错误详情

### 场景4：对话历史为空
- 行为：直接追加插话消息
- 日志：Info级别

## 测试策略

### 单元测试

1. **Runtime插话队列管理**
   - 测试 `addInterruption()` 正确添加消息
   - 测试 `getAndClearInterruptions()` 正确返回并清空队列
   - 测试多次添加插话的FIFO顺序

2. **LlmHandler插话处理**
   - 测试无插话时正常执行工具调用
   - 测试有插话时删除最后一条assistant消息
   - 测试插话消息正确追加到对话历史
   - 测试最后一条消息不是assistant时的处理

3. **MessageBus集成**
   - 测试活跃智能体触发插话回调
   - 测试非活跃智能体不触发插话回调

### 集成测试

1. **完整插话流程**
   - 智能体处理消息时收到插话
   - 插话在工具调用前被处理
   - 对话历史正确更新
   - LLM收到正确的上下文

2. **多次插话**
   - 连续发送多条插话消息
   - 验证所有插话都被处理
   - 验证FIFO顺序

3. **边界情况**
   - LLM刚完成回复时插话
   - 工具调用执行中插话
   - 空对话历史时插话

## 性能考虑

1. **插话检查开销**：每次工具调用前检查插话队列，时间复杂度O(1)
2. **内存开销**：每个活跃智能体维护一个插话队列，通常很小（< 10条消息）
3. **对话历史操作**：删除最后一条消息是O(1)操作（数组pop）

## 向后兼容性

1. 不影响现有的消息处理流程
2. 不改变对话历史的持久化格式
3. 插话功能是可选的，不影响不使用插话的场景
4. 保持现有的MessageBus消息队列行为
