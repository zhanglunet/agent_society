import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { ConcurrencyController } from "../../src/platform/concurrency_controller.js";
import { LlmClient } from "../../src/platform/llm_client.js";
import { createNoopModuleLogger } from "../../src/platform/logger.js";

describe("Request Cancellation and Resource Cleanup", () => {
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

  // **Feature: llm-concurrency-control, Property 6: Request Cancellation and Resource Cleanup**
  describe("Property 6: Request Cancellation and Resource Cleanup", () => {
    it("对于任何被取消的请求（无论是队列中还是活跃的），系统应正确移除它、拒绝其promise、释放资源并处理下一个队列请求", async () => {
      await fc.assert(fc.asyncProperty(
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 4, maxLength: 6 }).map(arr => [...new Set(arr)]), // 确保唯一的agentId
        async (agentIds) => {
          const controller = new ConcurrencyController(2, mockLogger); // 较小的并发限制
          const requestPromises = [];
          const resolvers = [];
          
          // 创建可控制的请求函数
          agentIds.forEach((_, index) => {
            let resolver;
            const promise = new Promise(resolve => { resolver = resolve; });
            resolvers.push(() => resolver(`result-${index}`));
            
            const requestFn = vi.fn().mockReturnValue(promise);
            const requestPromise = controller.executeRequest(agentIds[index], requestFn);
            requestPromises.push(requestPromise);
          });

          // 等待请求处理
          await new Promise(resolve => setTimeout(resolve, 10));

          // 验证初始状态：前2个请求活跃，其余在队列中
          expect(controller.getActiveCount()).toBe(2);
          expect(controller.getQueueLength()).toBe(agentIds.length - 2);

          // 取消一个活跃请求
          const activeAgentId = agentIds[0];
          const cancelledActive = await controller.cancelRequest(activeAgentId);
          expect(cancelledActive).toBe(true);

          // 验证活跃请求被取消
          expect(controller.hasActiveRequest(activeAgentId)).toBe(false);
          await expect(requestPromises[0]).rejects.toThrow("Request cancelled");

          // 等待队列处理
          await new Promise(resolve => setTimeout(resolve, 10));

          // 验证队列中的请求开始执行（资源被释放）
          const expectedActiveCount = Math.min(2, agentIds.length - 1); // -1因为取消了一个
          expect(controller.getActiveCount()).toBe(expectedActiveCount);

          // 取消一个队列中的请求（如果有的话）
          if (agentIds.length > 3) {
            const queuedAgentId = agentIds[3];
            const cancelledQueued = await controller.cancelRequest(queuedAgentId);
            expect(cancelledQueued).toBe(true);
            
            // 验证队列请求被取消
            await expect(requestPromises[3]).rejects.toThrow("Request cancelled");
            expect(controller.getQueueLength()).toBe(Math.max(0, agentIds.length - 4));
          }

          // 清理：完成剩余请求
          resolvers.forEach((resolver, index) => {
            if (index !== 0 && (agentIds.length <= 3 || index !== 3)) {
              resolver();
            }
          });

          // 等待所有未取消的请求完成
          const results = await Promise.allSettled(requestPromises);
          
          // 验证取消的请求被拒绝，其他请求成功
          expect(results[0].status).toBe("rejected");
          if (agentIds.length > 3) {
            expect(results[3].status).toBe("rejected");
          }
          
          // 验证最终状态
          expect(controller.getActiveCount()).toBe(0);
          expect(controller.getQueueLength()).toBe(0);
        }
      ), { numRuns: 20 });
    });
  });

  describe("ConcurrencyController取消功能", () => {
    it("应正确取消活跃请求", async () => {
      let resolver;
      const controllablePromise = new Promise(resolve => { resolver = resolve; });
      const requestFn = vi.fn().mockReturnValue(controllablePromise);
      
      // 发起请求
      const promise = controller.executeRequest("agent1", requestFn);
      
      // 等待请求开始处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.hasActiveRequest("agent1")).toBe(true);
      expect(controller.getActiveCount()).toBe(1);
      
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
      
      expect(controller.getActiveCount()).toBe(3);
      
      // 添加队列请求
      const queuedRequestFn = vi.fn().mockResolvedValue("queued-result");
      const queuedPromise = controller.executeRequest("agent3", queuedRequestFn);
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(controller.getQueueLength()).toBe(1);
      
      // 取消队列中的请求
      const cancelled = await controller.cancelRequest("agent3");
      
      expect(cancelled).toBe(true);
      expect(controller.getQueueLength()).toBe(0);
      
      // 验证promise被拒绝
      await expect(queuedPromise).rejects.toThrow("Request cancelled");
      expect(queuedRequestFn).not.toHaveBeenCalled();
      
      // 清理活跃请求
      activeResolvers.forEach(resolver => resolver());
      await Promise.all(activePromises);
    });

    it("取消活跃请求后应处理队列中的下一个请求", async () => {
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
      
      expect(controller.getActiveCount()).toBe(3);
      expect(controller.getQueueLength()).toBe(1);
      
      // 取消一个活跃请求
      const cancelled = await controller.cancelRequest("agent0");
      expect(cancelled).toBe(true);
      
      // 验证取消成功
      expect(controller.hasActiveRequest("agent0")).toBe(false);
      await expect(activePromises[0]).rejects.toThrow("Request cancelled");
      
      // 等待队列处理
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // 验证队列被处理（队列长度应该减少）
      expect(controller.getQueueLength()).toBe(0);
      expect(queuedRequestFn).toHaveBeenCalled();
      
      // 清理剩余请求
      activeResolvers.slice(1).forEach(resolver => resolver());
      await Promise.allSettled(activePromises.slice(1));
      await queuedPromise;
    });

    it("应正确处理不存在的请求取消", async () => {
      const cancelled = await controller.cancelRequest("non-existent-agent");
      expect(cancelled).toBe(false);
    });
  });

  describe("LlmClient取消功能", () => {
    it("应通过并发控制器取消请求", async () => {
      let resolver;
      const controllablePromise = new Promise((resolve, reject) => { 
        resolver = { resolve, reject }; 
      });
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(controllablePromise)
          }
        }
      };

      // 发起请求
      const promise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      });

      // 等待请求开始处理
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(client.hasActiveRequest("test-agent")).toBe(true);

      // 取消请求
      const aborted = client.abort("test-agent");
      expect(aborted).toBe(true);
      expect(client.hasActiveRequest("test-agent")).toBe(false);

      // 验证promise被拒绝
      await expect(promise).rejects.toThrow("Request cancelled");
    });

    it("应正确处理向后兼容的取消", async () => {
      // 测试没有agentId的情况（向后兼容）
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockReturnValue(new Promise(() => {}))
          }
        }
      };

      // 发起没有agentId的请求
      const promise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: {} // 没有agentId
      });

      // 等待请求开始处理
      await new Promise(resolve => setTimeout(resolve, 10));

      // 尝试取消不存在的agentId
      const aborted = client.abort("non-existent");
      expect(aborted).toBe(false);
    });
  });
});