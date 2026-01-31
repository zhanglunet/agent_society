import { describe, test, expect } from "bun:test";
import { ComputeScheduler } from "../../src/platform/runtime/compute_scheduler.js";
import { TurnEngine } from "../../src/platform/runtime/turn_engine.js";
import { AgentCancelManager } from "../../src/platform/runtime/agent_cancel_manager.js";

describe("ComputeScheduler - computeStatus convergence", () => {
  test("should return to idle after finishing a simple turn", async () => {
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

    const convByAgent = new Map();
    const cancelManager = new AgentCancelManager();

    const runtime = {
      log: null,
      bus,
      _state: state,
      _agents: new Map([["a1", { id: "a1", roleId: "r1", roleName: "role" }]]),
      _cancelManager: cancelManager,
      _conversationManager: { buildContextStatusPrompt: () => "" },
      _buildAgentContext: (agent) => ({ agent }),
      _buildSystemPromptForAgent: () => "sys",
      _ensureConversation: (agentId) => {
        if (!convByAgent.has(agentId)) convByAgent.set(agentId, []);
        return convByAgent.get(agentId);
      },
      _formatMessageForLlm: (_ctx, m) => (m?.payload?.text ? String(m.payload.text) : "msg"),
      _checkContextAndWarn: () => {},
      getToolDefinitions: () => [],
      getLlmClientForAgent: () => ({
        chat: async () =>
          await new Promise((resolve) => {
            setImmediate(() => resolve({ role: "assistant", content: "ok" }));
          })
      }),
      executeToolCall: async () => ({ ok: true }),
      _emitToolCall: () => {}
    };

    bus._push("a1", { id: "m1", from: "user", to: "a1", payload: { text: "hi" } });
    const turnEngine = new TurnEngine(runtime);
    const scheduler = new ComputeScheduler(runtime, turnEngine);

    scheduler._ingestMessagesToTurns();
    scheduler._runOneStep();
    expect(statusByAgent.get("a1")).toBe("waiting_llm");

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

