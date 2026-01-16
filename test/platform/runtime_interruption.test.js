import { describe, expect, test } from "bun:test";
import { Runtime } from "../../src/platform/runtime.js";

describe("Runtime - Message Interruption Integration", () => {
  
  // Integration test: Runtime provides isAgentActivelyProcessing callback to MessageBus
  test("Runtime initializes MessageBus with active processing callback", async () => {
    const runtime = new Runtime({
      config: {
        runtimeDir: "./test/.tmp/runtime-interruption-test",
        artifactsDir: "./test/.tmp/artifacts",
        promptsDir: "./config/prompts",
        loggingConfig: { level: "error" }
      }
    });
    
    await runtime.init();
    
    // Verify MessageBus has the callback
    expect(runtime.bus._isAgentActivelyProcessing).toBeDefined();
    expect(typeof runtime.bus._isAgentActivelyProcessing).toBe("function");
    expect(runtime.bus._onInterruptionNeeded).toBeDefined();
    expect(typeof runtime.bus._onInterruptionNeeded).toBe("function");
    
    await runtime.shutdown();
  });

  // Integration test: isAgentActivelyProcessing returns correct status
  test("isAgentActivelyProcessing reflects _activeProcessingAgents state", async () => {
    const runtime = new Runtime({
      config: {
        runtimeDir: "./test/.tmp/runtime-interruption-test",
        artifactsDir: "./test/.tmp/artifacts",
        promptsDir: "./config/prompts",
        loggingConfig: { level: "error" }
      }
    });
    
    await runtime.init();
    
    const agentId = "test-agent";
    
    // Initially not active
    expect(runtime.isAgentActivelyProcessing(agentId)).toBe(false);
    
    // Simulate adding to active processing set
    runtime._activeProcessingAgents.add(agentId);
    expect(runtime.isAgentActivelyProcessing(agentId)).toBe(true);
    
    // Remove from active processing set
    runtime._activeProcessingAgents.delete(agentId);
    expect(runtime.isAgentActivelyProcessing(agentId)).toBe(false);
    
    await runtime.shutdown();
  });

  // Integration test: handleMessageInterruption is called when message arrives for active agent
  test("MessageBus triggers handleMessageInterruption for active agent", async () => {
    const runtime = new Runtime({
      config: {
        runtimeDir: "./test/.tmp/runtime-interruption-test",
        artifactsDir: "./test/.tmp/artifacts",
        promptsDir: "./config/prompts",
        loggingConfig: { level: "error" }
      }
    });
    
    await runtime.init();
    
    const agentId = "test-agent";
    
    // Track if interruption handler was called
    let interruptionHandled = false;
    const originalHandler = runtime.handleMessageInterruption.bind(runtime);
    runtime.handleMessageInterruption = (id, msg) => {
      interruptionHandled = true;
      originalHandler(id, msg);
    };
    
    // Mark agent as actively processing
    runtime._activeProcessingAgents.add(agentId);
    
    // Send message to active agent
    runtime.bus.send({ to: agentId, from: "user", payload: "test" });
    
    // Verify interruption handler was called
    expect(interruptionHandled).toBe(true);
    
    // Clean up
    runtime._activeProcessingAgents.delete(agentId);
    await runtime.shutdown();
  });

  // Integration test: handleMessageInterruption is NOT called for inactive agent
  test("MessageBus does not trigger handleMessageInterruption for inactive agent", async () => {
    const runtime = new Runtime({
      config: {
        runtimeDir: "./test/.tmp/runtime-interruption-test",
        artifactsDir: "./test/.tmp/artifacts",
        promptsDir: "./config/prompts",
        loggingConfig: { level: "error" }
      }
    });
    
    await runtime.init();
    
    const agentId = "test-agent";
    
    // Track if interruption handler was called
    let interruptionHandled = false;
    const originalHandler = runtime.handleMessageInterruption.bind(runtime);
    runtime.handleMessageInterruption = (id, msg) => {
      interruptionHandled = true;
      originalHandler(id, msg);
    };
    
    // Agent is NOT in active processing set
    expect(runtime.isAgentActivelyProcessing(agentId)).toBe(false);
    
    // Send message to inactive agent
    runtime.bus.send({ to: agentId, from: "user", payload: "test" });
    
    // Verify interruption handler was NOT called
    expect(interruptionHandled).toBe(false);
    
    await runtime.shutdown();
  });

  // Integration test: Backward compatibility - existing message flow still works
  test("Existing message flow works without interruption", async () => {
    const runtime = new Runtime({
      config: {
        runtimeDir: "./test/.tmp/runtime-interruption-test",
        artifactsDir: "./test/.tmp/artifacts",
        promptsDir: "./config/prompts",
        loggingConfig: { level: "error" }
      }
    });
    
    await runtime.init();
    
    const agentId = "test-agent";
    
    // Send message to inactive agent (normal flow)
    const result = runtime.bus.send({ to: agentId, from: "user", payload: "test" });
    
    expect(result.messageId).toBeDefined();
    expect(result.rejected).toBeUndefined();
    expect(runtime.bus.getQueueDepth(agentId)).toBe(1);
    
    // Receive message
    const msg = runtime.bus.receiveNext(agentId);
    expect(msg.payload).toBe("test");
    
    await runtime.shutdown();
  });
});
