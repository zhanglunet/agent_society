/**
 * ConversationManager 聊天历史清理功能属性测试
 * 使用基于属性的测试验证清理功能的正确性
 * 
 * Feature: agent-concurrent-request-management
 */

import { describe, test, expect, beforeEach } from "vitest";
import { ConversationManager } from "../../src/platform/conversation_manager.js";
import fc from "fast-check";

describe("ConversationManager - 聊天历史清理属性测试", () => {
  /**
   * Property 3: Canceled Tool Calls Removed from History
   * 
   * 对于任何被取消的工具调用，工具调用请求和所有相关响应应该从智能体的聊天历史中完全移除，
   * 且不留下孤立的引用。
   * 
   * **Validates: Requirements 2.3, 2.4, 3.1, 3.2, 7.3**
   */
  test("Property 3: 取消的工具调用从历史中完全移除且无孤立引用", () => {
    fc.assert(
      fc.property(
        // 生成智能体ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // 生成工具调用ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // 生成工具名称
        fc.string({ minLength: 1, maxLength: 20 }),
        // 生成响应数量（0-5个）
        fc.integer({ min: 0, max: 5 }),
        (agentId, toolCallId, toolName, responseCount) => {
          const manager = new ConversationManager();
          const systemPrompt = "测试系统提示词";
          
          // 初始化会话
          const conv = manager.ensureConversation(agentId, systemPrompt);
          const initialLength = conv.length;
          
          // 添加工具调用
          conv.push({
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: toolCallId,
                type: "function",
                function: { name: toolName, arguments: "{}" }
              }
            ]
          });
          
          // 添加多个响应
          for (let i = 0; i < responseCount; i++) {
            conv.push({
              role: "tool",
              tool_call_id: toolCallId,
              content: JSON.stringify({ result: `response_${i}` })
            });
          }

          // 移除工具调用
          const removeCallResult = manager.removeToolCallEntry(agentId, toolCallId);
          
          // 移除所有响应
          const removeResponseResult = manager.removeToolResponseEntry(agentId, toolCallId);
          
          // 验证工具调用被移除
          expect(removeCallResult.removed).toBe(true);
          
          // 验证响应被移除（如果有响应）
          if (responseCount > 0) {
            expect(removeResponseResult.removed).toBe(true);
            expect(removeResponseResult.count).toBe(responseCount);
          }
          
          // 验证历史一致性（无孤立引用）
          const consistency = manager.verifyHistoryConsistency(agentId);
          expect(consistency.consistent).toBe(true);
          expect(consistency.orphanedResponses).toEqual([]);
          
          // 验证会话长度恢复到初始状态
          const finalConv = manager.getConversation(agentId);
          expect(finalConv.length).toBe(initialLength);
          
          // 验证没有包含该 toolCallId 的消息
          const hasToolCall = finalConv.some(msg => 
            msg.role === "assistant" && 
            msg.tool_calls && 
            msg.tool_calls.some(call => call.id === toolCallId)
          );
          expect(hasToolCall).toBe(false);
          
          const hasToolResponse = finalConv.some(msg => 
            msg.role === "tool" && 
            msg.tool_call_id === toolCallId
          );
          expect(hasToolResponse).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Chat History Preservation
   * 
   * 对于任何工具调用取消操作，所有在被取消工具调用之前的消息和已完成的工具调用
   * 应该在聊天历史中保持不变。
   * 
   * **Validates: Requirements 3.3, 3.4**
   */
  test("Property 5: 取消工具调用时保留之前的历史记录", () => {
    fc.assert(
      fc.property(
        // 生成智能体ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // 生成之前的消息数量（1-10条）
        fc.integer({ min: 1, max: 10 }),
        // 生成待取消的工具调用ID
        fc.string({ minLength: 1, maxLength: 20 }),
        (agentId, previousMessageCount, pendingToolCallId) => {
          const manager = new ConversationManager();
          const systemPrompt = "测试系统提示词";
          
          // 初始化会话
          const conv = manager.ensureConversation(agentId, systemPrompt);
          
          // 添加之前的消息（用户消息和助手消息交替）
          const previousMessages = [];
          for (let i = 0; i < previousMessageCount; i++) {
            const msg = {
              role: i % 2 === 0 ? "user" : "assistant",
              content: `message_${i}`
            };
            conv.push(msg);
            previousMessages.push(msg);
          }
          
          // 添加一个已完成的工具调用
          const completedToolCallId = `completed_${pendingToolCallId}`;
          conv.push({
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: completedToolCallId,
                type: "function",
                function: { name: "completed_tool", arguments: "{}" }
              }
            ]
          });
          previousMessages.push(conv[conv.length - 1]);
          
          conv.push({
            role: "tool",
            tool_call_id: completedToolCallId,
            content: JSON.stringify({ result: "completed" })
          });
          previousMessages.push(conv[conv.length - 1]);
          
          // 添加待取消的工具调用
          conv.push({
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: pendingToolCallId,
                type: "function",
                function: { name: "pending_tool", arguments: "{}" }
              }
            ]
          });
          
          // 记录取消前的历史长度
          const lengthBeforeCancellation = previousMessages.length + 1; // +1 for system prompt
          
          // 取消待处理的工具调用
          manager.removeToolCallEntry(agentId, pendingToolCallId);
          manager.removeToolResponseEntry(agentId, pendingToolCallId);
          
          // 验证之前的消息都保留
          const finalConv = manager.getConversation(agentId);
          expect(finalConv.length).toBe(lengthBeforeCancellation);
          
          // 验证系统提示词保留
          expect(finalConv[0].role).toBe("system");
          expect(finalConv[0].content).toBe(systemPrompt);
          
          // 验证之前的所有消息内容保留
          for (let i = 0; i < previousMessages.length; i++) {
            const original = previousMessages[i];
            const preserved = finalConv[i + 1]; // +1 因为第一条是系统提示词
            
            expect(preserved.role).toBe(original.role);
            
            if (original.role === "tool") {
              expect(preserved.tool_call_id).toBe(original.tool_call_id);
              expect(preserved.content).toBe(original.content);
            } else if (original.tool_calls) {
              expect(preserved.tool_calls).toEqual(original.tool_calls);
            } else {
              expect(preserved.content).toBe(original.content);
            }
          }
          
          // 验证已完成的工具调用仍然存在
          const hasCompletedCall = finalConv.some(msg =>
            msg.role === "assistant" &&
            msg.tool_calls &&
            msg.tool_calls.some(call => call.id === completedToolCallId)
          );
          expect(hasCompletedCall).toBe(true);
          
          const hasCompletedResponse = finalConv.some(msg =>
            msg.role === "tool" &&
            msg.tool_call_id === completedToolCallId
          );
          expect(hasCompletedResponse).toBe(true);
          
          // 验证待取消的工具调用已被移除
          const hasPendingCall = finalConv.some(msg =>
            msg.role === "assistant" &&
            msg.tool_calls &&
            msg.tool_calls.some(call => call.id === pendingToolCallId)
          );
          expect(hasPendingCall).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 额外属性测试：多个工具调用的选择性移除
   * 
   * 验证从包含多个工具调用的消息中移除特定工具调用时，
   * 其他工具调用保持不变。
   */
  test("Property: 从多工具调用消息中选择性移除", () => {
    fc.assert(
      fc.property(
        // 生成智能体ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // 生成工具调用数量（2-5个）
        fc.integer({ min: 2, max: 5 }),
        // 生成要移除的工具调用索引
        fc.integer({ min: 0, max: 4 }),
        (agentId, toolCallCount, removeIndex) => {
          // 确保移除索引在有效范围内
          const actualRemoveIndex = removeIndex % toolCallCount;
          
          const manager = new ConversationManager();
          const systemPrompt = "测试系统提示词";
          
          // 初始化会话
          const conv = manager.ensureConversation(agentId, systemPrompt);
          
          // 创建多个工具调用
          const toolCalls = [];
          for (let i = 0; i < toolCallCount; i++) {
            toolCalls.push({
              id: `call_${i}`,
              type: "function",
              function: { name: `tool_${i}`, arguments: "{}" }
            });
          }
          
          // 添加包含多个工具调用的消息
          conv.push({
            role: "assistant",
            content: null,
            tool_calls: toolCalls
          });
          
          // 记录要移除的工具调用ID
          const removeCallId = toolCalls[actualRemoveIndex].id;
          
          // 移除指定的工具调用
          const result = manager.removeToolCallEntry(agentId, removeCallId);
          
          // 验证移除成功
          expect(result.removed).toBe(true);
          
          // 如果只有一个工具调用，消息应该被移除
          if (toolCallCount === 1) {
            expect(result.messageRemoved).toBe(true);
            const finalConv = manager.getConversation(agentId);
            expect(finalConv.length).toBe(1); // 只剩系统提示词
          } else {
            // 否则消息应该保留，但工具调用数量减少
            expect(result.messageRemoved).toBe(false);
            const finalConv = manager.getConversation(agentId);
            expect(finalConv.length).toBe(2); // 系统提示词 + assistant消息
            
            const assistantMsg = finalConv[1];
            expect(assistantMsg.tool_calls.length).toBe(toolCallCount - 1);
            
            // 验证被移除的工具调用不存在
            const hasRemovedCall = assistantMsg.tool_calls.some(call => call.id === removeCallId);
            expect(hasRemovedCall).toBe(false);
            
            // 验证其他工具调用仍然存在
            for (let i = 0; i < toolCallCount; i++) {
              if (i !== actualRemoveIndex) {
                const hasCall = assistantMsg.tool_calls.some(call => call.id === `call_${i}`);
                expect(hasCall).toBe(true);
              }
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * 额外属性测试：一致性验证的正确性
   * 
   * 验证 verifyHistoryConsistency 方法能够正确检测孤立的工具响应。
   */
  test("Property: 一致性验证正确检测孤立响应", () => {
    fc.assert(
      fc.property(
        // 生成智能体ID
        fc.string({ minLength: 1, maxLength: 20 }),
        // 生成有效的工具调用数量（1-5个）
        fc.integer({ min: 1, max: 5 }),
        // 生成孤立的响应数量（0-3个）
        fc.integer({ min: 0, max: 3 }),
        (agentId, validCallCount, orphanedCount) => {
          const manager = new ConversationManager();
          const systemPrompt = "测试系统提示词";
          
          // 初始化会话
          const conv = manager.ensureConversation(agentId, systemPrompt);
          
          // 添加有效的工具调用和响应
          for (let i = 0; i < validCallCount; i++) {
            const callId = `valid_call_${i}`;
            
            conv.push({
              role: "assistant",
              content: null,
              tool_calls: [
                {
                  id: callId,
                  type: "function",
                  function: { name: `tool_${i}`, arguments: "{}" }
                }
              ]
            });
            
            conv.push({
              role: "tool",
              tool_call_id: callId,
              content: JSON.stringify({ result: `result_${i}` })
            });
          }
          
          // 添加孤立的响应（没有对应的工具调用）
          const orphanedIds = [];
          for (let i = 0; i < orphanedCount; i++) {
            const orphanedId = `orphaned_${i}`;
            orphanedIds.push(orphanedId);
            
            conv.push({
              role: "tool",
              tool_call_id: orphanedId,
              content: JSON.stringify({ result: "orphaned" })
            });
          }
          
          // 验证一致性
          const consistency = manager.verifyHistoryConsistency(agentId);
          
          if (orphanedCount === 0) {
            // 没有孤立响应，应该一致
            expect(consistency.consistent).toBe(true);
            expect(consistency.orphanedResponses).toEqual([]);
          } else {
            // 有孤立响应，应该不一致
            expect(consistency.consistent).toBe(false);
            expect(consistency.orphanedResponses.length).toBe(orphanedCount);
            
            // 验证所有孤立的ID都被检测到
            for (const orphanedId of orphanedIds) {
              expect(consistency.orphanedResponses).toContain(orphanedId);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
