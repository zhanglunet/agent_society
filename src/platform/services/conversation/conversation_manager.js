import { mkdir, readFile, writeFile, readdir, unlink } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * 会话上下文管理器
 * 负责管理智能体的会话上下文，包括压缩历史消息和检查上下文长度。
 * 支持基于 token 的上下文长度限制。
 * 支持对话历史持久化到磁盘。
 */
export class ConversationManager {
  /**
   * @param {{maxContextMessages?:number, conversations?:Map, contextLimit?:{maxTokens:number, warningThreshold:number, criticalThreshold:number, hardLimitThreshold:number}, promptTemplates?:{contextStatus?:string, contextExceeded?:string, contextCritical?:string, contextWarning?:string}, conversationsDir?:string, logger?:object, autoCompressionManager?:object}} options
   */
  constructor(options = {}) {
    this.maxContextMessages = options.maxContextMessages ?? 50;
    this.conversations = options.conversations ?? new Map();
    this._conversationsDir = options.conversationsDir ?? null;
    this._logger = options.logger ?? null;
    this._pendingSaves = new Map(); // 防抖保存
    
    // 自动压缩管理器（可选）
    this._autoCompressionManager = options.autoCompressionManager ?? null;
    
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

    /**
     * prompt token 估算器（基于每次成功调用返回的 usage 动态校准）。
     *
     * 设计目标：
     * - 不引入 tokenizer 依赖；
     * - 用“上一次真实 prompt_tokens / 上一次发送内容字符数”得到 tokensPerChar；
     * - 在 token/context 超限时，用估算值按比例滑动窗口，减少超限概率。
     *
     * Map<agentId, {tokensPerChar:number, lastPromptTokens:number, lastPromptChars:number, updatedAt:number}>
     */
    this._promptTokenEstimator = new Map();
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
   * 设置自动压缩管理器。
   * @param {object} manager - AutoCompressionManager 实例
   */
  setAutoCompressionManager(manager) {
    this._autoCompressionManager = manager;
  }

  /**
   * 执行自动压缩。
   * 
   * 直接传递会话消息数组给压缩管理器处理。
   * 压缩管理器会自己判断是否需要压缩，需要则直接修改消息数组。
   * 
   * @param {string} agentId - 智能体ID
   * @returns {Promise<void>}
   */
  async processAutoCompression(agentId) {
    // 检查是否有压缩管理器
    if (!this._autoCompressionManager) {
      if (this._logger) {
        this._logger.debug?.('ConversationManager.processAutoCompression: 未设置压缩管理器，跳过自动压缩', { agentId });
      }
      return;
    }

    // 获取会话消息数组
    const conv = this.conversations.get(agentId);
    if (!conv) {
      if (this._logger) {
        this._logger.debug?.('ConversationManager.processAutoCompression: 会话不存在，跳过自动压缩', { agentId });
      }
      return;
    }

    try {
      if (this._logger) {
        this._logger.debug?.('ConversationManager.processAutoCompression: 开始自动压缩', { 
          agentId, 
          messageCount: conv.length 
        });
      }

      // 调用压缩管理器处理，直接传递会话消息数组
      await this._autoCompressionManager.process(conv);

      if (this._logger) {
        this._logger.debug?.('ConversationManager.processAutoCompression: 自动压缩完成', { 
          agentId, 
          messageCount: conv.length 
        });
      }

    } catch (error) {
      // 捕获异常，确保不影响业务流程
      if (this._logger) {
        this._logger.error?.('ConversationManager.processAutoCompression: 自动压缩异常', {
          agentId,
          error: error.message,
          stack: error.stack
        });
      }
    }
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
   * 同步加载单个智能体的对话历史。
   * 用于在 LLM 调用前确保上下文已加载。
   * 
   * @param {string} agentId
   * @returns {{ok: boolean, loaded: boolean, messageCount?: number, error?: string}}
   */
  loadConversationSync(agentId) {
    if (!this._conversationsDir) {
      return { ok: false, loaded: false, error: "conversationsDir not set" };
    }

    if (!agentId || typeof agentId !== "string" || !agentId.trim()) {
      return { ok: false, loaded: false, error: "missing_agent_id" };
    }

    const filePath = path.join(this._conversationsDir, `${agentId}.json`);
    
    if (!existsSync(filePath)) {
      return { ok: true, loaded: false }; // 文件不存在不是错误，只是没历史
    }

    try {
      const raw = readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      
      if (Array.isArray(data.messages)) {
        // 如果内存中已经有消息（比如刚插入的系统提示词），我们要合并或者替换
        // 这里的策略是：如果内存中只有系统提示词，则替换为加载的消息
        // 确保加载的消息包含系统提示词，或者在后续 ensureConversation 中会补齐
        this.conversations.set(agentId, data.messages);
        
        if (data.tokenUsage) {
          this._tokenUsage.set(agentId, data.tokenUsage);
        }
        
        if (this._logger) {
          this._logger.debug?.("同步加载对话历史成功", { agentId, messages: data.messages.length });
        }
        return { ok: true, loaded: true, messageCount: data.messages.length };
      } else {
        return { ok: false, loaded: false, error: "invalid format" };
      }
    } catch (err) {
      const errorMsg = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      if (this._logger) {
        this._logger.error?.("同步加载对话历史失败", { agentId, error: errorMsg });
      }
      return { ok: false, loaded: false, error: errorMsg };
    }
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
   * 更新 prompt token 估算器（基于本次实际发送的 messages 与返回的 promptTokens）。
   *
   * 注意：
   * - 这里估算的是 prompt token（上下文输入 token），不包含 completion token。
   * - 若 messages 过短或 promptTokens 非法，会跳过更新，避免污染估算器。
   *
   * @param {string} agentId
   * @param {any[]} sentMessages - 本次实际发送给 LLM 的 messages（包含 system）
   * @param {number} promptTokens - LLM 返回的 prompt_tokens
   * @returns {{ok:boolean, tokensPerChar?:number, sampleChars?:number, sampleTokens?:number, error?:string}}
   */
  updatePromptTokenEstimator(agentId, sentMessages, promptTokens) {
    if (!agentId) {
      return { ok: false, error: "agent_id_missing" };
    }
    if (!Array.isArray(sentMessages) || sentMessages.length === 0) {
      return { ok: false, error: "invalid_messages" };
    }
    if (typeof promptTokens !== "number" || !Number.isFinite(promptTokens) || promptTokens <= 0) {
      return { ok: false, error: "invalid_prompt_tokens" };
    }

    const sampleChars = this._getMessagesCharCount(sentMessages);
    if (!Number.isFinite(sampleChars) || sampleChars <= 0) {
      return { ok: false, error: "invalid_sample_chars" };
    }

    const raw = promptTokens / sampleChars;
    const current = this._clamp(raw, 0.05, 8);
    const prev = this._promptTokenEstimator.get(agentId)?.tokensPerChar ?? null;

    const tokensPerChar = typeof prev === "number" && Number.isFinite(prev)
      ? (prev * 0.7 + current * 0.3)
      : current;

    this._promptTokenEstimator.set(agentId, {
      tokensPerChar,
      lastPromptTokens: promptTokens,
      lastPromptChars: sampleChars,
      updatedAt: Date.now()
    });

    return { ok: true, tokensPerChar, sampleChars, sampleTokens: promptTokens };
  }

  /**
   * 同步加载单个智能体的持久化对话历史到内存（用于启动早期/调度器同步路径）。
   *
   * 说明：
   * - TurnEngine/ComputeScheduler 的关键路径是同步的，无法 await；
   * - 当运行时尚未完成 loadAllConversations，或 conversations Map 尚未包含该 agentId 时，
   *   该方法允许在首次对话时按需同步恢复历史，确保发送给 LLM 的 messages 包含重启前内容。
   *
   * @param {string} agentId
   * @returns {{ok:boolean, loaded:boolean, messageCount?:number, error?:string}}
   */
  loadConversationSync(agentId) {
    if (!this._conversationsDir) {
      return { ok: false, loaded: false, error: "conversationsDir not set" };
    }
    if (!agentId || typeof agentId !== "string" || !agentId.trim()) {
      return { ok: false, loaded: false, error: "missing_agent_id" };
    }

    const filePath = path.join(this._conversationsDir, `${agentId}.json`);
    if (!existsSync(filePath)) {
      return { ok: true, loaded: false };
    }

    try {
      const raw = readFileSync(filePath, "utf8");
      const data = JSON.parse(raw);
      if (!Array.isArray(data?.messages)) {
        return { ok: false, loaded: false, error: "invalid_format" };
      }

      this.conversations.set(agentId, data.messages);
      if (data.tokenUsage) {
        this._tokenUsage.set(agentId, data.tokenUsage);
      }

      return { ok: true, loaded: true, messageCount: data.messages.length };
    } catch (err) {
      return { ok: false, loaded: false, error: err?.message ?? String(err ?? "unknown_error") };
    }
  }

  /**
   * 估算一条消息的 prompt token 数。
   *
   * 估算策略：
   * - token ≈ 内容字符数 * tokensPerChar；
   * - 如果没有校准样本，使用保守默认值（1 token/char），倾向于“少发不超限”。\n   *
   * @param {string} agentId
   * @param {{role?:string, content?:any}} message
   * @returns {number}
   */
  estimateMessageTokens(agentId, message) {
    const tokensPerChar = this._promptTokenEstimator.get(agentId)?.tokensPerChar ?? 1;
    const charCount = this._getMessageCharCount(message);
    const estimated = charCount * tokensPerChar;
    return Math.max(0, Math.ceil(estimated));
  }

  /**
   * 估算一组 messages 的 prompt token 数。
   * @param {string} agentId
   * @param {any[]} messages
   * @returns {number}
   */
  estimatePromptTokens(agentId, messages) {
    if (!Array.isArray(messages) || messages.length === 0) {
      return 0;
    }
    let total = 0;
    for (const msg of messages) {
      total += this.estimateMessageTokens(agentId, msg);
    }
    return total;
  }

  /**
   * 获取“基于估算 token”的上下文限制状态。
   *
   * 说明：
   * - 该状态用于在发起 LLM 请求前做预防性滑动窗口；\n   * - 与 getContextStatus() 不同，它不依赖上一次真实 usage，而是对“当前将要发送的 messages”做估算。\n   *
   * @param {string} agentId
   * @param {any[]} messages
   * @returns {{estimatedPromptTokens:number, maxTokens:number, hardLimitThreshold:number, thresholdTokens:number, status:'normal'|'exceeded'}}
   */
  getEstimatedContextLimitStatus(agentId, messages) {
    const maxTokens = this.contextLimit?.maxTokens ?? 0;
    const hardLimitThreshold = this.contextLimit?.hardLimitThreshold ?? 1;
    const thresholdTokens = Math.floor(maxTokens * hardLimitThreshold);

    const estimatedPromptTokens = this.estimatePromptTokens(agentId, messages);

    const exceeded = Boolean(maxTokens) && Number.isFinite(maxTokens) && maxTokens > 0 && estimatedPromptTokens >= thresholdTokens;
    return {
      estimatedPromptTokens,
      maxTokens,
      hardLimitThreshold,
      thresholdTokens,
      status: exceeded ? 'exceeded' : 'normal'
    };
  }

  /**
   * 如果“估算 token”达到硬性阈值，则自动滑动窗口。
   *
   * @param {string} agentId
   * @param {{keepRatio?:number, maxLoops?:number}} [options]
   * @returns {{ok:boolean, slid:boolean, loops:number, before?:ReturnType<ConversationManager['getEstimatedContextLimitStatus']>, after?:ReturnType<ConversationManager['getEstimatedContextLimitStatus']>, slideResults?:any[], error?:string}}
   */
  slideWindowIfNeededByEstimate(agentId, options = {}) {
    const keepRatio = typeof options.keepRatio === "number" ? options.keepRatio : 0.7;
    const maxLoops = typeof options.maxLoops === "number" ? options.maxLoops : 3;

    const conv = this.conversations.get(agentId);
    if (!conv) {
      return { ok: false, slid: false, loops: 0, error: "conversation_not_found" };
    }

    const before = this.getEstimatedContextLimitStatus(agentId, conv);
    if (before.status !== 'exceeded') {
      return { ok: true, slid: false, loops: 0, before, after: before, slideResults: [] };
    }

    const slideResults = [];
    let slid = false;
    let loops = 0;

    for (let i = 0; i < maxLoops; i += 1) {
      const status = this.getEstimatedContextLimitStatus(agentId, conv);
      if (status.status !== 'exceeded') {
        break;
      }

      const slideResult = this.slideWindowByEstimatedTokens(agentId, keepRatio);
      slideResults.push(slideResult);
      loops += 1;

      if (!slideResult.ok) {
        return { ok: false, slid, loops, before, after: this.getEstimatedContextLimitStatus(agentId, conv), slideResults, error: slideResult.error ?? "slide_failed" };
      }

      if (slideResult.slid) {
        slid = true;
      } else {
        break;
      }
    }

    const after = this.getEstimatedContextLimitStatus(agentId, conv);
    return { ok: true, slid, loops, before, after, slideResults };
  }

  /**
   * 按“估算 token”滑动上下文窗口：保留 system + 最后 keepRatio 的非 system token 贡献。
   *
   * 设计约束：
   * - 必须保留开头连续的 system 消息（system prompt + 历史摘要等）。
   * - 裁剪边界不能导致 tool 响应失去对应的 tool_calls（避免孤立 tool 消息）。
   *
   * @param {string} agentId
   * @param {number} [keepRatio=0.7] - 保留比例（0-1），含义为“保留最后 keepRatio 的 token 贡献”
   * @returns {{ok:boolean, slid?:boolean, originalCount?:number, newCount?:number, estimatedTotalTokens?:number, estimatedKeptNonSystemTokens?:number, keepRatio?:number, error?:string}}
   */
  slideWindowByEstimatedTokens(agentId, keepRatio = 0.7) {
    const conv = this.conversations.get(agentId);
    if (!conv) {
      return { ok: false, error: "conversation_not_found" };
    }
    if (typeof keepRatio !== "number" || !Number.isFinite(keepRatio) || keepRatio <= 0 || keepRatio >= 1) {
      return { ok: false, error: "invalid_keep_ratio" };
    }

    const originalCount = conv.length;
    if (originalCount <= 1) {
      return { ok: true, slid: false, originalCount, newCount: originalCount, estimatedTotalTokens: 0, estimatedKeptNonSystemTokens: 0, keepRatio };
    }

    const systemPrefixLen = this._getSystemPrefixLength(conv);
    const nonSystem = conv.slice(systemPrefixLen);
    if (nonSystem.length === 0) {
      return { ok: true, slid: false, originalCount, newCount: originalCount, estimatedTotalTokens: this.estimatePromptTokens(agentId, conv), estimatedKeptNonSystemTokens: 0, keepRatio };
    }

    const nonSystemTokens = nonSystem.map((m) => this.estimateMessageTokens(agentId, m));
    const totalNonSystemTokens = nonSystemTokens.reduce((a, b) => a + b, 0);
    const targetKeptNonSystemTokens = Math.max(1, Math.ceil(totalNonSystemTokens * keepRatio));

    let keptNonSystemTokens = 0;
    let startInNonSystem = nonSystem.length - 1;
    for (let i = nonSystem.length - 1; i >= 0; i -= 1) {
      keptNonSystemTokens += nonSystemTokens[i];
      startInNonSystem = i;
      if (keptNonSystemTokens >= targetKeptNonSystemTokens) {
        break;
      }
    }

    let startGlobal = systemPrefixLen + startInNonSystem;
    startGlobal = this._adjustStartIndexForToolConsistency(conv, startGlobal, systemPrefixLen);

    const newConv = [
      ...conv.slice(0, systemPrefixLen),
      ...conv.slice(startGlobal)
    ];

    if (newConv.length === originalCount) {
      return {
        ok: true,
        slid: false,
        originalCount,
        newCount: originalCount,
        estimatedTotalTokens: this.estimatePromptTokens(agentId, conv),
        estimatedKeptNonSystemTokens: keptNonSystemTokens,
        keepRatio
      };
    }

    conv.splice(0, conv.length, ...newConv);

    return {
      ok: true,
      slid: true,
      originalCount,
      newCount: conv.length,
      estimatedTotalTokens: this.estimatePromptTokens(agentId, conv),
      estimatedKeptNonSystemTokens: keptNonSystemTokens,
      keepRatio
    };
  }

  /**
   * 计算会话开头连续 system 消息的长度。
   * @param {any[]} conv
   * @returns {number}
   * @private
   */
  _getSystemPrefixLength(conv) {
    let n = 0;
    for (let i = 0; i < conv.length; i += 1) {
      if (conv[i]?.role === "system") {
        n += 1;
      } else {
        break;
      }
    }
    return n;
  }

  /**
   * 根据 tool_calls/tool_call_id 的关系，调整裁剪起点，避免孤立 tool 响应。
   *
   * 处理策略：
   * - 如果裁剪后 suffix 中存在 tool 消息，其 tool_call_id 在 suffix 中找不到对应的 assistant tool_calls.id，说明裁剪截断了调用链。\n   * - 优先向前扩展（把对应的 assistant tool_calls 拉进来）；找不到则丢弃该 tool 消息（将起点推进到 tool 之后）。\n   *
   * @param {any[]} conv
   * @param {number} startGlobal
   * @param {number} minStart - 不允许小于 system 前缀长度
   * @returns {number}
   * @private
   */
  _adjustStartIndexForToolConsistency(conv, startGlobal, minStart) {
    let start = Math.max(minStart, startGlobal);
    if (start >= conv.length) {
      return Math.max(minStart, conv.length - 1);
    }

    for (let guard = 0; guard < 20; guard += 1) {
      const suffix = conv.slice(start);
      const callIds = this._collectToolCallIdsFromMessages(suffix);

      let orphanGlobalIndex = -1;
      let orphanToolCallId = null;
      for (let i = 0; i < suffix.length; i += 1) {
        const msg = suffix[i];
        if (msg?.role === "tool" && msg.tool_call_id) {
          if (!callIds.has(msg.tool_call_id)) {
            orphanGlobalIndex = start + i;
            orphanToolCallId = msg.tool_call_id;
            break;
          }
        }
      }

      if (orphanGlobalIndex === -1) {
        return start;
      }

      const callIndex = this._findAssistantToolCallMessageIndex(conv, orphanToolCallId, orphanGlobalIndex - 1);
      if (callIndex >= minStart && callIndex >= 0) {
        start = Math.min(start, callIndex);
        continue;
      }

      start = Math.min(conv.length, orphanGlobalIndex + 1);
      start = Math.max(minStart, start);
      if (start >= conv.length) {
        return Math.max(minStart, conv.length - 1);
      }
    }

    return start;
  }

  /**
   * 收集 messages 中所有 assistant.tool_calls.id。
   * @param {any[]} messages
   * @returns {Set<string>}
   * @private
   */
  _collectToolCallIdsFromMessages(messages) {
    const ids = new Set();
    for (const msg of messages) {
      if (msg?.role === "assistant" && Array.isArray(msg.tool_calls)) {
        for (const call of msg.tool_calls) {
          if (call?.id) {
            ids.add(call.id);
          }
        }
      }
    }
    return ids;
  }

  /**
   * 在 conv 中从指定位置向前查找包含目标 tool_call_id 的 assistant 消息。
   * @param {any[]} conv
   * @param {string} toolCallId
   * @param {number} fromIndex - 起始搜索位置（包含）
   * @returns {number} 找到返回索引，否则返回 -1
   * @private
   */
  _findAssistantToolCallMessageIndex(conv, toolCallId, fromIndex) {
    if (!toolCallId) {
      return -1;
    }
    const start = Math.min(fromIndex, conv.length - 1);
    for (let i = start; i >= 0; i -= 1) {
      const msg = conv[i];
      if (msg?.role !== "assistant" || !Array.isArray(msg.tool_calls)) {
        continue;
      }
      for (const call of msg.tool_calls) {
        if (call?.id === toolCallId) {
          return i;
        }
      }
    }
    return -1;
  }

  /**
   * 获取一条消息的内容字符数（用于 prompt token 估算）。\n   *
   * @param {{content?:any}} message
   * @returns {number}
   * @private
   */
  _getMessageCharCount(message) {
    const content = message?.content;
    if (typeof content === "string") {
      return content.length;
    }
    if (content === null || content === undefined) {
      return 0;
    }
    try {
      return JSON.stringify(content).length;
    } catch {
      return String(content).length;
    }
  }

  /**
   * 获取 messages 的内容字符总数（用于 prompt token 估算）。\n   *
   * @param {any[]} messages
   * @returns {number}
   * @private
   */
  _getMessagesCharCount(messages) {
    let total = 0;
    for (const msg of messages) {
      total += this._getMessageCharCount(msg);
    }
    return total;
  }

  /**
   * 数值夹逼。\n   *
   * @param {number} value
   * @param {number} min
   * @param {number} max
   * @returns {number}
   * @private
   */
  _clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    if (value < min) return min;
    if (value > max) return max;
    return value;
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
