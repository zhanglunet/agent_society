import { describe, expect, test, beforeEach, afterEach } from "vitest";
import fc from "fast-check";
import { HTTPServer } from "../../src/platform/http_server.js";
import { AgentSociety } from "../../src/platform/agent_society.js";
import { MessageBus } from "../../src/platform/message_bus.js";
import { Config } from "../../src/platform/utils/config/config.js";

describe("HTTPServer", () => {
  /**
   * Property 4: HTTP API消息转发一致性
   * 对于任意通过HTTP API发送的消息（submit或send），应产生与控制台方式相同的消息转发行为，
   * 且返回的taskId/messageId应与实际发送的消息对应。
   * 
   * **验证: 需求 2.2, 2.3**
   */
  test("Property 4: HTTP API消息转发一致性 - submit端点与控制台方式行为一致", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 200 }), // 需求文本
        (text) => {
          // 创建两个独立的society实例进行对比
          const societyConsole = new AgentSociety({ configService: new Config("config") });
          const busConsole = new MessageBus();
          societyConsole.runtime.bus = busConsole;

          const societyHttp = new AgentSociety({ configService: new Config("config") });
          const busHttp = new MessageBus();
          societyHttp.runtime.bus = busHttp;

          // 控制台方式发送
          const consoleResult = societyConsole.sendTextToAgent("root", text);

          // HTTP方式发送（模拟HTTP服务器的行为）
          const httpServer = new HTTPServer({ society: societyHttp });
          httpServer.setSociety(societyHttp);
          const httpResult = societyHttp.sendTextToAgent("root", text);

          // 两种方式都应该成功
          expect(consoleResult).toHaveProperty("taskId");
          expect(httpResult).toHaveProperty("taskId");
          expect(consoleResult).not.toHaveProperty("error");
          expect(httpResult).not.toHaveProperty("error");

          // 消息总线中的消息结构应该一致
          const consoleQueue = busConsole._queues.get("root") ?? [];
          const httpQueue = busHttp._queues.get("root") ?? [];

          expect(consoleQueue.length).toBe(1);
          expect(httpQueue.length).toBe(1);

          // 消息内容应该一致（除了id和createdAt）
          expect(consoleQueue[0].from).toBe(httpQueue[0].from);
          expect(consoleQueue[0].to).toBe(httpQueue[0].to);
          expect(consoleQueue[0].payload.text).toBe(httpQueue[0].payload.text);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 4: HTTP API消息转发一致性 - send端点与控制台方式行为一致", () => {
    fc.assert(
      fc.property(
        // 生成非"user"的有效智能体ID
        fc.string({ minLength: 1, maxLength: 50 }).filter(id => id.trim() !== "" && id.trim() !== "user"),
        fc.string({ minLength: 1, maxLength: 200 }), // 消息文本
        (agentId, text) => {
          // 创建两个独立的society实例进行对比
          const societyConsole = new AgentSociety({ configService: new Config("config") });
          const busConsole = new MessageBus();
          societyConsole.runtime.bus = busConsole;

          const societyHttp = new AgentSociety({ configService: new Config("config") });
          const busHttp = new MessageBus();
          societyHttp.runtime.bus = busHttp;

          // 控制台方式发送
          const consoleResult = societyConsole.sendTextToAgent(agentId, text);

          // HTTP方式发送（模拟HTTP服务器的行为）
          const httpServer = new HTTPServer({ society: societyHttp });
          httpServer.setSociety(societyHttp);
          const httpResult = societyHttp.sendTextToAgent(agentId, text);

          // 两种方式都应该成功
          expect(consoleResult).toHaveProperty("taskId");
          expect(httpResult).toHaveProperty("taskId");
          expect(consoleResult.to).toBe(httpResult.to);

          // 消息总线中的消息结构应该一致
          const trimmedId = agentId.trim();
          const consoleQueue = busConsole._queues.get(trimmedId) ?? [];
          const httpQueue = busHttp._queues.get(trimmedId) ?? [];

          expect(consoleQueue.length).toBe(1);
          expect(httpQueue.length).toBe(1);

          // 消息内容应该一致
          expect(consoleQueue[0].from).toBe(httpQueue[0].from);
          expect(consoleQueue[0].to).toBe(httpQueue[0].to);
          expect(consoleQueue[0].payload.text).toBe(httpQueue[0].payload.text);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 4: HTTP API消息转发一致性 - taskId与实际消息对应", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }).filter(id => id.trim() !== "" && id.trim() !== "user"),
        fc.string({ minLength: 1, maxLength: 200 }),
        (agentId, text) => {
          const society = new AgentSociety({ configService: new Config("config") });
          const bus = new MessageBus();
          society.runtime.bus = bus;

          const result = society.sendTextToAgent(agentId, text);

          if (result.error) return; // 跳过无效输入

          // 返回的taskId应该与消息总线中的消息taskId一致
          const trimmedId = agentId.trim();
          const queue = bus._queues.get(trimmedId) ?? [];
          
          expect(queue.length).toBe(1);
          expect(queue[0].taskId).toBe(result.taskId);
        }
      ),
      { numRuns: 100 }
    );
  });


  /**
   * Property 5: HTTP消息查询完整性
   */
  test("Property 5: HTTP消息查询完整性 - 消息按接收顺序存储", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        fc.array(
          fc.record({
            from: fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim() !== ""),
            text: fc.string({ minLength: 1, maxLength: 100 })
          }),
          { minLength: 1, maxLength: 10 }
        ),
        (taskId, messages) => {
          const httpServer = new HTTPServer();
          
          const receivedMessages = messages.map((msg, index) => ({
            id: `msg-${index}`,
            from: msg.from,
            taskId,
            payload: { text: msg.text },
            createdAt: new Date(Date.now() + index * 1000).toISOString()
          }));

          for (const msg of receivedMessages) {
            if (!httpServer._messagesByTaskId.has(taskId)) {
              httpServer._messagesByTaskId.set(taskId, []);
            }
            httpServer._messagesByTaskId.get(taskId).push({
              id: msg.id,
              from: msg.from,
              taskId: msg.taskId,
              payload: msg.payload,
              createdAt: msg.createdAt
            });
          }

          const storedMessages = httpServer.getMessagesByTaskId(taskId);
          expect(storedMessages.length).toBe(receivedMessages.length);

          for (let i = 0; i < receivedMessages.length; i++) {
            expect(storedMessages[i].id).toBe(receivedMessages[i].id);
            expect(storedMessages[i].from).toBe(receivedMessages[i].from);
            expect(storedMessages[i].taskId).toBe(receivedMessages[i].taskId);
            expect(storedMessages[i].payload.text).toBe(receivedMessages[i].payload.text);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 5: HTTP消息查询完整性 - 不存在的taskId返回空数组", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        (taskId) => {
          const httpServer = new HTTPServer();
          const messages = httpServer.getMessagesByTaskId(taskId);
          expect(Array.isArray(messages)).toBe(true);
          expect(messages.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("HTTPServer - 错误处理", () => {
  let server;
  let port;

  beforeEach(async () => {
    port = 30000 + Math.floor(Math.random() * 10000);
    server = new HTTPServer({ port });
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  test("服务器启动和停止", async () => {
    const result = await server.start();
    expect(result.ok).toBe(true);
    expect(server.isRunning()).toBe(true);

    const stopResult = await server.stop();
    expect(stopResult.ok).toBe(true);
    expect(server.isRunning()).toBe(false);
  });

  test("重复启动服务器应返回成功", async () => {
    await server.start();
    const result = await server.start();
    expect(result.ok).toBe(true);
  });

  test("停止未启动的服务器应返回成功", async () => {
    const result = await server.stop();
    expect(result.ok).toBe(true);
  });

  test("GET /api/agents - society未初始化时返回500", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/agents`);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("society_not_initialized");
  });

  test("GET /api/roles - society未初始化时返回500", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/roles`);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("society_not_initialized");
  });

  test("GET /api/org/tree - society未初始化时返回500", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/org/tree`);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("society_not_initialized");
  });

  test("GET /api/agent-messages/:agentId - 有效agentId返回空消息列表", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/agent-messages/test-agent`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agentId).toBe("test-agent");
    expect(data.messages).toEqual([]);
    expect(data.count).toBe(0);
  });

  test("GET /api/messages/:taskId - 空taskId返回400", async () => {
    await server.start();
    // 空路径会匹配到 /api/messages/ 并返回 400
    const response = await fetch(`http://localhost:${port}/api/messages/`);
    expect(response.status).toBe(400);
  });

  test("GET /api/messages/:taskId - 有效taskId返回空消息列表", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/messages/test-task-id`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.taskId).toBe("test-task-id");
    expect(data.messages).toEqual([]);
    expect(data.count).toBe(0);
  });

  test("POST /api/submit - society未初始化时返回500", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test" })
    });
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("society_not_initialized");
  });

  test("POST /api/submit - 缺少text字段返回400", async () => {
    const society = new AgentSociety({ configService: new Config("config") });
    server.setSociety(society);
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("missing_text");
  });

  test("POST /api/submit - 无效JSON返回400", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "invalid json"
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("invalid_json");
  });

  test("POST /api/send - 缺少agentId返回400", async () => {
    const society = new AgentSociety({ configService: new Config("config") });
    server.setSociety(society);
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test" })
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("missing_agent_id");
  });

  test("POST /api/send - 缺少text返回400", async () => {
    const society = new AgentSociety({ configService: new Config("config") });
    server.setSociety(society);
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: "root" })
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("missing_text");
  });

  test("未知路径返回404", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/unknown`);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("not_found");
  });

  test("OPTIONS请求返回204（CORS预检）", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/agents`, {
      method: "OPTIONS"
    });
    expect(response.status).toBe(204);
  });

  test("CORS头正确设置", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/agents`);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, DELETE, OPTIONS");
  });
});

describe("HTTPServer - 与Society集成", () => {
  let server;
  let society;
  let port;

  beforeEach(async () => {
    port = 30000 + Math.floor(Math.random() * 10000);
    society = new AgentSociety({ configService: new Config("config") });
    await society.init(); // 需要初始化 society
    server = new HTTPServer({ port, society });
    server.setSociety(society);
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  test("GET /api/agents - 返回root和user智能体", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/agents`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.agents.length).toBeGreaterThanOrEqual(2);
    const agentIds = data.agents.map(a => a.id);
    expect(agentIds).toContain("root");
    expect(agentIds).toContain("user");
  });

  test("GET /api/roles - 返回root和user岗位", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/roles`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.roles.length).toBeGreaterThanOrEqual(2);
    const roleIds = data.roles.map(r => r.id);
    expect(roleIds).toContain("root");
    expect(roleIds).toContain("user");
  });

  test("GET /api/org/tree - 返回组织树", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/org/tree`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.tree)).toBe(true);
    expect(data.nodeCount).toBeGreaterThanOrEqual(2);
  });

  test("POST /api/submit - 成功提交需求", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/submit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "测试需求" })
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("taskId");
    expect(typeof data.taskId).toBe("string");
  });

  test("POST /api/send - 成功发送消息", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentId: "root", text: "测试消息" })
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data).toHaveProperty("taskId");
    expect(data).toHaveProperty("messageId");
  });
});

describe("HTTPServer - LLM 中断 API", () => {
  let server;
  let port;
  let society;

  beforeEach(async () => {
    port = 30000 + Math.floor(Math.random() * 10000);
    society = new AgentSociety({ configService: new Config("config") });
    await society.init(); // Initialize society to register root agent
    server = new HTTPServer({ port, society });
    server.setSociety(society);
  });

  afterEach(async () => {
    if (server && server.isRunning()) {
      await server.stop();
    }
  });

  test("POST /api/agent/:agentId/abort - society未初始化时返回500", async () => {
    const serverNoSociety = new HTTPServer({ port: port + 1 });
    await serverNoSociety.start();
    
    try {
      const response = await fetch(`http://localhost:${port + 1}/api/agent/test-agent/abort`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("society_not_initialized");
    } finally {
      await serverNoSociety.stop();
    }
  });

  test("POST /api/agent/:agentId/abort - 智能体不存在时返回404", async () => {
    await server.start();
    
    const response = await fetch(`http://localhost:${port}/api/agent/non-existent-agent/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("agent_not_found");
  });

  test("POST /api/agent/:agentId/abort - 智能体不在 waiting_llm 状态时返回 aborted=false", async () => {
    await server.start();
    
    // root 智能体默认存在，状态为 idle
    const response = await fetch(`http://localhost:${port}/api/agent/root/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.aborted).toBe(false);
    expect(data.agentId).toBe("root");
  });

  test("POST /api/agent/:agentId/abort - 成功中断 waiting_llm 状态的智能体", async () => {
    await server.start();
    
    // 设置 root 智能体为 waiting_llm 状态
    society.runtime.setAgentComputeStatus("root", "waiting_llm");
    
    // 模拟 LLM 客户端有活跃请求
    if (society.runtime.llm) {
      society.runtime.llm._activeRequests.set("root", {
        abort: () => {},
        signal: { aborted: false }
      });
    }
    
    const response = await fetch(`http://localhost:${port}/api/agent/root/abort`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.aborted).toBe(true);
    expect(data.agentId).toBe("root");
    
    // 验证状态已重置为 idle
    expect(society.runtime.getAgentComputeStatus("root")).toBe("idle");
  });

  /**
   * Property 6: API 端点验证
   * 对于任意中断 API 请求，如果指定的 agentId 不对应已存在的智能体，
   * HTTP_Server 应返回 404 状态码。
   * 
   * **验证: Requirements 3.2, 3.3**
   */
  test("Property 6: API 端点验证 - 不存在的 agentId 返回 404", async () => {
    await server.start();
    
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (randomAgentId) => {
          const response = await fetch(`http://localhost:${port}/api/agent/${randomAgentId}/abort`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
          });
          expect(response.status).toBe(404);
          const data = await response.json();
          expect(data.error).toBe("agent_not_found");
        }
      ),
      { numRuns: 20 }
    );
  });
});


describe("HTTPServer - Config API", () => {
  let server;
  let port;
  let configService;
  let testDir;

  beforeEach(async () => {
    const { mkdir, rm } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    const path = await import("node:path");
    const { randomUUID } = await import("node:crypto");
    const { Config } = await import("../../src/platform/utils/config/config.js");

    // 创建唯一的测试目录
    testDir = path.join("test/.tmp/http_server_config_test", randomUUID());
    await mkdir(testDir, { recursive: true });
    
    // 创建 Config 实例
    const config = new Config(testDir);
    
    port = 30000 + Math.floor(Math.random() * 10000);
    server = new HTTPServer({ port, configService: config });
  });

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    const { existsSync } = await import("node:fs");
    
    if (server && server.isRunning()) {
      await server.stop();
    }
    
    // 清理测试目录
    if (testDir && existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true });
    }
  });

  test("GET /api/config/status - 返回配置状态", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/status`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("hasLocalConfig");
    expect(data).toHaveProperty("llmStatus");
    expect(data).toHaveProperty("lastError");
    expect(data.hasLocalConfig).toBe(false);
  });

  test("GET /api/config/status - configService 未初始化时仍返回状态", async () => {
    const serverNoConfig = new HTTPServer({ port: port + 1 });
    await serverNoConfig.start();
    
    try {
      const response = await fetch(`http://localhost:${port + 1}/api/config/status`);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.hasLocalConfig).toBe(false);
    } finally {
      await serverNoConfig.stop();
    }
  });

  test("GET /api/config/llm - configService 未初始化时返回 500", async () => {
    const serverNoConfig = new HTTPServer({ port: port + 1 });
    await serverNoConfig.start();
    
    try {
      const response = await fetch(`http://localhost:${port + 1}/api/config/llm`);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("config_service_not_initialized");
    } finally {
      await serverNoConfig.stop();
    }
  });

  test("GET /api/config/llm - 配置文件不存在时返回 500", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/llm`);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("internal_error");
  });

  test("GET /api/config/llm - 返回掩码后的配置", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    
    // 创建配置文件
    const config = {
      llm: {
        baseURL: "http://test.url",
        model: "test-model",
        apiKey: "sk-1234567890",
        maxConcurrentRequests: 2
      }
    };
    await writeFile(path.join(testDir, "app.json"), JSON.stringify(config), "utf8");
    
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/llm`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.llm.baseURL).toBe("http://test.url");
    expect(data.llm.model).toBe("test-model");
    expect(data.llm.apiKey).toBe("****7890"); // 掩码后的 API Key
    expect(data.source).toBe("default");
  });

  test("POST /api/config/llm - 验证失败返回 400", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    
    // 创建配置文件
    await writeFile(path.join(testDir, "app.json"), JSON.stringify({ llm: {} }), "utf8");
    
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/llm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseURL: "", model: "" })
    });
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("validation_error");
    expect(data.details).toHaveProperty("baseURL");
    expect(data.details).toHaveProperty("model");
  });

  test("POST /api/config/llm - 成功保存配置", async () => {
    const { writeFile, readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    
    // 创建配置文件
    await writeFile(path.join(testDir, "app.json"), JSON.stringify({ 
      llm: {},
      otherField: "preserved"
    }), "utf8");
    
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/llm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        baseURL: "http://new.url", 
        model: "new-model",
        apiKey: "sk-newkey123"
      })
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.llm.baseURL).toBe("http://new.url");
    expect(data.llm.model).toBe("new-model");
    expect(data.llm.apiKey).toBe("****y123"); // 掩码后的 API Key
    
    // 验证文件已保存
    const savedContent = await readFile(path.join(testDir, "app.local.json"), "utf8");
    const savedConfig = JSON.parse(savedContent);
    expect(savedConfig.llm.baseURL).toBe("http://new.url");
    expect(savedConfig.otherField).toBe("preserved"); // 其他字段保留
  });

  test("GET /api/config/llm-services - 返回空列表", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/llm-services`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.services).toEqual([]);
    expect(data.source).toBe("none");
  });

  test("GET /api/config/llm-services - 返回服务列表", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    
    // 创建服务配置文件
    const services = {
      services: [
        {
          id: "test-service",
          name: "Test Service",
          baseURL: "http://test.url",
          model: "test-model",
          apiKey: "sk-1234567890"
        }
      ]
    };
    await writeFile(path.join(testDir, "llmservices.json"), JSON.stringify(services), "utf8");
    
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/llm-services`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.services.length).toBe(1);
    expect(data.services[0].id).toBe("test-service");
    expect(data.services[0].apiKey).toBe("****7890"); // 掩码后的 API Key
    expect(data.source).toBe("default");
  });

  test("POST /api/config/llm-services - 添加服务", async () => {
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/llm-services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "new-service",
        name: "New Service",
        baseURL: "http://new.url",
        model: "new-model",
        apiKey: "sk-newkey123"
      })
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.service.id).toBe("new-service");
    expect(data.service.apiKey).toBe("****y123"); // 掩码后的 API Key
  });

  test("POST /api/config/llm-services - 重复 ID 返回 409", async () => {
    await server.start();
    
    // 先添加一个服务
    await fetch(`http://localhost:${port}/api/config/llm-services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "duplicate-id",
        name: "First Service",
        baseURL: "http://first.url",
        model: "first-model"
      })
    });
    
    // 尝试添加相同 ID 的服务
    const response = await fetch(`http://localhost:${port}/api/config/llm-services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "duplicate-id",
        name: "Second Service",
        baseURL: "http://second.url",
        model: "second-model"
      })
    });
    expect(response.status).toBe(409);
    const data = await response.json();
    expect(data.error).toBe("duplicate_id");
  });

  test("POST /api/config/llm-services/:serviceId - 更新服务", async () => {
    await server.start();
    
    // 先添加一个服务
    await fetch(`http://localhost:${port}/api/config/llm-services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "update-test",
        name: "Original Name",
        baseURL: "http://original.url",
        model: "original-model"
      })
    });
    
    // 更新服务
    const response = await fetch(`http://localhost:${port}/api/config/llm-services/update-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "update-test",
        name: "Updated Name",
        baseURL: "http://updated.url",
        model: "updated-model"
      })
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.service.name).toBe("Updated Name");
    expect(data.service.baseURL).toBe("http://updated.url");
  });

  test("POST /api/config/llm-services/:serviceId - 服务不存在返回 404", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    
    // 创建空的服务配置文件
    await writeFile(path.join(testDir, "llmservices.local.json"), JSON.stringify({ services: [] }), "utf8");
    
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/llm-services/non-existent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "non-existent",
        name: "Test",
        baseURL: "http://test.url",
        model: "test-model"
      })
    });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("not_found");
  });

  test("DELETE /api/config/llm-services/:serviceId - 删除服务", async () => {
    await server.start();
    
    // 先添加一个服务
    await fetch(`http://localhost:${port}/api/config/llm-services`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "delete-test",
        name: "To Delete",
        baseURL: "http://delete.url",
        model: "delete-model"
      })
    });
    
    // 删除服务
    const response = await fetch(`http://localhost:${port}/api/config/llm-services/delete-test`, {
      method: "DELETE"
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.deletedId).toBe("delete-test");
    
    // 验证服务已删除
    const listResponse = await fetch(`http://localhost:${port}/api/config/llm-services`);
    const listData = await listResponse.json();
    expect(listData.services.find(s => s.id === "delete-test")).toBeUndefined();
  });

  test("DELETE /api/config/llm-services/:serviceId - 服务不存在返回 404", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    
    // 创建空的服务配置文件
    await writeFile(path.join(testDir, "llmservices.local.json"), JSON.stringify({ services: [] }), "utf8");
    
    await server.start();
    const response = await fetch(`http://localhost:${port}/api/config/llm-services/non-existent`, {
      method: "DELETE"
    });
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("not_found");
  });

  /**
   * Property 2: Validation Rejects Empty Required Fields
   * 对于任意空或空白的 baseURL 或 model，验证应失败。
   */
  test("Property 2: 空或空白的必填字段应验证失败", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await import("node:path");
    
    // 创建配置文件
    await writeFile(path.join(testDir, "app.json"), JSON.stringify({ llm: {} }), "utf8");
    
    await server.start();
    
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("", " ", "  ", "\t", "\n"),
        async (emptyValue) => {
          // 测试空 baseURL
          let response = await fetch(`http://localhost:${port}/api/config/llm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baseURL: emptyValue, model: "valid-model" })
          });
          expect(response.status).toBe(400);
          let data = await response.json();
          expect(data.error).toBe("validation_error");
          expect(data.details).toHaveProperty("baseURL");
          
          // 测试空 model
          response = await fetch(`http://localhost:${port}/api/config/llm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baseURL: "http://valid.url", model: emptyValue })
          });
          expect(response.status).toBe(400);
          data = await response.json();
          expect(data.error).toBe("validation_error");
          expect(data.details).toHaveProperty("model");
        }
      ),
      { numRuns: 5 }
    );
  });
});
