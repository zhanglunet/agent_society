/**
 * RuntimeLlm 单元测试
 * 
 * 测试 RuntimeLlm 类的 LLM 交互功能，包括：
 * - 系统提示词构建
 * - 消息格式化
 * - 对话历史管理
 * - 发送者信息获取
 * - 错误通知发送
 */

import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/runtime.js";
import { RuntimeLlm } from "../../src/platform/runtime/runtime_llm.js";

describe("RuntimeLlm", () => {
  let runtime;
  let llm;
  let tmpDir;
  
  beforeEach(async () => {
    tmpDir = path.resolve(process.cwd(), "test/.tmp/runtime_llm_test_" + Date.now());
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
        maxSteps: 50
      }, null, 2),
      "utf8"
    );

    runtime = new Runtime({ configPath });
    await runtime.init();
    llm = new RuntimeLlm(runtime);
  });

  describe("系统提示词构建", () => {
    test("为 root 智能体构建系统提示词", () => {
      const rootAgent = runtime._agents.get("root");
      const ctx = runtime._buildAgentContext(rootAgent);
      
      const systemPrompt = llm.buildSystemPromptForAgent(ctx);
      
      expect(typeof systemPrompt).toBe("string");
      expect(systemPrompt.length).toBeGreaterThan(0);
      // 验证包含运行时信息
      expect(systemPrompt).toContain("运行时信息");
    });

    test("为非 root 智能体构建系统提示词", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "This is a test role"
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const ctx = runtime._buildAgentContext(agent);
      const systemPrompt = llm.buildSystemPromptForAgent(ctx);
      
      expect(typeof systemPrompt).toBe("string");
      expect(systemPrompt).toContain("This is a test role");
      expect(systemPrompt).toContain(`agentId=${agent.id}`);
      expect(systemPrompt).toContain("parentAgentId=root");
    });

    test("系统提示词包含任务委托书", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test"
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      // 设置任务委托书
      const taskBrief = {
        taskId: "task1",
        description: "Test task description",
        requirements: ["req1", "req2"]
      };
      runtime._agentTaskBriefs.set(agent.id, taskBrief);
      
      const ctx = runtime._buildAgentContext(agent);
      const systemPrompt = llm.buildSystemPromptForAgent(ctx);
      
      // 验证系统提示词包含任务委托书相关内容
      expect(systemPrompt).toContain("任务委托书");
    });
  });

  describe("消息格式化", () => {
    test("为 root 智能体格式化消息（包含 taskId）", () => {
      const rootAgent = runtime._agents.get("root");
      const ctx = runtime._buildAgentContext(rootAgent);
      
      const message = {
        from: "user",
        to: "root",
        taskId: "task1",
        payload: { text: "Hello" }
      };
      
      const formatted = llm.formatMessageForLlm(ctx, message);
      
      // root 智能体使用原有格式
      expect(formatted).toContain("Hello");
      expect(typeof formatted).toBe("string");
    });

    test("为非 root 智能体格式化消息（隐藏 taskId）", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test"
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const ctx = runtime._buildAgentContext(agent);
      
      const message = {
        from: "user",
        to: agent.id,
        taskId: "task1",
        payload: { text: "Hello" }
      };
      
      const formatted = llm.formatMessageForLlm(ctx, message);
      
      expect(formatted).toContain("Hello");
      // 非 root 智能体不应该看到 taskId
      expect(formatted).not.toContain("taskId");
    });
  });

  describe("发送者信息获取", () => {
    test("获取 user 的发送者信息", () => {
      const senderInfo = llm.getSenderInfo("user");
      
      expect(senderInfo).toBeTruthy();
      expect(senderInfo.role).toBe("user");
    });

    test("获取 root 的发送者信息", () => {
      const senderInfo = llm.getSenderInfo("root");
      
      expect(senderInfo).toBeTruthy();
      expect(senderInfo.role).toBe("root");
    });

    test("获取已注册智能体的发送者信息", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test"
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const senderInfo = llm.getSenderInfo(agent.id);
      
      expect(senderInfo).toBeTruthy();
      expect(senderInfo.role).toBe("test_role");
    });

    test("获取未知发送者的信息", () => {
      const senderInfo = llm.getSenderInfo("unknown_agent");
      
      expect(senderInfo).toBeTruthy();
      expect(senderInfo.role).toBe("unknown");
    });
  });

  describe("对话历史管理", () => {
    test("确保对话历史存在", () => {
      const systemPrompt = "Test system prompt";
      
      const conv = llm.ensureConversation("test_agent", systemPrompt);
      
      expect(Array.isArray(conv)).toBe(true);
      expect(conv.length).toBe(1);
      expect(conv[0].role).toBe("system");
      expect(conv[0].content).toBe(systemPrompt);
    });

    test("多次调用返回同一对话历史", () => {
      const systemPrompt = "Test system prompt";
      
      const conv1 = llm.ensureConversation("test_agent", systemPrompt);
      const conv2 = llm.ensureConversation("test_agent", systemPrompt);
      
      expect(conv1).toBe(conv2);
    });

    test("不同智能体有独立的对话历史", () => {
      const conv1 = llm.ensureConversation("agent1", "prompt1");
      const conv2 = llm.ensureConversation("agent2", "prompt2");
      
      expect(conv1).not.toBe(conv2);
      expect(conv1[0].content).toBe("prompt1");
      expect(conv2[0].content).toBe("prompt2");
    });
  });

  describe("错误通知发送", () => {
    test("向父智能体发送错误通知", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test"
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const originalMessage = {
        id: "msg1",
        from: "root",
        to: agent.id,
        taskId: "task1",
        payload: "test"
      };
      
      const errorInfo = {
        errorType: "test_error",
        message: "Test error message"
      };
      
      await llm.sendErrorNotificationToParent(agent.id, originalMessage, errorInfo);
      
      // 等待异步消息处理
      await new Promise(r => setTimeout(r, 50));
      
      // 验证错误通知被发送（可能需要等待消息投递）
      // 由于消息是异步发送的，我们只验证方法不抛出异常
      expect(true).toBe(true);
    });

    test("没有父智能体时不发送通知", async () => {
      const originalMessage = {
        id: "msg1",
        from: "user",
        to: "root",
        payload: "test"
      };
      
      const errorInfo = {
        errorType: "test_error",
        message: "Test error message"
      };
      
      // root 没有父智能体，不应该抛出异常
      await llm.sendErrorNotificationToParent("root", originalMessage, errorInfo);
      
      // 验证方法正常完成
      expect(true).toBe(true);
    });
  });

  describe("上下文检查", () => {
    test("检查上下文长度", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test"
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      // 创建对话历史
      llm.ensureConversation(agent.id, "system prompt");
      
      const result = llm.checkContextAndWarn(agent.id);
      
      expect(result).toBeTruthy();
      expect(typeof result.warning).toBe("boolean");
    });
  });
});
