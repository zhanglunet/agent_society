import { describe, expect, test } from "bun:test";
import path from "node:path";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { MessageBus } from "../../src/platform/core/message_bus.js";
import { ConversationManager } from "../../src/platform/services/conversation/conversation_manager.js";
import { RuntimeLlm } from "../../src/platform/runtime/runtime_llm.js";
import { TurnEngine } from "../../src/platform/runtime/turn_engine.js";
import { ComputeScheduler } from "../../src/platform/runtime/compute_scheduler.js";

describe("重启后旧历史注入 LLM messages", () => {
  test("TurnEngine 首次 ensureConversation 会从磁盘恢复历史", async () => {
    const tmpDir = path.resolve(
      process.cwd(),
      "test/.tmp/conversation_reload_" + Date.now() + "_" + Math.random().toString(16).slice(2)
    );
    await rm(tmpDir, { recursive: true, force: true });
    await mkdir(tmpDir, { recursive: true });

    const conversationsDir = path.join(tmpDir, "conversations");
    await mkdir(conversationsDir, { recursive: true });

    const agentId = "a1";
    const filePath = path.join(conversationsDir, `${agentId}.json`);
    const persisted = {
      agentId,
      messages: [
        { role: "system", content: "system-old" },
        { role: "user", content: "u-old" },
        { role: "assistant", content: "a-old" }
      ],
      tokenUsage: null,
      updatedAt: new Date().toISOString()
    };
    await writeFile(filePath, JSON.stringify(persisted, null, 2), "utf8");

    const conversations = new Map();
    const conversationManager = new ConversationManager({ conversations });
    conversationManager.setConversationsDir(conversationsDir);

    const runtime = {
      bus: new MessageBus(),
      log: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
      _conversations: conversations,
      _conversationManager: conversationManager,
      _agentMetaById: new Map([[agentId, { parentAgentId: "root", roleId: "r1" }]]),
      _agents: new Map([[agentId, { id: agentId, roleId: "r1", roleName: "role1", rolePrompt: "rp" }]]),
      toolGroupManager: { listGroups: () => [] },
      org: { getRole: () => null },
      _agentTaskBriefs: new Map(),
      contactManager: { listContacts: () => [] },
      _cancelManager: {
        newScope: () => ({ epoch: 0, signal: new AbortController().signal, assertActive: () => {} }),
        getEpoch: () => 0,
        getLastAbortInfo: () => null
      },
      _state: {
        getAgentComputeStatus: () => "idle",
        setAgentComputeStatus: () => {},
        markAgentAsActivelyProcessing: () => {},
        unmarkAgentAsActivelyProcessing: () => {},
        getAndClearInterruptions: () => []
      },
      getToolDefinitions: () => [],
      executeToolCall: async () => ({}),
      _emitToolCall: () => {},
      _checkContextAndWarn: () => {},
      getLlmClientForAgent: () => ({
        chat: async (req) => {
          expect(req.messages.length).toBeGreaterThanOrEqual(4);
          expect(req.messages[1].content).toBe("u-old");
          expect(req.messages[2].content).toBe("a-old");
          return { role: "assistant", content: "ok", tool_calls: [] };
        }
      })
    };

    const llm = new RuntimeLlm(runtime);
    runtime._llm = llm;
    runtime._ensureConversation = (id, systemPrompt) => llm.ensureConversation(id, systemPrompt);
    runtime._buildSystemPromptForAgent = () => "system-new";
    runtime._formatMessageForLlm = (_ctx, msg) => String(msg?.payload?.text ?? "");
    runtime._buildAgentContext = () => ({
      agent: { id: agentId, roleId: "r1", roleName: "role1", rolePrompt: "rp" },
      currentMessage: null,
      systemBasePrompt: "",
      systemComposeTemplate: "",
      systemToolRules: "",
      systemWorkspacePrompt: "",
      tools: { composePrompt: () => "" }
    });

    const turnEngine = new TurnEngine(runtime);
    const scheduler = new ComputeScheduler(runtime, turnEngine);

    runtime.bus.send({
      to: agentId,
      from: "user",
      taskId: null,
      payload: { text: "hi" }
    });

    scheduler._ingestMessagesToTurns();
    scheduler._runOneStep();

    await new Promise((r) => setTimeout(r, 0));

    await conversationManager.flushAll();
    const savedRaw = await readFile(filePath, "utf8");
    const saved = JSON.parse(savedRaw);
    expect(Array.isArray(saved.messages)).toBe(true);
    expect(saved.messages.length).toBeGreaterThanOrEqual(4);
  });
});

