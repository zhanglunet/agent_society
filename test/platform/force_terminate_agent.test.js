import { describe, test, expect } from "bun:test";
import { RuntimeLifecycle } from "../../src/platform/runtime/runtime_lifecycle.js";
import { AgentCancelManager } from "../../src/platform/runtime/agent_cancel_manager.js";

describe("RuntimeLifecycle - forceTerminateAgent", () => {
  test("should cancel, clear, and remove agent and descendants", async () => {
    const cleared = [];
    const queues = new Map([
      ["a1", [{ id: "q1" }]],
      ["a2", [{ id: "q2" }]]
    ]);

    const runtime = {
      log: { warn: async () => {}, info: async () => {}, debug: async () => {} },
      org: {
        getAgent: (id) => (id === "a1" ? { id: "a1", status: "active" } : id === "a2" ? { id: "a2", status: "active" } : null),
        recordTermination: async (id, deletedBy, reason) => ({ id, deletedBy, reason })
      },
      bus: {
        clearQueue: (agentId) => {
          const q = queues.get(agentId) ?? [];
          queues.set(agentId, []);
          cleared.push(agentId);
          return q;
        }
      },
      llm: { abort: () => true },
      _turnEngine: { clearAgent: () => {} },
      _agentManager: {
        collectDescendantAgents: (parentId) => (parentId === "a1" ? ["a2"] : [])
      },
      _agents: new Map([
        ["a1", { id: "a1" }],
        ["a2", { id: "a2" }]
      ]),
      _conversations: new Map([
        ["a1", []],
        ["a2", []]
      ]),
      _conversationManager: { deletePersistedConversation: () => {} },
      _agentMetaById: new Map([
        ["a1", { parentAgentId: "root" }],
        ["a2", { parentAgentId: "a1" }]
      ]),
      _agentLastActivityTime: new Map([
        ["a1", Date.now()],
        ["a2", Date.now()]
      ]),
      _idleWarningEmitted: new Set(["a1", "a2"]),
      _cancelManager: new AgentCancelManager(),
      _state: {
        setAgentComputeStatus: () => {},
        unmarkAgentAsActivelyProcessing: () => {}
      }
    };

    const lifecycle = new RuntimeLifecycle(runtime);
    const result = await lifecycle.forceTerminateAgent("a1", { deletedBy: "user", reason: "test" });
    expect(result.ok).toBe(true);
    expect(result.agentId).toBe("a1");
    expect(cleared.sort()).toEqual(["a1", "a2"]);
    expect(runtime._agents.has("a1")).toBe(false);
    expect(runtime._agents.has("a2")).toBe(false);
  });
});

