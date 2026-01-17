import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/runtime.js";
import { Agent } from "../../src/agents/agent.js";
import { createWriterBehavior } from "../../src/agents/behaviors.js";
import { Logger, normalizeLoggingConfig } from "../../src/platform/logger.js";
import { LlmClient } from "../../src/platform/llm_client.js";

describe("Runtime", () => {
  test("dispatches message to agent behavior and writes artifact", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_test_runtime");
    const artifactsDir = path.resolve(process.cwd(), "test/.tmp/artifacts_test_runtime");
    await rm(tmpDir, { recursive: true, force: true });
    await rm(artifactsDir, { recursive: true, force: true });

    await mkdir(tmpDir, { recursive: true });
    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify(
        { promptsDir: "config/prompts", artifactsDir: "test/.tmp/artifacts_test_runtime", runtimeDir: "test/.tmp/runtime_test_runtime", maxSteps: 50 },
        null,
        2
      ),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();
    runtime.registerRoleBehavior("writer", () => createWriterBehavior());

    const writerRole = await runtime.org.createRole({ name: "writer", rolePrompt: "p" });
    const writer = await runtime.spawnAgent({ roleId: writerRole.id, parentAgentId: "root" });

    let received = null;
    const user = new Agent({
      id: "user",
      roleId: "user",
      roleName: "user",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        received = msg;
      }
    });
    runtime.registerAgentInstance(user);

    runtime.bus.send({ to: writer.id, from: user.id, taskId: "t1", payload: { kind: "task", text: "hello" } });
    await runtime.run();

    expect(received).toBeTruthy();
    expect(received.payload?.kind).toBe("result");
    expect(String(received.payload?.artifactRef ?? "")).toMatch(/^artifact:/);
    const artifact = await runtime.artifacts.getArtifact(received.payload.artifactRef);
    expect(artifact.content).toContain("平台只提供能力");
  });

  test("writes logs to both console and file when enabled", async () => {
    const baseDir = path.resolve(process.cwd(), "test/.tmp/runtime_log_test");
    const artifactsDir = path.resolve(baseDir, "artifacts");
    const stateDir = path.resolve(baseDir, "state");
    const logsDir = path.resolve(baseDir, "logs");
    await rm(baseDir, { recursive: true, force: true });
    await mkdir(baseDir, { recursive: true });

    const loggingConfigPath = path.resolve(baseDir, "logging.json");
    await writeFile(
      loggingConfigPath,
      JSON.stringify(
        {
          enabled: true,
          logsDir,
          defaultLevel: "info",
          levels: { runtime: "debug", bus: "debug", org: "info", artifacts: "info", prompts: "warn", llm: "info", society: "info" }
        },
        null,
        2
      ),
      "utf8"
    );

    const configPath = path.resolve(baseDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify(
        {
          promptsDir: "config/prompts",
          artifactsDir,
          runtimeDir: stateDir,
          loggingConfigPath
        },
        null,
        2
      ),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();
    await runtime.log.info("TEST_LOG_LINE", { ok: true });
    await runtime.log.info("AGENT_LOG_LINE", { agentId: "a1", ok: true });
    runtime.bus.send({ to: "receiver-1", from: "sender-1", taskId: "t-msg", payload: { text: "hello-bus" } });
    runtime.bus.receiveNext("receiver-1");
    await new Promise((r) => setTimeout(r, 10));

    const runs = await readdir(logsDir);
    expect(runs.length).toBeGreaterThan(0);
    const runDir = path.resolve(logsDir, runs[0]);
    const logPath = path.resolve(runDir, "system.log");
    const content = await readFile(logPath, "utf8");
    expect(content).toContain("TEST_LOG_LINE");
    expect(content).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}Z \[INFO\] \[runtime\] TEST_LOG_LINE/);
    expect(content).toContain("TEST_LOG_LINE\n{");
    expect(content).toContain('"ok": true');

    const agentPath = path.resolve(runDir, "agent-a1.log");
    const agentContent = await readFile(agentPath, "utf8");
    expect(agentContent).toContain("AGENT_LOG_LINE");

    expect(content).toContain("发送消息");
    expect(content).toContain("接收消息");
    expect(content).toContain("hello-bus");

    const senderPath = path.resolve(runDir, "agent-sender-1.log");
    const senderContent = await readFile(senderPath, "utf8");
    expect(senderContent).toContain("发送消息");
    expect(senderContent).toContain("hello-bus");

    const receiverPath = path.resolve(runDir, "agent-receiver-1.log");
    const receiverContent = await readFile(receiverPath, "utf8");
    expect(receiverContent).toContain("接收消息");
    expect(receiverContent).toContain("hello-bus");
  });

  test("logs LLM response without request message history", async () => {
    const baseDir = path.resolve(process.cwd(), "test/.tmp/llm_log_test");
    const logsDir = path.resolve(baseDir, "logs");
    await rm(baseDir, { recursive: true, force: true });
    await mkdir(baseDir, { recursive: true });

    const loggerRoot = new Logger(
      normalizeLoggingConfig({
        enabled: true,
        logsDir,
        defaultLevel: "info",
        levels: { llm: "info" }
      })
    );

    const llm = new LlmClient({
      baseURL: "http://127.0.0.1:0/v1",
      model: "test-model",
      apiKey: "NOT_NEEDED",
      logger: loggerRoot.forModule("llm")
    });

    llm._client = {
      chat: {
        completions: {
          create: async () => ({
            choices: [{ message: { role: "assistant", content: "ok" } }]
          })
        }
      }
    };

    await llm.chat({
      messages: [
        { role: "user", content: "old" },
        { role: "user", content: "hello" }
      ],
      tools: [{ type: "function", function: { name: "t", parameters: { type: "object", properties: {} } } }],
      temperature: 0.2,
      meta: { agentId: "a1" }
    });

    const runs = await readdir(logsDir);
    expect(runs.length).toBeGreaterThan(0);
    const runDir = path.resolve(logsDir, runs[0]);
    const logPath = path.resolve(runDir, "system.log");
    const content = await readFile(logPath, "utf8");
    expect(content).toContain("LLM 请求内容");
    expect(content).toContain("hello");
    expect(content).not.toContain("old");
    expect(content).toContain("LLM 响应内容");
    expect(content).toContain("ok");

    const agentPath = path.resolve(runDir, "agent-a1.log");
    const agentContent = await readFile(agentPath, "utf8");
    expect(agentContent).toContain("LLM 响应内容");
    expect(agentContent).toContain("ok");
  });

  test("defaults parentAgentId and enforces root single agent per taskId", async () => {
    const runtime = new Runtime();
    const roles = new Map([
      ["r-parent", { id: "r-parent", createdBy: null }],
      ["r1", { id: "r1", createdBy: "root" }],
      ["r2", { id: "r2", createdBy: "root" }],
      ["r3", { id: "r3", createdBy: "agent-1" }]
    ]);
    runtime.org = { getRole: (roleId) => roles.get(String(roleId)) ?? null };

    // 初始化 root 的联系人注册表
    runtime.contactManager.initRegistry("root", null, []);

    // 有效的 TaskBrief
    const validTaskBrief = {
      objective: "测试目标",
      constraints: ["约束1"],
      inputs: "输入说明",
      outputs: "输出要求",
      completion_criteria: "完成标准"
    };

    let calls = 0;
    let lastInput = null;
    const ctxRoot = {
      agent: { id: "root" },
      currentMessage: { taskId: "t1" },
      tools: {
        spawnAgent: async (input) => {
          calls += 1;
          lastInput = input;
          return { id: `a${calls}`, roleId: input.roleId, roleName: "role" };
        }
      }
    };

    const r1 = await runtime.executeToolCall(ctxRoot, "spawn_agent", { roleId: "r1", parentAgentId: "null", taskBrief: validTaskBrief });
    const r2 = await runtime.executeToolCall(ctxRoot, "spawn_agent", { roleId: "r1", taskBrief: validTaskBrief });
    expect(calls).toBe(1);
    expect(lastInput.parentAgentId).toBe("root");
    expect(r1.id).toBe(r2.id);

    const reused = await runtime.executeToolCall(ctxRoot, "spawn_agent", { roleId: "r2", taskBrief: validTaskBrief });
    expect(calls).toBe(1);
    expect(reused.id).toBe(r1.id);

    // 初始化 agent-1 的联系人注册表
    runtime.contactManager.initRegistry("agent-1", "root", []);

    let childParent = null;
    let childCalls = 0;
    const ctxAgent = {
      agent: { id: "agent-1", roleId: "r-parent" },
      currentMessage: { taskId: "t2" },
      tools: {
        spawnAgent: async (input) => {
          childCalls += 1;
          childParent = input.parentAgentId;
          return { id: "child-1", roleId: input.roleId, roleName: "role" };
        }
      }
    };
    await runtime.executeToolCall(ctxAgent, "spawn_agent", { roleId: "r3", taskBrief: validTaskBrief });
    expect(childParent).toBe("agent-1");

    const badParent = await runtime.executeToolCall(ctxAgent, "spawn_agent", { roleId: "r3", parentAgentId: "someone-else", taskBrief: validTaskBrief });
    expect(badParent.error).toBe("invalid_parentAgentId");

    const sameRole = await runtime.executeToolCall(ctxAgent, "spawn_agent", { roleId: "r-parent", taskBrief: validTaskBrief });
    expect(sameRole.error).toBe("not_child_role");
    expect(childCalls).toBe(1);
  });

  test("LLM without tool_calls ends message processing naturally", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_no_tool_calls_test");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({ promptsDir: "config/prompts", artifactsDir: "test/.tmp/artifacts_no_tool_calls_test", runtimeDir: tmpDir }, null, 2), "utf8");

    const runtime = new Runtime({ configPath, maxToolRounds: 5 });
    await runtime.init();

    let llmCalled = 0;
    runtime.llm = {
      chat: async () => {
        llmCalled += 1;
        if (llmCalled > 1) throw new Error("LLM should not be called again after no tool_calls response");
        return {
          role: "assistant",
          content: "任务已完成，等待下一条消息。",
          tool_calls: [] // 没有 tool_calls，应该自然结束
        };
      }
    };

    const a = new Agent({
      id: "a1",
      roleId: "r1",
      roleName: "r1",
      rolePrompt: "",
      behavior: async (ctx, msg) => await ctx.runtime._handleWithLlm(ctx, msg)
    });
    runtime.registerAgentInstance(a);

    runtime.bus.send({ to: "a1", from: "user", taskId: "t-no-tools", payload: { text: "x" } });
    await runtime.run();

    expect(llmCalled).toBe(1);
  });

  test("builds root system prompt without base/compose and without message content", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_root_prompt_isolation_test");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({ promptsDir: "config/prompts", artifactsDir: "test/.tmp/artifacts_root_prompt_isolation_test", runtimeDir: tmpDir }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();
    runtime.systemBasePrompt = "BASE_PROMPT";
    runtime.systemComposeTemplate = "{{BASE}}|{{ROLE}}|{{TASK}}";
    runtime.systemToolRules = "TOOL_RULES";

    let capturedSystem = null;
    let capturedUser = null;
    runtime.llm = {
      chat: async ({ messages }) => {
        capturedSystem = messages?.[0]?.content ?? null;
        capturedUser = messages?.[1]?.content ?? null;
        return { role: "assistant", content: "ok" };
      }
    };

    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "ROOT_PROMPT",
      behavior: async (ctx, msg) => await ctx.runtime._handleWithLlm(ctx, msg)
    });
    runtime.registerAgentInstance(root);

    runtime.bus.send({ to: "root", from: "user", taskId: "t-root", payload: { text: "REQ_TEXT" } });
    await runtime.run();

    expect(capturedSystem).toContain("ROOT_PROMPT");
    expect(capturedSystem).not.toContain("TOOL_RULES");
    expect(capturedSystem).not.toContain("BASE_PROMPT");
    expect(capturedSystem).not.toContain("REQ_TEXT");

    expect(capturedUser).toContain("REQ_TEXT");
  });

  test("builds non-root system prompt from base/role template without message content", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_agent_prompt_isolation_test");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({ promptsDir: "config/prompts", artifactsDir: "test/.tmp/artifacts_agent_prompt_isolation_test", runtimeDir: tmpDir }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();
    runtime.systemBasePrompt = "BASE_PROMPT";
    runtime.systemComposeTemplate = "{{BASE}}|{{ROLE}}|{{TASK}}";
    runtime.systemToolRules = "TOOL_RULES";

    let capturedSystem = null;
    let capturedUser = null;
    runtime.llm = {
      chat: async ({ messages }) => {
        capturedSystem = messages?.[0]?.content ?? null;
        capturedUser = messages?.[1]?.content ?? null;
        return { role: "assistant", content: "ok" };
      }
    };

    const a = new Agent({
      id: "a1",
      roleId: "r1",
      roleName: "r1",
      rolePrompt: "ROLE_PROMPT",
      behavior: async (ctx, msg) => await ctx.runtime._handleWithLlm(ctx, msg)
    });
    runtime.registerAgentInstance(a);

    runtime.bus.send({ to: "a1", from: "user", taskId: "t-a1", payload: { text: "TASK_TEXT" } });
    await runtime.run();

    expect(capturedSystem).toContain("BASE_PROMPT");
    expect(capturedSystem).toContain("ROLE_PROMPT");
    expect(capturedSystem).toContain("TOOL_RULES");
    expect(capturedSystem).not.toContain("TASK_TEXT");

    expect(capturedUser).toContain("TASK_TEXT");
  });

  test("run_javascript executes code in Function and returns JSON-serializable result", async () => {
    const runtime = new Runtime();
    const ctx = { agent: { id: "a1" }, tools: {} };

    const r1 = await runtime.executeToolCall(ctx, "run_javascript", { code: "return input.x + 1;", input: { x: 2 } });
    expect(r1).toBe(3);

    const r2 = await runtime.executeToolCall(ctx, "run_javascript", { code: "return Promise.resolve(input.x * 2);", input: { x: 3 } });
    expect(r2).toBe(6);
  });

  test("run_javascript blocks obvious system-related identifiers", async () => {
    const runtime = new Runtime();
    const ctx = { agent: { id: "a1" }, tools: {} };

    const r = await runtime.executeToolCall(ctx, "run_javascript", { code: "return typeof process;" });
    expect(r.error).toBe("blocked_code");
    expect(r.blocked).toContain("process");
  });

  test("run_javascript rejects non-JSON-serializable returns", async () => {
    const runtime = new Runtime();
    const ctx = { agent: { id: "a1" }, tools: {} };

    const r = await runtime.executeToolCall(ctx, "run_javascript", { code: "return 1n;" });
    expect(r.error).toBe("non_json_serializable_return");
  });
});


/**
 * Property 6: 智能体终止完整性
 * 对于任意被终止的智能体，终止后应满足：
 * (1) 不在活跃智能体注册表中
 * (2) 会话上下文已被清理
 * (3) 终止事件已持久化到组织状态
 * 
 * **验证: 需求 3.1, 3.2, 3.3**
 */
import fc from "fast-check";

describe("Runtime - Agent Termination", () => {
  test("Property 6: 智能体终止完整性 - 终止后智能体从注册表移除且上下文清理", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/terminate_test_prop6`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建一个根智能体
    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(root);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim() !== "" && !s.includes("/") && !s.includes("\\")),
        fc.string({ minLength: 1, maxLength: 50 }),
        async (roleName, reason) => {
          // 创建岗位
          const role = await runtime.org.createRole({ name: `role_${roleName}_${Date.now()}`, rolePrompt: "test", createdBy: "root" });

          // 创建子智能体
          const child = await runtime.spawnAgent({ roleId: role.id, parentAgentId: "root" });
          const childId = child.id;

          // 确保智能体已注册
          expect(runtime._agents.has(childId)).toBe(true);

          // 初始化会话上下文
          runtime._conversations.set(childId, [{ role: "system", content: "test" }]);
          expect(runtime._conversations.has(childId)).toBe(true);

          // 执行终止
          const ctx = { agent: root };
          const result = await runtime._executeTerminateAgent(ctx, { agentId: childId, reason });

          // 验证终止成功
          expect(result.ok).toBe(true);
          expect(result.terminatedAgentId).toBe(childId);

          // 验证智能体从注册表移除
          expect(runtime._agents.has(childId)).toBe(false);

          // 验证会话上下文已清理
          expect(runtime._conversations.has(childId)).toBe(false);

          // 验证元数据已清理
          expect(runtime._agentMetaById.has(childId)).toBe(false);

          // 验证终止事件已持久化
          expect(runtime.org._terminations.length).toBeGreaterThan(0);
          const termination = runtime.org._terminations.find(t => t.agentId === childId);
          expect(termination).toBeDefined();
          expect(termination.terminatedBy).toBe("root");
          expect(termination.reason).toBe(reason);
        }
      ),
      { numRuns: 100 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });
});


/**
 * Property 7: 智能体终止权限验证
 * 对于任意terminate_agent调用，只有当调用者是目标智能体的父智能体时才应成功；否则应返回错误。
 * 
 * **验证: 需求 3.4**
 */
describe("Runtime - Agent Termination Permission", () => {
  test("Property 7: 智能体终止权限验证 - 只有父智能体可以终止子智能体", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/terminate_perm_test_prop7`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建根智能体
    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(root);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => s.trim() !== "" && !s.includes("/") && !s.includes("\\")),
        async (roleName) => {
          // 创建岗位
          const role = await runtime.org.createRole({ name: `role_perm_${roleName}_${Date.now()}`, rolePrompt: "test", createdBy: "root" });

          // 创建子智能体（由root创建）
          const child = await runtime.spawnAgent({ roleId: role.id, parentAgentId: "root" });
          const childId = child.id;

          // 创建另一个非父智能体
          const otherRole = await runtime.org.createRole({ name: `other_${roleName}_${Date.now()}`, rolePrompt: "test", createdBy: "root" });
          const other = await runtime.spawnAgent({ roleId: otherRole.id, parentAgentId: "root" });

          // 测试1: 非父智能体尝试终止 - 应该失败
          const ctxOther = { agent: other };
          const resultOther = await runtime._executeTerminateAgent(ctxOther, { agentId: childId });
          expect(resultOther.error).toBe("not_child_agent");
          expect(runtime._agents.has(childId)).toBe(true); // 智能体仍然存在

          // 测试2: 父智能体终止 - 应该成功
          const ctxRoot = { agent: root };
          const resultRoot = await runtime._executeTerminateAgent(ctxRoot, { agentId: childId });
          expect(resultRoot.ok).toBe(true);
          expect(runtime._agents.has(childId)).toBe(false); // 智能体已被移除

          // 清理other智能体
          await runtime._executeTerminateAgent(ctxRoot, { agentId: other.id });
        }
      ),
      { numRuns: 50 }  // 减少迭代次数以避免超时，同时仍保持足够的测试覆盖
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 7: 智能体终止权限验证 - 终止不存在的智能体应返回错误", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/terminate_notfound_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(root);

    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        async (nonExistentId) => {
          const ctx = { agent: root };
          const result = await runtime._executeTerminateAgent(ctx, { agentId: nonExistentId });
          expect(result.error).toBe("agent_not_found");
        }
      ),
      { numRuns: 100 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });
});


/**
 * Property 9: 上下文压缩保留性
 * 对于任意compress_context调用，压缩后的上下文应保留：
 * (1) 原始系统提示词
 * (2) 指定数量的最近消息
 * (3) 调用者提供的摘要内容
 * 
 * **验证: 需求 4.2**
 */
describe("Runtime - Context Compression", () => {
  test("Property 9: 上下文压缩保留性 - 压缩后保留系统提示词、最近消息和摘要", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/compress_context_test_prop9`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath, maxContextMessages: 50 });
    await runtime.init();

    // 创建一个测试智能体
    const testAgent = new Agent({
      id: "test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(testAgent);

    await fc.assert(
      fc.asyncProperty(
        // 生成系统提示词
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim() !== ""),
        // 生成消息数量（足够多以便压缩）
        fc.integer({ min: 15, max: 50 }),
        // 生成保留的最近消息数量
        fc.integer({ min: 1, max: 10 }),
        // 生成摘要内容
        fc.string({ minLength: 1, maxLength: 200 }).filter(s => s.trim() !== ""),
        async (systemPrompt, messageCount, keepRecentCount, summary) => {
          const agentId = `agent_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          
          // 初始化会话上下文
          const conv = runtime._conversationManager.ensureConversation(agentId, systemPrompt);
          
          // 添加消息到会话
          for (let i = 0; i < messageCount; i++) {
            conv.push({ role: i % 2 === 0 ? "user" : "assistant", content: `message_${i}` });
          }

          const originalCount = conv.length;
          expect(originalCount).toBe(messageCount + 1); // +1 for system prompt

          // 执行压缩
          const result = runtime._conversationManager.compress(agentId, summary, keepRecentCount);

          // 验证压缩成功
          expect(result.ok).toBe(true);
          expect(result.compressed).toBe(true);
          expect(result.originalCount).toBe(originalCount);

          // 获取压缩后的会话
          const compressedConv = runtime._conversationManager.getConversation(agentId);

          // 验证 (1): 原始系统提示词被保留
          expect(compressedConv[0].role).toBe("system");
          expect(compressedConv[0].content).toBe(systemPrompt);

          // 验证 (3): 摘要内容被保留（作为第二条消息）
          expect(compressedConv[1].role).toBe("system");
          expect(compressedConv[1].content).toContain(summary);
          expect(compressedConv[1].content).toContain("[历史摘要]");

          // 验证 (2): 指定数量的最近消息被保留
          const recentMessages = compressedConv.slice(2);
          expect(recentMessages.length).toBe(keepRecentCount);

          // 验证最近消息是原始会话的最后 keepRecentCount 条
          const originalRecentMessages = conv.slice(-keepRecentCount);
          for (let i = 0; i < keepRecentCount; i++) {
            expect(recentMessages[i].content).toBe(originalRecentMessages[i].content);
            expect(recentMessages[i].role).toBe(originalRecentMessages[i].role);
          }

          // 验证压缩后的总长度
          expect(compressedConv.length).toBe(keepRecentCount + 2); // system + summary + recent messages

          // 清理
          runtime._conversationManager.deleteConversation(agentId);
        }
      ),
      { numRuns: 100 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 9: 上下文压缩保留性 - 消息数量不足时不压缩", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/compress_context_no_compress_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim() !== ""),
        fc.integer({ min: 5, max: 10 }), // keepRecentCount
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim() !== ""),
        async (systemPrompt, keepRecentCount, summary) => {
          const agentId = `agent_no_compress_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          
          // 初始化会话上下文，消息数量少于 keepRecentCount + 1
          const conv = runtime._conversationManager.ensureConversation(agentId, systemPrompt);
          
          // 添加少量消息（少于 keepRecentCount）
          const messageCount = Math.max(0, keepRecentCount - 2);
          for (let i = 0; i < messageCount; i++) {
            conv.push({ role: "user", content: `message_${i}` });
          }

          const originalCount = conv.length;

          // 执行压缩
          const result = runtime._conversationManager.compress(agentId, summary, keepRecentCount);

          // 验证不需要压缩
          expect(result.ok).toBe(true);
          expect(result.compressed).toBe(false);
          expect(result.originalCount).toBe(originalCount);
          expect(result.newCount).toBe(originalCount);

          // 验证会话内容未改变
          const currentConv = runtime._conversationManager.getConversation(agentId);
          expect(currentConv.length).toBe(originalCount);

          // 清理
          runtime._conversationManager.deleteConversation(agentId);
        }
      ),
      { numRuns: 100 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 9: 上下文压缩保留性 - 通过工具调用执行压缩", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/compress_context_tool_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建测试智能体
    const testAgent = new Agent({
      id: "tool-test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(testAgent);

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim() !== ""),
        fc.integer({ min: 20, max: 40 }),
        fc.integer({ min: 3, max: 8 }),
        fc.string({ minLength: 1, maxLength: 150 }).filter(s => s.trim() !== ""),
        async (systemPrompt, messageCount, keepRecentCount, summary) => {
          const agentId = `tool_agent_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          
          // 创建临时智能体
          const agent = new Agent({
            id: agentId,
            roleId: "temp-role",
            roleName: "temp",
            rolePrompt: "",
            behavior: async () => {}
          });
          runtime.registerAgentInstance(agent);

          // 初始化会话上下文
          const conv = runtime._conversationManager.ensureConversation(agentId, systemPrompt);
          for (let i = 0; i < messageCount; i++) {
            conv.push({ role: i % 2 === 0 ? "user" : "assistant", content: `tool_msg_${i}` });
          }

          // 通过工具调用执行压缩
          const ctx = { agent };
          const result = await runtime.executeToolCall(ctx, "compress_context", { 
            summary, 
            keepRecentCount 
          });

          // 验证工具调用成功
          expect(result.ok).toBe(true);
          expect(result.compressed).toBe(true);

          // 验证压缩后的会话
          const compressedConv = runtime._conversationManager.getConversation(agentId);
          
          // 验证系统提示词保留
          expect(compressedConv[0].content).toBe(systemPrompt);
          
          // 验证摘要保留
          expect(compressedConv[1].content).toContain(summary);
          
          // 验证最近消息数量
          expect(compressedConv.length).toBe(keepRecentCount + 2);

          // 清理
          runtime._agents.delete(agentId);
          runtime._conversationManager.deleteConversation(agentId);
        }
      ),
      { numRuns: 100 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });
});


/**
 * Property 11: LLM调用重试行为
 * 对于任意失败的LLM调用，Runtime应按指数退避策略重试，重试次数不超过3次，
 * 每次重试的延迟应为2^n秒（n为重试次数）。
 * 
 * **验证: 需求 5.1**
 */
describe("LlmClient - Retry Behavior", () => {
  test("Property 11: LLM调用重试行为 - 失败时按指数退避策略重试", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成失败次数（0-2次失败后成功，或3次全部失败）
        fc.integer({ min: 0, max: 3 }),
        async (failCount) => {
          const loggerRoot = new Logger(normalizeLoggingConfig(null));
          const llm = new LlmClient({
            baseURL: "http://127.0.0.1:0/v1",
            model: "test-model",
            apiKey: "NOT_NEEDED",
            maxRetries: 3,
            logger: loggerRoot.forModule("llm")
          });

          let callCount = 0;
          const delays = [];
          let lastCallTime = Date.now();

          // 模拟 _sleep 方法来记录延迟
          const originalSleep = llm._sleep.bind(llm);
          llm._sleep = async (ms) => {
            delays.push(ms);
            // 使用很短的延迟来加速测试
            await new Promise(r => setTimeout(r, 1));
          };

          // 模拟 LLM 客户端
          llm._client = {
            chat: {
              completions: {
                create: async () => {
                  callCount++;
                  if (callCount <= failCount) {
                    throw new Error(`Simulated failure ${callCount}`);
                  }
                  return {
                    choices: [{ message: { role: "assistant", content: "ok" } }]
                  };
                }
              }
            }
          };

          if (failCount < 3) {
            // 应该成功
            const result = await llm.chat({
              messages: [{ role: "user", content: "test" }]
            });
            
            expect(result).toBeDefined();
            expect(result.content).toBe("ok");
            expect(callCount).toBe(failCount + 1);
            
            // 验证重试次数
            expect(delays.length).toBe(failCount);
            
            // 验证指数退避延迟：2^n 秒
            for (let i = 0; i < delays.length; i++) {
              const expectedDelay = Math.pow(2, i) * 1000;
              expect(delays[i]).toBe(expectedDelay);
            }
          } else {
            // 应该失败（3次全部失败）
            let thrownError = null;
            try {
              await llm.chat({
                messages: [{ role: "user", content: "test" }]
              });
            } catch (err) {
              thrownError = err;
            }
            
            expect(thrownError).toBeDefined();
            expect(callCount).toBe(3);
            
            // 验证重试了2次（第一次失败后重试2次）
            expect(delays.length).toBe(2);
            
            // 验证指数退避延迟
            expect(delays[0]).toBe(1000);  // 2^0 * 1000 = 1000ms
            expect(delays[1]).toBe(2000);  // 2^1 * 1000 = 2000ms
          }
        }
      ),
      { numRuns: 10 }  // 减少迭代次数因为每次测试都涉及延迟
    );
  });

  test("Property 11: LLM调用重试行为 - 首次成功时不重试", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }),
        async (responseContent) => {
          const loggerRoot = new Logger(normalizeLoggingConfig(null));
          const llm = new LlmClient({
            baseURL: "http://127.0.0.1:0/v1",
            model: "test-model",
            apiKey: "NOT_NEEDED",
            maxRetries: 3,
            logger: loggerRoot.forModule("llm")
          });

          let callCount = 0;
          const delays = [];

          llm._sleep = async (ms) => {
            delays.push(ms);
          };

          llm._client = {
            chat: {
              completions: {
                create: async () => {
                  callCount++;
                  return {
                    choices: [{ message: { role: "assistant", content: responseContent } }]
                  };
                }
              }
            }
          };

          const result = await llm.chat({
            messages: [{ role: "user", content: "test" }]
          });

          // 验证只调用了一次
          expect(callCount).toBe(1);
          
          // 验证没有延迟（没有重试）
          expect(delays.length).toBe(0);
          
          // 验证返回正确内容
          expect(result.content).toBe(responseContent);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 11: LLM调用重试行为 - 可配置最大重试次数", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        async (maxRetries) => {
          const loggerRoot = new Logger(normalizeLoggingConfig(null));
          const llm = new LlmClient({
            baseURL: "http://127.0.0.1:0/v1",
            model: "test-model",
            apiKey: "NOT_NEEDED",
            maxRetries,
            logger: loggerRoot.forModule("llm")
          });

          let callCount = 0;

          llm._sleep = async () => {
            // 快速跳过延迟
          };

          // 模拟永远失败
          llm._client = {
            chat: {
              completions: {
                create: async () => {
                  callCount++;
                  throw new Error("Always fail");
                }
              }
            }
          };

          let thrownError = null;
          try {
            await llm.chat({
              messages: [{ role: "user", content: "test" }]
            });
          } catch (err) {
            thrownError = err;
          }

          // 验证调用次数等于 maxRetries
          expect(callCount).toBe(maxRetries);
          expect(thrownError).toBeDefined();
        }
      ),
      { numRuns: 50 }
    );
  });
});


/**
 * Property 12: 智能体错误隔离
 * 对于任意智能体消息处理器抛出的异常，不应影响其他智能体的消息处理；
 * Runtime应继续处理其他智能体的消息。
 * 
 * **验证: 需求 5.2**
 */
describe("Runtime - Agent Error Isolation", () => {
  test("Property 12: 智能体错误隔离 - 单个智能体异常不影响其他智能体", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/error_isolation_test_prop12`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    await fc.assert(
      fc.asyncProperty(
        // 生成智能体数量（2-5个）
        fc.integer({ min: 2, max: 5 }),
        // 生成哪个智能体会抛出异常（索引）
        fc.integer({ min: 0, max: 4 }),
        async (agentCount, failingAgentIndex) => {
          // 确保 failingAgentIndex 在有效范围内
          const actualFailingIndex = failingAgentIndex % agentCount;
          
          const processedAgents = [];
          const agents = [];

          // 创建多个智能体
          for (let i = 0; i < agentCount; i++) {
            const shouldFail = i === actualFailingIndex;
            const agentId = `agent_${i}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            
            const agent = new Agent({
              id: agentId,
              roleId: `role_${i}`,
              roleName: `role_${i}`,
              rolePrompt: "",
              behavior: async (ctx, msg) => {
                if (shouldFail) {
                  throw new Error(`Agent ${agentId} intentionally failed`);
                }
                processedAgents.push(agentId);
              }
            });
            
            runtime.registerAgentInstance(agent);
            agents.push(agent);
          }

          // 向所有智能体发送消息
          for (const agent of agents) {
            runtime.bus.send({
              to: agent.id,
              from: "test",
              taskId: "t-isolation",
              payload: { text: "test message" }
            });
          }

          // 运行消息循环
          await runtime.run();

          // 验证：除了失败的智能体外，其他智能体都应该处理了消息
          const expectedProcessedCount = agentCount - 1;
          expect(processedAgents.length).toBe(expectedProcessedCount);

          // 验证失败的智能体没有被记录到 processedAgents
          const failingAgentId = agents[actualFailingIndex].id;
          expect(processedAgents).not.toContain(failingAgentId);

          // 清理
          for (const agent of agents) {
            runtime._agents.delete(agent.id);
          }
        }
      ),
      { numRuns: 50 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 12: 智能体错误隔离 - 多个智能体同时失败不影响正常智能体", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/multi_error_isolation_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    await fc.assert(
      fc.asyncProperty(
        // 生成智能体数量（3-6个）
        fc.integer({ min: 3, max: 6 }),
        // 生成失败智能体数量（1-2个）
        fc.integer({ min: 1, max: 2 }),
        async (agentCount, failCount) => {
          // 确保失败数量不超过智能体总数
          const actualFailCount = Math.min(failCount, agentCount - 1);
          const successCount = agentCount - actualFailCount;
          
          const processedAgents = [];
          const agents = [];
          const failingAgentIds = new Set();

          // 创建智能体，前 actualFailCount 个会失败
          for (let i = 0; i < agentCount; i++) {
            const shouldFail = i < actualFailCount;
            const agentId = `multi_agent_${i}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            
            if (shouldFail) {
              failingAgentIds.add(agentId);
            }
            
            const agent = new Agent({
              id: agentId,
              roleId: `role_${i}`,
              roleName: `role_${i}`,
              rolePrompt: "",
              behavior: async (ctx, msg) => {
                if (shouldFail) {
                  throw new Error(`Agent ${agentId} failed`);
                }
                processedAgents.push(agentId);
              }
            });
            
            runtime.registerAgentInstance(agent);
            agents.push(agent);
          }

          // 向所有智能体发送消息
          for (const agent of agents) {
            runtime.bus.send({
              to: agent.id,
              from: "test",
              taskId: "t-multi-isolation",
              payload: { text: "test" }
            });
          }

          // 运行消息循环
          await runtime.run();

          // 验证：所有正常智能体都处理了消息
          expect(processedAgents.length).toBe(successCount);

          // 验证：失败的智能体没有被记录
          for (const agentId of failingAgentIds) {
            expect(processedAgents).not.toContain(agentId);
          }

          // 清理
          for (const agent of agents) {
            runtime._agents.delete(agent.id);
          }
        }
      ),
      { numRuns: 50 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 12: 智能体错误隔离 - 运行时不因单个智能体异常而停止", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/runtime_continue_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (messageCount) => {
          let successfulProcessCount = 0;
          let failedProcessCount = 0;

          // 创建一个会失败的智能体
          const failingAgent = new Agent({
            id: `failing_${Date.now()}`,
            roleId: "failing_role",
            roleName: "failing",
            rolePrompt: "",
            behavior: async () => {
              failedProcessCount++;
              throw new Error("Always fails");
            }
          });

          // 创建一个正常的智能体
          const normalAgent = new Agent({
            id: `normal_${Date.now()}`,
            roleId: "normal_role",
            roleName: "normal",
            rolePrompt: "",
            behavior: async () => {
              successfulProcessCount++;
            }
          });

          runtime.registerAgentInstance(failingAgent);
          runtime.registerAgentInstance(normalAgent);

          // 向两个智能体交替发送消息
          for (let i = 0; i < messageCount; i++) {
            runtime.bus.send({
              to: failingAgent.id,
              from: "test",
              taskId: `t-${i}`,
              payload: { text: `fail message ${i}` }
            });
            runtime.bus.send({
              to: normalAgent.id,
              from: "test",
              taskId: `t-${i}`,
              payload: { text: `normal message ${i}` }
            });
          }

          // 运行消息循环
          await runtime.run();

          // 验证：正常智能体处理了所有消息
          expect(successfulProcessCount).toBe(messageCount);

          // 验证：失败的智能体也尝试处理了所有消息（但都失败了）
          expect(failedProcessCount).toBe(messageCount);

          // 验证：运行时没有停止（_stopRequested 仍为 false）
          expect(runtime._stopRequested).toBe(false);

          // 清理
          runtime._agents.delete(failingAgent.id);
          runtime._agents.delete(normalAgent.id);
        }
      ),
      { numRuns: 50 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });
});


/**
 * Property 14: 优雅关闭完整性
 * 对于任意关闭信号（SIGINT/SIGTERM），Runtime应：
 * (1) 停止接收新消息
 * (2) 等待当前处理完成（最多30秒）
 * (3) 持久化状态
 * (4) 记录关闭摘要
 * 
 * **验证: 需求 8.1, 8.2, 8.3, 8.4**
 */
describe("Runtime - Graceful Shutdown", () => {
  test("Property 14: 优雅关闭完整性 - 关闭时停止接收新消息并持久化状态", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/graceful_shutdown_test_prop14`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建根智能体
    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(root);

    await fc.assert(
      fc.asyncProperty(
        // 生成智能体数量
        fc.integer({ min: 1, max: 5 }),
        // 生成待处理消息数量
        fc.integer({ min: 0, max: 10 }),
        async (agentCount, pendingMessageCount) => {
          // 创建测试智能体
          const agents = [];
          for (let i = 0; i < agentCount; i++) {
            const role = await runtime.org.createRole({ 
              name: `shutdown_role_${i}_${Date.now()}`, 
              rolePrompt: "test", 
              createdBy: "root" 
            });
            const agent = await runtime.spawnAgent({ roleId: role.id, parentAgentId: "root" });
            agents.push(agent);
          }

          // 添加待处理消息
          for (let i = 0; i < pendingMessageCount; i++) {
            const targetAgent = agents[i % agents.length];
            runtime.bus.send({
              to: targetAgent.id,
              from: "test",
              taskId: `shutdown-task-${i}`,
              payload: { text: `message ${i}` }
            });
          }

          // 记录关闭前的状态
          const pendingBefore = runtime.bus.getPendingCount();
          const agentsBefore = runtime._agents.size;

          // 执行关闭
          const result = await runtime.shutdown({ signal: "TEST" });

          // 验证 (1): 停止接收新消息
          expect(runtime._stopRequested).toBe(true);
          expect(runtime.isShuttingDown()).toBe(true);

          // 验证 (2): 关闭结果包含正确信息
          expect(result.ok).toBe(true);
          expect(typeof result.shutdownDuration).toBe("number");
          expect(result.shutdownDuration).toBeGreaterThanOrEqual(0);

          // 验证 (3): 状态已持久化（检查文件存在）
          const orgFilePath = path.resolve(tmpDir, "org.json");
          const orgFileContent = await readFile(orgFilePath, "utf8");
          const orgData = JSON.parse(orgFileContent);
          expect(orgData).toBeDefined();
          expect(Array.isArray(orgData.roles)).toBe(true);
          expect(Array.isArray(orgData.agents)).toBe(true);

          // 验证 (4): 关闭摘要包含必要信息
          expect(typeof result.pendingMessages).toBe("number");
          expect(typeof result.activeAgents).toBe("number");

          // 重置运行时状态以便下一次迭代
          runtime._stopRequested = false;
          runtime._isShuttingDown = false;
          runtime._shutdownStartTime = null;

          // 清理智能体
          for (const agent of agents) {
            runtime._agents.delete(agent.id);
            runtime._agentMetaById.delete(agent.id);
          }
        }
      ),
      { numRuns: 50 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 14: 优雅关闭完整性 - 重复关闭请求被忽略", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/graceful_shutdown_duplicate_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (shutdownAttempts) => {
          // 第一次关闭应该成功
          const firstResult = await runtime.shutdown({ signal: "FIRST" });
          expect(firstResult.ok).toBe(true);

          // 后续关闭尝试应该返回 ok: false（因为已经在关闭中）
          for (let i = 1; i < shutdownAttempts; i++) {
            const result = await runtime.shutdown({ signal: `ATTEMPT_${i}` });
            expect(result.ok).toBe(false);
          }

          // 重置状态以便下一次迭代
          runtime._stopRequested = false;
          runtime._isShuttingDown = false;
          runtime._shutdownStartTime = null;
        }
      ),
      { numRuns: 50 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 14: 优雅关闭完整性 - 关闭状态查询正确", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/graceful_shutdown_status_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1000, max: 60000 }),
        async (shutdownTimeoutMs) => {
          // 设置优雅关闭
          runtime.setupGracefulShutdown({ shutdownTimeoutMs });

          // 关闭前状态
          expect(runtime.isShuttingDown()).toBe(false);
          const statusBefore = runtime.getShutdownStatus();
          expect(statusBefore.isShuttingDown).toBe(false);
          expect(statusBefore.shutdownStartTime).toBe(null);
          expect(statusBefore.shutdownTimeoutMs).toBe(shutdownTimeoutMs);

          // 执行关闭
          await runtime.shutdown({ signal: "STATUS_TEST" });

          // 关闭后状态
          expect(runtime.isShuttingDown()).toBe(true);
          const statusAfter = runtime.getShutdownStatus();
          expect(statusAfter.isShuttingDown).toBe(true);
          expect(typeof statusAfter.shutdownStartTime).toBe("number");
          expect(statusAfter.shutdownStartTime).toBeGreaterThan(0);

          // 重置状态
          runtime._stopRequested = false;
          runtime._isShuttingDown = false;
          runtime._shutdownStartTime = null;
          runtime._gracefulShutdownSetup = false;
        }
      ),
      { numRuns: 50 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 14: 优雅关闭完整性 - 消息总线待处理消息计数正确", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/graceful_shutdown_pending_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建测试智能体
    const testAgent = new Agent({
      id: "pending-test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(testAgent);

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 20 }),
        async (messageCount) => {
          // 添加消息到队列
          for (let i = 0; i < messageCount; i++) {
            runtime.bus.send({
              to: testAgent.id,
              from: "test",
              taskId: `pending-${i}`,
              payload: { text: `message ${i}` }
            });
          }

          // 验证待处理消息计数
          const pendingCount = runtime.bus.getPendingCount();
          expect(pendingCount).toBe(messageCount);

          // 清空队列
          runtime.bus.clearQueue(testAgent.id);
          expect(runtime.bus.getPendingCount()).toBe(0);
        }
      ),
      { numRuns: 100 }
    );

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });
});


/**
 * Property 15: 跨任务通信隔离
 * 对于任意非 root/user 智能体，只能与 root、user 和同一任务内的智能体通信；
 * 跨任务通信应被系统自动拦截。
 * 
 * **验证: taskId 隔离设计**
 */
describe("Runtime - Cross Task Communication Isolation", () => {
  test("Property 15: 跨任务通信隔离 - 同一任务内的智能体可以互相通信", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/cross_task_same_task_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建根智能体
    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(root);

    // 创建岗位
    const role1 = await runtime.org.createRole({ name: "task_role_1", rolePrompt: "test", createdBy: "root" });
    const role2 = await runtime.org.createRole({ name: "task_role_2", rolePrompt: "test", createdBy: "root" });

    // 创建同一任务的入口智能体
    const taskId = "task-same-1";
    const agent1 = await runtime.spawnAgent({ roleId: role1.id, parentAgentId: "root" });
    runtime._rootTaskAgentByTaskId.set(taskId, { id: agent1.id, roleId: agent1.roleId, roleName: agent1.roleName });

    // 创建同一任务内的子智能体
    const childRole = await runtime.org.createRole({ name: "child_role_1", rolePrompt: "test", createdBy: agent1.id });
    const agent2 = await runtime.spawnAgentAs(agent1.id, { roleId: childRole.id });

    let receivedMessage = null;
    agent2._behavior = async (ctx, msg) => {
      receivedMessage = msg;
    };

    // 构建上下文并发送消息
    const ctx = runtime._buildAgentContext(agent1);
    ctx.currentMessage = { taskId };

    const result = await runtime.executeToolCall(ctx, "send_message", {
      to: agent2.id,
      payload: { text: "hello from same task" }
    });

    // 验证消息发送成功
    expect(result.messageId).toBeDefined();
    expect(result.error).toBeUndefined();

    // 运行消息循环
    await runtime.run();

    // 验证消息被接收
    expect(receivedMessage).toBeTruthy();
    expect(receivedMessage.payload.text).toBe("hello from same task");

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 15: 跨任务通信隔离 - 不同任务的智能体不能互相通信", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/cross_task_different_task_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建根智能体
    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(root);

    // 创建岗位
    const role1 = await runtime.org.createRole({ name: "task_role_a", rolePrompt: "test", createdBy: "root" });
    const role2 = await runtime.org.createRole({ name: "task_role_b", rolePrompt: "test", createdBy: "root" });

    // 创建任务1的入口智能体
    const taskId1 = "task-1";
    const agent1 = await runtime.spawnAgent({ roleId: role1.id, parentAgentId: "root" });
    runtime._rootTaskAgentByTaskId.set(taskId1, { id: agent1.id, roleId: agent1.roleId, roleName: agent1.roleName });

    // 创建任务2的入口智能体
    const taskId2 = "task-2";
    const agent2 = await runtime.spawnAgent({ roleId: role2.id, parentAgentId: "root" });
    runtime._rootTaskAgentByTaskId.set(taskId2, { id: agent2.id, roleId: agent2.roleId, roleName: agent2.roleName });

    // 构建上下文并尝试跨任务发送消息
    const ctx = runtime._buildAgentContext(agent1);
    ctx.currentMessage = { taskId: taskId1 };

    const result = await runtime.executeToolCall(ctx, "send_message", {
      to: agent2.id,
      payload: { text: "cross task message" }
    });

    // 验证消息被拦截
    expect(result.error).toBe("cross_task_communication_denied");
    expect(result.from).toBe(agent1.id);
    expect(result.to).toBe(agent2.id);

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 15: 跨任务通信隔离 - 任意智能体可以与 root 通信", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/cross_task_to_root_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建根智能体
    let rootReceivedMessage = null;
    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        rootReceivedMessage = msg;
      }
    });
    runtime.registerAgentInstance(root);

    // 创建岗位和智能体
    const role = await runtime.org.createRole({ name: "task_role_root_test", rolePrompt: "test", createdBy: "root" });
    const taskId = "task-root-test";
    const agent = await runtime.spawnAgent({ roleId: role.id, parentAgentId: "root" });
    runtime._rootTaskAgentByTaskId.set(taskId, { id: agent.id, roleId: agent.roleId, roleName: agent.roleName });

    // 构建上下文并发送消息给 root
    const ctx = runtime._buildAgentContext(agent);
    ctx.currentMessage = { taskId };

    const result = await runtime.executeToolCall(ctx, "send_message", {
      to: "root",
      payload: { text: "message to root" }
    });

    // 验证消息发送成功
    expect(result.messageId).toBeDefined();
    expect(result.error).toBeUndefined();

    // 运行消息循环
    await runtime.run();

    // 验证 root 收到消息
    expect(rootReceivedMessage).toBeTruthy();
    expect(rootReceivedMessage.payload.text).toBe("message to root");

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 15: 跨任务通信隔离 - 任意智能体可以与 user 通信", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/cross_task_to_user_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建根智能体
    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(root);

    // 创建用户智能体
    let userReceivedMessage = null;
    const user = new Agent({
      id: "user",
      roleId: "user",
      roleName: "user",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        userReceivedMessage = msg;
      }
    });
    runtime.registerAgentInstance(user);

    // 创建岗位和智能体
    const role = await runtime.org.createRole({ name: "task_role_user_test", rolePrompt: "test", createdBy: "root" });
    const taskId = "task-user-test";
    const agent = await runtime.spawnAgent({ roleId: role.id, parentAgentId: "root" });
    runtime._rootTaskAgentByTaskId.set(taskId, { id: agent.id, roleId: agent.roleId, roleName: agent.roleName });

    // 构建上下文并发送消息给 user
    const ctx = runtime._buildAgentContext(agent);
    ctx.currentMessage = { taskId };

    const result = await runtime.executeToolCall(ctx, "send_message", {
      to: "user",
      payload: { text: "message to user" }
    });

    // 验证消息发送成功
    expect(result.messageId).toBeDefined();
    expect(result.error).toBeUndefined();

    // 运行消息循环
    await runtime.run();

    // 验证 user 收到消息
    expect(userReceivedMessage).toBeTruthy();
    expect(userReceivedMessage.payload.text).toBe("message to user");

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("Property 15: 跨任务通信隔离 - taskId 由系统自动传递", async () => {
    const tmpDir = path.resolve(process.cwd(), `test/.tmp/cross_task_auto_taskid_test`);
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(configPath, JSON.stringify({
      promptsDir: "config/prompts",
      artifactsDir: path.resolve(tmpDir, "artifacts"),
      runtimeDir: tmpDir
    }, null, 2), "utf8");

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建根智能体
    const root = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(root);

    // 创建岗位
    const role = await runtime.org.createRole({ name: "task_role_auto_taskid", rolePrompt: "test", createdBy: "root" });

    // 创建任务的入口智能体
    const taskId = "task-auto-taskid";
    const agent1 = await runtime.spawnAgent({ roleId: role.id, parentAgentId: "root" });
    runtime._rootTaskAgentByTaskId.set(taskId, { id: agent1.id, roleId: agent1.roleId, roleName: agent1.roleName });

    // 创建子智能体
    const childRole = await runtime.org.createRole({ name: "child_role_auto_taskid", rolePrompt: "test", createdBy: agent1.id });
    const agent2 = await runtime.spawnAgentAs(agent1.id, { roleId: childRole.id });

    let receivedTaskId = null;
    agent2._behavior = async (ctx, msg) => {
      receivedTaskId = msg.taskId;
    };

    // 构建上下文并发送消息（不传入 taskId，由系统自动传递）
    const ctx = runtime._buildAgentContext(agent1);
    ctx.currentMessage = { taskId };

    const result = await runtime.executeToolCall(ctx, "send_message", {
      to: agent2.id,
      payload: { text: "auto taskId test" }
      // 注意：没有传入 taskId
    });

    // 验证消息发送成功
    expect(result.messageId).toBeDefined();

    // 运行消息循环
    await runtime.run();

    // 验证 taskId 被自动传递
    expect(receivedTaskId).toBe(taskId);

    // 清理
    await rm(tmpDir, { recursive: true, force: true });
  });
});


describe("Runtime.abortAgentLlmCall", () => {
  test("应返回错误当 agentId 为空", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_abort_test_1");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir: path.resolve(tmpDir, "artifacts"),
        runtimeDir: tmpDir,
        maxSteps: 50
      }),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    const result = await runtime.abortAgentLlmCall(null);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("missing_agent_id");

    const result2 = await runtime.abortAgentLlmCall("");
    expect(result2.ok).toBe(false);
    expect(result2.reason).toBe("missing_agent_id");
  });

  test("应返回错误当智能体不存在", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_abort_test_2");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir: path.resolve(tmpDir, "artifacts"),
        runtimeDir: tmpDir,
        maxSteps: 50
      }),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    const result = await runtime.abortAgentLlmCall("non-existent-agent");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("agent_not_found");
  });

  test("应返回 aborted=false 当智能体不在活跃状态（idle）", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_abort_test_3");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir: path.resolve(tmpDir, "artifacts"),
        runtimeDir: tmpDir,
        maxSteps: 50
      }),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建一个测试智能体
    const testAgent = new Agent({
      id: "test-agent",
      roleId: "test",
      roleName: "test",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(testAgent);

    // 智能体默认状态是 idle
    const result = await runtime.abortAgentLlmCall("test-agent");
    expect(result.ok).toBe(true);
    expect(result.aborted).toBe(false);
    expect(result.reason).toBe("not_active");
  });

  test("应成功中断 processing 状态的智能体", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_abort_test_3b");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir: path.resolve(tmpDir, "artifacts"),
        runtimeDir: tmpDir,
        maxSteps: 50
      }),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建一个测试智能体
    const testAgent = new Agent({
      id: "test-agent",
      roleId: "test",
      roleName: "test",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(testAgent);

    // 设置为 processing 状态（正在处理工具调用）
    runtime.setAgentComputeStatus("test-agent", "processing");
    const result = await runtime.abortAgentLlmCall("test-agent");
    expect(result.ok).toBe(true);
    expect(result.aborted).toBe(true);
    // 中断后状态应该变为 idle
    expect(runtime.getAgentComputeStatus("test-agent")).toBe("idle");
  });

  test("应成功中断 waiting_llm 状态的智能体", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_abort_test_4");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir: path.resolve(tmpDir, "artifacts"),
        runtimeDir: tmpDir,
        maxSteps: 50,
        llm: {
          baseURL: "http://localhost:1234/v1",
          model: "test-model",
          apiKey: "test-key"
        }
      }),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建一个测试智能体
    const testAgent = new Agent({
      id: "test-agent",
      roleId: "test",
      roleName: "test",
      rolePrompt: "",
      behavior: async () => {}
    });
    runtime.registerAgentInstance(testAgent);

    // 模拟 LLM 客户端有活跃请求
    runtime.llm._activeRequests.set("test-agent", {
      abort: () => {},
      signal: { aborted: false }
    });

    // 设置为 waiting_llm 状态
    runtime.setAgentComputeStatus("test-agent", "waiting_llm");

    const result = await runtime.abortAgentLlmCall("test-agent");
    expect(result.ok).toBe(true);
    expect(result.aborted).toBe(true);

    // 验证状态已重置为 idle
    expect(runtime.getAgentComputeStatus("test-agent")).toBe("idle");
  });

  test("中断后智能体应能继续接收新消息", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_abort_test_5");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir: path.resolve(tmpDir, "artifacts"),
        runtimeDir: tmpDir,
        maxSteps: 50,
        llm: {
          baseURL: "http://localhost:1234/v1",
          model: "test-model",
          apiKey: "test-key"
        }
      }),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    // 创建一个测试智能体，记录收到的消息
    let receivedMessages = [];
    const testAgent = new Agent({
      id: "test-agent",
      roleId: "test",
      roleName: "test",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        receivedMessages.push(msg);
      }
    });
    runtime.registerAgentInstance(testAgent);

    // 模拟 LLM 客户端有活跃请求
    runtime.llm._activeRequests.set("test-agent", {
      abort: () => {},
      signal: { aborted: false }
    });

    // 设置为 waiting_llm 状态并中断
    runtime.setAgentComputeStatus("test-agent", "waiting_llm");
    await runtime.abortAgentLlmCall("test-agent");

    // 发送新消息
    runtime.bus.send({
      to: "test-agent",
      from: "user",
      taskId: "t1",
      payload: { text: "new message after abort" }
    });

    // 运行消息循环
    await runtime.run();

    // 验证智能体收到了新消息
    expect(receivedMessages.length).toBe(1);
    expect(receivedMessages[0].payload.text).toBe("new message after abort");
  });
});


/**
 * Property 3: 中断后状态正确性
 * 对于任意成功的中断操作，中断后智能体的 computeStatus 应为 'idle'，
 * 且智能体应能继续接收新消息。
 * 
 * **验证: Requirements 4.3, 5.1**
 */
describe("Runtime.abortAgentLlmCall - Property Tests", () => {
  test("Property 3: 中断后状态正确性 - 中断后 computeStatus 为 idle 且能接收新消息", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_abort_prop3");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir: path.resolve(tmpDir, "artifacts"),
        runtimeDir: tmpDir,
        maxSteps: 50,
        llm: {
          baseURL: "http://localhost:1234/v1",
          model: "test-model",
          apiKey: "test-key"
        }
      }),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        async (agentIdSuffix) => {
          const agentId = `agent_${agentIdSuffix}_${Date.now()}`;
          
          // 创建测试智能体
          let receivedMessage = null;
          const testAgent = new Agent({
            id: agentId,
            roleId: "test",
            roleName: "test",
            rolePrompt: "",
            behavior: async (ctx, msg) => {
              receivedMessage = msg;
            }
          });
          runtime.registerAgentInstance(testAgent);

          // 模拟 LLM 客户端有活跃请求
          runtime.llm._activeRequests.set(agentId, {
            abort: () => {},
            signal: { aborted: false }
          });

          // 设置为 waiting_llm 状态
          runtime.setAgentComputeStatus(agentId, "waiting_llm");
          expect(runtime.getAgentComputeStatus(agentId)).toBe("waiting_llm");

          // 执行中断
          const result = await runtime.abortAgentLlmCall(agentId);

          // 验证中断成功
          expect(result.ok).toBe(true);
          expect(result.aborted).toBe(true);

          // 验证 (1): computeStatus 为 idle
          expect(runtime.getAgentComputeStatus(agentId)).toBe("idle");

          // 验证 (2): 智能体能接收新消息
          runtime.bus.send({
            to: agentId,
            from: "user",
            taskId: `task_${Date.now()}`,
            payload: { text: "test message" }
          });
          await runtime.run();
          expect(receivedMessage).not.toBeNull();
          expect(receivedMessage.payload.text).toBe("test message");

          // 清理
          runtime._agents.delete(agentId);
        }
      ),
      { numRuns: 20 }
    );

    await rm(tmpDir, { recursive: true, force: true });
  });

  /**
   * Property 4: 无活跃调用时的幂等性
   * 对于任意中断请求，当智能体处于 idle 状态时，操作应返回 success 且 aborted=false，
   * 且不应修改任何智能体状态。
   * 
   * **验证: Requirements 4.5**
   */
  test("Property 4: 无活跃调用时的幂等性 - 返回 success 且 aborted=false，不修改状态", async () => {
    const tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_abort_prop4");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir: path.resolve(tmpDir, "artifacts"),
        runtimeDir: tmpDir,
        maxSteps: 50,
        llm: {
          baseURL: "http://localhost:1234/v1",
          model: "test-model",
          apiKey: "test-key"
        }
      }),
      "utf8"
    );

    const runtime = new Runtime({ configPath });
    await runtime.init();

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
        async (agentIdSuffix) => {
          const agentId = `agent_idempotent_${agentIdSuffix}_${Date.now()}`;
          
          // 创建测试智能体
          const testAgent = new Agent({
            id: agentId,
            roleId: "test",
            roleName: "test",
            rolePrompt: "",
            behavior: async () => {}
          });
          runtime.registerAgentInstance(testAgent);

          // 设置初始状态为 idle（非活跃状态）
          runtime.setAgentComputeStatus(agentId, "idle");
          const statusBefore = runtime.getAgentComputeStatus(agentId);

          // 执行中断（没有活跃的 LLM 调用）
          const result1 = await runtime.abortAgentLlmCall(agentId);

          // 验证返回 success 且 aborted=false
          expect(result1.ok).toBe(true);
          expect(result1.aborted).toBe(false);
          expect(result1.reason).toBe("not_active");

          // 验证状态未改变
          expect(runtime.getAgentComputeStatus(agentId)).toBe(statusBefore);

          // 多次调用应该是幂等的
          const result2 = await runtime.abortAgentLlmCall(agentId);
          expect(result2.ok).toBe(true);
          expect(result2.aborted).toBe(false);
          expect(runtime.getAgentComputeStatus(agentId)).toBe(statusBefore);

          // 清理
          runtime._agents.delete(agentId);
        }
      ),
      { numRuns: 30 }
    );

    await rm(tmpDir, { recursive: true, force: true });
  });
});
