import { describe, expect, test, beforeEach } from "bun:test";
import { LlmHandler } from "../../src/platform/runtime/llm_handler.js";

describe("LlmHandler - Tool Call Detection and Cancellation", () => {
  
  /**
   * Test suite for detectPendingToolCall method
   */
  describe("detectPendingToolCall()", () => {
    
    test("should return false when agentId is null", () => {
      const mockRuntime = {
        log: { debug: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.detectPendingToolCall(null);
      expect(result).toBe(false);
    });
    
    test("should return false when agentId is undefined", () => {
      const mockRuntime = {
        log: { debug: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.detectPendingToolCall(undefined);
      expect(result).toBe(false);
    });
    
    test("should return true when agent is in waiting_llm status", () => {
      const mockRuntime = {
        getAgentComputeStatus: (agentId) => {
          return agentId === "test-agent" ? "waiting_llm" : "idle";
        },
        log: { debug: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.detectPendingToolCall("test-agent");
      expect(result).toBe(true);
    });
    
    test("should return true when agent is in processing status", () => {
      const mockRuntime = {
        getAgentComputeStatus: (agentId) => {
          return agentId === "test-agent" ? "processing" : "idle";
        },
        log: { debug: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.detectPendingToolCall("test-agent");
      expect(result).toBe(true);
    });
    
    test("should return false when agent is in idle status", () => {
      const mockRuntime = {
        getAgentComputeStatus: (agentId) => "idle",
        log: { debug: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.detectPendingToolCall("test-agent");
      expect(result).toBe(false);
    });
    
    test("should return false when getAgentComputeStatus is not available", () => {
      const mockRuntime = {
        log: { debug: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.detectPendingToolCall("test-agent");
      expect(result).toBe(false);
    });
  });
  
  /**
   * Test suite for cancelPendingToolCall method
   */
  describe("cancelPendingToolCall()", () => {
    
    test("should return false when agentId is null", () => {
      const mockRuntime = {
        log: { warn: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall(null);
      expect(result).toBe(false);
    });
    
    test("should return false when agentId is undefined", () => {
      const mockRuntime = {
        log: { warn: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall(undefined);
      expect(result).toBe(false);
    });
    
    test("should return false when LLM client is not found", () => {
      const mockRuntime = {
        getLlmClientForAgent: () => null,
        llm: null,
        log: { warn: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall("test-agent");
      expect(result).toBe(false);
    });
    
    test("should return false when there is no active request", () => {
      const mockLlmClient = {
        hasActiveRequest: (agentId) => false
      };
      const mockRuntime = {
        getLlmClientForAgent: () => mockLlmClient,
        log: { debug: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall("test-agent");
      expect(result).toBe(false);
    });
    
    test("should successfully cancel active request and set status to idle", () => {
      let statusSet = null;
      const mockLlmClient = {
        hasActiveRequest: (agentId) => agentId === "test-agent",
        abort: (agentId) => {
          return agentId === "test-agent";
        }
      };
      const mockRuntime = {
        getLlmClientForAgent: () => mockLlmClient,
        setAgentComputeStatus: (agentId, status) => {
          statusSet = { agentId, status };
        },
        getAgentComputeStatus: () => "waiting_llm",
        log: { info: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall("test-agent");
      
      expect(result).toBe(true);
      expect(statusSet).not.toBeNull();
      expect(statusSet.agentId).toBe("test-agent");
      expect(statusSet.status).toBe("idle");
    });
    
    test("should return false when abort returns false", () => {
      const mockLlmClient = {
        hasActiveRequest: (agentId) => true,
        abort: (agentId) => false
      };
      const mockRuntime = {
        getLlmClientForAgent: () => mockLlmClient,
        log: { warn: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall("test-agent");
      expect(result).toBe(false);
    });
    
    test("should handle abort exception gracefully and set status to idle", () => {
      let statusSet = null;
      const mockLlmClient = {
        hasActiveRequest: (agentId) => true,
        abort: (agentId) => {
          throw new Error("Abort failed");
        }
      };
      const mockRuntime = {
        getLlmClientForAgent: () => mockLlmClient,
        setAgentComputeStatus: (agentId, status) => {
          statusSet = { agentId, status };
        },
        log: { error: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall("test-agent");
      
      expect(result).toBe(false);
      expect(statusSet).not.toBeNull();
      expect(statusSet.agentId).toBe("test-agent");
      expect(statusSet.status).toBe("idle");
    });
    
    test("should use default llm client when getLlmClientForAgent returns null", () => {
      let abortCalled = false;
      const mockLlmClient = {
        hasActiveRequest: (agentId) => true,
        abort: (agentId) => {
          abortCalled = true;
          return true;
        }
      };
      const mockRuntime = {
        getLlmClientForAgent: () => null,
        llm: mockLlmClient,
        setAgentComputeStatus: () => {},
        getAgentComputeStatus: () => "waiting_llm",
        log: { info: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall("test-agent");
      
      expect(result).toBe(true);
      expect(abortCalled).toBe(true);
    });
    
    test("should handle missing hasActiveRequest method gracefully", () => {
      const mockLlmClient = {
        abort: (agentId) => true
      };
      const mockRuntime = {
        getLlmClientForAgent: () => mockLlmClient,
        log: { debug: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall("test-agent");
      expect(result).toBe(false);
    });
    
    test("should handle missing abort method gracefully", () => {
      const mockLlmClient = {
        hasActiveRequest: (agentId) => true
      };
      const mockRuntime = {
        getLlmClientForAgent: () => mockLlmClient,
        setAgentComputeStatus: () => {},
        log: { warn: () => {} }
      };
      const handler = new LlmHandler(mockRuntime);
      
      const result = handler.cancelPendingToolCall("test-agent");
      expect(result).toBe(false);
    });
  });
  
  /**
   * Integration tests for detection and cancellation workflow
   */
  describe("Integration: Detection and Cancellation Workflow", () => {
    
    test("should detect pending call and successfully cancel it", () => {
      let statusSet = null;
      const mockLlmClient = {
        hasActiveRequest: (agentId) => agentId === "test-agent",
        abort: (agentId) => agentId === "test-agent"
      };
      const mockRuntime = {
        getAgentComputeStatus: (agentId) => {
          return agentId === "test-agent" ? "waiting_llm" : "idle";
        },
        getLlmClientForAgent: () => mockLlmClient,
        setAgentComputeStatus: (agentId, status) => {
          statusSet = { agentId, status };
        },
        log: { 
          debug: () => {},
          info: () => {}
        }
      };
      const handler = new LlmHandler(mockRuntime);
      
      // First detect
      const hasPending = handler.detectPendingToolCall("test-agent");
      expect(hasPending).toBe(true);
      
      // Then cancel
      const cancelled = handler.cancelPendingToolCall("test-agent");
      expect(cancelled).toBe(true);
      expect(statusSet.status).toBe("idle");
    });
    
    test("should not cancel when no pending call is detected", () => {
      const mockLlmClient = {
        hasActiveRequest: (agentId) => false
      };
      const mockRuntime = {
        getAgentComputeStatus: (agentId) => "idle",
        getLlmClientForAgent: () => mockLlmClient,
        log: { 
          debug: () => {}
        }
      };
      const handler = new LlmHandler(mockRuntime);
      
      // First detect
      const hasPending = handler.detectPendingToolCall("test-agent");
      expect(hasPending).toBe(false);
      
      // Then try to cancel
      const cancelled = handler.cancelPendingToolCall("test-agent");
      expect(cancelled).toBe(false);
    });
    
    test("should handle multiple agents independently", () => {
      const activeAgents = new Set(["agent-1", "agent-2"]);
      const cancelledAgents = new Set();
      
      const mockLlmClient = {
        hasActiveRequest: (agentId) => activeAgents.has(agentId),
        abort: (agentId) => {
          if (activeAgents.has(agentId)) {
            cancelledAgents.add(agentId);
            return true;
          }
          return false;
        }
      };
      
      const mockRuntime = {
        getAgentComputeStatus: (agentId) => {
          return activeAgents.has(agentId) ? "processing" : "idle";
        },
        getLlmClientForAgent: () => mockLlmClient,
        setAgentComputeStatus: () => {},
        log: { 
          debug: () => {},
          info: () => {}
        }
      };
      const handler = new LlmHandler(mockRuntime);
      
      // Detect and cancel agent-1
      expect(handler.detectPendingToolCall("agent-1")).toBe(true);
      expect(handler.cancelPendingToolCall("agent-1")).toBe(true);
      expect(cancelledAgents.has("agent-1")).toBe(true);
      
      // Detect and cancel agent-2
      expect(handler.detectPendingToolCall("agent-2")).toBe(true);
      expect(handler.cancelPendingToolCall("agent-2")).toBe(true);
      expect(cancelledAgents.has("agent-2")).toBe(true);
      
      // Agent-3 should not be detected or cancelled
      expect(handler.detectPendingToolCall("agent-3")).toBe(false);
      expect(handler.cancelPendingToolCall("agent-3")).toBe(false);
      expect(cancelledAgents.has("agent-3")).toBe(false);
    });
  });
});
