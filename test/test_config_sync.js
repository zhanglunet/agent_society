import { Config } from "../src/platform/utils/config/config.js";
import { LlmServiceRegistry } from "../src/platform/services/llm/llm_service_registry.js";
import { Runtime } from "../src/platform/core/runtime.js";
import { createNoopModuleLogger } from "../src/platform/utils/logger/logger.js";
import path from "node:path";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";

// Mock LlmClient to avoid OpenAI dependency and potential errors
class MockLlmClient {
  constructor(options) {
    this.options = options;
  }
}

// Actually, it's better to just use a custom Runtime that overrides the client creation method
class TestRuntime extends Runtime {
  async getLlmClientForService(serviceId) {
    // 复用 Runtime 的逻辑，但返回 MockLlmClient
    const serviceConfig = await this.serviceRegistry.getServiceById(serviceId);
    if (!serviceConfig) return null;

    const cached = this.llmClientPool.get(serviceId);
    if (cached) {
      const { client, config } = cached;
      const isSameConfig = 
        config.baseURL === serviceConfig.baseURL &&
        config.model === serviceConfig.model &&
        config.apiKey === serviceConfig.apiKey &&
        config.maxTokens === serviceConfig.maxTokens;
      if (isSameConfig) return client;
    }

    const client = new MockLlmClient(serviceConfig);
    this.llmClientPool.set(serviceId, { client, config: { ...serviceConfig } });
    return client;
  }
}

async function testConfigSync() {
  const testDir = path.join(process.cwd(), "test_temp_sync");
  if (!existsSync(testDir)) {
    await mkdir(testDir, { recursive: true });
  }

  const logger = createNoopModuleLogger();
  const configService = new Config(testDir, logger);
  
  // 1. 初始化 LlmServiceRegistry
  const serviceRegistry = new LlmServiceRegistry({ 
    configDir: testDir, 
    logger: logger, 
    configService 
  });
  
  // 2. 初始化 Runtime (不调用 init，手动设置依赖)
  const runtime = new TestRuntime({ 
    dataDir: path.join(testDir, "data"),
    loggerRoot: { forModule: () => logger },
    configService
  });
  runtime.serviceRegistry = serviceRegistry;
  runtime.log = logger;

  try {
    // 3. 添加一个初始服务
    const serviceId = "test-service";
    const initialConfig = {
      id: serviceId,
      name: "Test Service",
      baseURL: "https://api.example.com/v1",
      model: "gpt-3.5-turbo",
      apiKey: "initial-key",
      capabilities: { chat: true }
    };

    console.log("Adding initial service config...");
    await configService.addService(initialConfig);

    // 4. 获取 LLM Client
    console.log("Getting first LLM client...");
    const client1 = await runtime.getLlmClientForService(serviceId);
    if (!client1) throw new Error("Failed to get client1");
    console.log("Client1 baseURL:", client1.options.baseURL);

    // 5. 更新配置
    const updatedConfig = {
      ...initialConfig,
      baseURL: "https://api.example.com/v2",
      apiKey: "updated-key"
    };

    console.log("Updating service config...");
    await configService.updateService(serviceId, updatedConfig);

    // 6. 再次获取 LLM Client，应该得到一个新实例
    console.log("Getting second LLM client...");
    const client2 = await runtime.getLlmClientForService(serviceId);
    if (!client2) throw new Error("Failed to get client2");
    console.log("Client2 baseURL:", client2.options.baseURL);

    if (client1 === client2) {
      throw new Error("FAILED: client1 and client2 are the same instance!");
    } else if (client2.options.baseURL !== "https://api.example.com/v2") {
      throw new Error("FAILED: client2 has wrong baseURL: " + client2.options.baseURL);
    } else {
      console.log("SUCCESS: Config change detected and client updated!");
    }

    // 7. 测试删除服务
    console.log("Deleting service...");
    await configService.deleteService(serviceId);
    const client3 = await runtime.getLlmClientForService(serviceId);
    if (client3 === null) {
      console.log("SUCCESS: Client pool cleared after service deletion (service not found)!");
    } else {
      throw new Error("FAILED: Client still exists after service deletion!");
    }

  } catch (err) {
    console.error("Test failed:", err.message);
    process.exit(1);
  } finally {
    // 清理
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  }
}

testConfigSync();
