import OpenAI from "openai";
import { createNoopModuleLogger } from "./logger.js";
import { ConcurrencyController } from "./concurrency_controller.js";

/**
 * 最小 LLM 客户端：使用 OpenAI SDK 调用本地 LMStudio 的 OpenAI 兼容接口。
 */
export class LlmClient {
  /**
   * @param {{baseURL:string, model:string, apiKey:string, maxRetries?:number, maxConcurrentRequests?:number, logger?: {debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>}} options
   */
  constructor(options) {
    this.baseURL = options.baseURL;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.maxRetries = options.maxRetries ?? 3;
    this.log = options.logger ?? createNoopModuleLogger();
    this._client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseURL
    });
    
    // 初始化并发控制器，验证配置
    let maxConcurrentRequests = options.maxConcurrentRequests ?? 3;
    if (typeof maxConcurrentRequests !== 'number' || maxConcurrentRequests <= 0) {
      this.log.warn("无效的maxConcurrentRequests配置，使用默认值3", {
        provided: maxConcurrentRequests,
        using: 3
      });
      maxConcurrentRequests = 3;
    }
    this.concurrencyController = new ConcurrencyController(maxConcurrentRequests, this.log);
    
    // 存储活跃的 LLM 请求，用于支持中断功能（向后兼容）
    // Map<agentId, AbortController>
    this._activeRequests = new Map();
  }

  /**
   * 调用聊天补全（支持工具调用、中断和并发控制）。
   * @param {{messages:any[], tools?:any[], temperature?:number, meta?:any}} input
   * @returns {Promise<any>} message
   */
  async chat(input) {
    const agentId = input?.meta?.agentId ?? null;
    
    // 如果没有agentId，回退到原始行为（向后兼容）
    if (!agentId) {
      return this._executeChatRequestLegacy(input);
    }

    // 使用并发控制器执行请求
    return this.concurrencyController.executeRequest(
      agentId,
      () => this._executeChatRequest(input)
    );
  }

  /**
   * 向后兼容的聊天请求执行（不使用并发控制）
   * @param {{messages:any[], tools?:any[], temperature?:number, meta?:any}} input
   * @returns {Promise<any>} message
   */
  async _executeChatRequestLegacy(input) {
    const agentId = input?.meta?.agentId ?? null;
    const abortController = new AbortController();
    
    // 如果有 agentId，将 AbortController 存入活跃请求映射（向后兼容）
    if (agentId) {
      this._activeRequests.set(agentId, abortController);
    }
    
    try {
      return await this._chatWithRetry(input, this.maxRetries, abortController.signal);
    } finally {
      // 无论成功、失败还是中断，都要清理活跃请求映射
      if (agentId) {
        this._activeRequests.delete(agentId);
      }
    }
  }

  /**
   * 执行聊天请求（通过并发控制器调用）
   * @param {{messages:any[], tools?:any[], temperature?:number, meta?:any}} input
   * @returns {Promise<any>} message
   */
  async _executeChatRequest(input) {
    const agentId = input?.meta?.agentId ?? null;
    const abortController = new AbortController();
    
    // 将 AbortController 存入活跃请求映射以支持中断
    if (agentId) {
      this._activeRequests.set(agentId, abortController);
    }
    
    try {
      return await this._chatWithRetry(input, this.maxRetries, abortController.signal);
    } finally {
      // 清理活跃请求映射
      if (agentId) {
        this._activeRequests.delete(agentId);
      }
    }
  }

  /**
   * 带重试的聊天补全调用（指数退避策略）。
   * @param {{messages:any[], tools?:any[], temperature?:number, meta?:any}} input
   * @param {number} maxRetries 最大重试次数
   * @param {AbortSignal} [signal] 中断信号
   * @returns {Promise<any>} message
   */
  async _chatWithRetry(input, maxRetries, signal) {
    const meta = input?.meta ?? null;
    const currentMessage = Array.isArray(input?.messages) && input.messages.length > 0 ? input.messages[input.messages.length - 1] : null;
    const payload = {
      model: this.model,
      messages: input.messages,
      tools: input.tools,
      tool_choice: input.tools && input.tools.length > 0 ? "auto" : undefined,
      temperature: typeof input.temperature === "number" ? input.temperature : 0.2
    };
    await this.log.info("LLM 请求内容", {
      meta,
      payload: {
        model: payload.model,
        tool_choice: payload.tool_choice,
        temperature: payload.temperature,
        tool_names: Array.isArray(payload.tools) ? payload.tools.map((t) => t?.function?.name).filter(Boolean) : [],
        current_message: currentMessage
      }
    });

    let lastError = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // 检查是否已被中断
      if (signal?.aborted) {
        const abortError = new Error("LLM 请求已被中断");
        abortError.name = "AbortError";
        void this.log.info("LLM 请求在开始前已被中断", { meta, attempt: attempt + 1 });
        throw abortError;
      }

      const startTime = Date.now();
      try {
        // 将 signal 传递给 OpenAI SDK
        const resp = await this._client.chat.completions.create(payload, { signal });
        const latencyMs = Date.now() - startTime;
        const msg = resp.choices?.[0]?.message ?? null;
        
        // 提取token使用信息
        const usage = resp.usage ?? {};
        const promptTokens = usage.prompt_tokens ?? undefined;
        const completionTokens = usage.completion_tokens ?? undefined;
        const totalTokens = usage.total_tokens ?? undefined;
        
        await this.log.info("LLM 响应内容", { meta, message: msg });
        
        // 记录LLM调用指标
        await this.log.logLlmMetrics({
          latencyMs,
          promptTokens,
          completionTokens,
          totalTokens,
          success: true,
          model: this.model
        }, meta);
        
        // 将 token 使用信息附加到消息对象上，供调用者使用
        if (msg) {
          msg._usage = {
            promptTokens: promptTokens ?? 0,
            completionTokens: completionTokens ?? 0,
            totalTokens: totalTokens ?? 0
          };
        }
        
        return msg;
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        lastError = err;
        const text = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
        const errorType = err?.name ?? "UnknownError";
        
        // 如果是中断错误，直接抛出，不重试
        if (errorType === "AbortError" || signal?.aborted) {
          void this.log.info("LLM 请求已被中断", { 
            meta, 
            attempt: attempt + 1,
            latencyMs,
            errorMessage: text
          });
          const abortError = new Error("LLM 请求已被中断");
          abortError.name = "AbortError";
          throw abortError;
        }
        
        // 记录失败的LLM调用指标
        await this.log.logLlmMetrics({
          latencyMs,
          success: false,
          model: this.model,
          errorType,
          errorMessage: text
        }, meta);
        
        // 如果是最后一次尝试，不再重试
        if (attempt >= maxRetries - 1) {
          void this.log.error("LLM 请求失败（已达最大重试次数）", { 
            meta, 
            message: text,
            errorType,
            attempt: attempt + 1, 
            maxRetries,
            stack: err?.stack ?? null
          });
          throw err;
        }

        // 计算指数退避延迟：2^n 秒（n 为重试次数，从0开始）
        const delayMs = Math.pow(2, attempt) * 1000;
        void this.log.warn("LLM 调用失败，重试中", { 
          meta,
          message: text,
          errorType,
          attempt: attempt + 1, 
          maxRetries, 
          delayMs,
          stack: err?.stack ?? null
        });
        
        await this._sleep(delayMs);
      }
    }

    // 理论上不会到达这里，但为了类型安全
    throw lastError;
  }

  /**
   * 延迟指定毫秒数。
   * @param {number} ms
   * @returns {Promise<void>}
   */
  async _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 中断指定智能体的 LLM 调用。
   * @param {string} agentId - 智能体 ID
   * @returns {boolean} 是否成功中断（true 表示有活跃请求被中断，false 表示没有活跃请求）
   */
  abort(agentId) {
    let cancelled = false;
    
    // 首先检查并发控制器中的请求（活跃请求或队列中的请求）
    if (this.concurrencyController.hasRequest(agentId)) {
      // 异步取消，但不等待结果
      this.concurrencyController.cancelRequest(agentId).catch(() => {
        // 忽略错误
      });
      cancelled = true;
    }
    
    // 然后检查传统的活跃请求映射（向后兼容）
    const controller = this._activeRequests.get(agentId);
    if (controller) {
      controller.abort();
      this._activeRequests.delete(agentId);
      cancelled = true;
    }
    
    return cancelled;
  }

  /**
   * 检查指定智能体是否有活跃的 LLM 调用。
   * @param {string} agentId - 智能体 ID
   * @returns {boolean} 是否有活跃请求
   */
  hasActiveRequest(agentId) {
    // 检查并发控制器中的活跃请求
    const hasActiveInController = this.concurrencyController.hasActiveRequest(agentId);
    
    // 检查传统的活跃请求映射（向后兼容）
    const hasActiveInLegacy = this._activeRequests.has(agentId);
    
    return hasActiveInController || hasActiveInLegacy;
  }

  /**
   * 更新最大并发请求数
   * @param {number} maxConcurrentRequests - 新的最大并发请求数
   */
  async updateMaxConcurrentRequests(maxConcurrentRequests) {
    await this.concurrencyController.updateMaxConcurrentRequests(maxConcurrentRequests);
  }

  /**
   * 获取并发控制统计信息
   * @returns {object} 统计信息
   */
  getConcurrencyStats() {
    return this.concurrencyController.getStats();
  }
}
