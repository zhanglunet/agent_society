import { describe, it, expect, beforeEach, vi } from "vitest";
import fc from "fast-check";
import { LlmClient } from "../../src/platform/llm_client.js";
import { createNoopModuleLogger } from "../../src/platform/logger.js";

describe("LLM Client Integration Tests", () => {
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

  // 辅助函数：打印详细的测试状态
  function logTestState(testName, client, step) {
    const stats = client.getConcurrencyStats();
    console.log(`[${testName}] ${step}:`, {
      activeCount: stats.activeCount,
      queueLength: stats.queueLength,
      totalRequests: stats.totalRequests,
      completedRequests: stats.completedRequests,
      rejectedRequests: stats.rejectedRequests,
      maxConcurrentRequests: client.concurrencyController.maxConcurrentRequests
    });
  }

  // 辅助函数：等待并验证状态
  async function waitAndVerifyState(client, expectedActive, expectedQueue, testName, step) {
    await new Promise(resolve => setTimeout(resolve, 100)); // 增加等待时间
    const stats = client.getConcurrencyStats();
    console.log(`[${testName}] ${step} - 期望: active=${expectedActive}, queue=${expectedQueue}, 实际: active=${stats.activeCount}, queue=${stats.queueLength}`);
    
    if (stats.activeCount !== expectedActive || stats.queueLength !== expectedQueue) {
      console.error(`[${testName}] 状态不匹配！期望 active=${expectedActive}, queue=${expectedQueue}, 实际 active=${stats.activeCount}, queue=${stats.queueLength}`);
      logTestState(testName, client, "详细状态");
    }
    
    expect(stats.activeCount).toBe(expectedActive);
    expect(stats.queueLength).toBe(expectedQueue);
  }

  describe("多智能体并发场景", () => {
    it("应支持多个智能体同时发送请求", async () => {
      const testName = "多智能体并发";
      console.log(`[${testName}] 开始测试`);
      
      const client = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        maxConcurrentRequests: 3,
        logger: mockLogger
      });

      logTestState(testName, client, "初始化后");

      // Mock OpenAI client with controllable promises
      const resolvers = [];
      let callCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const currentCall = ++callCount;
              console.log(`[${testName}] OpenAI API 调用 #${currentCall}`);
              return new Promise(resolve => {
                resolvers.push({ resolve, callId: currentCall });
                console.log(`[${testName}] Promise #${currentCall} 已创建，等待解析`);
              });
            })
          }
        }
      };

      console.log(`[${testName}] 开始发起3个并发请求`);

      // 发起3个不同智能体的请求
      const promises = [
        client.chat({
          messages: [{ role: "user", content: "test1" }],
          meta: { agentId: "agent1" }
        }).then(result => {
          console.log(`[${testName}] agent1 请求完成:`, result.content);
          return result;
        }).catch(error => {
          console.error(`[${testName}] agent1 请求失败:`, error.message);
          throw error;
        }),
        client.chat({
          messages: [{ role: "user", content: "test2" }],
          meta: { agentId: "agent2" }
        }).then(result => {
          console.log(`[${testName}] agent2 请求完成:`, result.content);
          return result;
        }).catch(error => {
          console.error(`[${testName}] agent2 请求失败:`, error.message);
          throw error;
        }),
        client.chat({
          messages: [{ role: "user", content: "test3" }],
          meta: { agentId: "agent3" }
        }).then(result => {
          console.log(`[${testName}] agent3 请求完成:`, result.content);
          return result;
        }).catch(error => {
          console.error(`[${testName}] agent3 请求失败:`, error.message);
          throw error;
        })
      ];

      console.log(`[${testName}] 3个请求已发起，等待状态稳定`);

      // 等待请求开始处理
      await waitAndVerifyState(client, 3, 0, testName, "请求发起后");

      console.log(`[${testName}] 开始解析所有Promise，resolvers数量: ${resolvers.length}`);

      // 完成所有请求
      const mockResponse = {
        choices: [{ message: { content: "response" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      resolvers.forEach(({ resolve, callId }) => {
        console.log(`[${testName}] 解析Promise #${callId}`);
        resolve(mockResponse);
      });

      console.log(`[${testName}] 等待所有请求完成`);
      const results = await Promise.all(promises);
      
      console.log(`[${testName}] 所有请求已完成，结果数量: ${results.length}`);

      // 验证所有请求都成功完成
      results.forEach((result, index) => {
        console.log(`[${testName}] 验证结果 ${index + 1}:`, result.content);
        expect(result.content).toBe("response");
      });

      // 验证统计信息
      logTestState(testName, client, "测试完成后");
      expect(client.getConcurrencyStats().activeCount).toBe(0);
      expect(client.getConcurrencyStats().completedRequests).toBe(3);
      
      console.log(`[${testName}] 测试通过`);
    });

    it("应在达到并发限制时将请求加入队列", async () => {
      const testName = "并发限制队列";
      console.log(`[${testName}] 开始测试`);
      
      const client = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        maxConcurrentRequests: 2,
        logger: mockLogger
      });

      logTestState(testName, client, "初始化后");

      const resolvers = [];
      let callCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const currentCall = ++callCount;
              console.log(`[${testName}] OpenAI API 调用 #${currentCall}`);
              return new Promise(resolve => {
                resolvers.push({ resolve, callId: currentCall });
                console.log(`[${testName}] Promise #${currentCall} 已创建`);
              });
            })
          }
        }
      };

      console.log(`[${testName}] 发起3个请求，期望前2个处理，第3个排队`);

      // 发起3个请求，第3个应该进入队列
      const promises = [
        client.chat({
          messages: [{ role: "user", content: "test1" }],
          meta: { agentId: "agent1" }
        }).then(result => {
          console.log(`[${testName}] agent1 完成`);
          return result;
        }),
        client.chat({
          messages: [{ role: "user", content: "test2" }],
          meta: { agentId: "agent2" }
        }).then(result => {
          console.log(`[${testName}] agent2 完成`);
          return result;
        }),
        client.chat({
          messages: [{ role: "user", content: "test3" }],
          meta: { agentId: "agent3" }
        }).then(result => {
          console.log(`[${testName}] agent3 完成`);
          return result;
        })
      ];

      // 验证前2个请求在处理，第3个在队列中
      await waitAndVerifyState(client, 2, 1, testName, "3个请求发起后");

      console.log(`[${testName}] 完成第一个请求，resolvers数量: ${resolvers.length}`);

      // 完成第一个请求
      const mockResponse = {
        choices: [{ message: { content: "response" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
      };

      if (resolvers.length > 0) {
        console.log(`[${testName}] 解析第一个Promise #${resolvers[0].callId}`);
        resolvers[0].resolve(mockResponse);
        await promises[0];
        console.log(`[${testName}] 第一个请求已完成`);
      } else {
        console.error(`[${testName}] 错误：没有可解析的resolver`);
      }

      // 等待队列处理
      await waitAndVerifyState(client, 2, 0, testName, "第一个请求完成后");

      console.log(`[${testName}] 完成剩余请求`);

      // 完成剩余请求
      for (let i = 1; i < resolvers.length; i++) {
        console.log(`[${testName}] 解析Promise #${resolvers[i].callId}`);
        resolvers[i].resolve(mockResponse);
      }

      const results = await Promise.all(promises);
      console.log(`[${testName}] 所有请求完成，结果数量: ${results.length}`);

      logTestState(testName, client, "测试完成后");
      expect(client.getConcurrencyStats().completedRequests).toBe(3);
      
      console.log(`[${testName}] 测试通过`);
    });

    it("应正确处理请求取消", async () => {
      const testName = "请求取消";
      console.log(`[${testName}] 开始测试`);
      
      const client = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        maxConcurrentRequests: 1,
        logger: mockLogger
      });

      logTestState(testName, client, "初始化后");

      const resolvers = [];
      let callCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              const currentCall = ++callCount;
              console.log(`[${testName}] OpenAI API 调用 #${currentCall}`);
              return new Promise(resolve => {
                resolvers.push({ resolve, callId: currentCall });
              });
            })
          }
        }
      };

      console.log(`[${testName}] 发起2个请求，第2个应进入队列`);

      // 发起2个请求，第2个进入队列
      const promise1 = client.chat({
        messages: [{ role: "user", content: "test1" }],
        meta: { agentId: "agent1" }
      }).then(result => {
        console.log(`[${testName}] agent1 完成`);
        return result;
      }).catch(error => {
        console.log(`[${testName}] agent1 被取消或失败:`, error.message);
        throw error;
      });

      const promise2 = client.chat({
        messages: [{ role: "user", content: "test2" }],
        meta: { agentId: "agent2" }
      }).then(result => {
        console.log(`[${testName}] agent2 完成`);
        return result;
      }).catch(error => {
        console.log(`[${testName}] agent2 被取消:`, error.message);
        throw error;
      });

      await waitAndVerifyState(client, 1, 1, testName, "2个请求发起后");

      console.log(`[${testName}] 取消队列中的agent2请求`);

      // 取消队列中的请求
      const cancelled = client.abort("agent2");
      console.log(`[${testName}] 取消结果: ${cancelled}`);
      expect(cancelled).toBe(true);

      // 验证队列长度减少
      await waitAndVerifyState(client, 1, 0, testName, "取消agent2后");

      console.log(`[${testName}] 验证agent2请求被拒绝`);

      // 验证被取消的请求被拒绝
      const result2 = await promise2.catch(error => ({ error: error.message }));
      console.log(`[${testName}] agent2 结果:`, result2);
      expect(result2.error).toBeDefined();
      expect(result2.error).toContain("cancelled");

      console.log(`[${testName}] 完成agent1请求`);

      // 完成第一个请求
      if (resolvers.length > 0) {
        resolvers[0].resolve({
          choices: [{ message: { content: "response" } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        });
      }

      const result1 = await promise1;
      console.log(`[${testName}] agent1 结果:`, result1.content);

      logTestState(testName, client, "测试完成后");
      expect(client.getConcurrencyStats().completedRequests).toBe(1);
      expect(client.getConcurrencyStats().rejectedRequests).toBe(1);
      
      console.log(`[${testName}] 测试通过`);
    });
  });

  describe("现有功能兼容性验证", () => {
    it("应保持向后兼容的接口", async () => {
      const testName = "向后兼容";
      console.log(`[${testName}] 开始测试`);
      
      const client = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        logger: mockLogger
      });

      logTestState(testName, client, "初始化后");

      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              console.log(`[${testName}] OpenAI API 调用（无agentId）`);
              return Promise.resolve({
                choices: [{ message: { content: "response" } }],
                usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
              });
            })
          }
        }
      };

      console.log(`[${testName}] 测试不带agentId的调用`);

      // 测试不带agentId的调用（向后兼容）
      const result = await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: {}
      });

      console.log(`[${testName}] 结果:`, result.content);
      expect(result.content).toBe("response");
      expect(client._client.chat.completions.create).toHaveBeenCalled();
      
      logTestState(testName, client, "测试完成后");
      console.log(`[${testName}] 测试通过`);
    });

    it("应正确处理现有的abort功能", async () => {
      const testName = "Abort功能";
      console.log(`[${testName}] 开始测试`);
      
      const client = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        logger: mockLogger
      });

      let resolver;
      const controllablePromise = new Promise(resolve => { 
        resolver = resolve;
        console.log(`[${testName}] 创建可控制的Promise`);
      });
      
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(() => {
              console.log(`[${testName}] OpenAI API 调用`);
              return controllablePromise;
            })
          }
        }
      };

      console.log(`[${testName}] 发起请求`);

      // 发起请求
      const promise = client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      }).catch(error => {
        console.log(`[${testName}] 请求被中断:`, error.message);
        throw error;
      });

      await new Promise(resolve => setTimeout(resolve, 50));

      console.log(`[${testName}] 验证hasActiveRequest`);
      // 验证hasActiveRequest工作正常
      const hasActive = client.hasActiveRequest("test-agent");
      console.log(`[${testName}] hasActiveRequest结果: ${hasActive}`);
      expect(hasActive).toBe(true);

      console.log(`[${testName}] 执行abort`);
      // 验证abort功能工作正常
      const aborted = client.abort("test-agent");
      console.log(`[${testName}] abort结果: ${aborted}`);
      expect(aborted).toBe(true);
      
      const hasActiveAfterAbort = client.hasActiveRequest("test-agent");
      console.log(`[${testName}] abort后hasActiveRequest: ${hasActiveAfterAbort}`);
      expect(hasActiveAfterAbort).toBe(false);

      console.log(`[${testName}] 验证promise被拒绝`);
      // 验证promise被拒绝
      await expect(promise).rejects.toThrow();
      
      logTestState(testName, client, "测试完成后");
      console.log(`[${testName}] 测试通过`);
    });

    it("应正确处理配置动态更新", async () => {
      const client = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        maxConcurrentRequests: 2,
        logger: mockLogger
      });

      expect(client.concurrencyController.maxConcurrentRequests).toBe(2);

      // 动态更新配置
      await client.updateMaxConcurrentRequests(5);
      expect(client.concurrencyController.maxConcurrentRequests).toBe(5);

      // 验证统计信息访问
      const stats = client.getConcurrencyStats();
      expect(stats).toHaveProperty("activeCount");
      expect(stats).toHaveProperty("queueLength");
      expect(stats).toHaveProperty("totalRequests");
    });

    it("应正确记录日志", async () => {
      const client = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        maxConcurrentRequests: 1,
        logger: mockLogger
      });

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

      await client.chat({
        messages: [{ role: "user", content: "test" }],
        meta: { agentId: "test-agent" }
      });

      // 验证日志记录功能
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("开始处理LLM请求"),
        expect.any(Object)
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining("LLM请求完成"),
        expect.any(Object)
      );
    });
  });

  describe("错误处理和恢复", () => {
    it("应正确处理请求失败并释放资源", async () => {
      const testName = "请求失败处理";
      console.log(`[${testName}] 开始测试`);
      
      const client = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        maxConcurrentRequests: 2, // 增加并发数以简化测试
        maxRetries: 1, // 减少重试次数以加快测试
        logger: mockLogger
      });

      // Mock sleep to speed up test
      client._sleep = vi.fn().mockResolvedValue(undefined);

      logTestState(testName, client, "初始化后");

      let callCount = 0;
      client._client = {
        chat: {
          completions: {
            create: vi.fn().mockImplementation(async (payload, options) => {
              const currentCall = ++callCount;
              console.log(`[${testName}] OpenAI API 调用 #${currentCall} - 开始处理`);
              
              // 检查是否被中断
              if (options?.signal?.aborted) {
                console.log(`[${testName}] 调用 #${currentCall} 已被中断`);
                const abortError = new Error("Request aborted");
                abortError.name = "AbortError";
                throw abortError;
              }
              
              // 立即抛出错误，不使用延迟
              console.log(`[${testName}] 调用 #${currentCall} 立即失败`);
              const error = new Error("API Error");
              throw error;
            })
          }
        }
      };

      console.log(`[${testName}] 发起2个请求，应该都能立即开始处理`);

      // 发起2个请求
      const promise1 = client.chat({
        messages: [{ role: "user", content: "test1" }],
        meta: { agentId: "agent1" }
      }).catch(error => {
        console.log(`[${testName}] agent1 请求最终失败:`, error.message);
        return { error: error.message };
      });

      const promise2 = client.chat({
        messages: [{ role: "user", content: "test2" }],
        meta: { agentId: "agent2" }
      }).catch(error => {
        console.log(`[${testName}] agent2 请求最终失败:`, error.message);
        return { error: error.message };
      });

      console.log(`[${testName}] 等待所有请求完成`);
      
      // 等待所有请求完成
      const [result1, result2] = await Promise.all([promise1, promise2]);
      
      console.log(`[${testName}] 第一个请求结果:`, result1);
      console.log(`[${testName}] 第二个请求结果:`, result2);
      
      expect(result1.error).toBeDefined();
      expect(result2.error).toBeDefined();

      console.log(`[${testName}] 等待资源清理`);
      await new Promise(resolve => setTimeout(resolve, 100));

      // 验证资源被正确释放
      logTestState(testName, client, "所有请求失败后");
      expect(client.getConcurrencyStats().activeCount).toBe(0);
      
      console.log(`[${testName}] 验证调用次数`);
      console.log(`[${testName}] OpenAI API 总调用次数: ${callCount}`);
      // 每个请求会重试1次，所以总共应该有4次调用（2个请求 × 2次尝试）
      expect(callCount).toBe(4);
      
      console.log(`[${testName}] 测试完成`);
    });

    it("应正确处理无效配置", async () => {
      const testName = "无效配置处理";
      console.log(`[${testName}] 开始测试`);
      
      // 测试无效的maxConcurrentRequests
      const client = new LlmClient({
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        maxConcurrentRequests: -1, // 无效值
        logger: mockLogger
      });

      console.log(`[${testName}] 检查配置是否被修正为默认值`);
      console.log(`[${testName}] 实际maxConcurrentRequests: ${client.concurrencyController.maxConcurrentRequests}`);

      // 应该使用默认值3
      expect(client.concurrencyController.maxConcurrentRequests).toBe(3);

      // 验证警告日志被记录
      console.log(`[${testName}] 检查是否记录了警告日志`);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("无效的maxConcurrentRequests配置"),
        expect.any(Object)
      );
      
      console.log(`[${testName}] 测试通过`);
    });
  });

  describe("属性测试 - 多智能体并发正确性", () => {
    it("对于任意数量的智能体并发请求，系统应正确管理并发限制和队列", async () => {
      const testName = "属性测试-并发正确性";
      console.log(`[${testName}] 开始属性测试`);
      
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }), // maxConcurrentRequests
        fc.array(fc.string({ minLength: 1, maxLength: 10 }), { minLength: 1, maxLength: 8 }), // agentIds
        async (maxConcurrentRequests, agentIds) => {
          console.log(`[${testName}] 测试参数: maxConcurrent=${maxConcurrentRequests}, agents=[${agentIds.join(',')}]`);
          
          const client = new LlmClient({
            baseURL: "http://localhost:1234/v1",
            model: "test-model",
            apiKey: "test-key",
            maxConcurrentRequests,
            logger: mockLogger
          });

          logTestState(testName, client, "初始化后");

          const resolvers = [];
          let callCount = 0;
          client._client = {
            chat: {
              completions: {
                create: vi.fn().mockImplementation(() => {
                  const currentCall = ++callCount;
                  console.log(`[${testName}] OpenAI API 调用 #${currentCall}`);
                  return new Promise(resolve => {
                    resolvers.push({ resolve, callId: currentCall });
                    console.log(`[${testName}] Promise #${currentCall} 已创建`);
                  });
                })
              }
            }
          };

          console.log(`[${testName}] 发起 ${agentIds.length} 个请求`);

          // 发起所有请求
          const promises = agentIds.map((agentId, index) => {
            console.log(`[${testName}] 发起请求 ${index + 1}/${agentIds.length} for agent: ${agentId}`);
            return client.chat({
              messages: [{ role: "user", content: "test" }],
              meta: { agentId }
            }).then(result => {
              console.log(`[${testName}] agent ${agentId} 完成`);
              return result;
            }).catch(error => {
              console.log(`[${testName}] agent ${agentId} 失败:`, error.message);
              throw error;
            });
          });

          console.log(`[${testName}] 所有请求已发起，等待状态稳定`);
          await new Promise(resolve => setTimeout(resolve, 100));

          const stats = client.getConcurrencyStats();
          console.log(`[${testName}] 当前状态: active=${stats.activeCount}, queue=${stats.queueLength}, total=${stats.totalRequests}`);
          
          // 验证并发限制
          console.log(`[${testName}] 验证并发限制: ${stats.activeCount} <= ${maxConcurrentRequests}`);
          expect(stats.activeCount).toBeLessThanOrEqual(maxConcurrentRequests);
          
          // 验证总请求数
          console.log(`[${testName}] 验证总请求数: ${stats.activeCount + stats.queueLength} === ${agentIds.length}`);
          expect(stats.activeCount + stats.queueLength).toBe(agentIds.length);

          console.log(`[${testName}] 开始完成所有请求，resolvers数量: ${resolvers.length}`);

          // 完成所有请求
          const mockResponse = {
            choices: [{ message: { content: "response" } }],
            usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
          };

          resolvers.forEach(({ resolve, callId }) => {
            console.log(`[${testName}] 解析Promise #${callId}`);
            resolve(mockResponse);
          });

          console.log(`[${testName}] 等待所有Promise完成`);
          const results = await Promise.all(promises);
          
          console.log(`[${testName}] 所有请求完成，结果数量: ${results.length}`);
          
          // 验证所有请求都成功完成
          expect(results).toHaveLength(agentIds.length);
          results.forEach((result, index) => {
            console.log(`[${testName}] 验证结果 ${index + 1}: ${result.content}`);
            expect(result.content).toBe("response");
          });

          // 验证最终统计
          const finalStats = client.getConcurrencyStats();
          console.log(`[${testName}] 最终状态:`, finalStats);
          expect(finalStats.activeCount).toBe(0);
          expect(finalStats.queueLength).toBe(0);
          expect(finalStats.completedRequests).toBe(agentIds.length);
          
          console.log(`[${testName}] 属性测试通过`);
        }
      ), { numRuns: 5 }); // 减少运行次数以避免超时
      
      console.log(`[${testName}] 所有属性测试完成`);
    });
  });
});