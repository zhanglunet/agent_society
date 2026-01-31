import { describe, test, expect } from "bun:test";
import { ComputeScheduler } from "../../src/platform/runtime/compute_scheduler.js";
import { TurnEngine } from "../../src/platform/runtime/turn_engine.js";
import { AgentCancelManager } from "../../src/platform/runtime/agent_cancel_manager.js";

describe("ComputeScheduler - user endpoint should not run LLM", () => {
  test("should dispatch to user agent behavior and keep status idle", async () => {
    const bus = (() => {
      const queues = new Map();
      return {
        deliverDueMessages: () => {},
        waitForMessage: async () => {},
        hasPending: () => {
          for (const q of queues.values()) if (q.length > 0) return true;
          return false;
        },
        receiveNext: (agentId) => {
          const q = queues.get(agentId) ?? [];
          const msg = q.shift() ?? null;
          queues.set(agentId, q);
          return msg;
        },
        send: () => ({ messageId: "x" }),
        _push: (agentId, msg) => {
          const q = queues.get(agentId) ?? [];
          q.push(msg);
          queues.set(agentId, q);
        }
      };
    })();

    const statusByAgent = new Map();
    const state = {
      getAgentComputeStatus: (agentId) => statusByAgent.get(agentId) ?? "idle",
      setAgentComputeStatus: (agentId, s) => void statusByAgent.set(agentId, s),
      markAgentAsActivelyProcessing: () => {},
      unmarkAgentAsActivelyProcessing: () => {}
    };

    const inbox = [];
    const userAgent = {
      id: "user",
      roleId: "user",
      roleName: "user",
      onMessage: async (_ctx, m) => void inbox.push(m)
    };

    const a1 = { id: "a1", roleId: "r1", roleName: "role" };
    const chatCalls = [];

    const runtime = {
      log: null,
      bus,
      _state: state,
      _agents: new Map([
        ["user", userAgent],
        ["a1", a1]
      ]),
      _cancelManager: new AgentCancelManager(),
      _conversationManager: { buildContextStatusPrompt: () => "" },
      _buildAgentContext: (agent) => ({ agent }),
      _buildSystemPromptForAgent: () => "sys",
      _ensureConversation: () => [],
      _formatMessageForLlm: () => "hello",
      _checkContextAndWarn: () => {},
      getToolDefinitions: () => [],
      getLlmClientForAgent: (agentId) => ({
        chat: async () => {
          chatCalls.push(agentId);
          return { role: "assistant", content: "ok" };
        }
      }),
      executeToolCall: async () => ({ ok: true }),
      _emitToolCall: () => {}
    };

    bus._push("user", { id: "mu1", from: "a1", to: "user", payload: { text: "hi" } });

    const turnEngine = new TurnEngine(runtime);
    const scheduler = new ComputeScheduler(runtime, turnEngine);

    scheduler._ingestMessagesToTurns();
    await new Promise((r) => setImmediate(r));

    expect(inbox.length).toBe(1);
    expect(statusByAgent.get("user") ?? "idle").toBe("idle");
    expect(chatCalls).toEqual([]);
  });
});

