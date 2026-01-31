import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { rm, mkdir } from "node:fs/promises";
import path from "node:path";
import { ConversationManager } from "../../src/platform/services/conversation/conversation_manager.js";

describe("ConversationManager", () => {
  let manager;
  let tempDir;

  beforeEach(() => {
    tempDir = path.resolve(process.cwd(), `test/.tmp/conv_mgr_test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    manager = new ConversationManager({
      maxContextMessages: 50,
      conversationsDir: tempDir,
      contextLimit: {
        maxTokens: 128000,
        warningThreshold: 0.7,
        criticalThreshold: 0.9,
        hardLimitThreshold: 0.95
      }
    });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  describe("基础会话管理", () => {
    test("ensureConversation 创建新会�?, () => {
      const agentId = "agent-1";
      const systemPrompt = "You are a helpful assistant";
      
      const conv = manager.ensureConversation(agentId, systemPrompt);
      
      expect(conv).toBeDefined();
      expect(Array.isArray(conv)).toBe(true);
      expect(conv.length).toBe(1);
      expect(conv[0].role).toBe("system");
      expect(conv[0].content).toBe(systemPrompt);
    });

    test("ensureConversation 返回已存在的会话", () => {
      const agentId = "agent-1";
      const systemPrompt = "You are a helpful assistant";
      
      const conv1 = manager.ensureConversation(agentId, systemPrompt);
      conv1.push({ role: "user", content: "Hello" });
      
      const conv2 = manager.ensureConversation(agentId, systemPrompt);
      
      expect(conv2).toBe(conv1);
      expect(conv2.length).toBe(2);
    });

    test("getConversation 返回已存在的会话", () => {
      const agentId = "agent-1";
      const systemPrompt = "You are a helpful assistant";
      
      manager.ensureConversation(agentId, systemPrompt);
      const conv = manager.getConversation(agentId);
      
      expect(conv).toBeDefined();
      expect(conv.length).toBe(1);
    });

    test("getConversation 返回 undefined 对于不存在的会话", () => {
      const conv = manager.getConversation("nonexistent");
      expect(conv).toBeUndefined();
    });

    test("hasConversation 检查会话是否存�?, () => {
      const agentId = "agent-1";
      
      expect(manager.hasConversation(agentId)).toBe(false);
      
      manager.ensureConversation(agentId, "system prompt");
      
      expect(manager.hasConversation(agentId)).toBe(true);
    });

    test("deleteConversation 删除会话", () => {
      const agentId = "agent-1";
      
      manager.ensureConversation(agentId, "system prompt");
      expect(manager.hasConversation(agentId)).toBe(true);
      
      const deleted = manager.deleteConversation(agentId);
      
      expect(deleted).toBe(true);
      expect(manager.hasConversation(agentId)).toBe(false);
    });

    test("getMessageCount 返回消息数量", () => {
      const agentId = "agent-1";
      
      expect(manager.getMessageCount(agentId)).toBe(0);
      
      const conv = manager.ensureConversation(agentId, "system prompt");
      expect(manager.getMessageCount(agentId)).toBe(1);
      
      conv.push({ role: "user", content: "Hello" });
      conv.push({ role: "assistant", content: "Hi" });
      
      expect(manager.getMessageCount(agentId)).toBe(3);
    });
  });

  describe("会话压缩", () => {
    test("compress 压缩会话历史", () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "You are a helpful assistant");
      
      // 添加多条消息
      for (let i = 0; i < 20; i++) {
        conv.push({ role: "user", content: `Message ${i}` });
        conv.push({ role: "assistant", content: `Response ${i}` });
      }
      
      const originalCount = conv.length;
      expect(originalCount).toBe(41); // 1 system + 40 messages
      
      const result = manager.compress(agentId, "Summary of previous conversation", 10);
      
      expect(result.ok).toBe(true);
      expect(result.compressed).toBe(true);
      expect(result.originalCount).toBe(originalCount);
      expect(result.newCount).toBe(12); // 1 system + 1 summary + 10 recent
      
      const compressedConv = manager.getConversation(agentId);
      expect(compressedConv[0].role).toBe("system");
      expect(compressedConv[1].role).toBe("system");
      expect(compressedConv[1].content).toContain("Summary of previous conversation");
      expect(compressedConv.length).toBe(12);
    });

    test("compress 不压缩消息数量不足的会话", () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "You are a helpful assistant");
      
      // 添加少量消息
      conv.push({ role: "user", content: "Hello" });
      conv.push({ role: "assistant", content: "Hi" });
      
      const result = manager.compress(agentId, "Summary", 10);
      
      expect(result.ok).toBe(true);
      expect(result.compressed).toBe(false);
      expect(result.originalCount).toBe(3);
      expect(result.newCount).toBe(3);
    });

    test("compress 返回错误对于不存在的会话", () => {
      const result = manager.compress("nonexistent", "Summary", 10);
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe("conversation_not_found");
    });

    test("compress 返回错误对于无效的摘�?, () => {
      const agentId = "agent-1";
      manager.ensureConversation(agentId, "system prompt");
      
      const result1 = manager.compress(agentId, "", 10);
      expect(result1.ok).toBe(false);
      expect(result1.error).toBe("invalid_summary");
      
      const result2 = manager.compress(agentId, null, 10);
      expect(result2.ok).toBe(false);
      expect(result2.error).toBe("invalid_summary");
    });
  });

  describe("Token 使用统计", () => {
    test("updateTokenUsage 更新 token 使用统计", () => {
      const agentId = "agent-1";
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      });
      
      const usage = manager.getTokenUsage(agentId);
      expect(usage).toBeDefined();
      expect(usage.promptTokens).toBe(100);
      expect(usage.completionTokens).toBe(50);
      expect(usage.totalTokens).toBe(150);
      expect(usage.updatedAt).toBeDefined();
    });

    test("getTokenUsage 返回 null 对于不存在的统计", () => {
      const usage = manager.getTokenUsage("nonexistent");
      expect(usage).toBeNull();
    });

    test("getContextUsagePercent 计算上下文使用百分比", () => {
      const agentId = "agent-1";
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 64000,
        completionTokens: 1000,
        totalTokens: 65000
      });
      
      const percent = manager.getContextUsagePercent(agentId);
      expect(percent).toBeCloseTo(0.5, 2);
    });

    test("getContextUsagePercent 返回 0 对于没有数据的智能体", () => {
      const percent = manager.getContextUsagePercent("nonexistent");
      expect(percent).toBe(0);
    });

    test("clearTokenUsage 清除 token 使用统计", () => {
      const agentId = "agent-1";
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150
      });
      
      expect(manager.getTokenUsage(agentId)).toBeDefined();
      
      manager.clearTokenUsage(agentId);
      
      expect(manager.getTokenUsage(agentId)).toBeNull();
    });
  });

  describe("Prompt token 估算与滑动窗�?, () => {
    test("updatePromptTokenEstimator 可基�?usage 校准 tokensPerChar", () => {
      const agentId = "agent-1";
      const sampleMessages = [{ role: "system", content: "a".repeat(100) }];

      const result = manager.updatePromptTokenEstimator(agentId, sampleMessages, 200);
      expect(result.ok).toBe(true);
      expect(result.tokensPerChar).toBeCloseTo(2, 3);

      const estimated = manager.estimateMessageTokens(agentId, { role: "user", content: "a".repeat(10) });
      expect(estimated).toBe(20);
    });

    test("slideWindowByEstimatedTokens 按估�?token 保留最�?70%", () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");

      manager.updatePromptTokenEstimator(agentId, [{ role: "system", content: "a".repeat(100) }], 100);

      for (let i = 0; i < 10; i++) {
        conv.push({ role: "user", content: "x".repeat(10) });
      }

      const result = manager.slideWindowByEstimatedTokens(agentId, 0.7);
      expect(result.ok).toBe(true);
      expect(result.slid).toBe(true);

      const updated = manager.getConversation(agentId);
      expect(updated[0].role).toBe("system");
      expect(updated.length).toBe(8); // 1 system + last 7 user
      for (let i = 1; i < updated.length; i++) {
        expect(updated[i].role).toBe("user");
        expect(updated[i].content.length).toBe(10);
      }
    });

    test("slideWindowByEstimatedTokens 不截�?tool_call 链路", () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");

      manager.updatePromptTokenEstimator(agentId, [{ role: "system", content: "a".repeat(100) }], 100);

      conv.push({ role: "user", content: "u".repeat(10) });
      conv.push({
        role: "assistant",
        content: "call".repeat(2),
        tool_calls: [{ id: "call_1", function: { name: "tool_x", arguments: "{}" } }]
      });
      conv.push({ role: "tool", tool_call_id: "call_1", content: "t".repeat(1000) });
      conv.push({ role: "assistant", content: "a".repeat(1000) });

      const result = manager.slideWindowByEstimatedTokens(agentId, 0.7);
      expect(result.ok).toBe(true);

      const verify = manager.verifyHistoryConsistency(agentId);
      expect(verify.consistent).toBe(true);

      const updated = manager.getConversation(agentId);
      const hasCall = updated.some(m => m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.some(c => c.id === "call_1"));
      const hasTool = updated.some(m => m.role === "tool" && m.tool_call_id === "call_1");
      expect(hasCall).toBe(true);
      expect(hasTool).toBe(true);
    });

    test("slideWindowIfNeededByEstimate 在超过硬性阈值时触发滑动", () => {
      const agentId = "agent-1";
      manager = new ConversationManager({
        maxContextMessages: 50,
        conversationsDir: tempDir,
        contextLimit: {
          maxTokens: 100,
          warningThreshold: 0.7,
          criticalThreshold: 0.9,
          hardLimitThreshold: 0.95
        }
      });

      const conv = manager.ensureConversation(agentId, "system prompt");
      manager.updatePromptTokenEstimator(agentId, [{ role: "system", content: "a".repeat(100) }], 100);

      conv.push({ role: "user", content: "x".repeat(200) }); // 估算�?200 tokens，超过阈�?
      const result = manager.slideWindowIfNeededByEstimate(agentId, { keepRatio: 0.7, maxLoops: 3 });
      expect(result.ok).toBe(true);
      expect(result.before.status).toBe("exceeded");
      expect(result.slid).toBe(true);
      expect(result.after.estimatedPromptTokens).toBeLessThan(result.before.estimatedPromptTokens);
    });
  });

  describe("上下文状态检�?, () => {
    test("getContextStatus 返回 normal 状�?, () => {
      const agentId = "agent-1";
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 10000,
        completionTokens: 1000,
        totalTokens: 11000
      });
      
      const status = manager.getContextStatus(agentId);
      
      expect(status.usedTokens).toBe(10000);
      expect(status.maxTokens).toBe(128000);
      expect(status.usagePercent).toBeCloseTo(0.078, 3);
      expect(status.status).toBe("normal");
    });

    test("getContextStatus 返回 warning 状�?, () => {
      const agentId = "agent-1";
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 90000, // 70% of 128000
        completionTokens: 1000,
        totalTokens: 91000
      });
      
      const status = manager.getContextStatus(agentId);
      
      expect(status.status).toBe("warning");
    });

    test("getContextStatus 返回 critical 状�?, () => {
      const agentId = "agent-1";
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 116000, // 90.6% of 128000
        completionTokens: 1000,
        totalTokens: 117000
      });
      
      const status = manager.getContextStatus(agentId);
      
      expect(status.status).toBe("critical");
    });

    test("getContextStatus 返回 exceeded 状�?, () => {
      const agentId = "agent-1";
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 122000, // 95.3% of 128000
        completionTokens: 1000,
        totalTokens: 123000
      });
      
      const status = manager.getContextStatus(agentId);
      
      expect(status.status).toBe("exceeded");
    });

    test("isContextExceeded 检查是否超过硬性限�?, () => {
      const agentId = "agent-1";
      
      expect(manager.isContextExceeded(agentId)).toBe(false);
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 122000,
        completionTokens: 1000,
        totalTokens: 123000
      });
      
      expect(manager.isContextExceeded(agentId)).toBe(true);
    });

    test("buildContextStatusPrompt 生成状态提�?, () => {
      const agentId = "agent-1";
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 10000,
        completionTokens: 1000,
        totalTokens: 11000
      });
      
      const prompt = manager.buildContextStatusPrompt(agentId);
      
      expect(prompt).toContain("10000");
      expect(prompt).toContain("128000");
      expect(prompt).toContain("7.8");
    });

    test("buildContextStatusPrompt 包含警告信息", () => {
      const agentId = "agent-1";
      
      manager.updateTokenUsage(agentId, {
        promptTokens: 122000,
        completionTokens: 1000,
        totalTokens: 123000
      });
      
      const prompt = manager.buildContextStatusPrompt(agentId);
      
      expect(prompt).toContain("严重警告");
      expect(prompt).toContain("compress_context");
    });
  });

  describe("工具调用历史", () => {
    test("getLastToolCall 返回最后一个工具调�?, () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");
      
      conv.push({ role: "user", content: "Hello" });
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            function: { name: "get_weather", arguments: '{"city":"Beijing"}' }
          }
        ]
      });
      conv.push({ role: "tool", tool_call_id: "call_1", content: "Sunny" });
      
      const lastCall = manager.getLastToolCall(agentId);
      
      expect(lastCall).toBeDefined();
      expect(lastCall.id).toBe("call_1");
      expect(lastCall.function.name).toBe("get_weather");
    });

    test("getLastToolCall 返回 null 对于没有工具调用的会�?, () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");
      
      conv.push({ role: "user", content: "Hello" });
      conv.push({ role: "assistant", content: "Hi" });
      
      const lastCall = manager.getLastToolCall(agentId);
      
      expect(lastCall).toBeNull();
    });

    test("getLastToolCall 返回 null 对于不存在的会话", () => {
      const lastCall = manager.getLastToolCall("nonexistent");
      expect(lastCall).toBeNull();
    });

    test("verifyHistoryConsistency 验证对话历史一致�?, () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");
      
      conv.push({ role: "user", content: "Hello" });
      conv.push({
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            function: { name: "get_weather", arguments: '{"city":"Beijing"}' }
          }
        ]
      });
      conv.push({ role: "tool", tool_call_id: "call_1", content: "Sunny" });
      
      const result = manager.verifyHistoryConsistency(agentId);
      
      expect(result.consistent).toBe(true);
      expect(result.orphanedResponses).toEqual([]);
    });

    test("verifyHistoryConsistency 检测孤立的工具响应", () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");
      
      conv.push({ role: "user", content: "Hello" });
      conv.push({ role: "tool", tool_call_id: "call_orphan", content: "Result" });
      
      const result = manager.verifyHistoryConsistency(agentId);
      
      expect(result.consistent).toBe(false);
      expect(result.orphanedResponses).toContain("call_orphan");
    });

    test("verifyHistoryConsistency 返回错误对于不存在的会话", () => {
      const result = manager.verifyHistoryConsistency("nonexistent");
      
      expect(result.consistent).toBe(false);
      expect(result.error).toBe("conversation_not_found");
    });
  });

  describe("持久�?, () => {
    test("persistConversationNow 保存会话到磁�?, async () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");
      conv.push({ role: "user", content: "Hello" });
      
      const result = await manager.persistConversationNow(agentId);
      
      expect(result.ok).toBe(true);
    });

    test("loadAllConversations 加载所有会�?, async () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");
      conv.push({ role: "user", content: "Hello" });
      
      await manager.persistConversationNow(agentId);
      
      // 创建新的管理器并加载
      const newManager = new ConversationManager({
        conversationsDir: tempDir
      });
      
      const loadResult = await newManager.loadAllConversations();
      
      expect(loadResult.loaded).toBe(1);
      expect(loadResult.errors.length).toBe(0);
      
      const loadedConv = newManager.getConversation(agentId);
      expect(loadedConv).toBeDefined();
      expect(loadedConv.length).toBe(2);
    });

    test("deletePersistedConversation 删除持久化的会话", async () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");
      conv.push({ role: "user", content: "Hello" });
      
      await manager.persistConversationNow(agentId);
      
      const deleteResult = await manager.deletePersistedConversation(agentId);
      
      expect(deleteResult.ok).toBe(true);
    });

    test("flushAll 等待所有待保存的对话完�?, async () => {
      const agentId1 = "agent-1";
      const agentId2 = "agent-2";
      
      manager.ensureConversation(agentId1, "system prompt 1");
      manager.ensureConversation(agentId2, "system prompt 2");
      
      // 触发防抖保存
      manager.persistConversation(agentId1);
      manager.persistConversation(agentId2);
      
      await manager.flushAll();
      
      // 验证文件已保�?
      const newManager = new ConversationManager({
        conversationsDir: tempDir
      });
      
      const loadResult = await newManager.loadAllConversations();
      expect(loadResult.loaded).toBe(2);
    });
  });

  describe("配置", () => {
    test("setConversationsDir 设置持久化目�?, () => {
      const newDir = "/new/path";
      manager.setConversationsDir(newDir);
      expect(manager._conversationsDir).toBe(newDir);
    });

    test("setPromptTemplates 设置提示词模�?, () => {
      const templates = {
        contextStatus: "Custom status: {{USED_TOKENS}}/{{MAX_TOKENS}}"
      };
      
      manager.setPromptTemplates(templates);
      
      expect(manager.promptTemplates.contextStatus).toBe(templates.contextStatus);
    });
  });

  describe("上下文检�?, () => {
    test("checkAndWarn 检查上下文是否超过限制", () => {
      const agentId = "agent-1";
      const conv = manager.ensureConversation(agentId, "system prompt");
      
      // 添加超过限制的消�?
      for (let i = 0; i < 60; i++) {
        conv.push({ role: "user", content: `Message ${i}` });
      }
      
      const result = manager.checkAndWarn(agentId);
      
      expect(result.warning).toBe(true);
      expect(result.currentCount).toBe(61);
      expect(result.maxCount).toBe(50);
    });

    test("checkAndWarn 返回 false 对于未超过限制的会话", () => {
      const agentId = "agent-1";
      manager.ensureConversation(agentId, "system prompt");
      
      const result = manager.checkAndWarn(agentId);
      
      expect(result.warning).toBe(false);
    });

    test("checkAndWarn 返回 false 对于不存在的会话", () => {
      const result = manager.checkAndWarn("nonexistent");
      expect(result.warning).toBe(false);
    });
  });
});
