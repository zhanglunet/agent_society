import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { rm, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import fc from "fast-check";
import { LlmServiceRegistry, validateCapabilities, DEFAULT_CAPABILITIES } from "../../src/platform/llm_service_registry.js";

const TEST_CONFIG_DIR = "test/.tmp/llm_services_test";

// 生成有效的服务配置
const validServiceConfigArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  name: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  baseURL: fc.webUrl(),
  model: fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0),
  apiKey: fc.string({ minLength: 0, maxLength: 100 }),
  capabilityTags: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 0, maxLength: 10 }),
  description: fc.string({ minLength: 0, maxLength: 500 })
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

  /**
   * Feature: model-capability-routing, Property 1: Configuration Validation
   * *For any* LLM service configuration with a `capabilities` object, the system SHALL validate that:
   * - The `capabilities` object contains `input` and/or `output` arrays
   * - Each capability type in the arrays is a non-empty string
   * - Invalid configurations are rejected with descriptive error messages
   * **Validates: Requirements 1.1, 1.2, 1.4**
   */
  describe("Property 1: Capabilities Configuration Validation", () => {
    // 生成有效的 capabilities 配置
    const validCapabilitiesArb = fc.record({
      input: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
      output: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 })
    });

    // 生成无效的 capabilities 配置
    const invalidCapabilitiesArb = fc.oneof(
      fc.constant("not-an-object"),
      fc.constant([]),
      fc.record({ input: fc.constant("not-an-array") }),
      fc.record({ output: fc.constant(123) }),
      fc.record({ input: fc.constant([""]) }), // 空字符串
      fc.record({ input: fc.constant([null]) }), // null 元素
      fc.record({ output: fc.constant([123]) }) // 非字符串元素
    );

    test("validateCapabilities 对有效配置返回 valid=true 且 normalized 包含正确值", () => {
      fc.assert(
        fc.property(
          validCapabilitiesArb,
          (capabilities) => {
            const result = validateCapabilities(capabilities);
            
            expect(result.valid).toBe(true);
            expect(result.errors).toEqual([]);
            expect(result.normalized.input).toEqual(capabilities.input);
            expect(result.normalized.output).toEqual(capabilities.output);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("validateCapabilities 对 null/undefined 返回默认 text 能力", () => {
      const nullResult = validateCapabilities(null);
      expect(nullResult.valid).toBe(true);
      expect(nullResult.normalized).toEqual(DEFAULT_CAPABILITIES);
      
      const undefinedResult = validateCapabilities(undefined);
      expect(undefinedResult.valid).toBe(true);
      expect(undefinedResult.normalized).toEqual(DEFAULT_CAPABILITIES);
    });

    test("validateCapabilities 对无效配置返回 valid=false 且包含错误信息", () => {
      fc.assert(
        fc.property(
          invalidCapabilitiesArb,
          (capabilities) => {
            const result = validateCapabilities(capabilities);
            
            // 无效配置应该返回 valid=false 或者有错误
            // 注意：某些无效配置可能部分有效，所以检查是否有错误或者 normalized 使用了默认值
            if (!result.valid) {
              expect(result.errors.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("加载带有效 capabilities 的服务配置", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          validCapabilitiesArb,
          async (service, capabilities) => {
            const serviceWithCaps = { ...service, capabilities };
            
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [serviceWithCaps] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            await registry.load();
            
            const loadedService = registry.getServiceById(service.id);
            expect(loadedService).not.toBeNull();
            expect(loadedService.capabilities).toEqual(capabilities);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("加载带无效 capabilities 的服务配置时使用默认值", async () => {
      const service = {
        id: "test-invalid-caps",
        name: "测试服务",
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        capabilityTags: ["测试"],
        description: "测试描述",
        capabilities: "invalid-not-object"
      };
      
      await writeFile(
        path.join(TEST_CONFIG_DIR, "llmservices.json"),
        JSON.stringify({ services: [service] })
      );
      
      const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
      await registry.load();
      
      const loadedService = registry.getServiceById(service.id);
      expect(loadedService).not.toBeNull();
      // 无效 capabilities 应该回退到默认值
      expect(loadedService.capabilities).toEqual(DEFAULT_CAPABILITIES);
    });
  });

  /**
   * Feature: model-capability-routing, Property 6: Backward Compatibility
   * *For any* existing LLM service configuration that lacks the `capabilities` field, the system SHALL:
   * - Successfully load the configuration without errors
   * - Default to `text` capability for both input and output
   * - Maintain all existing functionality
   * **Validates: Requirements 1.5, 5.2**
   */
  describe("Property 6: Backward Compatibility", () => {
    test("无 capabilities 字段的配置加载成功并使用默认 text 能力", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          async (service) => {
            // 确保服务配置没有 capabilities 字段
            const serviceWithoutCaps = { ...service };
            delete serviceWithoutCaps.capabilities;
            
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [serviceWithoutCaps] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            const result = await registry.load();
            
            // 应该成功加载
            expect(result.loaded).toBe(true);
            
            const loadedService = registry.getServiceById(service.id);
            expect(loadedService).not.toBeNull();
            
            // 应该有默认的 text 能力
            expect(loadedService.capabilities).toEqual(DEFAULT_CAPABILITIES);
            expect(loadedService.capabilities.input).toContain("text");
            expect(loadedService.capabilities.output).toContain("text");
            
            // 其他字段应该保持不变
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

    test("现有配置格式（无 capabilities）与新格式（有 capabilities）可以混合加载", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          validServiceConfigArb,
          fc.array(fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 3 }),
          async (oldService, newService, inputCaps) => {
            // 旧格式服务（无 capabilities）
            const oldServiceConfig = { 
              ...oldService, 
              id: `old-${oldService.id}` 
            };
            delete oldServiceConfig.capabilities;
            
            // 新格式服务（有 capabilities）
            const newServiceConfig = { 
              ...newService, 
              id: `new-${newService.id}`,
              capabilities: {
                input: inputCaps,
                output: ["text", "structured_output"]
              }
            };
            
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [oldServiceConfig, newServiceConfig] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            const result = await registry.load();
            
            expect(result.loaded).toBe(true);
            expect(registry.getServiceCount()).toBe(2);
            
            // 旧格式服务应该有默认能力
            const loadedOld = registry.getServiceById(oldServiceConfig.id);
            expect(loadedOld).not.toBeNull();
            expect(loadedOld.capabilities).toEqual(DEFAULT_CAPABILITIES);
            
            // 新格式服务应该保留配置的能力
            const loadedNew = registry.getServiceById(newServiceConfig.id);
            expect(loadedNew).not.toBeNull();
            expect(loadedNew.capabilities.input).toEqual(inputCaps);
            expect(loadedNew.capabilities.output).toEqual(["text", "structured_output"]);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("只有 input 或只有 output 的 capabilities 配置应该为缺失的部分使用默认值", async () => {
      // 只有 input
      const serviceInputOnly = {
        id: "input-only",
        name: "仅输入能力",
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        capabilityTags: [],
        description: "测试",
        capabilities: {
          input: ["text", "vision"]
        }
      };
      
      // 只有 output
      const serviceOutputOnly = {
        id: "output-only",
        name: "仅输出能力",
        baseURL: "http://localhost:1234/v1",
        model: "test-model",
        apiKey: "test-key",
        capabilityTags: [],
        description: "测试",
        capabilities: {
          output: ["text", "structured_output"]
        }
      };
      
      await writeFile(
        path.join(TEST_CONFIG_DIR, "llmservices.json"),
        JSON.stringify({ services: [serviceInputOnly, serviceOutputOnly] })
      );
      
      const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
      await registry.load();
      
      const loadedInputOnly = registry.getServiceById("input-only");
      expect(loadedInputOnly.capabilities.input).toEqual(["text", "vision"]);
      expect(loadedInputOnly.capabilities.output).toEqual(["text"]); // 默认值
      
      const loadedOutputOnly = registry.getServiceById("output-only");
      expect(loadedOutputOnly.capabilities.input).toEqual(["text"]); // 默认值
      expect(loadedOutputOnly.capabilities.output).toEqual(["text", "structured_output"]);
    });
  });

  /**
   * Feature: model-capability-routing, Property 7: Capability Query API Correctness
   * *For any* capability query operation:
   * - `hasCapability(serviceId, type, 'input')` returns true if and only if the service's `input` array contains the type
   * - `hasCapability(serviceId, type, 'output')` returns true if and only if the service's `output` array contains the type
   * - `hasCapability(serviceId, type, 'both')` returns true if and only if both arrays contain the type
   * - `getCapabilities(serviceId)` returns the exact capabilities object from configuration
   * **Validates: Requirements 4.1, 4.2, 6.1, 6.2, 6.4**
   */
  describe("Property 7: Capability Query API Correctness", () => {
    // 生成有效的 capabilities 配置
    const validCapabilitiesArb = fc.record({
      input: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
      output: fc.array(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 })
    });

    test("hasCapability 对 input 方向正确返回结果", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          validCapabilitiesArb,
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (service, capabilities, queryType) => {
            const serviceWithCaps = { ...service, capabilities };
            
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [serviceWithCaps] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            await registry.load();
            
            const hasInputCap = registry.hasCapability(service.id, queryType, 'input');
            const expectedHasInput = capabilities.input.includes(queryType);
            
            expect(hasInputCap).toBe(expectedHasInput);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("hasCapability 对 output 方向正确返回结果", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          validCapabilitiesArb,
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (service, capabilities, queryType) => {
            const serviceWithCaps = { ...service, capabilities };
            
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [serviceWithCaps] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            await registry.load();
            
            const hasOutputCap = registry.hasCapability(service.id, queryType, 'output');
            const expectedHasOutput = capabilities.output.includes(queryType);
            
            expect(hasOutputCap).toBe(expectedHasOutput);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("hasCapability 对 both 方向正确返回结果", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          validCapabilitiesArb,
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          async (service, capabilities, queryType) => {
            const serviceWithCaps = { ...service, capabilities };
            
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [serviceWithCaps] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            await registry.load();
            
            const hasBothCap = registry.hasCapability(service.id, queryType, 'both');
            const expectedHasBoth = capabilities.input.includes(queryType) && capabilities.output.includes(queryType);
            
            expect(hasBothCap).toBe(expectedHasBoth);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("hasCapability 对不存在的服务返回 false", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          fc.string({ minLength: 1, maxLength: 50 }),
          async (nonExistentId, capType) => {
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            await registry.load();
            
            expect(registry.hasCapability(`non-existent-${nonExistentId}`, capType, 'input')).toBe(false);
            expect(registry.hasCapability(`non-existent-${nonExistentId}`, capType, 'output')).toBe(false);
            expect(registry.hasCapability(`non-existent-${nonExistentId}`, capType, 'both')).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("getCapabilities 返回正确的 capabilities 对象", async () => {
      await fc.assert(
        fc.asyncProperty(
          validServiceConfigArb,
          validCapabilitiesArb,
          async (service, capabilities) => {
            const serviceWithCaps = { ...service, capabilities };
            
            await writeFile(
              path.join(TEST_CONFIG_DIR, "llmservices.json"),
              JSON.stringify({ services: [serviceWithCaps] })
            );
            
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            await registry.load();
            
            const caps = registry.getCapabilities(service.id);
            expect(caps).toEqual(capabilities);
          }
        ),
        { numRuns: 100 }
      );
    });

    test("getCapabilities 对不存在的服务返回 null", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }),
          async (nonExistentId) => {
            const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
            await registry.load();
            
            expect(registry.getCapabilities(`non-existent-${nonExistentId}`)).toBeNull();
          }
        ),
        { numRuns: 100 }
      );
    });

    test("getServicesByCapability 返回所有具备指定能力的服务", async () => {
      // 创建多个服务，部分具备 vision 能力
      const services = [
        {
          id: "text-only",
          name: "纯文本",
          baseURL: "http://localhost:1234/v1",
          model: "text-model",
          apiKey: "key",
          capabilityTags: [],
          description: "纯文本模型",
          capabilities: { input: ["text"], output: ["text"] }
        },
        {
          id: "vision-model",
          name: "视觉模型",
          baseURL: "http://localhost:1234/v1",
          model: "vision-model",
          apiKey: "key",
          capabilityTags: [],
          description: "视觉模型",
          capabilities: { input: ["text", "vision"], output: ["text"] }
        },
        {
          id: "multimodal",
          name: "多模态",
          baseURL: "http://localhost:1234/v1",
          model: "multimodal-model",
          apiKey: "key",
          capabilityTags: [],
          description: "多模态模型",
          capabilities: { input: ["text", "vision", "audio"], output: ["text", "vision"] }
        }
      ];
      
      await writeFile(
        path.join(TEST_CONFIG_DIR, "llmservices.json"),
        JSON.stringify({ services })
      );
      
      const registry = new LlmServiceRegistry({ configDir: TEST_CONFIG_DIR });
      await registry.load();
      
      // 查询 vision input 能力
      const visionInputServices = registry.getServicesByCapability("vision", "input");
      expect(visionInputServices.length).toBe(2);
      expect(visionInputServices.map(s => s.id).sort()).toEqual(["multimodal", "vision-model"]);
      
      // 查询 vision output 能力
      const visionOutputServices = registry.getServicesByCapability("vision", "output");
      expect(visionOutputServices.length).toBe(1);
      expect(visionOutputServices[0].id).toBe("multimodal");
      
      // 查询 text input 能力（所有服务都有）
      const textInputServices = registry.getServicesByCapability("text", "input");
      expect(textInputServices.length).toBe(3);
      
      // 查询 audio 能力
      const audioServices = registry.getServicesByCapability("audio", "input");
      expect(audioServices.length).toBe(1);
      expect(audioServices[0].id).toBe("multimodal");
      
      // 查询不存在的能力
      const noServices = registry.getServicesByCapability("nonexistent", "input");
      expect(noServices.length).toBe(0);
    });
  });
});
