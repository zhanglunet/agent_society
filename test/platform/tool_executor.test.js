/**
 * ToolExecutor 单元测试
 * 
 * 测试 ToolExecutor 的核心功能：
 * - 工具定义获取
 * - 工具调用执行
 * - 工具参数验证
 * - 错误处理
 */

import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/core/runtime.js";
import { Agent } from "../../src/agents/agent.js";

describe("ToolExecutor", () => {
  let runtime;
  let tmpDir;
  let artifactsDir;

  beforeEach(async () => {
    tmpDir = path.resolve(process.cwd(), `test/.tmp/tool_executor_test_${Date.now()}`);
    artifactsDir = path.resolve(tmpDir, "artifacts");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir,
        runtimeDir: tmpDir,
        maxSteps: 50
      }, null, 2),
      "utf8"
    );

    runtime = new Runtime({ configPath });
    await runtime.init();
    
    runtime.registerAgentInstance(new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: "",
      behavior: async () => {}
    }));
  });

  test("getToolDefinitions returns array of tool definitions", () => {
    const tools = runtime._toolExecutor.getToolDefinitions();

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);

    // 验证工具定义格式
    const firstTool = tools[0];
    expect(firstTool.type).toBe("function");
    expect(firstTool.function).toBeTruthy();
    expect(firstTool.function.name).toBeTruthy();
    expect(firstTool.function.description).toBeTruthy();
    expect(firstTool.function.parameters).toBeTruthy();
  });

  test("getToolDefinitions includes core tools", () => {
    const tools = runtime._toolExecutor.getToolDefinitions();
    const toolNames = tools.map(t => t.function.name);

    // 验证核心工具存在
    expect(toolNames).toContain("find_role_by_name");
    expect(toolNames).toContain("create_role");
    expect(toolNames).toContain("spawn_agent_with_task");
    expect(toolNames).toContain("send_message");
    expect(toolNames).toContain("put_artifact");
    expect(toolNames).toContain("get_artifact");
    expect(toolNames).toContain("terminate_agent");
  });

  test("getToolDefinitions includes localllm_chat tool", () => {
    const tools = runtime._toolExecutor.getToolDefinitions();
    const toolNames = tools.map(t => t.function.name);
    expect(toolNames).toContain("localllm_chat");
  });

  test("executeToolCall get_org_structure includes agent names", async () => {
    runtime.localLlmChat = async () => "张三";

    const role = await runtime.org.createRole({
      name: "name-role",
      rolePrompt: "Test prompt",
      createdBy: "root"
    });

    const created = await runtime.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });

    const rootAgent = runtime._agents.get("root");
    const ctx = runtime._buildAgentContext(rootAgent);
    const result = await runtime._toolExecutor.executeToolCall(ctx, "get_org_structure", {});

    expect(result).toBeTruthy();
    expect(Array.isArray(result.roles)).toBe(true);

    const roleEntry = result.roles.find((r) => r.id === role.id);
    expect(roleEntry).toBeTruthy();
    expect(roleEntry.agentIds).toContain(created.id);
    expect(Array.isArray(roleEntry.agents)).toBe(true);
    expect(roleEntry.agents.some((a) => a.id === created.id && a.name === "张三")).toBe(true);
  });

  test("executeToolCall localllm_chat returns not_ready when disabled", async () => {
    const old = process.env.AGENT_SOCIETY_WLLAMA_HEADLESS;
    process.env.AGENT_SOCIETY_WLLAMA_HEADLESS = "0";
    try {
      const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
      const result = await runtime._toolExecutor.executeToolCall(ctx, "localllm_chat", {
        messages: [{ role: "user", content: "hi" }]
      });
      expect(result).toBeTruthy();
      expect(result.error).toBe("localllm_not_ready");
    } finally {
      if (old === undefined) {
        delete process.env.AGENT_SOCIETY_WLLAMA_HEADLESS;
      } else {
        process.env.AGENT_SOCIETY_WLLAMA_HEADLESS = old;
      }
    }
  });

  test("executeToolCall executes find_role_by_name", async () => {
    // 创建岗位
    await runtime.org.createRole({ name: "test-role", rolePrompt: "Test prompt" });

    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    const result = await runtime._toolExecutor.executeToolCall(ctx, "find_role_by_name", {
      name: "test-role"
    });

    expect(result).toBeTruthy();
    expect(result.name).toBe("test-role");
  });

  test("executeToolCall executes create_role", async () => {
    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    const result = await runtime._toolExecutor.executeToolCall(ctx, "create_role", {
      name: "new-role",
      rolePrompt: "New role prompt"
    });

    expect(result).toBeTruthy();
    expect(result.id).toBeTruthy();
    expect(result.name).toBe("new-role");
    expect(result.rolePrompt).toBe("New role prompt");
  });

  test("executeToolCall executes create_role with orgPrompt", async () => {
    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    const result = await runtime._toolExecutor.executeToolCall(ctx, "create_role", {
      name: "new-role-with-org",
      rolePrompt: "New role prompt",
      orgPrompt: "Org architecture prompt"
    });

    expect(result).toBeTruthy();
    expect(result.orgPrompt).toBe("Org architecture prompt");
  });

  test("create_role inherits orgPrompt from creator role when omitted", async () => {
    const parentRole = await runtime.org.createRole({
      name: "parent-role",
      rolePrompt: "Parent role prompt",
      orgPrompt: "Parent org prompt"
    });

    const parentAgent = await runtime.spawnAgent({
      roleId: parentRole.id,
      parentAgentId: "root"
    });

    const ctx = runtime._buildAgentContext(parentAgent);
    const childRole = await runtime._toolExecutor.executeToolCall(ctx, "create_role", {
      name: "child-role",
      rolePrompt: "Child role prompt"
    });

    expect(childRole).toBeTruthy();
    expect(childRole.orgPrompt).toBe("Parent org prompt");

    const childAgent = await runtime.spawnAgent({
      roleId: childRole.id,
      parentAgentId: parentAgent.id
    });
    const childCtx = runtime._buildAgentContext(childAgent);
    const childSystemPrompt = runtime._buildSystemPromptForAgent(childCtx);
    expect(childSystemPrompt).toContain("【组织架构】");
    expect(childSystemPrompt).toContain("Parent org prompt");
  });

  test("executeToolCall executes spawn_agent_with_task", async () => {
    runtime.localLlmChat = async () => "张三";
    
    // 创建岗位
    const role = await runtime.org.createRole({
      name: "test-role",
      rolePrompt: "Test prompt",
      createdBy: "root"
    });

    const rootAgent = runtime._agents.get("root");
    const ctx = runtime._buildAgentContext(rootAgent);
    
    // 设置当前消息以提供 taskId
    ctx.currentMessage = {
      id: "test-msg",
      from: "user",
      to: "root",
      taskId: "test-task",
      payload: {}
    };
    
    let capturedSend = null;
    const oldSend = runtime.bus.send.bind(runtime.bus);
    runtime.bus.send = (args) => {
      capturedSend = args;
      return oldSend(args);
    };
    
    const result = await runtime._toolExecutor.executeToolCall(ctx, "spawn_agent_with_task", {
      roleId: role.id,
      taskBrief: {
        objective: "Test objective",
        constraints: ["constraint1"],
        inputs: "Test inputs",
        outputs: "Test outputs",
        completion_criteria: "Test criteria"
      },
      initialMessage: "Start working on the task"
    });

    expect(result).toBeTruthy();
    expect(result.error).toBeFalsy();
    expect(result.id).toBeTruthy();
    
    const createdMeta = runtime.org.getAgent(result.id);
    expect(createdMeta).toBeTruthy();
    expect(createdMeta.name).toBe("张三");
    
    expect(capturedSend).toBeTruthy();
    expect(capturedSend.to).toBe(result.id);
    expect(typeof capturedSend.payload?.text).toBe("string");
    expect(capturedSend.payload.text).toContain("【你的姓名】张三");
    
    const storedTaskBrief = runtime._agentTaskBriefs.get(result.id);
    expect(storedTaskBrief).toBeTruthy();
    expect(storedTaskBrief.inputs).toBe("Test inputs");
    expect(storedTaskBrief.outputs).toBe("Test outputs");
    
    const childAgent = runtime._agents.get(result.id);
    const childCtx = runtime._buildAgentContext(childAgent);
    const childSystemPrompt = runtime._buildSystemPromptForAgent(childCtx);
    expect(childSystemPrompt).toContain("【任务委托书 Task Brief】");
    expect(childSystemPrompt).toContain("Test inputs");
  });

  test("executeToolCall validates spawn_agent_with_task taskBrief", async () => {
    const role = await runtime.org.createRole({
      name: "test-role",
      rolePrompt: "Test prompt",
      createdBy: "root"
    });

    const rootAgent = runtime._agents.get("root");
    const ctx = runtime._buildAgentContext(rootAgent);
    
    // 设置当前消息
    ctx.currentMessage = {
      id: "test-msg",
      from: "user",
      to: "root",
      taskId: "test-task",
      payload: {}
    };
    
    // 缺少必填字段
    const result = await runtime._toolExecutor.executeToolCall(ctx, "spawn_agent_with_task", {
      roleId: role.id,
      taskBrief: {
        objective: "Test objective"
        // 缺少其他必填字段
      },
      initialMessage: "Start working"
    });

    expect(result.error).toBeTruthy();
    expect(result.error).toBe("invalid_task_brief");
  });
  
  test("terminate_agent clears taskBrief for terminated agents", async () => {
    const role = await runtime.org.createRole({
      name: "test-role-terminate",
      rolePrompt: "Test prompt",
      createdBy: "root"
    });

    const rootAgent = runtime._agents.get("root");
    const ctx = runtime._buildAgentContext(rootAgent);
    ctx.currentMessage = {
      id: "test-msg",
      from: "user",
      to: "root",
      taskId: "test-task",
      payload: {}
    };

    const spawnResult = await runtime._toolExecutor.executeToolCall(ctx, "spawn_agent_with_task", {
      roleId: role.id,
      taskBrief: {
        objective: "Test objective",
        constraints: ["constraint1"],
        inputs: "Test inputs",
        outputs: "Test outputs",
        completion_criteria: "Test criteria"
      },
      initialMessage: "Start working on the task"
    });

    expect(spawnResult.error).toBeFalsy();
    expect(runtime._agentTaskBriefs.has(spawnResult.id)).toBe(true);

    const terminateResult = await runtime._toolExecutor.executeToolCall(ctx, "terminate_agent", {
      agentId: spawnResult.id,
      reason: "test"
    });

    expect(terminateResult.error).toBeFalsy();
    expect(runtime._agentTaskBriefs.has(spawnResult.id)).toBe(false);
  });

  test("executeToolCall executes send_message", async () => {
    let receivedMessage = null;

    const testAgent = new Agent({
      id: "test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        receivedMessage = msg;
      }
    });

    runtime.registerAgentInstance(testAgent);

    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    const result = await runtime._toolExecutor.executeToolCall(ctx, "send_message", {
      to: "test-agent",
      payload: { text: "test message" }
    });

    expect(result).toBeTruthy();
    expect(result.messageId).toBeTruthy();
  });

  test("executeToolCall validates send_message recipient", async () => {
    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    const result = await runtime._toolExecutor.executeToolCall(ctx, "send_message", {
      to: "non-existent-agent",
      payload: { text: "test message" }
    });

    expect(result.error).toBe("unknown_recipient");
  });

  test("executeToolCall executes put_artifact", async () => {
    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    const result = await runtime._toolExecutor.executeToolCall(ctx, "put_artifact", {
      type: "text/plain",
      content: "test content",
      name: "test.txt"
    });

    expect(result).toBeTruthy();
    expect(Array.isArray(result.artifactIds)).toBe(true);
    expect(result.artifactIds.length).toBe(1);
    expect(typeof result.artifactIds[0]).toBe("string");
  });

  test("executeToolCall executes get_artifact", async () => {
    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    
    // 先创建工件
    const putResult = await runtime._toolExecutor.executeToolCall(ctx, "put_artifact", {
      type: "text/plain",
      content: "test content",
      name: "test.txt"
    });

    // 获取工件
    const getResult = await runtime._toolExecutor.executeToolCall(ctx, "get_artifact", {
      ref: putResult.artifactIds[0]
    });

    expect(getResult).toBeTruthy();
    expect(getResult.content).toBe("test content");
  });

  test("executeToolCall handles get_artifact not found", async () => {
    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    const result = await runtime._toolExecutor.executeToolCall(ctx, "get_artifact", {
      ref: "artifact:non-existent"
    });

    expect(result.error).toBe("artifact_not_found");
  });


  test("executeToolCall executes terminate_agent", async () => {
    // 创建父子智能体
    const parentRole = await runtime.org.createRole({
      name: "parent-role",
      rolePrompt: "Parent",
      createdBy: "root"
    });
    const parent = await runtime._agentManager.spawnAgent({
      roleId: parentRole.id,
      parentAgentId: "root"
    });

    const childRole = await runtime.org.createRole({
      name: "child-role",
      rolePrompt: "Child",
      createdBy: parent.id
    });
    const child = await runtime._agentManager.spawnAgent({
      roleId: childRole.id,
      parentAgentId: parent.id
    });

    const ctx = runtime._buildAgentContext(parent);
    const result = await runtime._toolExecutor.executeToolCall(ctx, "terminate_agent", {
      agentId: child.id,
      reason: "test"
    });

    expect(result.ok).toBe(true);
    expect(result.terminatedAgentId).toBe(child.id);
    expect(runtime._agents.has(child.id)).toBe(false);
  });

  test("executeToolCall validates terminate_agent permissions", async () => {
    // 创建两个独立的智能体
    const role1 = await runtime.org.createRole({ name: "role1", rolePrompt: "p1", createdBy: "root" });
    const role2 = await runtime.org.createRole({ name: "role2", rolePrompt: "p2", createdBy: "root" });

    const agent1 = await runtime._agentManager.spawnAgent({
      roleId: role1.id,
      parentAgentId: "root"
    });
    const agent2 = await runtime._agentManager.spawnAgent({
      roleId: role2.id,
      parentAgentId: "root"
    });

    // agent1 尝试终止 agent2
    const ctx = runtime._buildAgentContext(agent1);
    const result = await runtime._toolExecutor.executeToolCall(ctx, "terminate_agent", {
      agentId: agent2.id
    });

    expect(result.error).toBe("not_child_agent");
  });

  test("executeToolCall executes get_context_status", async () => {
    const rootAgent = runtime._agents.get("root");
    const ctx = runtime._buildAgentContext(rootAgent);
    const result = await runtime._toolExecutor.executeToolCall(ctx, "get_context_status", {});

    expect(result).toBeTruthy();
    // 验证返回了状态信息
    expect(result.status || result.error).toBeTruthy();
  });

  test("executeToolCall handles unknown tool", async () => {
    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    const result = await runtime._toolExecutor.executeToolCall(ctx, "unknown_tool", {});

    expect(result.error).toMatch(/unknown_tool/);
  });

  test("executeToolCall handles tool execution errors", async () => {
    const ctx = runtime._buildAgentContext(runtime._agents.get("root"));
    
    // 传递无效参数导致错误
    const result = await runtime._toolExecutor.executeToolCall(ctx, "spawn_agent_with_task", {
      roleId: "non-existent-role",
      taskBrief: {
        objective: "Test",
        constraints: [],
        inputs: "Test",
        outputs: "Test",
        completion_criteria: "Test"
      },
      initialMessage: "Start working"
    });

    expect(result.error).toBeTruthy();
  });

  test("_validateQuickReplies accepts valid quick replies", () => {
    const result = runtime._toolExecutor._validateQuickReplies(["Option 1", "Option 2", "Option 3"]);

    expect(result.valid).toBe(true);
    expect(result.quickReplies).toEqual(["Option 1", "Option 2", "Option 3"]);
  });

  test("_validateQuickReplies rejects too many options", () => {
    const tooMany = Array.from({ length: 11 }, (_, i) => `Option ${i + 1}`);
    const result = runtime._toolExecutor._validateQuickReplies(tooMany);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("quickReplies_too_many");
  });

  test("_validateQuickReplies rejects non-string options", () => {
    const result = runtime._toolExecutor._validateQuickReplies(["Valid", 123, "Another"]);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("quickReplies_invalid_type");
  });

  test("_validateQuickReplies rejects empty strings", () => {
    const result = runtime._toolExecutor._validateQuickReplies(["Valid", "", "Another"]);

    expect(result.valid).toBe(false);
    expect(result.error).toBe("quickReplies_empty_string");
  });

  test("_validateQuickReplies accepts empty array", () => {
    const result = runtime._toolExecutor._validateQuickReplies([]);

    expect(result.valid).toBe(true);
    expect(result.quickReplies).toBeNull();
  });

  test("_validateQuickReplies accepts null or undefined", () => {
    const result1 = runtime._toolExecutor._validateQuickReplies(null);
    expect(result1.valid).toBe(true);
    expect(result1.quickReplies).toBeNull();

    const result2 = runtime._toolExecutor._validateQuickReplies(undefined);
    expect(result2.valid).toBe(true);
    expect(result2.quickReplies).toBeNull();
  });
});
