/**
 * LlmHandler 工具调用循环插话集成测试
 * 
 * 测试工具调用循环中的插话处理：
 * - 智能体活跃状态管理
 * - 工具调用前插话检查
 * - LLM完成时插话检查
 * - 异常情况下的状态清理
 * 
 * Requirements: 1.2, 1.3, 2.1, 2.4, 3.1, 3.2, 3.3
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { LlmHandler } from "../../src/platform/runtime/llm_handler.js";

describe("LlmHandler 工具调用循环插话集成", () => {
  let llmHandler;
  let mockRuntime;
  let interruptions;
  let activeProcessingAgents;
  let computeStatus;

  beforeEach(() => {
    interruptions = [];
    activeProcessingAgents = new Set();
    computeStatus = 'idle';
    
    mockRuntime = {
      log: {
        info: async () => {},
        debug: async () => {},
        warn: async () => {},
        error: async () => {}
      },
      _activeProcessingAgents: activeProcessingAgents,
      maxToolRounds: 10,
      getAndClearInterruptions: (agentId) => {
        const result = [...interruptions];
        interruptions = [];
        return result;
      },
      _formatMessageForLlm: (ctx, message) => {
        return `[${message.from}]: ${message.payload?.text ?? ''}`;
      },
      _conversationManager: {
        buildContextStatusPrompt: () => "",
        updateTokenUsage: () => {},
        getContextStatus: () => ({ status: 'normal', usagePercent: 0.5 })
      },
      _checkContextAndWarn: () => {},
      getToolDefinitions: () => [],
      setAgentComputeStatus: (agentId, status) => {
        computeStatus = status;
      },
      getAgentComputeStatus: (agentId) => {
        return computeStatus;
      },
      capabilityRouter: null,
      artifacts: null
    };
    
    llmHandler = new LlmHandler(mockRuntime);
  });

  test("智能体在处理开始时被标记为活跃", async () => {
    const agentId = "test-agent";
    const ctx = { 
      agent: { id: agentId }, 
      tools: {
        sendMessage: () => ({ messageId: "msg-1" })
      },
      currentMessage: { taskId: null }
    };
    const message = { from: "user", payload: { text: "test" } };
    const conv = [];
    
    const mockLlmClient = {
      chat: async () => {
        // 验证智能体在LLM调用时是活跃的
        expect(activeProcessingAgents.has(agentId)).toBe(true);
        return { role: "assistant", content: "response" };
      }
    };

    mockRuntime.loggerRoot = {
      logAgentLifecycleEvent: () => {}
    };

    await llmHandler.doLlmProcessing(ctx, message, conv, agentId, mockLlmClient);

    // 验证处理完成后智能体不再活跃
    expect(activeProcessingAgents.has(agentId)).toBe(false);
  });

  test("异常情况下智能体状态被正确清理", async () => {
    const agentId = "test-agent";
    const ctx = { agent: { id: agentId }, tools: {} };
    const message = { from: "user", payload: { text: "test" } };
    const conv = [];
    
    const mockLlmClient = {
      chat: async () => {
        throw new Error("LLM error");
      }
    };

    try {
      await llmHandler.doLlmProcessing(ctx, message, conv, agentId, mockLlmClient);
    } catch (err) {
      // 忽略错误
    }

    // 验证即使出错，智能体也被标记为空闲
    expect(activeProcessingAgents.has(agentId)).toBe(false);
    expect(computeStatus).toBe('idle');
  });

  test("LLM完成回复时检查插话", async () => {
    const agentId = "test-agent";
    const ctx = { 
      agent: { id: agentId }, 
      tools: {
        sendMessage: () => ({ messageId: "msg-1" })
      },
      currentMessage: { taskId: null }
    };
    const message = { from: "user", payload: { text: "test" } };
    const conv = [];
    
    let llmCallCount = 0;
    const mockLlmClient = {
      chat: async () => {
        llmCallCount++;
        if (llmCallCount === 1) {
          // 第一次调用后添加插话
          interruptions.push({
            id: "int-1",
            from: "user",
            to: agentId,
            payload: { text: "interruption" }
          });
          return { role: "assistant", content: "first response" };
        } else {
          // 第二次调用（处理插话后）
          return { role: "assistant", content: "second response" };
        }
      }
    };

    mockRuntime.loggerRoot = {
      logAgentLifecycleEvent: () => {}
    };

    await llmHandler.doLlmProcessing(ctx, message, conv, agentId, mockLlmClient);

    // 验证LLM被调用了两次（第一次后检测到插话，第二次处理插话）
    expect(llmCallCount).toBe(2);
    
    // 验证对话历史包含插话消息
    const userMessages = conv.filter(m => m.role === "user");
    expect(userMessages.length).toBeGreaterThan(1);
    expect(userMessages.some(m => m.content.includes("interruption"))).toBe(true);
  });

  test("工具调用前检查插话", async () => {
    const agentId = "test-agent";
    const ctx = { 
      agent: { id: agentId }, 
      tools: {
        sendMessage: () => ({ messageId: "msg-1" })
      },
      currentMessage: { taskId: null }
    };
    const message = { from: "user", payload: { text: "test" } };
    const conv = [];
    
    let llmCallCount = 0;
    const mockLlmClient = {
      chat: async () => {
        llmCallCount++;
        if (llmCallCount === 1) {
          // 第一次调用返回工具调用
          interruptions.push({
            id: "int-1",
            from: "user",
            to: agentId,
            payload: { text: "interruption before tool" }
          });
          return { 
            role: "assistant", 
            content: "calling tool",
            tool_calls: [
              { id: "call-1", function: { name: "test_tool", arguments: "{}" } }
            ]
          };
        } else {
          // 第二次调用（处理插话后）
          return { role: "assistant", content: "response after interruption" };
        }
      }
    };

    mockRuntime.executeToolCall = async () => ({ result: "tool result" });
    mockRuntime.loggerRoot = {
      logAgentLifecycleEvent: () => {}
    };
    mockRuntime._emitToolCall = () => {};

    await llmHandler.doLlmProcessing(ctx, message, conv, agentId, mockLlmClient);

    // 验证LLM被调用了两次
    expect(llmCallCount).toBe(2);
    
    // 验证对话历史中没有tool消息（因为工具调用被插话中断）
    const toolMessages = conv.filter(m => m.role === "tool");
    expect(toolMessages.length).toBe(0);
    
    // 验证插话消息被添加
    const userMessages = conv.filter(m => m.role === "user");
    expect(userMessages.some(m => m.content.includes("interruption before tool"))).toBe(true);
  });

  test("多次插话被正确处理", async () => {
    const agentId = "test-agent";
    const ctx = { 
      agent: { id: agentId }, 
      tools: {
        sendMessage: () => ({ messageId: "msg-1" })
      },
      currentMessage: { taskId: null }
    };
    const message = { from: "user", payload: { text: "test" } };
    const conv = [];
    
    let llmCallCount = 0;
    const mockLlmClient = {
      chat: async () => {
        llmCallCount++;
        if (llmCallCount === 1) {
          // 第一次调用后添加多个插话
          interruptions.push(
            { id: "int-1", from: "user", to: agentId, payload: { text: "first" } },
            { id: "int-2", from: "user", to: agentId, payload: { text: "second" } }
          );
          return { role: "assistant", content: "first response" };
        } else {
          return { role: "assistant", content: "final response" };
        }
      }
    };

    mockRuntime.loggerRoot = {
      logAgentLifecycleEvent: () => {}
    };

    await llmHandler.doLlmProcessing(ctx, message, conv, agentId, mockLlmClient);

    // 验证所有插话都被添加到对话历史
    const userMessages = conv.filter(m => m.role === "user");
    expect(userMessages.some(m => m.content.includes("first"))).toBe(true);
    expect(userMessages.some(m => m.content.includes("second"))).toBe(true);
  });

  test("用户中断时智能体状态被正确清理", async () => {
    const agentId = "test-agent";
    const ctx = { 
      agent: { id: agentId }, 
      tools: {
        sendMessage: () => ({ messageId: "msg-1" })
      },
      currentMessage: { taskId: null }
    };
    const message = { from: "user", payload: { text: "test" } };
    const conv = [];
    
    const mockLlmClient = {
      chat: async () => {
        // 模拟用户中断
        computeStatus = 'idle';
        return { role: "assistant", content: "response" };
      }
    };

    mockRuntime.loggerRoot = {
      logAgentLifecycleEvent: () => {}
    };

    await llmHandler.doLlmProcessing(ctx, message, conv, agentId, mockLlmClient);

    // 验证智能体不再活跃
    expect(activeProcessingAgents.has(agentId)).toBe(false);
  });

  test("finally块确保状态总是被清理", async () => {
    const agentId = "test-agent";
    const ctx = { agent: { id: agentId }, tools: {} };
    const message = { from: "user", payload: { text: "test" } };
    const conv = [];
    
    // 测试各种退出场景
    const scenarios = [
      // 正常完成
      {
        name: "正常完成",
        llmClient: {
          chat: async () => ({ role: "assistant", content: "response" })
        }
      },
      // LLM错误
      {
        name: "LLM错误",
        llmClient: {
          chat: async () => {
            const err = new Error("LLM error");
            err.name = "TestError";
            throw err;
          }
        }
      }
    ];

    for (const scenario of scenarios) {
      // 重置状态
      activeProcessingAgents.clear();
      activeProcessingAgents.add(agentId);
      computeStatus = 'processing';
      
      mockRuntime.loggerRoot = {
        logAgentLifecycleEvent: () => {}
      };
      mockRuntime._emitToolCall = () => {};

      try {
        await llmHandler.doLlmProcessing(ctx, message, [...conv], agentId, scenario.llmClient);
      } catch (err) {
        // 忽略错误
      }

      // 验证状态被清理
      expect(activeProcessingAgents.has(agentId)).toBe(false);
      expect(computeStatus).toBe('idle');
    }
  });
});
