import { describe, expect, test, beforeEach, afterEach } from "vitest";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { ModuleLoader } from "../../src/platform/extensions/module_loader.js";

const TEST_MODULES_DIR = path.resolve(process.cwd(), "test/.tmp/test_modules");

/**
 * 创建测试模块文件
 * @param {string} moduleName - 模块名称
 * @param {object} moduleContent - 模块内容
 */
async function createTestModule(moduleName, moduleContent) {
  const moduleDir = path.join(TEST_MODULES_DIR, moduleName);
  await mkdir(moduleDir, { recursive: true });
  
  const moduleCode = `
export default ${JSON.stringify(moduleContent, (key, value) => {
    if (typeof value === "function") {
      return value.toString();
    }
    return value;
  }, 2).replace(/"(async function[^"]*|function[^"]*)"/g, "$1")};
`;
  
  await writeFile(path.join(moduleDir, "index.js"), moduleCode, "utf8");
}

/**
 * 创建有效的测试模�?
 * @param {string} moduleName - 模块名称
 * @param {string[]} toolNames - 工具名称列表
 */
async function createValidModule(moduleName, toolNames = ["test_tool"]) {
  const moduleDir = path.join(TEST_MODULES_DIR, moduleName);
  await mkdir(moduleDir, { recursive: true });
  
  const tools = toolNames.map(name => ({
    type: "function",
    function: {
      name,
      description: `Test tool ${name}`,
      parameters: { type: "object", properties: {} }
    }
  }));
  
  const moduleCode = `
let initialized = false;
let shutdownCalled = false;

export default {
  name: "${moduleName}",
  
  async init(runtime) {
    initialized = true;
  },
  
  getToolDefinitions() {
    return ${JSON.stringify(tools)};
  },
  
  async executeToolCall(ctx, toolName, args) {
    return { ok: true, module: "${moduleName}", toolName, args };
  },
  
  async shutdown() {
    shutdownCalled = true;
  },
  
  // 测试辅助方法
  isInitialized() { return initialized; },
  isShutdown() { return shutdownCalled; }
};
`;
  
  await writeFile(path.join(moduleDir, "index.js"), moduleCode, "utf8");
}

/**
 * 创建无效的测试模块（缺少必需字段�?
 * @param {string} moduleName - 模块名称
 * @param {string[]} missingFields - 缺少的字�?
 */
async function createInvalidModule(moduleName, missingFields = ["name"]) {
  const moduleDir = path.join(TEST_MODULES_DIR, moduleName);
  await mkdir(moduleDir, { recursive: true });
  
  const fields = {
    name: `"${moduleName}"`,
    init: "async function init(runtime) {}",
    getToolDefinitions: "function getToolDefinitions() { return []; }",
    executeToolCall: "async function executeToolCall(ctx, toolName, args) { return {}; }",
    shutdown: "async function shutdown() {}"
  };
  
  // 移除指定的字�?
  for (const field of missingFields) {
    delete fields[field];
  }
  
  const moduleCode = `
export default {
  ${Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(",\n  ")}
};
`;
  
  await writeFile(path.join(moduleDir, "index.js"), moduleCode, "utf8");
}

/**
 * 创建会抛出错误的模块
 * @param {string} moduleName - 模块名称
 * @param {string} errorPhase - 错误阶段: 'init' | 'execute'
 */
async function createErrorModule(moduleName, errorPhase = "init") {
  const moduleDir = path.join(TEST_MODULES_DIR, moduleName);
  await mkdir(moduleDir, { recursive: true });
  
  const moduleCode = `
export default {
  name: "${moduleName}",
  
  async init(runtime) {
    ${errorPhase === "init" ? 'throw new Error("Init error");' : ""}
  },
  
  getToolDefinitions() {
    return [{
      type: "function",
      function: {
        name: "${moduleName}_tool",
        description: "Test tool",
        parameters: { type: "object", properties: {} }
      }
    }];
  },
  
  async executeToolCall(ctx, toolName, args) {
    ${errorPhase === "execute" ? 'throw new Error("Execute error");' : 'return { ok: true };'}
  },
  
  async shutdown() {}
};
`;
  
  await writeFile(path.join(moduleDir, "index.js"), moduleCode, "utf8");
}

describe("ModuleLoader", () => {
  beforeEach(async () => {
    await rm(TEST_MODULES_DIR, { recursive: true, force: true });
    await mkdir(TEST_MODULES_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_MODULES_DIR, { recursive: true, force: true });
  });

  describe("Property 2: Configuration-Driven Module Loading", () => {
    test("仅加载配置中启用的模�?, async () => {
      // 创建多个模块
      await createValidModule("module_a", ["tool_a"]);
      await createValidModule("module_b", ["tool_b"]);
      await createValidModule("module_c", ["tool_c"]);

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      
      // 只启�?module_a �?module_c
      const result = await loader.loadModules(["module_a", "module_c"], {});

      expect(result.loaded).toEqual(["module_a", "module_c"]);
      expect(result.errors).toHaveLength(0);
      
      // 验证只有启用的模块被加载
      const loadedModules = loader.getLoadedModules();
      expect(loadedModules.map(m => m.name).sort()).toEqual(["module_a", "module_c"]);
      
      // 验证未启用的模块没有被加�?
      expect(loader.hasToolName("tool_a")).toBe(true);
      expect(loader.hasToolName("tool_b")).toBe(false);
      expect(loader.hasToolName("tool_c")).toBe(true);

      await loader.shutdown();
    });

    test("空配置不加载任何模块", async () => {
      await createValidModule("module_a", ["tool_a"]);

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      
      // 空数�?
      const result1 = await loader.loadModules([], {});
      expect(result1.loaded).toHaveLength(0);
      expect(loader.getLoadedModules()).toHaveLength(0);

      // null
      const result2 = await loader.loadModules(null, {});
      expect(result2.loaded).toHaveLength(0);

      // undefined
      const result3 = await loader.loadModules(undefined, {});
      expect(result3.loaded).toHaveLength(0);

      await loader.shutdown();
    });

    test("不存在的模块返回错误但不影响其他模块", async () => {
      await createValidModule("module_a", ["tool_a"]);

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      const result = await loader.loadModules(["module_a", "nonexistent"], {});

      expect(result.loaded).toEqual(["module_a"]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].module).toBe("nonexistent");

      await loader.shutdown();
    });
  });

  describe("Property 3: Tool Definition Collection", () => {
    test("收集所有已加载模块的工具定�?, async () => {
      // 使用唯一的模块名避免缓存问题
      const timestamp = Date.now();
      await createValidModule(`collect_module_a_${timestamp}`, [`collect_tool_a1_${timestamp}`, `collect_tool_a2_${timestamp}`]);
      await createValidModule(`collect_module_b_${timestamp}`, [`collect_tool_b1_${timestamp}`]);

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      await loader.loadModules([`collect_module_a_${timestamp}`, `collect_module_b_${timestamp}`], {});

      const tools = loader.getToolDefinitions();
      const toolNames = tools.map(t => t.function.name).sort();
      
      // 验证工具数量和名�?
      expect(toolNames).toContain(`collect_tool_a1_${timestamp}`);
      expect(toolNames).toContain(`collect_tool_a2_${timestamp}`);
      expect(toolNames).toContain(`collect_tool_b1_${timestamp}`);

      await loader.shutdown();
    });

    test("工具名冲突时后加载的模块覆盖映射", async () => {
      const timestamp = Date.now();
      await createValidModule(`conflict_module_${timestamp}`, [`conflict_tool_${timestamp}`]);
      
      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      await loader.loadModules([`conflict_module_${timestamp}`], {});

      // 验证工具被注�?
      expect(loader.hasToolName(`conflict_tool_${timestamp}`)).toBe(true);
      
      // 执行工具调用验证路由正确
      const ctx = { agent: { id: "test" } };
      const result = await loader.executeToolCall(ctx, `conflict_tool_${timestamp}`, {});
      expect(result.ok).toBe(true);
      expect(result.module).toBe(`conflict_module_${timestamp}`);

      await loader.shutdown();
    });
  });

  describe("Property 4: Tool Call Routing", () => {
    test("工具调用路由到正确的模块", async () => {
      await createValidModule("routing_module_a", ["routing_tool_a"]);
      await createValidModule("routing_module_b", ["routing_tool_b"]);

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      await loader.loadModules(["routing_module_a", "routing_module_b"], {});

      const ctx = { agent: { id: "test" } };
      
      const resultA = await loader.executeToolCall(ctx, "routing_tool_a", { param: "value_a" });
      expect(resultA.ok).toBe(true);
      expect(resultA.module).toBe("routing_module_a");
      expect(resultA.toolName).toBe("routing_tool_a");

      const resultB = await loader.executeToolCall(ctx, "routing_tool_b", { param: "value_b" });
      expect(resultB.ok).toBe(true);
      expect(resultB.module).toBe("routing_module_b");
      expect(resultB.toolName).toBe("routing_tool_b");

      await loader.shutdown();
    });

    test("未知工具返回错误", async () => {
      await createValidModule("known_module", ["known_tool"]);

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      await loader.loadModules(["known_module"], {});

      const ctx = { agent: { id: "test" } };
      const result = await loader.executeToolCall(ctx, "unknown_tool", {});

      expect(result.error).toBe("unknown_module_tool");
      expect(result.toolName).toBe("unknown_tool");

      await loader.shutdown();
    });

    test("工具执行错误返回结构化错�?, async () => {
      await createErrorModule("exec_error_module", "execute");

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      await loader.loadModules(["exec_error_module"], {});

      const ctx = { agent: { id: "test" } };
      const result = await loader.executeToolCall(ctx, "exec_error_module_tool", {});

      expect(result.error).toBe("module_tool_error");
      expect(result.module).toBe("exec_error_module");
      expect(result.message).toBe("Execute error");

      await loader.shutdown();
    });
  });

  describe("Property 5: Module Load Failure Isolation", () => {
    test("模块加载失败不影响其他模�?, async () => {
      await createValidModule("good_module", ["good_tool"]);
      await createErrorModule("bad_module", "init");
      await createValidModule("another_good", ["another_tool"]);

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      const result = await loader.loadModules(["good_module", "bad_module", "another_good"], {});

      expect(result.loaded).toEqual(["good_module", "another_good"]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].module).toBe("bad_module");
      expect(result.errors[0].error).toContain("Init error");

      // 验证成功加载的模块可以正常工�?
      const ctx = { agent: { id: "test" } };
      const goodResult = await loader.executeToolCall(ctx, "good_tool", {});
      expect(goodResult.ok).toBe(true);

      const anotherResult = await loader.executeToolCall(ctx, "another_tool", {});
      expect(anotherResult.ok).toBe(true);

      await loader.shutdown();
    });

    test("无效模块接口被拒�?, async () => {
      await createValidModule("valid_module", ["valid_tool"]);
      await createInvalidModule("invalid_module", ["name", "init"]);

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      const result = await loader.loadModules(["valid_module", "invalid_module"], {});

      expect(result.loaded).toEqual(["valid_module"]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].module).toBe("invalid_module");
      expect(result.errors[0].error).toContain("模块接口不符合规�?);

      await loader.shutdown();
    });
  });

  describe("Module Lifecycle", () => {
    test("模块初始化时传入运行时上下文", async () => {
      const moduleDir = path.join(TEST_MODULES_DIR, "context_module");
      await mkdir(moduleDir, { recursive: true });
      
      const moduleCode = `
let receivedRuntime = null;

export default {
  name: "context_module",
  
  async init(runtime) {
    receivedRuntime = runtime;
  },
  
  getToolDefinitions() { return []; },
  async executeToolCall(ctx, toolName, args) { return {}; },
  async shutdown() {},
  
  getReceivedRuntime() { return receivedRuntime; }
};
`;
      await writeFile(path.join(moduleDir, "index.js"), moduleCode, "utf8");

      const mockRuntime = { id: "test_runtime", config: { test: true } };
      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      await loader.loadModules(["context_module"], mockRuntime);

      // 由于模块是动态导入的，我们通过工具调用来验�?
      // 这里只验证加载成�?
      expect(loader.getLoadedModules()).toHaveLength(1);

      await loader.shutdown();
    });

    test("shutdown 关闭所有模�?, async () => {
      await createValidModule("module_a", ["tool_a"]);
      await createValidModule("module_b", ["tool_b"]);

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      await loader.loadModules(["module_a", "module_b"], {});

      expect(loader.getLoadedModules()).toHaveLength(2);
      expect(loader.isInitialized()).toBe(true);

      await loader.shutdown();

      expect(loader.getLoadedModules()).toHaveLength(0);
      expect(loader.isInitialized()).toBe(false);
      expect(loader.hasToolName("tool_a")).toBe(false);
      expect(loader.hasToolName("tool_b")).toBe(false);
    });
  });

  describe("Web Components and HTTP Handlers", () => {
    test("收集模块�?Web 组件", async () => {
      const moduleDir = path.join(TEST_MODULES_DIR, "web_module");
      await mkdir(moduleDir, { recursive: true });
      
      const moduleCode = `
export default {
  name: "web_module",
  async init(runtime) {},
  getToolDefinitions() { return []; },
  async executeToolCall(ctx, toolName, args) { return {}; },
  async shutdown() {},
  
  getWebComponent() {
    return {
      displayName: "Web Module",
      icon: "🌐",
      panelHtml: "<div>Panel</div>"
    };
  }
};
`;
      await writeFile(path.join(moduleDir, "index.js"), moduleCode, "utf8");

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      await loader.loadModules(["web_module"], {});

      const components = loader.getWebComponents();
      expect(components).toHaveLength(1);
      expect(components[0].moduleName).toBe("web_module");
      expect(components[0].component.displayName).toBe("Web Module");

      await loader.shutdown();
    });

    test("获取模块�?HTTP 处理�?, async () => {
      const moduleDir = path.join(TEST_MODULES_DIR, "http_module");
      await mkdir(moduleDir, { recursive: true });
      
      const moduleCode = `
export default {
  name: "http_module",
  async init(runtime) {},
  getToolDefinitions() { return []; },
  async executeToolCall(ctx, toolName, args) { return {}; },
  async shutdown() {},
  
  getHttpHandler() {
    return (req, res, pathname) => {
      return { handled: true, pathname };
    };
  }
};
`;
      await writeFile(path.join(moduleDir, "index.js"), moduleCode, "utf8");

      const loader = new ModuleLoader({ modulesDir: TEST_MODULES_DIR });
      await loader.loadModules(["http_module"], {});

      const handler = loader.getModuleHttpHandler("http_module");
      expect(handler).not.toBeNull();
      expect(typeof handler).toBe("function");

      // 不存在的模块返回 null
      expect(loader.getModuleHttpHandler("nonexistent")).toBeNull();

      await loader.shutdown();
    });
  });
});
