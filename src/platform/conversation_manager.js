import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * 会话上下文管理器
 * 负责管理智能体的会话上下文，包括压缩历史消息和检查上下文长度。
 * 支持基于 token 的上下文长度限制。
 * 支持对话历史持久化到磁盘。
 */
export class ConversationManager {
  /**
   * @param {{maxContextMessages?:number, conversations?:Map, contextLimit?:{maxTokens:number, warningThreshold:number, criticalThreshold:number, hardLimitThreshold:number}, promptTemplates?:{contextStatus?:string, contextExceeded?:string, contextCritical?:string, contextWarning?:string}, conversationsDir?:string, logger?:object}} options
   */
  constructor(options = {}) {
    this.maxContextMessages = options.maxContextMessages ?? 50;
    this.conversations = options.conversations ?? new Map();
    this._conversationsDir = options.conversationsDir ?? null;
    this._logger = options.logger ?? null;
    this._pendingSaves = new Map(); // 防抖保存
    
    // 上下文 token 限制配置
    this.contextLimit = options.contextLimit ?? {
      maxTokens: 128000,
      warningThreshold: 0.7,
      criticalThreshold: 0.9,
      hardLimitThreshold: 0.95
    };
    
    // 提示词模板（由外部加载后注入）
    this.promptTemplates = options.promptTemplates ?? {
      contextStatus: '【上下文状态】已使用 {{USED_TOKENS}}/{{MAX_TOKENS}} tokens ({{USAGE_PERCENT}}%)',
      contextExceeded: '⚠️ 严重警告：上下文已超过硬性限制({{HARD_LIMIT_THRESHOLD}}%)！必须立即采取行动：\n  1. 调用 compress_context 压缩历史\n  2. 或向上级请求拆分业务\n  3. 或创建子岗位分担工作\n  继续请求将导致调用失败！',
      contextCritical: '⚠️ 警告：上下文接近硬性限制({{CRITICAL_THRESHOLD}}%)，建议立即：\n  1. 调用 compress_context 压缩历史\n  2. 考虑拆分岗位或请求上级拆分业务',
      contextWarning: '提示：上下文使用率较高({{WARNING_THRESHOLD}}%)，请注意管理上下文长度。'
    };
    
    // 每个智能体的 token 使用统计（基于 LLM 返回的实际值）
    this._tokenUsage = new Map();
  }

  /**
   * 设置持久化目录。
   * @param {string} dir
   */
  setConversationsDir(dir) {
    this._conversationsDir = dir;
  }

  /**
   * 设置日志记录器。
   * @param {object} logger
   */
  setLogger(logger) {
    this._logger = logger;
  }

  /**
   * 加载所有持久化的对话历史。
   * @returns {Promise<{loaded: number, errors: string[]}>}
   */
  async loadAllConversations() {
    if (!this._conversationsDir) {
      return { loaded: 0, errors: ["conversationsDir not set"] };
    }

    const errors = [];
    let loaded = 0;

    try {
      await mkdir(this._conversationsDir, { recursive: true });
      const files = await readdir(this._conversationsDir);
      
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        
        const agentId = file.slice(0, -5); // 移除 .json 后缀
        const filePath = path.join(this._conversationsDir, file);
        
        try {
          const raw = await readFile(filePath, "utf8");
          const data = JSON.parse(raw);
          
          if (Array.isArray(data.messages)) {
            this.conversations.set(agentId, data.messages);
            
            // 恢复 token 使用统计
            if (data.tokenUsage) {
              this._tokenUsage.set(agentId, data.tokenUsage);
            }
            
            loaded++;
          } else {
            errors.push(`${agentId}: invalid format`);
          }
        } catch (err) {
          errors.push(`${agentId}: ${err.message}`);
        }
      }
    } catch (err) {
      errors.push(`readdir: ${err.message}`);
    }

    if (this._logger) {
      void this._logger.info?.("加载对话历史完成", { loaded, errors: errors.length });
    }

    return { loaded, errors };
  }

  /**
   * 持久化单个智能体的对话历史（带防抖）。
   * @param {string} agentId
   * @returns {Promise<void>}
   */
  async persistConversation(agentId) {
    if (!this._conversationsDir) return;

    // 防抖：取消之前的保存计划
    const pending = this._pendingSaves.get(agentId);
    if (pending) {
      clearTimeout(pending);
    }

    // 延迟 500ms 保存，合并频繁的写入
    this._pendingSaves.set(agentId, setTimeout(async () => {
      this._pendingSaves.delete(agentId);
      await this._doSaveConversation(agentId);
    }, 500));
  }

  /**
   * 立即持久化单个智能体的对话历史（无防抖）。
   * @param {string} agentId
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async persistConversationNow(agentId) {
    if (!this._conversationsDir) {
      return { ok: false, error: "conversationsDir not set" };
    }

    // 取消防抖计划
    const pending = this._pendingSaves.get(agentId);
    if (pending) {
      clearTimeout(pending);
      this._pendingSaves.delete(agentId);
    }

    return await this._doSaveConversation(agentId);
  }

  /**
   * 实际执行保存操作。
   * @param {string} agentId
   * @returns {Promise<{ok: boolean, error?: string}>}
   * @private
   */
  async _doSaveConversation(agentId) {
    try {
      await mkdir(this._conversationsDir, { recursive: true });
      
      const conv = this.conversations.get(agentId);
      if (!conv) {
        return { ok: true }; // 没有对话，无需保存
      }

      const filePath = path.join(this._conversationsDir, `${agentId}.json`);
      const data = {
        agentId,
        messages: conv,
        tokenUsage: this._tokenUsage.get(agentId) ?? null,
        updatedAt: new Date().toISOString()
      };

      await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      
      if (this._logger) {
        void this._logger.debug?.("持久化对话历史", { agentId, messageCount: conv.length });
      }
      
      return { ok: true };
    } catch (err) {
      if (this._logger) {
        void this._logger.error?.("持久化对话历史失败", { agentId, error: err.message });
      }
      return { ok: false, error: err.message };
    }
  }

  /**
   * 删除智能体的持久化对话历史文件。
   * @param {string} agentId
   * @returns {Promise<{ok: boolean, error?: string}>}
   */
  async deletePersistedConversation(agentId) {
    if (!this._conversationsDir) {
      return { ok: true };
    }

    // 取消防抖计划
    const pending = this._pendingSaves.get(agentId);
    if (pending) {
      clearTimeout(pending);
      this._pendingSaves.delete(agentId);
    }

    try {
      const filePath = path.join(this._conversationsDir, `${agentId}.json`);
      await unlink(filePath);
      return { ok: true };
    } catch (err) {
      if (err.code === "ENOENT") {
        return { ok: true }; // 文件不存在，视为成功
      }
      return { ok: false, error: err.message };
    }
  }

  /**
   * 等待所有待保存的对话完成。
   * @returns {Promise<void>}
   */
  async flushAll() {
    const promises = [];
    for (const [agentId, timeout] of this._pendingSaves) {
      clearTimeout(timeout);
      promises.push(this._doSaveConversation(agentId));
    }
    this._pendingSaves.clear();
    await Promise.all(promises);
  }

  /**
   * 设置提示词模板。
   * @param {{contextStatus?:string, contextExceeded?:string, contextCritical?:string, contextWarning?:string}} templates
   */
  setPromptTemplates(templates) {
    this.promptTemplates = { ...this.promptTemplates, ...templates };
  }

  /**
   * 更新智能体的 token 使用统计（基于 LLM 返回的实际值）。
   * @param {string} agentId
   * @param {{promptTokens:number, completionTokens:number, totalTokens:number}} usage
   */
  updateTokenUsage(agentId, usage) {
    this._tokenUsage.set(agentId, {
      promptTokens: usage.promptTokens ?? 0,
      completionTokens: usage.completionTokens ?? 0,
      totalTokens: usage.totalTokens ?? 0,
      updatedAt: Date.now()
    });
  }

  /**
   * 获取智能体的 token 使用统计。
   * @param {string} agentId
   * @returns {{promptTokens:number, completionTokens:number, totalTokens:number, updatedAt:number}|null}
   */
  getTokenUsage(agentId) {
    return this._tokenUsage.get(agentId) ?? null;
  }

  /**
   * 获取智能体的上下文使用百分比。
   * @param {string} agentId
   * @returns {number} 0-1 之间的百分比，如果没有数据则返回 0
   */
  getContextUsagePercent(agentId) {
    const usage = this._tokenUsage.get(agentId);
    if (!usage || !usage.promptTokens) {
      return 0;
    }
    return usage.promptTokens / this.contextLimit.maxTokens;
  }

  /**
   * 获取智能体的上下文状态信息。
   * @param {string} agentId
   * @returns {{usedTokens:number, maxTokens:number, usagePercent:number, status:'normal'|'warning'|'critical'|'exceeded'}}
   */
  getContextStatus(agentId) {
    const usage = this._tokenUsage.get(agentId);
    const usedTokens = usage?.promptTokens ?? 0;
    const maxTokens = this.contextLimit.maxTokens;
    const usagePercent = usedTokens / maxTokens;
    
    let status = 'normal';
    if (usagePercent >= this.contextLimit.hardLimitThreshold) {
      status = 'exceeded';
    } else if (usagePercent >= this.contextLimit.criticalThreshold) {
      status = 'critical';
    } else if (usagePercent >= this.contextLimit.warningThreshold) {
      status = 'warning';
    }
    
    return {
      usedTokens,
      maxTokens,
      usagePercent,
      status
    };
  }

  /**
   * 检查智能体是否超过硬性上下文限制。
   * @param {string} agentId
   * @returns {boolean}
   */
  isContextExceeded(agentId) {
    const status = this.getContextStatus(agentId);
    return status.status === 'exceeded';
  }

  /**
   * 清除智能体的 token 使用统计。
   * @param {string} agentId
   */
  clearTokenUsage(agentId) {
    this._tokenUsage.delete(agentId);
  }

  /**
   * 获取或创建某个智能体的会话上下文。
   * @param {string} agentId
   * @param {string} systemPrompt
   * @returns {any[]}
   */
  ensureConversation(agentId, systemPrompt) {
    if (!this.conversations.has(agentId)) {
      this.conversations.set(agentId, [{ role: "system", content: systemPrompt }]);
    }
    return this.conversations.get(agentId);
  }

  /**
   * 获取智能体的会话上下文（如果存在）。
   * @param {string} agentId
   * @returns {any[]|undefined}
   */
  getConversation(agentId) {
    return this.conversations.get(agentId);
  }

  /**
   * 检查智能体是否有会话上下文。
   * @param {string} agentId
   * @returns {boolean}
   */
  hasConversation(agentId) {
    return this.conversations.has(agentId);
  }

  /**
   * 删除智能体的会话上下文。
   * @param {string} agentId
   * @returns {boolean}
   */
  deleteConversation(agentId) {
    return this.conversations.delete(agentId);
  }

  /**
   * 压缩会话上下文，保留系统提示词、摘要和最近的消息。
   * @param {string} agentId 智能体ID
   * @param {string} summary 对被压缩历史的重要内容摘要
   * @param {number} [keepRecentCount=10] 保留最近多少条消息
   * @returns {{ok:boolean, compressed?:boolean, originalCount?:number, newCount?:number, error?:string}}
   */
  compress(agentId, summary, keepRecentCount = 10) {
    const conv = this.conversations.get(agentId);
    
    if (!conv) {
      return { ok: false, error: "conversation_not_found" };
    }

    if (!summary || typeof summary !== "string") {
      return { ok: false, error: "invalid_summary" };
    }

    const originalCount = conv.length;

    // 如果消息数量不足以压缩，直接返回
    // 需要至少有：系统提示词(1) + 要保留的消息(keepRecentCount) + 至少1条要压缩的消息
    if (conv.length <= keepRecentCount + 1) {
      return { ok: true, compressed: false, originalCount, newCount: originalCount };
    }

    // 保留系统提示词（第一条消息）
    const systemPrompt = conv[0];
    
    // 保留最近的消息
    const recentMessages = conv.slice(-keepRecentCount);

    // 创建压缩后的上下文
    const compressed = [
      systemPrompt,
      { 
        role: "system", 
        content: `[历史摘要] ${summary}` 
      },
      ...recentMessages
    ];

    this.conversations.set(agentId, compressed);

    return { 
      ok: true, 
      compressed: true, 
      originalCount, 
      newCount: compressed.length 
    };
  }

  /**
   * 检查智能体的上下文是否超过限制，如果超过则返回警告信息。
   * @param {string} agentId
   * @returns {{warning:boolean, currentCount?:number, maxCount?:number}}
   */
  checkAndWarn(agentId) {
    const conv = this.conversations.get(agentId);
    
    if (!conv) {
      return { warning: false };
    }

    if (conv.length > this.maxContextMessages) {
      return {
        warning: true,
        currentCount: conv.length,
        maxCount: this.maxContextMessages
      };
    }

    return { warning: false };
  }

  /**
   * 获取智能体会话的当前消息数量。
   * @param {string} agentId
   * @returns {number}
   */
  getMessageCount(agentId) {
    const conv = this.conversations.get(agentId);
    return conv ? conv.length : 0;
  }

  /**
   * 生成上下文状态提示文本，用于注入到智能体的消息中。
   * @param {string} agentId
   * @returns {string} 上下文状态提示文本
   */
  buildContextStatusPrompt(agentId) {
    const status = this.getContextStatus(agentId);
    const percentStr = (status.usagePercent * 100).toFixed(1);
    
    // 使用模板生成基础状态提示
    let prompt = '\n\n' + this.promptTemplates.contextStatus
      .replace('{{USED_TOKENS}}', String(status.usedTokens))
      .replace('{{MAX_TOKENS}}', String(status.maxTokens))
      .replace('{{USAGE_PERCENT}}', percentStr);
    
    // 根据状态添加警告提示
    if (status.status === 'exceeded') {
      prompt += '\n' + this.promptTemplates.contextExceeded
        .replace('{{HARD_LIMIT_THRESHOLD}}', (this.contextLimit.hardLimitThreshold * 100).toFixed(0));
    } else if (status.status === 'critical') {
      prompt += '\n' + this.promptTemplates.contextCritical
        .replace('{{CRITICAL_THRESHOLD}}', (this.contextLimit.criticalThreshold * 100).toFixed(0));
    } else if (status.status === 'warning') {
      prompt += '\n' + this.promptTemplates.contextWarning
        .replace('{{WARNING_THRESHOLD}}', (this.contextLimit.warningThreshold * 100).toFixed(0));
    }
    
    return prompt;
  }

  /**
   * 获取智能体对话历史中最后一个工具调用。
   * @param {string} agentId - 智能体ID
   * @returns {{id: string, function: {name: string, arguments: string}}|null} 最后一个工具调用，如果没有则返回 null
   */
  getLastToolCall(agentId) {
    const conv = this.conversations.get(agentId);
    
    if (!conv) {
      return null;
    }

    // 从后向前遍历，查找最后一个包含工具调用的 assistant 消息
    for (let i = conv.length - 1; i >= 0; i--) {
      const msg = conv[i];
      
      if (msg.role === "assistant" && msg.tool_calls && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
        // 返回最后一个工具调用
        return msg.tool_calls[msg.tool_calls.length - 1];
      }
    }

    return null;
  }

  /**
   * 验证对话历史的一致性，确保没有孤立的工具响应。
   * 孤立的工具响应是指：存在 tool_call_id 但对应的工具调用不存在。
   * @param {string} agentId - 智能体ID
   * @returns {{consistent: boolean, orphanedResponses: string[], error?: string}}
   *   - consistent: 对话历史是否一致
   *   - orphanedResponses: 孤立的工具响应的 tool_call_id 列表
   *   - error: 错误信息（如果有）
   */
  verifyHistoryConsistency(agentId) {
    const conv = this.conversations.get(agentId);
    
    if (!conv) {
      return { consistent: false, orphanedResponses: [], error: "conversation_not_found" };
    }

    // 收集所有工具调用的 ID
    const toolCallIds = new Set();
    for (const msg of conv) {
      if (msg.role === "assistant" && msg.tool_calls && Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          if (call.id) {
            toolCallIds.add(call.id);
          }
        }
      }
    }

    // 检查所有工具响应是否有对应的工具调用
    const orphanedResponses = [];
    for (const msg of conv) {
      if (msg.role === "tool" && msg.tool_call_id) {
        if (!toolCallIds.has(msg.tool_call_id)) {
          orphanedResponses.push(msg.tool_call_id);
        }
      }
    }

    const consistent = orphanedResponses.length === 0;

    if (!consistent && this._logger) {
      void this._logger.warn?.("检测到对话历史不一致", {
        agentId,
        orphanedCount: orphanedResponses.length,
        orphanedResponses
      });
    }

    return { consistent, orphanedResponses };
  }
}
