/**
 * RuntimeMessaging 单元测试
 * 
 * 测试 RuntimeMessaging 类的消息处理功能，包括：
 * - 消息中断处理
 * - 消息处理循环
 * - 消息调度
 */

import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/runtime.js";
import { RuntimeMessaging } from "../../src/platform/runtime/runtime_messaging.js";
import { Agent } from "../../src/agents/agent.js";

describe("RuntimeMessaging", () => {
  let runtime;
  let messaging;
  let tmpDir;
  
  beforeEach(async () => {
    tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_messaging_test_" + Date.now());
    const artifactsDir = path.resolve(tmpDir, "artifacts");
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const configPath = path.resolve(tmpDir, "app.json");
    await writeFile(
      configPath,
      JSON.stringify({
        promptsDir: "config/prompts",
        artifactsDir,
        runtimeDir: tmpDir,
        maxSteps: 10
      }, null, 2),
      "utf8"
    );

    runtime = new Runtime({ configPath });
    await runtime.init();
    messaging = new RuntimeMessaging(runtime);
  });

  describe("消息中断处理", () => {
    test("处理消息中断", async () => {
      // 创建测试智能体
      const agent = new Agent({
        id: "test_agent",
        roleId: "test_role",
        roleName: "test",
        rolePrompt: "test",
        behavior: async () => {}
      });
      
      runtime.registerAgentInstance(agent);
      
      // 标记智能体为活跃处理中
      runtime._state.markAgentAsActivelyProcessing("test_agent");
      
      // 处理中断
      const message = {
        id: "msg1",
        from: "user",
        to: "test_agent",
        payload: "test"
      };
      
      messaging.handleMessageInterruption("test_agent", message);
      
      // 等待异步处理完成
      await new Promise(r => setTimeout(r, 50));
      
      // 验证消息被添加到插话队列
      expect(runtime._state.hasInterruptions("test_agent")).toBe(true);
    });

    test("智能体未在活跃处理时不添加插话", async () => {
      const agent = new Agent({
        id: "test_agent",
        roleId: "test_role",
        roleName: "test",
        rolePrompt: "test",
        behavior: async () => {}
      });
      
      runtime.registerAgentInstance(agent);
      
      // 不标记为活跃处理
      
      const message = {
        id: "msg1",
        from: "user",
        to: "test_agent",
        payload: "test"
      };
      
      messaging.handleMessageInterruption("test_agent", message);
      
      // 等待异步处理完成
      await new Promise(r => setTimeout(r, 50));
      
      // 验证消息未被添加到插话队列（返回 undefined 或 false）
      expect(runtime._state.hasInterruptions("test_agent")).toBeFalsy();
    });
  });

  describe("消息处理循环", () => {
    test("运行消息循环直到消息耗尽", async () => {
      let messageReceived = false;
      
      const agent = new Agent({
        id: "test_agent",
        roleId: "test_role",
        roleName: "test",
        rolePrompt: "test",
        behavior: async (ctx, msg) => {
          messageReceived = true;
        }
      });
      
      runtime.registerAgentInstance(agent);
      
      // 发送消息
      runtime.bus.send({
        to: "test_agent",
        from: "user",
        payload: "test message"
      });
      
      // 运行消息循环
      await messaging.run();
      
      expect(messageReceived).toBe(true);
    });

    test("达到最大步数限制时停止", async () => {
      let processCount = 0;
      
      const agent = new Agent({
        id: "test_agent",
        roleId: "test_role",
        roleName: "test",
        rolePrompt: "test",
        behavior: async (ctx, msg) => {
          processCount++;
          // 每次处理后发送新消息，形成循环
          if (processCount < 20) {
            runtime.bus.send({
              to: "test_agent",
              from: "user",
              payload: "test"
            });
          }
        }
      });
      
      runtime.registerAgentInstance(agent);
      
      // 发送初始消息
      runtime.bus.send({
        to: "test_agent",
        from: "user",
        payload: "test"
      });
      
      // 运行消息循环（maxSteps = 10）
      await messaging.run();
      
      // 应该在达到 maxSteps 时停止
      expect(processCount).toBeLessThanOrEqual(runtime.maxSteps);
    });

    test("停止请求时立即停止循环", async () => {
      const agent = new Agent({
        id: "test_agent",
        roleId: "test_role",
        roleName: "test",
        rolePrompt: "test",
        behavior: async () => {
          // 在处理第一条消息时请求停止
          runtime._stopRequested = true;
        }
      });
      
      runtime.registerAgentInstance(agent);
      
      // 发送多条消息
      for (let i = 0; i < 5; i++) {
        runtime.bus.send({
          to: "test_agent",
          from: "user",
          payload: `message ${i}`
        });
      }
      
      await messaging.run();
      
      // 应该还有未处理的消息
      expect(runtime.bus.hasPending()).toBe(true);
    });
  });

  describe("消息调度", () => {
    test("跳过已停止的智能体", async () => {
      let messageProcessed = false;
      
      const agent = new Agent({
        id: "test_agent",
        roleId: "test_role",
        roleName: "test",
        rolePrompt: "test",
        behavior: async () => {
          messageProcessed = true;
        }
      });
      
      runtime.registerAgentInstance(agent);
      
      // 设置智能体状态为已停止
      runtime._state.setAgentComputeStatus("test_agent", "stopped");
      
      // 发送消息
      runtime.bus.send({
        to: "test_agent",
        from: "user",
        payload: "test"
      });
      
      // 运行消息循环
      await messaging.run();
      
      // 消息不应该被处理
      expect(messageProcessed).toBe(false);
    });

    test("异常隔离：单个智能体异常不影响其他智能体", async () => {
      const processedAgents = [];
      
      // 创建会抛出异常的智能体
      const errorAgent = new Agent({
        id: "error_agent",
        roleId: "test_role",
        roleName: "error",
        rolePrompt: "test",
        behavior: async () => {
          processedAgents.push("error_agent");
          throw new Error("Test error");
        }
      });
      
      // 创建正常的智能体
      const normalAgent = new Agent({
        id: "normal_agent",
        roleId: "test_role",
        roleName: "normal",
        rolePrompt: "test",
        behavior: async () => {
          processedAgents.push("normal_agent");
        }
      });
      
      runtime.registerAgentInstance(errorAgent);
      runtime.registerAgentInstance(normalAgent);
      
      // 发送消息给两个智能体
      runtime.bus.send({
        to: "error_agent",
        from: "user",
        payload: "test"
      });
      runtime.bus.send({
        to: "normal_agent",
        from: "user",
        payload: "test"
      });
      
      // 运行消息循环
      await messaging.run();
      
      // 两个智能体都应该被处理
      expect(processedAgents).toContain("error_agent");
      expect(processedAgents).toContain("normal_agent");
    });
  });

  describe("并发控制", () => {
    test("同一智能体串行处理消息", async () => {
      const processingOrder = [];
      let currentlyProcessing = false;
      
      const agent = new Agent({
        id: "test_agent",
        roleId: "test_role",
        roleName: "test",
        rolePrompt: "test",
        behavior: async (ctx, msg) => {
          // 验证没有并发处理
          expect(currentlyProcessing).toBe(false);
          currentlyProcessing = true;
          
          processingOrder.push(msg.payload);
          await new Promise(r => setTimeout(r, 10));
          
          currentlyProcessing = false;
        }
      });
      
      runtime.registerAgentInstance(agent);
      
      // 发送多条消息
      runtime.bus.send({ to: "test_agent", from: "user", payload: "msg1" });
      runtime.bus.send({ to: "test_agent", from: "user", payload: "msg2" });
      runtime.bus.send({ to: "test_agent", from: "user", payload: "msg3" });
      
      await messaging.run();
      
      // 验证消息按顺序处理
      expect(processingOrder).toEqual(["msg1", "msg2", "msg3"]);
    });
  });
});
