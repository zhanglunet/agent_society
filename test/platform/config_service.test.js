import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as fc from "fast-check";
import { Config } from "../../src/platform/utils/config/config.js";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const TEST_BASE_DIR = "test/.tmp/config_service_test";

/**
 * Config 类测试套�?
 * 
 * 测试覆盖�?
 * - 应用配置管理（loadApp, hasLocalApp�?
 * - LLM 配置管理（getLlm, saveLlm, validateLlm�?
 * - LLM 服务管理（getServices, addService, updateService, deleteService, validateService, hasLocalServices�?
 * - 工具方法（maskApiKey�?
 * 
 * 测试策略�?
 * - 使用独立的测试目录避免并发冲�?
 * - 使用属性测试验证通用规则
 * - 测试边界条件和错误处�?
 */
describe("Config", () => {
  let config;
  let testDir;

  beforeEach(async () => {
    // 每个测试使用唯一目录避免并发冲突
    testDir = path.join(TEST_BASE_DIR, randomUUID());
    await mkdir(testDir, { recursive: true });
    config = new Config(testDir);
  });

  afterEach(async () => {
    // 清理测试目录
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("maskApiKey()", () => {
    /**
     * Property 6: API Key Masking
     * Feature: llm-settings-page, Property 6: API Key Masking
     * Validates: Requirements 5.2, 6.5, 9.5
     */
    it("Property 6: 对于有效长度 > 4 �?API Key，应只显示最�?4 个字�?, () => {
      fc.assert(
        fc.property(
          // 生成去除空白后长�?> 4 的字符串
          fc.string({ minLength: 5, maxLength: 100 }).filter(s => s.trim().length > 4),
          (apiKey) => {
            const masked = config.maskApiKey(apiKey);
            // 应该�?**** 开�?
            expect(masked.startsWith("****")).toBe(true);
            // 应该以原�?key 的最�?4 个字符结�?
            expect(masked.endsWith(apiKey.slice(-4))).toBe(true);
            // 总长度应该是 8�? 个星�?+ 4 个字符）
            expect(masked.length).toBe(8);
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 6: 对于有效长度 <= 4 �?API Key，应完全掩码�?****", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 10 }).filter(s => s.trim().length <= 4),
          (apiKey) => {
            const masked = config.maskApiKey(apiKey);
            expect(masked).toBe("****");
          }
        ),
        { numRuns: 100 }
      );
    });

    it("对于 null �?undefined，应返回 ****", () => {
      expect(config.maskApiKey(null)).toBe("****");
      expect(config.maskApiKey(undefined)).toBe("****");
    });

    it("对于非字符串类型，应返回 ****", () => {
      expect(config.maskApiKey(12345)).toBe("****");
      expect(config.maskApiKey({})).toBe("****");
      expect(config.maskApiKey([])).toBe("****");
    });
  });

  describe("hasLocalApp()", () => {
    it("�?app.local.json 不存在时应返�?false", () => {
      expect(config.hasLocalApp()).toBe(false);
    });

    it("�?app.local.json 存在时应返回 true", async () => {
      await writeFile(
        path.join(testDir, "app.local.json"),
        JSON.stringify({ llm: {} }),
        "utf8"
      );
      expect(config.hasLocalApp()).toBe(true);
    });
  });

  describe("hasLocalServices()", () => {
    it("�?llmservices.local.json 不存在时应返�?false", () => {
      expect(config.hasLocalServices()).toBe(false);
    });

    it("�?llmservices.local.json 存在时应返回 true", async () => {
      await writeFile(
        path.join(testDir, "llmservices.local.json"),
        JSON.stringify({ services: [] }),
        "utf8"
      );
      expect(config.hasLocalServices()).toBe(true);
    });
  });

  describe("loadApp()", () => {
    it("当配置文件不存在时应抛出错误", async () => {
      await expect(config.loadApp()).rejects.toThrow("配置文件不存�?);
    });

    it("应优先加�?app.local.json", async () => {
      const defaultConfig = {
        promptsDir: "config/prompts",
        artifactsDir: "artifacts",
        runtimeDir: "runtime",
        maxSteps: 100,
        httpPort: 3000,
        llm: { baseURL: "http://default.url", model: "default-model" }
      };
      const localConfig = {
        promptsDir: "config/prompts",
        artifactsDir: "artifacts",
        runtimeDir: "runtime",
        maxSteps: 200,
        httpPort: 4000,
        llm: { baseURL: "http://local.url", model: "local-model" }
      };

      await writeFile(
        path.join(testDir, "app.json"),
        JSON.stringify(defaultConfig),
        "utf8"
      );
      await writeFile(
        path.join(testDir, "app.local.json"),
        JSON.stringify(localConfig),
        "utf8"
      );

      const result = await config.loadApp();
      expect(result.maxSteps).toBe(200);
      expect(result.httpPort).toBe(4000);
      expect(result.llm.baseURL).toBe("http://local.url");
    });

    it("�?app.local.json 不存在时应加�?app.json", async () => {
      const defaultConfig = {
        promptsDir: "config/prompts",
        artifactsDir: "artifacts",
        runtimeDir: "runtime",
        maxSteps: 100,
        llm: { baseURL: "http://default.url", model: "default-model" }
      };

      await writeFile(
        path.join(testDir, "app.json"),
        JSON.stringify(defaultConfig),
        "utf8"
      );

      const result = await config.loadApp();
      expect(result.maxSteps).toBe(100);
      expect(result.llm.baseURL).toBe("http://default.url");
    });

    it("应正确处理默认�?, async () => {
      const minimalConfig = {
        promptsDir: "config/prompts",
        artifactsDir: "artifacts",
        runtimeDir: "runtime"
      };

      await writeFile(
        path.join(testDir, "app.json"),
        JSON.stringify(minimalConfig),
        "utf8"
      );

      const result = await config.loadApp();
      expect(result.maxSteps).toBe(200); // 默认�?
      expect(result.maxToolRounds).toBe(20000); // 默认�?
      expect(result.httpPort).toBe(3000); // 默认�?
      expect(result.enableHttp).toBe(false); // 默认�?
    });
  });

  describe("validateLlm()", () => {
    /**
     * Property 2: Validation Rejects Empty Required Fields
     * Feature: llm-settings-page, Property 2: Validation Rejects Empty Required Fields
     * Validates: Requirements 1.3, 6.2, 10.2
     */
    it("Property 2: 空或空白�?baseURL 应验证失�?, () => {
      fc.assert(
        fc.property(
          fc.constantFrom("", " ", "  ", "\t", "\n", "   \t\n  "),
          (emptyBaseURL) => {
            const result = config.validateLlm({
              baseURL: emptyBaseURL,
              model: "valid-model"
            });
            expect(result.valid).toBe(false);
            expect(result.errors.baseURL).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("Property 2: 空或空白�?model 应验证失�?, () => {
      fc.assert(
        fc.property(
          fc.constantFrom("", " ", "  ", "\t", "\n", "   \t\n  "),
          (emptyModel) => {
            const result = config.validateLlm({
              baseURL: "http://valid.url",
              model: emptyModel
            });
            expect(result.valid).toBe(false);
            expect(result.errors.model).toBeDefined();
          }
        ),
        { numRuns: 100 }
      );
    });

    it("有效的配置应验证通过", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          (baseURL, model) => {
            const result = config.validateLlm({ baseURL, model });
            expect(result.valid).toBe(true);
            expect(Object.keys(result.errors).length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe("validateService()", () => {
    it("Property 2: 空或空白的必填字段应验证失败", () => {
      const emptyValues = ["", " ", "  ", "\t", "\n"];
      
      for (const emptyValue of emptyValues) {
        // 测试�?id
        let result = config.validateService({
          id: emptyValue,
          name: "valid",
          baseURL: "http://valid.url",
          model: "valid-model"
        });
        expect(result.valid).toBe(false);
        expect(result.errors.id).toBeDefined();

        // 测试�?name
        result = config.validateService({
          id: "valid-id",
          name: emptyValue,
          baseURL: "http://valid.url",
          model: "valid-model"
        });
        expect(result.valid).toBe(false);
        expect(result.errors.name).toBeDefined();

        // 测试�?baseURL
        result = config.validateService({
          id: "valid-id",
          name: "valid",
          baseURL: emptyValue,
          model: "valid-model"
        });
        expect(result.valid).toBe(false);
        expect(result.errors.baseURL).toBeDefined();

        // 测试�?model
        result = config.validateService({
          id: "valid-id",
          name: "valid",
          baseURL: "http://valid.url",
          model: emptyValue
        });
        expect(result.valid).toBe(false);
        expect(result.errors.model).toBeDefined();
      }
    });

    it("有效的服务配置应验证通过", () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 1 }).filter(s => s.trim().length > 0),
          (id, name, baseURL, model) => {
            const result = config.validateService({ id, name, baseURL, model });
            expect(result.valid).toBe(true);
            expect(Object.keys(result.errors).length).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});


describe("Config - LLM Config Read/Write", () => {
  let config;
  let testDir;

  beforeEach(async () => {
    testDir = path.join(TEST_BASE_DIR, randomUUID());
    await mkdir(testDir, { recursive: true });
    config = new Config(testDir);
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("getLlm()", () => {
    /**
     * Property 7: Config Source Priority
     * Feature: llm-settings-page, Property 7: Config Source Priority
     * Validates: Requirements 5.3
     */
    it("Property 7: �?app.local.json 存在时应优先读取", async () => {
      // 创建两个配置文件
      const defaultConfig = {
        llm: { baseURL: "http://default.url", model: "default-model", apiKey: "default-key" },
        otherField: "default"
      };
      const localConfig = {
        llm: { baseURL: "http://local.url", model: "local-model", apiKey: "local-key" },
        otherField: "local"
      };

      await writeFile(
        path.join(testDir, "app.json"),
        JSON.stringify(defaultConfig),
        "utf8"
      );
      await writeFile(
        path.join(testDir, "app.local.json"),
        JSON.stringify(localConfig),
        "utf8"
      );

      const result = await config.getLlm();
      expect(result.source).toBe("local");
      expect(result.llm.baseURL).toBe("http://local.url");
      expect(result.llm.model).toBe("local-model");
    });

    it("Property 7: �?app.local.json 不存在时应读�?app.json", async () => {
      const defaultConfig = {
        llm: { baseURL: "http://default.url", model: "default-model", apiKey: "default-key" }
      };

      await writeFile(
        path.join(testDir, "app.json"),
        JSON.stringify(defaultConfig),
        "utf8"
      );

      const result = await config.getLlm();
      expect(result.source).toBe("default");
      expect(result.llm.baseURL).toBe("http://default.url");
    });

    it("当两个配置文件都不存在时应抛出错�?, async () => {
      await expect(config.getLlm()).rejects.toThrow("配置文件不存�?);
    });
  });

  describe("saveLlm()", () => {
    /**
     * Property 5: Config Save Preserves Non-LLM Fields
     * Feature: llm-settings-page, Property 5: Config Save Preserves Non-LLM Fields
     * Validates: Requirements 4.2, 4.3
     */
    it("Property 5: 保存配置时应保留其他字段", async () => {
      fc.assert(
        fc.asyncProperty(
          fc.record({
            promptsDir: fc.string(),
            artifactsDir: fc.string(),
            runtimeDir: fc.string(),
            maxSteps: fc.integer({ min: 1, max: 1000 }),
            httpPort: fc.integer({ min: 1000, max: 65535 }),
            customField: fc.string()
          }),
          fc.record({
            baseURL: fc.string({ minLength: 1 }),
            model: fc.string({ minLength: 1 }),
            apiKey: fc.string(),
            maxConcurrentRequests: fc.integer({ min: 1, max: 10 })
          }),
          async (otherFields, newLlmConfig) => {
            // 每次迭代使用新的测试目录
            const iterDir = path.join(TEST_BASE_DIR, randomUUID());
            await mkdir(iterDir, { recursive: true });
            const iterConfig = new Config(iterDir);

            try {
              // 创建原始配置
              const originalConfig = {
                ...otherFields,
                llm: {
                  baseURL: "http://original.url",
                  model: "original-model",
                  apiKey: "original-key",
                  maxConcurrentRequests: 1
                }
              };

              await writeFile(
                path.join(iterDir, "app.json"),
                JSON.stringify(originalConfig),
                "utf8"
              );

              // 保存新的 LLM 配置
              await iterConfig.saveLlm(newLlmConfig);

              // 读取保存后的配置
              const savedContent = await readFile(
                path.join(iterDir, "app.local.json"),
                "utf8"
              );
              const savedConfig = JSON.parse(savedContent);

              // 验证其他字段保持不变
              expect(savedConfig.promptsDir).toBe(otherFields.promptsDir);
              expect(savedConfig.artifactsDir).toBe(otherFields.artifactsDir);
              expect(savedConfig.runtimeDir).toBe(otherFields.runtimeDir);
              expect(savedConfig.maxSteps).toBe(otherFields.maxSteps);
              expect(savedConfig.httpPort).toBe(otherFields.httpPort);
              expect(savedConfig.customField).toBe(otherFields.customField);

              // 验证 LLM 配置已更�?
              expect(savedConfig.llm.baseURL).toBe(newLlmConfig.baseURL);
              expect(savedConfig.llm.model).toBe(newLlmConfig.model);
              expect(savedConfig.llm.apiKey).toBe(newLlmConfig.apiKey);
            } finally {
              // 清理迭代目录
              if (existsSync(iterDir)) {
                await rm(iterDir, { recursive: true, force: true });
              }
            }
          }
        ),
        { numRuns: 20 } // 减少运行次数因为涉及文件 I/O
      );
    });

    it("�?app.local.json 不存在时应从 app.json 复制", async () => {
      const originalConfig = {
        promptsDir: "config/prompts",
        llm: { baseURL: "http://original.url", model: "original-model" }
      };

      await writeFile(
        path.join(testDir, "app.json"),
        JSON.stringify(originalConfig),
        "utf8"
      );

      await config.saveLlm({
        baseURL: "http://new.url",
        model: "new-model",
        apiKey: "new-key"
      });

      expect(existsSync(path.join(testDir, "app.local.json"))).toBe(true);
    });

    it("�?app.json 不存在时应抛出错�?, async () => {
      await expect(
        config.saveLlm({
          baseURL: "http://test.url",
          model: "test-model"
        })
      ).rejects.toThrow("app.json 不存�?);
    });
  });
});


describe("Config - LLM Services Management", () => {
  let config;
  let testDir;

  beforeEach(async () => {
    testDir = path.join(TEST_BASE_DIR, randomUUID());
    await mkdir(testDir, { recursive: true });
    config = new Config(testDir);
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("getServices()", () => {
    it("Property 7: �?llmservices.local.json 存在时应优先读取", async () => {
      const defaultServices = { services: [{ id: "default", name: "Default" }] };
      const localServices = { services: [{ id: "local", name: "Local" }] };

      await writeFile(
        path.join(testDir, "llmservices.json"),
        JSON.stringify(defaultServices),
        "utf8"
      );
      await writeFile(
        path.join(testDir, "llmservices.local.json"),
        JSON.stringify(localServices),
        "utf8"
      );

      const result = await config.getServices();
      expect(result.source).toBe("local");
      expect(result.services[0].id).toBe("local");
    });

    it("Property 7: �?llmservices.local.json 不存在时应读�?llmservices.json", async () => {
      const defaultServices = { services: [{ id: "default", name: "Default" }] };

      await writeFile(
        path.join(testDir, "llmservices.json"),
        JSON.stringify(defaultServices),
        "utf8"
      );

      const result = await config.getServices();
      expect(result.source).toBe("default");
      expect(result.services[0].id).toBe("default");
    });

    it("当两个配置文件都不存在时应返回空列表", async () => {
      const result = await config.getServices();
      expect(result.source).toBe("none");
      expect(result.services).toEqual([]);
    });
  });

  describe("addService()", () => {
    /**
     * Property 8: Service ID Uniqueness
     * Feature: llm-settings-page, Property 8: Service ID Uniqueness
     * Validates: Requirements 10.5
     */
    it("Property 8: 添加重复 ID 的服务应抛出错误", async () => {
      // 创建初始服务
      await config.addService({
        id: "test-service",
        name: "Test Service",
        baseURL: "http://test.url",
        model: "test-model"
      });

      // 尝试添加相同 ID 的服�?
      await expect(
        config.addService({
          id: "test-service",
          name: "Another Service",
          baseURL: "http://another.url",
          model: "another-model"
        })
      ).rejects.toThrow('服务 ID "test-service" 已存�?);
    });

    it("Property 8: 不同 ID 的服务应能成功添�?, async () => {
      fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim().length > 0 && /^[a-zA-Z0-9-_]+$/.test(s)),
              name: fc.string({ minLength: 1 }),
              baseURL: fc.string({ minLength: 1 }),
              model: fc.string({ minLength: 1 })
            }),
            { minLength: 1, maxLength: 5 }
          ).filter(arr => {
            // 确保所�?ID 都是唯一�?
            const ids = arr.map(s => s.id);
            return new Set(ids).size === ids.length;
          }),
          async (services) => {
            // 每次迭代使用新的测试目录
            const iterDir = path.join(TEST_BASE_DIR, randomUUID());
            await mkdir(iterDir, { recursive: true });
            const iterConfig = new Config(iterDir);

            try {
              // 添加所有服�?
              for (const service of services) {
                await iterConfig.addService(service);
              }

              // 验证所有服务都已添�?
              const result = await iterConfig.getServices();
              expect(result.services.length).toBe(services.length);

              for (const service of services) {
                const found = result.services.find(s => s.id === service.id);
                expect(found).toBeDefined();
                expect(found.name).toBe(service.name);
              }
            } finally {
              // 清理迭代目录
              if (existsSync(iterDir)) {
                await rm(iterDir, { recursive: true, force: true });
              }
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it("添加服务时应返回带掩码的 apiKey", async () => {
      const result = await config.addService({
        id: "test-service",
        name: "Test Service",
        baseURL: "http://test.url",
        model: "test-model",
        apiKey: "sk-1234567890"
      });

      expect(result.apiKey).toBe("****7890");
    });
  });

  describe("updateService()", () => {
    it("更新不存在的服务应抛出错�?, async () => {
      // 先创建一个空的服务列�?
      await writeFile(
        path.join(testDir, "llmservices.local.json"),
        JSON.stringify({ services: [] }),
        "utf8"
      );

      await expect(
        config.updateService("non-existent", {
          id: "non-existent",
          name: "Test",
          baseURL: "http://test.url",
          model: "test-model"
        })
      ).rejects.toThrow('服务 "non-existent" 不存�?);
    });

    it("更新服务应正确保存新�?, async () => {
      // 先添加服�?
      await config.addService({
        id: "test-service",
        name: "Original Name",
        baseURL: "http://original.url",
        model: "original-model"
      });

      // 更新服务
      await config.updateService("test-service", {
        id: "test-service",
        name: "Updated Name",
        baseURL: "http://updated.url",
        model: "updated-model"
      });

      // 验证更新
      const result = await config.getServices();
      const service = result.services.find(s => s.id === "test-service");
      expect(service.name).toBe("Updated Name");
      expect(service.baseURL).toBe("http://updated.url");
      expect(service.model).toBe("updated-model");
    });
  });

  describe("deleteService()", () => {
    it("删除不存在的服务应抛出错�?, async () => {
      // 先创建一个空的服务列�?
      await writeFile(
        path.join(testDir, "llmservices.local.json"),
        JSON.stringify({ services: [] }),
        "utf8"
      );

      await expect(
        config.deleteService("non-existent")
      ).rejects.toThrow('服务 "non-existent" 不存�?);
    });

    it("删除服务后应从列表中移除", async () => {
      // 添加两个服务
      await config.addService({
        id: "service-1",
        name: "Service 1",
        baseURL: "http://test1.url",
        model: "model-1"
      });
      await config.addService({
        id: "service-2",
        name: "Service 2",
        baseURL: "http://test2.url",
        model: "model-2"
      });

      // 删除第一个服�?
      await config.deleteService("service-1");

      // 验证删除
      const result = await config.getServices();
      expect(result.services.length).toBe(1);
      expect(result.services[0].id).toBe("service-2");
    });
  });
});
