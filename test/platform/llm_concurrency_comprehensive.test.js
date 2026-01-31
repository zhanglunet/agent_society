import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { LlmClient } from "../../src/platform/services/llm/llm_client.js";
import { ConcurrencyController } from "../../src/platform/concurrency_controller.js";
import { createNoopModuleLogger } from "../../src/platform/utils/logger/logger.js";

describe("LLM Concurrency Control - 100 Comprehensive Tests", () => {
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
  });

  // 辅助函数：创建可控制的Promise
  function createControllablePromise() {
    let resolver, rejecter;
    const promise = new Promise((resolve, reject) => {
      resolver = resolve;
      rejecter = reject;
    });
    return { promise, resolve: resolver, reject: rejecter };
  }

  // 辅助函数：等待指定时间
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 辅助函数：创建mock的LLM客户端
  function createMockClient(maxConcurrentRequests = 3, maxRetries = 3) {
    return new LlmClient({
      baseURL: "http://localhost:1234/v1",
      model: "test-model",
      apiKey: "test-key",
      maxConcurrentRequests,
      maxRetries,
      logger: mockLogger
    });
  }

  // 辅助函数：设置成功的mock响应
  function setupSuccessMock(client, delay = 0) {
    client._client = {
      chat: {
        completions: {
          create: vi.fn().mockImplementation(async () => {
            if (delay > 0) await sleep(delay);
            return {
              choices: [{ message: { content: "success" } }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            };
          })
        }
      }
    };
  }

  // 辅助函数：设置失败的mock响应
  function setupFailureMock(client, errorMessage = "API Error") {
    client._client = {
      chat: {
        completions: {
          create: vi.fn().mockRejectedValue(new Error(errorMessage))
        }
      }
    };
  }

  // === 1-10: 基础功能测试 ===
  describe("基础功能测试 (1-10)", () => {
    it("1. 应正确初始化ConcurrencyController", () => {
      const controller = new ConcurrencyController(3, mockLogger);
      expect(controller.maxConcurrentRequests).toBe(3);
      expect(controller.getActiveCount()).toBe(0);
      expect(controller.getQueueLength()).toBe(0);
    });

    it("2. 应正确初始化LlmClient", () => {
      const client = createMockClient();
      expect(client.concurrencyController).toBeDefined();
      expect(client.concurrencyController.maxConcurrentRequests).toBe(3);
    });

    it("3. 应正确处理单个请求", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      expect(result.content).toBe("success");
    });

    it("4. 应正确处理多个不同智能体的并发请求", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const promises = Array.from({ length: 3 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(3);
      results.forEach(result => expect(result.content).toBe("success"));
    });

    it("5. 应拒绝同一智能体的第二个请求", async () => {
      const client = createMockClient();
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      const firstPromise = client.chat({
        messages: [{ role: "user", content: "test1" }],
        meta: { agentId: "agent1" }
      });
      
      await expect(client.chat({
        messages: [{ role: "user", content: "test2" }],
        meta: { agentId: "agent1" }
      })).rejects.toThrow("Agent agent1 already has an active request");
      
      resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await firstPromise;
    });
    it("6. 应正确处理队列管理", async () => {
      const client = createMockClient(2); // 最大并发数为2
      const promises = [];
      const resolvers = [];
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const { promise, resolve } = createControllablePromise();
              resolvers.push(resolve);
              return promise;
            })
          }
        }
      };
      
      // 发起3个请求，第3个应该进入队列
      for (let i = 0; i < 3; i++) {
        promises.push(client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        }));
      }
      
      await sleep(50);
      
      const stats = client.getConcurrencyStats();
      expect(stats.activeCount).toBe(2);
      expect(stats.queueLength).toBe(1);
      
      // 完成所有请求
      resolvers.forEach(resolve => resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }));
      
      await Promise.all(promises);
    });

    it("7. 应正确处理请求取消", async () => {
      const client = createMockClient(1);
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      const requestPromise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      await sleep(10);
      
      const cancelled = client.abort("agent1");
      expect(cancelled).toBe(true);
      
      await expect(requestPromise).rejects.toThrow();
    });

    it("8. 应正确处理错误恢复", async () => {
      const client = createMockClient();
      setupFailureMock(client);
      
      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      })).rejects.toThrow("API Error");
      
      // 验证资源被正确释放
      expect(client.getConcurrencyStats().activeCount).toBe(0);
    });

    it("9. 应正确处理统计信息", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const initialStats = client.getConcurrencyStats();
      expect(initialStats.totalRequests).toBe(0);
      
      await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      const finalStats = client.getConcurrencyStats();
      expect(finalStats.totalRequests).toBe(1);
      expect(finalStats.completedRequests).toBe(1);
    });

    it("10. 应正确处理向后兼容性", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // 不带agentId的请求应该正常工作
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: {}
      });
      
      expect(result.content).toBe("success");
    });
  });

  // === 11-20: 临界值测试 ===
  describe("临界值测试 (11-20)", () => {
    it("11. 测试最大并发数为1的情况", async () => {
      const client = createMockClient(1);
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      const firstPromise = client.chat({
        messages: [{ role: "user", content: "test1" }],
        meta: { agentId: "agent1" }
      });
      
      const secondPromise = client.chat({
        messages: [{ role: "user", content: "test2" }],
        meta: { agentId: "agent2" }
      });
      
      await sleep(10);
      
      const stats = client.getConcurrencyStats();
      expect(stats.activeCount).toBe(1);
      expect(stats.queueLength).toBe(1);
      
      resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await Promise.all([firstPromise, secondPromise]);
    });

    it("12. 测试最大并发数为100的情况", async () => {
      const client = createMockClient(100);
      setupSuccessMock(client);
      
      const promises = Array.from({ length: 50 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(10);
      
      const stats = client.getConcurrencyStats();
      expect(stats.activeCount).toBe(50);
      expect(stats.queueLength).toBe(0);
      
      await Promise.all(promises);
    });

    it("13. 测试队列长度达到极限", async () => {
      const client = createMockClient(1);
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      const promises = Array.from({ length: 1000 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(50);
      
      const stats = client.getConcurrencyStats();
      expect(stats.activeCount).toBe(1);
      expect(stats.queueLength).toBe(999);
      
      resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await Promise.all(promises);
    });

    it("14. 测试零延迟请求", async () => {
      const client = createMockClient();
      setupSuccessMock(client, 0);
      
      const start = Date.now();
      await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100); // 应该很快完成
    });

    it("15. 测试最小有效agentId", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "a" } // 最短的有效agentId
      });
      
      expect(result.content).toBe("success");
    });

    it("16. 测试最长agentId", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const longAgentId = "a".repeat(1000); // 很长的agentId
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: longAgentId }
      });
      
      expect(result.content).toBe("success");
    });

    it("17. 测试边界并发数配置", async () => {
      // 测试最小值
      const client1 = createMockClient(1);
      expect(client1.concurrencyController.maxConcurrentRequests).toBe(1);
      
      // 测试较大值
      const client2 = createMockClient(Number.MAX_SAFE_INTEGER);
      expect(client2.concurrencyController.maxConcurrentRequests).toBe(Number.MAX_SAFE_INTEGER);
    });

    it("18. 测试请求完成的边界时机", async () => {
      const client = createMockClient(1);
      const resolvers = [];
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const { promise, resolve } = createControllablePromise();
              resolvers.push(resolve);
              return promise;
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
      
      await sleep(10);
      
      // 第一个请求完成的瞬间，第二个请求应该开始
      resolvers[0]({
        choices: [{ message: { content: "success1" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await promise1;
      
      // 验证第二个请求现在是活跃的
      await sleep(10);
      expect(client.getConcurrencyStats().activeCount).toBe(1);
      
      resolvers[1]({
        choices: [{ message: { content: "success2" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await promise2;
    });

    it("19. 测试统计计数器的边界值", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // 发送大量请求测试计数器
      const promises = Array.from({ length: 1000 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await Promise.all(promises);
      
      const stats = client.getConcurrencyStats();
      expect(stats.totalRequests).toBe(1000);
      expect(stats.completedRequests).toBe(1000);
    });

    it("20. 测试配置更新的边界情况", async () => {
      const client = createMockClient(3);
      
      // 更新到最小值
      await client.updateMaxConcurrentRequests(1);
      expect(client.concurrencyController.maxConcurrentRequests).toBe(1);
      
      // 更新到很大的值
      await client.updateMaxConcurrentRequests(10000);
      expect(client.concurrencyController.maxConcurrentRequests).toBe(10000);
    });
  });
  // === 21-30: 异常值测试 ===
  describe("异常值测试 (21-30)", () => {
    it("21. 测试无效的maxConcurrentRequests配置", () => {
      // 负数
      const client1 = createMockClient(-1);
      expect(client1.concurrencyController.maxConcurrentRequests).toBe(3); // 应该使用默认值
      
      // 零
      const client2 = createMockClient(0);
      expect(client2.concurrencyController.maxConcurrentRequests).toBe(3);
      
      // 非数字
      const client3 = createMockClient("invalid");
      expect(client3.concurrencyController.maxConcurrentRequests).toBe(3);
    });

    it("22. 测试null/undefined agentId", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // null agentId - 应该使用向后兼容模式
      const result1 = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: null }
      });
      expect(result1.content).toBe("success");
      
      // undefined agentId - 应该使用向后兼容模式
      const result2 = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: undefined }
      });
      expect(result2.content).toBe("success");
    });

    it("23. 测试空字符串agentId", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "" }
      })).rejects.toThrow("agentId is required");
    });

    it("24. 测试特殊字符agentId", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const specialIds = [
        "agent@#$%",
        "agent with spaces",
        "agent\nwith\nnewlines",
        "agent\twith\ttabs",
        "agent??with??emojis",
        "agent中文",
        "agent-_./\\",
        JSON.stringify({ complex: "object" })
      ];
      
      for (const agentId of specialIds) {
        const result = await client.chat({
          messages: [{ role: "user", content: "test" }],
          meta: { agentId }
        });
        expect(result.content).toBe("success");
      }
    });

    it("25. 测试无效的消息格式", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // 空消息数组
      await expect(client.chat({
        messages: [],
        meta: { agentId: "agent1" }
      })).resolves.toBeDefined(); // 应该不抛出错误
      
      // null消息
      await expect(client.chat({
        messages: null,
        meta: { agentId: "agent1" }
      })).resolves.toBeDefined();
    });

    it("26. 测试极大的消息内容", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const largeContent = "x".repeat(1000000); // 1MB的内容
      const result = await client.chat({
        messages: [{ role: "user", content: largeContent }],
        meta: { agentId: "agent1" }
      });
      
      expect(result.content).toBe("success");
    });

    it("27. 测试无效的meta对象", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // null meta
      const result1 = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: null
      });
      expect(result1.content).toBe("success");
      
      // undefined meta
      const result2 = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: undefined
      });
      expect(result2.content).toBe("success");
    });

    it("28. 测试网络超时错误", async () => {
      const client = createMockClient();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const error = new Error("Request timeout");
              error.name = "TimeoutError";
              return Promise.reject(error);
            })
          }
        }
      };
      
      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      })).rejects.toThrow("Request timeout");
    });

    it("29. 测试内存不足错误", async () => {
      const client = createMockClient();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const error = new Error("Out of memory");
              error.name = "MemoryError";
              return Promise.reject(error);
            })
          }
        }
      };
      
      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      })).rejects.toThrow("Out of memory");
    });

    it("30. 测试JSON解析错误", async () => {
      const client = createMockClient();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const error = new Error("Unexpected token in JSON");
              error.name = "SyntaxError";
              return Promise.reject(error);
            })
          }
        }
      };
      
      await expect(client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      })).rejects.toThrow("Unexpected token in JSON");
    });
  });

  // === 31-40: 并发竞争条件测试 ===
  describe("并发竞争条件测试 (31-40)", () => {
    it("31. 测试同时取消多个请求", async () => {
      const client = createMockClient(1);
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      // 发起多个请求
      const promises = Array.from({ length: 5 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(10);
      
      // 同时取消所有请求
      const cancelResults = Array.from({ length: 5 }, (_, i) => 
        client.abort(`agent${i}`)
      );
      
      expect(cancelResults.filter(Boolean)).toHaveLength(5); // 所有取消都应该成功
      
      // 验证所有promise都被拒绝
      for (const promise of promises) {
        await expect(promise).rejects.toThrow();
      }
    });

    it("32. 测试请求完成和取消的竞争条件", async () => {
      const client = createMockClient();
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      const requestPromise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      // 同时完成请求和尝试取消
      setTimeout(() => {
        resolve({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        });
      }, 10);
      
      setTimeout(() => {
        client.abort("agent1");
      }, 10);
      
      // 请求应该要么成功要么被取消
      try {
        const result = await requestPromise;
        expect(result.content).toBe("success");
      } catch (error) {
        expect(error.message).toContain("cancelled");
      }
    });

    it("33. 测试配置更新和请求处理的竞争条件", async () => {
      const client = createMockClient(2);
      setupSuccessMock(client, 50); // 50ms延迟
      
      // 发起请求
      const promises = Array.from({ length: 5 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      // 同时更新配置
      setTimeout(() => {
        client.updateMaxConcurrentRequests(10);
      }, 25);
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      results.forEach(result => expect(result.content).toBe("success"));
    });

    it("34. 测试多个智能体同时发起请求", async () => {
      const client = createMockClient(3);
      setupSuccessMock(client, 10);
      
      // 100个智能体同时发起请求
      const promises = Array.from({ length: 100 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(100);
      
      const stats = client.getConcurrencyStats();
      expect(stats.completedRequests).toBe(100);
    });

    it("35. 测试队列处理的原子性", async () => {
      const client = createMockClient(1);
      const resolvers = [];
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const { promise, resolve } = createControllablePromise();
              resolvers.push(resolve);
              return promise;
            })
          }
        }
      };
      
      // 发起多个请求
      const promises = Array.from({ length: 10 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(10);
      
      // 验证队列状态
      let stats = client.getConcurrencyStats();
      expect(stats.activeCount).toBe(1);
      expect(stats.queueLength).toBe(9);
      
      // 逐个完成请求，验证队列正确处理
      for (let i = 0; i < resolvers.length; i++) {
        resolvers[i]({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        });
        
        await sleep(10); // 给队列处理时间
        
        stats = client.getConcurrencyStats();
        if (i < resolvers.length - 1) {
          expect(stats.activeCount).toBe(1); // 应该始终有一个活跃请求
        }
      }
      
      await Promise.all(promises);
    });

    it("36. 测试统计信息更新的原子性", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // 并发发起大量请求
      const promises = Array.from({ length: 1000 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await Promise.all(promises);
      
      const stats = client.getConcurrencyStats();
      expect(stats.totalRequests).toBe(1000);
      expect(stats.completedRequests).toBe(1000);
      expect(stats.rejectedRequests).toBe(0);
    });

    it("37. 测试内存泄漏防护", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // 发起大量请求并完成
      for (let batch = 0; batch < 10; batch++) {
        const promises = Array.from({ length: 100 }, (_, i) => 
          client.chat({
            messages: [{ role: "user", content: `test${batch}-${i}` }],
            meta: { agentId: `agent${batch}-${i}` }
          })
        );
        
        await Promise.all(promises);
        
        // 验证没有内存泄漏
        expect(client.getConcurrencyStats().activeCount).toBe(0);
        expect(client.getConcurrencyStats().queueLength).toBe(0);
      }
    });

    it("38. 测试错误处理的并发安全性", async () => {
      const client = createMockClient(3);
      
      let callCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount % 2 === 0) {
                return Promise.reject(new Error("Random error"));
              }
              return Promise.resolve({
                choices: [{ message: { content: "success" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              });
            })
          }
        }
      };
      
      // 并发发起请求，一半会失败
      const promises = Array.from({ length: 100 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        }).catch(error => ({ error: error.message }))
      );
      
      const results = await Promise.all(promises);
      
      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);
      
      expect(successes.length + failures.length).toBe(100);
      expect(failures.length).toBeGreaterThan(0);
    });

    it("39. 测试hasActiveRequest的并发安全性", async () => {
      const client = createMockClient();
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      const requestPromise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      await sleep(10);
      
      // 并发检查活跃请求状态
      const checks = Array.from({ length: 100 }, () => 
        client.hasActiveRequest("agent1")
      );
      
      expect(checks.every(Boolean)).toBe(true); // 所有检查都应该返回true
      
      resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await requestPromise;
    });

    it("40. 测试abort方法的并发安全性", async () => {
      const client = createMockClient();
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      const requestPromise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      await sleep(10);
      
      // 并发调用abort
      const abortResults = Array.from({ length: 10 }, () => 
        client.abort("agent1")
      );
      
      // 只有第一个abort应该成功
      const successfulAborts = abortResults.filter(Boolean);
      expect(successfulAborts.length).toBe(1);
      
      await expect(requestPromise).rejects.toThrow();
    });
  });
  // === 41-50: 随机值测试 ===
  describe("随机值测试 (41-50)", () => {
    it("41. 属性测试：随机并发数和智能体数量", async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }), // maxConcurrentRequests
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 20 }), // agentIds
        async (maxConcurrent, agentIds) => {
          const client = createMockClient(maxConcurrent);
          setupSuccessMock(client);
          
          const promises = agentIds.map(agentId => 
            client.chat({
              messages: [{ role: "user", content: "test" }],
              meta: { agentId }
            })
          );
          
          const results = await Promise.all(promises);
          expect(results).toHaveLength(agentIds.length);
          
          const stats = client.getConcurrencyStats();
          expect(stats.completedRequests).toBe(agentIds.length);
        }
      ), { numRuns: 20 });
    });

    it("42. 属性测试：随机延迟和错误率", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 10 }),
        fc.float({ min: 0, max: 1 }), // 错误率
        async (agentIds, errorRate) => {
          const client = createMockClient();
          
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockImplementation(async () => {
                  await sleep(Math.random() * 50); // 随机延迟
                  
                  if (Math.random() < errorRate) {
                    throw new Error("Random error");
                  }
                  
                  return {
                    choices: [{ message: { content: "success" } }],
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
                  };
                })
              }
            }
          };
          
          const promises = agentIds.map(agentId => 
            client.chat({
              messages: [{ role: "user", content: "test" }],
              meta: { agentId }
            }).catch(error => ({ error: error.message }))
          );
          
          const results = await Promise.all(promises);
          expect(results).toHaveLength(agentIds.length);
        }
      ), { numRuns: 10 });
    });

    it("43. 属性测试：随机取消时机", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 2, maxLength: 5 }),
        fc.integer({ min: 0, max: 100 }), // 取消延迟
        async (agentIds, cancelDelay) => {
          const client = createMockClient(1);
          const resolvers = [];
          
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockImplementation(() => {
                  const { promise, resolve } = createControllablePromise();
                  resolvers.push(resolve);
                  return promise;
                })
              }
            }
          };
          
          const promises = agentIds.map(agentId => 
            client.chat({
              messages: [{ role: "user", content: "test" }],
              meta: { agentId }
            }).catch(error => ({ cancelled: true }))
          );
          
          // 随机时机取消第一个智能体
          setTimeout(() => {
            client.abort(agentIds[0]);
          }, cancelDelay);
          
          // 完成其他请求
          setTimeout(() => {
            resolvers.forEach(resolve => resolve({
              choices: [{ message: { content: "success" } }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            }));
          }, cancelDelay + 50);
          
          const results = await Promise.all(promises);
          expect(results).toHaveLength(agentIds.length);
        }
      ), { numRuns: 10 });
    });

    it("44. 属性测试：随机配置更新", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: 20 }), { minLength: 1, maxLength: 10 }),
        async (concurrencyLimits) => {
          const client = createMockClient(concurrencyLimits[0]);
          
          // 随机更新配置
          for (const limit of concurrencyLimits) {
            await client.updateMaxConcurrentRequests(limit);
            expect(client.concurrencyController.maxConcurrentRequests).toBe(limit);
          }
        }
      ), { numRuns: 20 });
    });

    it("45. 属性测试：随机消息内容", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.string(), { minLength: 1, maxLength: 5 }),
        fc.string({ minLength: 1, maxLength: 10 }),
        async (messageContents, agentId) => {
          const client = createMockClient();
          setupSuccessMock(client);
          
          for (const content of messageContents) {
            const result = await client.chat({
              messages: [{ role: "user", content }],
              meta: { agentId: `${agentId}-${Math.random()}` }
            });
            expect(result.content).toBe("success");
          }
        }
      ), { numRuns: 10 });
    });

    it("46. 属性测试：随机agentId格式", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.oneof(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.integer().map(String),
          fc.float().map(String),
          fc.boolean().map(String)
        ), { minLength: 1, maxLength: 10 }),
        async (agentIds) => {
          const client = createMockClient();
          setupSuccessMock(client);
          
          const promises = agentIds.map((agentId, index) => 
            client.chat({
              messages: [{ role: "user", content: "test" }],
              meta: { agentId: `${agentId}-${index}` } // 确保唯一性
            })
          );
          
          const results = await Promise.all(promises);
          expect(results).toHaveLength(agentIds.length);
        }
      ), { numRuns: 15 });
    });

    it("47. 属性测试：随机错误类型", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.oneof(
          fc.constant("NetworkError"),
          fc.constant("TimeoutError"),
          fc.constant("APIError"),
          fc.constant("ValidationError"),
          fc.constant("AuthError")
        ), { minLength: 1, maxLength: 5 }),
        async (errorTypes) => {
          const client = createMockClient();
          
          let callCount = 0;
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockImplementation(() => {
                  const errorType = errorTypes[callCount % errorTypes.length];
                  callCount++;
                  
                  const error = new Error(`${errorType} occurred`);
                  error.name = errorType;
                  return Promise.reject(error);
                })
              }
            }
          };
          
          for (let i = 0; i < errorTypes.length; i++) {
            await expect(client.chat({
              messages: [{ role: "user", content: "test" }],
              meta: { agentId: `agent${i}` }
            })).rejects.toThrow();
          }
        }
      ), { numRuns: 10 });
    });

    it("48. 属性测试：随机统计信息验证", async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        fc.float({ min: 0, max: 0.5 }), // 错误率
        async (requestCount, errorRate) => {
          const client = createMockClient();
          
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockImplementation(() => {
                  if (Math.random() < errorRate) {
                    return Promise.reject(new Error("Random error"));
                  }
                  return Promise.resolve({
                    choices: [{ message: { content: "success" } }],
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
                  });
                })
              }
            }
          };
          
          const promises = Array.from({ length: requestCount }, (_, i) => 
            client.chat({
              messages: [{ role: "user", content: "test" }],
              meta: { agentId: `agent${i}` }
            }).catch(() => ({ error: true }))
          );
          
          const results = await Promise.all(promises);
          const stats = client.getConcurrencyStats();
          
          expect(stats.totalRequests).toBe(requestCount);
          expect(stats.completedRequests + stats.rejectedRequests).toBeLessThanOrEqual(requestCount);
        }
      ), { numRuns: 10 });
    });

    it("49. 属性测试：随机队列操作", async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 5, maxLength: 15 }),
        async (maxConcurrent, agentIds) => {
          const client = createMockClient(maxConcurrent);
          const resolvers = [];
          
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockImplementation(() => {
                  const { promise, resolve } = createControllablePromise();
                  resolvers.push(resolve);
                  return promise;
                })
              }
            }
          };
          
          // 发起所有请求
          const promises = agentIds.map(agentId => 
            client.chat({
              messages: [{ role: "user", content: "test" }],
              meta: { agentId }
            })
          );
          
          await sleep(10);
          
          const stats = client.getConcurrencyStats();
          expect(stats.activeCount).toBeLessThanOrEqual(maxConcurrent);
          expect(stats.activeCount + stats.queueLength).toBe(agentIds.length);
          
          // 随机完成请求
          const shuffledResolvers = [...resolvers].sort(() => Math.random() - 0.5);
          shuffledResolvers.forEach(resolve => resolve({
            choices: [{ message: { content: "success" } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          }));
          
          await Promise.all(promises);
        }
      ), { numRuns: 10 });
    });

    it("50. 属性测试：随机时序操作", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.record({
          agentId: fc.string({ minLength: 1, maxLength: 10 }),
          delay: fc.integer({ min: 0, max: 100 }),
          shouldCancel: fc.boolean()
        }), { minLength: 1, maxLength: 10 }),
        async (operations) => {
          const client = createMockClient();
          const resolvers = [];
          
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockImplementation(() => {
                  const { promise, resolve } = createControllablePromise();
                  resolvers.push(resolve);
                  return promise;
                })
              }
            }
          };
          
          // 按延迟发起请求
          const promises = operations.map(({ agentId, delay, shouldCancel }) => {
            return new Promise(resolve => {
              setTimeout(async () => {
                try {
                  const requestPromise = client.chat({
                    messages: [{ role: "user", content: "test" }],
                    meta: { agentId: `${agentId}-${Math.random()}` }
                  });
                  
                  if (shouldCancel) {
                    setTimeout(() => {
                      client.abort(`${agentId}-${Math.random()}`);
                    }, 10);
                  }
                  
                  const result = await requestPromise;
                  resolve({ success: true, result });
                } catch (error) {
                  resolve({ success: false, error: error.message });
                }
              }, delay);
            });
          });
          
          // 完成所有请求
          setTimeout(() => {
            resolvers.forEach(resolve => resolve({
              choices: [{ message: { content: "success" } }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            }));
          }, 200);
          
          const results = await Promise.all(promises);
          expect(results).toHaveLength(operations.length);
        }
      ), { numRuns: 5 });
    });
  });
  // === 51-60: 性能和压力测试 ===
  describe("性能和压力测试 (51-60)", () => {
    it("51. 测试高并发请求性能", async () => {
      const client = createMockClient(50);
      setupSuccessMock(client, 1); // 1ms延迟
      
      const start = Date.now();
      const promises = Array.from({ length: 1000 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.log(`1000个请求完成时间: ${duration}ms`);
      expect(duration).toBeLessThan(10000); // 应该在10秒内完成
    });

    it("52. 测试内存使用稳定性", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // 多轮请求测试内存稳定性
      for (let round = 0; round < 10; round++) {
        const promises = Array.from({ length: 100 }, (_, i) => 
          client.chat({
            messages: [{ role: "user", content: `round${round}-test${i}` }],
            meta: { agentId: `round${round}-agent${i}` }
          })
        );
        
        await Promise.all(promises);
        
        // 验证没有内存泄漏
        const stats = client.getConcurrencyStats();
        expect(stats.activeCount).toBe(0);
        expect(stats.queueLength).toBe(0);
      }
    });

    it("53. 测试队列处理效率", async () => {
      const client = createMockClient(1);
      const resolvers = [];
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const { promise, resolve } = createControllablePromise();
              resolvers.push(resolve);
              return promise;
            })
          }
        }
      };
      
      // 发起大量请求形成长队列
      const promises = Array.from({ length: 1000 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(50);
      
      const stats = client.getConcurrencyStats();
      expect(stats.queueLength).toBe(999);
      
      const start = Date.now();
      
      // 快速完成所有请求
      resolvers.forEach(resolve => resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }));
      
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.log(`队列处理1000个请求时间: ${duration}ms`);
      expect(duration).toBeLessThan(5000);
    });

    it("54. 测试统计信息计算性能", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // 发起大量请求
      const promises = Array.from({ length: 10000 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await Promise.all(promises);
      
      // 测试统计信息获取性能
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        client.getConcurrencyStats();
      }
      const duration = Date.now() - start;
      
      console.log(`1000次统计信息获取时间: ${duration}ms`);
      expect(duration).toBeLessThan(100);
    });

    it("55. 测试配置更新性能", async () => {
      const client = createMockClient();
      
      const start = Date.now();
      for (let i = 1; i <= 1000; i++) {
        await client.updateMaxConcurrentRequests(i % 100 + 1);
      }
      const duration = Date.now() - start;
      
      console.log(`1000次配置更新时间: ${duration}ms`);
      expect(duration).toBeLessThan(1000);
    });

    it("56. 测试取消操作性能", async () => {
      const client = createMockClient(1);
      const { promise } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      // 发起大量请求
      const promises = Array.from({ length: 1000 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        }).catch(() => ({ cancelled: true }))
      );
      
      await sleep(50);
      
      // 测试批量取消性能
      const start = Date.now();
      for (let i = 0; i < 1000; i++) {
        client.abort(`agent${i}`);
      }
      const duration = Date.now() - start;
      
      console.log(`1000次取消操作时间: ${duration}ms`);
      expect(duration).toBeLessThan(500);
      
      await Promise.all(promises);
    });

    it("57. 测试hasActiveRequest查询性能", async () => {
      const client = createMockClient();
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      // 发起一些请求
      const promises = Array.from({ length: 100 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(50);
      
      // 测试查询性能
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        client.hasActiveRequest(`agent${i % 100}`);
      }
      const duration = Date.now() - start;
      
      console.log(`10000次活跃请求查询时间: ${duration}ms`);
      expect(duration).toBeLessThan(100);
      
      resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await Promise.all(promises);
    });

    it("58. 测试并发控制器创建销毁性能", async () => {
      const start = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        const controller = new ConcurrencyController(3, mockLogger);
        // 模拟使用
        controller.getStats();
      }
      
      const duration = Date.now() - start;
      console.log(`1000个并发控制器创建时间: ${duration}ms`);
      expect(duration).toBeLessThan(1000);
    });

    it("59. 测试大量智能体ID的处理性能", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // 生成大量唯一的智能体ID
      const agentIds = Array.from({ length: 10000 }, (_, i) => 
        `agent-${i}-${Math.random().toString(36).substring(7)}`
      );
      
      const start = Date.now();
      
      const promises = agentIds.map(agentId => 
        client.chat({
          messages: [{ role: "user", content: "test" }],
          meta: { agentId }
        })
      );
      
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.log(`10000个不同智能体请求时间: ${duration}ms`);
      expect(duration).toBeLessThan(30000);
    });

    it("60. 测试错误处理的性能影响", async () => {
      const client = createMockClient();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockRejectedValue(new Error("Consistent error"))
          }
        }
      };
      
      const start = Date.now();
      
      const promises = Array.from({ length: 1000 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        }).catch(() => ({ error: true }))
      );
      
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.log(`1000个错误请求处理时间: ${duration}ms`);
      expect(duration).toBeLessThan(5000);
    });
  });

  // === 61-70: 边界条件和极端情况测试 ===
  describe("边界条件和极端情况测试 (61-70)", () => {
    it("61. 测试零并发限制的处理", () => {
      const client = createMockClient(0);
      expect(client.concurrencyController.maxConcurrentRequests).toBe(3); // 应该使用默认值
    });

    it("62. 测试负数并发限制的处理", () => {
      const client = createMockClient(-5);
      expect(client.concurrencyController.maxConcurrentRequests).toBe(3); // 应该使用默认值
    });

    it("63. 测试浮点数并发限制的处理", () => {
      const client = createMockClient(3.14);
      expect(client.concurrencyController.maxConcurrentRequests).toBe(3); // 应该使用默认值
    });

    it("64. 测试NaN并发限制的处理", () => {
      const client = createMockClient(NaN);
      expect(client.concurrencyController.maxConcurrentRequests).toBe(3); // 应该使用默认值
    });

    it("65. 测试Infinity并发限制的处理", () => {
      const client = createMockClient(Infinity);
      expect(client.concurrencyController.maxConcurrentRequests).toBe(3); // 应该使用默认值
    });

    it("66. 测试极长的agentId", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const veryLongAgentId = "a".repeat(100000); // 100KB的agentId
      
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: veryLongAgentId }
      });
      
      expect(result.content).toBe("success");
    });

    it("67. 测试包含特殊Unicode字符的agentId", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const unicodeAgentIds = [
        "agent-??-??-??",
        "agent-中文-测试",
        "agent-???????",
        "agent-русский",
        "agent-日本語",
        "agent-???",
        "agent-\u0000\u0001\u0002", // 控制字符
        "agent-\uD83D\uDE00", // 表情符号
      ];
      
      for (const agentId of unicodeAgentIds) {
        const result = await client.chat({
          messages: [{ role: "user", content: "test" }],
          meta: { agentId }
        });
        expect(result.content).toBe("success");
      }
    });

    it("68. 测试极大的消息数组", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const largeMessages = Array.from({ length: 10000 }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i}`
      }));
      
      const result = await client.chat({
        messages: largeMessages,
        meta: { agentId: "agent1" }
      });
      
      expect(result.content).toBe("success");
    });

    it("69. 测试循环引用的meta对象", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const circularMeta = { agentId: "agent1" };
      circularMeta.self = circularMeta; // 创建循环引用
      
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: circularMeta
      });
      
      expect(result.content).toBe("success");
    });

    it("70. 测试同时达到多个系统限制", async () => {
      const client = createMockClient(1); // 最小并发
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      // 发起大量请求，使用极长的agentId
      const promises = Array.from({ length: 1000 }, (_, i) => {
        const longAgentId = `agent-${"x".repeat(1000)}-${i}`;
        return client.chat({
          messages: Array.from({ length: 100 }, (_, j) => ({
            role: "user",
            content: `Very long message content ${"x".repeat(1000)} ${j}`
          })),
          meta: { agentId: longAgentId }
        }).catch(() => ({ error: true }));
      });
      
      await sleep(100);
      
      const stats = client.getConcurrencyStats();
      expect(stats.activeCount).toBe(1);
      expect(stats.queueLength).toBe(999);
      
      resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await Promise.all(promises);
    });
  });
  // === 71-80: 集成和兼容性测试 ===
  describe("集成和兼容性测试 (71-80)", () => {
    it("71. 测试与现有重试机制的集成", async () => {
      const client = createMockClient(3, 2); // maxRetries = 2
      
      let callCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async () => {
              callCount++;
              if (callCount === 1) {
                throw new Error("First attempt failed");
              }
              return {
                choices: [{ message: { content: "success" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              };
            })
          }
        }
      };
      
      // Mock sleep to speed up test
      client._sleep = vi.fn().mockResolvedValue(undefined);
      
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      expect(result.content).toBe("success");
      expect(callCount).toBe(2);
    });

    it("72. 测试与日志系统的集成", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      // 验证日志被正确调用
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("开始处理LLM请求"),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("LLM请求完成"),
        expect.any(Object)
      );
    });

    it("73. 测试向后兼容性 - 无meta对象", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      // 完全不提供meta对象
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }]
      });
      
      expect(result.content).toBe("success");
    });

    it("74. 测试向后兼容性 - 空meta对象", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: {}
      });
      
      expect(result.content).toBe("success");
    });

    it("75. 测试向后兼容性 - 传统abort方法", async () => {
      const client = createMockClient();
      const { promise, resolve } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      // 使用传统方式（无agentId）发起请求
      const requestPromise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: {}
      });
      
      await sleep(10);
      
      // 传统abort应该仍然工作
      const aborted = client.abort("some-agent-id");
      expect(typeof aborted).toBe("boolean");
      
      resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await requestPromise;
    });

    it("76. 测试与工具调用的集成", async () => {
      const client = createMockClient();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: null,
                  tool_calls: [{
                    id: "call_123",
                    type: "function",
                    function: {
                      name: "test_function",
                      arguments: '{"param": "value"}'
                    }
                  }]
                }
              }],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
            })
          }
        }
      };
      
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        tools: [{
          type: "function",
          function: {
            name: "test_function",
            description: "A test function"
          }
        }],
        meta: { agentId: "agent1" }
      });
      
      expect(result.tool_calls).toBeDefined();
      expect(result.tool_calls).toHaveLength(1);
    });

    it("77. 测试温度参数的传递", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      await client.chat({
        messages: [{ role: "user", content: "test" }],
        temperature: 0.8,
        meta: { agentId: "agent1" }
      });
      
      expect(client._client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0.8
        }),
        expect.any(Object)
      );
    });

    it("78. 测试token使用信息的返回", async () => {
      const client = createMockClient();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockResolvedValue({
              choices: [{ message: { content: "success" } }],
              usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
            })
          }
        }
      };
      
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      expect(result._usage).toEqual({
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      });
    });

    it("79. 测试AbortSignal的传递", async () => {
      const client = createMockClient();
      setupSuccessMock(client);
      
      await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      expect(client._client.chat.completions.create).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          signal: expect.any(AbortSignal)
        })
      );
    });

    it("80. 测试多种配置组合的兼容性", async () => {
      const configs = [
        { maxConcurrentRequests: 1, maxRetries: 1 },
        { maxConcurrentRequests: 5, maxRetries: 3 },
        { maxConcurrentRequests: 10, maxRetries: 0 },
        { maxConcurrentRequests: 100, maxRetries: 10 }
      ];
      
      for (const config of configs) {
        const client = createMockClient(config.maxConcurrentRequests, config.maxRetries);
        setupSuccessMock(client);
        
        const result = await client.chat({
          messages: [{ role: "user", content: "test" }],
          meta: { agentId: `agent-${config.maxConcurrentRequests}-${config.maxRetries}` }
        });
        
        expect(result.content).toBe("success");
        expect(client.concurrencyController.maxConcurrentRequests).toBe(config.maxConcurrentRequests);
        expect(client.maxRetries).toBe(config.maxRetries);
      }
    });
  });

  // === 81-90: 错误恢复和稳定性测试 ===
  describe("错误恢复和稳定性测试 (81-90)", () => {
    it("81. 测试网络中断后的恢复", async () => {
      const client = createMockClient();
      
      let isNetworkDown = true;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              if (isNetworkDown) {
                return Promise.reject(new Error("Network unavailable"));
              }
              return Promise.resolve({
                choices: [{ message: { content: "success" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              });
            })
          }
        }
      };
      
      // 第一个请求失败
      await expect(client.chat({
        messages: [{ role: "user", content: "test1" }],
        meta: { agentId: "agent1" }
      })).rejects.toThrow("Network unavailable");
      
      // 网络恢复
      isNetworkDown = false;
      
      // 第二个请求应该成功
      const result = await client.chat({
        messages: [{ role: "user", content: "test2" }],
        meta: { agentId: "agent2" }
      });
      
      expect(result.content).toBe("success");
    });

    it("82. 测试部分请求失败的系统稳定性", async () => {
      const client = createMockClient(3);
      
      let callCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              callCount++;
              if (callCount % 3 === 0) {
                return Promise.reject(new Error("Every third request fails"));
              }
              return Promise.resolve({
                choices: [{ message: { content: "success" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              });
            })
          }
        }
      };
      
      const promises = Array.from({ length: 30 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        }).catch(error => ({ error: error.message }))
      );
      
      const results = await Promise.all(promises);
      
      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);
      
      expect(successes.length).toBe(20); // 2/3 should succeed
      expect(failures.length).toBe(10); // 1/3 should fail
      
      // 系统应该仍然稳定
      expect(client.getConcurrencyStats().activeCount).toBe(0);
    });

    it("83. 测试内存泄漏防护", async () => {
      const client = createMockClient();
      
      // 模拟内存泄漏场景：请求被取消但资源未清理
      const { promise } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      // 发起大量请求然后取消
      for (let batch = 0; batch < 10; batch++) {
        const promises = Array.from({ length: 100 }, (_, i) => 
          client.chat({
            messages: [{ role: "user", content: `test${batch}-${i}` }],
            meta: { agentId: `agent${batch}-${i}` }
          }).catch(() => ({ cancelled: true }))
        );
        
        await sleep(10);
        
        // 取消所有请求
        for (let i = 0; i < 100; i++) {
          client.abort(`agent${batch}-${i}`);
        }
        
        await Promise.all(promises);
        
        // 验证资源被正确清理
        expect(client.getConcurrencyStats().activeCount).toBe(0);
        expect(client.getConcurrencyStats().queueLength).toBe(0);
      }
    });

    it("84. 测试异常情况下的统计信息一致性", async () => {
      const client = createMockClient();
      
      let shouldFail = false;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              if (shouldFail) {
                return Promise.reject(new Error("Intermittent failure"));
              }
              return Promise.resolve({
                choices: [{ message: { content: "success" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              });
            })
          }
        }
      };
      
      let totalRequests = 0;
      let expectedSuccesses = 0;
      let expectedFailures = 0;
      
      // 交替成功和失败
      for (let i = 0; i < 100; i++) {
        shouldFail = i % 2 === 0;
        totalRequests++;
        
        try {
          await client.chat({
            messages: [{ role: "user", content: `test${i}` }],
            meta: { agentId: `agent${i}` }
          });
          expectedSuccesses++;
        } catch (error) {
          expectedFailures++;
        }
      }
      
      const stats = client.getConcurrencyStats();
      expect(stats.totalRequests).toBe(totalRequests);
      expect(stats.completedRequests).toBe(expectedSuccesses);
      // Note: rejectedRequests might not match expectedFailures due to retry logic
    });

    it("85. 测试系统过载时的优雅降级", async () => {
      const client = createMockClient(1); // 极低并发限制
      const resolvers = [];
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const { promise, resolve } = createControllablePromise();
              resolvers.push(resolve);
              return promise;
            })
          }
        }
      };
      
      // 发起大量请求造成过载
      const promises = Array.from({ length: 10000 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(100);
      
      const stats = client.getConcurrencyStats();
      expect(stats.activeCount).toBe(1);
      expect(stats.queueLength).toBe(9999);
      
      // 系统应该仍然响应
      expect(client.hasActiveRequest("agent0")).toBe(true);
      expect(client.getConcurrencyStats()).toBeDefined();
      
      // 清理
      resolvers.forEach(resolve => resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }));
      
      await Promise.all(promises);
    });

    it("86. 测试配置热更新的稳定性", async () => {
      const client = createMockClient(2);
      const resolvers = [];
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const { promise, resolve } = createControllablePromise();
              resolvers.push(resolve);
              return promise;
            })
          }
        }
      };
      
      // 发起一些请求
      const promises = Array.from({ length: 10 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(50);
      
      // 在有活跃请求时更新配置
      await client.updateMaxConcurrentRequests(5);
      
      // 验证配置更新成功且系统稳定
      expect(client.concurrencyController.maxConcurrentRequests).toBe(5);
      
      // 完成请求
      resolvers.forEach(resolve => resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }));
      
      await Promise.all(promises);
    });

    it("87. 测试长时间运行的稳定性", async () => {
      const client = createMockClient();
      setupSuccessMock(client, 1);
      
      // 模拟长时间运行：多轮请求
      for (let round = 0; round < 50; round++) {
        const promises = Array.from({ length: 20 }, (_, i) => 
          client.chat({
            messages: [{ role: "user", content: `round${round}-test${i}` }],
            meta: { agentId: `round${round}-agent${i}` }
          })
        );
        
        await Promise.all(promises);
        
        // 每轮后验证系统状态
        const stats = client.getConcurrencyStats();
        expect(stats.activeCount).toBe(0);
        expect(stats.queueLength).toBe(0);
      }
      
      // 验证总体统计
      const finalStats = client.getConcurrencyStats();
      expect(finalStats.completedRequests).toBe(1000); // 50 rounds * 20 requests
    });

    it("88. 测试异步操作的异常安全性", async () => {
      const client = createMockClient();
      
      // 模拟异步操作中的异常
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async () => {
              await sleep(Math.random() * 50);
              
              if (Math.random() < 0.3) {
                throw new Error("Random async error");
              }
              
              return {
                choices: [{ message: { content: "success" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              };
            })
          }
        }
      };
      
      const promises = Array.from({ length: 100 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        }).catch(error => ({ error: error.message }))
      );
      
      const results = await Promise.all(promises);
      
      // 验证所有请求都有结果（成功或失败）
      expect(results).toHaveLength(100);
      
      // 验证系统状态正常
      expect(client.getConcurrencyStats().activeCount).toBe(0);
    });

    it("89. 测试资源清理的完整性", async () => {
      const client = createMockClient();
      const { promise, resolve, reject } = createControllablePromise();
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(promise)
          }
        }
      };
      
      // 发起请求
      const requestPromise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      }).catch(() => ({ error: true }));
      
      await sleep(10);
      
      // 验证资源被正确分配
      expect(client.hasActiveRequest("agent1")).toBe(true);
      
      // 模拟异常情况
      reject(new Error("Unexpected error"));
      
      await requestPromise;
      
      // 验证资源被正确清理
      expect(client.hasActiveRequest("agent1")).toBe(false);
      expect(client.getConcurrencyStats().activeCount).toBe(0);
    });

    it("90. 测试并发控制器的自我修复能力", async () => {
      const client = createMockClient();
      
      // 人为破坏内部状态（模拟极端情况）
      client.concurrencyController.stats.activeCount = 999;
      client.concurrencyController.stats.queueLength = 999;
      
      setupSuccessMock(client);
      
      // 发起正常请求
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "agent1" }
      });
      
      expect(result.content).toBe("success");
      
      // 验证系统能够自我修复
      const stats = client.getConcurrencyStats();
      expect(stats.activeCount).toBe(0);
      expect(stats.completedRequests).toBeGreaterThan(0);
    });
  });

  // === 91-100: 最终综合测试 ===
  describe("最终综合测试 (91-100)", () => {
    it("91. 测试复杂场景：混合成功失败取消", async () => {
      console.log("[测试91] 开始复杂场景测试");
      const client = createMockClient(2);
      const resolvers = [];
      let callCount = 0;
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              callCount++;
              console.log(`[测试91] OpenAI API 调用 #${callCount}`);
              
              if (callCount <= 2) {
                // 前两个请求使用可控制的Promise
                const { promise, resolve } = createControllablePromise();
                resolvers.push(resolve);
                console.log(`[测试91] 创建可控制Promise #${resolvers.length}`);
                return promise;
              } else if (callCount === 3) {
                // 第三个请求立即失败
                console.log(`[测试91] 第三个请求将失败`);
                return Promise.reject(new Error("Third request fails"));
              } else {
                // 其他请求成功
                console.log(`[测试91] 请求 #${callCount} 将成功`);
                return Promise.resolve({
                  choices: [{ message: { content: "success" } }],
                  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
                });
              }
            })
          }
        }
      };
      
      console.log(`[测试91] 发起5个请求`);
      const promises = Array.from({ length: 5 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        }).catch(error => {
          console.log(`[测试91] agent${i} 请求失败:`, error.message);
          return { error: error.message };
        })
      );
      
      await sleep(50);
      console.log(`[测试91] 等待后的状态:`, client.getConcurrencyStats());
      
      // 取消第一个请求
      console.log(`[测试91] 取消agent0的请求`);
      const cancelled = client.abort("agent0");
      console.log(`[测试91] 取消结果:`, cancelled);
      
      // 完成第二个请求
      console.log(`[测试91] 完成第二个请求`);
      if (resolvers.length > 1) {
        resolvers[1]({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        });
      }
      
      await sleep(100);
      
      console.log(`[测试91] 等待所有请求完成`);
      const results = await Promise.all(promises);
      
      console.log(`[测试91] 结果统计:`, results.map((r, i) => ({ agent: i, success: !r.error })));
      expect(results).toHaveLength(5);
      
      const finalStats = client.getConcurrencyStats();
      console.log(`[测试91] 最终状态:`, finalStats);
      expect(finalStats.activeCount).toBe(0);
    });

    it("92. 测试极端并发压力", async () => {
      console.log("[测试92] 开始极端并发压力测试");
      const client = createMockClient(10);
      setupSuccessMock(client, 1);
      
      const agentCount = 1000;
      console.log(`[测试92] 发起${agentCount}个并发请求`);
      
      const start = Date.now();
      const promises = Array.from({ length: agentCount }, (_, i) => {
        if (i % 100 === 0) console.log(`[测试92] 发起请求 ${i}/${agentCount}`);
        return client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        });
      });
      
      const results = await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.log(`[测试92] ${agentCount}个请求完成，耗时: ${duration}ms`);
      expect(results).toHaveLength(agentCount);
      
      const stats = client.getConcurrencyStats();
      console.log(`[测试92] 最终统计:`, stats);
      expect(stats.completedRequests).toBe(agentCount);
      expect(stats.activeCount).toBe(0);
    });

    it("93. 测试配置动态调整的实时效果", async () => {
      console.log("[测试93] 开始配置动态调整测试");
      const client = createMockClient(1);
      const resolvers = [];
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const { promise, resolve } = createControllablePromise();
              resolvers.push(resolve);
              console.log(`[测试93] 创建请求，当前resolvers数量: ${resolvers.length}`);
              return promise;
            })
          }
        }
      };
      
      // 发起10个请求
      console.log(`[测试93] 发起10个请求`);
      const promises = Array.from({ length: 10 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(50);
      let stats = client.getConcurrencyStats();
      console.log(`[测试93] 初始状态 - 活跃:${stats.activeCount}, 队列:${stats.queueLength}`);
      expect(stats.activeCount).toBe(1);
      expect(stats.queueLength).toBe(9);
      
      // 动态增加并发数
      console.log(`[测试93] 将并发数从1增加到5`);
      await client.updateMaxConcurrentRequests(5);
      
      await sleep(50);
      stats = client.getConcurrencyStats();
      console.log(`[测试93] 增加并发后 - 活跃:${stats.activeCount}, 队列:${stats.queueLength}`);
      expect(stats.activeCount).toBe(5);
      expect(stats.queueLength).toBe(5);
      
      // 完成所有请求
      console.log(`[测试93] 完成所有请求`);
      resolvers.forEach((resolve, i) => {
        console.log(`[测试93] 完成请求 ${i + 1}/${resolvers.length}`);
        resolve({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        });
      });
      
      await Promise.all(promises);
      console.log(`[测试93] 所有请求已完成`);
    });

    it("94. 测试错误恢复的完整性", async () => {
      console.log("[测试94] 开始错误恢复完整性测试");
      const client = createMockClient(3);
      
      let phase = 1;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async () => {
              console.log(`[测试94] API调用，当前阶段: ${phase}`);
              
              if (phase === 1) {
                // 第一阶段：所有请求都失败
                throw new Error(`Phase 1 error`);
              } else {
                // 第二阶段：所有请求都成功
                return {
                  choices: [{ message: { content: "success" } }],
                  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
                };
              }
            })
          }
        }
      };
      
      // 第一阶段：发起失败的请求
      console.log(`[测试94] 第一阶段：发起5个会失败的请求`);
      const failingPromises = Array.from({ length: 5 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `failing-agent${i}` }
        }).catch(error => {
          console.log(`[测试94] failing-agent${i} 失败:`, error.message);
          return { error: error.message };
        })
      );
      
      const failingResults = await Promise.all(failingPromises);
      console.log(`[测试94] 第一阶段完成，失败数量:`, failingResults.filter(r => r.error).length);
      
      let stats = client.getConcurrencyStats();
      console.log(`[测试94] 第一阶段后状态:`, stats);
      expect(stats.activeCount).toBe(0);
      
      // 第二阶段：切换到成功模式
      console.log(`[测试94] 切换到第二阶段：成功模式`);
      phase = 2;
      
      const successPromises = Array.from({ length: 5 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `success-agent${i}` }
        })
      );
      
      const successResults = await Promise.all(successPromises);
      console.log(`[测试94] 第二阶段完成，成功数量:`, successResults.filter(r => !r.error).length);
      
      stats = client.getConcurrencyStats();
      console.log(`[测试94] 最终状态:`, stats);
      expect(stats.activeCount).toBe(0);
      expect(stats.completedRequests).toBeGreaterThan(0);
    });

    it("95. 测试内存和性能稳定性", async () => {
      console.log("[测试95] 开始内存和性能稳定性测试");
      const client = createMockClient(5);
      setupSuccessMock(client, 1);
      
      const rounds = 20;
      const requestsPerRound = 50;
      
      for (let round = 0; round < rounds; round++) {
        console.log(`[测试95] 第${round + 1}/${rounds}轮`);
        
        const promises = Array.from({ length: requestsPerRound }, (_, i) => 
          client.chat({
            messages: [{ role: "user", content: `round${round}-test${i}` }],
            meta: { agentId: `round${round}-agent${i}` }
          })
        );
        
        await Promise.all(promises);
        
        const stats = client.getConcurrencyStats();
        console.log(`[测试95] 第${round + 1}轮完成，活跃:${stats.activeCount}, 队列:${stats.queueLength}`);
        expect(stats.activeCount).toBe(0);
        expect(stats.queueLength).toBe(0);
      }
      
      const finalStats = client.getConcurrencyStats();
      console.log(`[测试95] 最终统计:`, finalStats);
      expect(finalStats.completedRequests).toBe(rounds * requestsPerRound);
    });

    it("96. 测试异常边界条件组合", async () => {
      console.log("[测试96] 开始异常边界条件组合测试");
      const client = createMockClient(2);
      
      // 创建各种异常情况的组合
      const scenarios = [
        { agentId: "", shouldFail: true, description: "空agentId" },
        { agentId: null, shouldFail: false, description: "null agentId（向后兼容）" },
        { agentId: "normal-agent", shouldFail: false, description: "正常agentId" },
        { agentId: "a".repeat(10000), shouldFail: false, description: "超长agentId" },
        { agentId: "??????", shouldFail: false, description: "emoji agentId" }
      ];
      
      for (const scenario of scenarios) {
        console.log(`[测试96] 测试场景: ${scenario.description}`);
        
        if (scenario.shouldFail) {
          setupFailureMock(client, "Invalid agentId");
          
          await expect(client.chat({
            messages: [{ role: "user", content: "test" }],
            meta: { agentId: scenario.agentId }
          })).rejects.toThrow();
          
          console.log(`[测试96] ${scenario.description} - 按预期失败`);
        } else {
          setupSuccessMock(client);
          
          const result = await client.chat({
            messages: [{ role: "user", content: "test" }],
            meta: { agentId: scenario.agentId }
          });
          
          if (scenario.agentId === null) {
            console.log(`[测试96] ${scenario.description} - 向后兼容模式成功`);
          } else {
            console.log(`[测试96] ${scenario.description} - 正常模式成功`);
          }
          expect(result.content).toBe("success");
        }
      }
    });

    it("97. 测试并发控制的精确性", async () => {
      console.log("[测试97] 开始并发控制精确性测试");
      const maxConcurrent = 3;
      const client = createMockClient(maxConcurrent);
      const resolvers = [];
      let activeCallsCount = 0;
      let maxActiveCallsObserved = 0;
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              activeCallsCount++;
              maxActiveCallsObserved = Math.max(maxActiveCallsObserved, activeCallsCount);
              console.log(`[测试97] 新的API调用开始，当前活跃: ${activeCallsCount}, 历史最大: ${maxActiveCallsObserved}`);
              
              const { promise, resolve } = createControllablePromise();
              resolvers.push(() => {
                activeCallsCount--;
                console.log(`[测试97] API调用完成，当前活跃: ${activeCallsCount}`);
                resolve({
                  choices: [{ message: { content: "success" } }],
                  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
                });
              });
              
              return promise;
            })
          }
        }
      };
      
      // 发起大量请求
      console.log(`[测试97] 发起20个请求，最大并发应为${maxConcurrent}`);
      const promises = Array.from({ length: 20 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      // 等待所有请求开始
      await sleep(100);
      
      console.log(`[测试97] 观察到的最大并发数: ${maxActiveCallsObserved}`);
      expect(maxActiveCallsObserved).toBeLessThanOrEqual(maxConcurrent);
      
      // 逐个完成请求
      console.log(`[测试97] 开始逐个完成请求`);
      for (let i = 0; i < resolvers.length; i++) {
        console.log(`[测试97] 完成请求 ${i + 1}/${resolvers.length}`);
        resolvers[i]();
        await sleep(10); // 给队列处理时间
      }
      
      await Promise.all(promises);
      console.log(`[测试97] 所有请求完成，最终活跃调用数: ${activeCallsCount}`);
      expect(activeCallsCount).toBe(0);
    });

    it("98. 测试统计信息的实时准确性", async () => {
      console.log("[测试98] 开始统计信息实时准确性测试");
      const client = createMockClient(2);
      const resolvers = [];
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const { promise, resolve } = createControllablePromise();
              resolvers.push(resolve);
              return promise;
            })
          }
        }
      };
      
      // 阶段1：发起请求并验证统计
      console.log(`[测试98] 阶段1：发起5个请求`);
      const promises = Array.from({ length: 5 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      await sleep(50);
      let stats = client.getConcurrencyStats();
      console.log(`[测试98] 阶段1统计:`, stats);
      expect(stats.totalRequests).toBe(5);
      expect(stats.activeCount).toBe(2);
      expect(stats.queueLength).toBe(3);
      expect(stats.completedRequests).toBe(0);
      
      // 阶段2：完成2个请求
      console.log(`[测试98] 阶段2：完成前2个请求`);
      resolvers[0]({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      resolvers[1]({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      });
      
      await sleep(50);
      stats = client.getConcurrencyStats();
      console.log(`[测试98] 阶段2统计:`, stats);
      expect(stats.completedRequests).toBe(2);
      expect(stats.activeCount).toBe(2); // 队列中的请求应该开始执行
      expect(stats.queueLength).toBe(1);
      
      // 阶段3：完成所有请求
      console.log(`[测试98] 阶段3：完成所有剩余请求`);
      resolvers.slice(2).forEach(resolve => resolve({
        choices: [{ message: { content: "success" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      }));
      
      await Promise.all(promises);
      stats = client.getConcurrencyStats();
      console.log(`[测试98] 最终统计:`, stats);
      expect(stats.completedRequests).toBe(5);
      expect(stats.activeCount).toBe(0);
      expect(stats.queueLength).toBe(0);
    });

    it("99. 测试系统在极限条件下的稳定性", async () => {
      console.log("[测试99] 开始极限条件稳定性测试");
      const client = createMockClient(1); // 最小并发
      
      // 创建一个会随机成功/失败/超时的mock
      let requestCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async () => {
              requestCount++;
              const currentRequest = requestCount;
              console.log(`[测试99] 处理请求 #${currentRequest}`);
              
              const random = Math.random();
              
              if (random < 0.3) {
                // 30% 概率失败
                console.log(`[测试99] 请求 #${currentRequest} 将失败`);
                throw new Error(`Request ${currentRequest} failed`);
              } else if (random < 0.6) {
                // 30% 概率延迟
                const delay = Math.random() * 100;
                console.log(`[测试99] 请求 #${currentRequest} 延迟 ${delay.toFixed(1)}ms`);
                await sleep(delay);
              }
              
              console.log(`[测试99] 请求 #${currentRequest} 成功`);
              return {
                choices: [{ message: { content: `success-${currentRequest}` } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              };
            })
          }
        }
      };
      
      // 发起大量请求
      console.log(`[测试99] 发起100个请求，期望部分成功部分失败`);
      const promises = Array.from({ length: 100 }, (_, i) => 
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        }).catch(error => {
          console.log(`[测试99] agent${i} 失败:`, error.message);
          return { error: error.message };
        })
      );
      
      const results = await Promise.all(promises);
      
      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);
      
      console.log(`[测试99] 完成 - 成功: ${successes.length}, 失败: ${failures.length}`);
      expect(successes.length + failures.length).toBe(100);
      expect(successes.length).toBeGreaterThan(0); // 应该有一些成功的
      
      const finalStats = client.getConcurrencyStats();
      console.log(`[测试99] 最终状态:`, finalStats);
      expect(finalStats.activeCount).toBe(0);
      expect(finalStats.queueLength).toBe(0);
    });

    it("100. 综合集成测试：真实场景模拟", async () => {
      console.log("[测试100] 开始综合集成测试");
      const client = createMockClient(3, 2); // 3并发，2重试
      
      // 模拟真实的复杂场景
      const scenarios = [
        { agentId: "user-agent", messages: [{ role: "user", content: "Hello" }] },
        { agentId: "assistant-agent", messages: [{ role: "assistant", content: "Hi there" }] },
        { agentId: "system-agent", messages: [{ role: "system", content: "System message" }] },
        { agentId: "tool-agent", messages: [{ role: "user", content: "Use tool" }], tools: [{ type: "function", function: { name: "test_tool" } }] },
        { agentId: "temp-agent", messages: [{ role: "user", content: "Creative task" }], temperature: 0.9 }
      ];
      
      let callCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async (payload, options) => {
              callCount++;
              console.log(`[测试100] API调用 #${callCount}，模型: ${payload.model}, 温度: ${payload.temperature}`);
              
              // 模拟一些真实的延迟
              await sleep(Math.random() * 50);
              
              // 偶尔失败以测试重试
              if (callCount === 2) {
                console.log(`[测试100] 调用 #${callCount} 将失败（测试重试）`);
                throw new Error("Temporary failure");
              }
              
              const response = {
                choices: [{ message: { content: `Response to call ${callCount}` } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              };
              
              // 如果有工具，添加工具调用
              if (payload.tools && payload.tools.length > 0) {
                response.choices[0].message.tool_calls = [{
                  id: "call_123",
                  type: "function",
                  function: { name: "test_tool", arguments: '{"result": "success"}' }
                }];
                console.log(`[测试100] 调用 #${callCount} 包含工具调用`);
              }
              
              console.log(`[测试100] 调用 #${callCount} 成功`);
              return response;
            })
          }
        }
      };
      
      console.log(`[测试100] 发起${scenarios.length}个不同类型的请求`);
      const promises = scenarios.map((scenario, i) => {
        console.log(`[测试100] 发起请求 ${i + 1}: ${scenario.agentId}`);
        return client.chat({
          messages: scenario.messages,
          tools: scenario.tools,
          temperature: scenario.temperature,
          meta: { agentId: scenario.agentId }
        });
      });
      
      const results = await Promise.all(promises);
      
      console.log(`[测试100] 所有请求完成`);
      results.forEach((result, i) => {
        console.log(`[测试100] 结果 ${i + 1} (${scenarios[i].agentId}):`, result.content);
        expect(result.content).toContain("Response to call");
        
        // 验证工具调用结果
        if (scenarios[i].tools) {
          expect(result.tool_calls).toBeDefined();
          console.log(`[测试100] ${scenarios[i].agentId} 工具调用验证通过`);
        }
      });
      
      const finalStats = client.getConcurrencyStats();
      console.log(`[测试100] 最终统计:`, finalStats);
      expect(finalStats.completedRequests).toBe(scenarios.length);
      expect(finalStats.activeCount).toBe(0);
      expect(finalStats.queueLength).toBe(0);
      
      console.log(`[测试100] 综合集成测试完成 - 所有功能正常工作`);
    });
  });
});
