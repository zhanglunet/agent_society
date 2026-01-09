import { describe, test, expect } from "bun:test";
import fc from "fast-check";
import { ModelSelector } from "../../src/platform/model_selector.js";

// Mock LlmClient
class MockLlmClient {
  constructor(responseGenerator) {
    this.responseGenerator = responseGenerator;
    this.callCount = 0;
    this.lastMessages = null;
  }

  async chat(input) {
    this.callCount++;
    this.lastMessages = input.messages;
    const response = this.responseGenerator ? this.responseGenerator(input) : { content: '{"serviceId": null, "reason": "mock"}' };
    return response;
  }
}

// Mock ServiceRegistry
class MockServiceRegistry {
  constructor(services = []) {
    this._services = new Map(services.map(s => [s.id, s]));
  }

  hasServices() {
    return this._services.size > 0;
  }

  getServices() {
    return Array.from(this._services.values());
  }

  getServiceById(id) {
    return this._services.get(id) ?? null;
  }
}

// 生成有效的服务配置
const validServiceConfigArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0 && !s.includes('"')),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  baseURL: fc.webUrl(),
  model: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  apiKey: fc.string({ minLength: 0, maxLength: 100 }),
  capabilityTags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
  description: fc.string({ minLength: 0, maxLength: 200 })
});

describe("ModelSelector", () => {
  describe("基础功能测试", () => {
    test("空服务注册表时返回 null 且不调用 LLM", async () => {
      const mockLlm = new MockLlmClient();
      const emptyRegistry = new MockServiceRegistry([]);
      
      const selector = new ModelSelector({
        llmClient: mockLlm,
        serviceRegistry: emptyRegistry
      });
      
      const result = await selector.selectService("测试岗位提示词");
      
      expect(result.serviceId).toBeNull();
      expect(mockLlm.callCount).toBe(0);
    });

    test("有服务时调用 LLM 进行选择", async () => {
      const mockLlm = new MockLlmClient(() => ({
        content: '{"serviceId": "test-service", "reason": "匹配测试"}'
      }));
      
      const registry = new MockServiceRegistry([
        {
          id: "test-service",
          name: "测试服务",
          capabilityTags: ["测试"],
          description: "测试描述"
        }
      ]);
      
      const selector = new ModelSelector({
        llmClient: mockLlm,
        serviceRegistry: registry
      });
      
      const result = await selector.selectService("测试岗位提示词");
      
      expect(result.serviceId).toBe("test-service");
      expect(mockLlm.callCount).toBe(1);
    });

    test("LLM 返回无效服务 ID 时返回 null", async () => {
      const mockLlm = new MockLlmClient(() => ({
        content: '{"serviceId": "non-existent-service", "reason": "测试"}'
      }));
      
      const registry = new MockServiceRegistry([
        {
          id: "valid-service",
          name: "有效服务",
          capabilityTags: ["测试"],
          description: "测试描述"
        }
      ]);
      
      const selector = new ModelSelector({
        llmClient: mockLlm,
        serviceRegistry: registry
      });
      
      const result = await selector.selectService("测试岗位提示词");
      
      expect(result.serviceId).toBeNull();
    });

    test("LLM 调用异常时返回 null", async () => {
      const mockLlm = new MockLlmClient(() => {
        throw new Error("模拟 LLM 调用失败");
      });
      
      const registry = new MockServiceRegistry([
        {
          id: "test-service",
          name: "测试服务",
          capabilityTags: ["测试"],
          description: "测试描述"
        }
      ]);
      
      const selector = new ModelSelector({
        llmClient: mockLlm,
        serviceRegistry: registry
      });
      
      const result = await selector.selectService("测试岗位提示词");
      
      expect(result.serviceId).toBeNull();
      expect(result.reason).toContain("异常");
    });
  });

  /**
   * Feature: llm-service-selector, Property 5: 空配置跳过选择
   * *For any* 岗位创建操作，当服务注册表为空时，模型选择器应返回 null 且不调用 LLM 进行选择。
   * **Validates: Requirements 3.2**
   */
  describe("Property 5: 空配置跳过选择", () => {
    test("任意岗位提示词，空注册表时不调用 LLM", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 0, maxLength: 1000 }),
          async (rolePrompt) => {
            const mockLlm = new MockLlmClient();
            const emptyRegistry = new MockServiceRegistry([]);
            
            const selector = new ModelSelector({
              llmClient: mockLlm,
              serviceRegistry: emptyRegistry
            });
            
            const result = await selector.selectService(rolePrompt);
            
            // 服务注册表为空时，应返回 null 且不调用 LLM
            expect(result.serviceId).toBeNull();
            expect(selector.getLlmCallCount()).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: llm-service-selector, Property 6: 选择结果解析与验证
   * *For any* LLM 返回的选择结果，当 serviceId 在注册表中存在时应返回该 ID；
   * 当 serviceId 无效或不存在时应返回 null。
   * **Validates: Requirements 3.4, 3.5**
   */
  describe("Property 6: 选择结果解析与验证", () => {
    test("LLM 返回有效服务 ID 时正确返回", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validServiceConfigArb, { minLength: 1, maxLength: 5 }),
          fc.nat({ max: 4 }),
          async (services, selectedIndex) => {
            // 确保每个服务有唯一 ID
            const uniqueServices = services.map((s, i) => ({
              ...s,
              id: `service-${i}`
            }));
            
            const actualIndex = selectedIndex % uniqueServices.length;
            const selectedService = uniqueServices[actualIndex];
            
            const mockLlm = new MockLlmClient(() => ({
              content: JSON.stringify({
                serviceId: selectedService.id,
                reason: "测试选择"
              })
            }));
            
            const registry = new MockServiceRegistry(uniqueServices);
            
            const selector = new ModelSelector({
              llmClient: mockLlm,
              serviceRegistry: registry
            });
            
            const result = await selector.selectService("测试岗位");
            
            // 有效的服务 ID 应该被正确返回
            expect(result.serviceId).toBe(selectedService.id);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("LLM 返回无效服务 ID 时返回 null", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validServiceConfigArb, { minLength: 1, maxLength: 5 }),
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (services, invalidId) => {
            // 确保每个服务有唯一 ID，且 invalidId 不在其中
            const uniqueServices = services.map((s, i) => ({
              ...s,
              id: `valid-service-${i}`
            }));
            
            const actualInvalidId = `invalid-${invalidId}-${Date.now()}`;
            
            const mockLlm = new MockLlmClient(() => ({
              content: JSON.stringify({
                serviceId: actualInvalidId,
                reason: "测试无效选择"
              })
            }));
            
            const registry = new MockServiceRegistry(uniqueServices);
            
            const selector = new ModelSelector({
              llmClient: mockLlm,
              serviceRegistry: registry
            });
            
            const result = await selector.selectService("测试岗位");
            
            // 无效的服务 ID 应该返回 null
            expect(result.serviceId).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    test("LLM 返回 null serviceId 时正确处理", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validServiceConfigArb, { minLength: 1, maxLength: 5 }),
          async (services) => {
            const uniqueServices = services.map((s, i) => ({
              ...s,
              id: `service-${i}`
            }));
            
            const mockLlm = new MockLlmClient(() => ({
              content: JSON.stringify({
                serviceId: null,
                reason: "没有合适的服务"
              })
            }));
            
            const registry = new MockServiceRegistry(uniqueServices);
            
            const selector = new ModelSelector({
              llmClient: mockLlm,
              serviceRegistry: registry
            });
            
            const result = await selector.selectService("测试岗位");
            
            // null serviceId 应该被正确返回
            expect(result.serviceId).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
