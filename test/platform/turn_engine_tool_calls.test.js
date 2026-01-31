import { describe, test, expect } from "bun:test";
import { TurnEngine } from "../../src/platform/runtime/turn_engine.js";

describe("TurnEngine - tool_calls step progression", () => {
  test("should turn tool_calls into need_tool and then request next LLM round", () => {
    const convByAgent = new Map();

    const runtime = {
      _conversationManager: {
        buildContextStatusPrompt: () => ""
      },
      _buildSystemPromptForAgent: () => "sys",
      _ensureConversation: (agentId) => {
        if (!convByAgent.has(agentId)) convByAgent.set(agentId, []);
        return convByAgent.get(agentId);
      },
      _formatMessageForLlm: () => "hello",
      _checkContextAndWarn: () => {},
      getToolDefinitions: () => [{ type: "function", function: { name: "noop_tool" } }],
      _emitToolCall: () => {}
    };

    const engine = new TurnEngine(runtime);
    const agentId = "a1";
    const ctx = { agent: { id: agentId, roleId: "r1", roleName: "role" } };
    const message = { id: "m1", from: "user", to: agentId, taskId: "t1", payload: { text: "hi" } };

    engine.enqueueMessageTurn(agentId, ctx, message);

    const first = engine.step(agentId, { epoch: 0, signal: new AbortController().signal, assertActive: () => {} });
    expect(first.kind).toBe("need_llm");
    expect(first.request.meta.round).toBe(1);

    engine.onLlmResult(agentId, {
      turnId: first.turnId,
      stepId: first.stepId,
      msg: {
        role: "assistant",
        content: "",
        tool_calls: [
          {
            id: "c1",
            function: { name: "noop_tool", arguments: "{\"x\":1}" }
          }
        ]
      }
    });

    const toolStep = engine.step(agentId, { epoch: 0, signal: new AbortController().signal, assertActive: () => {} });
    expect(toolStep.kind).toBe("need_tool");
    expect(toolStep.call.toolName).toBe("noop_tool");
    expect(toolStep.call.callId).toBe("c1");
    expect(toolStep.call.args).toEqual({ x: 1 });

    engine.onToolResult(agentId, {
      turnId: toolStep.turnId,
      stepId: toolStep.stepId,
      callId: "c1",
      result: { ok: true }
    });

    const afterTool = engine.step(agentId, { epoch: 0, signal: new AbortController().signal, assertActive: () => {} });
    expect(afterTool.kind).toBe("done");

    const nextLlm = engine.step(agentId, { epoch: 0, signal: new AbortController().signal, assertActive: () => {} });
    expect(nextLlm.kind).toBe("need_llm");
    expect(nextLlm.request.meta.round).toBe(2);
  });
});

