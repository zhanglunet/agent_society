import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { ConcurrencyController, RequestInfo, ConcurrencyStats } from "../../src/platform/concurrency_controller.js";
import { createNoopModuleLogger } from "../../src/platform/logger.js";

describe("ConcurrencyController", () => {
  let controller;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      ...createNoopModuleLogger(),
      info: vi.fn().mockResolvedValue(undefined),
      warn: vi.fn().mockResolvedValue(undefined),
      error: vi.fn().mockResolvedValue(undefined),
      debug: vi.fn().mockResolvedValue(undefined)
    };
    
    controller = new ConcurrencyController(3, mockLogger);
  });

  describe("RequestInfo", () => {
    it("应正确初始化所有属性", () => {
      const resolve = vi.fn();
      const reject = vi.fn();
      const requestFn = vi.fn();
      const agentId = "test-agent";

      const requestInfo = new RequestInfo(agentId, requestFn, resolve, reject);

      expect(requestInfo.agentId).toBe(agentId);
      expect(requestInfo.requestFn).toBe(requestFn);
      expect(requestInfo.resolve).toBe(resolve);
      expect(requestInfo.reject).toBe(reject);
      expect(requestInfo.timestamp).toBeTypeOf("number");
      expect(requestInfo.abortController).toBeInstanceOf(AbortController);
    });
  });

  describe("ConcurrencyStats", () => {
    it("应正确初始化统计信息", () => {
      const stats = new ConcurrencyStats();
      
      expect(stats.activeCount).toBe(0);
      expect(stats.queueLength).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.completedRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
    });

    it("reset() 应重置所有统计信息", () => {
      const stats = new ConcurrencyStats();
      stats.activeCount = 5;
      stats.queueLength = 3;
      stats.totalRequests = 10;
      stats.completedRequests = 7;
      stats.rejectedRequests = 2;

      stats.reset();

      expect(stats.activeCount).toBe(0);
      expect(stats.queueLength).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.completedRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
    });

    it("getSnapshot() 应返回统计信息的副本", () => {
      const stats = new ConcurrencyStats();
      stats.activeCount = 2;
      stats.queueLength = 1;
      
      const snapshot = stats.getSnapshot();
      
      expect(snapshot).toEqual({
        activeCount: 2,
        queueLength: 1,
        totalRequests: 0,
        completedRequests: 0,
        rejectedRequests: 0
      });

      // 修改原始对象不应影响快照
      stats.activeCount = 5;
      expect(snapshot.activeCount).toBe(2);
    });
  });

  describe("基本功能", () => {
    it("应正确初始化", () => {
      expect(controller.maxConcurrentRequests).toBe(3);
      expect(controller.activeRequests).toBeInstanceOf(Map);
      expect(controller.requestQueue).toBeInstanceOf(Array);
      expect(controller.stats).toBeInstanceOf(ConcurrencyStats);
    });

    it("应拒绝没有agentId的请求", async () => {
      const requestFn = vi.fn().mockResolvedValue("result");
      
      await expect(controller.executeRequest(null, requestFn)).rejects.toThrow(
        "agentId is required for concurrent requests"
      );
      
      expect(controller.stats.rejectedRequests).toBe(1);
      expect(requestFn).not.toHaveBeenCalled();
    });
  });

  // **Feature: llm-concurrency-control, Property 3: Concurrent Request Processing**
  describe("Property 3: Concurrent Request Processing", () => {
    it("对于任何没有活跃请求的智能体集合，当系统并发数低于最大限制时，它们的请求应立即独立处理", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 3 }).map(arr => [...new Set(arr)]), // 确保唯一的agentId
        async (agentIds) => {
          const controller = new ConcurrencyController(agentIds.length, mockLogger);
          const results = [];
          const requestFns = agentIds.map((agentId, index) => 
            vi.fn().mockResolvedValue(`result-${index}`)
          );

          // 同时发起所有请求
          const promises = agentIds.map((agentId, index) => 
            controller.executeRequest(agentId, requestFns[index])
          );

          // 等待所有请求完成
          const actualResults = await Promise.all(promises);

          // 验证所有请求都立即执行（没有进入队列）
          expect(controller.getQueueLength()).toBe(0);
          expect(controller.getActiveCount()).toBe(0);
          expect(controller.stats.completedRequests).toBe(agentIds.length);
          
          // 验证所有请求函数都被调用
          requestFns.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
          
          // 验证结果正确
          agentIds.forEach((_, index) => {
            expect(actualResults[index]).toBe(`result-${index}`);
          });
        }
      ), { numRuns: 100 });
    });
  });

  // **Feature: llm-concurrency-control, Property 5: Queue Management**
  describe("Property 5: Queue Management", () => {
    it("对于任何请求，当系统达到最大并发时，请求应进入队列并在槽位可用时处理", async () => {
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 2 }), // 较小的maxConcurrentRequests以简化测试
        fc.integer({ min: 3, max: 5 }), // 请求数量，确保大于maxConcurrentRequests
        async (maxConcurrent, numRequests) => {
          const controller = new ConcurrencyController(maxConcurrent, mockLogger);
          const agentIds = Array.from({ length: numRequests }, (_, i) => `agent-${i}`);
          const completedResults = [];
          let completedCount = 0;
          
          // 创建请求函数，每个都会在调用时立即完成
          const requestFns = agentIds.map((agentId, index) => 
            vi.fn().mockImplementation(async () => {
              completedCount++;
              const result = `result-${index}`;
              completedResults.push(result);
              return result;
            })
          );

          // 发起所有请求
          const promises = agentIds.map((agentId, index) => 
            controller.executeRequest(agentId, requestFns[index])
          );

          // 等待所有请求完成
          const results = await Promise.all(promises);

          // 验证所有请求都完成了
          expect(completedCount).toBe(numRequests);
          expect(results.length).toBe(numRequests);
          expect(controller.getActiveCount()).toBe(0);
          expect(controller.getQueueLength()).toBe(0);
          expect(controller.stats.completedRequests).toBe(numRequests);
          
          // 验证所有请求函数都被调用
          requestFns.forEach(fn => expect(fn).toHaveBeenCalledTimes(1));
        }
      ), { numRuns: 50 });
    });
  });

  describe("单元测试", () => {
    it("应立即处理第一个请求", async () => {
      const requestFn = vi.fn().mockResolvedValue("result");
      
      const result = await controller.executeRequest("agent1", requestFn);
      
      expect(result).toBe("result");
      expect(controller.getActiveCount()).toBe(0);
      expect(controller.getQueueLength()).toBe(0);
      expect(controller.stats.completedRequests).toBe(1);
    });

    it("应拒绝同一智能体的第二个请求", async () => {
      const firstRequestFn = vi.fn().mockReturnValue(new Promise(() => {})); // 永不解决
      const secondRequestFn = vi.fn().mockResolvedValue("result2");
      
      // 发起第一个请求（不等待完成）
      const firstPromise = controller.executeRequest("agent1", firstRequestFn);
      
      // 等待一小段时间确保第一个请求开始处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // 尝试发起第二个请求
      await expect(controller.executeRequest("agent1", secondRequestFn)).rejects.toThrow(
        "Agent agent1 already has an active request"
      );
      
      expect(controller.stats.rejectedRequests).toBe(1);
      expect(secondRequestFn).not.toHaveBeenCalled();
    });

    it("应在达到并发限制时将请求加入队列", async () => {
      const requestFns = [
        vi.fn().mockReturnValue(new Promise(() => {})), // 永不解决
        vi.fn().mockReturnValue(new Promise(() => {})), // 永不解决
        vi.fn().mockReturnValue(new Promise(() => {})), // 永不解决
        vi.fn().mockResolvedValue("result4")
      ];
      
      // 发起前3个请求（达到限制）
      const promises = [
        controller.executeRequest("agent1", requestFns[0]),
        controller.executeRequest("agent2", requestFns[1]),
        controller.executeRequest("agent3", requestFns[2])
      ];
      
      // 等待请求开始处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getActiveCount()).toBe(3);
      expect(controller.getQueueLength()).toBe(0);
      
      // 发起第4个请求（应进入队列）
      const fourthPromise = controller.executeRequest("agent4", requestFns[3]);
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getActiveCount()).toBe(3);
      expect(controller.getQueueLength()).toBe(1);
      expect(requestFns[3]).not.toHaveBeenCalled(); // 第4个请求还未执行
    });

    it("应正确取消活跃请求", async () => {
      const requestFn = vi.fn().mockReturnValue(new Promise(() => {})); // 永不解决
      
      // 发起请求
      const promise = controller.executeRequest("agent1", requestFn);
      
      // 等待请求开始处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.hasActiveRequest("agent1")).toBe(true);
      
      // 取消请求
      const cancelled = await controller.cancelRequest("agent1");
      
      expect(cancelled).toBe(true);
      expect(controller.hasActiveRequest("agent1")).toBe(false);
      expect(controller.getActiveCount()).toBe(0);
      
      // 验证promise被拒绝
      await expect(promise).rejects.toThrow("Request cancelled");
    });

    it("应正确取消队列中的请求", async () => {
      // 先填满活跃槽位
      const activeRequestFns = [
        vi.fn().mockReturnValue(new Promise(() => {})),
        vi.fn().mockReturnValue(new Promise(() => {})),
        vi.fn().mockReturnValue(new Promise(() => {}))
      ];
      
      const promises = [
        controller.executeRequest("agent1", activeRequestFns[0]),
        controller.executeRequest("agent2", activeRequestFns[1]),
        controller.executeRequest("agent3", activeRequestFns[2])
      ];
      
      // 等待活跃请求开始
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // 添加队列请求
      const queuedRequestFn = vi.fn().mockResolvedValue("queued-result");
      const queuedPromise = controller.executeRequest("agent4", queuedRequestFn);
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getQueueLength()).toBe(1);
      
      // 取消队列中的请求
      const cancelled = await controller.cancelRequest("agent4");
      
      expect(cancelled).toBe(true);
      expect(controller.getQueueLength()).toBe(0);
      
      // 验证promise被拒绝
      await expect(queuedPromise).rejects.toThrow("Request cancelled");
      expect(queuedRequestFn).not.toHaveBeenCalled();
    });

    it("应正确更新最大并发数配置", async () => {
      expect(controller.maxConcurrentRequests).toBe(3);
      
      await controller.updateMaxConcurrentRequests(5);
      expect(controller.maxConcurrentRequests).toBe(5);
      
      // 测试无效值
      await controller.updateMaxConcurrentRequests(-1);
      expect(controller.maxConcurrentRequests).toBe(5); // 应保持不变
      
      await controller.updateMaxConcurrentRequests(0);
      expect(controller.maxConcurrentRequests).toBe(5); // 应保持不变
      
      await controller.updateMaxConcurrentRequests("invalid");
      expect(controller.maxConcurrentRequests).toBe(5); // 应保持不变
    });

    it("增加最大并发数时应处理队列中的请求", async () => {
      // 填满当前容量
      const requestFns = [
        vi.fn().mockReturnValue(new Promise(() => {})),
        vi.fn().mockReturnValue(new Promise(() => {})),
        vi.fn().mockReturnValue(new Promise(() => {})),
        vi.fn().mockResolvedValue("queued-result")
      ];
      
      const promises = [
        controller.executeRequest("agent1", requestFns[0]),
        controller.executeRequest("agent2", requestFns[1]),
        controller.executeRequest("agent3", requestFns[2]),
        controller.executeRequest("agent4", requestFns[3])
      ];
      
      // 等待处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getActiveCount()).toBe(3);
      expect(controller.getQueueLength()).toBe(1);
      
      // 增加最大并发数
      await controller.updateMaxConcurrentRequests(4);
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getActiveCount()).toBe(3); // agent4的请求已完成
      expect(controller.getQueueLength()).toBe(0);
      expect(requestFns[3]).toHaveBeenCalled();
    });
  });
});