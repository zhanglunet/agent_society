/**
 * ConversationManager 聊天历史清理功能测试
 * 测试工具调用和工具响应的移除功能
 */

import { describe, test, expect, beforeEach } from "vitest";
import { ConversationManager } from "../../src/platform/conversation_manager.js";

describe("ConversationManager - 聊天历史清理", () => {
  let manager;
  const agentId = "test-agent-1";
  const systemPrompt = "你是测试智能体";

  beforeEach(() => {
    manager = new ConversationManager({
      maxContextMessages: 50
    });
  });

  describe("removeToolCallEntry - 移除工具调用条目", () => {
    test("应该成功移除单个工具调用并删除整个消息", () => {
      // 初始化会话
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 添加包含单个工具调用的 assistant 消息
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: { name: "test_tool", arguments: "{}" }
          }
        ]
      });

      // 移除工具调用
      const result = manager.removeToolCallEntry(agentId, "call_123");

      // 验证结果
      expect(result.removed).toBe(true);
      expect(result.messageRemoved).toBe(true);
      expect(result.error).toBeUndefined();

      // 验证消息已被移除
      const updatedConv = manager.getConversation(agentId);
      expect(updatedConv.length).toBe(1); // 只剩系统提示词
      expect(updatedConv[0].role).toBe("system");
    });

    test("应该从包含多个工具调用的消息中移除指定的工具调用", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 添加包含多个工具调用的消息
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: "tool_1", arguments: "{}" }
          },
          {
            id: "call_2",
            type: "function",
            function: { name: "tool_2", arguments: "{}" }
          },
          {
            id: "call_3",
            type: "function",
            function: { name: "tool_3", arguments: "{}" }
          }
        ]
      });

      // 移除中间的工具调用
      const result = manager.removeToolCallEntry(agentId, "call_2");

      // 验证结果
      expect(result.removed).toBe(true);
      expect(result.messageRemoved).toBe(false); // 消息未被移除
      expect(result.error).toBeUndefined();

      // 验证消息仍然存在，但工具调用已被移除
      const updatedConv = manager.getConversation(agentId);
      expect(updatedConv.length).toBe(2); // 系统提示词 + assistant 消息
      
      const assistantMsg = updatedConv[1];
      expect(assistantMsg.tool_calls.length).toBe(2);
      expect(assistantMsg.tool_calls[0].id).toBe("call_1");
      expect(assistantMsg.tool_calls[1].id).toBe("call_3");
    });

    test("应该在工具调用不存在时返回 removed: false", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_123", type: "function", function: { name: "test", arguments: "{}" } }
        ]
      });

      // 尝试移除不存在的工具调用
      const result = manager.removeToolCallEntry(agentId, "call_999");

      expect(result.removed).toBe(false);
      expect(result.messageRemoved).toBe(false);
      expect(result.error).toBeUndefined();
    });

    test("应该在会话不存在时返回错误", () => {
      const result = manager.removeToolCallEntry("non-existent-agent", "call_123");

      expect(result.removed).toBe(false);
      expect(result.messageRemoved).toBe(false);
      expect(result.error).toBe("conversation_not_found");
    });

    test("应该在 toolCallId 无效时返回错误", () => {
      manager.ensureConversation(agentId, systemPrompt);

      const result1 = manager.removeToolCallEntry(agentId, "");
      expect(result1.error).toBe("invalid_tool_call_id");

      const result2 = manager.removeToolCallEntry(agentId, null);
      expect(result2.error).toBe("invalid_tool_call_id");
    });

    test("应该移除最后一个工具调用（从后向前查找）", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 添加多个包含相同 ID 的工具调用（模拟重试场景）
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_123", type: "function", function: { name: "test", arguments: "{}" } }]
      });
      
      conv.push({ role: "user", content: "继续" });
      
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_123", type: "function", function: { name: "test", arguments: "{}" } }]
      });

      // 移除工具调用（应该移除最后一个）
      const result = manager.removeToolCallEntry(agentId, "call_123");

      expect(result.removed).toBe(true);
      expect(result.messageRemoved).toBe(true);

      // 验证只移除了最后一个
      const updatedConv = manager.getConversation(agentId);
      expect(updatedConv.length).toBe(3); // 系统提示词 + 第一个 assistant + user
    });
  });

  describe("removeToolResponseEntry - 移除工具响应条目", () => {
    test("应该成功移除单个工具响应", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 添加工具调用
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_123", type: "function", function: { name: "test", arguments: "{}" } }]
      });
      
      // 添加工具响应
      conv.push({
        role: "tool",
        tool_call_id: "call_123",
        content: JSON.stringify({ result: "success" })
      });

      // 移除工具响应
      const result = manager.removeToolResponseEntry(agentId, "call_123");

      expect(result.removed).toBe(true);
      expect(result.count).toBe(1);
      expect(result.error).toBeUndefined();

      // 验证响应已被移除
      const updatedConv = manager.getConversation(agentId);
      expect(updatedConv.length).toBe(2); // 系统提示词 + assistant 消息
      expect(updatedConv.every(msg => msg.role !== "tool")).toBe(true);
    });

    test("应该移除多个相同 tool_call_id 的响应", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 添加工具调用
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_123", type: "function", function: { name: "test", arguments: "{}" } }]
      });
      
      // 添加多个工具响应（模拟流式响应或重试）
      conv.push({
        role: "tool",
        tool_call_id: "call_123",
        content: JSON.stringify({ part: 1 })
      });
      
      conv.push({
        role: "tool",
        tool_call_id: "call_123",
        content: JSON.stringify({ part: 2 })
      });

      // 移除所有相关响应
      const result = manager.removeToolResponseEntry(agentId, "call_123");

      expect(result.removed).toBe(true);
      expect(result.count).toBe(2);

      // 验证所有响应都被移除
      const updatedConv = manager.getConversation(agentId);
      expect(updatedConv.length).toBe(2); // 系统提示词 + assistant 消息
    });

    test("应该在工具响应不存在时返回 removed: false", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      conv.push({
        role: "tool",
        tool_call_id: "call_123",
        content: "{}"
      });

      // 尝试移除不存在的工具响应
      const result = manager.removeToolResponseEntry(agentId, "call_999");

      expect(result.removed).toBe(false);
      expect(result.count).toBe(0);
    });

    test("应该在会话不存在时返回错误", () => {
      const result = manager.removeToolResponseEntry("non-existent-agent", "call_123");

      expect(result.removed).toBe(false);
      expect(result.count).toBe(0);
      expect(result.error).toBe("conversation_not_found");
    });

    test("应该在 toolCallId 无效时返回错误", () => {
      manager.ensureConversation(agentId, systemPrompt);

      const result1 = manager.removeToolResponseEntry(agentId, "");
      expect(result1.error).toBe("invalid_tool_call_id");

      const result2 = manager.removeToolResponseEntry(agentId, null);
      expect(result2.error).toBe("invalid_tool_call_id");
    });

    test("应该只移除匹配的工具响应，保留其他响应", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 添加多个工具调用和响应
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", type: "function", function: { name: "test1", arguments: "{}" } },
          { id: "call_2", type: "function", function: { name: "test2", arguments: "{}" } }
        ]
      });
      
      conv.push({ role: "tool", tool_call_id: "call_1", content: "{}" });
      conv.push({ role: "tool", tool_call_id: "call_2", content: "{}" });

      // 只移除 call_1 的响应
      const result = manager.removeToolResponseEntry(agentId, "call_1");

      expect(result.removed).toBe(true);
      expect(result.count).toBe(1);

      // 验证 call_2 的响应仍然存在
      const updatedConv = manager.getConversation(agentId);
      const toolResponses = updatedConv.filter(msg => msg.role === "tool");
      expect(toolResponses.length).toBe(1);
      expect(toolResponses[0].tool_call_id).toBe("call_2");
    });
  });

  describe("getLastToolCall - 获取最后一个工具调用", () => {
    test("应该返回最后一个工具调用", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", function: { name: "tool_1", arguments: "{}" } }
        ]
      });
      
      conv.push({ role: "user", content: "继续" });
      
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_2", function: { name: "tool_2", arguments: "{}" } }
        ]
      });

      const lastCall = manager.getLastToolCall(agentId);

      expect(lastCall).not.toBeNull();
      expect(lastCall.id).toBe("call_2");
      expect(lastCall.function.name).toBe("tool_2");
    });

    test("应该返回消息中的最后一个工具调用（多个工具调用）", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", function: { name: "tool_1", arguments: "{}" } },
          { id: "call_2", function: { name: "tool_2", arguments: "{}" } },
          { id: "call_3", function: { name: "tool_3", arguments: "{}" } }
        ]
      });

      const lastCall = manager.getLastToolCall(agentId);

      expect(lastCall).not.toBeNull();
      expect(lastCall.id).toBe("call_3");
    });

    test("应该在没有工具调用时返回 null", () => {
      manager.ensureConversation(agentId, systemPrompt);

      const lastCall = manager.getLastToolCall(agentId);

      expect(lastCall).toBeNull();
    });

    test("应该在会话不存在时返回 null", () => {
      const lastCall = manager.getLastToolCall("non-existent-agent");

      expect(lastCall).toBeNull();
    });
  });

  describe("verifyHistoryConsistency - 验证历史一致性", () => {
    test("应该在一致的历史中返回 consistent: true", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 添加工具调用和对应的响应
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", function: { name: "tool_1", arguments: "{}" } },
          { id: "call_2", function: { name: "tool_2", arguments: "{}" } }
        ]
      });
      
      conv.push({ role: "tool", tool_call_id: "call_1", content: "{}" });
      conv.push({ role: "tool", tool_call_id: "call_2", content: "{}" });

      const result = manager.verifyHistoryConsistency(agentId);

      expect(result.consistent).toBe(true);
      expect(result.orphanedResponses).toEqual([]);
      expect(result.error).toBeUndefined();
    });

    test("应该检测到孤立的工具响应", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 添加工具调用
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", function: { name: "tool_1", arguments: "{}" } }
        ]
      });
      
      // 添加对应的响应
      conv.push({ role: "tool", tool_call_id: "call_1", content: "{}" });
      
      // 添加孤立的响应（没有对应的工具调用）
      conv.push({ role: "tool", tool_call_id: "call_orphan", content: "{}" });

      const result = manager.verifyHistoryConsistency(agentId);

      expect(result.consistent).toBe(false);
      expect(result.orphanedResponses).toEqual(["call_orphan"]);
    });

    test("应该检测到多个孤立的工具响应", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [{ id: "call_1", function: { name: "tool_1", arguments: "{}" } }]
      });
      
      conv.push({ role: "tool", tool_call_id: "call_1", content: "{}" });
      conv.push({ role: "tool", tool_call_id: "call_orphan_1", content: "{}" });
      conv.push({ role: "tool", tool_call_id: "call_orphan_2", content: "{}" });

      const result = manager.verifyHistoryConsistency(agentId);

      expect(result.consistent).toBe(false);
      expect(result.orphanedResponses).toHaveLength(2);
      expect(result.orphanedResponses).toContain("call_orphan_1");
      expect(result.orphanedResponses).toContain("call_orphan_2");
    });

    test("应该在会话不存在时返回错误", () => {
      const result = manager.verifyHistoryConsistency("non-existent-agent");

      expect(result.consistent).toBe(false);
      expect(result.orphanedResponses).toEqual([]);
      expect(result.error).toBe("conversation_not_found");
    });

    test("应该在空会话中返回 consistent: true", () => {
      manager.ensureConversation(agentId, systemPrompt);

      const result = manager.verifyHistoryConsistency(agentId);

      expect(result.consistent).toBe(true);
      expect(result.orphanedResponses).toEqual([]);
    });
  });

  describe("集成测试 - 完整的清理流程", () => {
    test("应该完整清理工具调用和响应，保持历史一致性", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 构建完整的对话历史
      conv.push({ role: "user", content: "请执行任务" });
      
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_1", function: { name: "tool_1", arguments: "{}" } },
          { id: "call_2", function: { name: "tool_2", arguments: "{}" } }
        ]
      });
      
      conv.push({ role: "tool", tool_call_id: "call_1", content: JSON.stringify({ result: "ok" }) });
      conv.push({ role: "tool", tool_call_id: "call_2", content: JSON.stringify({ result: "ok" }) });
      
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_3", function: { name: "tool_3", arguments: "{}" } }
        ]
      });

      // 验证初始状态一致
      let consistency = manager.verifyHistoryConsistency(agentId);
      expect(consistency.consistent).toBe(true);

      // 移除最后一个工具调用（模拟中断）
      const removeCallResult = manager.removeToolCallEntry(agentId, "call_3");
      expect(removeCallResult.removed).toBe(true);
      expect(removeCallResult.messageRemoved).toBe(true);

      // 验证历史仍然一致（因为 call_3 没有响应）
      consistency = manager.verifyHistoryConsistency(agentId);
      expect(consistency.consistent).toBe(true);

      // 验证保留了之前的消息和工具调用
      const updatedConv = manager.getConversation(agentId);
      expect(updatedConv.length).toBe(5); // system + user + assistant + 2 tool responses
      
      const toolResponses = updatedConv.filter(msg => msg.role === "tool");
      expect(toolResponses.length).toBe(2);
    });

    test("应该清理工具调用和所有相关响应", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      conv.push({ role: "user", content: "执行操作" });
      
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_pending", function: { name: "pending_tool", arguments: "{}" } }
        ]
      });
      
      // 添加多个响应（模拟流式响应）
      conv.push({ role: "tool", tool_call_id: "call_pending", content: JSON.stringify({ part: 1 }) });
      conv.push({ role: "tool", tool_call_id: "call_pending", content: JSON.stringify({ part: 2 }) });
      conv.push({ role: "tool", tool_call_id: "call_pending", content: JSON.stringify({ part: 3 }) });

      // 移除工具调用
      const removeCallResult = manager.removeToolCallEntry(agentId, "call_pending");
      expect(removeCallResult.removed).toBe(true);

      // 移除所有相关响应
      const removeResponseResult = manager.removeToolResponseEntry(agentId, "call_pending");
      expect(removeResponseResult.removed).toBe(true);
      expect(removeResponseResult.count).toBe(3);

      // 验证历史一致性
      const consistency = manager.verifyHistoryConsistency(agentId);
      expect(consistency.consistent).toBe(true);

      // 验证只剩下系统提示词和用户消息
      const updatedConv = manager.getConversation(agentId);
      expect(updatedConv.length).toBe(2);
      expect(updatedConv[0].role).toBe("system");
      expect(updatedConv[1].role).toBe("user");
    });

    test("应该保留已完成的工具调用，只清理待处理的", () => {
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      // 添加已完成的工具调用
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_completed", function: { name: "completed_tool", arguments: "{}" } }
        ]
      });
      conv.push({ role: "tool", tool_call_id: "call_completed", content: "{}" });
      
      // 添加待处理的工具调用
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "call_pending", function: { name: "pending_tool", arguments: "{}" } }
        ]
      });

      // 只移除待处理的工具调用
      manager.removeToolCallEntry(agentId, "call_pending");

      // 验证已完成的工具调用仍然存在
      const updatedConv = manager.getConversation(agentId);
      expect(updatedConv.length).toBe(3); // system + assistant + tool
      
      const assistantMsgs = updatedConv.filter(msg => msg.role === "assistant");
      expect(assistantMsgs.length).toBe(1);
      expect(assistantMsgs[0].tool_calls[0].id).toBe("call_completed");
      
      const toolMsgs = updatedConv.filter(msg => msg.role === "tool");
      expect(toolMsgs.length).toBe(1);
      expect(toolMsgs[0].tool_call_id).toBe("call_completed");
    });
  });
});
