import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdir, readFile, rm } from "node:fs/promises";
import { ConversationManager } from "../../src/platform/services/conversation/conversation_manager.js";
import { RuntimeLlm } from "../../src/platform/runtime/runtime_llm.js";

describe("RuntimeLlm 对话历史持久�?, () => {
  test("新链路写盘后重启可恢复历�?, async () => {
    const tmpDir = path.resolve(
      process.cwd(),
      "test/.tmp/runtime_llm_persistence_" + Date.now() + "_" + Math.random().toString(16).slice(2)
    );
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const conversationsDir = path.join(tmpDir, "conversations");
    await mkdir(conversationsDir, { recursive: true });

    const agentId = "root";
    const conversations = new Map();
    const conversationManager = new ConversationManager({ conversations });
    conversationManager.setConversationsDir(conversationsDir);

    const runtime = {
      maxToolRounds: 3,
      _conversations: conversations,
      _conversationManager: conversationManager,
      _cancelManager: { newScope: () => null, getEpoch: () => 0 },
      _state: {
        setAgentComputeStatus: () => {},
        getAgentComputeStatus: () => "processing"
      },
      _agentMetaById: new Map([[agentId, { parentAgentId: null }]]),
      _agents: new Map([[agentId, { id: agentId, roleName: "root" }]]),
      toolGroupManager: { listGroups: () => [] },
      getLlmClientForAgent: () => ({
        chat: async () => ({
          role: "assistant",
          content: "ok",
          tool_calls: [],
          _usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
        })
      }),
      getToolDefinitions: () => [],
      executeToolCall: async () => ({}),
      _emitToolCall: () => {},
      loggerRoot: { logAgentLifecycleEvent: () => {} },
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      org: { getRole: () => null, findRoleByName: () => null, createRole: () => {} },
      _agentTaskBriefs: new Map(),
      contactManager: { listContacts: () => [] }
    };

    const llm = new RuntimeLlm(runtime);

    const message = {
      id: "m1",
      from: "user",
      to: agentId,
      taskId: null,
      payload: { text: "hi" }
    };

    const ctx = {
      agent: { id: agentId, rolePrompt: "root prompt", roleName: "root", roleId: null },
      currentMessage: message,
      systemToolRules: "",
      systemBasePrompt: "",
      systemComposeTemplate: "",
      systemWorkspacePrompt: "",
      tools: {
        composePrompt: () => "",
        sendMessage: () => ({ messageId: "auto-send-1" })
      }
    };

    await llm.handleWithLlm(ctx, message);
    await conversationManager.flushAll();

    const filePath = path.join(conversationsDir, `${agentId}.json`);
    const raw = await readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    expect(data.agentId).toBe(agentId);
    expect(Array.isArray(data.messages)).toBe(true);
    expect(data.messages.length).toBeGreaterThanOrEqual(3);

    const conversations2 = new Map();
    const cm2 = new ConversationManager({ conversations: conversations2 });
    cm2.setConversationsDir(conversationsDir);
    const loaded = await cm2.loadAllConversations();
    expect(loaded.loaded).toBe(1);
    expect(conversations2.has(agentId)).toBe(true);
    expect(conversations2.get(agentId).length).toBe(data.messages.length);
  });
});

