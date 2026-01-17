import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { Runtime } from "../../src/platform/runtime.js";
import { formatTaskBrief } from "../../src/platform/utils/message/task_brief.js";

/**
 * Property 2: Task Brief 注入上下文
 * *For any* 通过 spawn_agent 创建的子智能体，其初始上下文应包含完整的 Task_Brief 内容，
 * 包括所有必填字段和提供的可选字段。
 * 
 * **Validates: Requirements 1.5**
 * **Feature: agent-communication-protocol, Property 2: Task Brief 注入上下文**
 */
describe("Property 2: Task Brief 注入上下文", () => {
  test("创建子智能体时 TaskBrief 应被存储并可用于上下文构建", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 TaskBrief
        fc.record({
          objective: fc.string({ minLength: 1, maxLength: 100 }),
          constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
          inputs: fc.string({ minLength: 1, maxLength: 100 }),
          outputs: fc.string({ minLength: 1, maxLength: 100 }),
          completion_criteria: fc.string({ minLength: 1, maxLength: 100 })
        }),
        async (taskBrief) => {
          const runtime = new Runtime();
          
          // 模拟 org 和 roles
          const roles = new Map([
            ["r-parent", { id: "r-parent", name: "parent", createdBy: null, rolePrompt: "parent prompt" }],
            ["r-child", { id: "r-child", name: "child", createdBy: "parent-agent", rolePrompt: "child prompt" }]
          ]);
          runtime.org = { 
            getRole: (roleId) => roles.get(String(roleId)) ?? null 
          };
          
          // 模拟 spawnAgent
          let spawnedAgentId = null;
          const ctx = {
            agent: { id: "parent-agent", roleId: "r-parent" },
            currentMessage: { taskId: "t1" },
            tools: {
              spawnAgent: async (input) => {
                spawnedAgentId = `child-${Date.now()}`;
                return { id: spawnedAgentId, roleId: input.roleId, roleName: "child" };
              }
            }
          };
          
          // 执行 spawn_agent
          const result = await runtime.executeToolCall(ctx, "spawn_agent", {
            roleId: "r-child",
            taskBrief
          });
          
          // 验证创建成功
          expect(result.error).toBeUndefined();
          expect(result.id).toBe(spawnedAgentId);
          
          // 验证 TaskBrief 已存储
          const storedTaskBrief = runtime._agentTaskBriefs.get(spawnedAgentId);
          expect(storedTaskBrief).toBeDefined();
          expect(storedTaskBrief.objective).toBe(taskBrief.objective);
          expect(storedTaskBrief.constraints).toEqual(taskBrief.constraints);
          expect(storedTaskBrief.inputs).toBe(taskBrief.inputs);
          expect(storedTaskBrief.outputs).toBe(taskBrief.outputs);
          expect(storedTaskBrief.completion_criteria).toBe(taskBrief.completion_criteria);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("TaskBrief 格式化后应包含所有必填字段", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 TaskBrief
        fc.record({
          objective: fc.string({ minLength: 1, maxLength: 100 }),
          constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 5 }),
          inputs: fc.string({ minLength: 1, maxLength: 100 }),
          outputs: fc.string({ minLength: 1, maxLength: 100 }),
          completion_criteria: fc.string({ minLength: 1, maxLength: 100 })
        }),
        async (taskBrief) => {
          const formatted = formatTaskBrief(taskBrief);
          
          // 验证格式化后包含所有必填字段
          expect(formatted).toContain("【任务委托书 Task Brief】");
          expect(formatted).toContain("## 目标描述");
          expect(formatted).toContain(taskBrief.objective);
          expect(formatted).toContain("## 技术约束");
          for (const constraint of taskBrief.constraints) {
            expect(formatted).toContain(constraint);
          }
          expect(formatted).toContain("## 输入说明");
          expect(formatted).toContain(taskBrief.inputs);
          expect(formatted).toContain("## 输出要求");
          expect(formatted).toContain(taskBrief.outputs);
          expect(formatted).toContain("## 完成标准");
          expect(formatted).toContain(taskBrief.completion_criteria);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("缺少 TaskBrief 时 spawn_agent 应返回错误", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成无效的 TaskBrief（缺少必填字段）
        fc.oneof(
          fc.constant(undefined),
          fc.constant(null),
          fc.record({
            objective: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            constraints: fc.option(fc.array(fc.string()), { nil: undefined }),
            inputs: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            outputs: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
            completion_criteria: fc.option(fc.string({ minLength: 1 }), { nil: undefined })
          }).filter(tb => {
            // 确保至少缺少一个必填字段
            return !tb || 
              tb.objective === undefined ||
              tb.constraints === undefined ||
              tb.inputs === undefined ||
              tb.outputs === undefined ||
              tb.completion_criteria === undefined;
          })
        ),
        async (invalidTaskBrief) => {
          const runtime = new Runtime();
          
          // 模拟 org 和 roles
          const roles = new Map([
            ["r-parent", { id: "r-parent", name: "parent", createdBy: null }],
            ["r-child", { id: "r-child", name: "child", createdBy: "parent-agent" }]
          ]);
          runtime.org = { 
            getRole: (roleId) => roles.get(String(roleId)) ?? null 
          };
          
          const ctx = {
            agent: { id: "parent-agent", roleId: "r-parent" },
            currentMessage: { taskId: "t1" },
            tools: {
              spawnAgent: async () => {
                throw new Error("Should not be called");
              }
            }
          };
          
          // 执行 spawn_agent
          const result = await runtime.executeToolCall(ctx, "spawn_agent", {
            roleId: "r-child",
            taskBrief: invalidTaskBrief
          });
          
          // 验证返回错误
          expect(result.error).toBe("invalid_task_brief");
          expect(result.missing_fields).toBeDefined();
          expect(result.missing_fields.length).toBeGreaterThan(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 6: 预设协作者处理
 * *For any* 包含 collaborators 字段的 Task_Brief，创建的子智能体的 Contact_Registry 应包含所有预设协作者，
 * 且子智能体应能够直接向这些协作者发送消息。
 * 
 * **Validates: Requirements 2.8, 7.1, 7.2, 7.4**
 * **Feature: agent-communication-protocol, Property 6: 预设协作者处理**
 */
describe("Property 6: 预设协作者处理", () => {
  test("创建子智能体时预设协作者应被添加到联系人注册表", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 TaskBrief 包含协作者
        fc.record({
          objective: fc.string({ minLength: 1, maxLength: 100 }),
          constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
          inputs: fc.string({ minLength: 1, maxLength: 100 }),
          outputs: fc.string({ minLength: 1, maxLength: 100 }),
          completion_criteria: fc.string({ minLength: 1, maxLength: 100 }),
          collaborators: fc.array(
            fc.record({
              agentId: fc.uuid(),
              role: fc.string({ minLength: 1, maxLength: 50 }),
              description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined })
            }),
            { minLength: 1, maxLength: 5 }
          )
        }),
        async (taskBrief) => {
          const runtime = new Runtime();
          
          // 模拟 org 和 roles
          const roles = new Map([
            ["r-parent", { id: "r-parent", name: "parent", createdBy: null, rolePrompt: "parent prompt" }],
            ["r-child", { id: "r-child", name: "child", createdBy: "parent-agent", rolePrompt: "child prompt" }]
          ]);
          runtime.org = { 
            getRole: (roleId) => roles.get(String(roleId)) ?? null 
          };
          
          // 初始化父智能体的联系人注册表
          runtime.contactManager.initRegistry("parent-agent", "root", []);
          
          // 模拟 spawnAgent
          let spawnedAgentId = null;
          const ctx = {
            agent: { id: "parent-agent", roleId: "r-parent" },
            currentMessage: { taskId: "t1" },
            tools: {
              spawnAgent: async (input) => {
                spawnedAgentId = `child-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                return { id: spawnedAgentId, roleId: input.roleId, roleName: "child" };
              }
            }
          };
          
          // 执行 spawn_agent
          const result = await runtime.executeToolCall(ctx, "spawn_agent", {
            roleId: "r-child",
            taskBrief
          });
          
          // 验证创建成功
          expect(result.error).toBeUndefined();
          
          // 验证所有预设协作者都在子智能体的联系人注册表中
          const contacts = runtime.contactManager.listContacts(spawnedAgentId);
          
          for (const collab of taskBrief.collaborators) {
            const contact = contacts.find(c => c.id === collab.agentId);
            expect(contact).toBeDefined();
            expect(contact.role).toBe(collab.role);
            expect(contact.source).toBe('preset');
          }
          
          // 验证子智能体的预设协作者在联系人注册表中
          for (const collab of taskBrief.collaborators) {
            const isKnown = runtime.contactManager.isContactKnown(spawnedAgentId, collab.agentId);
            expect(isKnown.inRegistry).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("没有预设协作者时子智能体只有父智能体在联系人列表中", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 TaskBrief 不包含协作者
        fc.record({
          objective: fc.string({ minLength: 1, maxLength: 100 }),
          constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
          inputs: fc.string({ minLength: 1, maxLength: 100 }),
          outputs: fc.string({ minLength: 1, maxLength: 100 }),
          completion_criteria: fc.string({ minLength: 1, maxLength: 100 })
        }),
        // 生成一个随机的"陌生人"ID
        fc.uuid(),
        async (taskBrief, strangerId) => {
          const runtime = new Runtime();
          
          // 模拟 org 和 roles
          const roles = new Map([
            ["r-parent", { id: "r-parent", name: "parent", createdBy: null, rolePrompt: "parent prompt" }],
            ["r-child", { id: "r-child", name: "child", createdBy: "parent-agent", rolePrompt: "child prompt" }]
          ]);
          runtime.org = { 
            getRole: (roleId) => roles.get(String(roleId)) ?? null 
          };
          
          // 初始化父智能体的联系人注册表
          runtime.contactManager.initRegistry("parent-agent", "root", []);
          
          // 模拟 spawnAgent
          let spawnedAgentId = null;
          const ctx = {
            agent: { id: "parent-agent", roleId: "r-parent" },
            currentMessage: { taskId: "t1" },
            tools: {
              spawnAgent: async (input) => {
                spawnedAgentId = `child-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                return { id: spawnedAgentId, roleId: input.roleId, roleName: "child" };
              }
            }
          };
          
          // 执行 spawn_agent
          const result = await runtime.executeToolCall(ctx, "spawn_agent", {
            roleId: "r-child",
            taskBrief
          });
          
          // 验证创建成功
          expect(result.error).toBeUndefined();
          
          // 验证子智能体只有父智能体在联系人列表中
          const contacts = runtime.contactManager.listContacts(spawnedAgentId);
          expect(contacts.length).toBe(1);
          expect(contacts[0].id).toBe("parent-agent");
          
          // 验证陌生人不在子智能体的联系人列表中（但不阻止发送）
          const isStrangerKnown = runtime.contactManager.isContactKnown(spawnedAgentId, strangerId);
          expect(isStrangerKnown.inRegistry).toBe(false);
          expect(isStrangerKnown.error).toBe('unknown_contact');
          
          // canSendMessage 始终返回 allowed: true（不做验证）
          const canSendToStranger = runtime.contactManager.canSendMessage(spawnedAgentId, strangerId);
          expect(canSendToStranger.allowed).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 4: 父子智能体联系人自动添加
 * *For any* 父智能体创建子智能体后，父智能体的 Contact_Registry 应包含该子智能体作为联系人。
 * 
 * **Validates: Requirements 2.5**
 * **Feature: agent-communication-protocol, Property 4: 父子智能体联系人自动添加**
 */
describe("Property 4: 父子智能体联系人自动添加", () => {
  test("创建子智能体后父智能体的联系人列表应包含子智能体", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 TaskBrief
        fc.record({
          objective: fc.string({ minLength: 1, maxLength: 100 }),
          constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
          inputs: fc.string({ minLength: 1, maxLength: 100 }),
          outputs: fc.string({ minLength: 1, maxLength: 100 }),
          completion_criteria: fc.string({ minLength: 1, maxLength: 100 })
        }),
        async (taskBrief) => {
          const runtime = new Runtime();
          
          // 模拟 org 和 roles
          const roles = new Map([
            ["r-parent", { id: "r-parent", name: "parent", createdBy: null, rolePrompt: "parent prompt" }],
            ["r-child", { id: "r-child", name: "child", createdBy: "parent-agent", rolePrompt: "child prompt" }]
          ]);
          runtime.org = { 
            getRole: (roleId) => roles.get(String(roleId)) ?? null 
          };
          
          // 初始化父智能体的联系人注册表
          runtime.contactManager.initRegistry("parent-agent", "root", []);
          
          // 验证创建前子智能体不在父智能体的联系人列表中
          const childId = `child-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const beforeResult = runtime.contactManager.isContactKnown("parent-agent", childId);
          expect(beforeResult.inRegistry).toBe(false);
          
          // 模拟 spawnAgent
          const ctx = {
            agent: { id: "parent-agent", roleId: "r-parent" },
            currentMessage: { taskId: "t1" },
            tools: {
              spawnAgent: async (input) => {
                return { id: childId, roleId: input.roleId, roleName: "child" };
              }
            }
          };
          
          // 执行 spawn_agent
          const result = await runtime.executeToolCall(ctx, "spawn_agent", {
            roleId: "r-child",
            taskBrief
          });
          
          // 验证创建成功
          expect(result.error).toBeUndefined();
          expect(result.id).toBe(childId);
          
          // 验证创建后子智能体在父智能体的联系人列表中
          const afterResult = runtime.contactManager.isContactKnown("parent-agent", childId);
          expect(afterResult.inRegistry).toBe(true);
          
          // 验证子智能体在父智能体的联系人列表中
          const parentContacts = runtime.contactManager.listContacts("parent-agent");
          const childContact = parentContacts.find(c => c.id === childId);
          expect(childContact).toBeDefined();
          expect(childContact.role).toBe("child");
          expect(childContact.source).toBe("child");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("子智能体创建后应能联系父智能体", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 TaskBrief
        fc.record({
          objective: fc.string({ minLength: 1, maxLength: 100 }),
          constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
          inputs: fc.string({ minLength: 1, maxLength: 100 }),
          outputs: fc.string({ minLength: 1, maxLength: 100 }),
          completion_criteria: fc.string({ minLength: 1, maxLength: 100 })
        }),
        async (taskBrief) => {
          const runtime = new Runtime();
          
          // 模拟 org 和 roles
          const roles = new Map([
            ["r-parent", { id: "r-parent", name: "parent", createdBy: null, rolePrompt: "parent prompt" }],
            ["r-child", { id: "r-child", name: "child", createdBy: "parent-agent", rolePrompt: "child prompt" }]
          ]);
          runtime.org = { 
            getRole: (roleId) => roles.get(String(roleId)) ?? null 
          };
          
          // 初始化父智能体的联系人注册表
          runtime.contactManager.initRegistry("parent-agent", "root", []);
          
          
          // 模拟 spawnAgent
          let spawnedAgentId = null;
          const ctx = {
            agent: { id: "parent-agent", roleId: "r-parent" },
            currentMessage: { taskId: "t1" },
            tools: {
              spawnAgent: async (input) => {
                spawnedAgentId = `child-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                return { id: spawnedAgentId, roleId: input.roleId, roleName: "child" };
              }
            }
          };
          
          // 执行 spawn_agent
          const result = await runtime.executeToolCall(ctx, "spawn_agent", {
            roleId: "r-child",
            taskBrief
          });
          
          // 验证创建成功
          expect(result.error).toBeUndefined();
          
          // 验证父智能体在子智能体的联系人列表中
          const isParentKnown = runtime.contactManager.isContactKnown(spawnedAgentId, "parent-agent");
          expect(isParentKnown.inRegistry).toBe(true);
          
          // 验证父智能体在子智能体的联系人列表中
          const childContacts = runtime.contactManager.listContacts(spawnedAgentId);
          const parentContact = childContacts.find(c => c.id === "parent-agent");
          expect(parentContact).toBeDefined();
          expect(parentContact.source).toBe("parent");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("父子智能体应在联系人列表中互相包含", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 TaskBrief
        fc.record({
          objective: fc.string({ minLength: 1, maxLength: 100 }),
          constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
          inputs: fc.string({ minLength: 1, maxLength: 100 }),
          outputs: fc.string({ minLength: 1, maxLength: 100 }),
          completion_criteria: fc.string({ minLength: 1, maxLength: 100 })
        }),
        async (taskBrief) => {
          const runtime = new Runtime();
          
          // 模拟 org 和 roles
          const roles = new Map([
            ["r-parent", { id: "r-parent", name: "parent", createdBy: null, rolePrompt: "parent prompt" }],
            ["r-child", { id: "r-child", name: "child", createdBy: "parent-agent", rolePrompt: "child prompt" }]
          ]);
          runtime.org = { 
            getRole: (roleId) => roles.get(String(roleId)) ?? null 
          };
          
          // 初始化父智能体的联系人注册表
          runtime.contactManager.initRegistry("parent-agent", "root", []);
          
          // 模拟 spawnAgent
          let spawnedAgentId = null;
          const ctx = {
            agent: { id: "parent-agent", roleId: "r-parent" },
            currentMessage: { taskId: "t1" },
            tools: {
              spawnAgent: async (input) => {
                spawnedAgentId = `child-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                return { id: spawnedAgentId, roleId: input.roleId, roleName: "child" };
              }
            }
          };
          
          // 执行 spawn_agent
          const result = await runtime.executeToolCall(ctx, "spawn_agent", {
            roleId: "r-child",
            taskBrief
          });
          
          // 验证创建成功
          expect(result.error).toBeUndefined();
          
          // 验证双向联系人关系
          const parentKnowsChild = runtime.contactManager.isContactKnown("parent-agent", spawnedAgentId);
          const childKnowsParent = runtime.contactManager.isContactKnown(spawnedAgentId, "parent-agent");
          
          expect(parentKnowsChild.inRegistry).toBe(true);
          expect(childKnowsParent.inRegistry).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 7: 首次消息双向联系
 * *For any* 智能体A向智能体B发送首次消息后，智能体A应被自动添加到智能体B的 Contact_Registry 中。
 * 
 * **Validates: Requirements 5.2**
 * **Feature: agent-communication-protocol, Property 7: 首次消息双向联系**
 */
describe("Property 7: 首次消息双向联系", () => {
  test("首次消息后发送者应被自动添加到接收者的联系人列表", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的 TaskBrief
        fc.record({
          objective: fc.string({ minLength: 1, maxLength: 100 }),
          constraints: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 3 }),
          inputs: fc.string({ minLength: 1, maxLength: 100 }),
          outputs: fc.string({ minLength: 1, maxLength: 100 }),
          completion_criteria: fc.string({ minLength: 1, maxLength: 100 })
        }),
        // 生成消息内容
        fc.record({
          text: fc.string({ minLength: 1, maxLength: 200 })
        }),
        async (taskBrief, payload) => {
          const runtime = new Runtime();
          
          // 模拟 org 和 roles
          const roles = new Map([
            ["r-parent", { id: "r-parent", name: "parent", createdBy: null, rolePrompt: "parent prompt" }],
            ["r-child", { id: "r-child", name: "child", createdBy: "parent-agent", rolePrompt: "child prompt" }]
          ]);
          runtime.org = { 
            getRole: (roleId) => roles.get(String(roleId)) ?? null 
          };
          
          // 初始化父智能体的联系人注册表
          runtime.contactManager.initRegistry("parent-agent", "root", []);
          
          // 模拟 spawnAgent
          let spawnedAgentId = null;
          const spawnCtx = {
            agent: { id: "parent-agent", roleId: "r-parent", roleName: "parent" },
            currentMessage: { taskId: "t1" },
            tools: {
              spawnAgent: async (input) => {
                spawnedAgentId = `child-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                return { id: spawnedAgentId, roleId: input.roleId, roleName: "child" };
              }
            }
          };
          
          // 创建子智能体
          const spawnResult = await runtime.executeToolCall(spawnCtx, "spawn_agent", {
            roleId: "r-child",
            taskBrief
          });
          expect(spawnResult.error).toBeUndefined();
          
          // 注册子智能体到 _agents（模拟运行时行为）
          runtime._agents.set(spawnedAgentId, { id: spawnedAgentId, roleId: "r-child", roleName: "child" });
          
          // 验证首次消息前，子智能体不在父智能体的联系人列表中（除了通过 spawn 添加的）
          // 但父智能体已经在子智能体的联系人列表中
          const childContactsBeforeMessage = runtime.contactManager.listContacts(spawnedAgentId);
          const parentInChildBefore = childContactsBeforeMessage.find(c => c.id === "parent-agent");
          expect(parentInChildBefore).toBeDefined();
          expect(parentInChildBefore.source).toBe("parent");
          
          // 子智能体向父智能体发送消息
          let sentMessageId = null;
          const sendCtx = {
            agent: { id: spawnedAgentId, roleId: "r-child", roleName: "child" },
            currentMessage: { taskId: "t1" },
            tools: {
              sendMessage: (msg) => {
                sentMessageId = `msg-${Date.now()}`;
                return sentMessageId;
              }
            }
          };
          
          // 注册父智能体到 _agents
          runtime._agents.set("parent-agent", { id: "parent-agent", roleId: "r-parent", roleName: "parent" });
          
          const sendResult = await runtime.executeToolCall(sendCtx, "send_message", {
            to: "parent-agent",
            payload
          });
          
          // 验证消息发送成功
          expect(sendResult.error).toBeUndefined();
          expect(sendResult.messageId).toBe(sentMessageId);
          
          // 验证父智能体的联系人列表中已有子智能体（通过 spawn 添加）
          const parentContacts = runtime.contactManager.listContacts("parent-agent");
          const childInParent = parentContacts.find(c => c.id === spawnedAgentId);
          expect(childInParent).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  test("首次消息应建立双向联系（发送者被添加到接收者联系人列表）", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成消息内容
        fc.record({
          text: fc.string({ minLength: 1, maxLength: 200 })
        }),
        async (payload) => {
          const runtime = new Runtime();
          
          // 创建两个智能体，A 认识 B，但 B 不认识 A
          const agentAId = `agent-a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const agentBId = `agent-b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          
          // 初始化 A 的联系人注册表，包含 B
          runtime.contactManager.initRegistry(agentAId, "root", [
            { agentId: agentBId, role: "collaborator", description: "协作者" }
          ]);
          
          // 初始化 B 的联系人注册表，不包含 A
          runtime.contactManager.initRegistry(agentBId, "root", []);
          
          // 验证初始状态：A 可以向 B 发送消息，但 B 不认识 A
          const canASendToB = runtime.contactManager.canSendMessage(agentAId, agentBId);
          expect(canASendToB.allowed).toBe(true);
          
          const bContactsBefore = runtime.contactManager.listContacts(agentBId);
          const aInBBefore = bContactsBefore.find(c => c.id === agentAId);
          expect(aInBBefore).toBeUndefined();
          
          // 注册智能体到 _agents
          runtime._agents.set(agentAId, { id: agentAId, roleId: "r-a", roleName: "agent-a" });
          runtime._agents.set(agentBId, { id: agentBId, roleId: "r-b", roleName: "agent-b" });
          
          // A 向 B 发送首次消息
          let sentMessageId = null;
          const sendCtx = {
            agent: { id: agentAId, roleId: "r-a", roleName: "agent-a" },
            currentMessage: { taskId: "t1" },
            tools: {
              sendMessage: (msg) => {
                sentMessageId = `msg-${Date.now()}`;
                return sentMessageId;
              }
            }
          };
          
          const sendResult = await runtime.executeToolCall(sendCtx, "send_message", {
            to: agentBId,
            payload
          });
          
          // 验证消息发送成功
          expect(sendResult.error).toBeUndefined();
          
          // 验证 A 已被添加到 B 的联系人列表
          const bContactsAfter = runtime.contactManager.listContacts(agentBId);
          const aInBAfter = bContactsAfter.find(c => c.id === agentAId);
          expect(aInBAfter).toBeDefined();
          expect(aInBAfter.source).toBe("first_message");
          expect(aInBAfter.role).toBe("agent-a");
        }
      ),
      { numRuns: 100 }
    );
  });

  test("非首次消息不应重复添加联系人", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成消息内容
        fc.record({
          text: fc.string({ minLength: 1, maxLength: 200 })
        }),
        async (payload) => {
          const runtime = new Runtime();
          
          // 创建两个智能体，互相认识
          const agentAId = `agent-a-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          const agentBId = `agent-b-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          
          // 初始化 A 的联系人注册表，包含 B
          runtime.contactManager.initRegistry(agentAId, "root", [
            { agentId: agentBId, role: "collaborator", description: "协作者" }
          ]);
          
          // 初始化 B 的联系人注册表，包含 A（已经认识）
          runtime.contactManager.initRegistry(agentBId, "root", [
            { agentId: agentAId, role: "partner", description: "合作伙伴" }
          ]);
          
          // 记录 B 的联系人列表初始状态
          const bContactsBefore = runtime.contactManager.listContacts(agentBId);
          const aInBBefore = bContactsBefore.find(c => c.id === agentAId);
          expect(aInBBefore).toBeDefined();
          expect(aInBBefore.source).toBe("preset");
          expect(aInBBefore.role).toBe("partner");
          
          // 注册智能体到 _agents
          runtime._agents.set(agentAId, { id: agentAId, roleId: "r-a", roleName: "agent-a" });
          runtime._agents.set(agentBId, { id: agentBId, roleId: "r-b", roleName: "agent-b" });
          
          // A 向 B 发送消息（非首次，因为 B 已经认识 A）
          let sentMessageId = null;
          const sendCtx = {
            agent: { id: agentAId, roleId: "r-a", roleName: "agent-a" },
            currentMessage: { taskId: "t1" },
            tools: {
              sendMessage: (msg) => {
                sentMessageId = `msg-${Date.now()}`;
                return sentMessageId;
              }
            }
          };
          
          const sendResult = await runtime.executeToolCall(sendCtx, "send_message", {
            to: agentBId,
            payload
          });
          
          // 验证消息发送成功
          expect(sendResult.error).toBeUndefined();
          
          // 验证 B 的联系人列表中 A 的信息没有被覆盖
          const bContactsAfter = runtime.contactManager.listContacts(agentBId);
          const aInBAfter = bContactsAfter.find(c => c.id === agentAId);
          expect(aInBAfter).toBeDefined();
          expect(aInBAfter.source).toBe("preset"); // 保持原来的 source
          expect(aInBAfter.role).toBe("partner"); // 保持原来的 role
        }
      ),
      { numRuns: 100 }
    );
  });
});


/**
 * Property 8: from 字段自动填充
 * *For any* 通过 send_message 发送的消息，系统应自动填充 from 字段为发送者的智能体ID，
 * 无论调用者是否提供该字段。
 * 
 * **Validates: Requirements 9.1, 9.5**
 * **Feature: agent-communication-protocol, Property 8: from 字段自动填充**
 */
describe("Property 8: from 字段自动填充", () => {
  test("send_message 应自动填充 from 字段为发送者ID", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成发送者ID
        fc.uuid(),
        // 生成接收者ID
        fc.uuid(),
        // 生成消息内容
        fc.record({
          text: fc.string({ minLength: 1, maxLength: 200 })
        }),
        async (senderId, recipientId, payload) => {
          // 确保发送者和接收者不同
          fc.pre(senderId !== recipientId);
          
          const runtime = new Runtime();
          
          // 初始化发送者的联系人注册表，包含接收者
          runtime.contactManager.initRegistry(senderId, "root", [
            { agentId: recipientId, role: "recipient", description: "接收者" }
          ]);
          
          // 初始化接收者的联系人注册表
          runtime.contactManager.initRegistry(recipientId, "root", []);
          
          // 注册智能体到 _agents
          runtime._agents.set(senderId, { id: senderId, roleId: "r-sender", roleName: "sender" });
          runtime._agents.set(recipientId, { id: recipientId, roleId: "r-recipient", roleName: "recipient" });
          
          // 记录实际发送的消息
          let actualMessage = null;
          const sendCtx = {
            agent: { id: senderId, roleId: "r-sender", roleName: "sender" },
            currentMessage: { taskId: "t1" },
            tools: {
              sendMessage: (msg) => {
                actualMessage = msg;
                return `msg-${Date.now()}`;
              }
            }
          };
          
          // 发送消息（不提供 from 字段）
          const sendResult = await runtime.executeToolCall(sendCtx, "send_message", {
            to: recipientId,
            payload
          });
          
          // 验证消息发送成功
          expect(sendResult.error).toBeUndefined();
          
          // 验证 from 字段被自动填充为发送者ID
          expect(actualMessage).toBeDefined();
          expect(actualMessage.from).toBe(senderId);
          expect(actualMessage.to).toBe(recipientId);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("send_message 应忽略调用者提供的 from 字段", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成发送者ID
        fc.uuid(),
        // 生成接收者ID
        fc.uuid(),
        // 生成伪造的 from ID
        fc.uuid(),
        // 生成消息内容
        fc.record({
          text: fc.string({ minLength: 1, maxLength: 200 })
        }),
        async (senderId, recipientId, fakeFromId, payload) => {
          // 确保所有ID都不同
          fc.pre(senderId !== recipientId && senderId !== fakeFromId && recipientId !== fakeFromId);
          
          const runtime = new Runtime();
          
          // 初始化发送者的联系人注册表，包含接收者
          runtime.contactManager.initRegistry(senderId, "root", [
            { agentId: recipientId, role: "recipient", description: "接收者" }
          ]);
          
          // 初始化接收者的联系人注册表
          runtime.contactManager.initRegistry(recipientId, "root", []);
          
          // 注册智能体到 _agents
          runtime._agents.set(senderId, { id: senderId, roleId: "r-sender", roleName: "sender" });
          runtime._agents.set(recipientId, { id: recipientId, roleId: "r-recipient", roleName: "recipient" });
          
          // 记录实际发送的消息
          let actualMessage = null;
          const sendCtx = {
            agent: { id: senderId, roleId: "r-sender", roleName: "sender" },
            currentMessage: { taskId: "t1" },
            tools: {
              sendMessage: (msg) => {
                actualMessage = msg;
                return `msg-${Date.now()}`;
              }
            }
          };
          
          // 发送消息（提供伪造的 from 字段，应被忽略）
          const sendResult = await runtime.executeToolCall(sendCtx, "send_message", {
            to: recipientId,
            from: fakeFromId, // 这个应该被忽略
            payload
          });
          
          // 验证消息发送成功
          expect(sendResult.error).toBeUndefined();
          
          // 验证 from 字段被自动填充为实际发送者ID，而不是伪造的ID
          expect(actualMessage).toBeDefined();
          expect(actualMessage.from).toBe(senderId);
          expect(actualMessage.from).not.toBe(fakeFromId);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("send_message 的 from 字段应与 ctx.agent.id 一致", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成发送者ID
        fc.uuid(),
        // 生成接收者ID
        fc.uuid(),
        // 生成角色名
        fc.string({ minLength: 1, maxLength: 50 }),
        // 生成消息内容
        fc.record({
          text: fc.string({ minLength: 1, maxLength: 200 })
        }),
        async (senderId, recipientId, roleName, payload) => {
          // 确保发送者和接收者不同
          fc.pre(senderId !== recipientId);
          
          const runtime = new Runtime();
          
          // 初始化发送者的联系人注册表，包含接收者
          runtime.contactManager.initRegistry(senderId, "root", [
            { agentId: recipientId, role: "recipient", description: "接收者" }
          ]);
          
          // 初始化接收者的联系人注册表
          runtime.contactManager.initRegistry(recipientId, "root", []);
          
          // 注册智能体到 _agents
          runtime._agents.set(senderId, { id: senderId, roleId: "r-sender", roleName });
          runtime._agents.set(recipientId, { id: recipientId, roleId: "r-recipient", roleName: "recipient" });
          
          // 记录实际发送的消息
          let actualMessage = null;
          const sendCtx = {
            agent: { id: senderId, roleId: "r-sender", roleName },
            currentMessage: { taskId: "t1" },
            tools: {
              sendMessage: (msg) => {
                actualMessage = msg;
                return `msg-${Date.now()}`;
              }
            }
          };
          
          // 发送消息
          const sendResult = await runtime.executeToolCall(sendCtx, "send_message", {
            to: recipientId,
            payload
          });
          
          // 验证消息发送成功
          expect(sendResult.error).toBeUndefined();
          
          // 验证 from 字段与 ctx.agent.id 一致
          expect(actualMessage).toBeDefined();
          expect(actualMessage.from).toBe(sendCtx.agent.id);
        }
      ),
      { numRuns: 100 }
    );
  });
});
