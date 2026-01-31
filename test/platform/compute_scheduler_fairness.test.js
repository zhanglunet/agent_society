import { describe, test, expect } from "bun:test";
import { ComputeScheduler } from "../../src/platform/runtime/compute_scheduler.js";
import { TurnEngine } from "../../src/platform/runtime/turn_engine.js";
import { AgentCancelManager } from "../../src/platform/runtime/agent_cancel_manager.js";

describe("ComputeScheduler - fairness (basic)", () => {
  test("should let multiple agents start LLM without being blocked by tool loop", async () => {
    const sent = [];

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
        send: (m) => {
          sent.push(m);
          return { messageId: "x" };
        },
        _push: (agentId, msg) => {
          const q = queues.get(agentId) ?? [];
          q.push(msg);
          queues.set(agentId, q);
        }
      };
    })();

    const state = (() => {
      const statusByAgent = new Map();
      const active = new Set();
      return {
        getAgentComputeStatus: (agentId) => statusByAgent.get(agentId) ?? "idle",
        setAgentComputeStatus: (agentId, s) => void statusByAgent.set(agentId, s),
        markAgentAsActivelyProcessing: (agentId) => void active.add(agentId),
        unmarkAgentAsActivelyProcessing: (agentId) => void active.delete(agentId)
      };
    })();

    const convByAgent = new Map();
    const chatCalls = [];

    const runtime = {
      log: null,
      bus,
      _state: state,
      _agents: new Map([
        ["a1", { id: "a1" }],
        ["a2", { id: "a2" }]
      ]),
      _cancelManager: new AgentCancelManager(),
      _conversationManager: {
        buildContextStatusPrompt: () => ""
      },
      _buildAgentContext: (agent) => ({ agent }),
      _buildSystemPromptForAgent: () => "sys",
      _ensureConversation: (agentId) => {
        if (!convByAgent.has(agentId)) convByAgent.set(agentId, []);
        return convByAgent.get(agentId);
      },
      _formatMessageForLlm: () => "hello",
      _checkContextAndWarn: () => {},
      getToolDefinitions: () => [{ type: "function", function: { name: "noop_tool" } }],
      getLlmClientForAgent: (agentId) => ({
        chat: async (input) => {
          chatCalls.push({ agentId, meta: input.meta });
          if (agentId === "a1" && input.meta.round <= 2) {
            return {
              role: "assistant",
              content: "",
              tool_calls: [
                { id: `${agentId}-c${input.meta.round}`, function: { name: "noop_tool", arguments: "{}" } }
              ]
            };
          }
          return { role: "assistant", content: `ok-${agentId}-r${input.meta.round}` };
        }
      }),
      executeToolCall: async () => ({ ok: true }),
      _emitToolCall: () => {}
    };

    bus._push("a1", { id: "m1", from: "user", to: "a1", payload: { text: "x" } });
    bus._push("a2", { id: "m2", from: "user", to: "a2", payload: { text: "y" } });

    const turnEngine = new TurnEngine(runtime);
    const scheduler = new ComputeScheduler(runtime, turnEngine);

    scheduler._ingestMessagesToTurns();
    scheduler._runOneStep();
    scheduler._runOneStep();
    await Promise.resolve();
    await Promise.resolve();

    expect(chatCalls.length).toBeGreaterThanOrEqual(2);
    expect(new Set(chatCalls.slice(0, 2).map((c) => c.agentId)).size).toBe(2);
  });
});

