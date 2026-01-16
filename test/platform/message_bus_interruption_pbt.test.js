import { describe, expect, test } from "bun:test";
import * as fc from "fast-check";
import { MessageBus } from "../../src/platform/message_bus.js";

describe("MessageBus - Property-Based Tests for Active Agent Detection", () => {
  
  /**
   * Property 1: Single Active Processing Per Agent
   * 
   * For any agent, at most one message processing sequence should be active at any given time.
   * If an agent is marked as active, no other processing sequence should be initiated for that
   * agent until it is marked inactive.
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3, 1.5**
   * **Feature: agent-concurrent-request-management, Property 1: Single Active Processing Per Agent**
   */
  test("Property 1: Single Active Processing Per Agent", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        fc.array(fc.string({ minLength: 1, maxLength: 50 }), { minLength: 1, maxLength: 10 }), // message payloads
        (agentId, payloads) => {
          // Track active processing state
          let isActive = false;
          let interruptionCount = 0;
          
          const bus = new MessageBus({
            isAgentActivelyProcessing: (id) => {
              return id === agentId && isActive;
            },
            onInterruptionNeeded: (id, message) => {
              if (id === agentId && isActive) {
                interruptionCount++;
              }
            }
          });
          
          // Send first message when agent is inactive
          const result1 = bus.send({ to: agentId, from: "user", payload: payloads[0] });
          expect(result1.interruptionTriggered).toBeUndefined();
          expect(interruptionCount).toBe(0);
          
          // Mark agent as active (simulating processing)
          isActive = true;
          
          // Send remaining messages while agent is active
          for (let i = 1; i < payloads.length; i++) {
            const result = bus.send({ to: agentId, from: "user", payload: payloads[i] });
            
            // Each message to active agent should trigger interruption
            expect(result.interruptionTriggered).toBe(true);
          }
          
          // Verify interruption was triggered for each message sent while active
          expect(interruptionCount).toBe(payloads.length - 1);
          
          // All messages should still be queued (FIFO)
          expect(bus.getQueueDepth(agentId)).toBe(payloads.length);
          
          // Mark agent as inactive
          isActive = false;
          
          // Send another message when inactive
          const resultInactive = bus.send({ to: agentId, from: "user", payload: "after-inactive" });
          expect(resultInactive.interruptionTriggered).toBeUndefined();
          
          // Total messages in queue
          expect(bus.getQueueDepth(agentId)).toBe(payloads.length + 1);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.1: Active Agent Detection is Consistent
   * 
   * For any sequence of agent state changes and message sends, the interruption
   * detection should be consistent with the active processing state at the time
   * of message send.
   * 
   * **Validates: Requirements 1.1, 1.2, 1.3**
   */
  test("Property 1.1: Active Agent Detection is Consistent", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        fc.array(
          fc.record({
            action: fc.constantFrom("send", "activate", "deactivate"),
            payload: fc.string({ minLength: 1, maxLength: 50 })
          }),
          { minLength: 5, maxLength: 20 }
        ),
        (agentId, actions) => {
          let isActive = false;
          const interruptionLog = [];
          
          const bus = new MessageBus({
            isAgentActivelyProcessing: (id) => id === agentId && isActive,
            onInterruptionNeeded: (id, message) => {
              interruptionLog.push({ 
                agentId: id, 
                wasActive: isActive, 
                payload: message.payload 
              });
            }
          });
          
          let messageCount = 0;
          
          for (const action of actions) {
            if (action.action === "activate") {
              isActive = true;
            } else if (action.action === "deactivate") {
              isActive = false;
            } else if (action.action === "send") {
              const result = bus.send({ 
                to: agentId, 
                from: "user", 
                payload: action.payload 
              });
              
              messageCount++;
              
              // Verify interruption detection matches active state
              if (isActive) {
                expect(result.interruptionTriggered).toBe(true);
              } else {
                expect(result.interruptionTriggered).toBeUndefined();
              }
            }
          }
          
          // Verify all interruptions were logged when agent was active
          for (const log of interruptionLog) {
            expect(log.wasActive).toBe(true);
          }
          
          // Verify message queue contains all sent messages
          expect(bus.getQueueDepth(agentId)).toBe(messageCount);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.2: Multiple Agents Independent Processing
   * 
   * For any set of agents, each agent's active processing state should be
   * independent. Messages to one active agent should not affect messages
   * to other agents.
   * 
   * **Validates: Requirements 1.1, 1.5**
   */
  test("Property 1.2: Multiple Agents Independent Processing", () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 2, maxLength: 5 }), // agentIds
        fc.array(fc.integer({ min: 0, max: 4 }), { minLength: 5, maxLength: 15 }), // agent indices for messages
        (agentIds, messageIndices) => {
          // Make agentIds unique
          const uniqueAgents = [...new Set(agentIds)];
          if (uniqueAgents.length < 2) return; // Skip if not enough unique agents
          
          const activeAgents = new Set();
          const interruptionCounts = new Map();
          const messageCounts = new Map();
          
          uniqueAgents.forEach(id => {
            interruptionCounts.set(id, 0);
            messageCounts.set(id, 0);
          });
          
          const bus = new MessageBus({
            isAgentActivelyProcessing: (id) => activeAgents.has(id),
            onInterruptionNeeded: (id, message) => {
              interruptionCounts.set(id, (interruptionCounts.get(id) || 0) + 1);
            }
          });
          
          // Mark first agent as active
          activeAgents.add(uniqueAgents[0]);
          
          // Send messages to various agents
          for (const index of messageIndices) {
            const agentId = uniqueAgents[index % uniqueAgents.length];
            messageCounts.set(agentId, (messageCounts.get(agentId) || 0) + 1);
            
            const result = bus.send({ 
              to: agentId, 
              from: "user", 
              payload: `msg-${index}` 
            });
            
            // Only active agents should trigger interruption
            if (activeAgents.has(agentId)) {
              expect(result.interruptionTriggered).toBe(true);
            } else {
              expect(result.interruptionTriggered).toBeUndefined();
            }
          }
          
          // Verify interruption counts match message counts for active agents
          for (const agentId of uniqueAgents) {
            if (activeAgents.has(agentId)) {
              // Active agent should have interruptions equal to message count
              expect(interruptionCounts.get(agentId)).toBe(messageCounts.get(agentId));
            } else {
              // Inactive agents should have no interruptions
              expect(interruptionCounts.get(agentId)).toBe(0);
            }
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.3: Backward Compatibility with Existing Queuing
   * 
   * For any agent (active or inactive), messages should always be queued
   * in FIFO order, regardless of whether interruption is triggered.
   * 
   * **Validates: Requirements 1.4, 5.1**
   */
  test("Property 1.3: Backward Compatibility with Existing Queuing", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        fc.boolean(), // isActive
        fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 3, maxLength: 10 }), // payloads
        (agentId, isActive, payloads) => {
          const bus = new MessageBus({
            isAgentActivelyProcessing: (id) => id === agentId && isActive,
            onInterruptionNeeded: (id, message) => {
              // Interruption callback
            }
          });
          
          // Send all messages
          for (const payload of payloads) {
            bus.send({ to: agentId, from: "user", payload });
          }
          
          // Verify all messages are queued
          expect(bus.getQueueDepth(agentId)).toBe(payloads.length);
          
          // Verify FIFO order
          for (const expectedPayload of payloads) {
            const msg = bus.receiveNext(agentId);
            expect(msg).not.toBeNull();
            expect(msg.payload).toBe(expectedPayload);
          }
          
          // Queue should be empty
          expect(bus.getQueueDepth(agentId)).toBe(0);
          expect(bus.receiveNext(agentId)).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 1.4: Delayed Messages Never Trigger Interruption
   * 
   * For any agent (active or inactive), delayed messages should never
   * trigger interruption, regardless of the agent's active state.
   * 
   * **Validates: Requirements 1.4, 5.1**
   */
  test("Property 1.4: Delayed Messages Never Trigger Interruption", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }), // agentId
        fc.boolean(), // isActive
        fc.array(
          fc.record({
            payload: fc.string({ minLength: 1, maxLength: 50 }),
            delayMs: fc.integer({ min: 1, max: 10000 })
          }),
          { minLength: 1, maxLength: 5 }
        ),
        (agentId, isActive, messages) => {
          let interruptionCount = 0;
          
          const bus = new MessageBus({
            isAgentActivelyProcessing: (id) => id === agentId && isActive,
            onInterruptionNeeded: (id, message) => {
              interruptionCount++;
            }
          });
          
          // Send all delayed messages
          for (const msg of messages) {
            const result = bus.send({ 
              to: agentId, 
              from: "user", 
              payload: msg.payload,
              delayMs: msg.delayMs
            });
            
            // Delayed messages should never trigger interruption
            expect(result.interruptionTriggered).toBeUndefined();
            expect(result.scheduledDeliveryTime).toBeDefined();
          }
          
          // No interruptions should have been triggered
          expect(interruptionCount).toBe(0);
          
          // Messages should be in delayed queue, not immediate queue
          expect(bus.getQueueDepth(agentId)).toBe(0);
          expect(bus.getDelayedCount(agentId)).toBe(messages.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});
