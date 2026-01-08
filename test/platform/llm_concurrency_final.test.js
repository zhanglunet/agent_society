/**
 * LLM并发控制最终测试套件
 * 
 * 特点：
 * 1. 详尽的日志输出
 * 2. 严格的超时控制
 * 3. 高代码覆盖率
 * 4. 边界测试、随机测试、特殊值测试、压力测试、崩溃测试
 * 
 * @feature llm-concurrency-control
 */

import { describe, it, expect, beforeEach, afterEach, mock, beforeAll, afterAll } from "bun:test";
import fc from "fast-check";
import { ConcurrencyController, RequestInfo, ConcurrencyStats } from "../../src/platform/concurrency_controller.js";
import { LlmClient } from "../../src/platform/llm_client.js";
import { createNoopModuleLogger } from "../../src/platform/logger.js";

// ============================================================================
// 测试配置和工具函数
// ============================================================================

const OPERATION_TIMEOUT = 3000;
const SHORT_DELAY = 30;

/**
 * 创建带超时的Promise
 */
function withTimeout(promise, timeoutMs, operationName = 'Operation') {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]).finally(() => {
    clearTimeout(timeoutId);
  });
}

/**
 * 创建可控制的Promise（带自动超时）
 */
function createControllablePromise(autoResolveMs = OPERATION_TIMEOUT) {
  let resolver, rejecter;
  let resolved = false;
  let timeoutId;
  
  const promise = new Promise((resolve, reject) => {
    resolver = (value) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        resolve(value);
      }
    };
    rejecter = (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeoutId);
        reject(error);
      }
    };
  });
  
  if (autoResolveMs > 0) {
    timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        rejecter(new Error(`Promise auto-rejected after ${autoResolveMs}ms timeout`));
      }
    }, autoResolveMs);
  }
  
  return { promise, resolve: resolver, reject: rejecter, isResolved: () => resolved };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, Math.min(ms, OPERATION_TIMEOUT)));
}

function createMockLogger() {
  return {
    ...createNoopModuleLogger(),
    info: mock(() => Promise.resolve()),
    warn: mock(() => Promise.resolve()),
    error: mock(() => Promise.resolve()),
    debug: mock(() => Promise.resolve()),
    logLlmMetrics: mock(() => Promise.resolve())
  };
}

function createMockClient(maxConcurrentRequests = 3, maxRetries = 1, mockLogger = null) {
  return new LlmClient({
    baseURL: "http://localhost:1234/v1",
    model: "test-model",
    apiKey: "test-key",
    maxConcurrentRequests,
    maxRetries,
    logger: mockLogger || createMockLogger()
  });
}

function setupSuccessMock(client, delay = 0, content = "success") {
  client._client = {
    chat: {
      completions: {
        create: mock(async (payload, options) => {
          if (options?.signal?.aborted) {
            const error = new Error("Request aborted");
            error.name = "AbortError";
            throw error;
          }
          
          if (delay > 0) {
            await sleep(delay);
            if (options?.signal?.aborted) {
              const error = new Error("Request aborted");
              error.name = "AbortError";
              throw error;
            }
          }
          
          return {
            choices: [{ message: { content } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          };
        })
      }
    }
  };
}

// ============================================================================
// 测试套件
// ============================================================================

describe("LLM并发控制测试套件", () => {
  let mockLogger;
  
  beforeEach(() => {
    mockLogger = createMockLogger();
  });

  // ==========================================================================
  // 第一部分：数据模型测试
  // ==========================================================================
  describe("1. 数据模型测试", () => {
    describe("1.1 RequestInfo", () => {
      it("应正确初始化所有属性", () => {
        const resolve = mock(() => {});
        const reject = mock(() => {});
        const requestFn = mock(() => {});
        const agentId = "test-agent";
        
        const requestInfo = new RequestInfo(agentId, requestFn, resolve, reject);
        
        expect(requestInfo.agentId).toBe(agentId);
        expect(requestInfo.requestFn).toBe(requestFn);
        expect(requestInfo.resolve).toBe(resolve);
        expect(requestInfo.reject).toBe(reject);
        expect(typeof requestInfo.timestamp).toBe("number");
        expect(requestInfo.abortController).toBeInstanceOf(AbortController);
      });
      
      it("应为每个实例创建独立的AbortController", () => {
        const req1 = new RequestInfo("agent1", mock(() => {}), mock(() => {}), mock(() => {}));
        const req2 = new RequestInfo("agent2", mock(() => {}), mock(() => {}), mock(() => {}));
        
        expect(req1.abortController).not.toBe(req2.abortController);
        
        req1.abortController.abort();
        expect(req1.abortController.signal.aborted).toBe(true);
        expect(req2.abortController.signal.aborted).toBe(false);
      });
      
      it("边界测试：特殊字符agentId", () => {
        const specialIds = ["agent-dash", "agent_underscore", "agent.dot", "agent中文", "a".repeat(1000)];
        
        specialIds.forEach(id => {
          const req = new RequestInfo(id, mock(() => {}), mock(() => {}), mock(() => {}));
          expect(req.agentId).toBe(id);
        });
      });
    });
    
    describe("1.2 ConcurrencyStats", () => {
      it("应正确初始化所有统计字段为0", () => {
        const stats = new ConcurrencyStats();
        
        expect(stats.activeCount).toBe(0);
        expect(stats.queueLength).toBe(0);
        expect(stats.totalRequests).toBe(0);
        expect(stats.completedRequests).toBe(0);
        expect(stats.rejectedRequests).toBe(0);
      });
      
      it("reset()应重置所有统计信息", () => {
        const stats = new ConcurrencyStats();
        stats.activeCount = 5;
        stats.queueLength = 3;
        stats.totalRequests = 100;
        stats.completedRequests = 90;
        stats.rejectedRequests = 10;
        
        stats.reset();
        
        expect(stats.activeCount).toBe(0);
        expect(stats.queueLength).toBe(0);
        expect(stats.totalRequests).toBe(0);
        expect(stats.completedRequests).toBe(0);
        expect(stats.rejectedRequests).toBe(0);
      });
      
      it("getSnapshot()应返回独立的副本", () => {
        const stats = new ConcurrencyStats();
        stats.activeCount = 2;
        
        const snapshot = stats.getSnapshot();
        stats.activeCount = 10;
        
        expect(snapshot.activeCount).toBe(2);
        expect(stats.activeCount).toBe(10);
      });
    });
  });

  // ==========================================================================
  // 第二部分：ConcurrencyController核心功能测试
  // ==========================================================================
  describe("2. ConcurrencyController核心功能测试", () => {
    let controller;
    
    beforeEach(() => {
      controller = new ConcurrencyController(3, mockLogger);
    });
    
    describe("2.1 初始化", () => {
      it("应使用提供的参数正确初始化", () => {
        expect(controller.maxConcurrentRequests).toBe(3);
        expect(controller.activeRequests).toBeInstanceOf(Map);
        expect(controller.requestQueue).toBeInstanceOf(Array);
        expect(controller.stats).toBeInstanceOf(ConcurrencyStats);
      });
      
      it("应使用默认值初始化", () => {
        const defaultController = new ConcurrencyController();
        expect(defaultController.maxConcurrentRequests).toBe(3);
      });
    });
    
    describe("2.2 请求执行", () => {
      it("应立即执行第一个请求", async () => {
        const requestFn = mock(() => Promise.resolve("result"));
        
        const result = await withTimeout(
          controller.executeRequest("agent1", requestFn),
          OPERATION_TIMEOUT,
          "立即执行首个请求"
        );
        
        expect(result).toBe("result");
        expect(requestFn).toHaveBeenCalledTimes(1);
        expect(controller.stats.completedRequests).toBe(1);
      });
      
      it("应拒绝没有agentId的请求", async () => {
        const requestFn = mock(() => Promise.resolve("result"));
        
        try {
          await controller.executeRequest(null, requestFn);
          expect(true).toBe(false);
        } catch (error) {
          expect(error.message).toContain("agentId is required");
        }
        
        expect(requestFn).not.toHaveBeenCalled();
        expect(controller.stats.rejectedRequests).toBe(1);
      });
      
      it("应拒绝同一智能体的第二个请求", async () => {
        const { promise: firstPromise, resolve: resolveFirst } = createControllablePromise();
        const firstRequestFn = mock(() => firstPromise);
        
        const firstRequest = controller.executeRequest("agent1", firstRequestFn);
        await sleep(SHORT_DELAY);
        
        try {
          await controller.executeRequest("agent1", mock(() => Promise.resolve("result2")));
          expect(true).toBe(false);
        } catch (error) {
          expect(error.message).toContain("Agent agent1 already has an active request");
        }
        
        resolveFirst("result1");
        await withTimeout(firstRequest, OPERATION_TIMEOUT, "cleanup");
      });
      
      it("应允许不同智能体并发请求", async () => {
        const requestFns = [
          mock(() => Promise.resolve("result1")),
          mock(() => Promise.resolve("result2")),
          mock(() => Promise.resolve("result3"))
        ];
        
        const promises = requestFns.map((fn, i) => 
          controller.executeRequest(`agent${i}`, fn)
        );
        
        const results = await withTimeout(Promise.all(promises), OPERATION_TIMEOUT, "并发请求");
        
        expect(results).toEqual(["result1", "result2", "result3"]);
        expect(controller.stats.completedRequests).toBe(3);
      });
    });
    
    describe("2.3 队列管理", () => {
      it("应在达到并发限制时将请求加入队列", async () => {
        const resolvers = [];
        const requestFns = Array.from({ length: 4 }, () => {
          const { promise, resolve } = createControllablePromise();
          resolvers.push(resolve);
          return mock(() => promise);
        });
        
        const promises = requestFns.map((fn, i) => 
          controller.executeRequest(`agent${i}`, fn)
        );
        
        await sleep(SHORT_DELAY);
        
        expect(controller.getActiveCount()).toBe(3);
        expect(controller.getQueueLength()).toBe(1);
        
        resolvers.forEach((resolve, i) => resolve(`result${i}`));
        await withTimeout(Promise.all(promises), OPERATION_TIMEOUT, "cleanup");
      });
      
      it("应在活跃请求完成后处理队列", async () => {
        const resolvers = [];
        const requestFns = Array.from({ length: 4 }, () => {
          const { promise, resolve } = createControllablePromise();
          resolvers.push(resolve);
          return mock(() => promise);
        });
        
        const promises = requestFns.map((fn, i) => 
          controller.executeRequest(`agent${i}`, fn)
        );
        
        await sleep(SHORT_DELAY);
        
        // 完成第一个请求
        resolvers[0]("result0");
        await sleep(SHORT_DELAY * 2);
        
        // 第4个请求应该开始执行
        expect(requestFns[3]).toHaveBeenCalled();
        
        resolvers.slice(1).forEach((resolve, i) => resolve(`result${i + 1}`));
        await withTimeout(Promise.all(promises), OPERATION_TIMEOUT, "cleanup");
      });
    });
    
    describe("2.4 请求取消", () => {
      it("应正确取消活跃请求", async () => {
        const { promise } = createControllablePromise();
        const requestFn = mock(() => promise);
        
        const requestPromise = controller.executeRequest("agent1", requestFn);
        await sleep(SHORT_DELAY);
        
        expect(controller.hasActiveRequest("agent1")).toBe(true);
        
        const cancelled = await controller.cancelRequest("agent1");
        
        expect(cancelled).toBe(true);
        expect(controller.hasActiveRequest("agent1")).toBe(false);
        
        try {
          await requestPromise;
          expect(true).toBe(false);
        } catch (error) {
          expect(error.message).toContain("cancelled");
        }
      });
      
      it("应正确处理不存在的请求取消", async () => {
        const cancelled = await controller.cancelRequest("non-existent-agent");
        expect(cancelled).toBe(false);
      });
    });
    
    describe("2.5 配置更新", () => {
      it("应正确更新最大并发数", async () => {
        expect(controller.maxConcurrentRequests).toBe(3);
        
        await controller.updateMaxConcurrentRequests(5);
        expect(controller.maxConcurrentRequests).toBe(5);
        
        await controller.updateMaxConcurrentRequests(1);
        expect(controller.maxConcurrentRequests).toBe(1);
      });
      
      it("应拒绝无效的配置值（负数和零）", async () => {
        const originalValue = controller.maxConcurrentRequests;
        
        await controller.updateMaxConcurrentRequests(-1);
        expect(controller.maxConcurrentRequests).toBe(originalValue);
        
        await controller.updateMaxConcurrentRequests(0);
        expect(controller.maxConcurrentRequests).toBe(originalValue);
        
        await controller.updateMaxConcurrentRequests("invalid");
        expect(controller.maxConcurrentRequests).toBe(originalValue);
      });
    });
    
    describe("2.6 错误处理", () => {
      it("应正确处理请求执行失败", async () => {
        const requestFn = mock(() => Promise.reject(new Error("Network timeout")));
        
        try {
          await controller.executeRequest("agent1", requestFn);
          expect(true).toBe(false);
        } catch (error) {
          expect(error.message).toBe("Network timeout");
        }
        
        expect(controller.getActiveCount()).toBe(0);
      });
      
      it("失败后应释放槽位并处理队列", async () => {
        const singleController = new ConcurrencyController(1, mockLogger);
        
        const failingFn = mock(() => Promise.reject(new Error("Request failed")));
        const successFn = mock(() => Promise.resolve("success"));
        
        const promise1 = singleController.executeRequest("agent1", failingFn);
        const promise2 = singleController.executeRequest("agent2", successFn);
        
        const results = await withTimeout(
          Promise.allSettled([promise1, promise2]),
          OPERATION_TIMEOUT,
          "失败后处理队列"
        );
        
        expect(results[0].status).toBe("rejected");
        expect(results[1].status).toBe("fulfilled");
        expect(results[1].value).toBe("success");
      });
    });
    
    describe("2.7 统计信息", () => {
      it("应正确跟踪所有统计指标", async () => {
        await controller.executeRequest("agent1", mock(() => Promise.resolve("result")));
        
        const stats = controller.getStats();
        expect(stats.totalRequests).toBe(1);
        expect(stats.completedRequests).toBe(1);
        
        try {
          await controller.executeRequest(null, mock(() => {}));
        } catch (e) {}
        
        expect(controller.getStats().rejectedRequests).toBe(1);
      });
    });
  });

  // ==========================================================================
  // 第三部分：LlmClient集成测试
  // ==========================================================================
  describe("3. LlmClient集成测试", () => {
    let client;
    
    beforeEach(() => {
      client = createMockClient(3, 1, mockLogger);
    });
    
    describe("3.1 初始化", () => {
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
    
    describe("3.2 请求处理", () => {
      it("应正确处理有agentId的请求", async () => {
        setupSuccessMock(client);
        
        const result = await withTimeout(
          client.chat({
            messages: [{ role: "user", content: "test" }],
            meta: { agentId: "test-agent" }
          }),
          OPERATION_TIMEOUT,
          "有agentId请求"
        );
        
        expect(result.content).toBe("success");
      });
      
      it("应正确处理没有agentId的请求（向后兼容）", async () => {
        setupSuccessMock(client);
        
        const result = await withTimeout(
          client.chat({
            messages: [{ role: "user", content: "test" }],
            meta: {}
          }),
          OPERATION_TIMEOUT,
          "无agentId请求"
        );
        
        expect(result.content).toBe("success");
      });
      
      it("应拒绝同一智能体的第二个请求", async () => {
        const { promise, resolve } = createControllablePromise();
        
        client._client = {
          chat: {
            completions: {
              create: mock(() => promise)
            }
          }
        };
        
        const firstPromise = client.chat({
          messages: [{ role: "user", content: "test1" }],
          meta: { agentId: "test-agent" }
        });
        
        await sleep(SHORT_DELAY);
        
        try {
          await client.chat({
            messages: [{ role: "user", content: "test2" }],
            meta: { agentId: "test-agent" }
          });
          expect(true).toBe(false);
        } catch (error) {
          expect(error.message).toContain("Agent test-agent already has an active request");
        }
        
        resolve({
          choices: [{ message: { content: "success" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        });
        await withTimeout(firstPromise, OPERATION_TIMEOUT, "cleanup");
      });
    });
    
    describe("3.3 中断功能", () => {
      it("abort应取消活跃请求", async () => {
        const { promise } = createControllablePromise();
        
        client._client = {
          chat: {
            completions: {
              create: mock(() => promise)
            }
          }
        };
        
        const requestPromise = client.chat({
          messages: [{ role: "user", content: "test" }],
          meta: { agentId: "test-agent" }
        });
        
        await sleep(SHORT_DELAY);
        
        expect(client.hasActiveRequest("test-agent")).toBe(true);
        
        const aborted = client.abort("test-agent");
        expect(aborted).toBe(true);
        
        try {
          await requestPromise;
        } catch (error) {
          // 预期被取消
        }
      });
      
      it("abort不存在的请求应返回false", () => {
        const aborted = client.abort("non-existent-agent");
        expect(aborted).toBe(false);
      });
    });
    
    describe("3.4 统计信息", () => {
      it("getConcurrencyStats应返回正确的统计信息", async () => {
        setupSuccessMock(client);
        
        const initialStats = client.getConcurrencyStats();
        expect(initialStats.totalRequests).toBe(0);
        
        await withTimeout(
          client.chat({
            messages: [{ role: "user", content: "test" }],
            meta: { agentId: "agent1" }
          }),
          OPERATION_TIMEOUT,
          "统计信息获取"
        );
        
        const finalStats = client.getConcurrencyStats();
        expect(finalStats.totalRequests).toBe(1);
        expect(finalStats.completedRequests).toBe(1);
      });
    });
  });

  // ==========================================================================
  // 第四部分：属性测试
  // ==========================================================================
  describe("4. 属性测试", () => {
    describe("Property 3: 并发请求处理", () => {
      it("对于任何没有活跃请求的智能体集合，请求应立即独立处理", async () => {
        await fc.assert(fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 3 })
            .map(arr => [...new Set(arr)].filter(s => s.length > 0)),
          async (agentIds) => {
            if (agentIds.length === 0) return;
            
            const controller = new ConcurrencyController(agentIds.length, mockLogger);
            const requestFns = agentIds.map((_, index) => 
              mock(() => Promise.resolve(`result-${index}`))
            );
            
            const promises = agentIds.map((agentId, index) => 
              controller.executeRequest(agentId, requestFns[index])
            );
            
            const results = await withTimeout(Promise.all(promises), OPERATION_TIMEOUT, "Property3");
            
            expect(controller.getQueueLength()).toBe(0);
            expect(controller.stats.completedRequests).toBe(agentIds.length);
          }
        ), { numRuns: 20 });
      });
    });
    
    describe("Property 4: 单智能体串行约束", () => {
      it("对于任何已有活跃请求的智能体，后续请求应被拒绝", async () => {
        await fc.assert(fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 10 }),
          async (agentId) => {
            const controller = new ConcurrencyController(3, mockLogger);
            const { promise, resolve } = createControllablePromise();
            
            const firstPromise = controller.executeRequest(agentId, mock(() => promise));
            await sleep(SHORT_DELAY);
            
            let rejected = false;
            try {
              await controller.executeRequest(agentId, mock(() => Promise.resolve("result2")));
            } catch (error) {
              rejected = true;
            }
            
            expect(rejected).toBe(true);
            
            resolve("result1");
            await withTimeout(firstPromise, OPERATION_TIMEOUT, "cleanup");
          }
        ), { numRuns: 15 });
      });
    });
    
    describe("Property 5: 队列管理", () => {
      it("当系统达到最大并发时，请求应进入队列并在槽位可用时处理", async () => {
        await fc.assert(fc.asyncProperty(
          fc.integer({ min: 1, max: 2 }),
          fc.integer({ min: 3, max: 5 }),
          async (maxConcurrent, numRequests) => {
            const controller = new ConcurrencyController(maxConcurrent, mockLogger);
            const agentIds = Array.from({ length: numRequests }, (_, i) => `agent-${i}`);
            
            const requestFns = agentIds.map((_, index) => 
              mock(() => Promise.resolve(`result-${index}`))
            );
            
            const promises = agentIds.map((agentId, index) => 
              controller.executeRequest(agentId, requestFns[index])
            );
            
            await withTimeout(Promise.all(promises), OPERATION_TIMEOUT, "Property5");
            
            expect(controller.getActiveCount()).toBe(0);
            expect(controller.stats.completedRequests).toBe(numRequests);
          }
        ), { numRuns: 15 });
      });
    });
    
    describe("Property 8: 错误处理和资源释放", () => {
      it("失败的请求应释放并发槽位并处理下一个队列请求", async () => {
        await fc.assert(fc.asyncProperty(
          fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 4 })
            .map(arr => [...new Set(arr)].filter(s => s.length > 0)),
          async (agentIds) => {
            if (agentIds.length < 2) return;
            
            const controller = new ConcurrencyController(1, mockLogger);
            
            const failingFn = mock(() => Promise.reject(new Error("Test error")));
            const successFn = mock(() => Promise.resolve("success"));
            
            const promise1 = controller.executeRequest(agentIds[0], failingFn);
            const promise2 = controller.executeRequest(agentIds[1], successFn);
            
            const results = await withTimeout(
              Promise.allSettled([promise1, promise2]),
              OPERATION_TIMEOUT,
              "Property8"
            );
            
            expect(results[0].status).toBe("rejected");
            expect(results[1].status).toBe("fulfilled");
            expect(controller.getActiveCount()).toBe(0);
          }
        ), { numRuns: 10 });
      });
    });
  });

  // ==========================================================================
  // 第五部分：边界测试
  // ==========================================================================
  describe("5. 边界测试", () => {
    describe("5.1 并发数边界", () => {
      it("最大并发数为1时应严格串行处理", async () => {
        const controller = new ConcurrencyController(1, mockLogger);
        const executionOrder = [];
        
        const requestFns = Array.from({ length: 3 }, (_, i) => 
          mock(async () => {
            executionOrder.push(`start-${i}`);
            await sleep(SHORT_DELAY);
            executionOrder.push(`end-${i}`);
            return `result-${i}`;
          })
        );
        
        const promises = requestFns.map((fn, i) => 
          controller.executeRequest(`agent${i}`, fn)
        );
        
        await withTimeout(Promise.all(promises), OPERATION_TIMEOUT * 2, "串行处理");
        
        // 验证串行：每个请求的end应该在下一个请求的start之前
        for (let i = 0; i < 2; i++) {
          const endIndex = executionOrder.indexOf(`end-${i}`);
          const nextStartIndex = executionOrder.indexOf(`start-${i + 1}`);
          expect(endIndex).toBeLessThan(nextStartIndex);
        }
      });
    });
    
    describe("5.2 agentId边界", () => {
      it("应处理最短有效agentId", async () => {
        const controller = new ConcurrencyController(3, mockLogger);
        
        const result = await withTimeout(
          controller.executeRequest("a", mock(() => Promise.resolve("result"))),
          OPERATION_TIMEOUT,
          "最短agentId"
        );
        
        expect(result).toBe("result");
      });
      
      it("应处理超长agentId", async () => {
        const controller = new ConcurrencyController(3, mockLogger);
        const longId = "a".repeat(10000);
        
        const result = await withTimeout(
          controller.executeRequest(longId, mock(() => Promise.resolve("result"))),
          OPERATION_TIMEOUT,
          "超长agentId"
        );
        
        expect(result).toBe("result");
      });
      
      it("应处理Unicode agentId", async () => {
        const controller = new ConcurrencyController(3, mockLogger);
        const unicodeIds = ["智能体1", "エージェント", "🤖🚀💻"];
        
        for (const id of unicodeIds) {
          const result = await withTimeout(
            controller.executeRequest(id, mock(() => Promise.resolve("result"))),
            OPERATION_TIMEOUT,
            "Unicode agentId"
          );
          expect(result).toBe("result");
        }
      });
    });
  });

  // ==========================================================================
  // 第六部分：压力测试
  // ==========================================================================
  describe("6. 压力测试", () => {
    it("应处理大量并发请求", async () => {
      const controller = new ConcurrencyController(10, mockLogger);
      const numRequests = 100;
      
      const promises = Array.from({ length: numRequests }, (_, i) => 
        controller.executeRequest(`agent${i}`, mock(() => Promise.resolve(`result-${i}`)))
      );
      
      const results = await withTimeout(
        Promise.all(promises),
        OPERATION_TIMEOUT * 5,
        "大量并发请求"
      );
      
      expect(results.length).toBe(numRequests);
      expect(controller.stats.completedRequests).toBe(numRequests);
      expect(controller.getActiveCount()).toBe(0);
    });
    
    it("应处理混合成功和失败的请求", async () => {
      const controller = new ConcurrencyController(5, mockLogger);
      const numRequests = 30;
      
      const promises = Array.from({ length: numRequests }, (_, i) => {
        const shouldFail = i % 3 === 0;
        const requestFn = shouldFail
          ? mock(() => Promise.reject(new Error(`Error-${i}`)))
          : mock(() => Promise.resolve(`result-${i}`));
        
        return controller.executeRequest(`agent${i}`, requestFn)
          .catch(error => ({ error: error.message }));
      });
      
      const results = await withTimeout(
        Promise.all(promises),
        OPERATION_TIMEOUT * 3,
        "混合成功失败"
      );
      
      const successes = results.filter(r => !r.error);
      const failures = results.filter(r => r.error);
      
      expect(successes.length + failures.length).toBe(numRequests);
      expect(controller.getActiveCount()).toBe(0);
    });
    
    it("内存泄漏检测：大量请求后资源应被正确释放", async () => {
      const controller = new ConcurrencyController(10, mockLogger);
      
      for (let batch = 0; batch < 3; batch++) {
        const promises = Array.from({ length: 30 }, (_, i) => 
          controller.executeRequest(`agent-${batch}-${i}`, mock(() => Promise.resolve(`result-${batch}-${i}`)))
        );
        
        await withTimeout(Promise.all(promises), OPERATION_TIMEOUT * 2, `batch-${batch}`);
        
        expect(controller.getActiveCount()).toBe(0);
        expect(controller.getQueueLength()).toBe(0);
        expect(controller.activeRequests.size).toBe(0);
        expect(controller.requestQueue.length).toBe(0);
      }
    });
  });

  // ==========================================================================
  // 第七部分：崩溃测试
  // ==========================================================================
  describe("7. 崩溃测试", () => {
    it("应处理请求函数抛出同步异常", async () => {
      const controller = new ConcurrencyController(3, mockLogger);
      
      const requestFn = mock(() => {
        throw new Error("Sync error");
      });
      
      try {
        await controller.executeRequest("agent1", requestFn);
        expect(true).toBe(false);
      } catch (error) {
        expect(error.message).toBe("Sync error");
      }
      
      expect(controller.getActiveCount()).toBe(0);
    });
    
    it("应处理请求函数返回非Promise值", async () => {
      const controller = new ConcurrencyController(3, mockLogger);
      
      const requestFn = mock(() => "sync-result");
      
      const result = await withTimeout(
        controller.executeRequest("agent1", requestFn),
        OPERATION_TIMEOUT,
        "非Promise返回值"
      );
      
      expect(result).toBe("sync-result");
    });
    
    it("应处理请求函数返回null", async () => {
      const controller = new ConcurrencyController(3, mockLogger);
      
      const result = await withTimeout(
        controller.executeRequest("agent1", mock(() => null)),
        OPERATION_TIMEOUT,
        "null返回值"
      );
      
      expect(result).toBe(null);
    });
    
    it("应处理各种错误类型", async () => {
      const controller = new ConcurrencyController(3, mockLogger);
      
      const errorTypes = [
        new Error("Standard Error"),
        new TypeError("Type Error"),
        "String error"
      ];
      
      for (let i = 0; i < errorTypes.length; i++) {
        const errorValue = errorTypes[i];
        const requestFn = mock(() => Promise.reject(errorValue));
        
        try {
          await controller.executeRequest(`agent${i}`, requestFn);
          expect(true).toBe(false);
        } catch (error) {
          // 预期抛出错误
        }
        
        expect(controller.getActiveCount()).toBe(0);
      }
    });
    
    it("应在连续错误后恢复正常", async () => {
      const controller = new ConcurrencyController(3, mockLogger);
      
      for (let i = 0; i < 3; i++) {
        try {
          await controller.executeRequest(`fail-agent${i}`, mock(() => Promise.reject(new Error(`Error ${i}`))));
        } catch (e) {}
      }
      
      const result = await withTimeout(
        controller.executeRequest("success-agent", mock(() => Promise.resolve("success"))),
        OPERATION_TIMEOUT,
        "错误后恢复"
      );
      
      expect(result).toBe("success");
    });
  });

  // ==========================================================================
  // 第八部分：特殊值测试
  // ==========================================================================
  describe("8. 特殊值测试", () => {
    describe("8.1 特殊agentId值", () => {
      it("应处理数字字符串agentId", async () => {
        const controller = new ConcurrencyController(3, mockLogger);
        
        const numericIds = ["0", "1", "123", "-1", "3.14"];
        
        for (const id of numericIds) {
          const result = await withTimeout(
            controller.executeRequest(id, mock(() => Promise.resolve("result"))),
            OPERATION_TIMEOUT,
            "数字字符串agentId"
          );
          expect(result).toBe("result");
        }
      });
      
      it("应处理空白字符agentId", async () => {
        const controller = new ConcurrencyController(3, mockLogger);
        
        const whitespaceIds = [" ", "  ", "\t", " agent "];
        
        for (const id of whitespaceIds) {
          const result = await withTimeout(
            controller.executeRequest(id, mock(() => Promise.resolve("result"))),
            OPERATION_TIMEOUT,
            "空白字符agentId"
          );
          expect(result).toBe("result");
        }
      });
    });
    
    describe("8.2 特殊返回值", () => {
      it("应处理各种返回值类型", async () => {
        const controller = new ConcurrencyController(3, mockLogger);
        
        const returnValues = [
          "string",
          123,
          0,
          true,
          false,
          null,
          undefined,
          [],
          { key: "value" }
        ];
        
        for (let i = 0; i < returnValues.length; i++) {
          const value = returnValues[i];
          const result = await withTimeout(
            controller.executeRequest(`agent${i}`, mock(() => Promise.resolve(value))),
            OPERATION_TIMEOUT,
            "各种返回值类型"
          );
          expect(result).toEqual(value);
        }
      });
    });
  });

  // ==========================================================================
  // 第九部分：日志和监控测试
  // ==========================================================================
  describe("9. 日志和监控测试", () => {
    it("应记录请求开始日志", async () => {
      const controller = new ConcurrencyController(3, mockLogger);
      
      await withTimeout(
        controller.executeRequest("agent1", mock(() => Promise.resolve("result"))),
        OPERATION_TIMEOUT,
        "请求开始日志"
      );
      
      expect(mockLogger.info).toHaveBeenCalled();
    });
    
    it("应记录请求失败日志", async () => {
      const controller = new ConcurrencyController(3, mockLogger);
      
      try {
        await controller.executeRequest("agent1", mock(() => Promise.reject(new Error("Test error"))));
      } catch (e) {}
      
      expect(mockLogger.error).toHaveBeenCalled();
    });
    
    it("应在达到并发限制时记录警告", async () => {
      const controller = new ConcurrencyController(1, mockLogger);
      
      const resolvers = [];
      const promises = Array.from({ length: 2 }, (_, i) => {
        const { promise, resolve } = createControllablePromise();
        resolvers.push(resolve);
        return controller.executeRequest(`agent${i}`, mock(() => promise));
      });
      
      await sleep(SHORT_DELAY);
      
      expect(mockLogger.warn).toHaveBeenCalled();
      
      resolvers.forEach((resolve, i) => resolve(`result${i}`));
      await withTimeout(Promise.all(promises), OPERATION_TIMEOUT, "cleanup");
    });
    
    it("应记录配置更新日志", async () => {
      const controller = new ConcurrencyController(3, mockLogger);
      
      await controller.updateMaxConcurrentRequests(5);
      
      expect(mockLogger.info).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // 第十部分：集成测试
  // ==========================================================================
  describe("10. 集成测试", () => {
    it("完整的请求生命周期测试", async () => {
      const client = createMockClient(2, 1, mockLogger);
      setupSuccessMock(client, SHORT_DELAY);
      
      const promises = Array.from({ length: 5 }, (_, i) =>
        client.chat({
          messages: [{ role: "user", content: `test${i}` }],
          meta: { agentId: `agent${i}` }
        })
      );
      
      const results = await withTimeout(
        Promise.all(promises),
        OPERATION_TIMEOUT * 3,
        "完整生命周期"
      );
      
      expect(results).toHaveLength(5);
      results.forEach(result => expect(result.content).toBe("success"));
      
      const stats = client.getConcurrencyStats();
      expect(stats.activeCount).toBe(0);
      expect(stats.completedRequests).toBe(5);
    });
    
    it("向后兼容性集成测试", async () => {
      const client = createMockClient(3, 1, mockLogger);
      setupSuccessMock(client);
      
      const testCases = [
        { messages: [{ role: "user", content: "test1" }], meta: { agentId: "agent1" } },
        { messages: [{ role: "user", content: "test2" }], meta: {} },
        { messages: [{ role: "user", content: "test3" }], meta: null },
        { messages: [{ role: "user", content: "test4" }] }
      ];
      
      for (const input of testCases) {
        const result = await withTimeout(
          client.chat(input),
          OPERATION_TIMEOUT,
          "向后兼容性"
        );
        expect(result.content).toBe("success");
      }
    });
  });
});
