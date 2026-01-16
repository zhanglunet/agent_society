/**
 * LlmHandler 插话处理单元测试
 * 
 * 测试 LlmHandler 的插话处理功能：
 * - checkAndHandleInterruptions() 方法
 * - 删除最后一条assistant消息
 * - 追加插话消息到对话历史
 * - 边界情况处理
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 5.1, 5.2, 5.3, 5.4
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { LlmHandler } from "../../src/platform/runtime/llm_handler.js";

describe("LlmHandler 插话处理", () => {
  let llmHandler;
  let mockRuntime;
  let interruptions;
  let logCalls;

  beforeEach(() => {
    interruptions = [];
    logCalls = [];
    
    mockRuntime = {
      log: {
        info: (message, data) => {
          logCalls.push({ message, data });
        }
      },
      getAndClearInterruptions: (agentId) => {
        const result = [...interruptions];
        interruptions = [];
        return result;
      },
      _formatMessageForLlm: (ctx, message) => {
        return `[${message.from}]: ${message.payload?.text ?? ''}`;
      }
    };
    
    llmHandler = new LlmHandler(mockRuntime);
  });

  test("无插话时返回false", () => {
    const agentId = "test-agent";
    const conv = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "user message" }
    ];
    const ctx = { agent: { id: agentId } };

    const result = llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);

    expect(result).toBe(false);
    expect(conv.length).toBe(2);
  });

  test("有插话时删除最后一条assistant消息", () => {
    const agentId = "test-agent";
    const conv = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "user message" },
      { 
        role: "assistant", 
        content: "assistant response",
        tool_calls: [
          { id: "call-1", function: { name: "tool1", arguments: "{}" } }
        ]
      }
    ];
    const ctx = { agent: { id: agentId } };
    
    interruptions = [
      {
        id: "msg-1",
        from: "user",
        to: agentId,
        payload: { text: "interruption message" }
      }
    ];

    const result = llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);

    expect(result).toBe(true);
    // 验证assistant消息被删除
    expect(conv.length).toBe(3); // system + user + 新的user插话
    expect(conv[2].role).toBe("user");
    expect(conv[2].content).toContain("interruption message");
  });

  test("插话消息被正确追加到对话历史", () => {
    const agentId = "test-agent";
    const conv = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "user message" }
    ];
    const ctx = { agent: { id: agentId } };
    
    interruptions = [
      {
        id: "msg-1",
        from: "user",
        to: agentId,
        payload: { text: "first interruption" }
      },
      {
        id: "msg-2",
        from: "user",
        to: agentId,
        payload: { text: "second interruption" }
      }
    ];

    const result = llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);

    expect(result).toBe(true);
    expect(conv.length).toBe(4); // system + user + 2个插话
    expect(conv[2].role).toBe("user");
    expect(conv[2].content).toContain("first interruption");
    expect(conv[3].role).toBe("user");
    expect(conv[3].content).toContain("second interruption");
  });

  test("最后一条消息不是assistant时不删除", () => {
    const agentId = "test-agent";
    const conv = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "user message" },
      { role: "tool", tool_call_id: "call-1", content: "tool result" }
    ];
    const ctx = { agent: { id: agentId } };
    
    interruptions = [
      {
        id: "msg-1",
        from: "user",
        to: agentId,
        payload: { text: "interruption message" }
      }
    ];

    const result = llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);

    expect(result).toBe(true);
    // 验证tool消息没有被删除
    expect(conv.length).toBe(4); // system + user + tool + 插话
    expect(conv[2].role).toBe("tool");
    expect(conv[3].role).toBe("user");
    expect(conv[3].content).toContain("interruption message");
  });

  test("assistant消息没有tool_calls时不删除", () => {
    const agentId = "test-agent";
    const conv = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "user message" },
      { role: "assistant", content: "assistant response without tools" }
    ];
    const ctx = { agent: { id: agentId } };
    
    interruptions = [
      {
        id: "msg-1",
        from: "user",
        to: agentId,
        payload: { text: "interruption message" }
      }
    ];

    const result = llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);

    expect(result).toBe(true);
    // 验证assistant消息没有被删除（因为没有tool_calls）
    expect(conv.length).toBe(4); // system + user + assistant + 插话
    expect(conv[2].role).toBe("assistant");
    expect(conv[3].role).toBe("user");
    expect(conv[3].content).toContain("interruption message");
  });

  test("空对话历史时直接追加插话", () => {
    const agentId = "test-agent";
    const conv = [];
    const ctx = { agent: { id: agentId } };
    
    interruptions = [
      {
        id: "msg-1",
        from: "user",
        to: agentId,
        payload: { text: "interruption message" }
      }
    ];

    const result = llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);

    expect(result).toBe(true);
    expect(conv.length).toBe(1);
    expect(conv[0].role).toBe("user");
    expect(conv[0].content).toContain("interruption message");
  });

  test("多次调用只处理一次插话", () => {
    const agentId = "test-agent";
    const conv = [
      { role: "system", content: "system prompt" }
    ];
    const ctx = { agent: { id: agentId } };
    
    interruptions = [
      {
        id: "msg-1",
        from: "user",
        to: agentId,
        payload: { text: "interruption message" }
      }
    ];

    // 第一次调用处理插话
    const result1 = llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);
    expect(result1).toBe(true);
    expect(conv.length).toBe(2);

    // 第二次调用没有插话
    const result2 = llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);
    expect(result2).toBe(false);
    expect(conv.length).toBe(2); // 长度不变
  });

  test("插话消息保持FIFO顺序", () => {
    const agentId = "test-agent";
    const conv = [
      { role: "system", content: "system prompt" }
    ];
    const ctx = { agent: { id: agentId } };
    
    interruptions = [
      {
        id: "msg-1",
        from: "user",
        to: agentId,
        payload: { text: "first" }
      },
      {
        id: "msg-2",
        from: "user",
        to: agentId,
        payload: { text: "second" }
      },
      {
        id: "msg-3",
        from: "user",
        to: agentId,
        payload: { text: "third" }
      }
    ];

    llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);

    expect(conv.length).toBe(4);
    expect(conv[1].content).toContain("first");
    expect(conv[2].content).toContain("second");
    expect(conv[3].content).toContain("third");
  });

  test("正确记录日志", () => {
    const agentId = "test-agent";
    const conv = [
      { role: "system", content: "system prompt" },
      { role: "user", content: "user message" },
      { 
        role: "assistant", 
        content: "assistant response",
        tool_calls: [
          { id: "call-1", function: { name: "tool1", arguments: "{}" } }
        ]
      }
    ];
    const ctx = { agent: { id: agentId } };
    
    interruptions = [
      {
        id: "msg-1",
        from: "user",
        to: agentId,
        payload: { text: "interruption" }
      }
    ];

    llmHandler.checkAndHandleInterruptions(agentId, conv, ctx);

    // 验证日志调用
    expect(logCalls.length).toBeGreaterThan(0);
    
    // 验证有"处理插话消息"日志
    const processLog = logCalls.find(log => log.message === "处理插话消息");
    expect(processLog).toBeDefined();
    expect(processLog.data.agentId).toBe(agentId);
    expect(processLog.data.count).toBe(1);
    
    // 验证有"删除最后一条assistant消息"日志
    const deleteLog = logCalls.find(log => log.message === "删除最后一条assistant消息");
    expect(deleteLog).toBeDefined();
    
    // 验证有"已追加插话消息到对话历史"日志
    const appendLog = logCalls.find(log => log.message === "已追加插话消息到对话历史");
    expect(appendLog).toBeDefined();
    expect(appendLog.data.count).toBe(1);
  });
});
