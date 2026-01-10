/**
 * 消息处理器模块
 * 
 * 本模块负责消息的调度和处理，是 Runtime 的子模块之一。
 * 
 * 【设计初衷】
 * 智能体之间通过消息进行通信，需要一个统一的消息处理机制来：
 * - 调度消息到正确的智能体
 * - 控制并发处理数量
 * - 确保消息处理的可靠性
 * 
 * 【主要功能】
 * 1. 消息处理循环（生产者-消费者模式）
 * 2. 并发控制（限制同时处理的消息数量）
 * 3. 单智能体串行约束（同一智能体的消息串行处理）
 * 4. 消息投递和处理
 * 
 * 【处理模式】
 * - 生产者-消费者模式：消息总线作为生产者，处理器作为消费者
 * - 并发控制：根据 LLM 客户端配置限制并发数
 * - 串行约束：同一智能体的消息按顺序处理
 * 
 * 【与其他模块的关系】
 * - 使用 Runtime 的 bus 获取待处理消息
 * - 调用智能体的 onMessage 方法处理消息
 * - 使用 AgentManager 更新智能体活动时间
 * - 使用 LlmHandler 处理需要 LLM 的消息
 * 
 * @module runtime/message_processor
 */

/**
 * 消息处理器类
 * 
 * 负责消息的调度和处理。
 */
export class MessageProcessor {
  /**
   * 创建消息处理器实例
   * 
   * @param {object} runtime - Runtime 实例引用
   */
  constructor(runtime) {
    /** @type {object} Runtime 实例引用 */
    this.runtime = runtime;
  }

  /**
   * 消息处理主循环
   * 
   * 【循环流程】
   * 1. 检查是否请求停止
   * 2. 尝试调度新的消息处理
   * 3. 如果没有消息，等待新消息到达
   * 4. 让出事件循环
   * 5. 停止时等待所有活跃处理完成
   * 
   * @returns {Promise<void>}
   */
  async processingLoop() {
    const runtime = this.runtime;
    void runtime.log?.info?.("运行时常驻消息循环开始（生产者-消费者模式）");
    
    // 获取最大并发数
    const maxConcurrent = runtime.llm?.concurrencyController?.maxConcurrentRequests ?? 3;
    
    while (!runtime._stopRequested) {
      // 尝试调度新的消息处理
      const scheduled = await this.scheduleMessageProcessing(maxConcurrent);
      
      if (!scheduled && !runtime.bus.hasPending()) {
        // 没有调度成功且没有待处理消息，等待新消息
        await runtime.bus.waitForMessage({ timeoutMs: 100 });
      } else if (!scheduled) {
        // 有待处理消息但无法调度，短暂等待后重试
        await new Promise((r) => setTimeout(r, 10));
      }
      
      // 让出事件循环
      await new Promise((r) => setImmediate(r));
    }
    
    if (runtime._forceExit) {
      void runtime.log?.info?.("强制退出，跳过等待活跃消息");
      process.exit(1);
    }
    
    // 等待所有正在处理的消息完成
    while (runtime._activeProcessingAgents.size > 0 && !runtime._forceExit) {
      void runtime.log?.info?.("等待活跃消息处理完成", { 
        activeCount: runtime._activeProcessingAgents.size,
        activeAgents: [...runtime._activeProcessingAgents]
      });
      await new Promise((r) => setTimeout(r, 100));
    }
    
    void runtime.log?.info?.("运行时常驻消息循环结束", { stopRequested: runtime._stopRequested });
  }

  /**
   * 调度消息处理
   * 
   * 【调度规则】
   * 1. 检查并发槽位是否可用
   * 2. 遍历智能体，找到有待处理消息且未在处理中的
   * 3. 标记智能体为处理中
   * 4. 异步处理消息（不等待完成）
   * 
   * @param {number} maxConcurrent - 最大并发数
   * @returns {Promise<boolean>} 是否成功调度了新的消息处理
   */
  async scheduleMessageProcessing(maxConcurrent) {
    const runtime = this.runtime;
    
    // 检查并发槽位
    if (runtime._activeProcessingAgents.size >= maxConcurrent) {
      return false;
    }
    
    // 遍历智能体
    for (const agentId of runtime._agents.keys()) {
      if (runtime._stopRequested) break;
      
      // 跳过正在处理消息的智能体
      if (runtime._activeProcessingAgents.has(agentId)) {
        continue;
      }
      
      // 检查是否有待处理消息
      const msg = runtime.bus.receiveNext(agentId);
      if (!msg) continue;
      
      // 标记为处理中
      runtime._activeProcessingAgents.add(agentId);
      
      // 异步处理消息
      this.processAgentMessage(agentId, msg).finally(() => {
        runtime._activeProcessingAgents.delete(agentId);
      });
      
      void runtime.log?.debug?.("调度消息处理", {
        agentId,
        messageId: msg.id,
        activeCount: runtime._activeProcessingAgents.size,
        maxConcurrent
      });
      
      return true;
    }
    
    return false;
  }

  /**
   * 处理单个智能体的消息
   * 
   * @param {string} agentId - 智能体ID
   * @param {object} msg - 消息对象
   * @returns {Promise<void>}
   */
  async processAgentMessage(agentId, msg) {
    const runtime = this.runtime;
    const agent = runtime._agents.get(agentId);
    
    if (!agent) {
      void runtime.log?.warn?.("智能体不存在，跳过消息处理", { agentId, messageId: msg.id });
      return;
    }
    
    // 更新活动时间
    runtime._agentLastActivityTime.set(agentId, Date.now());
    runtime._idleWarningEmitted?.delete(agentId);
    
    void runtime.log?.debug?.("开始处理消息", {
      agentId,
      from: msg.from,
      taskId: msg.taskId ?? null,
      messageId: msg.id ?? null
    });
    
    // 记录生命周期事件
    void runtime.loggerRoot?.logAgentLifecycleEvent?.("agent_message_received", {
      agentId,
      messageId: msg.id ?? null,
      from: msg.from,
      taskId: msg.taskId ?? null
    });
    
    try {
      await agent.onMessage(runtime._buildAgentContext(agent), msg);
    } catch (err) {
      const errorMessage = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      const errorType = err?.name ?? "UnknownError";
      
      void runtime.log?.error?.("智能体消息处理异常（已隔离）", {
        agentId,
        messageId: msg.id ?? null,
        from: msg.from,
        taskId: msg.taskId ?? null,
        errorType,
        error: errorMessage,
        stack: err?.stack ?? null,
        willContinueProcessing: true
      });
      
      // 重置状态
      runtime.setAgentComputeStatus?.(agentId, 'idle');
      
      // 发送错误通知
      try {
        await runtime._sendErrorNotificationToParent?.(agentId, msg, {
          errorType: "agent_message_processing_failed",
          message: `智能体 ${agentId} 消息处理异常: ${errorMessage}`,
          originalError: errorMessage,
          errorName: errorType
        });
      } catch (notifyErr) {
        void runtime.log?.error?.("发送异常通知失败", {
          agentId,
          notifyError: notifyErr?.message ?? String(notifyErr)
        });
      }
    }
  }

  /**
   * 投递一轮消息（并发模式）
   * 
   * @returns {Promise<boolean>} 是否有消息被投递
   */
  async deliverOneRound() {
    const runtime = this.runtime;
    
    if (runtime._stopRequested) return false;
    
    const maxConcurrent = runtime.llm?.concurrencyController?.maxConcurrentRequests ?? 3;
    
    // 收集可以处理的消息
    const pendingDeliveries = [];
    for (const agentId of runtime._agents.keys()) {
      if (pendingDeliveries.length >= maxConcurrent) break;
      if (runtime._activeProcessingAgents.has(agentId)) continue;
      
      const msg = runtime.bus.receiveNext(agentId);
      if (!msg) continue;
      
      const agent = runtime._agents.get(agentId);
      pendingDeliveries.push({ agentId, agent, msg });
      runtime._activeProcessingAgents.add(agentId);
    }
    
    if (pendingDeliveries.length === 0) {
      return false;
    }
    
    void runtime.log?.debug?.("并发投递消息", {
      count: pendingDeliveries.length,
      agents: pendingDeliveries.map(d => d.agentId)
    });
    
    // 并发处理
    const deliveryPromises = pendingDeliveries.map(async ({ agentId, msg }) => {
      try {
        await this.processAgentMessage(agentId, msg);
      } finally {
        runtime._activeProcessingAgents.delete(agentId);
      }
    });
    
    await Promise.all(deliveryPromises);
    
    return true;
  }

  /**
   * 处理智能体队列中的待处理消息
   * 
   * @param {string} agentId - 智能体ID
   * @returns {Promise<void>}
   */
  async drainAgentQueue(agentId) {
    const runtime = this.runtime;
    const agent = runtime._agents.get(agentId);
    if (!agent) return;

    let processedCount = 0;
    const maxDrainMessages = 100;

    while (processedCount < maxDrainMessages) {
      const msg = runtime.bus.receiveNext(agentId);
      if (!msg) break;

      processedCount += 1;
      void runtime.log?.debug?.("终止前处理消息", {
        agentId,
        messageId: msg.id,
        from: msg.from,
        processedCount
      });

      try {
        await agent.onMessage(runtime._buildAgentContext(agent), msg);
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
        void runtime.log?.error?.("终止前消息处理失败", { agentId, messageId: msg.id, message });
      }
    }

    if (processedCount > 0) {
      void runtime.log?.info?.("终止前消息处理完成", { agentId, processedCount });
    }
  }
}
