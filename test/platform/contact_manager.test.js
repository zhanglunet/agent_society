import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { ContactManager } from "../../src/platform/contact_manager.js";

describe("ContactManager", () => {
  /**
   * Property 3: 联系人注册表初始化
   * *For any* 新创建的智能体（非 root 和 user），其 Contact_Registry 应自动包含父智能体作为联系人。
   * 
   * **Validates: Requirements 2.1, 2.2**
   * **Feature: agent-communication-protocol, Property 3: 联系人注册表初始化**
   */
  test("Property 3: 联系人注册表初始化 - 普通智能体应自动包含父智能体", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的智能体ID（非 root、非 user）
        fc.uuid().filter(id => id !== 'root' && id !== 'user'),
        // 生成有效的父智能体ID
        fc.uuid(),
        async (agentId, parentAgentId) => {
          const manager = new ContactManager();
          
          // 初始化注册表
          manager.initRegistry(agentId, parentAgentId, []);
          
          // 验证注册表已创建
          expect(manager.hasRegistry(agentId)).toBe(true);
          
          // 验证父智能体在联系人列表中
          const contacts = manager.listContacts(agentId);
          const parentContact = contacts.find(c => c.id === parentAgentId);
          
          expect(parentContact).toBeDefined();
          expect(parentContact.source).toBe('parent');
          expect(parentContact.addedAt).toBeDefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: 联系人注册表初始化 - root 智能体应只包含 user
   * 
   * **Validates: Requirements 2.3**
   * **Feature: agent-communication-protocol, Property 3: 联系人注册表初始化**
   */
  test("Property 3: 联系人注册表初始化 - root 智能体应只包含 user", () => {
    const manager = new ContactManager();
    
    // 初始化 root 的注册表
    manager.initRegistry('root', null, []);
    
    // 验证注册表已创建
    expect(manager.hasRegistry('root')).toBe(true);
    
    // 验证只有 user 在联系人列表中
    const contacts = manager.listContacts('root');
    expect(contacts.length).toBe(1);
    expect(contacts[0].id).toBe('user');
    expect(contacts[0].role).toBe('user');
    expect(contacts[0].source).toBe('system');
  });

  /**
   * Property 3: 联系人注册表初始化 - user 应只包含 root
   * 
   * **Validates: Requirements 2.4**
   * **Feature: agent-communication-protocol, Property 3: 联系人注册表初始化**
   */
  test("Property 3: 联系人注册表初始化 - user 应只包含 root", () => {
    const manager = new ContactManager();
    
    // 初始化 user 的注册表
    manager.initRegistry('user', null, []);
    
    // 验证注册表已创建
    expect(manager.hasRegistry('user')).toBe(true);
    
    // 验证只有 root 在联系人列表中
    const contacts = manager.listContacts('user');
    expect(contacts.length).toBe(1);
    expect(contacts[0].id).toBe('root');
    expect(contacts[0].role).toBe('root');
    expect(contacts[0].source).toBe('system');
  });

  /**
   * Property 3: 联系人注册表初始化 - 预设协作者应被添加到注册表
   * 
   * **Validates: Requirements 2.1, 2.8**
   * **Feature: agent-communication-protocol, Property 3: 联系人注册表初始化**
   */
  test("Property 3: 联系人注册表初始化 - 预设协作者应被添加到注册表", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成有效的智能体ID
        fc.uuid().filter(id => id !== 'root' && id !== 'user'),
        // 生成有效的父智能体ID
        fc.uuid(),
        // 生成协作者列表
        fc.array(
          fc.record({
            agentId: fc.uuid(),
            role: fc.string({ minLength: 1, maxLength: 50 }),
            description: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined })
          }),
          { minLength: 0, maxLength: 5 }
        ),
        async (agentId, parentAgentId, collaborators) => {
          const manager = new ContactManager();
          
          // 初始化注册表
          manager.initRegistry(agentId, parentAgentId, collaborators);
          
          // 验证所有协作者都在联系人列表中
          const contacts = manager.listContacts(agentId);
          
          for (const collab of collaborators) {
            const contact = contacts.find(c => c.id === collab.agentId);
            expect(contact).toBeDefined();
            expect(contact.role).toBe(collab.role);
            expect(contact.source).toBe('preset');
          }
          
          // 验证联系人数量正确（父智能体 + 协作者，去重）
          const uniqueIds = new Set([parentAgentId, ...collaborators.map(c => c.agentId)]);
          expect(contacts.length).toBe(uniqueIds.size);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe("ContactManager - 联系人查询", () => {
  /**
   * Property 5: 联系人查询（不阻止发送）
   * 联系人注册表仅用于记录和查询联系人信息，不阻止消息发送。
   * canSendMessage 始终返回 allowed: true。
   * 使用 isContactKnown 来查询联系人是否在注册表中。
   * 
   * **Validates: Requirements 2.6**
   * **Feature: agent-communication-protocol, Property 5: 联系人查询**
   */
  test("Property 5: 联系人查询 - canSendMessage 始终返回 allowed: true", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 发送者ID
        fc.uuid(),
        // 父智能体ID
        fc.uuid(),
        // 接收者ID（不在联系人列表中）
        fc.uuid(),
        async (senderId, parentAgentId, recipientId) => {
          // 确保接收者不是父智能体
          fc.pre(recipientId !== parentAgentId);
          
          const manager = new ContactManager();
          
          // 初始化发送者的注册表（只有父智能体）
          manager.initRegistry(senderId, parentAgentId, []);
          
          // canSendMessage 始终返回 allowed: true（不做验证）
          const result = manager.canSendMessage(senderId, recipientId);
          
          // 验证始终允许发送
          expect(result.allowed).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 联系人查询 - isContactKnown 应正确报告未知联系人
   * 
   * **Validates: Requirements 2.6**
   * **Feature: agent-communication-protocol, Property 5: 联系人查询**
   */
  test("Property 5: 联系人查询 - isContactKnown 应正确报告未知联系人", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 发送者ID
        fc.uuid(),
        // 父智能体ID
        fc.uuid(),
        // 接收者ID（不在联系人列表中）
        fc.uuid(),
        async (senderId, parentAgentId, recipientId) => {
          // 确保接收者不是父智能体
          fc.pre(recipientId !== parentAgentId);
          
          const manager = new ContactManager();
          
          // 初始化发送者的注册表（只有父智能体）
          manager.initRegistry(senderId, parentAgentId, []);
          
          // 使用 isContactKnown 查询联系人状态
          const result = manager.isContactKnown(senderId, recipientId);
          
          // 验证返回未知联系人
          expect(result.inRegistry).toBe(false);
          expect(result.error).toBe('unknown_contact');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 联系人查询 - isContactKnown 应正确报告已知联系人
   * 
   * **Validates: Requirements 2.6**
   * **Feature: agent-communication-protocol, Property 5: 联系人查询**
   */
  test("Property 5: 联系人查询 - isContactKnown 应正确报告已知联系人", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 发送者ID
        fc.uuid(),
        // 父智能体ID（也是已知联系人）
        fc.uuid(),
        async (senderId, parentAgentId) => {
          const manager = new ContactManager();
          
          // 初始化发送者的注册表
          manager.initRegistry(senderId, parentAgentId, []);
          
          // 使用 isContactKnown 查询父智能体（已知联系人）
          const result = manager.isContactKnown(senderId, parentAgentId);
          
          // 验证返回已知联系人
          expect(result.inRegistry).toBe(true);
          expect(result.error).toBeUndefined();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 联系人查询 - 发送者不存在时 isContactKnown 应返回错误
   * 
   * **Validates: Requirements 2.6**
   * **Feature: agent-communication-protocol, Property 5: 联系人查询**
   */
  test("Property 5: 联系人查询 - 发送者不存在时 isContactKnown 应返回错误", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 不存在的发送者ID
        fc.uuid(),
        // 接收者ID
        fc.uuid(),
        async (senderId, recipientId) => {
          const manager = new ContactManager();
          
          // 不初始化任何注册表
          
          // 使用 isContactKnown 查询
          const result = manager.isContactKnown(senderId, recipientId);
          
          // 验证返回错误
          expect(result.inRegistry).toBe(false);
          expect(result.error).toBe('sender_not_found');
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: 联系人查询 - 添加联系人后 isContactKnown 应返回 true
   * 
   * **Validates: Requirements 2.6**
   * **Feature: agent-communication-protocol, Property 5: 联系人查询**
   */
  test("Property 5: 联系人查询 - 添加联系人后 isContactKnown 应返回 true", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 发送者ID
        fc.uuid(),
        // 父智能体ID
        fc.uuid(),
        // 新联系人ID
        fc.uuid(),
        // 新联系人角色
        fc.string({ minLength: 1, maxLength: 50 }),
        async (senderId, parentAgentId, newContactId, newContactRole) => {
          // 确保新联系人不是父智能体
          fc.pre(newContactId !== parentAgentId);
          
          const manager = new ContactManager();
          
          // 初始化发送者的注册表
          manager.initRegistry(senderId, parentAgentId, []);
          
          // 验证初始时 isContactKnown 返回 false
          const beforeResult = manager.isContactKnown(senderId, newContactId);
          expect(beforeResult.inRegistry).toBe(false);
          
          // 添加新联系人
          manager.addContact(senderId, {
            id: newContactId,
            role: newContactRole,
            source: 'introduction'
          });
          
          // 验证添加后 isContactKnown 返回 true
          const afterResult = manager.isContactKnown(senderId, newContactId);
          expect(afterResult.inRegistry).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });
});


describe("ContactManager - 持久化集成", () => {
  /**
   * 测试 ContactManager 与 OrgPrimitives 的持久化集成
   * 
   * **Validates: Requirements 2.7**
   */
  test("联系人注册表应能通过 OrgPrimitives 持久化和恢复", async () => {
    const { OrgPrimitives } = await import("../../src/platform/org_primitives.js");
    const { rm } = await import("node:fs/promises");
    const path = await import("node:path");
    
    const runtimeDir = path.resolve(process.cwd(), `test/.tmp/contact_persist_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await rm(runtimeDir, { recursive: true, force: true });
    
    try {
      // 创建 OrgPrimitives 实例
      const org = new OrgPrimitives({ runtimeDir });
      
      // 创建 ContactManager 并初始化一些联系人
      const manager = new ContactManager();
      manager.initRegistry('agent-1', 'root', [
        { agentId: 'agent-2', role: '程序员', description: '协作开发' }
      ]);
      manager.addContact('agent-1', {
        id: 'agent-3',
        role: '测试员',
        source: 'introduction',
        introducedBy: 'root'
      });
      
      // 保存到 OrgPrimitives
      const contacts = manager.listContacts('agent-1');
      await org.saveContactRegistry('agent-1', contacts);
      
      // 创建新的 OrgPrimitives 实例并加载
      const org2 = new OrgPrimitives({ runtimeDir });
      await org2.loadIfExists();
      
      // 验证联系人数据已恢复
      const loadedContacts = org2.loadContactRegistry('agent-1');
      expect(loadedContacts.length).toBe(contacts.length);
      
      // 验证每个联系人的数据
      const rootContact = loadedContacts.find(c => c.id === 'root');
      expect(rootContact).toBeDefined();
      expect(rootContact.source).toBe('parent');
      
      const agent2Contact = loadedContacts.find(c => c.id === 'agent-2');
      expect(agent2Contact).toBeDefined();
      expect(agent2Contact.role).toBe('程序员');
      expect(agent2Contact.source).toBe('preset');
      
      const agent3Contact = loadedContacts.find(c => c.id === 'agent-3');
      expect(agent3Contact).toBeDefined();
      expect(agent3Contact.role).toBe('测试员');
      expect(agent3Contact.source).toBe('introduction');
      expect(agent3Contact.introducedBy).toBe('root');
    } finally {
      await rm(runtimeDir, { recursive: true, force: true });
    }
  });

  test("删除联系人注册表应从持久化中移除", async () => {
    const { OrgPrimitives } = await import("../../src/platform/org_primitives.js");
    const { rm } = await import("node:fs/promises");
    const path = await import("node:path");
    
    const runtimeDir = path.resolve(process.cwd(), `test/.tmp/contact_remove_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    await rm(runtimeDir, { recursive: true, force: true });
    
    try {
      const org = new OrgPrimitives({ runtimeDir });
      
      // 保存联系人注册表
      await org.saveContactRegistry('agent-1', [
        { id: 'root', role: 'root', source: 'parent' }
      ]);
      
      // 验证已保存
      expect(org.loadContactRegistry('agent-1').length).toBe(1);
      
      // 删除联系人注册表
      await org.removeContactRegistry('agent-1');
      
      // 验证已删除
      expect(org.loadContactRegistry('agent-1').length).toBe(0);
      
      // 重新加载验证持久化
      const org2 = new OrgPrimitives({ runtimeDir });
      await org2.loadIfExists();
      expect(org2.loadContactRegistry('agent-1').length).toBe(0);
    } finally {
      await rm(runtimeDir, { recursive: true, force: true });
    }
  });
});
