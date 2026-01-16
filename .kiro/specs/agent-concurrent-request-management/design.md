# Design Document: Agent Concurrent Request Management

## Overview

This design implements a concurrent request management system that ensures each agent maintains only one active communication sequence. When a new message arrives for an agent currently in a tool-calling loop, the system cancels the pending tool call, removes it from chat history, and processes the new message as the latest content.

The implementation integrates with existing components (MessageBus, LlmHandler, Runtime, MessageProcessor) to provide seamless message interruption while maintaining state consistency and backward compatibility.

### Existing Architecture Context

The system already has:
- **Runtime._activeProcessingAgents**: A Set tracking agents currently processing messages
- **MessageBus**: Manages message queues per agent with FIFO ordering
- **LlmHandler**: Manages tool-calling loops and LLM interactions
- **MessageProcessor**: Handles message scheduling and concurrent processing
- **ConversationManager**: Manages chat history per agent
- **LlmClient**: Supports abort() method for canceling LLM calls

## Architecture

### High-Level Flow

```
Message Arrives via MessageBus.send()
    ↓
Check if Target Agent is in _activeProcessingAgents
    ↓
    ├─ Agent Not Active → Queue Message (normal flow)
    │
    └─ Agent Active in Tool-Calling Loop → Interrupt Flow
        ├─ Cancel Pending LLM Call (via LlmClient.abort())
        ├─ Remove Tool Call from Chat History
        ├─ Remove Tool Call Response from Chat History
        ├─ Replace Pending Tool Call with New Message
        └─ Return Control to Agent for New Message
```

### Component Interactions

1. **MessageBus**: Routes incoming messages, checks agent status via callback
2. **Runtime**: Maintains active processing registry (_activeProcessingAgents)
3. **LlmHandler**: Manages tool-calling loop, detects interruptions, cleans chat history
4. **MessageProcessor**: Schedules message processing, respects active agent status
5. **LlmClient**: Provides abort() method to cancel pending LLM calls
6. **ConversationManager**: Manages chat history, supports removal of entries

## Components and Interfaces

### 1. Message Interruption Detection (in MessageBus)

**Purpose**: Detect when a new message arrives for an agent in tool-calling loop

**Enhancement to MessageBus.send()**:
```
When message arrives:
  1. Check if target agent is in Runtime._activeProcessingAgents
  2. If active: trigger interruption flow
  3. If not active: queue message normally
```

**Callback Integration**:
- MessageBus already accepts `getAgentStatus` callback in constructor
- Extend to check if agent is in active processing set

### 2. Tool Call Cancellation (in LlmHandler)

**Purpose**: Cancel pending tool calls and clean up chat history

**New Methods in LlmHandler**:
```
class LlmHandler:
  - detectPendingToolCall(agentId: string): ToolCall | null
  - cancelPendingToolCall(agentId: string): boolean
  - removeToolCallFromHistory(agentId: string, toolCallId: string): void
  - removeToolCallResponse(agentId: string, toolCallId: string): void
  - replaceWithNewMessage(agentId: string, newMessage: Message): void
```

**Responsibilities**:
- Identify pending tool call in current LLM processing
- Call LlmClient.abort() to cancel LLM request
- Remove tool call and response from ConversationManager
- Inject new message as latest content

### 3. Message Interruption Coordinator (in Runtime)

**Purpose**: Orchestrate the interruption flow

**New Methods in Runtime**:
```
class Runtime:
  - handleMessageInterruption(agentId: string, newMessage: Message): void
  - interruptAgentToolCall(agentId: string, newMessage: Message): boolean
  - processInterruptedMessage(agentId: string, newMessage: Message): void
```

**Responsibilities**:
- Check if agent is actively processing
- Coordinate with LlmHandler to cancel tool call
- Manage message replacement
- Update active processing registry

### 4. Chat History Cleanup (in ConversationManager)

**Purpose**: Remove canceled tool calls and responses from chat history

**New Methods in ConversationManager**:
```
class ConversationManager:
  - removeToolCallEntry(agentId: string, toolCallId: string): boolean
  - removeToolResponseEntry(agentId: string, toolCallId: string): boolean
  - getLastToolCall(agentId: string): ToolCall | null
  - replaceLastUserMessage(agentId: string, newMessage: Message): void
```

**Responsibilities**:
- Locate and remove tool call entries
- Locate and remove tool response entries
- Maintain chat history consistency
- Support message replacement

## Data Models

### Message Structure
```
interface Message {
  id: string
  agentId: string
  content: string
  timestamp: number
  source: 'user' | 'agent' | 'system'
  metadata?: Record<string, any>
}
```

### Tool Call Structure
```
interface ToolCall {
  id: string
  agentId: string
  toolName: string
  parameters: Record<string, any>
  status: 'pending' | 'executing' | 'completed' | 'canceled'
  createdAt: number
  completedAt?: number
}
```

### Chat History Entry
```
type ChatHistoryEntry = 
  | { type: 'message'; data: Message }
  | { type: 'tool_call'; data: ToolCall }
  | { type: 'tool_response'; toolCallId: string; response: any }
```

### Agent State
```
interface AgentState {
  agentId: string
  isActive: boolean
  currentToolCall?: ToolCall
  chatHistory: ChatHistoryEntry[]
  messageQueue: Message[]
  lastProcessedAt: number
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Single Active Processing Per Agent

*For any* agent, at most one message processing sequence should be active at any given time. If an agent is marked as active, no other processing sequence should be initiated for that agent until it is marked inactive.

**Validates: Requirements 1.1, 1.2, 1.3, 1.5**

### Property 2: Message Interruption Cancels Tool Calls

*For any* agent with a pending tool call and a new incoming message, when the interruption handler processes the new message, the pending tool call should be canceled and no longer in the pending state.

**Validates: Requirements 2.1, 2.2, 6.1, 6.2**

### Property 3: Canceled Tool Calls Removed from History

*For any* canceled tool call, the tool call request and all associated responses should be completely removed from the agent's chat history, with no orphaned references remaining.

**Validates: Requirements 2.3, 2.4, 3.1, 3.2, 7.3**

### Property 4: New Message Becomes Latest Content

*For any* interruption event where a tool call is canceled, the new incoming message should become the latest content in the agent's context for processing.

**Validates: Requirements 2.5**

### Property 5: Chat History Preservation

*For any* tool call cancellation, all messages and completed tool calls that occurred before the canceled tool call should remain unchanged in the chat history.

**Validates: Requirements 3.3, 3.4**

### Property 6: Message Queuing for Active Agents

*For any* agent marked as active and any new incoming message, the message should be added to the agent's message queue and not processed immediately.

**Validates: Requirements 4.1, 4.2**

### Property 7: FIFO Message Queue Processing

*For any* sequence of messages queued for an agent, when the agent completes processing and messages are delivered from the queue, they should be delivered in the same order they were queued (FIFO).

**Validates: Requirements 4.3, 4.4**

### Property 8: Queue Replacement on New Message

*For any* agent with a pending tool call and queued messages, when a new message arrives, the pending tool call should be canceled and the new message should be processed immediately, replacing the queued message delivery.

**Validates: Requirements 4.5**

### Property 9: MessageBus Integration

*For any* message arriving via MessageBus for an active agent, the system should check the active processing registry and either queue the message or interrupt the current processing.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 10: Backward Compatibility

*For any* message arriving for an inactive agent, the system should process it normally without queuing or interruption, maintaining existing communication patterns.

**Validates: Requirements 5.4, 5.5**

### Property 11: Tool Call Identification and Cancellation

*For any* cancellation request, the system should correctly identify the pending tool call in LlmHandler and stop its execution, releasing any held resources.

**Validates: Requirements 6.3, 6.4**

### Property 12: Fallback Queuing for Completed Tool Calls

*For any* message arriving when the tool call is already completed (cannot be canceled), the message should be queued for delivery after the current processing completes.

**Validates: Requirements 6.5**

### Property 13: State Consistency After Interruption

*For any* interruption event, the active processing registry, message queue, and agent's actual processing state should remain consistent, with no mismatches between tracked state and actual state.

**Validates: Requirements 7.1, 7.2, 7.4**

### Property 14: Error Detection and Recovery

*For any* state inconsistency detected during interruption, the system should log the error and recover gracefully without corrupting agent state or losing messages.

**Validates: Requirements 7.5**

## Error Handling

### Scenarios and Responses

1. **Tool Call Already Completed**
   - Scenario: Interruption requested but tool call already completed
   - Response: Queue the new message for delivery after current processing completes
   - Logging: Info level - "Tool call already completed, queuing message"

2. **Chat History Corruption**
   - Scenario: Tool call references not found in chat history during removal
   - Response: Log warning, continue with removal of available references
   - Logging: Warning level - "Tool call reference not found in history"

3. **State Inconsistency Detected**
   - Scenario: Active registry and actual agent state mismatch
   - Response: Log error, mark agent as inactive, clear queues, notify system
   - Logging: Error level - "State inconsistency detected for agent {agentId}"

4. **Message Queue Overflow**
   - Scenario: Message queue exceeds maximum size
   - Response: Reject new message, notify sender
   - Logging: Warning level - "Message queue full for agent {agentId}"

5. **LlmHandler Cancellation Failure**
   - Scenario: LlmHandler cannot cancel the tool call
   - Response: Queue the message and retry cancellation on next cycle
   - Logging: Warning level - "Failed to cancel tool call, queuing message"

## Testing Strategy

### Unit Testing

Unit tests verify specific examples, edge cases, and error conditions:

- Test active processing registry operations (add, remove, check)
- Test message queue operations (enqueue, dequeue, FIFO ordering)
- Test chat history removal with various message/tool call combinations
- Test state consistency checks
- Test error scenarios (queue overflow, cancellation failure, etc.)
- Test integration points with MessageBus and LlmHandler

### Property-Based Testing

Property-based tests verify universal properties across all inputs:

- **Property 1**: Generate random agents and verify single active processing
- **Property 2**: Generate random tool calls and messages, verify cancellation
- **Property 3**: Generate random chat histories, verify complete removal
- **Property 4**: Generate random interruptions, verify message becomes latest
- **Property 5**: Generate random message sequences, verify preservation
- **Property 6**: Generate random active agents and messages, verify queuing
- **Property 7**: Generate random message sequences, verify FIFO delivery
- **Property 8**: Generate random queue states, verify replacement behavior
- **Property 9**: Generate random MessageBus messages, verify integration
- **Property 10**: Generate random inactive agents, verify normal processing
- **Property 11**: Generate random tool calls, verify identification and cancellation
- **Property 12**: Generate random completed tool calls, verify fallback queuing
- **Property 13**: Generate random interruption sequences, verify state consistency
- **Property 14**: Generate random state inconsistencies, verify error handling

### Test Configuration

- Minimum 100 iterations per property test
- Each property test tagged with: **Feature: agent-concurrent-request-management, Property {N}: {property_text}**
- Unit tests focus on specific examples and edge cases
- Property tests focus on universal correctness across all inputs

