import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { formatMessageForAgent } from "../../src/platform/utils/message/message_formatter.js";

describe("formatMessageForAgent", () => {
  /**
   * Property 9: 消息格式�?
   * *For any* 投递给智能体的消息，格式化后的消息应包含：
   * - 来源标识行（格式�?【来�?{角色名}（{ID}）的消息�?�?【来自用户的消息�?�?
   * - 消息内容
   * - 回复提示（格式为"如需回复，请使用 send_message(to='{发送者ID}', ...)"�?
   * 
   * **Validates: Requirements 9.2, 9.3, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6**
   * **Feature: agent-communication-protocol, Property 9: 消息格式�?*
   */
  test("Property 9: 消息格式�?- 普通智能体消息应包含来源标识、内容和回复提示", async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成�?user 的发送者ID
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s !== 'user' && s.trim().length > 0),
        // 生成发送者角�?
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        // 生成消息内容
        fc.string({ minLength: 1, maxLength: 200 }),
        async (senderId, senderRole, messageContent) => {
          const message = { from: senderId, payload: { text: messageContent } };
          const senderInfo = { role: senderRole };
          const formatted = formatMessageForAgent(message, senderInfo);

          // 验证来源标识行格式（Requirements 10.3�?
          expect(formatted).toContain(`【来�?${senderRole}�?{senderId}）的消息】`);
          
          // 验证消息内容（Requirements 10.2�?
          expect(formatted).toContain(messageContent);
          
          // 验证回复提示（Requirements 10.5�?
          expect(formatted).toContain(`如需回复，请使用 send_message(to='${senderId}', ...)`);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 9: 消息格式�?- 用户消息应使用特殊格式且无回复提�?, async () => {
    await fc.assert(
      fc.asyncProperty(
        // 生成消息内容
        fc.string({ minLength: 1, maxLength: 200 }),
        async (messageContent) => {
          const message = { from: 'user', payload: { text: messageContent } };
          const senderInfo = { role: 'user' };
          const formatted = formatMessageForAgent(message, senderInfo);
          
          // 验证用户消息的特殊格式（Requirements 10.4�?
          expect(formatted).toContain('【来自用户的消息�?);
          
          // 验证消息内容（Requirements 10.2�?
          expect(formatted).toContain(messageContent);
          
          // 验证用户消息不包含回复提�?
          expect(formatted).not.toContain('如需回复');
          expect(formatted).not.toContain('send_message');
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 9: 消息格式�?- payload 为对象时应正确提取内�?, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s !== 'user' && s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.oneof(
          // payload.text 形式
          fc.record({ text: fc.string({ minLength: 1, maxLength: 100 }) }),
          // payload.content 形式
          fc.record({ content: fc.string({ minLength: 1, maxLength: 100 }) })
        ),
        async (senderId, senderRole, payload) => {
          const message = { from: senderId, payload };
          const senderInfo = { role: senderRole };
          const formatted = formatMessageForAgent(message, senderInfo);
          
          // 验证内容被正确提�?
          const expectedContent = payload.text ?? payload.content;
          expect(formatted).toContain(expectedContent);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Property 9: 消息格式�?- payload 为字符串时应直接使用", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s !== 'user' && s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
        fc.string({ minLength: 1, maxLength: 200 }),
        async (senderId, senderRole, payloadString) => {
          const message = { from: senderId, payload: payloadString };
          const senderInfo = { role: senderRole };
          const formatted = formatMessageForAgent(message, senderInfo);
          
          // 验证字符�?payload 被直接使�?
          expect(formatted).toContain(payloadString);
        }
      ),
      { numRuns: 100 }
    );
  });

  // 单元测试：边界情�?
  test("格式化消�?- 缺少 senderInfo 时应使用 unknown 作为角色", () => {
    const message = { from: 'agent-123', payload: { text: '测试消息' } };
    const formatted = formatMessageForAgent(message, null);
    
    expect(formatted).toContain('【来�?unknown（agent-123）的消息�?);
    expect(formatted).toContain('测试消息');
  });

  test("格式化消�?- payload �?null 时应处理为空内容", () => {
    const message = { from: 'agent-123', payload: null };
    const senderInfo = { role: '程序�? };
    const formatted = formatMessageForAgent(message, senderInfo);
    
    expect(formatted).toContain('【来�?程序员（agent-123）的消息�?);
    expect(formatted).toContain("如需回复，请使用 send_message(to='agent-123', ...)");
  });

  test("格式化消�?- payload 为复杂对象时�?JSON 序列�?, () => {
    const message = { 
      from: 'agent-123', 
      payload: { type: 'task', data: { id: 1, name: 'test' } } 
    };
    const senderInfo = { role: '架构�? };
    const formatted = formatMessageForAgent(message, senderInfo);
    
    expect(formatted).toContain('【来�?架构师（agent-123）的消息�?);
    // 复杂对象应被 JSON 序列�?
    expect(formatted).toContain('"type":"task"');
  });

  test("格式化消�?- message.from 缺失时应使用 unknown", () => {
    const message = { payload: { text: '测试消息' } };
    const senderInfo = { role: '测试�? };
    const formatted = formatMessageForAgent(message, senderInfo);
    
    expect(formatted).toContain('【来�?测试员（unknown）的消息�?);
  });
});
