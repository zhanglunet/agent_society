import OpenAI from "openai";
import { createNoopModuleLogger } from "../../utils/logger/logger.js";
import { ConcurrencyController } from "./concurrency_controller.js";

/**
 * LLM 客户端：使用 OpenAI SDK 调用 LLM API。
 *
 * 设计原则：
 * - 持有 configService 引用，需要时从引用读取配置
 * - 配置更新自动生效，无需重新创建客户端
 */
export class LlmClient {
  /**
   * @param {{configService: import("../../utils/config/config.js").Config, serviceId?:string, maxRetries?:number, logger?:object, onRetry?:function}} options
   */
  constructor(options) {
    this.configService = options.configService;
    this.serviceId = options.serviceId ?? null;
    this.maxRetries = options.maxRetries ?? 3;
    this.log = options.logger ?? createNoopModuleLogger();
    this._onRetry = options.onRetry ?? null;

    // 缓存 OpenAI 客户端和配置
    this._client = null;
    this._clientConfig = null;

    // 并发控制器
    this.concurrencyController = null;

    // 存储活跃的 LLM 请求，用于支持中断功能
    this._activeRequests = new Map();

    // 标记是否已初始化
    this._initialized = false;
  }

  /** @private */
  async _ensureInitialized() {
    if (this._initialized) return;

    const config = await this._getConfigAsync();
    if (!config) {
      throw new Error("LLM 配置不存在");
    }

    // 创建 OpenAI 客户端
    this._client = new OpenAI({
      apiKey: config.apiKey ?? "",
      baseURL: config.baseURL
    });
    this._clientConfig = { baseURL: config.baseURL, apiKey: config.apiKey, model: config.model };

    // 创建并发控制器
    const maxConcurrent = config.maxConcurrentRequests ?? 3;
    this.concurrencyController = new ConcurrencyController(maxConcurrent, this.log);

    this._initialized = true;
  }

  /** @private */
  async _getConfigAsync() {
    if (!this.configService) return null;

    if (this.serviceId) {
      // 获取服务配置
      const { services } = await this.configService.getServices();
      return services.find(s => s.id === this.serviceId) ?? null;
    } else {
      // 获取默认 LLM 配置
      const { llm } = await this.configService.getLlm();
      return llm;
    }
  }

  /** @private */
  _needsClientUpdate(config) {
    if (!this._clientConfig) return true;
    return (
      this._clientConfig.baseURL !== config?.baseURL ||
      this._clientConfig.apiKey !== config?.apiKey ||
      this._clientConfig.model !== config?.model
    );
  }

  /** @private */
  _updateClient(config) {
    this._client = new OpenAI({
      apiKey: config.apiKey ?? "",
      baseURL: config.baseURL
    });
    this._clientConfig = { baseURL: config.baseURL, apiKey: config.apiKey, model: config.model };
  }

  /**
   * 调用聊天补全（支持工具调用、中断和并发控制）。
   * @param {{messages:any[], tools?:any[], temperature?:number, meta?:any}} input
   * @returns {Promise<any>} message
   */
  async chat(input) {
    // 确保已初始化
    await this._ensureInitialized();

    const agentId = input?.meta?.agentId ?? null;

    // 获取最新配置
    const config = await this._getConfigAsync();
    if (!config) {
      throw new Error("LLM 配置不存在");
    }

    // 检查是否需要更新客户端
    if (this._needsClientUpdate(config)) {
      this._updateClient(config);
    }

    // 如果没有agentId，回退到原始行为（向后兼容）
    if (!agentId) {
      return this._executeChatRequestLegacy(input, config);
    }

    // 使用并发控制器执行请求
    return this.concurrencyController.executeRequest(
      agentId,
      () => this._executeChatRequest(input, config)
    );
  }

  /** @private */
  async _executeChatRequestLegacy(input, config) {
    const agentId = input?.meta?.agentId ?? null;
    const abortController = new AbortController();

    if (agentId) {
      this._activeRequests.set(agentId, abortController);
    }

    try {
      return await this._chatWithRetry(input, this.maxRetries, abortController.signal, config);
    } finally {
      if (agentId) {
        this._activeRequests.delete(agentId);
      }
    }
  }

  /** @private */
  async _executeChatRequest(input, config) {
    const agentId = input?.meta?.agentId ?? null;
    const abortController = new AbortController();

    if (agentId) {
      this._activeRequests.set(agentId, abortController);
    }

    try {
      return await this._chatWithRetry(input, this.maxRetries, abortController.signal, config);
    } finally {
      if (agentId) {
        this._activeRequests.delete(agentId);
      }
    }
  }

  /** @private */
  async _chatWithRetry(input, maxRetries, signal, config) {
    const meta = input?.meta ?? null;
    const currentMessage = Array.isArray(input?.messages) && input.messages.length > 0 ? input.messages[input.messages.length - 1] : null;

    const payload = {
      model: config.model ?? "unknown",
      messages: input.messages,
      tools: input.tools,
      tool_choice: input.tools && input.tools.length > 0 ? "auto" : undefined,
      temperature: typeof input.temperature === "number" ? input.temperature : 0.2,
      max_new_tokens: config.maxTokens,
      extra_body: { "thinking": { "type": "enabled" } }
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
      if (signal?.aborted) {
        const abortError = new Error("LLM 请求已被中断");
        abortError.name = "AbortError";
        void this.log.info("LLM 请求在开始前已被中断", { meta, attempt: attempt + 1 });
        throw abortError;
      }

      const startTime = Date.now();
      try {
        const resp = await this._client.chat.completions.create(payload, { signal });
        const latencyMs = Date.now() - startTime;
        const msg = resp.choices?.[0]?.message ?? null;

        const usage = resp.usage ?? {};
        const promptTokens = usage.prompt_tokens ?? undefined;
        const completionTokens = usage.completion_tokens ?? undefined;
        const totalTokens = usage.total_tokens ?? undefined;

        await this.log.info("LLM Token 使用信息", {
          meta,
          usage: usage,
          promptTokens,
          completionTokens,
          totalTokens,
          hasUsage: !!resp.usage
        });

        await this.log.info("LLM 响应内容", { meta, message: msg });

        await this.log.logLlmMetrics({
          latencyMs,
          promptTokens,
          completionTokens,
          totalTokens,
          success: true,
          model: config.model ?? "unknown"
        }, meta);

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

        await this.log.logLlmMetrics({
          latencyMs,
          success: false,
          model: config.model ?? "unknown",
          errorType,
          errorMessage: text
        }, meta);

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

    throw lastError;
  }

  /** @private */
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

  abort(agentId) {
    let cancelled = false;

    const controller = this._activeRequests.get(agentId);
    if (controller) {
      controller.abort();
      this._activeRequests.delete(agentId);
      cancelled = true;
    }

    if (this.concurrencyController?.hasRequest(agentId)) {
      const activeRequest = this.concurrencyController.activeRequests.get(agentId);
      if (activeRequest && activeRequest.abortController) {
        activeRequest.abortController.abort();
      }

      this.concurrencyController.cancelRequest(agentId).catch(() => {});
      cancelled = true;
    }

    return cancelled;
  }

  hasActiveRequest(agentId) {
    const hasActiveInController = this.concurrencyController?.hasActiveRequest(agentId) ?? false;
    const hasActiveInLegacy = this._activeRequests.has(agentId);
    return hasActiveInController || hasActiveInLegacy;
  }

  async updateMaxConcurrentRequests(maxConcurrentRequests) {
    if (this.concurrencyController) {
      await this.concurrencyController.updateMaxConcurrentRequests(maxConcurrentRequests);
    }
  }

  getConcurrencyStats() {
    return this.concurrencyController?.getStats() ?? null;
  }
}
