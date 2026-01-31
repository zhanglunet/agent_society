import { describe, test, expect } from "bun:test";
import { RuntimeLifecycle } from "../../src/platform/runtime/runtime_lifecycle.js";

describe("RuntimeLifecycle - abortAgentLlmCall", () => {
  test("should return agent_not_found when agent does not exist", () => {
    const runtime = {
      log: { warn: async () => {}, info: async () => {} },
      _agents: new Map(),
      _cancelManager: { abort: () => {} },
      llm: { abort: () => false },
      _state: { setAgentComputeStatus: () => {} }
    };

    const lifecycle = new RuntimeLifecycle(runtime);
    const result = lifecycle.abortAgentLlmCall("missing");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("agent_not_found");
  });

  test("should not allow stopping user endpoint", () => {
    const runtime = {
      log: { warn: async () => {}, info: async () => {} },
      _agents: new Map([["user", { id: "user" }]]),
      _cancelManager: { abort: () => {} },
      llm: { abort: () => false },
      _state: { setAgentComputeStatus: () => {}, getAndClearInterruptions: () => {}, unmarkAgentAsActivelyProcessing: () => {} },
      bus: { clearQueue: () => [] },
      _turnEngine: { clearAgent: () => {} }
    };

    const lifecycle = new RuntimeLifecycle(runtime);
    const result = lifecycle.abortAgentLlmCall("user");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("cannot_stop_user");
  });
});
