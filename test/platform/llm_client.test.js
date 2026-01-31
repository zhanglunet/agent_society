import { describe, it, expect, beforeEach, vi } from "vitest";
import { LlmClient } from "../../src/platform/services/llm/llm_client.js";
import { createNoopModuleLogger } from "../../src/platform/utils/logger/logger.js";

describe("LlmClient", () => {
  let client;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      ...createNoopModuleLogger(),
      info: vi.fn().mockResolvedValue(undefined),
      warn: vi.fn().mockResolvedValue(undefined),
      error: vi.fn().mockResolvedValue(undefined),
      debug: vi.fn().mockResolvedValue(undefined),
      logLlmMetrics: vi.fn().mockResolvedValue(undefined)
    };
    
    client = new LlmClient({
      baseURL: "http://localhost:1234/v1",
      model: "test-model",
      apiKey: "test-key",
      maxRetries: 1,
      logger: mockLogger
    });
  });

  describe("构造函数", () => {
    it("应初始化 _activeRequests Map", () => {
      expect(client._activeRequests).toBeInstanceOf(Map);
      expect(client._activeRequests.size).toBe(0);
    });
  });

  describe("abort()", () => {
    it("当没有活跃请求时应返回 false", () => {
      const result = client.abort("non-existent-agent");
      expect(result).toBe(false);
    });

    it("当有活跃请求时应返回 true 并调用 abort", () => {
      const mockController = {
        abort: vi.fn(),
        signal: { aborted: false }
      };
      client._activeRequests.set("test-agent", mockController);

      const result = client.abort("test-agent");

      expect(result).toBe(true);
      expect(mockController.abort).toHaveBeenCalled();
      expect(client._activeRequests.has("test-agent")).toBe(false);
    });

    it("中断后应从 _activeRequests 中移除", () => {
      const mockController = {
        abort: vi.fn(),
        signal: { aborted: false }
      };
      client._activeRequests.set("agent-1", mockController);
      client._activeRequests.set("agent-2", { abort: vi.fn(), signal: { aborted: false } });

      client.abort("agent-1");

      expect(client._activeRequests.has("agent-1")).toBe(false);
      expect(client._activeRequests.has("agent-2")).toBe(true);
    });
  });

  describe("hasActiveRequest()", () => {
    it("当没有活跃请求时应返回 false", () => {
      expect(client.hasActiveRequest("any-agent")).toBe(false);
    });

    it("当有活跃请求时应返回 true", () => {
      client._activeRequests.set("test-agent", { abort: vi.fn() });
      expect(client.hasActiveRequest("test-agent")).toBe(true);
    });

    it("应区分不同的 agentId", () => {
      client._activeRequests.set("agent-1", { abort: vi.fn() });
      
      expect(client.hasActiveRequest("agent-1")).toBe(true);
      expect(client.hasActiveRequest("agent-2")).toBe(false);
    });
  });

  describe("AbortController 生命周期", () => {
    it("chat() 应在请求前将 AbortController 添加到 _activeRequests", async () => {
      // 模拟 OpenAI 客户端
      let capturedSignal = null;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async (payload, options) => {
              capturedSignal = options?.signal;
              // 验证在请求时 AbortController 已被添加
              expect(client._activeRequests.has("test-agent")).toBe(true);
              return {
                choices: [{ message: { content: "test response" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              };
            })
          }
        }
      };

      await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      });

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    });

    it("chat() 应在请求完成后从 _activeRequests 中移除", async () => {
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: "test response" } }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            })
          }
        }
      };

      await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      });

      expect(client._activeRequests.has("test-agent")).toBe(false);
    });

    it("chat() 应在请求失败后从 _activeRequests 中移除", async () => {
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error("API Error"))
          }
        }
      };

      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      })).rejects.toThrow();

      expect(client._activeRequests.has("test-agent")).toBe(false);
    });

    it("chat() 应在请求被中断后从 _activeRequests 中移除", async () => {
      const abortError = new Error("Request aborted");
      abortError.name = "AbortError";
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(abortError)
          }
        }
      };

      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      })).rejects.toThrow();

      expect(client._activeRequests.has("test-agent")).toBe(false);
    });

    it("没有 agentId 时不应添加到 _activeRequests", async () => {
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: "test response" } }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            })
          }
        }
      };

      await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: {} // 没有 agentId
      });

      expect(client._activeRequests.size).toBe(0);
    });
  });

  describe("中断错误处理", () => {
    it("应正确处理 AbortError 并不重试", async () => {
      const abortError = new Error("Request aborted");
      abortError.name = "AbortError";
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(abortError)
          }
        }
      };

      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      })).rejects.toThrow("LLM 请求已被中断");

      // 应该只调用一次，不重试
      expect(client._client.chat.completions.create).toHaveBeenCalledTimes(1);
    });

    it("当 signal 已被中断时应立即抛出错误", async () => {
      // 预先设置一个已中断的 AbortController
      const controller = new AbortController();
      controller.abort();
      client._activeRequests.set("test-agent", controller);

      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: "test response" } }]
            })
          }
        }
      };

      // 直接调用 _chatWithRetry 并传入已中断的 signal
      await expect(client._chatWithRetry(
        { messages: [{ role: "user", content: "test" }], meta: { agentId: "test-agent" } },
        3,
        controller.signal
      )).rejects.toThrow("LLM 请求已被中断");
    });
  });
});
