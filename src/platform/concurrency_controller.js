import { createNoopModuleLogger } from "./logger.js";

/**
 * 表示一个LLM请求的信息
 */
export class RequestInfo {
  constructor(agentId, requestFn, resolve, reject) {
    this.agentId = agentId;
    this.requestFn = requestFn;
    this.resolve = resolve;
    this.reject = reject;
    this.timestamp = Date.now();
    this.abortController = new AbortController();
  }
}

/**
 * 并发统计信息
 */
export class ConcurrencyStats {
  constructor() {
    this.activeCount = 0;
    this.queueLength = 0;
    this.totalRequests = 0;
    this.completedRequests = 0;
    this.rejectedRequests = 0;
  }

  /**
   * 重置统计信息
   */
  reset() {
    this.activeCount = 0;
    this.queueLength = 0;
    this.totalRequests = 0;
    this.completedRequests = 0;
    this.rejectedRequests = 0;
  }

  /**
   * 获取统计信息的副本
   */
  getSnapshot() {
    return {
      activeCount: this.activeCount,
      queueLength: this.queueLength,
      totalRequests: this.totalRequests,
      completedRequests: this.completedRequests,
      rejectedRequests: this.rejectedRequests
    };
  }
}

/**
 * 并发控制器 - 管理LLM请求的并发数量和队列
 */
export class ConcurrencyController {
  /**
   * @param {number} maxConcurrentRequests 最大并发请求数
   * @param {object} logger 日志记录器
   */
  constructor(maxConcurrentRequests = 3, logger = null) {
    this.maxConcurrentRequests = maxConcurrentRequests;
    this.log = logger ?? createNoopModuleLogger();
    
    // 活跃请求映射: agentId -> RequestInfo
    this.activeRequests = new Map();
    
    // 等待队列
    this.requestQueue = [];
    
    // 统计信息
    this.stats = new ConcurrencyStats();
  }

  /**
   * 执行LLM请求，支持并发控制和队列管理
   * @param {string} agentId 智能体ID
   * @param {Function} requestFn 请求执行函数
   * @returns {Promise<any>} 请求结果
   */
  async executeRequest(agentId, requestFn) {
    if (!agentId) {
      const error = new Error("agentId is required for concurrent requests");
      this.stats.rejectedRequests++;
      await this.log.warn("请求被拒绝：缺少agentId", { error: error.message });
      throw error;
    }

    // 检查该智能体是否已有活跃请求
    if (this.activeRequests.has(agentId)) {
      const error = new Error(`Agent ${agentId} already has an active request`);
      this.stats.rejectedRequests++;
      await this.log.warn("请求被拒绝：智能体已有活跃请求", { 
        agentId, 
        error: error.message 
      });
      throw error;
    }

    this.stats.totalRequests++;

    return new Promise((resolve, reject) => {
      const requestInfo = new RequestInfo(agentId, requestFn, resolve, reject);

      // 如果可以立即执行，则立即执行
      if (this._canExecuteRequest()) {
        this._executeRequestImmediately(requestInfo);
      } else {
        // 否则加入队列
        this._enqueueRequest(requestInfo);
      }
    });
  }

  /**
   * 取消指定智能体的请求
   * @param {string} agentId 智能体ID
   * @returns {boolean} 是否成功取消
   */
  async cancelRequest(agentId) {
    // 检查活跃请求
    const activeRequest = this.activeRequests.get(agentId);
    if (activeRequest) {
      activeRequest.abortController.abort();
      this.activeRequests.delete(agentId);
      this.stats.activeCount--;
      this.stats.rejectedRequests++; // 增加拒绝计数
      
      const error = new Error("Request cancelled");
      error.name = "AbortError";
      activeRequest.reject(error);
      
      await this.log.info("活跃请求已取消", { agentId });
      
      // 处理队列中的下一个请求
      this._processQueue();
      return true;
    }

    // 检查队列中的请求
    const queueIndex = this.requestQueue.findIndex(req => req.agentId === agentId);
    if (queueIndex !== -1) {
      const queuedRequest = this.requestQueue.splice(queueIndex, 1)[0];
      this.stats.queueLength--;
      this.stats.rejectedRequests++; // 增加拒绝计数
      
      const error = new Error("Request cancelled");
      error.name = "AbortError";
      queuedRequest.reject(error);
      
      await this.log.info("队列中的请求已取消", { agentId });
      return true;
    }

    return false;
  }

  /**
   * 检查是否可以立即执行请求
   * @returns {boolean}
   */
  _canExecuteRequest() {
    return this.stats.activeCount < this.maxConcurrentRequests;
  }

  /**
   * 立即执行请求
   * @param {RequestInfo} requestInfo
   */
  async _executeRequestImmediately(requestInfo) {
    this.activeRequests.set(requestInfo.agentId, requestInfo);
    this.stats.activeCount++;

    await this.log.info("开始处理LLM请求", {
      agentId: requestInfo.agentId,
      activeCount: this.stats.activeCount,
      queueLength: this.stats.queueLength
    });

    try {
      const result = await requestInfo.requestFn();
      
      // 请求成功完成
      this.activeRequests.delete(requestInfo.agentId);
      this.stats.activeCount--;
      this.stats.completedRequests++;
      
      await this.log.info("LLM请求完成", {
        agentId: requestInfo.agentId,
        activeCount: this.stats.activeCount
      });
      
      requestInfo.resolve(result);
      
      // 处理队列中的下一个请求
      this._processQueue();
      
    } catch (error) {
      // 请求失败
      this.activeRequests.delete(requestInfo.agentId);
      this.stats.activeCount--;
      
      await this.log.error("LLM请求失败", {
        agentId: requestInfo.agentId,
        error: error.message,
        activeCount: this.stats.activeCount
      });
      
      requestInfo.reject(error);
      
      // 处理队列中的下一个请求
      this._processQueue();
    }
  }

  /**
   * 将请求加入队列
   * @param {RequestInfo} requestInfo
   */
  async _enqueueRequest(requestInfo) {
    this.requestQueue.push(requestInfo);
    this.stats.queueLength++;

    await this.log.info("请求已加入队列", {
      agentId: requestInfo.agentId,
      queueLength: this.stats.queueLength,
      activeCount: this.stats.activeCount
    });

    // 如果达到并发限制，记录警告
    if (this.stats.activeCount >= this.maxConcurrentRequests) {
      await this.log.warn("已达到最大并发限制", {
        maxConcurrentRequests: this.maxConcurrentRequests,
        activeCount: this.stats.activeCount,
        queueLength: this.stats.queueLength
      });
    }
  }

  /**
   * 处理队列中的等待请求
   */
  async _processQueue() {
    while (this.requestQueue.length > 0 && this._canExecuteRequest()) {
      const nextRequest = this.requestQueue.shift();
      this.stats.queueLength--;
      
      await this.log.info("从队列中取出请求进行处理", {
        agentId: nextRequest.agentId,
        queueLength: this.stats.queueLength
      });
      
      this._executeRequestImmediately(nextRequest);
    }
  }

  /**
   * 更新最大并发数配置
   * @param {number} newMaxConcurrentRequests
   */
  async updateMaxConcurrentRequests(newMaxConcurrentRequests) {
    if (typeof newMaxConcurrentRequests !== 'number' || newMaxConcurrentRequests <= 0) {
      await this.log.warn("无效的最大并发数配置，保持当前值", {
        current: this.maxConcurrentRequests,
        attempted: newMaxConcurrentRequests
      });
      return;
    }

    const oldValue = this.maxConcurrentRequests;
    this.maxConcurrentRequests = newMaxConcurrentRequests;

    await this.log.info("更新最大并发数配置", {
      oldValue,
      newValue: newMaxConcurrentRequests
    });

    // 如果新的限制更高，尝试处理队列中的请求
    if (newMaxConcurrentRequests > oldValue) {
      this._processQueue();
    }
  }

  /**
   * 获取当前统计信息
   * @returns {object} 统计信息快照
   */
  getStats() {
    return this.stats.getSnapshot();
  }

  /**
   * 检查指定智能体是否有活跃请求或在队列中
   * @param {string} agentId
   * @returns {boolean}
   */
  hasRequest(agentId) {
    return this.activeRequests.has(agentId) || 
           this.requestQueue.some(req => req.agentId === agentId);
  }

  /**
   * 检查指定智能体是否有活跃请求
   * @param {string} agentId
   * @returns {boolean}
   */
  hasActiveRequest(agentId) {
    return this.activeRequests.has(agentId);
  }

  /**
   * 获取当前队列长度
   * @returns {number}
   */
  getQueueLength() {
    return this.requestQueue.length;
  }

  /**
   * 获取当前活跃请求数
   * @returns {number}
   */
  getActiveCount() {
    return this.activeRequests.size;
  }
}