import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { LlmHandler } from "../../src/platform/runtime/llm_handler.js";

describe("LlmHandler - Property-Based Tests for Tool Call Cancellation", () => {
  
  /**
   * Property 2: Message Interruption Cancels Tool Calls
   * 
   * For any agent with a pending tool call and a new incoming message, when the
   * interruption handler processes the new message, the pending tool call should
   * be canceled and no longer in the pending state.
   * 
   * **Validates: Requirements 2.1, 2.2, 6.1, 6.2**
   * **Feature: agent-concurrent-request-management, Property 2: Message Interruption Cancels Tool Calls**
   */
  test("Property 2: Message Interruption Cancels Tool Calls", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        fc.constantFrom("waiting_llm", "processing"), // compute status
        fc.string({ minLength: 1, maxLength: 100 }), // new message payload
        (agentId, computeStatus, messagePayload) => {
          // Track state changes
          let currentStatus = computeStatus;
          let abortCalled = false;
          let hasActiveRequest = true;
          
          // Mock LLM client with active request
          const mockLlmClient = {
            hasActiveRequest: (id) => {
              return id === agentId && hasActiveRequest;
            },
            abort: (id) => {
              if (id === agentId && hasActiveRequest) {
                abortCalled = true;
                hasActiveRequest = false;
                return true;
              }
              return false;
            }
          };
          
          // Mock runtime
          const mockRuntime = {
            getAgentComputeStatus: (id) => {
              return id === agentId ? currentStatus : "idle";
            },
            setAgentComputeStatus: (id, status) => {
              if (id === agentId) {
                currentStatus = status;
              }
            },
            getLlmClientForAgent: () => mockLlmClient,
            log: {
              debug: () => {},
              info: () => {},
              warn: () => {},
              error: () => {}
            }
          };
          
          const handler = new LlmHandler(mockRuntime);
          
          // Verify agent has pending tool call
          const hasPending = handler.detectPendingToolCall(agentId);
          expect(hasPending).toBe(true);
          
          // Cancel the pending tool call (simulating interruption)
          const cancelled = handler.cancelPendingToolCall(agentId);
          
          // Verify cancellation succeeded
          expect(cancelled).toBe(true);
          expect(abortCalled).toBe(true);
          
          // Verify agent is no longer in pending state
          expect(currentStatus).toBe("idle");
          expect(hasActiveRequest).toBe(false);
          
          // Verify no pending tool call after cancellation
          const hasPendingAfter = handler.detectPendingToolCall(agentId);
          expect(hasPendingAfter).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property 2.1: Cancellation is Idempotent
   * 
   * For any agent, calling cancelPendingToolCall multiple times should be safe
   * and idempotent. The first call should cancel the request, and subsequent
   * calls should return false without causing errors.
   * 
   * **Validates: Requirements 6.2, 6.3**
   */
  test("Property 2.1: Cancellation is Idempotent", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        fc.integer({ min: 2, max: 5 }), // number of cancellation attempts
        (agentId, attempts) => {
          let hasActiveRequest = true;
          let abortCallCount = 0;
          
          const mockLlmClient = {
            hasActiveRequest: (id) => {
              return id === agentId && hasActiveRequest;
            },
            abort: (id) => {
              if (id === agentId && hasActiveRequest) {
                abortCallCount++;
                hasActiveRequest = false;
                return true;
              }
              return false;
            }
          };
          
          const mockRuntime = {
            getAgentComputeStatus: () => "waiting_llm",
            setAgentComputeStatus: () => {},
            getLlmClientForAgent: () => mockLlmClient,
            log: {
              debug: () => {},
              info: () => {},
              warn: () => {}
            }
          };
          
          const handler = new LlmHandler(mockRuntime);
          
          const results = [];
          for (let i = 0; i < attempts; i++) {
            results.push(handler.cancelPendingToolCall(agentId));
          }
          
          // First call should succeed
          expect(results[0]).toBe(true);
          
          // Subsequent calls should return false (no active request)
          for (let i = 1; i < attempts; i++) {
            expect(results[i]).toBe(false);
          }
          
          // Abort should only be called once
          expect(abortCallCount).toBe(1);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property 2.2: Cancellation Handles Multiple Agents Independently
   * 
   * For any set of agents with pending tool calls, canceling one agent's
   * tool call should not affect other agents' tool calls.
   * 
   * **Validates: Requirements 2.1, 6.1**
   */
  test("Property 2.2: Cancellation Handles Multiple Agents Independently", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 5 }), // agentIds
        fc.integer({ min: 0, max: 4 }), // index of agent to cancel
        (agentIds, cancelIndex) => {
          // Make agentIds unique
          const uniqueAgents = [...new Set(agentIds)];
          if (uniqueAgents.length < 2) return; // Skip if not enough unique agents
          
          const targetAgent = uniqueAgents[cancelIndex % uniqueAgents.length];
          const activeRequests = new Set(uniqueAgents);
          const abortedAgents = new Set();
          
          const mockLlmClient = {
            hasActiveRequest: (id) => activeRequests.has(id),
            abort: (id) => {
              if (activeRequests.has(id)) {
                activeRequests.delete(id);
                abortedAgents.add(id);
                return true;
              }
              return false;
            }
          };
          
          const mockRuntime = {
            getAgentComputeStatus: (id) => {
              return activeRequests.has(id) ? "processing" : "idle";
            },
            setAgentComputeStatus: () => {},
            getLlmClientForAgent: () => mockLlmClient,
            log: {
              debug: () => {},
              info: () => {}
            }
          };
          
          const handler = new LlmHandler(mockRuntime);
          
          // Verify all agents have pending calls
          for (const agentId of uniqueAgents) {
            expect(handler.detectPendingToolCall(agentId)).toBe(true);
          }
          
          // Cancel only the target agent
          const cancelled = handler.cancelPendingToolCall(targetAgent);
          expect(cancelled).toBe(true);
          expect(abortedAgents.has(targetAgent)).toBe(true);
          
          // Verify target agent no longer has pending call
          expect(handler.detectPendingToolCall(targetAgent)).toBe(false);
          
          // Verify other agents still have pending calls
          for (const agentId of uniqueAgents) {
            if (agentId !== targetAgent) {
              expect(handler.detectPendingToolCall(agentId)).toBe(true);
              expect(abortedAgents.has(agentId)).toBe(false);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property 2.3: Cancellation Gracefully Handles Errors
   * 
   * For any agent, if the abort operation throws an error, the cancellation
   * should handle it gracefully, set the agent status to idle, and return false.
   * 
   * **Validates: Requirements 6.3**
   */
  test("Property 2.3: Cancellation Gracefully Handles Errors", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        fc.string({ minLength: 1, maxLength: 50 }), // error message
        (agentId, errorMessage) => {
          let statusSet = null;
          
          const mockLlmClient = {
            hasActiveRequest: (id) => id === agentId,
            abort: (id) => {
              throw new Error(errorMessage);
            }
          };
          
          const mockRuntime = {
            getAgentComputeStatus: () => "waiting_llm",
            setAgentComputeStatus: (id, status) => {
              statusSet = { id, status };
            },
            getLlmClientForAgent: () => mockLlmClient,
            log: {
              error: () => {}
            }
          };
          
          const handler = new LlmHandler(mockRuntime);
          
          // Attempt to cancel (should handle error gracefully)
          const cancelled = handler.cancelPendingToolCall(agentId);
          
          // Should return false due to error
          expect(cancelled).toBe(false);
          
          // Should still set status to idle to prevent agent from being stuck
          expect(statusSet).not.toBeNull();
          expect(statusSet.id).toBe(agentId);
          expect(statusSet.status).toBe("idle");
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property 2.4: Detection Accurately Reflects Agent State
   * 
   * For any agent and any compute status, detectPendingToolCall should
   * accurately reflect whether the agent has a pending tool call based
   * on its compute status.
   * 
   * **Validates: Requirements 2.1, 6.1**
   */
  test("Property 2.4: Detection Accurately Reflects Agent State", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        fc.constantFrom("idle", "waiting_llm", "processing", "unknown"), // compute status
        (agentId, computeStatus) => {
          const mockRuntime = {
            getAgentComputeStatus: (id) => {
              return id === agentId ? computeStatus : "idle";
            },
            log: {
              debug: () => {}
            }
          };
          
          const handler = new LlmHandler(mockRuntime);
          const hasPending = handler.detectPendingToolCall(agentId);
          
          // Should return true only for waiting_llm or processing states
          const expectedResult = computeStatus === "waiting_llm" || computeStatus === "processing";
          expect(hasPending).toBe(expectedResult);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property 2.5: Cancellation Without Active Request Returns False
   * 
   * For any agent without an active LLM request, attempting to cancel
   * should return false without causing errors or side effects.
   * 
   * **Validates: Requirements 6.2**
   */
  test("Property 2.5: Cancellation Without Active Request Returns False", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        (agentId) => {
          let abortCalled = false;
          let statusChanged = false;
          
          const mockLlmClient = {
            hasActiveRequest: (id) => false, // No active request
            abort: (id) => {
              abortCalled = true;
              return false;
            }
          };
          
          const mockRuntime = {
            getAgentComputeStatus: () => "idle",
            setAgentComputeStatus: () => {
              statusChanged = true;
            },
            getLlmClientForAgent: () => mockLlmClient,
            log: {
              debug: () => {}
            }
          };
          
          const handler = new LlmHandler(mockRuntime);
          const cancelled = handler.cancelPendingToolCall(agentId);
          
          // Should return false
          expect(cancelled).toBe(false);
          
          // Should not call abort or change status
          expect(abortCalled).toBe(false);
          expect(statusChanged).toBe(false);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  /**
   * Property 2.6: Cancellation Sets Agent Status to Idle
   * 
   * For any agent with a pending tool call, successful cancellation should
   * always set the agent's compute status to idle.
   * 
   * **Validates: Requirements 6.2, 6.4**
   */
  test("Property 2.6: Cancellation Sets Agent Status to Idle", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        fc.constantFrom("waiting_llm", "processing"), // initial status
        (agentId, initialStatus) => {
          let currentStatus = initialStatus;
          
          const mockLlmClient = {
            hasActiveRequest: (id) => id === agentId,
            abort: (id) => id === agentId
          };
          
          const mockRuntime = {
            getAgentComputeStatus: () => currentStatus,
            setAgentComputeStatus: (id, status) => {
              if (id === agentId) {
                currentStatus = status;
              }
            },
            getLlmClientForAgent: () => mockLlmClient,
            log: {
              info: () => {}
            }
          };
          
          const handler = new LlmHandler(mockRuntime);
          
          // Verify initial status is not idle
          expect(currentStatus).not.toBe("idle");
          
          // Cancel the tool call
          const cancelled = handler.cancelPendingToolCall(agentId);
          
          // Verify cancellation succeeded and status is now idle
          expect(cancelled).toBe(true);
          expect(currentStatus).toBe("idle");
        }
      ),
      { numRuns: 100 }
    );
  });
});
