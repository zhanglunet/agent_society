# Runtime.js 清理方案

## 问题 1：配置管理重复

### 现状
- `src/platform/utils/config/config.js` 提供了 Config 类用于配置加载
- `src/platform/core/runtime.js` 在两个地方直接使用 Config 类：
  1. `init()` 方法中加载初始配置（第 403 行）
  2. `reloadLlmClient()` 方法中重新加载配置（第 1014 行）

### 问题
- Runtime 直接依赖 Config 类，增加了耦合
- 配置加载逻辑分散在多处

### 解决方案
**保持现状，不需要修改**

**理由**：
1. Runtime 需要在初始化时加载配置，这是合理的依赖
2. Config 类是工具类，专门用于配置加载，Runtime 使用它是正确的
3. 这不是重复，而是正常的模块使用关系
4. 如果要解耦，需要引入配置服务层，会增加复杂度

**结论**：这不是问题，无需修改

## 问题 2：未被调用的单行委托函数

### 现状
Runtime.js 中有 3 个未被外部调用的单行委托函数：

1. **`_doLlmProcessing()`** (第 788 行)
   - 委托给 `RuntimeLlm.doLlmProcessing()`
   - 未被任何代码调用
   - 标记为 `@private`

2. **`_sendErrorNotificationToParent()`** (第 801 行)
   - 委托给 `RuntimeLlm.sendErrorNotificationToParent()`
   - 被 2 处调用：
     - `runtime_messaging.js` (第 261 行)
     - `message_processor.js` (第 226 行)
   - **实际上是被调用的，不应删除**

3. **`_formatToolGroupsInfo()`** (第 811 行)
   - 委托给 `RuntimeLlm.formatToolGroupsInfo()`
   - 未被任何代码调用
   - 标记为 `@private`

### 解决方案

#### 删除未被调用的函数

**删除以下函数：**

1. `_doLlmProcessing()` - 未被调用，可以删除
2. `_formatToolGroupsInfo()` - 未被调用，可以删除

**保留以下函数：**

1. `_sendErrorNotificationToParent()` - 被 runtime_messaging.js 和 message_processor.js 调用，必须保留

#### 代码修改

**删除 `_doLlmProcessing()` 方法**（第 788-792 行）：
```javascript
  /**
   * 执行 LLM 处理循环（内部方法）。
   * @param {any} ctx
   * @param {any} message
   * @param {any[]} conv
   * @param {string|null} agentId
   * @param {LlmClient} llmClient - 要使用的 LLM 客户端
   * @returns {Promise<void>}
   * @private
   */
  async _doLlmProcessing(ctx, message, conv, agentId, llmClient) {
    // 委托给 RuntimeLlm 处理
    return await this._llm.doLlmProcessing(ctx, message, conv, agentId, llmClient);
  }
```

**删除 `_formatToolGroupsInfo()` 方法**（第 810-815 行）：
```javascript
  /**
   * 格式化工具组信息，用于注入到系统提示词中。
   * @returns {string}
   * @private
   */
  _formatToolGroupsInfo() {
    // 委托给 RuntimeLlm 处理
    return this._llm.formatToolGroupsInfo();
  }
```

### 预期效果

删除这 2 个未被调用的函数后：
- 减少约 20 行代码（包括注释）
- 简化 Runtime 类的接口
- 不影响任何功能（因为这些函数未被调用）

## 问题 3：其他可能的清理

### 检查其他单行委托函数

让我们检查 Runtime.js 中所有的单行委托函数，看是否还有其他未被调用的：

**需要检查的函数：**
1. `onToolCall()` - 事件监听器注册，应该被外部调用
2. `_emitToolCall()` - 事件触发，应该被内部调用
3. `onError()` - 事件监听器注册，应该被外部调用
4. `_emitError()` - 事件触发，应该被内部调用
5. `onLlmRetry()` - 事件监听器注册，应该被外部调用
6. `_emitLlmRetry()` - 事件触发，应该被内部调用
7. `_emitComputeStatusChange()` - 事件触发，应该被内部调用
8. `onComputeStatusChange()` - 事件监听器注册，应该被外部调用
9. `handleMessageInterruption()` - 消息中断处理，应该被 MessageBus 调用
10. `startProcessing()` - 启动消息循环，应该被外部调用
11. `run()` - 运行消息循环，应该被外部调用
12. `_acquireLock()` - 状态锁获取，应该被内部调用
13. `_releaseLock()` - 状态锁释放，应该被内部调用
14. `setAgentComputeStatus()` - 状态设置，应该被内部调用
15. `getAgentComputeStatus()` - 状态获取，应该被内部调用

**结论**：这些函数都是必要的接口函数，不应删除

## 总结

### 需要执行的清理

1. ✓ **删除 `_doLlmProcessing()` 方法** - 未被调用
2. ✓ **删除 `_formatToolGroupsInfo()` 方法** - 未被调用

### 不需要修改的部分

1. ✗ **Config 类的使用** - 这是正常的模块依赖，不是重复
2. ✗ **`_sendErrorNotificationToParent()` 方法** - 被调用，必须保留
3. ✗ **其他单行委托函数** - 都是必要的接口，必须保留

### 预期效果

- 减少约 20 行代码
- runtime.js 从 952 行减少到约 932 行
- 仍然超出 500 行限制，需要进一步拆分
