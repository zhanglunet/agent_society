/**
 * RuntimeEvents 单元测试
 * 
 * 测试 RuntimeEvents 类的事件管理功能，包括：
 * - 工具调用事件
 * - 错误事件
 * - LLM 重试事件
 * - 运算状态变更事件
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { RuntimeEvents } from "../../src/platform/runtime/runtime_events.js";

describe("RuntimeEvents", () => {
  let events;
  
  beforeEach(() => {
    events = new RuntimeEvents({
      logger: null
    });
  });

  describe("工具调用事件", () => {
    test("注册和触发工具调用事件", () => {
      let eventReceived = null;
      
      events.onToolCall((event) => {
        eventReceived = event;
      });
      
      const testEvent = {
        agentId: "agent1",
        toolName: "test_tool",
        args: { param: "value" },
        result: { success: true },
        taskId: "task1"
      };
      
      events.emitToolCall(testEvent);
      
      expect(eventReceived).toEqual(testEvent);
    });

    test("多个监听器都会收到事件", () => {
      const receivedEvents = [];
      
      events.onToolCall((event) => receivedEvents.push({ listener: 1, event }));
      events.onToolCall((event) => receivedEvents.push({ listener: 2, event }));
      
      const testEvent = { agentId: "agent1", toolName: "test" };
      events.emitToolCall(testEvent);
      
      expect(receivedEvents.length).toBe(2);
      expect(receivedEvents[0].listener).toBe(1);
      expect(receivedEvents[1].listener).toBe(2);
    });

    test("移除监听器后不再收到事件", () => {
      let callCount = 0;
      const listener = () => { callCount++; };
      
      events.onToolCall(listener);
      events.emitToolCall({ agentId: "agent1" });
      expect(callCount).toBe(1);
      
      events.offToolCall(listener);
      events.emitToolCall({ agentId: "agent1" });
      expect(callCount).toBe(1); // 没有增加
    });

    test("监听器抛出异常不影响其他监听器", () => {
      const receivedEvents = [];
      
      events.onToolCall(() => {
        throw new Error("Listener error");
      });
      events.onToolCall((event) => receivedEvents.push(event));
      
      const testEvent = { agentId: "agent1" };
      events.emitToolCall(testEvent);
      
      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0]).toEqual(testEvent);
    });
  });

  describe("错误事件", () => {
    test("注册和触发错误事件", () => {
      let eventReceived = null;
      
      events.onError((event) => {
        eventReceived = event;
      });
      
      const testEvent = {
        agentId: "agent1",
        errorType: "test_error",
        message: "Test error message",
        timestamp: "2024-01-01T00:00:00Z"
      };
      
      events.emitError(testEvent);
      
      expect(eventReceived).toEqual(testEvent);
    });

    test("移除错误事件监听器", () => {
      let callCount = 0;
      const listener = () => { callCount++; };
      
      events.onError(listener);
      events.emitError({ agentId: "agent1" });
      expect(callCount).toBe(1);
      
      events.offError(listener);
      events.emitError({ agentId: "agent1" });
      expect(callCount).toBe(1);
    });
  });

  describe("LLM 重试事件", () => {
    test("注册和触发 LLM 重试事件", () => {
      let eventReceived = null;
      
      events.onLlmRetry((event) => {
        eventReceived = event;
      });
      
      const testEvent = {
        agentId: "agent1",
        attempt: 2,
        maxRetries: 3,
        delayMs: 1000,
        errorMessage: "Connection timeout",
        timestamp: "2024-01-01T00:00:00Z"
      };
      
      events.emitLlmRetry(testEvent);
      
      expect(eventReceived).toEqual(testEvent);
    });

    test("移除 LLM 重试事件监听器", () => {
      let callCount = 0;
      const listener = () => { callCount++; };
      
      events.onLlmRetry(listener);
      events.emitLlmRetry({ agentId: "agent1" });
      expect(callCount).toBe(1);
      
      events.offLlmRetry(listener);
      events.emitLlmRetry({ agentId: "agent1" });
      expect(callCount).toBe(1);
    });
  });

  describe("运算状态变更事件", () => {
    test("注册和触发运算状态变更事件", () => {
      let eventReceived = null;
      
      events.onComputeStatusChange((event) => {
        eventReceived = event;
      });
      
      events.emitComputeStatusChange("agent1", "waiting_llm");
      
      expect(eventReceived).toBeTruthy();
      expect(eventReceived.agentId).toBe("agent1");
      expect(eventReceived.status).toBe("waiting_llm");
      expect(eventReceived.timestamp).toBeTruthy();
    });

    test("移除运算状态变更事件监听器", () => {
      let callCount = 0;
      const listener = () => { callCount++; };
      
      events.onComputeStatusChange(listener);
      events.emitComputeStatusChange("agent1", "idle");
      expect(callCount).toBe(1);
      
      events.offComputeStatusChange(listener);
      events.emitComputeStatusChange("agent1", "processing");
      expect(callCount).toBe(1);
    });
  });

  describe("工具方法", () => {
    test("获取监听器数量", () => {
      events.onToolCall(() => {});
      events.onToolCall(() => {});
      events.onError(() => {});
      events.onLlmRetry(() => {});
      events.onComputeStatusChange(() => {});
      
      const counts = events.getListenerCounts();
      
      expect(counts.toolCall).toBe(2);
      expect(counts.error).toBe(1);
      expect(counts.llmRetry).toBe(1);
      expect(counts.computeStatusChange).toBe(1);
    });

    test("移除所有监听器", () => {
      events.onToolCall(() => {});
      events.onError(() => {});
      events.onLlmRetry(() => {});
      events.onComputeStatusChange(() => {});
      
      events.removeAllListeners();
      
      const counts = events.getListenerCounts();
      expect(counts.toolCall).toBe(0);
      expect(counts.error).toBe(0);
      expect(counts.llmRetry).toBe(0);
      expect(counts.computeStatusChange).toBe(0);
    });
  });

  describe("边界情况", () => {
    test("注册非函数类型的监听器应被忽略", () => {
      events.onToolCall("not a function");
      events.onToolCall(null);
      events.onToolCall(undefined);
      
      const counts = events.getListenerCounts();
      expect(counts.toolCall).toBe(0);
    });

    test("触发事件时没有监听器不会报错", () => {
      expect(() => {
        events.emitToolCall({ agentId: "agent1" });
        events.emitError({ agentId: "agent1" });
        events.emitLlmRetry({ agentId: "agent1" });
        events.emitComputeStatusChange("agent1", "idle");
      }).not.toThrow();
    });

    test("移除不存在的监听器不会报错", () => {
      const listener = () => {};
      
      expect(() => {
        events.offToolCall(listener);
        events.offError(listener);
        events.offLlmRetry(listener);
        events.offComputeStatusChange(listener);
      }).not.toThrow();
    });
  });
});
