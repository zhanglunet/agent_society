/**
 * 最小异步消息总线：按收件人队列缓存消息，运行时循环拉取并投递。
 */
import { randomUUID } from "node:crypto";
import { createNoopModuleLogger, formatLocalTime } from "./logger.js";

export class MessageBus {
  /**
   * @param {{logger?: {debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>}}} [options]
   */
  constructor(options = {}) {
    this._queues = new Map();
    this._delayedMessages = [];  // 延迟消息队列，按 deliverAt 排序
    this._waiters = new Set();
    this._deliveryListeners = new Set();  // 延迟消息投递监听器
    this.log = options.logger ?? createNoopModuleLogger();
  }

  /**
   * 注册延迟消息投递监听器。
   * @param {(message: {id:string, to:string, from:string, payload:any, taskId?:string, createdAt:string}) => void} listener
   */
  onDelayedDelivery(listener) {
    if (typeof listener === "function") {
      this._deliveryListeners.add(listener);
    }
  }

  /**
   * 触发延迟消息投递事件。
   * @param {object} message
   */
  _emitDelayedDelivery(message) {
    for (const listener of this._deliveryListeners) {
      try {
        listener(message);
      } catch (err) {
        void this.log.warn("延迟消息投递监听器执行失败", { error: err?.message ?? String(err) });
      }
    }
  }

  /**
   * 发送异步消息（支持延迟投递）。
   * @param {{to:string, from:string, payload:any, taskId?:string, delayMs?:number|string}} message
   * @returns {{messageId:string, scheduledDeliveryTime?:string}} 消息ID和预计投递时间（延迟消息）
   */
  send(message) {
    const id = randomUUID();
    const now = Date.now();
    // 支持字符串形式的数字（LLM 可能传递字符串）
    const rawDelayMs = message.delayMs;
    const parsedDelayMs = typeof rawDelayMs === "number" ? rawDelayMs : 
                          typeof rawDelayMs === "string" ? Number(rawDelayMs) : 0;
    const delayMs = Math.max(0, Number.isFinite(parsedDelayMs) ? parsedDelayMs : 0);
    
    const envelope = {
      id,
      createdAt: formatLocalTime(new Date(now)),
      to: message.to,
      from: message.from,
      payload: message.payload,
      taskId: message.taskId
    };

    // 延迟投递
    if (delayMs > 0) {
      const deliverAt = now + delayMs;
      this._delayedMessages.push({ ...envelope, deliverAt });
      // 按投递时间排序，保持稳定排序以维持发送顺序
      this._delayedMessages.sort((a, b) => a.deliverAt - b.deliverAt);
      
      void this.log.info("发送延迟消息", {
        agentId: envelope.from,
        id,
        to: envelope.to,
        from: envelope.from,
        taskId: envelope.taskId ?? null,
        payload: envelope.payload ?? null,
        delayMs,
        deliverAt: formatLocalTime(new Date(deliverAt))
      });
      
      return { 
        messageId: id, 
        scheduledDeliveryTime: formatLocalTime(new Date(deliverAt))
      };
    }

    // 立即投递（原有逻辑）
    const q = this._queues.get(envelope.to) ?? [];
    const queueSizeBefore = q.length;
    q.push(envelope);
    this._queues.set(envelope.to, q);
    void this.log.info("发送消息", {
      agentId: envelope.from,
      id,
      to: envelope.to,
      from: envelope.from,
      taskId: envelope.taskId ?? null,
      payload: envelope.payload ?? null,
      queueSizeBefore,
      queueSizeAfter: q.length
    });
    for (const w of this._waiters) w();
    this._waiters.clear();
    return { messageId: id };
  }

  /**
   * 取出某个收件人的下一条消息（FIFO）。
   * @param {string} agentId
   * @returns {any|null} message
   */
  receiveNext(agentId) {
    const q = this._queues.get(agentId);
    if (!q || q.length === 0) return null;
    const queueSizeBefore = q.length;
    const msg = q.shift();
    void this.log.info("接收消息", {
      agentId,
      to: agentId,
      id: msg?.id ?? null,
      from: msg?.from ?? null,
      taskId: msg?.taskId ?? null,
      payload: msg?.payload ?? null,
      queueSizeBefore,
      queueSizeAfter: q.length
    });
    return msg;
  }

  /**
   * 是否存在待投递消息。
   * @returns {boolean}
   */
  hasPending() {
    for (const q of this._queues.values()) {
      if (q.length > 0) return true;
    }
    return false;
  }

  /**
   * 获取指定智能体的队列深度。
   * @param {string} agentId
   * @returns {number}
   */
  getQueueDepth(agentId) {
    const q = this._queues.get(agentId);
    return q ? q.length : 0;
  }

  /**
   * 清空指定智能体的消息队列。
   * @param {string} agentId
   * @returns {any[]} 被清空的消息列表
   */
  clearQueue(agentId) {
    const q = this._queues.get(agentId);
    if (!q || q.length === 0) return [];
    const messages = [...q];
    q.length = 0;
    void this.log.info("清空消息队列", { agentId, clearedCount: messages.length });
    return messages;
  }

  /**
   * 等待直到有新消息入队（或超时）。
   * @param {{timeoutMs?:number}} [options]
   * @returns {Promise<boolean>} resolved=true 表示收到新消息，false 表示超时
   */
  async waitForMessage(options = {}) {
    if (this.hasPending()) return true;
    const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 0;
    return await new Promise((resolve) => {
      let done = false;
      const wake = () => {
        if (done) return;
        done = true;
        this._waiters.delete(wake);
        resolve(true);
      };
      this._waiters.add(wake);

      if (timeoutMs > 0) {
        const timer = setTimeout(() => {
          if (done) return;
          done = true;
          this._waiters.delete(wake);
          resolve(false);
        }, timeoutMs);
        if (timer && typeof timer.unref === "function") timer.unref();
      }
    });
  }

  /**
   * 获取所有待处理消息的总数。
   * @returns {number}
   */
  getPendingCount() {
    let count = 0;
    for (const q of this._queues.values()) {
      count += q.length;
    }
    return count;
  }

  /**
   * 检查并投递到期的延迟消息。
   * @returns {number} 投递的消息数量
   */
  deliverDueMessages() {
    const now = Date.now();
    let deliveredCount = 0;
    
    while (this._delayedMessages.length > 0) {
      const msg = this._delayedMessages[0];
      if (msg.deliverAt > now) break;
      
      // 移除延迟队列
      this._delayedMessages.shift();
      
      // 投递到立即队列
      const { deliverAt, ...envelope } = msg;
      const q = this._queues.get(envelope.to) ?? [];
      q.push(envelope);
      this._queues.set(envelope.to, q);
      
      deliveredCount++;
      
      // 触发延迟消息投递事件（通知前端）
      this._emitDelayedDelivery(envelope);
      
      void this.log.info("延迟消息已投递", {
        id: envelope.id,
        to: envelope.to,
        from: envelope.from,
        scheduledAt: formatLocalTime(new Date(deliverAt)),
        actualDeliveryAt: formatLocalTime(new Date(now)),
        delayDrift: now - deliverAt
      });
    }
    
    if (deliveredCount > 0) {
      for (const w of this._waiters) w();
      this._waiters.clear();
    }
    
    return deliveredCount;
  }

  /**
   * 获取延迟消息数量。
   * @param {string} [recipientId] - 可选，指定收件人
   * @returns {number}
   */
  getDelayedCount(recipientId) {
    if (recipientId) {
      return this._delayedMessages.filter(m => m.to === recipientId).length;
    }
    return this._delayedMessages.length;
  }

  /**
   * 强制投递所有延迟消息（用于关闭时）。
   * @returns {number} 投递的消息数量
   */
  forceDeliverAllDelayed() {
    const count = this._delayedMessages.length;
    
    for (const msg of this._delayedMessages) {
      const { deliverAt, ...envelope } = msg;
      const q = this._queues.get(envelope.to) ?? [];
      q.push(envelope);
      this._queues.set(envelope.to, q);
    }
    
    this._delayedMessages.length = 0;
    
    if (count > 0) {
      void this.log.info("强制投递所有延迟消息", { count });
      for (const w of this._waiters) w();
      this._waiters.clear();
    }
    
    return count;
  }
}
