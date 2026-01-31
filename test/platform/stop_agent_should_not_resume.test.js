import { describe, test, expect } from "bun:test";
import { ComputeScheduler } from "../../src/platform/runtime/compute_scheduler.js";
import { TurnEngine } from "../../src/platform/runtime/turn_engine.js";
import { RuntimeLifecycle } from "../../src/platform/runtime/runtime_lifecycle.js";
import { AgentCancelManager } from "../../src/platform/runtime/agent_cancel_manager.js";

describe("Stop button semantics", () => {
  test("stopped agent should ignore late llm result and not continue processing", async () => {
    const queues = new Map();
    const sent = [];
    const bus = {
      deliverDueMessages: () => {},
      waitForMessage: async () => {},
      hasPending: () => true,
      receiveNext: (agentId) => {
        const q = queues.get(agentId) ?? [];
        const msg = q.shift() ?? null;
        queues.set(agentId, q);
        return msg;
      },
      send: (m) => {
        sent.push(m);
        return { messageId: "x" };
      },
      getQueueDepth: (agentId) => (queues.get(agentId) ?? []).length,
      clearQueue: (agentId) => {
        const q = queues.get(agentId) ?? [];
        queues.set(agentId, []);
        return q;
      },
      _push: (agentId, msg) => {
        const q = queues.get(agentId) ?? [];
        q.push(msg);
        queues.set(agentId, q);
      }
    };

    const statusByAgent = new Map();
    const state = {
      getAgentComputeStatus: (agentId) => statusByAgent.get(agentId) ?? "idle",
      setAgentComputeStatus: (agentId, s) => void statusByAgent.set(agentId, s),
      markAgentAsActivelyProcessing: () => {},
      unmarkAgentAsActivelyProcessing: () => {},
      getAndClearInterruptions: () => []
    };

    let firstResolve;
    const llmClient = {
      chat: async () =>
        await new Promise((resolve) => {
          firstResolve = resolve;
        })
    };

    const cancelManager = new AgentCancelManager();
    const runtime = {
      log: null,
      bus,
      _state: state,
      _cancelManager: cancelManager,
      llm: { abort: () => true },
      _turnEngine: null,
      _agents: new Map([["a1", { id: "a1", roleId: "r1", roleName: "role" }]]),
      _conversationManager: { buildContextStatusPrompt: () => "", deletePersistedConversation: () => {} },
      _buildAgentContext: (agent) => ({ agent }),
      _buildSystemPromptForAgent: () => "sys",
      _ensureConversation: () => [],
      _formatMessageForLlm: (_ctx, m) => (m?.payload?.text ? String(m.payload.text) : "msg"),
      _checkContextAndWarn: () => {},
      getToolDefinitions: () => [],
      getLlmClientForAgent: () => llmClient,
      executeToolCall: async () => ({ ok: true }),
      _emitToolCall: () => {},
      _agentManager: { collectDescendantAgents: () => [] },
      org: { getAgent: () => ({ status: "active" }), recordTermination: async () => ({}) },
      _conversations: new Map(),
      _agentMetaById: new Map(),
      _agentLastActivityTime: new Map(),
      _idleWarningEmitted: new Set()
    };

    const turnEngine = new TurnEngine(runtime);
    runtime._turnEngine = turnEngine;
    const scheduler = new ComputeScheduler(runtime, turnEngine);
    const lifecycle = new RuntimeLifecycle(runtime);

    bus._push("a1", { id: "m1", from: "user", to: "a1", payload: { text: "hi" } });
    scheduler._ingestMessagesToTurns();
    scheduler._runOneStep();
    expect(statusByAgent.get("a1")).toBe("waiting_llm");

    const stopResult = lifecycle.abortAgentLlmCall("a1");
    expect(stopResult.ok).toBe(true);
    expect(statusByAgent.get("a1")).toBe("stopped");

    firstResolve({ role: "assistant", content: "late" });
    await new Promise((r) => setImmediate(r));
    scheduler._runOneStep();
    await new Promise((r) => setImmediate(r));

    expect(statusByAgent.get("a1")).toBe("stopped");
    expect(sent.length).toBe(0);
  });

  test("stopped agent should resume processing on new message", async () => {
    const queues = new Map();
    const sent = [];
    const bus = {
      deliverDueMessages: () => {},
      waitForMessage: async () => {},
      hasPending: () => true,
      receiveNext: (agentId) => {
        const q = queues.get(agentId) ?? [];
        const msg = q.shift() ?? null;
        queues.set(agentId, q);
        return msg;
      },
      send: (m) => {
        sent.push(m);
        return { messageId: "x" };
      },
      getQueueDepth: (agentId) => (queues.get(agentId) ?? []).length,
      clearQueue: (agentId) => {
        const q = queues.get(agentId) ?? [];
        queues.set(agentId, []);
        return q;
      },
      _push: (agentId, msg) => {
        const q = queues.get(agentId) ?? [];
        q.push(msg);
        queues.set(agentId, q);
      }
    };

    const statusByAgent = new Map();
    const state = {
      getAgentComputeStatus: (agentId) => statusByAgent.get(agentId) ?? "idle",
      setAgentComputeStatus: (agentId, s) => void statusByAgent.set(agentId, s),
      markAgentAsActivelyProcessing: () => {},
      unmarkAgentAsActivelyProcessing: () => {},
      getAndClearInterruptions: () => []
    };

    const llmClient = { chat: async () => ({ role: "assistant", content: "ok" }) };

    const cancelManager = new AgentCancelManager();
    const runtime = {
      log: null,
      bus,
      _state: state,
      _cancelManager: cancelManager,
      llm: { abort: () => true },
      _turnEngine: null,
      _computeScheduler: null,
      _agents: new Map([["a1", { id: "a1", roleId: "r1", roleName: "role" }]]),
      _conversationManager: { buildContextStatusPrompt: () => "", deletePersistedConversation: () => {} },
      _buildAgentContext: (agent) => ({ agent }),
      _buildSystemPromptForAgent: () => "sys",
      _ensureConversation: () => [],
      _formatMessageForLlm: (_ctx, m) => (m?.payload?.text ? String(m.payload.text) : "msg"),
      _checkContextAndWarn: () => {},
      getToolDefinitions: () => [],
      getLlmClientForAgent: () => llmClient,
      executeToolCall: async () => ({ ok: true }),
      _emitToolCall: () => {},
      _agentManager: { collectDescendantAgents: () => [] },
      org: { getAgent: () => ({ status: "active" }), recordTermination: async () => ({}) },
      _conversations: new Map(),
      _agentMetaById: new Map(),
      _agentLastActivityTime: new Map(),
      _idleWarningEmitted: new Set()
    };

    const turnEngine = new TurnEngine(runtime);
    runtime._turnEngine = turnEngine;
    const scheduler = new ComputeScheduler(runtime, turnEngine);
    runtime._computeScheduler = scheduler;
    const lifecycle = new RuntimeLifecycle(runtime);

    const stopResult = lifecycle.abortAgentLlmCall("a1");
    expect(stopResult.ok).toBe(true);
    expect(statusByAgent.get("a1")).toBe("stopped");

    bus._push("a1", { id: "m2", from: "user", to: "a1", payload: { text: "resume" } });
    scheduler._ingestMessagesToTurns();
    scheduler._runOneStep();
    await new Promise((r) => setImmediate(r));
    for (let i = 0; i < 5; i += 1) {
      scheduler._runOneStep();
      await new Promise((r) => setImmediate(r));
    }

    expect(statusByAgent.get("a1") ?? "idle").toBe("idle");
    expect(sent.length).toBe(1);
    expect(sent[0]?.to).toBe("user");
   });
});
