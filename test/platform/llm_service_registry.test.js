import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import fc from "fast-check";
import { LlmServiceRegistry } from "../../src/platform/llm_service_registry.js";

const TEST_CONFIG_DIR = "test/.tmp/llm_services_test";

// 生成有效的服务配置
const validServiceConfigArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  baseURL: fc.webUrl(),
  model: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  apiKey: fc.string({ minLength: 0, maxLength: 100 }),
  capabilityTags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
  description: fc.string({ minLength: 0, maxLength: 500 }),
  maxConcurrentRequests: fc.option(fc.integer({ min: 1, max: 10 }), { nil: undefined })
});

// 生成无效的服务配置（缺少必填字段）
const invalidServiceConfigArb = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant({}),
  fc.record({ id: fc.constant("") }), // 空 id
  fc.record({ id: fc.string({ minLength: 1 }), name: fc.constant("") }), // 空 name
  fc.record({ 
    id: fc.string({ minLength: 1 }), 
    name: fc.string({ minLength: 1 }),
    baseURL: fc.constant("") // 空 baseURL
  })
);

describe("LlmServiceRegistry", () => {
  beforeEach(async () => {
    await rm(TEST_CONFIG_DIR, { recursive: true, force: true });
    await mkdir(TEST_CONFIG_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_CONFIG_DIR, { recursive: true, force: true });
  });

  describe("基础功能测试", () => {
    test("配置文件都不存在时返回空服务列表", async () => {
      const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
      const result = await registry.load();
      
      expect(result.loaded).toBe(true);
      expect(result.services).toEqual([]);
      expect(registry.hasServices()).toBe(false);
      expect(registry.getServices()).toEqual([]);
    });

    test("加载有效的配置文件", async () => {
      const config = {
        services: [
          {
            id: "test-service",
            name: "测试服务",
            baseURL: "http://localhost:1234/v1",
            model: "test-model",
            apiKey: "test-key",
            capabilityTags: ["测试"],
            description: "测试描述"
          }
        ]
      };
      
      await writeFile(
        path.join(TEST_CONFIG_DIR, "llmservices.json"),
        JSON.stringify(config)
      );
      
      const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
      const result = await registry.load();
      
      expect(result.loaded).toBe(true);
      expect(result.services.length).toBe(1);
      expect(registry.hasServices()).toBe(true);
      expect(registry.getServiceById("test-service")).not.toBeNull();
    });
  });

  /**
   * Feature: llm-service-selector, Property 1: 配置文件加载优先级
   * *For any* 配置加载场景，当 llmservices.local.json 和 llmservices.json 都存在时，
   * 系统应加载 local 文件的内容；当仅 llmservices.json 存在时，系统应加载该文件的内容。
   * **Validates: Requirements 1.1, 1.2**
   */
  describe("Property 1: 配置文件加载优先级", () => {
    test("当两个配置文件都存在时，优先加载 local 文件", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          validServiceConfigArb,
          async (localService, defaultService) => {
            // 确保两个服务有不同的 ID
            const localServiceWithId = { ...localService, id: "local-" + localService.id };
            const defaultServiceWithId = { ...defaultService, id: "default-" + defaultService.id };
            
            // 创建 local 配置文件
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.local.json"),
              JSON.stringify({ services: [localServiceWithId] })
            );
            
            // 创建 default 配置文件
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [defaultServiceWithId] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            const result = await registry.load();
            
            // 应该加载 local 文件的内容
            expect(result.loaded).toBe(true);
            expect(registry.getServiceById(localServiceWithId.id)).not.toBeNull();
            expect(registry.getServiceById(defaultServiceWithId.id)).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    test("当仅 default 配置文件存在时，加载 default 文件", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          async (service) => {
            // 只创建 default 配置文件
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [service] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            const result = await registry.load();
            
            expect(result.loaded).toBe(true);
            expect(registry.getServiceById(service.id)).not.toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * Feature: llm-service-selector, Property 2: 服务配置字段完整性
   * *For any* 有效的服务配置条目，加载后应包含 id、name、baseURL、model、apiKey、
   * capabilityTags 和 description 所有字段，且值与配置文件中一致。
   * **Validates: Requirements 1.4**
   */
  describe("Property 2: 服务配置字段完整性", () => {
    test("加载后的服务配置包含所有必填字段且值一致", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          async (service) => {
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [service] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            await registry.load();
            
            const loadedService = registry.getServiceById(service.id);
            
            expect(loadedService).not.toBeNull();
            expect(loadedService.id).toBe(service.id);
            expect(loadedService.name).toBe(service.name);
            expect(loadedService.baseURL).toBe(service.baseURL);
            expect(loadedService.model).toBe(service.model);
            expect(loadedService.apiKey).toBe(service.apiKey);
            expect(loadedService.capabilityTags).toEqual(service.capabilityTags);
            expect(loadedService.description).toBe(service.description);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: llm-service-selector, Property 3: 无效条目过滤
   * *For any* 包含有效和无效条目的配置文件，加载后的服务列表应仅包含有效条目，
   * 无效条目应被跳过。
   * **Validates: Requirements 1.5**
   */
  describe("Property 3: 无效条目过滤", () => {
    test("混合有效和无效条目时，只加载有效条目", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validServiceConfigArb, { minLength: 1, maxLength: 5 }),
          async (validServices) => {
            // 确保每个服务有唯一 ID
            const uniqueServices = validServices.map((s, i) => ({
              ...s,
              id: `valid-${i}-${s.id}`
            }));
            
            // 创建混合配置（有效 + 无效）
            const invalidEntries = [
              null,
              {},
              { id: "" },
              { id: "invalid-1", name: "" },
              { id: "invalid-2", name: "test", baseURL: "" }
            ];
            
            const mixedServices = [...uniqueServices, ...invalidEntries];
            
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: mixedServices })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            const result = await registry.load();
            
            // 只有有效条目被加载
            expect(registry.getServiceCount()).toBe(uniqueServices.length);
            
            // 验证所有有效服务都被加载
            for (const service of uniqueServices) {
              expect(registry.getServiceById(service.id)).not.toBeNull();
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Feature: llm-service-selector, Property 4: 服务 ID 查询一致性
   * *For any* 已加载的服务配置，通过 getServiceById 查询应返回与原始配置相同的服务对象；
   * 查询不存在的 ID 应返回 null。
   * **Validates: Requirements 1.6**
   */
  describe("Property 4: 服务 ID 查询一致性", () => {
    test("通过 ID 查询返回正确的服务，不存在的 ID 返回 null", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(validServiceConfigArb, { minLength: 1, maxLength: 10 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (services, nonExistentId) => {
            // 确保每个服务有唯一 ID，且 nonExistentId 不在其中
            const uniqueServices = services.map((s, i) => ({
              ...s,
              id: `service-${i}-${Date.now()}`
            }));
            
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: uniqueServices })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            await registry.load();
            
            // 验证每个服务都能通过 ID 查询到
            for (const service of uniqueServices) {
              const found = registry.getServiceById(service.id);
              expect(found).not.toBeNull();
              expect(found.id).toBe(service.id);
            }
            
            // 验证不存在的 ID 返回 null
            const notFoundId = `non-existent-${nonExistentId}-${Date.now()}`;
            expect(registry.getServiceById(notFoundId)).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
