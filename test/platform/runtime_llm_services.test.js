import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Runtime } from "../../src/platform/runtime.js";
import { LlmClient } from "../../src/platform/llm_client.js";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";

/**
 * Feature: llm-service-selector
 * Property 8: LlmClient 池实例复用
 * Property 9: LlmClient 回退逻辑
 */

describe("Runtime LLM Services", () => {
  const testDir = "test/.tmp/runtime_llm_services_test";
  const configDir = path.join(testDir, "config");
  const runtimeDir = path.join(testDir, "state");
  const artifactsDir = path.join(testDir, "artifacts");
  const promptsDir = path.join(testDir, "prompts");

  beforeEach(async () => {
    // 清理并创建测试目录
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
    await mkdir(configDir, { recursive: true });
    await mkdir(runtimeDir, { recursive: true });
    await mkdir(artifactsDir, { recursive: true });
    await mkdir(promptsDir, { recursive: true });

    // 创建基础配置文件
    const appConfig = {
      promptsDir: promptsDir,
      artifactsDir: artifactsDir,
      runtimeDir: runtimeDir,
      maxSteps: 10,
      maxToolRounds: 10,
      llm: {
        baseURL: "http://127.0.0.1:1234/v1",
        model: "default-model",
        apiKey: "test-key",
        maxConcurrentRequests: 2
      }
    };
    await writeFile(path.join(configDir, "app.json"), JSON.stringify(appConfig, null, 2));

    // 创建基础提示词文件
    await writeFile(path.join(promptsDir, "base.txt"), "You are a helpful assistant.");
    await writeFile(path.join(promptsDir, "compose.txt"), "{{BASE}}\n{{ROLE}}\n{{TASK}}");
    await writeFile(path.join(promptsDir, "tool_rules.txt"), "Follow tool rules.");
    await writeFile(path.join(promptsDir, "model_selector.txt"), `你是一个模型选择助手。
## 岗位提示词
{{ROLE_PROMPT}}
## 可用的大模型服务
{{SERVICES_LIST}}
## 输出格式
{"serviceId": "选中的服务ID", "reason": "选择原因"}`);
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  describe("Property 8: LlmClient 池实例复用", () => {
    it("首次调用 getLlmClientForService 应创建新实例，后续调用相同 ID 应返回相同实例引用", async () => {
      // 创建 LLM 服务配置
      const servicesConfig = {
        services: [
          {
            id: "service-a",
            name: "服务A",
            baseURL: "http://127.0.0.1:1234/v1",
            model: "model-a",
            apiKey: "key-a",
            capabilityTags: ["编程"],
            description: "编程模型"
          },
          {
            id: "service-b",
            name: "服务B",
            baseURL: "http://127.0.0.1:1235/v1",
            model: "model-b",
            apiKey: "key-b",
            capabilityTags: ["视觉理解"],
            description: "视觉模型"
          }
        ]
      };
      await writeFile(path.join(configDir, "llmservices.json"), JSON.stringify(servicesConfig, null, 2));

      // 初始化 Runtime
      const runtime = new Runtime({ configPath: path.join(configDir, "app.json") });
      await runtime.init();

      // 验证服务注册表已加载
      expect(runtime.serviceRegistry).not.toBeNull();
      expect(runtime.serviceRegistry.hasServices()).toBe(true);

      // 首次调用 - 应创建新实例
      const client1 = runtime.getLlmClientForService("service-a");
      expect(client1).not.toBeNull();
      expect(client1).toBeInstanceOf(LlmClient);

      // 再次调用相同 ID - 应返回相同实例
      const client2 = runtime.getLlmClientForService("service-a");
      expect(client2).toBe(client1); // 严格相等，同一引用

      // 调用不同 ID - 应创建新实例
      const client3 = runtime.getLlmClientForService("service-b");
      expect(client3).not.toBeNull();
      expect(client3).not.toBe(client1); // 不同实例

      // 再次调用 service-b - 应返回相同实例
      const client4 = runtime.getLlmClientForService("service-b");
      expect(client4).toBe(client3);

      // 验证池中有两个实例
      expect(runtime.llmClientPool.size).toBe(2);
    });

    it("Property 8 属性测试：任意服务 ID 多次调用返回相同实例", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              id: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
              name: fc.string({ minLength: 1, maxLength: 50 }),
              baseURL: fc.constant("http://127.0.0.1:1234/v1"),
              model: fc.string({ minLength: 1, maxLength: 30 }),
              apiKey: fc.string({ minLength: 1, maxLength: 50 }),
              capabilityTags: fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 5 }),
              description: fc.string({ minLength: 1, maxLength: 100 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (services) => {
            // 确保 ID 唯一
            const uniqueServices = [];
            const seenIds = new Set();
            for (const s of services) {
              if (!seenIds.has(s.id)) {
                seenIds.add(s.id);
                uniqueServices.push(s);
              }
            }
            if (uniqueServices.length === 0) return true;

            // 创建配置文件
            await writeFile(
              path.join(configDir, "llmservices.json"),
              JSON.stringify({ services: uniqueServices }, null, 2)
            );

            // 初始化 Runtime
            const runtime = new Runtime({ configPath: path.join(configDir, "app.json") });
            await runtime.init();

            // 对每个服务 ID 多次调用，验证返回相同实例
            for (const service of uniqueServices) {
              const firstCall = runtime.getLlmClientForService(service.id);
              const secondCall = runtime.getLlmClientForService(service.id);
              const thirdCall = runtime.getLlmClientForService(service.id);

              if (firstCall !== null) {
                expect(secondCall).toBe(firstCall);
                expect(thirdCall).toBe(firstCall);
              }
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });

    it("不存在的服务 ID 应返回 null", async () => {
      const servicesConfig = {
        services: [
          {
            id: "existing-service",
            name: "存在的服务",
            baseURL: "http://127.0.0.1:1234/v1",
            model: "model",
            apiKey: "key",
            capabilityTags: ["通用"],
            description: "通用模型"
          }
        ]
      };
      await writeFile(path.join(configDir, "llmservices.json"), JSON.stringify(servicesConfig, null, 2));

      const runtime = new Runtime({ configPath: path.join(configDir, "app.json") });
      await runtime.init();

      // 不存在的服务 ID
      const client = runtime.getLlmClientForService("non-existent-service");
      expect(client).toBeNull();

      // 空字符串
      const client2 = runtime.getLlmClientForService("");
      expect(client2).toBeNull();

      // null
      const client3 = runtime.getLlmClientForService(null);
      expect(client3).toBeNull();
    });
  });

  describe("Property 9: LlmClient 回退逻辑", () => {
    it("岗位未指定 llmServiceId 时应使用默认 LlmClient", async () => {
      // 创建 LLM 服务配置
      const servicesConfig = {
        services: [
          {
            id: "service-a",
            name: "服务A",
            baseURL: "http://127.0.0.1:1234/v1",
            model: "model-a",
            apiKey: "key-a",
            capabilityTags: ["编程"],
            description: "编程模型"
          }
        ]
      };
      await writeFile(path.join(configDir, "llmservices.json"), JSON.stringify(servicesConfig, null, 2));

      const runtime = new Runtime({ configPath: path.join(configDir, "app.json") });
      await runtime.init();

      // 创建一个不指定 llmServiceId 的岗位
      const role = await runtime.org.createRole({
        name: "测试岗位",
        rolePrompt: "你是一个测试助手",
        createdBy: "root"
      });

      // 创建智能体
      const agentMeta = await runtime.org.createAgent({
        roleId: role.id,
        parentAgentId: "root"
      });

      // 模拟注册智能体实例
      runtime._agents.set(agentMeta.id, {
        id: agentMeta.id,
        roleId: role.id,
        roleName: role.name
      });

      // 获取智能体的 LlmClient
      const client = runtime.getLlmClientForAgent(agentMeta.id);

      // 应该返回默认 LlmClient
      expect(client).toBe(runtime.llm);
    });

    it("岗位指定的 llmServiceId 存在时应返回对应的 LlmClient", async () => {
      // 创建 LLM 服务配置
      const servicesConfig = {
        services: [
          {
            id: "coding-service",
            name: "编程服务",
            baseURL: "http://127.0.0.1:1235/v1",
            model: "coding-model",
            apiKey: "coding-key",
            capabilityTags: ["编程"],
            description: "编程模型"
          }
        ]
      };
      await writeFile(path.join(configDir, "llmservices.json"), JSON.stringify(servicesConfig, null, 2));

      const runtime = new Runtime({ configPath: path.join(configDir, "app.json") });
      await runtime.init();

      // 创建一个指定 llmServiceId 的岗位
      const role = await runtime.org.createRole({
        name: "编程岗位",
        rolePrompt: "你是一个编程助手",
        createdBy: "root",
        llmServiceId: "coding-service"
      });

      // 创建智能体
      const agentMeta = await runtime.org.createAgent({
        roleId: role.id,
        parentAgentId: "root"
      });

      // 模拟注册智能体实例
      runtime._agents.set(agentMeta.id, {
        id: agentMeta.id,
        roleId: role.id,
        roleName: role.name
      });

      // 获取智能体的 LlmClient
      const client = runtime.getLlmClientForAgent(agentMeta.id);

      // 应该返回指定服务的 LlmClient，而不是默认的
      expect(client).not.toBe(runtime.llm);
      expect(client).toBeInstanceOf(LlmClient);

      // 验证是从池中获取的
      expect(runtime.llmClientPool.has("coding-service")).toBe(true);
      expect(runtime.llmClientPool.get("coding-service")).toBe(client);
    });

    it("岗位指定的 llmServiceId 不存在时应回退到默认 LlmClient", async () => {
      // 创建 LLM 服务配置（不包含岗位指定的服务）
      const servicesConfig = {
        services: [
          {
            id: "other-service",
            name: "其他服务",
            baseURL: "http://127.0.0.1:1234/v1",
            model: "other-model",
            apiKey: "other-key",
            capabilityTags: ["其他"],
            description: "其他模型"
          }
        ]
      };
      await writeFile(path.join(configDir, "llmservices.json"), JSON.stringify(servicesConfig, null, 2));

      const runtime = new Runtime({ configPath: path.join(configDir, "app.json") });
      await runtime.init();

      // 创建一个指定不存在的 llmServiceId 的岗位
      const role = await runtime.org.createRole({
        name: "测试岗位",
        rolePrompt: "你是一个测试助手",
        createdBy: "root",
        llmServiceId: "non-existent-service"
      });

      // 创建智能体
      const agentMeta = await runtime.org.createAgent({
        roleId: role.id,
        parentAgentId: "root"
      });

      // 模拟注册智能体实例
      runtime._agents.set(agentMeta.id, {
        id: agentMeta.id,
        roleId: role.id,
        roleName: role.name
      });

      // 获取智能体的 LlmClient
      const client = runtime.getLlmClientForAgent(agentMeta.id);

      // 应该回退到默认 LlmClient
      expect(client).toBe(runtime.llm);
    });

    it("智能体不存在时应返回默认 LlmClient", async () => {
      const runtime = new Runtime({ configPath: path.join(configDir, "app.json") });
      await runtime.init();

      // 获取不存在的智能体的 LlmClient
      const client = runtime.getLlmClientForAgent("non-existent-agent");

      // 应该返回默认 LlmClient
      expect(client).toBe(runtime.llm);
    });

    it("agentId 为空时应返回默认 LlmClient", async () => {
      const runtime = new Runtime({ configPath: path.join(configDir, "app.json") });
      await runtime.init();

      expect(runtime.getLlmClientForAgent(null)).toBe(runtime.llm);
      expect(runtime.getLlmClientForAgent(undefined)).toBe(runtime.llm);
      expect(runtime.getLlmClientForAgent("")).toBe(runtime.llm);
    });

    it("Property 9 属性测试：各种回退场景验证", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            hasService: fc.boolean(),
            serviceId: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
            roleHasServiceId: fc.boolean(),
            roleServiceIdMatches: fc.boolean(),
            uniqueSuffix: fc.integer({ min: 1, max: 999999 })
          }),
          async ({ hasService, serviceId, roleHasServiceId, roleServiceIdMatches, uniqueSuffix }) => {
            // 根据测试参数创建配置
            const services = hasService
              ? [
                  {
                    id: serviceId,
                    name: "测试服务",
                    baseURL: "http://127.0.0.1:1234/v1",
                    model: "test-model",
                    apiKey: "test-key",
                    capabilityTags: ["测试"],
                    description: "测试模型"
                  }
                ]
              : [];

            await writeFile(
              path.join(configDir, "llmservices.json"),
              JSON.stringify({ services }, null, 2)
            );

            const runtime = new Runtime({ configPath: path.join(configDir, "app.json") });
            await runtime.init();

            // 创建岗位（使用唯一名称避免冲突）
            const roleLlmServiceId = roleHasServiceId
              ? roleServiceIdMatches
                ? serviceId
                : "non-matching-service"
              : null;

            const role = await runtime.org.createRole({
              name: `测试岗位_${uniqueSuffix}_${Date.now()}`,
              rolePrompt: "测试",
              createdBy: "root",
              llmServiceId: roleLlmServiceId
            });

            // 创建智能体
            const agentMeta = await runtime.org.createAgent({
              roleId: role.id,
              parentAgentId: "root"
            });

            runtime._agents.set(agentMeta.id, {
              id: agentMeta.id,
              roleId: role.id,
              roleName: role.name
            });

            // 获取 LlmClient
            const client = runtime.getLlmClientForAgent(agentMeta.id);

            // 验证回退逻辑
            if (!roleHasServiceId || !roleLlmServiceId) {
              // 岗位未指定 llmServiceId，应使用默认
              expect(client).toBe(runtime.llm);
            } else if (hasService && roleServiceIdMatches) {
              // 岗位指定的服务存在，应使用指定服务
              expect(client).not.toBe(runtime.llm);
              expect(client).toBeInstanceOf(LlmClient);
            } else {
              // 岗位指定的服务不存在，应回退到默认
              expect(client).toBe(runtime.llm);
            }

            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});
