import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { LlmClient } from "../../src/platform/services/llm/llm_client.js";
import { createNoopModuleLogger } from "../../src/platform/utils/logger/logger.js";

describe("LlmClient Concurrency Features", () => {
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
      maxConcurrentRequests: 3,
      logger: mockLogger
    });
  });

  describe("初始化", () => {
    it("应正确初始化并发控制器", () => {
      expect(client.concurrencyController).toBeDefined();
      expect(client.concurrencyController.maxConcurrentRequests).toBe(3);
    });

    it("应使用默认的最大并发数", () => {
      const defaultClient = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        logger: mockLogger
      });
      
      expect(defaultClient.concurrencyController.maxConcurrentRequests).toBe(3);
    });
  });

  // **Feature: llm-concurrency-control, Property 4: Single Agent Serial Constraint**
  describe("Property 4: Single Agent Serial Constraint", () => {
    it("对于任何已有活跃请求的智能体，该智能体的后续请求应立即被拒绝并返回错误", async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }),
        async (agentId) => {
          // Mock OpenAI client to return a controllable promise
          let resolver;
          const controllablePromise = new Promise(resolve => { resolver = resolve; });
          
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockReturnValue(controllablePromise)
              }
            }
          };

          // 发起第一个请求（不等待完成）
          const firstPromise = client.chat({
            messages: [{ role: "user", content: "test1" }],
            meta: { agentId }
          });

          // 等待一小段时间确保第一个请求开始处理
          await new Promise(resolve => setTimeout(resolve, 10));

          // 尝试发起第二个请求，应该被拒绝
          await expect(client.chat({
            messages: [{ role: "user", content: "test2" }],
            meta: { agentId }
          })).rejects.toThrow(`Agent ${agentId} already has an active request`);

          // 验证第一个请求仍在处理中
          expect(client.hasActiveRequest(agentId)).toBe(true);
          
          // 清理：完成第一个请求以避免内存泄漏
          resolver({
            choices: [{ message: { content: "response" } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          });
          
          await firstPromise; // 等待第一个请求完成
        }
      ), { numRuns: 20 }); // 减少运行次数以避免超时
    });
  });

  // **Feature: llm-concurrency-control, Property 7: Asynchronous Non-blocking Behavior**
  describe("Property 7: Asynchronous Non-blocking Behavior", () => {
    it("对于任何LLM请求，chat方法应立即返回Promise而不阻塞调用线程", async () => {
      await fc.assert(fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.string({ minLength: 1, maxLength: 20 }),
        async (agentId, content) => {
          // Mock OpenAI client
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockResolvedValue({
                  choices: [{ message: { content: "response" } }],
                  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
                })
              }
            }
          };

          const startTime = Date.now();
          
          // 调用chat方法
          const promise = client.chat({
            messages: [{ role: "user", content }],
            meta: { agentId }
          });

          const callTime = Date.now() - startTime;
          
          // 验证方法立即返回（调用时间应该很短）
          expect(callTime).toBeLessThan(50); // 50ms内返回
          
          // 验证返回的是Promise
          expect(promise).toBeInstanceOf(Promise);
          
          // 等待Promise完成
          const result = await promise;
          expect(result.content).toBe("response");
        }
      ), { numRuns: 20 }); // 减少运行次数
    });
  });

  // **Feature: llm-concurrency-control, Property 10: Backward Compatibility**
  describe("Property 10: Backward Compatibility", () => {
    it("对于任何现有代码调用LLM_Client方法，接口应保持兼容且所有现有功能正常工作", async () => {
      await fc.assert(fc.asyncProperty(
        fc.option(fc.string({ minLength: 1, maxLength: 10 }), { nil: null }), // agentId可能为null（向后兼容）
        fc.string({ minLength: 1, maxLength: 20 }),
        async (agentId, content) => {
          // Mock OpenAI client
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockResolvedValue({
                  choices: [{ message: { content: "response" } }],
                  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
                })
              }
            }
          };

          const input = {
            messages: [{ role: "user", content }],
            meta: agentId ? { agentId } : {} // 可能没有agentId
          };

          // 调用应该成功，无论是否有agentId
          const result = await client.chat(input);
          
          expect(result.content).toBe("response");
          expect(client._client.chat.completions.create).toHaveBeenCalled();
          
          // 验证现有的abort和hasActiveRequest方法仍然工作
          if (agentId) {
            // 有agentId时，应该能够检查活跃请求状态
            const hasActive = client.hasActiveRequest(agentId);
            expect(typeof hasActive).toBe("boolean");
            
            // abort方法应该能够调用
            const aborted = client.abort(agentId);
            expect(typeof aborted).toBe("boolean");
          }
        }
      ), { numRuns: 20 }); // 减少运行次数
    });
  });

  describe("单元测试", () => {
    it("应正确处理有agentId的请求", async () => {
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

      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      });

      expect(result.content).toBe("test response");
      expect(client._client.chat.completions.create).toHaveBeenCalled();
    });

    it("应正确处理没有agentId的请求（向后兼容）", async () => {
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

      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: {} // 没有agentId
      });

      expect(result.content).toBe("test response");
      expect(client._client.chat.completions.create).toHaveBeenCalled();
    });

    it("应拒绝同一智能体的第二个请求", async () => {
      let resolver;
      const controllablePromise = new Promise(resolve => { resolver = resolve; });
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(controllablePromise)
          }
        }
      };

      // 发起第一个请求
      const firstPromise = client.chat({
        messages: [{ role: "user", content: "test1" }],
        meta: { agentId: "test-agent" }
      });

      // 等待请求开始处理
      await new Promise(resolve => setTimeout(resolve, 10));

      // 尝试发起第二个请求
      await expect(client.chat({
        messages: [{ role: "user", content: "test2" }],
        meta: { agentId: "test-agent" }
      })).rejects.toThrow("Agent test-agent already has an active request");
      
      // 清理：完成第一个请求
      resolver({
        choices: [{ message: { content: "response" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await firstPromise;
    });

    it("应正确更新最大并发数", async () => {
      expect(client.concurrencyController.maxConcurrentRequests).toBe(3);
      
      await client.updateMaxConcurrentRequests(5);
      expect(client.concurrencyController.maxConcurrentRequests).toBe(5);
    });

    it("应返回并发统计信息", () => {
      const stats = client.getConcurrencyStats();
      
      expect(stats).toHaveProperty("activeCount");
      expect(stats).toHaveProperty("queueLength");
      expect(stats).toHaveProperty("totalRequests");
      expect(stats).toHaveProperty("completedRequests");
      expect(stats).toHaveProperty("rejectedRequests");
    });

    it("hasActiveRequest应检查并发控制器和传统映射", async () => {
      // 测试并发控制器中的活跃请求
      let resolver;
      const controllablePromise = new Promise(resolve => { resolver = resolve; });
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(controllablePromise)
          }
        }
      };

      const promise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(client.hasActiveRequest("test-agent")).toBe(true);
      expect(client.hasActiveRequest("other-agent")).toBe(false);
      
      // 清理
      resolver({
        choices: [{ message: { content: "response" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await promise;
    });

    it("abort应取消并发控制器和传统映射中的请求", async () => {
      let resolver;
      const controllablePromise = new Promise(resolve => { resolver = resolve; });
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(controllablePromise)
          }
        }
      };

      const promise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(client.hasActiveRequest("test-agent")).toBe(true);

      const aborted = client.abort("test-agent");
      expect(aborted).toBe(true);
      expect(client.hasActiveRequest("test-agent")).toBe(false);

      // 验证promise被拒绝
      await expect(promise).rejects.toThrow();
    });

    it("应正确处理重试机制", async () => {
      const testName = "重试机制";
      console.log(`[${testName}] 开始测试`);
      
      // 创建一个新的客户端实例，确保干净的状态
      const retryClient = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        maxRetries: 2, // 增加重试次数以确保测试通过
        maxConcurrentRequests: 3,
        logger: mockLogger
      });
      
      // Mock sleep方法以加快测试
      retryClient._sleep = vi.fn().mockResolvedValue(undefined);
      
      let callCount = 0;
      retryClient._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async (payload, options) => {
              callCount++;
              console.log(`[${testName}] OpenAI API 调用 #${callCount}`);
              
              // 检查是否被中断
              if (options?.signal?.aborted) {
                console.log(`[${testName}] 调用 #${callCount} 已被中断`);
                const abortError = new Error("Request aborted");
                abortError.name = "AbortError";
                throw abortError;
              }
              
              if (callCount === 1) {
                console.log(`[${testName}] 第一次调用失败，将重试`);
                const error = new Error("Network error");
                error.name = "NetworkError";
                throw error;
              }
              
              console.log(`[${testName}] 第${callCount}次调用成功`);
              return {
                choices: [{ message: { content: "success" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              };
            })
          }
        }
      };

      console.log(`[${testName}] 发起请求，期望第一次失败，第二次成功`);

      try {
        const result = await retryClient.chat({
          messages: [{ role: "user", content: "test" }],
          meta: { agentId: "test-agent" }
        });

        console.log(`[${testName}] 请求完成，结果:`, result.content);
        expect(result.content).toBe("success");
        expect(callCount).toBe(2); // 第一次失败，第二次成功
        expect(retryClient._client.chat.completions.create).toHaveBeenCalledTimes(2);
        
        // 验证sleep被调用了一次（重试延迟）
        expect(retryClient._sleep).toHaveBeenCalledTimes(1);
        expect(retryClient._sleep).toHaveBeenCalledWith(1000); // 2^0 * 1000 = 1000ms for first retry
        
        console.log(`[${testName}] 测试通过`);
      } catch (error) {
        console.error(`[${testName}] 测试失败:`, error.message);
        console.error(`[${testName}] 调用次数:`, callCount);
        console.error(`[${testName}] Sleep调用次数:`, retryClient._sleep.mock.calls.length);
        console.error(`[${testName}] Sleep调用参数:`, retryClient._sleep.mock.calls);
        throw error;
      }
    });
  });
});
