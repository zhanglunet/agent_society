import { describe, test, expect } from "bun:test";
import { MessageBus } from "../../src/platform/core/message_bus.js";

describe("MessageBus - stopped agent messaging", () => {
  test("should allow sending to stopped/stopping agent (pause semantics)", () => {
    const bus = new MessageBus({
      logger: { debug: async () => {}, info: async () => {}, warn: async () => {}, error: async () => {} },
      getAgentStatus: () => "stopped"
    });

    const r = bus.send({ to: "root", from: "user", payload: { text: "hi" } });
    expect(r.rejected).toBeUndefined();
    expect(r.messageId).toBeTruthy();
  });

  test("should reject sending to terminating agent", () => {
    const bus = new MessageBus({
      logger: { debug: async () => {}, info: async () => {}, warn: async () => {}, error: async () => {}, },
      getAgentStatus: () => "terminating"
    });

    const r = bus.send({ to: "a1", from: "user", payload: { text: "hi" } });
    expect(r.rejected).toBe(true);
    expect(r.reason).toBe("agent_terminating");
  });
});

