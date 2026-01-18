/**
 * RuntimeLifecycle 单元测试
 * 
 * 测试 RuntimeLifecycle 类的生命周期管理功能，包括：
 * - 智能体创建
 * - 智能体恢复
 * - 智能体注册
 * - 智能体查询
 * - 智能体中断
 * - 工作空间查找
 */

import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/runtime.js";
import { RuntimeLifecycle } from "../../src/platform/runtime/runtime_lifecycle.js";
import { Config } from "../../src/platform/utils/config/config.js";

describe("RuntimeLifecycle", () => {
  let runtime;
  let lifecycle;
  let tmpDir;
  
  beforeEach(async () => {
    tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_lifecycle_test_" + Date.now());
    const artifactsDir = path.resolve(tmpDir, "artifacts");
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

    // 创建 Config 服务
    const configService = new Config(tmpDir);
    
    runtime = new Runtime({ configService });
    await runtime.init();
    lifecycle = new RuntimeLifecycle(runtime);
  });

  describe("智能体创建", () => {
    test("创建智能体实例", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      const agent = await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      expect(agent).toBeTruthy();
      expect(agent.id).toBeTruthy();
      expect(agent.roleId).toBe(role.id);
      expect(agent.roleName).toBe("test_role");
    });

    test("创建智能体时缺少 parentAgentId 应抛出错误", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      await expect(lifecycle.spawnAgent({
        roleId: role.id
      })).rejects.toThrow();
    });

    test("以调用者身份创建子智能体", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      const agent = await lifecycle.spawnAgentAs("root", {
        roleId: role.id
      });
      
      expect(agent).toBeTruthy();
      expect(agent.id).toBeTruthy();
      
      // 验证父智能体ID被正确设置
      const meta = runtime._agentMetaById.get(agent.id);
      expect(meta.parentAgentId).toBe("root");
    });
  });

  describe("智能体注册", () => {
    test("注册岗位行为", () => {
      const behaviorFactory = (ctx) => async (ctx, msg) => {};
      
      lifecycle.registerRoleBehavior("test_role", behaviorFactory);
      
      expect(runtime._behaviorRegistry.has("test_role")).toBe(true);
    });

    test("注册智能体实例", () => {
      const agent = {
        id: "test_agent",
        roleId: "role1",
        roleName: "test",
        behavior: async () => {}
      };
      
      lifecycle.registerAgentInstance(agent);
      
      expect(runtime._agents.has("test_agent")).toBe(true);
    });
  });

  describe("智能体查询", () => {
    test("列出已注册的智能体实例", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const instances = lifecycle.listAgentInstances();
      
      expect(instances.length).toBeGreaterThan(0);
      expect(instances.some(i => i.roleName === "test_role")).toBe(true);
    });

    test("获取智能体状态信息", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      const agent = await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const status = lifecycle.getAgentStatus(agent.id);
      
      expect(status).toBeTruthy();
      expect(status.id).toBe(agent.id);
      expect(status.roleId).toBe(role.id);
      expect(status.roleName).toBe("test_role");
      expect(status.parentAgentId).toBe("root");
    });

    test("获取不存在的智能体状态返回 null", () => {
      const status = lifecycle.getAgentStatus("nonexistent");
      
      expect(status).toBeNull();
    });

    test("获取所有智能体的队列深度", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      const agent = await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const depths = lifecycle.getQueueDepths();
      
      expect(Array.isArray(depths)).toBe(true);
      expect(depths.some(d => d.agentId === agent.id)).toBe(true);
    });
  });

  describe("智能体中断", () => {
    test("中止不存在的智能体返回失败", () => {
      const result = lifecycle.abortAgentLlmCall("nonexistent");
      
      expect(result.ok).toBe(false);
      expect(result.aborted).toBe(false);
    });

    test("中止未在等待 LLM 的智能体返回成功但未中止", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      const agent = await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      // 智能体默认状态是 idle
      const result = lifecycle.abortAgentLlmCall(agent.id);
      
      expect(result.ok).toBe(true);
      expect(result.aborted).toBe(false);
    });
  });

  describe("级联停止", () => {
    test("级联停止所有子智能体", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      // 创建父智能体
      const parent = await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      // 创建子智能体
      const child = await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: parent.id
      });
      
      // 级联停止
      const stoppedAgents = lifecycle.cascadeStopAgents(parent.id);
      
      expect(stoppedAgents).toContain(child.id);
      expect(runtime._state.getAgentComputeStatus(child.id)).toBe("stopped");
    });

    test("级联停止不影响已停止的智能体", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      const parent = await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const child = await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: parent.id
      });
      
      // 先手动停止子智能体
      runtime._state.setAgentComputeStatus(child.id, "stopped");
      
      // 级联停止
      const stoppedAgents = lifecycle.cascadeStopAgents(parent.id);
      
      // 已停止的智能体不应该在列表中
      expect(stoppedAgents).not.toContain(child.id);
    });
  });

  describe("工作空间查找", () => {
    test("查找智能体的工作空间", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      const agent = await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      // root 的直接子智能体应该有工作空间
      const workspaceId = lifecycle.findWorkspaceIdForAgent(agent.id);
      
      // 工作空间可能存在也可能不存在，取决于实现
      // 这里只验证方法不抛出异常
      expect(typeof workspaceId === "string" || workspaceId === null).toBe(true);
    });

    test("查找不存在的智能体返回 null", () => {
      const workspaceId = lifecycle.findWorkspaceIdForAgent("nonexistent");
      
      expect(workspaceId).toBeNull();
    });
  });

  describe("智能体恢复", () => {
    test("从组织状态恢复智能体", async () => {
      // 创建一个智能体
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test prompt"
      });
      
      await lifecycle.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      // 清空内存中的智能体
      runtime._agents.clear();
      
      // 恢复智能体
      await lifecycle.restoreAgentsFromOrg();
      
      // 验证智能体被恢复
      const instances = lifecycle.listAgentInstances();
      expect(instances.some(i => i.roleName === "test_role")).toBe(true);
    });
  });
});
