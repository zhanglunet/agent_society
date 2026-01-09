import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { OrgPrimitives } from "../../src/platform/org_primitives.js";
import path from "node:path";
import { rm, readFile } from "node:fs/promises";

describe("OrgPrimitives", () => {
  test("createRole and createAgent", async () => {
    const runtimeDir = path.resolve(process.cwd(), "test/.tmp/runtime_test");
    await rm(runtimeDir, { recursive: true, force: true });

    const org = new OrgPrimitives({ runtimeDir });
    const role = await org.createRole({ name: "r1", rolePrompt: "p1" });
    const agent = await org.createAgent({ roleId: role.id, parentAgentId: "root" });

    expect(role.id).toBeTruthy();
    expect(agent.roleId).toBe(role.id);
  });

  test("createAgent throws when parentAgentId is invalid", async () => {
    const runtimeDir = path.resolve(process.cwd(), "test/.tmp/runtime_test_invalid_parent");
    await rm(runtimeDir, { recursive: true, force: true });

    const org = new OrgPrimitives({ runtimeDir });
    const role = await org.createRole({ name: "r1", rolePrompt: "p1" });
    await expect(org.createAgent({ roleId: role.id, parentAgentId: "null" })).rejects.toThrow("invalid_parentAgentId");
  });

  /**
   * Property 13: 组织状态持久化一致性
   * 对于任意创建的岗位或智能体，创建操作完成后立即读取持久化文件应能获取到该记录；
   * 加载时应验证数据结构的完整性。
   * 
   * **验证: 需求 7.1, 7.2**
   */
  test("Property 13: 组织状态持久化一致性 - 创建岗位后立即可读取", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的岗位名称和提示词
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 0, maxLength: 200 }),
        async (name, rolePrompt) => {
          const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_org_role_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(runtimeDir, { recursive: true, force: true });
          
          try {
            const org = new OrgPrimitives({ runtimeDir });
            
            // 创建岗位
            const role = await org.createRole({ name, rolePrompt, createdBy: "root" });
            
            // 立即读取持久化文件
            const filePath = path.resolve(runtimeDir, "org.json");
            const raw = await readFile(filePath, "utf8");
            const data = JSON.parse(raw);
            
            // 验证岗位存在于持久化文件中
            const persistedRole = data.roles.find(r => r.id === role.id);
            expect(persistedRole).toBeDefined();
            expect(persistedRole.name).toBe(name);
            expect(persistedRole.rolePrompt).toBe(rolePrompt);
            expect(persistedRole.createdBy).toBe("root");
            expect(persistedRole.createdAt).toBeDefined();
          } finally {
            await rm(runtimeDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 13: 组织状态持久化一致性 - 创建智能体后立即可读取", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的岗位名称
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // 生成有效的父智能体ID（非空、非"null"、非"undefined"）
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => 
          s.trim().length > 0 && s !== "null" && s !== "undefined"
        ),
        async (roleName, parentAgentId) => {
          const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_org_agent_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(runtimeDir, { recursive: true, force: true });
          
          try {
            const org = new OrgPrimitives({ runtimeDir });
            
            // 先创建岗位
            const role = await org.createRole({ name: roleName, rolePrompt: "test prompt" });
            
            // 创建智能体
            const agent = await org.createAgent({ roleId: role.id, parentAgentId });
            
            // 立即读取持久化文件
            const filePath = path.resolve(runtimeDir, "org.json");
            const raw = await readFile(filePath, "utf8");
            const data = JSON.parse(raw);
            
            // 验证智能体存在于持久化文件中
            const persistedAgent = data.agents.find(a => a.id === agent.id);
            expect(persistedAgent).toBeDefined();
            expect(persistedAgent.roleId).toBe(role.id);
            expect(persistedAgent.parentAgentId).toBe(parentAgentId);
            expect(persistedAgent.createdAt).toBeDefined();
          } finally {
            await rm(runtimeDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 13: 组织状态持久化一致性 - 加载时验证数据结构完整性", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成可能损坏的数据
        fc.oneof(
          // 完全有效的数据
          fc.record({
            roles: fc.array(fc.record({
              id: fc.uuid(),
              name: fc.string({ minLength: 1, maxLength: 50 }),
              rolePrompt: fc.string({ minLength: 0, maxLength: 100 }),
              createdBy: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
              createdAt: fc.constant(new Date().toISOString())
            }), { minLength: 0, maxLength: 5 }),
            agents: fc.array(fc.record({
              id: fc.uuid(),
              roleId: fc.uuid(),
              parentAgentId: fc.string({ minLength: 1, maxLength: 50 }),
              createdAt: fc.constant(new Date().toISOString())
            }), { minLength: 0, maxLength: 5 }),
            terminations: fc.array(fc.record({
              agentId: fc.uuid(),
              terminatedBy: fc.string({ minLength: 1, maxLength: 50 }),
              terminatedAt: fc.constant(new Date().toISOString()),
              reason: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: null })
            }), { minLength: 0, maxLength: 3 })
          }),
          // 部分损坏的数据（缺少必要字段）
          fc.record({
            roles: fc.array(fc.oneof(
              fc.record({ id: fc.uuid(), name: fc.string({ minLength: 1 }), rolePrompt: fc.string() }),
              fc.record({ id: fc.uuid() }), // 缺少name和rolePrompt
              fc.constant(null),
              fc.constant({})
            ), { minLength: 0, maxLength: 3 }),
            agents: fc.array(fc.oneof(
              fc.record({ id: fc.uuid(), roleId: fc.uuid(), parentAgentId: fc.string({ minLength: 1 }) }),
              fc.record({ id: fc.uuid() }), // 缺少roleId和parentAgentId
              fc.constant(null)
            ), { minLength: 0, maxLength: 3 }),
            terminations: fc.constant([])
          })
        ),
        async (testData) => {
          const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_org_validate_${Date.now()}_${Math.random().toString(36).slice(2)}`);
          await rm(runtimeDir, { recursive: true, force: true });
          
          try {
            const { mkdir, writeFile } = await import("node:fs/promises");
            await mkdir(runtimeDir, { recursive: true });
            
            // 写入测试数据
            const filePath = path.resolve(runtimeDir, "org.json");
            await writeFile(filePath, JSON.stringify(testData, null, 2), "utf8");
            
            // 加载并验证
            const org = new OrgPrimitives({ runtimeDir });
            const result = await org.loadIfExists();
            
            // 应该成功加载（即使有验证错误）
            expect(result.loaded).toBe(true);
            
            // 验证只有有效数据被加载
            const roles = org.listRoles();
            const agents = org.listAgents();
            
            // 所有加载的岗位应该有有效的id、name和rolePrompt
            for (const role of roles) {
              expect(typeof role.id).toBe("string");
              expect(role.id.length).toBeGreaterThan(0);
              expect(typeof role.name).toBe("string");
              expect(role.name.length).toBeGreaterThan(0);
              expect(typeof role.rolePrompt).toBe("string");
            }
            
            // 所有加载的智能体应该有有效的id、roleId和parentAgentId
            for (const agent of agents) {
              expect(typeof agent.id).toBe("string");
              expect(agent.id.length).toBeGreaterThan(0);
              expect(typeof agent.roleId).toBe("string");
              expect(agent.roleId.length).toBeGreaterThan(0);
              expect(typeof agent.parentAgentId).toBe("string");
              expect(agent.parentAgentId.length).toBeGreaterThan(0);
            }
          } finally {
            await rm(runtimeDir, { recursive: true, force: true });
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});


  /**
   * Feature: llm-service-selector, Property 7: 岗位 llmServiceId 持久化往返
   * *For any* 创建的岗位（包含或不包含 llmServiceId），持久化后重新加载应得到相同的 llmServiceId 值
   * （包括 null/undefined 情况）。
   * **Validates: Requirements 5.1, 5.2, 5.3**
   */
  describe("Property 7: 岗位 llmServiceId 持久化往返", () => {
    test("创建带 llmServiceId 的岗位，持久化后重新加载应保持一致", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 0, maxLength: 200 }),
          fc.option(fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0), { nil: null }),
          async (name, rolePrompt, llmServiceId) => {
            const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_llm_service_${Date.now()}_${Math.random().toString(36).slice(2)}`);
            await rm(runtimeDir, { recursive: true, force: true });
            
            try {
              // 创建岗位
              const org1 = new OrgPrimitives({ runtimeDir });
              const role = await org1.createRole({ 
                name, 
                rolePrompt, 
                createdBy: "root",
                llmServiceId 
              });
              
              // 验证创建时的 llmServiceId
              expect(role.llmServiceId).toBe(llmServiceId);
              
              // 创建新的 OrgPrimitives 实例并加载
              const org2 = new OrgPrimitives({ runtimeDir });
              await org2.loadIfExists();
              
              // 获取加载后的岗位
              const loadedRole = org2.getRole(role.id);
              
              // 验证 llmServiceId 保持一致
              expect(loadedRole).not.toBeNull();
              expect(loadedRole.llmServiceId).toBe(llmServiceId);
            } finally {
              await rm(runtimeDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    test("不指定 llmServiceId 时默认为 null", async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
          fc.string({ minLength: 0, maxLength: 200 }),
          async (name, rolePrompt) => {
            const runtimeDir = path.resolve(process.cwd(), `test/.tmp/pbt_llm_default_${Date.now()}_${Math.random().toString(36).slice(2)}`);
            await rm(runtimeDir, { recursive: true, force: true });
            
            try {
              const org = new OrgPrimitives({ runtimeDir });
              
              // 创建岗位时不指定 llmServiceId
              const role = await org.createRole({ name, rolePrompt, createdBy: "root" });
              
              // 验证默认值为 null
              expect(role.llmServiceId).toBeNull();
              
              // 重新加载验证
              const org2 = new OrgPrimitives({ runtimeDir });
              await org2.loadIfExists();
              const loadedRole = org2.getRole(role.id);
              
              expect(loadedRole.llmServiceId).toBeNull();
            } finally {
              await rm(runtimeDir, { recursive: true, force: true });
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
