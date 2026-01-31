/**
 * RuntimeLlm Unit Tests
 */

import { describe, expect, test, beforeEach } from "bun:test";
import path from "node:path";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { Runtime } from "../../src/platform/core/runtime.js";
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

  describe("System Prompt Construction", () => {
    test("buildSystemPromptForAgent for root", async () => {
      const rootAgent = runtime._agents.get("root");
      const ctx = runtime._buildAgentContext(rootAgent);
      
      const systemPrompt = llm.buildSystemPromptForAgent(ctx);
      
      expect(typeof systemPrompt).toBe("string");
      expect(systemPrompt.length).toBeGreaterThan(0);
    });

    test("buildSystemPromptForAgent for non-root agent", async () => {
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

    test("System prompt includes task brief", async () => {
      const role = await runtime.org.createRole({
        name: "test_role",
        rolePrompt: "test"
      });
      
      const agent = await runtime.spawnAgent({
        roleId: role.id,
        parentAgentId: "root"
      });
      
      const taskBrief = {
        objective: "Test task objective",
        constraints: ["req1", "req2"],
        inputs: "input data",
        outputs: "output data",
        completion_criteria: "criteria"
      };
      runtime._agentTaskBriefs.set(agent.id, taskBrief);
      
      const ctx = runtime._buildAgentContext(agent);
      const systemPrompt = llm.buildSystemPromptForAgent(ctx);
      
      expect(systemPrompt).toContain("Test task objective");
    });
  });

  describe("Message Formatting", () => {
    test("formatMessageForLlm for root with taskId", async () => {
      const rootAgent = runtime._agents.get("root");
      const ctx = runtime._buildAgentContext(rootAgent);
      
      const message = {
        from: "user",
        to: "root",
        taskId: "task1",
        payload: { text: "Hello" }
      };
      
      const formatted = await llm.formatMessageForLlm(ctx, message);
      
      expect(formatted).toContain("Hello");
      expect(typeof formatted).toBe("string");
    });

    test("formatMessageForLlm for non-root agent with taskId", async () => {
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
      
      const formatted = await llm.formatMessageForLlm(ctx, message);
      
      expect(formatted).toContain("Hello");
      expect(formatted).not.toContain("taskId");
    });
  });

  describe("Sender Info Retrieval", () => {
    test("get sender info for user", () => {
      const senderInfo = llm.getSenderInfo("user");
      
      expect(senderInfo).toBeTruthy();
      expect(senderInfo.role).toBe("user");
    });

    test("get sender info for root", () => {
      const senderInfo = llm.getSenderInfo("root");
      
      expect(senderInfo).toBeTruthy();
      expect(senderInfo.role).toBe("root");
    });

    test("get sender info for registered agent", async () => {
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

    test("get sender info for unknown sender", () => {
      const senderInfo = llm.getSenderInfo("unknown_agent");
      
      expect(senderInfo).toBeTruthy();
      expect(senderInfo.role).toBe("unknown");
    });
  });

  describe("Conversation Management", () => {
    test("ensureConversation creates a new conversation", () => {
      const systemPrompt = "Test system prompt";
      
      const conv = llm.ensureConversation("test_agent", systemPrompt);
      
      expect(Array.isArray(conv)).toBe(true);
      expect(conv.length).toBe(1);
      expect(conv[0].role).toBe("system");
      expect(conv[0].content).toBe(systemPrompt);
    });

    test("multiple calls return the same conversation instance", () => {
      const systemPrompt = "Test system prompt";
      
      const conv1 = llm.ensureConversation("test_agent", systemPrompt);
      const conv2 = llm.ensureConversation("test_agent", systemPrompt);
      
      expect(conv1).toBe(conv2);
    });

    test("different agents have separate conversations", () => {
      const conv1 = llm.ensureConversation("agent1", "prompt1");
      const conv2 = llm.ensureConversation("agent2", "prompt2");
      
      expect(conv1).not.toBe(conv2);
      expect(conv1[0].content).toBe("prompt1");
      expect(conv2[0].content).toBe("prompt2");
    });
  });

  describe("Error Notification", () => {
    test("send error notification to parent", async () => {
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
    });
  });
});
