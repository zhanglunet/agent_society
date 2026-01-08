import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { ConcurrencyController, ConcurrencyStats } from "../../src/platform/concurrency_controller.js";
import { createNoopModuleLogger } from "../../src/platform/logger.js";

describe("Statistics and Monitoring", () => {
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

  // **Feature: llm-concurrency-control, Property 9: Statistics and Monitoring**
  describe("Property 9: Statistics and Monitoring", () => {
    it("对于任何请求生命周期事件（开始、完成、队列、达到限制），系统应准确更新和记录相应的统计信息", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 5 }).map(arr => [...new Set(arr)]), // 确保唯一的agentId
        async (agentIds) => {
          const controller = new ConcurrencyController(2, mockLogger); // 较小的并发限制以测试队列
          const requestFns = [];
          const promises = [];
          
          // 创建请求函数
          agentIds.forEach((_, index) => {
            const requestFn = vi.fn().mockResolvedValue(`result-${index}`);
            requestFns.push(requestFn);
            const promise = controller.executeRequest(agentIds[index], requestFn);
            promises.push(promise);
          });

          // 等待所有请求完成
          await Promise.all(promises);

          // 验证统计信息
          const stats = controller.getStats();
          expect(stats.totalRequests).toBe(agentIds.length);
          expect(stats.completedRequests).toBe(agentIds.length);
          expect(stats.activeCount).toBe(0);
          expect(stats.queueLength).toBe(0);
          expect(stats.rejectedRequests).toBe(0);

          // 验证日志记录
          expect(mockLogger.info).toHaveBeenCalled();
          
          // 如果有队列情况，应该有警告日志
          if (agentIds.length > 2) {
            expect(mockLogger.warn).toHaveBeenCalledWith(
              "已达到最大并发限制",
              expect.objectContaining({
                maxConcurrentRequests: 2,
                activeCount: expect.any(Number),
                queueLength: expect.any(Number)
              })
            );
          }
        }
      ), { numRuns: 10 });
    });
  });

  describe("ConcurrencyStats", () => {
    it("应正确初始化所有统计字段", () => {
      const stats = new ConcurrencyStats();
      
      expect(stats.activeCount).toBe(0);
      expect(stats.queueLength).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.completedRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
    });

    it("reset()应重置所有统计信息", () => {
      const stats = new ConcurrencyStats();
      
      // 修改统计信息
      stats.activeCount = 5;
      stats.queueLength = 3;
      stats.totalRequests = 10;
      stats.completedRequests = 7;
      stats.rejectedRequests = 2;
      
      // 重置
      stats.reset();
      
      // 验证所有字段都被重置
      expect(stats.activeCount).toBe(0);
      expect(stats.queueLength).toBe(0);
      expect(stats.totalRequests).toBe(0);
      expect(stats.completedRequests).toBe(0);
      expect(stats.rejectedRequests).toBe(0);
    });

    it("getSnapshot()应返回统计信息的副本", () => {
      const stats = new ConcurrencyStats();
      stats.activeCount = 2;
      stats.queueLength = 1;
      stats.totalRequests = 5;
      
      const snapshot = stats.getSnapshot();
      
      // 验证快照内容正确
      expect(snapshot.activeCount).toBe(2);
      expect(snapshot.queueLength).toBe(1);
      expect(snapshot.totalRequests).toBe(5);
      
      // 修改原始对象不应影响快照
      stats.activeCount = 10;
      expect(snapshot.activeCount).toBe(2);
    });
  });

  describe("统计信息更新", () => {
    it("应正确跟踪总请求数", async () => {
      expect(controller.getStats().totalRequests).toBe(0);
      
      const requestFn1 = vi.fn().mockResolvedValue("result1");
      const requestFn2 = vi.fn().mockResolvedValue("result2");
      
      await controller.executeRequest("agent1", requestFn1);
      expect(controller.getStats().totalRequests).toBe(1);
      
      await controller.executeRequest("agent2", requestFn2);
      expect(controller.getStats().totalRequests).toBe(2);
    });

    it("应正确跟踪完成请求数", async () => {
      expect(controller.getStats().completedRequests).toBe(0);
      
      const requestFn = vi.fn().mockResolvedValue("result");
      await controller.executeRequest("agent1", requestFn);
      
      expect(controller.getStats().completedRequests).toBe(1);
    });

    it("应正确跟踪拒绝请求数", async () => {
      expect(controller.getStats().rejectedRequests).toBe(0);
      
      // 尝试发送没有agentId的请求
      await expect(controller.executeRequest(null, vi.fn())).rejects.toThrow();
      expect(controller.getStats().rejectedRequests).toBe(1);
      
      // 尝试发送重复的请求
      const requestFn = vi.fn().mockReturnValue(new Promise(() => {})); // 永不完成
      const promise1 = controller.executeRequest("agent1", requestFn);
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      await expect(controller.executeRequest("agent1", vi.fn())).rejects.toThrow();
      expect(controller.getStats().rejectedRequests).toBe(2);
    });

    it("应正确跟踪活跃请求数", async () => {
      expect(controller.getStats().activeCount).toBe(0);
      
      let resolver;
      const controllablePromise = new Promise(resolve => { resolver = resolve; });
      const requestFn = vi.fn().mockReturnValue(controllablePromise);
      
      const promise = controller.executeRequest("agent1", requestFn);
      
      // 等待请求开始处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getStats().activeCount).toBe(1);
      
      // 完成请求
      resolver("result");
      await promise;
      
      expect(controller.getStats().activeCount).toBe(0);
    });

    it("应正确跟踪队列长度", async () => {
      expect(controller.getStats().queueLength).toBe(0);
      
      // 填满活跃槽位
      const activeResolvers = [];
      const activePromises = [];
      
      for (let i = 0; i < 3; i++) {
        let resolver;
        const promise = new Promise(resolve => { resolver = resolve; });
        activeResolvers.push(() => resolver(`result-${i}`));
        
        const requestFn = vi.fn().mockReturnValue(promise);
        const requestPromise = controller.executeRequest(`agent${i}`, requestFn);
        activePromises.push(requestPromise);
      }
      
      // 等待活跃请求开始
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getStats().activeCount).toBe(3);
      expect(controller.getStats().queueLength).toBe(0);
      
      // 添加队列请求
      const queuedRequestFn = vi.fn().mockResolvedValue("queued-result");
      const queuedPromise = controller.executeRequest("agent3", queuedRequestFn);
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getStats().queueLength).toBe(1);
      
      // 完成一个活跃请求，队列应该被处理
      activeResolvers[0]();
      await activePromises[0];
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getStats().queueLength).toBe(0);
      
      // 清理剩余请求
      activeResolvers.slice(1).forEach(resolver => resolver());
      await Promise.all(activePromises.slice(1));
      await queuedPromise;
    });
  });

  describe("日志记录", () => {
    it("应记录请求开始日志", async () => {
      const requestFn = vi.fn().mockResolvedValue("result");
      await controller.executeRequest("agent1", requestFn);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "开始处理LLM请求",
        expect.objectContaining({
          agentId: "agent1",
          activeCount: expect.any(Number),
          queueLength: expect.any(Number)
        })
      );
    });

    it("应记录请求完成日志", async () => {
      const requestFn = vi.fn().mockResolvedValue("result");
      await controller.executeRequest("agent1", requestFn);
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "LLM请求完成",
        expect.objectContaining({
          agentId: "agent1",
          activeCount: expect.any(Number)
        })
      );
    });

    it("应记录请求失败日志", async () => {
      const error = new Error("Test error");
      const requestFn = vi.fn().mockRejectedValue(error);
      
      await expect(controller.executeRequest("agent1", requestFn)).rejects.toThrow("Test error");
      
      expect(mockLogger.error).toHaveBeenCalledWith(
        "LLM请求失败",
        expect.objectContaining({
          agentId: "agent1",
          error: "Test error",
          activeCount: expect.any(Number)
        })
      );
    });

    it("应记录队列加入日志", async () => {
      // 填满活跃槽位
      const activeResolvers = [];
      const activePromises = [];
      
      for (let i = 0; i < 3; i++) {
        let resolver;
        const promise = new Promise(resolve => { resolver = resolve; });
        activeResolvers.push(() => resolver(`result-${i}`));
        
        const requestFn = vi.fn().mockReturnValue(promise);
        const requestPromise = controller.executeRequest(`agent${i}`, requestFn);
        activePromises.push(requestPromise);
      }
      
      // 等待活跃请求开始
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // 清除之前的日志调用
      mockLogger.info.mockClear();
      
      // 添加队列请求
      const queuedRequestFn = vi.fn().mockResolvedValue("queued-result");
      const queuedPromise = controller.executeRequest("agent3", queuedRequestFn);
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "请求已加入队列",
        expect.objectContaining({
          agentId: "agent3",
          queueLength: expect.any(Number),
          activeCount: expect.any(Number)
        })
      );
      
      // 清理
      activeResolvers.forEach(resolver => resolver());
      await Promise.all(activePromises);
      await queuedPromise;
    });

    it("应在达到并发限制时记录警告", async () => {
      // 填满活跃槽位
      const activeResolvers = [];
      const activePromises = [];
      
      for (let i = 0; i < 3; i++) {
        let resolver;
        const promise = new Promise(resolve => { resolver = resolve; });
        activeResolvers.push(() => resolver(`result-${i}`));
        
        const requestFn = vi.fn().mockReturnValue(promise);
        const requestPromise = controller.executeRequest(`agent${i}`, requestFn);
        activePromises.push(requestPromise);
      }
      
      // 等待活跃请求开始
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // 添加队列请求（这应该触发警告）
      const queuedRequestFn = vi.fn().mockResolvedValue("queued-result");
      const queuedPromise = controller.executeRequest("agent3", queuedRequestFn);
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        "已达到最大并发限制",
        expect.objectContaining({
          maxConcurrentRequests: 3,
          activeCount: expect.any(Number),
          queueLength: expect.any(Number)
        })
      );
      
      // 清理
      activeResolvers.forEach(resolver => resolver());
      await Promise.all(activePromises);
      await queuedPromise;
    });

    it("应记录队列处理日志", async () => {
      // 填满活跃槽位
      const activeResolvers = [];
      const activePromises = [];
      
      for (let i = 0; i < 3; i++) {
        let resolver;
        const promise = new Promise(resolve => { resolver = resolve; });
        activeResolvers.push(() => resolver(`result-${i}`));
        
        const requestFn = vi.fn().mockReturnValue(promise);
        const requestPromise = controller.executeRequest(`agent${i}`, requestFn);
        activePromises.push(requestPromise);
      }
      
      // 添加队列请求
      const queuedRequestFn = vi.fn().mockResolvedValue("queued-result");
      const queuedPromise = controller.executeRequest("agent3", queuedRequestFn);
      
      // 等待处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // 清除之前的日志调用
      mockLogger.info.mockClear();
      
      // 完成一个活跃请求，触发队列处理
      activeResolvers[0]();
      await activePromises[0];
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockLogger.info).toHaveBeenCalledWith(
        "从队列中取出请求进行处理",
        expect.objectContaining({
          agentId: "agent3",
          queueLength: expect.any(Number)
        })
      );
      
      // 清理
      activeResolvers.slice(1).forEach(resolver => resolver());
      await Promise.all(activePromises.slice(1));
      await queuedPromise;
    });
  });

  describe("统计信息访问", () => {
    it("getStats()应返回当前统计信息快照", () => {
      const stats = controller.getStats();
      
      expect(stats).toHaveProperty("activeCount");
      expect(stats).toHaveProperty("queueLength");
      expect(stats).toHaveProperty("totalRequests");
      expect(stats).toHaveProperty("completedRequests");
      expect(stats).toHaveProperty("rejectedRequests");
      
      expect(typeof stats.activeCount).toBe("number");
      expect(typeof stats.queueLength).toBe("number");
      expect(typeof stats.totalRequests).toBe("number");
      expect(typeof stats.completedRequests).toBe("number");
      expect(typeof stats.rejectedRequests).toBe("number");
    });

    it("getActiveCount()应返回当前活跃请求数", () => {
      expect(controller.getActiveCount()).toBe(0);
      expect(typeof controller.getActiveCount()).toBe("number");
    });

    it("getQueueLength()应返回当前队列长度", () => {
      expect(controller.getQueueLength()).toBe(0);
      expect(typeof controller.getQueueLength()).toBe("number");
    });
  });
});