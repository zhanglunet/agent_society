/**
 * MessageBus 插话检测单元测�?
 * 
 * 测试 MessageBus 的插话检测功能：
 * - 检测活跃智能体并触发插话回�?
 * - 非活跃智能体不触发插话回�?
 * - 回调错误处理
 * 
 * Requirements: 1.1, 1.4
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { MessageBus } from "../../src/platform/core/message_bus.js";

describe("MessageBus 插话检�?, () => {
  let bus;
  let callbackCalls;
  let isActivelyProcessingCalls;
  let statusByAgent;

  beforeEach(() => {
    callbackCalls = [];
    isActivelyProcessingCalls = [];
    statusByAgent = new Map([["agent-1", "waiting_llm"]]);
    
    bus = new MessageBus({
      logger: {
        debug: async () => {},
        info: async () => {},
        warn: async () => {},
        error: async () => {}
      },
      getAgentStatus: (agentId) => statusByAgent.get(agentId) ?? "idle",
      isAgentActivelyProcessing: (agentId) => {
        isActivelyProcessingCalls.push(agentId);
        // 模拟 agent-1 正在活跃处理
        return agentId === "agent-1";
      },
      onInterruptionNeeded: (agentId, message) => {
        callbackCalls.push({ agentId, message });
      }
    });
  });

  test("活跃智能体触发插话回�?, () => {
    const message = {
      to: "agent-1",
      from: "user",
      payload: { text: "test message" }
    };

    const result = bus.send(message);

    // 验证回调被调�?
    expect(callbackCalls.length).toBe(1);
    expect(callbackCalls[0].agentId).toBe("agent-1");
    expect(callbackCalls[0].message.to).toBe("agent-1");
    expect(callbackCalls[0].message.from).toBe("user");

    // 验证消息仍然被加入队�?
    expect(result.messageId).toBeDefined();
    expect(result.messageId.length).toBeGreaterThan(0);
    expect(result.interruptionTriggered).toBe(true);
    
    // 验证消息在队列中
    const queueDepth = bus.getQueueDepth("agent-1");
    expect(queueDepth).toBe(1);
  });

  test("活跃但非 waiting_llm 不触发插话回�?, () => {
    statusByAgent.set("agent-1", "processing");
    const message = {
      to: "agent-1",
      from: "user",
      payload: { text: "test message" }
    };

    const result = bus.send(message);

    expect(callbackCalls.length).toBe(0);
    expect(result.messageId).toBeDefined();
    expect(result.interruptionTriggered).toBeUndefined();
    expect(bus.getQueueDepth("agent-1")).toBe(1);
  });

  test("非活跃智能体不触发插话回�?, () => {
    const message = {
      to: "agent-2",
      from: "user",
      payload: { text: "test message" }
    };

    const result = bus.send(message);

    // 验证回调未被调用
    expect(callbackCalls.length).toBe(0);

    // 验证消息仍然被加入队�?
    expect(result.messageId).toBeDefined();
    expect(result.messageId.length).toBeGreaterThan(0);
    
    // 验证消息在队列中
    const queueDepth = bus.getQueueDepth("agent-2");
    expect(queueDepth).toBe(1);
  });

  test("延迟消息不触发插话回�?, () => {
    const message = {
      to: "agent-1",
      from: "user",
      payload: { text: "delayed message" },
      delayMs: 1000
    };

    const result = bus.send(message);

    // 验证回调未被调用（延迟消息不触发插话�?
    expect(callbackCalls.length).toBe(0);

    // 验证消息被加入延迟队�?
    expect(result.scheduledDeliveryTime).toBeDefined();
    
    // 验证消息不在立即队列�?
    const queueDepth = bus.getQueueDepth("agent-1");
    expect(queueDepth).toBe(0);
  });

  test("回调错误不影响消息发�?, () => {
    // 创建会抛出错误的回调
    const errorBus = new MessageBus({
      logger: {
        debug: async () => {},
        info: async () => {},
        warn: async () => {},
        error: async () => {}
      },
      getAgentStatus: () => "waiting_llm",
      isAgentActivelyProcessing: (agentId) => {
        return agentId === "agent-1";
      },
      onInterruptionNeeded: (agentId, message) => {
        throw new Error("Callback error");
      }
    });

    const message = {
      to: "agent-1",
      from: "user",
      payload: { text: "test message" }
    };

    // 发送消息不应该抛出错误
    const result = errorBus.send(message);

    // 验证消息仍然被加入队�?
    expect(result.messageId).toBeDefined();
    expect(result.messageId.length).toBeGreaterThan(0);
    
    // 验证消息在队列中
    const queueDepth = errorBus.getQueueDepth("agent-1");
    expect(queueDepth).toBe(1);
  });

  test("多次发送消息到活跃智能体触发多次回�?, () => {
    statusByAgent.set("agent-1", "waiting_llm");
    const message1 = {
      to: "agent-1",
      from: "user",
      payload: { text: "message 1" }
    };
    const message2 = {
      to: "agent-1",
      from: "user",
      payload: { text: "message 2" }
    };
    const message3 = {
      to: "agent-1",
      from: "user",
      payload: { text: "message 3" }
    };

    bus.send(message1);
    bus.send(message2);
    bus.send(message3);

    // 验证回调被调�?�?
    expect(callbackCalls.length).toBe(3);
    expect(callbackCalls[0].message.payload.text).toBe("message 1");
    expect(callbackCalls[1].message.payload.text).toBe("message 2");
    expect(callbackCalls[2].message.payload.text).toBe("message 3");

    // 验证所有消息都在队列中
    const queueDepth = bus.getQueueDepth("agent-1");
    expect(queueDepth).toBe(3);
  });

  test("没有回调函数时不会出�?, () => {
    // 创建没有回调�?MessageBus
    const noCallbackBus = new MessageBus({
      logger: {
        debug: async () => {},
        info: async () => {},
        warn: async () => {},
        error: async () => {}
      },
      getAgentStatus: () => "waiting_llm",
      isAgentActivelyProcessing: (agentId) => {
        return agentId === "agent-1";
      }
      // 没有 onInterruptionNeeded 回调
    });

    const message = {
      to: "agent-1",
      from: "user",
      payload: { text: "test message" }
    };

    // 发送消息不应该抛出错误
    const result = noCallbackBus.send(message);

    // 验证消息仍然被加入队�?
    expect(result.messageId).toBeDefined();
    expect(result.messageId.length).toBeGreaterThan(0);
    expect(result.interruptionTriggered).toBe(true);
    
    // 验证消息在队列中
    const queueDepth = noCallbackBus.getQueueDepth("agent-1");
    expect(queueDepth).toBe(1);
  });

  test("isAgentActivelyProcessing 回调被正确调�?, () => {
    // 创建新的调用记录数组
    const testCalls = [];
    
    // 创建新的 MessageBus 实例
    const testBus = new MessageBus({
      logger: {
        debug: async () => {},
        info: async () => {},
        warn: async () => {},
        error: async () => {}
      },
      getAgentStatus: () => "waiting_llm",
      isAgentActivelyProcessing: (agentId) => {
        testCalls.push(agentId);
        return agentId === "agent-1";
      },
      onInterruptionNeeded: (agentId, message) => {
        // 空回�?
      }
    });
    
    const message = {
      to: "agent-1",
      from: "user",
      payload: { text: "test message" }
    };

    testBus.send(message);

    // 验证 isAgentActivelyProcessing 被调�?
    expect(testCalls.length).toBe(1);
    expect(testCalls[0]).toBe("agent-1");
  });

  test("停止状态的智能体拒绝接收消�?, () => {
    // 创建带状态检查的 MessageBus
    const statusBus = new MessageBus({
      logger: {
        debug: async () => {},
        info: async () => {},
        warn: async () => {},
        error: async () => {}
      },
      getAgentStatus: (agentId) => {
        if (agentId === "stopped-agent") return "stopped";
        if (agentId === "stopping-agent") return "stopping";
        if (agentId === "terminating-agent") return "terminating";
        return "idle";
      }
    });

    // 测试 stopped 状态（暂停语义：允许发送）
    const result1 = statusBus.send({
      to: "stopped-agent",
      from: "user",
      payload: { text: "test" }
    });
    expect(result1.rejected).toBeUndefined();
    expect(result1.messageId).toBeDefined();

    // 测试 stopping 状态（暂停语义：允许发送）
    const result2 = statusBus.send({
      to: "stopping-agent",
      from: "user",
      payload: { text: "test" }
    });
    expect(result2.rejected).toBeUndefined();
    expect(result2.messageId).toBeDefined();

    // 测试 terminating 状�?
    const result3 = statusBus.send({
      to: "terminating-agent",
      from: "user",
      payload: { text: "test" }
    });
    expect(result3.rejected).toBe(true);
    expect(result3.reason).toBe("agent_terminating");

    // 测试正常状�?
    const result4 = statusBus.send({
      to: "normal-agent",
      from: "user",
      payload: { text: "test" }
    });
    expect(result4.rejected).toBeUndefined();
    expect(result4.messageId).toBeDefined();
  });
});
