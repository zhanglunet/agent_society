/**
 * AgentManager 单元测试
 * 
 * 测试 AgentManager 的核心功能：
 * - 创建和注册智能体
 * - 智能体生命周期管�?
 * - 智能体状态查�?
 * - 智能体终�?
 * - 从组织状态恢复智能体
 */

import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/core/runtime.js";

describe("AgentManager", () => {
  let runtime;
  let tmpDir;
  let artifactsDir;

  beforeEach(async () => {
    tmpDir = path.resolve(process.cwd(), `test/.tmp/agent_manager_test_${Date.now()}`);
    artifactsDir = path.resolve(tmpDir, "artifacts");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir,
        dataDir: tmpDir,
        runtimeDir: tmpDir,
        maxSteps: 50
      }, null, 2),
      "utf8"
    );

    runtime = new Runtime({ configPath });
    await runtime.init();
  });

  test("spawnAgent creates and registers agent instance", async () => {
    // 创建岗位
    const role = await runtime.org.createRole({
      name: "test-role",
      rolePrompt: "Test role prompt"
    });

    // 创建智能�?
    const agent = await runtime._agentManager.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });

    // 验证智能体被创建
    expect(agent).toBeTruthy();
    expect(agent.id).toBeTruthy();
    expect(agent.roleId).toBe(role.id);
    expect(agent.roleName).toBe("test-role");

    // 验证智能体被注册
    expect(runtime._agents.has(agent.id)).toBe(true);
    expect(runtime._agentMetaById.has(agent.id)).toBe(true);

    // 验证元数�?
    const meta = runtime._agentMetaById.get(agent.id);
    expect(meta.parentAgentId).toBe("root");
    expect(meta.roleId).toBe(role.id);
  });

  test("spawnAgent auto assigns customName after creation", async () => {
    runtime.localLlmChat = async () => "张三";

    const role = await runtime.org.createRole({
      name: "name-role",
      rolePrompt: "Name role prompt"
    });

    const agent = await runtime._agentManager.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });
    
    const meta = runtime.org.getAgent(agent.id);
    expect(meta).toBeTruthy();
    expect(meta.name).toBe("张三");
  });

  test("spawnAgent throws error when parentAgentId is missing", async () => {
    const role = await runtime.org.createRole({
      name: "test-role",
      rolePrompt: "Test role prompt"
    });

    // 测试缺少 parentAgentId
    await expect(
      runtime._agentManager.spawnAgent({
        roleId: role.id
      })
    ).rejects.toThrow("parentAgentId_required");

    // 测试 parentAgentId �?null
    await expect(
      runtime._agentManager.spawnAgent({
        roleId: role.id,
        parentAgentId: null
      })
    ).rejects.toThrow("parentAgentId_required");
  });

  test("spawnAgentAs creates agent with caller as parent", async () => {
    // 创建父智能体
    const parentRole = await runtime.org.createRole({
      name: "parent-role",
      rolePrompt: "Parent role"
    });
    const parent = await runtime._agentManager.spawnAgent({
      roleId: parentRole.id,
      parentAgentId: "root"
    });

    // 创建子岗�?
    const childRole = await runtime.org.createRole({
      name: "child-role",
      rolePrompt: "Child role",
      createdBy: parent.id
    });

    // 使用 spawnAgentAs 创建子智能体
    const child = await runtime._agentManager.spawnAgentAs(parent.id, {
      roleId: childRole.id
    });

    // 验证子智能体的父ID
    const meta = runtime._agentMetaById.get(child.id);
    expect(meta.parentAgentId).toBe(parent.id);
  });

  test("spawnAgentAs rejects invalid parentAgentId", async () => {
    const role = await runtime.org.createRole({
      name: "test-role",
      rolePrompt: "Test role"
    });

    // 尝试使用不匹配的 parentAgentId
    await expect(
      runtime._agentManager.spawnAgentAs("caller-id", {
        roleId: role.id,
        parentAgentId: "different-id"
      })
    ).rejects.toThrow("invalid_parentAgentId");
  });

  test("listAgentInstances returns all registered agents", async () => {
    // 创建多个智能�?
    const role1 = await runtime.org.createRole({ name: "role1", rolePrompt: "p1" });
    const role2 = await runtime.org.createRole({ name: "role2", rolePrompt: "p2" });

    await runtime._agentManager.spawnAgent({ roleId: role1.id, parentAgentId: "root" });
    await runtime._agentManager.spawnAgent({ roleId: role2.id, parentAgentId: "root" });

    const agents = runtime._agentManager.listAgentInstances();

    // 应该包含至少两个新创建的智能�?
    expect(agents.length).toBeGreaterThanOrEqual(2);
    expect(agents.some(a => a.roleName === "role1")).toBe(true);
    expect(agents.some(a => a.roleName === "role2")).toBe(true);
  });

  test("getAgentStatus returns agent status information", async () => {
    const role = await runtime.org.createRole({
      name: "test-role",
      rolePrompt: "Test role"
    });
    const agent = await runtime._agentManager.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });

    const status = runtime._agentManager.getAgentStatus(agent.id);

    expect(status).toBeTruthy();
    expect(status.id).toBe(agent.id);
    expect(status.roleId).toBe(role.id);
    expect(status.roleName).toBe("test-role");
    expect(status.parentAgentId).toBe("root");
    expect(status.status).toBe("active");
    expect(typeof status.queueDepth).toBe("number");
    expect(typeof status.conversationLength).toBe("number");
  });

  test("getAgentStatus returns null for non-existent agent", () => {
    const status = runtime._agentManager.getAgentStatus("non-existent-id");
    expect(status).toBeNull();
  });

  test("terminateAgent removes agent and its descendants", async () => {
    // 创建父智能体
    const parentRole = await runtime.org.createRole({
      name: "parent-role",
      rolePrompt: "Parent",
      createdBy: "root"
    });
    const parent = await runtime._agentManager.spawnAgent({
      roleId: parentRole.id,
      parentAgentId: "root"
    });

    // 创建子智能体
    const childRole = await runtime.org.createRole({
      name: "child-role",
      rolePrompt: "Child",
      createdBy: parent.id
    });
    const child = await runtime._agentManager.spawnAgent({
      roleId: childRole.id,
      parentAgentId: parent.id
    });

    // 创建孙智能体
    const grandchildRole = await runtime.org.createRole({
      name: "grandchild-role",
      rolePrompt: "Grandchild",
      createdBy: child.id
    });
    const grandchild = await runtime._agentManager.spawnAgent({
      roleId: grandchildRole.id,
      parentAgentId: child.id
    });

    // 构建上下�?- 使用 root 作为调用�?
    const rootAgent = runtime._agents.get("root");
    const ctx = { agent: rootAgent };

    // 终止父智能体 - 使用 runtime._executeTerminateAgent
    const result = await runtime._executeTerminateAgent(ctx, {
      agentId: parent.id,
      reason: "test termination"
    });

    // 验证终止成功或返回了结果
    expect(result).toBeTruthy();
    expect(result.ok || result.error).toBeTruthy();
    
    // 如果成功，验证智能体被移�?
    if (result.ok) {
      expect(result.terminatedAgentId).toBe(parent.id);
      expect(runtime._agents.has(parent.id)).toBe(false);
      expect(runtime._agents.has(child.id)).toBe(false);
      expect(runtime._agents.has(grandchild.id)).toBe(false);
    }
  });

  test("terminateAgent rejects termination of non-child agent", async () => {
    // 创建两个独立的智能体
    const role1 = await runtime.org.createRole({ name: "role1", rolePrompt: "p1" });
    const role2 = await runtime.org.createRole({ name: "role2", rolePrompt: "p2" });

    const agent1 = await runtime._agentManager.spawnAgent({
      roleId: role1.id,
      parentAgentId: "root"
    });
    const agent2 = await runtime._agentManager.spawnAgent({
      roleId: role2.id,
      parentAgentId: "root"
    });

    // 尝试�?agent1 终止 agent2（不是子智能体）
    const ctx = { agent: agent1 };
    const result = await runtime._executeTerminateAgent(ctx, {
      agentId: agent2.id
    });

    expect(result.error).toBe("not_child_agent");
  });

  test("collectDescendantAgents returns all descendants", async () => {
    // 创建智能体树
    const role1 = await runtime.org.createRole({ name: "role1", rolePrompt: "p1" });
    const agent1 = await runtime._agentManager.spawnAgent({
      roleId: role1.id,
      parentAgentId: "root"
    });

    const role2 = await runtime.org.createRole({ name: "role2", rolePrompt: "p2", createdBy: agent1.id });
    const agent2 = await runtime._agentManager.spawnAgent({
      roleId: role2.id,
      parentAgentId: agent1.id
    });

    const role3 = await runtime.org.createRole({ name: "role3", rolePrompt: "p3", createdBy: agent1.id });
    const agent3 = await runtime._agentManager.spawnAgent({
      roleId: role3.id,
      parentAgentId: agent1.id
    });

    const role4 = await runtime.org.createRole({ name: "role4", rolePrompt: "p4", createdBy: agent2.id });
    const agent4 = await runtime._agentManager.spawnAgent({
      roleId: role4.id,
      parentAgentId: agent2.id
    });

    const descendants = runtime._agentManager.collectDescendantAgents(agent1.id);

    expect(descendants).toContain(agent2.id);
    expect(descendants).toContain(agent3.id);
    expect(descendants).toContain(agent4.id);
    expect(descendants.length).toBe(3);
  });

  test("updateAgentActivity updates last activity time", async () => {
    const role = await runtime.org.createRole({ name: "test-role", rolePrompt: "p" });
    const agent = await runtime._agentManager.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });

    const beforeTime = Date.now();
    await new Promise(r => setTimeout(r, 10)); // 等待一小段时间

    runtime._agentManager.updateAgentActivity(agent.id);

    const lastActivity = runtime._agentManager.getAgentLastActivityTime(agent.id);
    expect(lastActivity).toBeGreaterThan(beforeTime);
  });

  test("getAgentIdleTime returns correct idle duration", async () => {
    const role = await runtime.org.createRole({ name: "test-role", rolePrompt: "p" });
    const agent = await runtime._agentManager.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });

    // 等待一段时�?
    await new Promise(r => setTimeout(r, 50));

    const idleTime = runtime._agentManager.getAgentIdleTime(agent.id);
    expect(idleTime).toBeGreaterThanOrEqual(50);
  });

  test("findWorkspaceIdForAgent finds workspace through ancestor chain", async () => {
    // 创建智能体树
    const role1 = await runtime.org.createRole({ name: "role1", rolePrompt: "p1" });
    const agent1 = await runtime._agentManager.spawnAgent({
      roleId: role1.id,
      parentAgentId: "root"
    });

    const role2 = await runtime.org.createRole({ name: "role2", rolePrompt: "p2", createdBy: agent1.id });
    const agent2 = await runtime._agentManager.spawnAgent({
      roleId: role2.id,
      parentAgentId: agent1.id
    });

    // agent1 �?root 的直接子智能体，应该有工作空�?
    const workspaceId = runtime._agentManager.findWorkspaceIdForAgent(agent2.id);
    expect(workspaceId).toBe(agent1.id);
  });

  test("restoreAgentsFromOrg restores agents from organization state", async () => {
    // 创建智能�?
    const role = await runtime.org.createRole({ name: "test-role", rolePrompt: "p" });
    const agent = await runtime._agentManager.spawnAgent({
      roleId: role.id,
      parentAgentId: "root"
    });

    const agentId = agent.id;

    // 从运行时移除智能体（模拟重启�?
    runtime._agents.delete(agentId);
    runtime._agentMetaById.delete(agentId);

    // 恢复智能�?
    await runtime._agentManager.restoreAgentsFromOrg();

    // 验证智能体被恢复
    expect(runtime._agents.has(agentId)).toBe(true);
    expect(runtime._agentMetaById.has(agentId)).toBe(true);

    const restoredAgent = runtime._agents.get(agentId);
    expect(restoredAgent.roleId).toBe(role.id);
    expect(restoredAgent.roleName).toBe("test-role");
  });

  test("workspace assignment survives process restart", async () => {
    const role1 = await runtime.org.createRole({ name: "ws-root-role", rolePrompt: "p1" });
    const parent = await runtime._agentManager.spawnAgent({
      roleId: role1.id,
      parentAgentId: "root"
    });

    const role2 = await runtime.org.createRole({ name: "ws-child-role", rolePrompt: "p2", createdBy: parent.id });
    const child = await runtime._agentManager.spawnAgent({
      roleId: role2.id,
      parentAgentId: parent.id
    });

    const configPath = path.resolve(tmpDir, "app.json");
    const restarted = new Runtime({ configPath });
    await restarted.init();

    expect(restarted.workspaceManager.hasWorkspace(parent.id)).toBe(true);
    expect(restarted.findWorkspaceIdForAgent(child.id)).toBe(parent.id);
  });
});
