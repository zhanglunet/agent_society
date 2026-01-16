/**
 * Runtime 插话队列管理单元测试
 * 
 * 测试 Runtime 的插话队列管理功能：
 * - addInterruption() 方法
 * - getAndClearInterruptions() 方法
 * - FIFO 顺序
 * - 空队列情况
 * 
 * Requirements: 1.1, 4.1, 4.2, 4.3, 4.4
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { Runtime } from "../../src/platform/runtime.js";

describe("Runtime 插话队列管理", () => {
  let runtime;

  beforeEach(async () => {
    runtime = new Runtime({
      config: {
        runtimeDir: "./test/.tmp/runtime_interruption_queue_test",
        artifactsDir: "./test/.tmp/runtime_interruption_queue_test/artifacts",
        promptsDir: "./config/prompts",
        logging: { level: "error" },
        llm: null
      }
    });
    await runtime.init();
  });

  test("addInterruption 正确添加消息到队列", () => {
    const agentId = "test-agent";
    const message = {
      id: "msg-1",
      from: "user",
      to: agentId,
      payload: { text: "test message" }
    };

    runtime.addInterruption(agentId, message);

    // 验证队列中有消息
    const queue = runtime._interruptionQueues.get(agentId);
    expect(queue).toBeDefined();
    expect(queue.length).toBe(1);
    expect(queue[0]).toBe(message);
  });

  test("addInterruption 支持多次添加消息", () => {
    const agentId = "test-agent";
    const message1 = {
      id: "msg-1",
      from: "user",
      to: agentId,
      payload: { text: "message 1" }
    };
    const message2 = {
      id: "msg-2",
      from: "user",
      to: agentId,
      payload: { text: "message 2" }
    };
    const message3 = {
      id: "msg-3",
      from: "user",
      to: agentId,
      payload: { text: "message 3" }
    };

    runtime.addInterruption(agentId, message1);
    runtime.addInterruption(agentId, message2);
    runtime.addInterruption(agentId, message3);

    // 验证队列中有3条消息
    const queue = runtime._interruptionQueues.get(agentId);
    expect(queue).toBeDefined();
    expect(queue.length).toBe(3);
  });

  test("getAndClearInterruptions 返回所有插话消息并清空队列", () => {
    const agentId = "test-agent";
    const message1 = {
      id: "msg-1",
      from: "user",
      to: agentId,
      payload: { text: "message 1" }
    };
    const message2 = {
      id: "msg-2",
      from: "user",
      to: agentId,
      payload: { text: "message 2" }
    };

    runtime.addInterruption(agentId, message1);
    runtime.addInterruption(agentId, message2);

    // 获取并清空队列
    const interruptions = runtime.getAndClearInterruptions(agentId);

    // 验证返回的消息
    expect(interruptions).toBeDefined();
    expect(interruptions.length).toBe(2);
    expect(interruptions[0]).toBe(message1);
    expect(interruptions[1]).toBe(message2);

    // 验证队列已被清空
    const queue = runtime._interruptionQueues.get(agentId);
    expect(queue).toBeUndefined();
  });

  test("getAndClearInterruptions 保持 FIFO 顺序", () => {
    const agentId = "test-agent";
    const messages = [];
    
    // 添加10条消息
    for (let i = 0; i < 10; i++) {
      const message = {
        id: `msg-${i}`,
        from: "user",
        to: agentId,
        payload: { text: `message ${i}` }
      };
      messages.push(message);
      runtime.addInterruption(agentId, message);
    }

    // 获取并验证顺序
    const interruptions = runtime.getAndClearInterruptions(agentId);
    expect(interruptions.length).toBe(10);
    
    for (let i = 0; i < 10; i++) {
      expect(interruptions[i]).toBe(messages[i]);
      expect(interruptions[i].id).toBe(`msg-${i}`);
    }
  });

  test("getAndClearInterruptions 处理空队列情况", () => {
    const agentId = "test-agent";

    // 获取不存在的队列
    const interruptions = runtime.getAndClearInterruptions(agentId);

    // 验证返回空数组
    expect(interruptions).toBeDefined();
    expect(interruptions.length).toBe(0);
    expect(Array.isArray(interruptions)).toBe(true);
  });

  test("多个智能体的插话队列相互独立", () => {
    const agent1 = "agent-1";
    const agent2 = "agent-2";
    
    const message1 = {
      id: "msg-1",
      from: "user",
      to: agent1,
      payload: { text: "message for agent 1" }
    };
    const message2 = {
      id: "msg-2",
      from: "user",
      to: agent2,
      payload: { text: "message for agent 2" }
    };

    runtime.addInterruption(agent1, message1);
    runtime.addInterruption(agent2, message2);

    // 验证队列独立
    const queue1 = runtime._interruptionQueues.get(agent1);
    const queue2 = runtime._interruptionQueues.get(agent2);
    
    expect(queue1.length).toBe(1);
    expect(queue2.length).toBe(1);
    expect(queue1[0]).toBe(message1);
    expect(queue2[0]).toBe(message2);

    // 清空 agent1 的队列不影响 agent2
    runtime.getAndClearInterruptions(agent1);
    
    expect(runtime._interruptionQueues.get(agent1)).toBeUndefined();
    expect(runtime._interruptionQueues.get(agent2)).toBeDefined();
    expect(runtime._interruptionQueues.get(agent2).length).toBe(1);
  });

  test("连续调用 getAndClearInterruptions 返回空数组", () => {
    const agentId = "test-agent";
    const message = {
      id: "msg-1",
      from: "user",
      to: agentId,
      payload: { text: "test message" }
    };

    runtime.addInterruption(agentId, message);

    // 第一次调用返回消息
    const interruptions1 = runtime.getAndClearInterruptions(agentId);
    expect(interruptions1.length).toBe(1);

    // 第二次调用返回空数组
    const interruptions2 = runtime.getAndClearInterruptions(agentId);
    expect(interruptions2.length).toBe(0);

    // 第三次调用仍然返回空数组
    const interruptions3 = runtime.getAndClearInterruptions(agentId);
    expect(interruptions3.length).toBe(0);
  });
});
