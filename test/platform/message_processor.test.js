/**
 * MessageProcessor 单元测试
 * 
 * 测试 MessageProcessor 的核心功能：
 * - 消息调度
 * - 并发控制
 * - 消息处理
 * - 串行约束
 */

import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/core/runtime.js";
import { Agent } from "../../src/agents/agent.js";

describe("MessageProcessor", () => {
  let runtime;
  let tmpDir;
  let artifactsDir;

  beforeEach(async () => {
    tmpDir = path.resolve(process.cwd(), `test/.tmp/message_processor_test_${Date.now()}`);
    artifactsDir = path.resolve(tmpDir, "artifacts");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir,
        runtimeDir: tmpDir,
        maxSteps: 50
      }, null, 2),
      "utf8"
    );

    runtime = new Runtime({ configPath });
    await runtime.init();
  });

  test("scheduleMessageProcessing schedules message for processing", async () => {
    let messageReceived = false;
    let receivedMessage = null;

    // 创建测试智能体
    const testAgent = new Agent({
      id: "test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        messageReceived = true;
        receivedMessage = msg;
      }
    });

    runtime.registerAgentInstance(testAgent);

    // 发送消息
    runtime.bus.send({
      to: "test-agent",
      from: "user",
      payload: { text: "test message" }
    });

    // 调度消息处理
    const maxConcurrent = 3;
    const scheduled = await runtime._messageProcessor.scheduleMessageProcessing(maxConcurrent);

    expect(scheduled).toBe(true);

    // 等待消息处理完成
    await new Promise(r => setTimeout(r, 100));

    expect(messageReceived).toBe(true);
    expect(receivedMessage).toBeTruthy();
    expect(receivedMessage.payload.text).toBe("test message");
  });

  test("scheduleMessageProcessing respects concurrency limit", async () => {
    const processedMessages = [];

    // 创建多个测试智能体
    for (let i = 0; i < 5; i++) {
      const agent = new Agent({
        id: `agent-${i}`,
        roleId: "test-role",
        roleName: "test",
        rolePrompt: "",
        behavior: async (ctx, msg) => {
          processedMessages.push(msg.to);
          // 模拟长时间处理
          await new Promise(r => setTimeout(r, 100));
        }
      });
      runtime.registerAgentInstance(agent);
    }

    // 发送消息给所有智能体
    for (let i = 0; i < 5; i++) {
      runtime.bus.send({
        to: `agent-${i}`,
        from: "user",
        payload: { text: `message ${i}` }
      });
    }

    // 调度消息处理（最大并发数为 2）
    const maxConcurrent = 2;
    
    // 第一次调度
    const scheduled1 = await runtime._messageProcessor.scheduleMessageProcessing(maxConcurrent);
    expect(scheduled1).toBe(true);
    expect(runtime._activeProcessingAgents.size).toBe(1);

    // 第二次调度
    const scheduled2 = await runtime._messageProcessor.scheduleMessageProcessing(maxConcurrent);
    expect(scheduled2).toBe(true);
    expect(runtime._activeProcessingAgents.size).toBe(2);

    // 第三次调度应该失败（达到并发限制）
    const scheduled3 = await runtime._messageProcessor.scheduleMessageProcessing(maxConcurrent);
    expect(scheduled3).toBe(false);
    expect(runtime._activeProcessingAgents.size).toBe(2);
  });

  test("scheduleMessageProcessing skips agents already processing", async () => {
    let processCount = 0;

    const agent = new Agent({
      id: "test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        processCount++;
        await new Promise(r => setTimeout(r, 100));
      }
    });

    runtime.registerAgentInstance(agent);

    // 发送两条消息
    runtime.bus.send({ to: "test-agent", from: "user", payload: { text: "msg1" } });
    runtime.bus.send({ to: "test-agent", from: "user", payload: { text: "msg2" } });

    // 第一次调度
    const scheduled1 = await runtime._messageProcessor.scheduleMessageProcessing(3);
    expect(scheduled1).toBe(true);
    expect(runtime._activeProcessingAgents.has("test-agent")).toBe(true);

    // 第二次调度应该跳过（智能体正在处理）
    const scheduled2 = await runtime._messageProcessor.scheduleMessageProcessing(3);
    expect(scheduled2).toBe(false);

    // 等待第一条消息处理完成
    await new Promise(r => setTimeout(r, 150));

    // 现在应该可以调度第二条消息
    const scheduled3 = await runtime._messageProcessor.scheduleMessageProcessing(3);
    expect(scheduled3).toBe(true);

    // 等待第二条消息处理完成
    await new Promise(r => setTimeout(r, 150));

    expect(processCount).toBe(2);
  });

  test("processAgentMessage updates agent activity time", async () => {
    const agent = new Agent({
      id: "test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async (ctx, msg) => {}
    });

    runtime.registerAgentInstance(agent);

    const beforeTime = Date.now();
    await new Promise(r => setTimeout(r, 10));

    const message = {
      id: "msg-1",
      to: "test-agent",
      from: "user",
      payload: { text: "test" }
    };

    await runtime._messageProcessor.processAgentMessage("test-agent", message);

    const lastActivity = runtime._agentLastActivityTime.get("test-agent");
    expect(lastActivity).toBeGreaterThan(beforeTime);
  });

  test("processAgentMessage handles agent not found", async () => {
    const message = {
      id: "msg-1",
      to: "non-existent",
      from: "user",
      payload: { text: "test" }
    };

    // 不应该抛出错误
    await runtime._messageProcessor.processAgentMessage("non-existent", message);
  });

  test("processAgentMessage handles behavior errors gracefully", async () => {
    const agent = new Agent({
      id: "test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        throw new Error("Test error");
      }
    });

    runtime.registerAgentInstance(agent);

    const message = {
      id: "msg-1",
      to: "test-agent",
      from: "user",
      payload: { text: "test" }
    };

    // 不应该抛出错误（错误被隔离）
    await runtime._messageProcessor.processAgentMessage("test-agent", message);

    // 智能体应该仍然存在
    expect(runtime._agents.has("test-agent")).toBe(true);
  });

  test("deliverOneRound processes multiple messages concurrently", async () => {
    const processedAgents = [];

    // 创建多个智能体
    for (let i = 0; i < 3; i++) {
      const agent = new Agent({
        id: `agent-${i}`,
        roleId: "test-role",
        roleName: "test",
        rolePrompt: "",
        behavior: async (ctx, msg) => {
          processedAgents.push(ctx.agent.id);
          await new Promise(r => setTimeout(r, 50));
        }
      });
      runtime.registerAgentInstance(agent);
    }

    // 发送消息
    for (let i = 0; i < 3; i++) {
      runtime.bus.send({
        to: `agent-${i}`,
        from: "user",
        payload: { text: `message ${i}` }
      });
    }

    // 执行一轮投递
    const delivered = await runtime._messageProcessor.deliverOneRound();
    expect(delivered).toBe(true);

    // 等待所有消息处理完成
    await new Promise(r => setTimeout(r, 100));

    expect(processedAgents.length).toBe(3);
  });

  test("deliverOneRound returns false when no messages", async () => {
    const delivered = await runtime._messageProcessor.deliverOneRound();
    expect(delivered).toBe(false);
  });

  test("drainAgentQueue processes all pending messages", async () => {
    const processedMessages = [];

    const agent = new Agent({
      id: "test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        processedMessages.push(msg.payload.text);
      }
    });

    runtime.registerAgentInstance(agent);

    // 发送多条消息
    for (let i = 0; i < 5; i++) {
      runtime.bus.send({
        to: "test-agent",
        from: "user",
        payload: { text: `message ${i}` }
      });
    }

    // 清空队列
    await runtime._messageProcessor.drainAgentQueue("test-agent");

    expect(processedMessages.length).toBe(5);
    expect(processedMessages).toContain("message 0");
    expect(processedMessages).toContain("message 4");
  });

  test("drainAgentQueue handles agent not found", async () => {
    // 不应该抛出错误
    await runtime._messageProcessor.drainAgentQueue("non-existent");
  });

  test("drainAgentQueue limits number of processed messages", async () => {
    const processedMessages = [];

    const agent = new Agent({
      id: "test-agent",
      roleId: "test-role",
      roleName: "test",
      rolePrompt: "",
      behavior: async (ctx, msg) => {
        processedMessages.push(msg.payload.text);
      }
    });

    runtime.registerAgentInstance(agent);

    // 发送超过限制的消息数量（maxDrainMessages = 100）
    for (let i = 0; i < 150; i++) {
      runtime.bus.send({
        to: "test-agent",
        from: "user",
        payload: { text: `message ${i}` }
      });
    }

    // 清空队列
    await runtime._messageProcessor.drainAgentQueue("test-agent");

    // 应该只处理 100 条消息
    expect(processedMessages.length).toBe(100);
  });
});
