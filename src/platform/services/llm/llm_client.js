import OpenAI from "openai";
import { createNoopModuleLogger } from "../../utils/logger/logger.js";
import { ConcurrencyController } from "./concurrency_controller.js";

/**
 * 最小 LLM 客户端：使用 OpenAI SDK 调用本地 LMStudio 的 OpenAI 兼容接口。
 */
export class LlmClient {
  /**
   * @param {{baseURL:string, model:string, apiKey:string, maxRetries?:number, maxConcurrentRequests?:number, logger?: {debug:(m:string,d?:any)=>Promise<void>, info:(m:string,d?:any)=>Promise<void>, warn:(m:string,d?:any)=>Promise<void>, error:(m:string,d?:any)=>Promise<void>}, onRetry?: (event: {agentId: string, attempt: number, maxRetries: number, delayMs: number, errorMessage: string, timestamp: string}) => void}} options
   */
  constructor(options) {
    this.baseURL = options.baseURL;
    this.model = options.model;
    this.apiKey = options.apiKey;
    this.maxRetries = options.maxRetries ?? 3;
    this.maxTokens = options.maxTokens ?? undefined; // 最大生成 token 数，undefined 时使用 API 默认值
    this.log = options.logger ?? createNoopModuleLogger();
    // 重试事件回调
    this._onRetry = options.onRetry ?? null;
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
      temperature: typeof input.temperature === "number" ? input.temperature : 0.2,
      max_new_tokens: this.maxTokens, // undefined 时不会发送此参数
      extra_body:{
        "thinking":{"type":"enabled"}
      }
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

        console.log("[LlmClient._chatWithRetry] LLM API 响应成功", {
          timestamp: new Date().toISOString(),
          meta,
          hasResp: !!resp,
          hasChoices: !!resp?.choices,
          choicesCount: resp?.choices?.length,
          hasMsg: !!msg,
          hasUsage: !!resp?.usage,
          usage: resp?.usage
        });

        // 提取token使用信息
        const usage = resp.usage ?? {};
        const promptTokens = usage.prompt_tokens ?? undefined;
        const completionTokens = usage.completion_tokens ?? undefined;
        const totalTokens = usage.total_tokens ?? undefined;

        // 调试：记录完整的 resp.usage 信息
        await this.log.info("LLM Token 使用信息", {
          meta,
          usage: usage,
          promptTokens,
          completionTokens,
          totalTokens,
          hasUsage: !!resp.usage
        });

        console.log("[LlmClient._chatWithRetry] 准备将 _usage 附加到消息", {
          promptTokens,
          completionTokens,
          totalTokens,
          willAttach: !!msg
        });

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
          console.log("[LlmClient._chatWithRetry] 已将 _usage 附加到消息", {
            msgKeys: Object.keys(msg),
            _usage: msg._usage
          });
        } else {
          console.warn("[LlmClient._chatWithRetry] msg 为空，无法附加 _usage！");
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
        
        // 触发重试/失败事件（用于前端显示）
        // 注意：attempt 从 0 开始，所以 attempt + 1 表示当前是第几次尝试
        if (this._onRetry && meta?.agentId) {
          const isLastAttempt = attempt >= maxRetries - 1;
          const delayMs = isLastAttempt ? 0 : Math.pow(2, attempt) * 1000;
          try {
            this._onRetry({
              agentId: meta.agentId,
              attempt: attempt + 1,
              maxRetries,
              delayMs,
              errorMessage: text,
              isFinalFailure: isLastAttempt,
              timestamp: new Date().toISOString()
            });
          } catch (retryErr) {
            void this.log.warn("触发重试事件失败", { error: retryErr?.message ?? String(retryErr) });
          }
        }

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
        
        await this._sleep(delayMs, signal);
      }
    }

    // 理论上不会到达这里，但为了类型安全
    throw lastError;
  }

  /**
   * 延迟指定毫秒数，支持中断信号。
   * @param {number} ms
   * @param {AbortSignal} [signal] 中断信号
   * @returns {Promise<void>}
   */
  async _sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(resolve, ms);
      
      if (signal) {
        if (signal.aborted) {
          clearTimeout(timeoutId);
          const error = new Error("Sleep interrupted");
          error.name = "AbortError";
          reject(error);
          return;
        }
        
        const abortHandler = () => {
          clearTimeout(timeoutId);
          const error = new Error("Sleep interrupted");
          error.name = "AbortError";
          reject(error);
        };
        
        signal.addEventListener("abort", abortHandler, { once: true });
      }
    });
  }

  /**
   * 中断指定智能体的 LLM 调用。
   * @param {string} agentId - 智能体 ID
   * @returns {boolean} 是否成功中断（true 表示有活跃请求被中断，false 表示没有活跃请求）
   */
  abort(agentId) {
    let cancelled = false;
    
    // 首先检查传统的活跃请求映射（向后兼容）
    const controller = this._activeRequests.get(agentId);
    if (controller) {
      controller.abort();
      this._activeRequests.delete(agentId);
      cancelled = true;
    }
    
    // 然后检查并发控制器中的请求（活跃请求或队列中的请求）
    if (this.concurrencyController.hasRequest(agentId)) {
      // 同步中止 AbortController
      const activeRequest = this.concurrencyController.activeRequests.get(agentId);
      if (activeRequest && activeRequest.abortController) {
        activeRequest.abortController.abort();
      }
      
      // 异步取消，但不等待结果
      this.concurrencyController.cancelRequest(agentId).catch(() => {
        // 忽略错误
      });
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
