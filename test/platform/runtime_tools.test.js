/**
 * RuntimeTools 单元测试
 * 
 * 测试 RuntimeTools 类的工具管理功能，包括：
 * - 工具定义获取
 * - 工具权限检�?
 * - 工具执行
 * - 工具组管�?
 */

import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/core/runtime.js";
import { RuntimeTools } from "../../src/platform/runtime/runtime_tools.js";

describe("RuntimeTools", () => {
  let runtime;
  let tools;
  let tmpDir;
  
  beforeEach(async () => {
    tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_tools_test_" + Date.now());
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

    runtime = new Runtime({ configPath });
    await runtime.init();
    tools = new RuntimeTools(runtime);
  });

  describe("工具定义获取", () => {
    test("获取所有工具定�?, () => {
      const toolDefs = tools.getToolDefinitions();
      
      expect(Array.isArray(toolDefs)).toBe(true);
      expect(toolDefs.length).toBeGreaterThan(0);
      
      // 验证工具定义格式
      const firstTool = toolDefs[0];
      expect(firstTool.type).toBe("function");
      expect(firstTool.function).toBeTruthy();
      expect(firstTool.function.name).toBeTruthy();
    });

    test("root 智能体只能获�?org_management 工具", () => {
      const toolDefs = tools.getToolDefinitionsForAgent("root");
      
      expect(Array.isArray(toolDefs)).toBe(true);
      
      // 验证只包�?org_management 工具
      const toolNames = toolDefs.map(t => t.function?.name).filter(Boolean);
      const orgTools = [
        "find_role_by_name",
        "create_role",
        "list_org_template_infos",
        "get_org_template_org",
        "get_org_structure",
        "spawn_agent_with_task",
        "terminate_agent",
        "send_message"
      ];
      
      // root 应该只有组织管理工具
      for (const toolName of toolNames) {
        expect(orgTools).toContain(toolName);
      }
    });

    test("�?root 智能体可以获取配置的工具�?, async () => {
      // 创建岗位并指定工具组
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test",
        toolGroups: ["artifact", "workspace"]
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const toolDefs = tools.getToolDefinitionsForAgent(agent.id);
      
      expect(Array.isArray(toolDefs)).toBe(true);
      expect(toolDefs.length).toBeGreaterThan(0);
      
      // 验证包含指定工具组的工具
      const toolNames = toolDefs.map(t => t.function?.name).filter(Boolean);
      expect(toolNames.some(name => ["put_artifact", "get_artifact"].includes(name))).toBe(true);
      expect(toolNames.some(name => ["read_file", "write_file", "list_files"].includes(name))).toBe(true);
    });
  });

  describe("工具权限检�?, () => {
    test("root 只能使用 org_management 工具", () => {
      expect(tools.isToolAvailableForAgent("root", "create_role")).toBe(true);
      expect(tools.isToolAvailableForAgent("root", "spawn_agent_with_task")).toBe(true);
      expect(tools.isToolAvailableForAgent("root", "put_artifact")).toBe(false);
      expect(tools.isToolAvailableForAgent("root", "read_file")).toBe(false);
    });

    test("�?root 智能体根据岗位配置检查权�?, async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test",
        toolGroups: ["artifact"]
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      expect(tools.isToolAvailableForAgent(agent.id, "put_artifact")).toBe(true);
      expect(tools.isToolAvailableForAgent(agent.id, "get_artifact")).toBe(true);
      expect(tools.isToolAvailableForAgent(agent.id, "read_file")).toBe(false);
    });

    test("未配置工具组的岗位可以使用所有工�?, async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test"
        // 不指�?toolGroups
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      expect(tools.isToolAvailableForAgent(agent.id, "put_artifact")).toBe(true);
      expect(tools.isToolAvailableForAgent(agent.id, "read_file")).toBe(true);
      expect(tools.isToolAvailableForAgent(agent.id, "http_request")).toBe(true);
    });
  });

  describe("工具组描�?, () => {
    test("生成工具组描述文�?, () => {
      const description = tools.generateToolGroupsDescription();
      
      expect(typeof description).toBe("string");
      expect(description.length).toBeGreaterThan(0);
      expect(description).toContain("工具�?);
      expect(description).toContain("localllm");
    });
  });


  describe("工具执行", () => {
    test("执行工具调用", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test"
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const ctx = runtime._buildAgentContext(agent);

      const result = await tools.executeToolCall(ctx, "get_org_structure", {});
      expect(result).toBeTruthy();
      expect(result.error).toBeUndefined();
      expect(result.self).toBeTruthy();
      expect(result.self.agentId).toBe(agent.id);
      expect(result.selfOrg).toBeTruthy();
      expect(result.selfOrg.workspaceId).toBe(agent.id);
      expect(Array.isArray(result.otherOrgs)).toBe(true);
    });

    test("执行不存在的工具返回错误", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test"
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const ctx = runtime._buildAgentContext(agent);
      
      const result = await tools.executeToolCall(ctx, "nonexistent_tool", {});
      
      expect(result.error).toBeTruthy();
    });
  });

  describe("内置工具组注�?, () => {
    test("注册内置工具�?, () => {
      // 这个方法�?init 时已经被调用
      // 验证工具组已经被注册
      const groups = runtime.toolGroupManager.listGroups();
      
      expect(groups.length).toBeGreaterThan(0);
      expect(groups.some(g => g.id === "org_management")).toBe(true);
      expect(groups.some(g => g.id === "artifact")).toBe(true);
      expect(groups.some(g => g.id === "workspace")).toBe(true);
    });
  });
});
