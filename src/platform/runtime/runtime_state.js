/**
 * Runtime 状态管理模块
 * 
 * 职责：
 * - 管理智能体注册表
 * - 跟踪智能体运算状态
 * - 管理插话队列
 * - 管理对话历史
 * - 管理任务工作空间映射
 * - 提供状态锁机制
 * 
 * 设计原则：
 * - 单一职责：只负责状态的存储和访问
 * - 低耦合：通过接口与其他模块交互
 * - 高内聚：所有状态管理逻辑集中在此模块
 */

/**
 * RuntimeState 类
 * 封装 Runtime 的所有状态管理逻辑
 */
export class RuntimeState {
  /**
   * 构造函数
   * @param {object} options - 配置选项
   * @param {object} options.logger - 日志记录器
   * @param {Function} options.onComputeStatusChange - 运算状态变更回调
   */
  constructor(options = {}) {
    this.log = options.logger ?? null;
    this._onComputeStatusChange = options.onComputeStatusChange ?? null;
    
    // 智能体注册表（公开访问以保持向后兼容）
    this._agents = new Map();
    this._agentMetaById = new Map();
    
    // 运算状态跟踪（公开访问以保持向后兼容）
    this._agentComputeStatus = new Map(); // agentId -> 'idle' | 'waiting_llm' | 'processing' | 'stopping' | 'stopped' | 'terminating'
    this._activeProcessingAgents = new Set(); // 正在处理消息的智能体集合（用于并发控制）
    
    // 插话队列管理（公开访问以保持向后兼容）
    this._interruptionQueues = new Map(); // agentId -> Array<Message>
    
    // 对话历史（由 ConversationManager 管理，这里只保存引用）（公开访问以保持向后兼容）
    this._conversations = new Map();
    
    // 任务工作空间映射（公开访问以保持向后兼容）
    this._taskWorkspaces = new Map(); // taskId -> workspacePath
    this._agentTaskBriefs = new Map(); // agentId -> TaskBrief
    
    // 状态锁（公开访问以保持向后兼容）
    this._stateLocks = new Map(); // agentId -> Promise 队列
  }

  // ==================== 智能体注册表管理 ====================

  /**
   * 注册智能体实例
   * @param {object} agent - 智能体实例
   */
  registerAgent(agent) {
    this._agents.set(agent.id, agent);
  }

  /**
   * 获取智能体实例
   * @param {string} agentId - 智能体ID
   * @returns {object|undefined} 智能体实例
   */
  getAgent(agentId) {
    return this._agents.get(agentId);
  }

  /**
   * 检查智能体是否存在
   * @param {string} agentId - 智能体ID
   * @returns {boolean}
   */
  hasAgent(agentId) {
    return this._agents.has(agentId);
  }

  /**
   * 获取所有智能体ID
   * @returns {IterableIterator<string>}
   */
  getAllAgentIds() {
    return this._agents.keys();
  }

  /**
   * 获取智能体数量
   * @returns {number}
   */
  getAgentCount() {
    return this._agents.size;
  }

  /**
   * 获取所有智能体实例
   * @returns {Array<object>}
   */
  getAllAgents() {
    return Array.from(this._agents.values());
  }

  /**
   * 设置智能体元数据
   * @param {string} agentId - 智能体ID
   * @param {object} meta - 元数据
   */
  setAgentMeta(agentId, meta) {
    this._agentMetaById.set(agentId, meta);
  }

  /**
   * 获取智能体元数据
   * @param {string} agentId - 智能体ID
   * @returns {object|undefined}
   */
  getAgentMeta(agentId) {
    return this._agentMetaById.get(agentId);
  }

  // ==================== 运算状态管理 ====================

  /**
   * 设置智能体运算状态
   * @param {string} agentId - 智能体ID
   * @param {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'} status - 运算状态
   */
  setAgentComputeStatus(agentId, status) {
    if (agentId) {
      this._agentComputeStatus.set(agentId, status);
      
      // 触发状态变更回调
      if (this._onComputeStatusChange) {
        this._onComputeStatusChange(agentId, status);
      }
    }
  }

  /**
   * 获取智能体运算状态
   * @param {string} agentId - 智能体ID
   * @returns {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'} 运算状态
   */
  getAgentComputeStatus(agentId) {
    return this._agentComputeStatus.get(agentId) ?? 'idle';
  }

  /**
   * 获取所有智能体的运算状态
   * @returns {Object.<string, string>} 智能体ID到运算状态的映射
   */
  getAllAgentComputeStatus() {
    return Object.fromEntries(this._agentComputeStatus);
  }

  /**
   * 标记智能体为活跃处理中
   * @param {string} agentId - 智能体ID
   */
  markAgentAsActivelyProcessing(agentId) {
    this._activeProcessingAgents.add(agentId);
  }

  /**
   * 取消智能体的活跃处理标记
   * @param {string} agentId - 智能体ID
   */
  unmarkAgentAsActivelyProcessing(agentId) {
    this._activeProcessingAgents.delete(agentId);
  }

  /**
   * 检查智能体是否正在活跃处理消息
   * @param {string} agentId - 智能体ID
   * @returns {boolean}
   */
  isAgentActivelyProcessing(agentId) {
    return this._activeProcessingAgents.has(agentId);
  }

  /**
   * 获取活跃处理智能体的数量
   * @returns {number}
   */
  getActiveProcessingCount() {
    return this._activeProcessingAgents.size;
  }

  /**
   * 获取所有活跃处理的智能体ID
   * @returns {Array<string>}
   */
  getActiveProcessingAgents() {
    return Array.from(this._activeProcessingAgents);
  }

  // ==================== 插话队列管理 ====================

  /**
   * 添加插话消息到智能体的插话队列
   * 当智能体正在处理消息时收到新消息，新消息会被加入插话队列
   * 
   * @param {string} agentId - 智能体ID
   * @param {object} message - 插话消息
   */
  addInterruption(agentId, message) {
    if (!this._interruptionQueues.has(agentId)) {
      this._interruptionQueues.set(agentId, []);
    }
    this._interruptionQueues.get(agentId).push(message);
    
    if (this.log) {
      void this.log.info("添加插话消息", {
        agentId,
        messageFrom: message.from,
        messageId: message.id ?? 'unknown',
        queueLength: this._interruptionQueues.get(agentId).length
      });
    }
  }

  /**
   * 获取并清空智能体的插话队列
   * 返回所有待处理的插话消息，并清空队列
   * 
   * @param {string} agentId - 智能体ID
   * @returns {Array<object>} 插话消息数组（FIFO顺序）
   */
  getAndClearInterruptions(agentId) {
    const interruptions = this._interruptionQueues.get(agentId) ?? [];
    this._interruptionQueues.delete(agentId);
    
    if (interruptions.length > 0 && this.log) {
      void this.log.info("获取插话消息", {
        agentId,
        count: interruptions.length
      });
    }
    
    return interruptions;
  }

  /**
   * 检查智能体是否有待处理的插话消息
   * @param {string} agentId - 智能体ID
   * @returns {boolean}
   */
  hasInterruptions(agentId) {
    const queue = this._interruptionQueues.get(agentId);
    return queue && queue.length > 0;
  }

  /**
   * 获取智能体的插话队列长度
   * @param {string} agentId - 智能体ID
   * @returns {number}
   */
  getInterruptionCount(agentId) {
    const queue = this._interruptionQueues.get(agentId);
    return queue ? queue.length : 0;
  }

  // ==================== 对话历史管理 ====================

  /**
   * 获取对话历史引用（由 ConversationManager 管理）
   * @returns {Map<string, Array>}
   */
  getConversations() {
    return this._conversations;
  }

  /**
   * 获取指定智能体的对话历史
   * @param {string} agentId - 智能体ID
   * @returns {Array|undefined}
   */
  getConversation(agentId) {
    return this._conversations.get(agentId);
  }

  // ==================== 任务工作空间映射 ====================

  /**
   * 设置任务工作空间
   * @param {string} taskId - 任务ID
   * @param {string} workspacePath - 工作空间路径
   */
  setTaskWorkspace(taskId, workspacePath) {
    this._taskWorkspaces.set(taskId, workspacePath);
  }

  /**
   * 获取任务工作空间
   * @param {string} taskId - 任务ID
   * @returns {string|undefined}
   */
  getTaskWorkspace(taskId) {
    return this._taskWorkspaces.get(taskId);
  }

  /**
   * 设置智能体的任务委托书
   * @param {string} agentId - 智能体ID
   * @param {object} taskBrief - 任务委托书
   */
  setAgentTaskBrief(agentId, taskBrief) {
    this._agentTaskBriefs.set(agentId, taskBrief);
  }

  /**
   * 获取智能体的任务委托书
   * @param {string} agentId - 智能体ID
   * @returns {object|undefined}
   */
  getAgentTaskBrief(agentId) {
    return this._agentTaskBriefs.get(agentId);
  }

  // ==================== 状态锁管理 ====================

  /**
   * 获取智能体状态锁（用于原子性操作）
   * 使用 Promise 队列实现简单的互斥锁机制
   * 
   * @param {string} agentId - 智能体ID
   * @returns {Promise<Function>} 返回释放锁的函数
   */
  async acquireLock(agentId) {
    if (!this._stateLocks.has(agentId)) {
      this._stateLocks.set(agentId, Promise.resolve());
    }
    const currentLock = this._stateLocks.get(agentId);
    let releaseFn;
    const newLock = new Promise(resolve => { releaseFn = resolve; });
    this._stateLocks.set(agentId, currentLock.then(() => newLock));
    await currentLock;
    return releaseFn;
  }

  /**
   * 释放智能体状态锁
   * @param {Function} releaseFn - 释放函数
   */
  releaseLock(releaseFn) {
    if (releaseFn) releaseFn();
  }
}
