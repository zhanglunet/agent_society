/**
 * Runtime 事件系统模块
 * 
 * 职责：
 * - 管理事件监听器注册
 * - 触发事件通知
 * - 提供事件订阅接口
 * 
 * 设计原则：
 * - 单一职责：只负责事件的发布和订阅
 * - 低耦合：通过事件机制解耦模块间通信
 * - 高内聚：所有事件管理逻辑集中在此模块
 * 
 * 支持的事件类型：
 * - toolCall: 工具调用事件
 * - error: 错误事件（用于向前端广播）
 * - llmRetry: LLM 重试事件
 * - computeStatusChange: 运算状态变更事件
 */

import { formatLocalTime } from "../utils/logger/logger.js";

/**
 * RuntimeEvents 类
 * 封装 Runtime 的所有事件管理逻辑
 */
export class RuntimeEvents {
  /**
   * 构造函数
   * @param {object} options - 配置选项
   * @param {object} options.logger - 日志记录器
   */
  constructor(options = {}) {
    this.log = options.logger ?? null;
    
    // 工具调用事件监听器
    this._toolCallListeners = new Set();
    
    // 错误事件监听器（用于向前端广播错误）
    this._errorListeners = new Set();
    
    // LLM 重试事件监听器
    this._llmRetryListeners = new Set();
    
    // 运算状态变更事件监听器
    this._computeStatusListeners = new Set();
  }

  // ==================== 工具调用事件 ====================

  /**
   * 注册工具调用事件监听器
   * @param {(event: {agentId: string, toolName: string, args: object, result: any, taskId: string|null}) => void} listener
   */
  onToolCall(listener) {
    if (typeof listener === "function") {
      this._toolCallListeners.add(listener);
    }
  }

  /**
   * 触发工具调用事件
   * @param {{agentId: string, toolName: string, args: object, result: any, taskId: string|null}} event
   */
  emitToolCall(event) {
    for (const listener of this._toolCallListeners) {
      try {
        listener(event);
      } catch (err) {
        if (this.log?.warn) {
          void this.log.warn("工具调用事件监听器执行失败", { 
            error: err?.message ?? String(err) 
          });
        }
      }
    }
  }

  /**
   * 移除工具调用事件监听器
   * @param {Function} listener
   */
  offToolCall(listener) {
    this._toolCallListeners.delete(listener);
  }

  // ==================== 错误事件 ====================

  /**
   * 注册错误事件监听器
   * @param {(event: {agentId: string, errorType: string, message: string, timestamp: string, [key: string]: any}) => void} listener
   */
  onError(listener) {
    if (typeof listener === "function") {
      this._errorListeners.add(listener);
    }
  }

  /**
   * 触发错误事件（用于向前端广播错误）
   * @param {{agentId: string, errorType: string, message: string, timestamp: string, [key: string]: any}} event
   */
  emitError(event) {
    for (const listener of this._errorListeners) {
      try {
        listener(event);
      } catch (err) {
        if (this.log?.warn) {
          void this.log.warn("错误事件监听器执行失败", { 
            error: err?.message ?? String(err) 
          });
        }
      }
    }
  }

  /**
   * 移除错误事件监听器
   * @param {Function} listener
   */
  offError(listener) {
    this._errorListeners.delete(listener);
  }

  // ==================== LLM 重试事件 ====================

  /**
   * 注册 LLM 重试事件监听器
   * @param {(event: {agentId: string, attempt: number, maxRetries: number, delayMs: number, errorMessage: string, timestamp: string}) => void} listener
   */
  onLlmRetry(listener) {
    if (typeof listener === "function") {
      this._llmRetryListeners.add(listener);
    }
  }

  /**
   * 触发 LLM 重试事件
   * @param {{agentId: string, attempt: number, maxRetries: number, delayMs: number, errorMessage: string, timestamp: string}} event
   */
  emitLlmRetry(event) {
    for (const listener of this._llmRetryListeners) {
      try {
        listener(event);
      } catch (err) {
        if (this.log?.warn) {
          void this.log.warn("LLM 重试事件监听器执行失败", { 
            error: err?.message ?? String(err) 
          });
        }
      }
    }
  }

  /**
   * 移除 LLM 重试事件监听器
   * @param {Function} listener
   */
  offLlmRetry(listener) {
    this._llmRetryListeners.delete(listener);
  }

  // ==================== 运算状态变更事件 ====================

  /**
   * 注册运算状态变更事件监听器
   * @param {(event: {agentId: string, status: string, timestamp: string}) => void} listener
   */
  onComputeStatusChange(listener) {
    if (typeof listener === "function") {
      this._computeStatusListeners.add(listener);
    }
  }

  /**
   * 触发运算状态变更事件
   * @param {string} agentId - 智能体ID
   * @param {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'} status - 新状态
   */
  emitComputeStatusChange(agentId, status) {
    const event = { 
      agentId, 
      status, 
      timestamp: formatLocalTime() 
    };
    
    for (const listener of this._computeStatusListeners) {
      try {
        listener(event);
      } catch (err) {
        if (this.log?.warn) {
          void this.log.warn("运算状态事件监听器执行失败", { 
            error: err?.message ?? String(err) 
          });
        }
      }
    }
  }

  /**
   * 移除运算状态变更事件监听器
   * @param {Function} listener
   */
  offComputeStatusChange(listener) {
    this._computeStatusListeners.delete(listener);
  }

  // ==================== 工具方法 ====================

  /**
   * 获取所有事件监听器的数量（用于调试）
   * @returns {{toolCall: number, error: number, llmRetry: number, computeStatusChange: number}}
   */
  getListenerCounts() {
    return {
      toolCall: this._toolCallListeners.size,
      error: this._errorListeners.size,
      llmRetry: this._llmRetryListeners.size,
      computeStatusChange: this._computeStatusListeners.size
    };
  }

  /**
   * 移除所有事件监听器
   */
  removeAllListeners() {
    this._toolCallListeners.clear();
    this._errorListeners.clear();
    this._llmRetryListeners.clear();
    this._computeStatusListeners.clear();
  }
}
