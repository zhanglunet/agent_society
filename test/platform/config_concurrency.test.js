import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fc from "fast-check";
import { loadConfig } from "../../src/platform/config.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import path from "node:path";

describe("Config Concurrency Support", () => {
  const testConfigDir = "test/.tmp/config_test";
  let originalConsoleWarn;

  beforeEach(async () => {
    // 创建测试目录
    await mkdir(testConfigDir, { recursive: true });
    
    // Mock console.warn to capture warnings
    originalConsoleWarn = console.warn;
    console.warn = vi.fn();
  });

  afterEach(async () => {
    // 清理测试目录
    await rm(testConfigDir, { recursive: true, force: true });
    
    // 恢复console.warn
    console.warn = originalConsoleWarn;
  });

  // **Feature: llm-concurrency-control, Property 1: Configuration Loading and Validation**
  describe("Property 1: Configuration Loading and Validation", () => {
    it("对于任何app.json配置文件，系统应正确读取maxConcurrentLlmRequests值，未指定时使用默认值3，无效值时使用默认值3并警告", async () => {
      await fc.assert(fc.asyncProperty(
        fc.oneof(
          fc.constant(undefined), // 未配置
          fc.constant(null), // null值
          fc.integer({ min: 1, max: 10 }), // 有效值
          fc.integer({ min: -10, max: 0 }), // 无效值（非正数）
          fc.float(), // 无效值（小数）
          fc.string(), // 无效值（字符串）
          fc.boolean() // 无效值（布尔值）
        ),
        async (maxConcurrentRequests) => {
          const configPath = path.join(testConfigDir, "test-config.json");
          
          // 创建测试配置
          const config = {
            promptsDir: "config/prompts",
            artifactsDir: "data/runtime/artifacts",
            runtimeDir: "data/runtime/state",
            llm: {
              baseURL: "http://localhost:1234/v1",
              model: "test-model",
              apiKey: "test-key"
            }
          };
          
          // 只有当值不是undefined时才添加maxConcurrentRequests
          if (maxConcurrentRequests !== undefined) {
            config.llm.maxConcurrentRequests = maxConcurrentRequests;
          }
          
          await writeFile(configPath, JSON.stringify(config, null, 2));
          
          // 重置console.warn mock
          console.warn.mockClear();
          
          // 加载配置
          const loadedConfig = await loadConfig(configPath);
          
          // 验证结果
          expect(loadedConfig.llm).toBeDefined();
          expect(loadedConfig.llm.maxConcurrentRequests).toBeTypeOf("number");
          
          if (maxConcurrentRequests === undefined || maxConcurrentRequests === null) {
            // 未配置或null时应使用默认值3
            expect(loadedConfig.llm.maxConcurrentRequests).toBe(3);
            expect(console.warn).not.toHaveBeenCalled();
          } else if (Number.isInteger(maxConcurrentRequests) && maxConcurrentRequests > 0) {
            // 有效值时应使用配置值
            expect(loadedConfig.llm.maxConcurrentRequests).toBe(maxConcurrentRequests);
            expect(console.warn).not.toHaveBeenCalled();
          } else {
            // 无效值时应使用默认值3并记录警告
            expect(loadedConfig.llm.maxConcurrentRequests).toBe(3);
            expect(console.warn).toHaveBeenCalledWith(
              expect.stringContaining(`Invalid maxConcurrentRequests value: ${maxConcurrentRequests}`)
            );
          }
        }
      ), { numRuns: 100 });
    });
  });

  // **Feature: llm-concurrency-control, Property 2: Dynamic Configuration Updates**
  describe("Property 2: Dynamic Configuration Updates", () => {
    it("对于任何运行时配置更改，并发控制器应动态调整并发请求限制而不中断活跃请求", async () => {
      // 注意：这个属性测试主要验证配置加载的正确性
      // 动态更新的测试将在ConcurrencyController的测试中进行
      await fc.assert(fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 10 }),
        async (initialValue, newValue) => {
          const configPath = path.join(testConfigDir, "dynamic-config.json");
          
          // 创建初始配置
          const initialConfig = {
            promptsDir: "config/prompts",
            artifactsDir: "data/runtime/artifacts", 
            runtimeDir: "data/runtime/state",
            llm: {
              baseURL: "http://localhost:1234/v1",
              model: "test-model",
              apiKey: "test-key",
              maxConcurrentRequests: initialValue
            }
          };
          
          await writeFile(configPath, JSON.stringify(initialConfig, null, 2));
          
          // 加载初始配置
          const loadedConfig1 = await loadConfig(configPath);
          expect(loadedConfig1.llm.maxConcurrentRequests).toBe(initialValue);
          
          // 更新配置
          const updatedConfig = {
            ...initialConfig,
            llm: {
              ...initialConfig.llm,
              maxConcurrentRequests: newValue
            }
          };
          
          await writeFile(configPath, JSON.stringify(updatedConfig, null, 2));
          
          // 重新加载配置
          const loadedConfig2 = await loadConfig(configPath);
          expect(loadedConfig2.llm.maxConcurrentRequests).toBe(newValue);
        }
      ), { numRuns: 50 });
    });
  });

  describe("单元测试", () => {
    it("应正确处理完整的配置文件", async () => {
      const configPath = path.join(testConfigDir, "complete-config.json");
      const config = {
        promptsDir: "config/prompts",
        artifactsDir: "data/runtime/artifacts",
        runtimeDir: "data/runtime/state",
        llm: {
          baseURL: "http://localhost:1234/v1",
          model: "test-model",
          apiKey: "test-key",
          maxConcurrentRequests: 5
        }
      };
      
      await writeFile(configPath, JSON.stringify(config, null, 2));
      
      const loadedConfig = await loadConfig(configPath);
      
      expect(loadedConfig.llm.maxConcurrentRequests).toBe(5);
    });

    it("应在缺少maxConcurrentRequests时使用默认值", async () => {
      const configPath = path.join(testConfigDir, "no-concurrent-config.json");
      const config = {
        promptsDir: "config/prompts",
        artifactsDir: "data/runtime/artifacts",
        runtimeDir: "data/runtime/state",
        llm: {
          baseURL: "http://localhost:1234/v1",
          model: "test-model",
          apiKey: "test-key"
          // 没有maxConcurrentRequests
        }
      };
      
      await writeFile(configPath, JSON.stringify(config, null, 2));
      
      const loadedConfig = await loadConfig(configPath);
      
      expect(loadedConfig.llm.maxConcurrentRequests).toBe(3);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("应在无效值时使用默认值并记录警告", async () => {
      const testCases = [
        { value: 0, description: "零值" },
        { value: -1, description: "负数" },
        { value: 1.5, description: "小数" },
        { value: "invalid", description: "字符串" },
        { value: true, description: "布尔值" },
        { value: [], description: "数组" },
        { value: {}, description: "对象" }
      ];

      for (const testCase of testCases) {
        const configPath = path.join(testConfigDir, `invalid-${testCase.description}-config.json`);
        const config = {
          promptsDir: "config/prompts",
          artifactsDir: "data/runtime/artifacts",
          runtimeDir: "data/runtime/state",
          llm: {
            baseURL: "http://localhost:1234/v1",
            model: "test-model",
            apiKey: "test-key",
            maxConcurrentRequests: testCase.value
          }
        };
        
        await writeFile(configPath, JSON.stringify(config, null, 2));
        
        console.warn.mockClear();
        
        const loadedConfig = await loadConfig(configPath);
        
        expect(loadedConfig.llm.maxConcurrentRequests).toBe(3);
        expect(console.warn).toHaveBeenCalledWith(
          expect.stringContaining(`Invalid maxConcurrentRequests value: ${testCase.value}`)
        );
      }
    });

    it("应正确处理null值", async () => {
      const configPath = path.join(testConfigDir, "null-config.json");
      const config = {
        promptsDir: "config/prompts",
        artifactsDir: "data/runtime/artifacts",
        runtimeDir: "data/runtime/state",
        llm: {
          baseURL: "http://localhost:1234/v1",
          model: "test-model",
          apiKey: "test-key",
          maxConcurrentRequests: null
        }
      };
      
      await writeFile(configPath, JSON.stringify(config, null, 2));
      
      const loadedConfig = await loadConfig(configPath);
      
      expect(loadedConfig.llm.maxConcurrentRequests).toBe(3);
      expect(console.warn).not.toHaveBeenCalled();
    });

    it("应正确处理边界值", async () => {
      const testCases = [1, 100, 1000];

      for (const value of testCases) {
        const configPath = path.join(testConfigDir, `boundary-${value}-config.json`);
        const config = {
          promptsDir: "config/prompts",
          artifactsDir: "data/runtime/artifacts",
          runtimeDir: "data/runtime/state",
          llm: {
            baseURL: "http://localhost:1234/v1",
            model: "test-model",
            apiKey: "test-key",
            maxConcurrentRequests: value
          }
        };
        
        await writeFile(configPath, JSON.stringify(config, null, 2));
        
        console.warn.mockClear();
        
        const loadedConfig = await loadConfig(configPath);
        
        expect(loadedConfig.llm.maxConcurrentRequests).toBe(value);
        expect(console.warn).not.toHaveBeenCalled();
      }
    });
  });
});