import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { ToolGroupManager, BUILTIN_TOOL_GROUPS } from "../../src/platform/extensions/tool_group_manager.js";

// ==================== 辅助函数 ====================

/**
 * 生成有效的工具组标识符（避免保留名称）
 */
const validGroupIdArb = fc.string({ minLength: 1, maxLength: 20 })
  .filter(s => /^[a-z][a-z0-9_]*$/.test(s))
  .filter(s => !Object.keys(BUILTIN_TOOL_GROUPS).includes(s));

/**
 * 生成有效的工具名称
 */
const validToolNameArb = fc.string({ minLength: 1, maxLength: 30 })
  .filter(s => /^[a-z][a-z0-9_]*$/.test(s));

/**
 * 生成工具定义
 */
const toolDefArb = validToolNameArb.map(name => ({
  type: "function",
  function: {
    name,
    description: `Description for ${name}`,
    parameters: { type: "object", properties: {} }
  }
}));

/**
 * 生成工具组定义（确保工具名唯一）
 */
const groupDefArb = fc.record({
  description: fc.string({ minLength: 0, maxLength: 100 }),
  tools: fc.uniqueArray(toolDefArb, { 
    minLength: 1, 
    maxLength: 10,
    selector: t => t.function.name
  })
});

// ==================== 属性 1: 工具组注册一致性 ====================
// Feature: tool-group-management, Property 1: 工具组注册一致性
// 验证: 需求 1.1, 1.2, 1.4

describe("属性 1: 工具组注册一致性", () => {
  it("注册成功后，工具组管理器应包含该工具组，且所有工具都能找到其所属工具组", () => {
    fc.assert(
      fc.property(
        validGroupIdArb,
        groupDefArb,
        (groupId, groupDef) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          
          // 注册工具组
          const result = manager.registerGroup(groupId, groupDef);
          
          // 验证注册成功
          expect(result.ok).toBe(true);
          
          // 验证工具组存在
          expect(manager.hasGroup(groupId)).toBe(true);
          
          // 验证所有工具都能找到其所属工具组
          for (const tool of groupDef.tools) {
            const toolName = tool.function.name;
            expect(manager.getToolGroup(toolName)).toBe(groupId);
          }
          
          // 验证工具组信息正确
          const groupInfo = manager.getGroup(groupId);
          expect(groupInfo).not.toBeNull();
          expect(groupInfo.id).toBe(groupId);
          expect(groupInfo.description).toBe(groupDef.description);
          expect(groupInfo.toolCount).toBe(groupDef.tools.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ==================== 属性 2: 工具组注销完整性 ====================
// Feature: tool-group-management, Property 2: 工具组注销完整性
// 验证: 需求 1.5

describe("属性 2: 工具组注销完整性", () => {
  it("注销后，工具组管理器不应再包含该工具组，且所有工具都不应再能找到", () => {
    fc.assert(
      fc.property(
        validGroupIdArb,
        groupDefArb,
        (groupId, groupDef) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          
          // 先注册工具组
          manager.registerGroup(groupId, groupDef);
          expect(manager.hasGroup(groupId)).toBe(true);
          
          // 注销工具组
          const result = manager.unregisterGroup(groupId);
          expect(result.ok).toBe(true);
          
          // 验证工具组不存在
          expect(manager.hasGroup(groupId)).toBe(false);
          
          // 验证所有工具都不能找到其所属工具组
          for (const tool of groupDef.tools) {
            const toolName = tool.function.name;
            expect(manager.getToolGroup(toolName)).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ==================== 属性 3: 保留标识符冲突检测 ====================
// Feature: tool-group-management, Property 3: 保留标识符冲突检测
// 验证: 需求 2.3

describe("属性 3: 保留标识符冲突检测", () => {
  it("尝试使用保留标识符注册工具组应失败", () => {
    const reservedIds = Object.keys(BUILTIN_TOOL_GROUPS);
    
    fc.assert(
      fc.property(
        fc.constantFrom(...reservedIds),
        groupDefArb,
        (reservedId, groupDef) => {
          const manager = new ToolGroupManager({ registerBuiltins: true });
          
          // 尝试使用保留标识符注册
          const result = manager.registerGroup(reservedId, groupDef);
          
          // 验证注册失败
          expect(result.ok).toBe(false);
          expect(result.error).toBe("reserved_group_id");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("尝试注销保留工具组应失败", () => {
    const reservedIds = Object.keys(BUILTIN_TOOL_GROUPS);
    
    fc.assert(
      fc.property(
        fc.constantFrom(...reservedIds),
        (reservedId) => {
          const manager = new ToolGroupManager({ registerBuiltins: true });
          
          // 尝试注销保留工具组
          const result = manager.unregisterGroup(reservedId);
          
          // 验证注销失败
          expect(result.ok).toBe(false);
          expect(result.error).toBe("cannot_unregister_reserved");
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ==================== 属性 6: 工具组查询完整性 ====================
// Feature: tool-group-management, Property 6: 工具组查询完整性
// 验证: 需求 5.1, 5.2, 5.3, 5.4

describe("属性 6: 工具组查询完整性", () => {
  it("查询工具组时，结果应包含正确的标识符、描述和工具数量", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(validGroupIdArb, groupDefArb), { minLength: 1, maxLength: 5 }),
        (groupPairs) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          
          // 注册多个工具组（去重）
          const uniqueGroups = new Map();
          for (const [groupId, groupDef] of groupPairs) {
            if (!uniqueGroups.has(groupId)) {
              uniqueGroups.set(groupId, groupDef);
              manager.registerGroup(groupId, groupDef);
            }
          }
          
          // 列出所有工具组
          const groups = manager.listGroups();
          
          // 验证数量
          expect(groups.length).toBe(uniqueGroups.size);
          
          // 验证每个工具组的信息
          for (const group of groups) {
            expect(group.id).toBeDefined();
            expect(group.description).toBeDefined();
            expect(typeof group.toolCount).toBe("number");
            expect(Array.isArray(group.tools)).toBe(true);
            expect(group.tools.length).toBe(group.toolCount);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("getToolDefinitions 应返回指定工具组的所有工具定义", () => {
    fc.assert(
      fc.property(
        validGroupIdArb,
        groupDefArb,
        (groupId, groupDef) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          manager.registerGroup(groupId, groupDef);
          
          // 获取工具定义
          const tools = manager.getToolDefinitions([groupId]);
          
          // 验证工具数量
          expect(tools.length).toBe(groupDef.tools.length);
          
          // 验证所有工具都在结果中
          const toolNames = tools.map(t => t.function.name);
          for (const tool of groupDef.tools) {
            expect(toolNames).toContain(tool.function.name);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ==================== 单元测试 ====================

describe("ToolGroupManager 单元测试", () => {
  let manager;

  beforeEach(() => {
    manager = new ToolGroupManager({ registerBuiltins: true });
  });

  describe("内置工具组", () => {
    it("应自动注册所有内置工具组", () => {
      const builtinIds = Object.keys(BUILTIN_TOOL_GROUPS);
      
      for (const groupId of builtinIds) {
        expect(manager.hasGroup(groupId)).toBe(true);
        expect(manager.isReservedGroup(groupId)).toBe(true);
      }
    });

    it("getAllGroupIds 应返回所有内置工具组", () => {
      const allIds = manager.getAllGroupIds();
      const builtinIds = Object.keys(BUILTIN_TOOL_GROUPS);
      
      for (const groupId of builtinIds) {
        expect(allIds).toContain(groupId);
      }
    });
  });

  describe("工具定义获取", () => {
    it("getToolDefinitions 应合并多个工具组的工具定义", () => {
      // 注册两个自定义工具组
      manager.registerGroup("custom1", {
        description: "Custom 1",
        tools: [
          { type: "function", function: { name: "tool_a", description: "A" } },
          { type: "function", function: { name: "tool_b", description: "B" } }
        ]
      });
      
      manager.registerGroup("custom2", {
        description: "Custom 2",
        tools: [
          { type: "function", function: { name: "tool_c", description: "C" } }
        ]
      });
      
      const tools = manager.getToolDefinitions(["custom1", "custom2"]);
      
      expect(tools.length).toBe(3);
      const toolNames = tools.map(t => t.function.name);
      expect(toolNames).toContain("tool_a");
      expect(toolNames).toContain("tool_b");
      expect(toolNames).toContain("tool_c");
    });

    it("getToolDefinitions 应去重", () => {
      // 注册两个包含相同工具的工具组
      manager.registerGroup("custom1", {
        description: "Custom 1",
        tools: [
          { type: "function", function: { name: "shared_tool", description: "Shared" } }
        ]
      });
      
      // 注意：由于工具名到工具组的映射是一对一的，后注册的会覆盖
      // 但 getToolDefinitions 应该去重
      const tools = manager.getToolDefinitions(["custom1", "custom1"]);
      
      expect(tools.length).toBe(1);
    });

    it("getToolDefinitions 应忽略不存在的工具组", () => {
      const tools = manager.getToolDefinitions(["nonexistent"]);
      expect(tools.length).toBe(0);
    });
  });

  describe("isToolInGroups", () => {
    it("应正确检查工具是否在指定工具组中", () => {
      manager.registerGroup("test_group", {
        description: "Test",
        tools: [
          { type: "function", function: { name: "test_tool", description: "Test" } }
        ]
      });
      
      expect(manager.isToolInGroups("test_tool", ["test_group"])).toBe(true);
      expect(manager.isToolInGroups("test_tool", ["other_group"])).toBe(false);
      expect(manager.isToolInGroups("nonexistent_tool", ["test_group"])).toBe(false);
    });
  });

  describe("updateGroupTools", () => {
    it("应更新工具组的工具定义", () => {
      const newTools = [
        { type: "function", function: { name: "new_tool_1", description: "New 1" } },
        { type: "function", function: { name: "new_tool_2", description: "New 2" } }
      ];
      
      const result = manager.updateGroupTools("org_management", newTools);
      
      expect(result.ok).toBe(true);
      
      const group = manager.getGroup("org_management");
      expect(group.toolCount).toBe(2);
      expect(group.tools).toContain("new_tool_1");
      expect(group.tools).toContain("new_tool_2");
    });

    it("更新不存在的工具组应失败", () => {
      const result = manager.updateGroupTools("nonexistent", []);
      expect(result.ok).toBe(false);
      expect(result.error).toBe("group_not_found");
    });
  });
});


// ==================== 属性 4: 工具定义构建正确性 ====================
// Feature: tool-group-management, Property 4: 工具定义构建正确性
// 验证: 需求 4.1, 4.2

describe("属性 4: 工具定义构建正确性", () => {
  it("getToolDefinitions 返回的工具定义应只包含配置工具组中的工具", () => {
    fc.assert(
      fc.property(
        validGroupIdArb,
        groupDefArb,
        fc.array(validGroupIdArb, { minLength: 1, maxLength: 3 }),
        fc.array(groupDefArb, { minLength: 1, maxLength: 3 }),
        (groupId1, groupDef1, otherGroupIds, otherGroupDefs) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          
          // 注册第一个工具组
          manager.registerGroup(groupId1, groupDef1);
          
          // 注册其他工具组（确保工具组ID不重复）
          const registeredIds = new Set([groupId1]);
          for (let i = 0; i < Math.min(otherGroupIds.length, otherGroupDefs.length); i++) {
            const gid = otherGroupIds[i];
            if (!registeredIds.has(gid)) {
              manager.registerGroup(gid, otherGroupDefs[i]);
              registeredIds.add(gid);
            }
          }
          
          // 只选择第一个工具组
          const tools = manager.getToolDefinitions([groupId1]);
          const toolNames = tools.map(t => t.function.name);
          
          // 验证所有返回的工具都在选中的工具组中
          for (const toolName of toolNames) {
            const toolGroup = manager.getToolGroup(toolName);
            // 工具可能在第一个工具组中，或者被后注册的工具组覆盖
            // 但返回的工具定义应该来自第一个工具组
            expect(groupDef1.tools.some(t => t.function.name === toolName)).toBe(true);
          }
          
          // 验证没有重复的工具定义
          const uniqueToolNames = new Set(toolNames);
          expect(uniqueToolNames.size).toBe(toolNames.length);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("getToolDefinitions 应包含配置工具组中的所有工具", () => {
    fc.assert(
      fc.property(
        validGroupIdArb,
        groupDefArb,
        (groupId, groupDef) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          manager.registerGroup(groupId, groupDef);
          
          // 获取工具定义
          const tools = manager.getToolDefinitions([groupId]);
          const toolNames = new Set(tools.map(t => t.function.name));
          
          // 验证所有工具组中的工具都在结果中
          for (const tool of groupDef.tools) {
            expect(toolNames.has(tool.function.name)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ==================== 属性 8: 默认工具组行为 ====================
// Feature: tool-group-management, Property 8: 默认工具组行为
// 验证: 需求 3.3

describe("属性 8: 默认工具组行为", () => {
  it("getAllGroupIds 应返回所有已注册的工具组", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(validGroupIdArb, groupDefArb), { minLength: 1, maxLength: 5 }),
        (groupPairs) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          
          // 注册多个工具组（去重）
          const uniqueGroupIds = new Set();
          for (const [groupId, groupDef] of groupPairs) {
            if (!uniqueGroupIds.has(groupId)) {
              uniqueGroupIds.add(groupId);
              manager.registerGroup(groupId, groupDef);
            }
          }
          
          // 获取所有工具组ID
          const allGroupIds = manager.getAllGroupIds();
          
          // 验证数量
          expect(allGroupIds.length).toBe(uniqueGroupIds.size);
          
          // 验证所有注册的工具组都在结果中
          for (const groupId of uniqueGroupIds) {
            expect(allGroupIds).toContain(groupId);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("使用 getAllGroupIds 获取工具定义应返回所有工具", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(validGroupIdArb, groupDefArb), { minLength: 1, maxLength: 3 }),
        (groupPairs) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          
          // 注册多个工具组（去重）
          const allExpectedTools = new Set();
          for (const [groupId, groupDef] of groupPairs) {
            if (!manager.hasGroup(groupId)) {
              manager.registerGroup(groupId, groupDef);
              for (const tool of groupDef.tools) {
                allExpectedTools.add(tool.function.name);
              }
            }
          }
          
          // 使用 getAllGroupIds 获取所有工具定义
          const allGroupIds = manager.getAllGroupIds();
          const tools = manager.getToolDefinitions(allGroupIds);
          const toolNames = new Set(tools.map(t => t.function.name));
          
          // 验证所有工具都在结果中
          for (const expectedTool of allExpectedTools) {
            expect(toolNames.has(expectedTool)).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ==================== 属性 5: 未授权工具调用拒绝 ====================
// Feature: tool-group-management, Property 5: 未授权工具调用拒绝
// 验证: 需求 4.3, 4.4
// 注意: 此属性测试 isToolInGroups 方法的正确性，实际的权限检查在 Runtime 中实现

describe("属性 5: 未授权工具调用拒绝", () => {
  it("isToolInGroups 应正确拒绝不在指定工具组中的工具", () => {
    fc.assert(
      fc.property(
        validGroupIdArb,
        groupDefArb,
        validGroupIdArb,
        (groupId1, groupDef1, groupId2) => {
          // 确保两个工具组ID不同
          if (groupId1 === groupId2) return true;
          
          const manager = new ToolGroupManager({ registerBuiltins: false });
          manager.registerGroup(groupId1, groupDef1);
          
          // 创建一个不同的工具组，包含不同的工具
          const uniqueToolName = `unique_tool_${Date.now()}_${Math.random().toString(36).slice(2)}`;
          const groupDef2 = {
            description: "Test group 2",
            tools: [
              { type: "function", function: { name: uniqueToolName, description: "Unique tool" } }
            ]
          };
          manager.registerGroup(groupId2, groupDef2);
          
          // 验证 uniqueToolName 不在 group1 中
          expect(manager.isToolInGroups(uniqueToolName, [groupId1])).toBe(false);
          
          // 验证 uniqueToolName 在 group2 中
          expect(manager.isToolInGroups(uniqueToolName, [groupId2])).toBe(true);
          
          // 验证 group1 中的工具确实在 group1 中
          for (const tool of groupDef1.tools) {
            const toolName = tool.function.name;
            // 工具可能被 group2 覆盖，所以只检查它是否在某个工具组中
            const toolGroup = manager.getToolGroup(toolName);
            expect(toolGroup).not.toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("isToolInGroups 应正确处理空工具组列表", () => {
    fc.assert(
      fc.property(
        validGroupIdArb,
        groupDefArb,
        (groupId, groupDef) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          manager.registerGroup(groupId, groupDef);
          
          // 空工具组列表应该拒绝所有工具
          for (const tool of groupDef.tools) {
            expect(manager.isToolInGroups(tool.function.name, [])).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("isToolInGroups 应正确处理不存在的工具", () => {
    fc.assert(
      fc.property(
        validGroupIdArb,
        groupDefArb,
        validToolNameArb,
        (groupId, groupDef, randomToolName) => {
          const manager = new ToolGroupManager({ registerBuiltins: false });
          manager.registerGroup(groupId, groupDef);
          
          // 确保随机工具名不在工具组中
          const existingToolNames = groupDef.tools.map(t => t.function.name);
          if (existingToolNames.includes(randomToolName)) return true;
          
          // 不存在的工具应该返回 false
          expect(manager.isToolInGroups(randomToolName, [groupId])).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
});


// ==================== 属性 7: 岗位工具组持久化 ====================
// Feature: tool-group-management, Property 7: 岗位工具组持久化
// 验证: 需求 3.4
// 注意: 此属性测试 OrgPrimitives 的 toolGroups 持久化功能

import { OrgPrimitives } from "../../src/platform/core/org_primitives.js";
import path from "node:path";
import { rm, readFile as fsReadFile } from "node:fs/promises";

describe("属性 7: 岗位工具组持久化", () => {
  it("创建岗位时指定的 toolGroups 应正确持久化", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
        fc.string({ minLength: 0, maxLength: 100 }),
        fc.array(validGroupIdArb, { minLength: 1, maxLength: 5 }),
        async (roleName, rolePrompt, toolGroups) => {
          const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_toolgroups_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(runtimeDir, { recursive: true, force: true });
          
          try {
            const org = new OrgPrimitives({ runtimeDir });
            
            // 创建带 toolGroups 的岗位
            const role = await org.createRole({ 
              name: roleName, 
              rolePrompt, 
              toolGroups 
            });
            
            // 验证返回的岗位包含 toolGroups
            expect(role.toolGroups).toEqual(toolGroups);
            
            // 读取持久化文件验证
            const filePath = path.resolve(runtimeDir, "org.json");
            const raw = await fsReadFile(filePath, "utf8");
            const data = JSON.parse(raw);
            
            const persistedRole = data.roles.find(r => r.id === role.id);
            expect(persistedRole).toBeDefined();
            expect(persistedRole.toolGroups).toEqual(toolGroups);
          } finally {
            await rm(runtimeDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it("更新岗位的 toolGroups 应正确持久化", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
        fc.array(validGroupIdArb, { minLength: 1, maxLength: 3 }),
        fc.array(validGroupIdArb, { minLength: 1, maxLength: 3 }),
        async (roleName, initialToolGroups, updatedToolGroups) => {
          const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_toolgroups_update_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(runtimeDir, { recursive: true, force: true });
          
          try {
            const org = new OrgPrimitives({ runtimeDir });
            
            // 创建带初始 toolGroups 的岗位
            const role = await org.createRole({ 
              name: roleName, 
              rolePrompt: "test", 
              toolGroups: initialToolGroups 
            });
            
            // 更新 toolGroups
            const updatedRole = await org.updateRole(role.id, { 
              toolGroups: updatedToolGroups 
            });
            
            // 验证更新后的岗位包含新的 toolGroups
            expect(updatedRole.toolGroups).toEqual(updatedToolGroups);
            
            // 读取持久化文件验证
            const filePath = path.resolve(runtimeDir, "org.json");
            const raw = await fsReadFile(filePath, "utf8");
            const data = JSON.parse(raw);
            
            const persistedRole = data.roles.find(r => r.id === role.id);
            expect(persistedRole).toBeDefined();
            expect(persistedRole.toolGroups).toEqual(updatedToolGroups);
          } finally {
            await rm(runtimeDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 50 }
    );
  });

  it("不指定 toolGroups 时应为 null（使用默认全部工具组）", async () => {
    const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_toolgroups_null_${Date.now()}`);
    await rm(runtimeDir, { recursive: true, force: true });
    
    try {
      const org = new OrgPrimitives({ runtimeDir });
      
      // 创建不带 toolGroups 的岗位
      const role = await org.createRole({ 
        name: "test_role", 
        rolePrompt: "test" 
      });
      
      // 验证 toolGroups 为 null
      expect(role.toolGroups).toBeNull();
      
      // 读取持久化文件验证
      const filePath = path.resolve(runtimeDir, "org.json");
      const raw = await fsReadFile(filePath, "utf8");
      const data = JSON.parse(raw);
      
      const persistedRole = data.roles.find(r => r.id === role.id);
      expect(persistedRole).toBeDefined();
      expect(persistedRole.toolGroups).toBeNull();
    } finally {
      await rm(runtimeDir, { recursive: true, force: true });
    }
  });

  it("清空 toolGroups（设为空数组）应变为 null", async () => {
    const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_toolgroups_empty_${Date.now()}`);
    await rm(runtimeDir, { recursive: true, force: true });
    
    try {
      const org = new OrgPrimitives({ runtimeDir });
      
      // 创建带 toolGroups 的岗位
      const role = await org.createRole({ 
        name: "test_role", 
        rolePrompt: "test",
        toolGroups: ["artifact", "workspace"]
      });
      
      expect(role.toolGroups).toEqual(["artifact", "workspace"]);
      
      // 更新为空数组
      const updatedRole = await org.updateRole(role.id, { 
        toolGroups: [] 
      });
      
      // 验证 toolGroups 变为 null
      expect(updatedRole.toolGroups).toBeNull();
    } finally {
      await rm(runtimeDir, { recursive: true, force: true });
    }
  });

  it("加载已持久化的岗位应保留 toolGroups", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 30 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s)),
        fc.array(validGroupIdArb, { minLength: 1, maxLength: 5 }),
        async (roleName, toolGroups) => {
          const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_toolgroups_load_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(runtimeDir, { recursive: true, force: true });
          
          try {
            // 第一个实例：创建岗位
            const org1 = new OrgPrimitives({ runtimeDir });
            const role = await org1.createRole({ 
              name: roleName, 
              rolePrompt: "test", 
              toolGroups 
            });
            
            // 第二个实例：加载并验证
            const org2 = new OrgPrimitives({ runtimeDir });
            await org2.loadIfExists();
            
            const loadedRole = org2.getRole(role.id);
            expect(loadedRole).not.toBeNull();
            expect(loadedRole.toolGroups).toEqual(toolGroups);
          } finally {
            await rm(runtimeDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 50 }
    );
  });
});
