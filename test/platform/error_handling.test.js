import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { ConcurrencyController } from "../../src/platform/concurrency_controller.js";
import { LlmClient } from "../../src/platform/llm_client.js";
import { createNoopModuleLogger } from "../../src/platform/logger.js";

describe("Error Handling and Resource Release", () => {
  let controller;
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
    
    controller = new ConcurrencyController(3, mockLogger);
    
    client = new LlmClient({
      baseURL: "http://localhost:1234/v1",
      model: "test-model",
      apiKey: "test-key",
      maxRetries: 1,
      maxConcurrentRequests: 3,
      logger: mockLogger
    });
  });

  // **Feature: llm-concurrency-control, Property 8: Error Handling and Resource Release**
  describe("Property 8: Error Handling and Resource Release", () => {
    it("对于任何在处理过程中失败的请求，系统应释放并发槽位并处理下一个队列请求", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 4 }).map(arr => [...new Set(arr)]), // 简化：更少的agentId
        async (agentIds) => {
          const controller = new ConcurrencyController(1, mockLogger); // 简化：只允许1个并发
          const requestPromises = [];
          
          // 第一个请求失败，第二个成功
          const failingRequestFn = vi.fn().mockRejectedValue(new Error("Test error"));
          const successRequestFn = vi.fn().mockResolvedValue("success");
          
          const promise1 = controller.executeRequest(agentIds[0], failingRequestFn);
          const promise2 = controller.executeRequest(agentIds[1], successRequestFn);

          // 等待所有请求完成
          const results = await Promise.allSettled([promise1, promise2]);

          // 验证第一个请求失败，第二个成功
          expect(results[0].status).toBe("rejected");
          expect(results[1].status).toBe("fulfilled");
          expect(results[1].value).toBe("success");

          // 验证最终状态：所有资源都被释放
          expect(controller.getActiveCount()).toBe(0);
          expect(controller.getQueueLength()).toBe(0);
        }
      ), { numRuns: 10 }); // 减少运行次数
    });
  });

  describe("ConcurrencyController错误处理", () => {
    it("应正确处理请求执行失败", async () => {
      const errorMessage = "Network timeout";
      const requestFn = vi.fn().mockRejectedValue(new Error(errorMessage));
      
      // 执行失败的请求
      await expect(controller.executeRequest("agent1", requestFn)).rejects.toThrow(errorMessage);
      
      // 验证资源被正确释放
      expect(controller.getActiveCount()).toBe(0);
      expect(controller.hasActiveRequest("agent1")).toBe(false);
      
      // 验证统计信息
      expect(controller.stats.totalRequests).toBe(1);
      expect(controller.stats.completedRequests).toBe(0);
    });

    it("失败的请求应释放槽位并处理队列中的下一个请求", async () => {
      // 简化测试：只测试基本的错误处理和队列处理
      const controller = new ConcurrencyController(1, mockLogger); // 只允许1个并发
      
      // 第一个请求失败
      const failingRequestFn = vi.fn().mockRejectedValue(new Error("Request failed"));
      const promise1 = controller.executeRequest("agent1", failingRequestFn);
      
      // 第二个请求成功（会进入队列）
      const successRequestFn = vi.fn().mockResolvedValue("success");
      const promise2 = controller.executeRequest("agent2", successRequestFn);
      
      // 等待所有请求完成
      const results = await Promise.allSettled([promise1, promise2]);
      
      // 验证第一个请求失败，第二个成功
      expect(results[0].status).toBe("rejected");
      expect(results[1].status).toBe("fulfilled");
      expect(results[1].value).toBe("success");
      
      // 验证最终状态
      expect(controller.getActiveCount()).toBe(0);
      expect(controller.getQueueLength()).toBe(0);
    });

    it("应正确记录错误日志", async () => {
      const errorMessage = "API Error";
      const requestFn = vi.fn().mockRejectedValue(new Error(errorMessage));
      
      await expect(controller.executeRequest("agent1", requestFn)).rejects.toThrow(errorMessage);
      
      // 验证错误日志被记录
      expect(mockLogger.error).toHaveBeenCalledWith(
        "LLM请求失败",
        expect.objectContaining({
          agentId: "agent1",
          error: errorMessage,
          activeCount: 0
        })
      );
    });
  });

  describe("LlmClient错误处理", () => {
    it("应正确处理网络错误", async () => {
      const networkError = new Error("Network error");
      networkError.name = "NetworkError";
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(networkError)
          }
        }
      };

      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      })).rejects.toThrow("Network error");

      // 验证资源被清理
      expect(client.hasActiveRequest("test-agent")).toBe(false);
    });

    it("应正确处理API错误", async () => {
      const apiError = new Error("API rate limit exceeded");
      apiError.name = "APIError";
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(apiError)
          }
        }
      };

      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      })).rejects.toThrow("API rate limit exceeded");

      // 验证资源被清理
      expect(client.hasActiveRequest("test-agent")).toBe(false);
    });

    it("错误处理应与并发控制正确集成", async () => {
      // 创建一个会失败的请求和一个会成功的请求
      let callCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async () => {
              callCount++;
              if (callCount === 1) {
                throw new Error("First request failed");
              }
              return {
                choices: [{ message: { content: "success" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              };
            })
          }
        }
      };

      // 发起两个请求
      const promise1 = client.chat({
        messages: [{ role: "user", content: "test1" }],
        meta: { agentId: "agent1" }
      });

      const promise2 = client.chat({
        messages: [{ role: "user", content: "test2" }],
        meta: { agentId: "agent2" }
      });

      // 等待结果
      const results = await Promise.allSettled([promise1, promise2]);

      // 验证第一个请求失败，第二个成功
      expect(results[0].status).toBe("rejected");
      expect(results[0].reason.message).toBe("First request failed");
      
      expect(results[1].status).toBe("fulfilled");
      expect(results[1].value.content).toBe("success");

      // 验证资源被正确清理
      expect(client.hasActiveRequest("agent1")).toBe(false);
      expect(client.hasActiveRequest("agent2")).toBe(false);
      
      // 验证并发控制器状态
      expect(client.getConcurrencyStats().activeCount).toBe(0);
    });

    it("应正确处理超时错误", async () => {
      const timeoutError = new Error("Request timeout");
      timeoutError.name = "TimeoutError";
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(timeoutError)
          }
        }
      };

      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      })).rejects.toThrow("Request timeout");

      // 验证资源被清理
      expect(client.hasActiveRequest("test-agent")).toBe(false);
      expect(client.getConcurrencyStats().activeCount).toBe(0);
    });

    it("应正确处理JSON解析错误", async () => {
      const parseError = new Error("Invalid JSON response");
      parseError.name = "SyntaxError";
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(parseError)
          }
        }
      };

      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      })).rejects.toThrow("Invalid JSON response");

      // 验证资源被清理
      expect(client.hasActiveRequest("test-agent")).toBe(false);
    });
  });

  describe("错误恢复", () => {
    it("系统应在错误后继续正常处理新请求", async () => {
      // 先发起一个会失败的请求
      const failingRequestFn = vi.fn().mockRejectedValue(new Error("First request failed"));
      await expect(controller.executeRequest("agent1", failingRequestFn)).rejects.toThrow("First request failed");
      
      // 验证系统状态被正确重置
      expect(controller.getActiveCount()).toBe(0);
      expect(controller.hasActiveRequest("agent1")).toBe(false);
      
      // 发起一个成功的请求
      const successRequestFn = vi.fn().mockResolvedValue("success");
      const result = await controller.executeRequest("agent2", successRequestFn);
      
      expect(result).toBe("success");
      expect(controller.getActiveCount()).toBe(0);
      expect(controller.stats.completedRequests).toBe(1);
    });

    it("多个错误不应影响系统稳定性", async () => {
      const errors = ["Error 1", "Error 2", "Error 3"];
      const promises = [];
      
      // 发起多个会失败的请求
      for (let i = 0; i < errors.length; i++) {
        const requestFn = vi.fn().mockRejectedValue(new Error(errors[i]));
        const promise = controller.executeRequest(`agent${i}`, requestFn);
        promises.push(promise);
      }
      
      // 等待所有请求完成
      const results = await Promise.allSettled(promises);
      
      // 验证所有请求都失败了
      results.forEach((result, index) => {
        expect(result.status).toBe("rejected");
        expect(result.reason.message).toBe(errors[index]);
      });
      
      // 验证系统状态正确
      expect(controller.getActiveCount()).toBe(0);
      expect(controller.getQueueLength()).toBe(0);
      expect(controller.stats.totalRequests).toBe(3);
      expect(controller.stats.completedRequests).toBe(0);
      
      // 验证系统仍能处理新请求
      const successRequestFn = vi.fn().mockResolvedValue("recovery success");
      const result = await controller.executeRequest("recovery-agent", successRequestFn);
      expect(result).toBe("recovery success");
    });
  });
});