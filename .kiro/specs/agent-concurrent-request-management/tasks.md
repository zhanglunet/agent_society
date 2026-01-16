# Implementation Plan: Agent Concurrent Request Management

## Overview

This implementation plan breaks down the concurrent request management feature into discrete coding tasks. The feature enables agents to handle message interruptions during tool-calling loops by canceling pending tool calls, cleaning up chat history, and processing new messages immediately.

The implementation integrates with existing components (MessageBus, LlmHandler, Runtime, ConversationManager) and follows the existing architecture patterns.

## Tasks

- [x] 1. Enhance MessageBus to detect active agent status
  - Modify MessageBus.send() to check if target agent is in active processing
  - Add logic to trigger interruption flow when agent is active
  - Ensure backward compatibility with existing message queuing
  - _Requirements: 1.1, 1.4, 5.1_

- [x] 1.1 Write property tests for MessageBus active agent detection
  - **Property 1: Single Active Processing Per Agent**
  - **Validates: Requirements 1.1, 1.2, 1.3, 1.5**

- [x] 2. Implement tool call detection and cancellation in LlmHandler
  - Add method to detect pending tool call in current LLM processing
  - Implement cancellation by calling LlmClient.abort()
  - Handle cancellation failures gracefully
  - _Requirements: 2.1, 2.2, 6.1, 6.2, 6.3_

- [x] 2.1 Write property tests for tool call cancellation
  - **Property 2: Message Interruption Cancels Tool Calls**
  - **Validates: Requirements 2.1, 2.2, 6.1, 6.2**

- [x] 3. Implement chat history cleanup in ConversationManager
  - Add method to remove tool call entries from chat history
  - Add method to remove tool response entries from chat history
  - Ensure no orphaned references remain
  - Verify chat history consistency after removal
  - _Requirements: 2.3, 2.4, 3.1, 3.2, 3.3, 3.4_

- [x] 3.1 Write property tests for chat history cleanup
  - **Property 3: Canceled Tool Calls Removed from History**
  - **Property 5: Chat History Preservation**
  - **Validates: Requirements 2.3, 2.4, 3.1, 3.2, 3.3, 3.4**

- [ ] 4. Implement message replacement in LlmHandler
  - Add method to inject new message as latest content
  - Ensure new message becomes the current context for agent
  - Handle message formatting and validation
  - _Requirements: 2.5_

- [ ] 4.1 Write property tests for message replacement
  - **Property 4: New Message Becomes Latest Content**
  - **Validates: Requirements 2.5**

- [ ] 5. Implement interruption flow in Runtime
  - Add handleMessageInterruption() method to coordinate interruption
  - Implement interruptAgentToolCall() to execute interruption logic
  - Integrate with MessageBus callback for active agent detection
  - _Requirements: 1.2, 1.3, 5.2, 5.3_

- [ ] 5.1 Write property tests for interruption coordination
  - **Property 9: MessageBus Integration**
  - **Validates: Requirements 5.1, 5.2, 5.3**

- [ ] 6. Implement message queuing for active agents
  - Ensure messages for active agents are queued instead of processed immediately
  - Implement queue delivery when agent becomes inactive
  - Maintain FIFO ordering for queued messages
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [ ] 6.1 Write property tests for message queuing
  - **Property 6: Message Queuing for Active Agents**
  - **Property 7: FIFO Message Queue Processing**
  - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

- [ ] 7. Implement queue replacement on new message
  - When new message arrives for agent with pending tool call and queued messages
  - Cancel pending tool call and process new message immediately
  - Replace queued message delivery with new message processing
  - _Requirements: 4.5_

- [ ] 7.1 Write property tests for queue replacement
  - **Property 8: Queue Replacement on New Message**
  - **Validates: Requirements 4.5**

- [ ] 8. Implement backward compatibility for inactive agents
  - Ensure messages for inactive agents are processed normally
  - Verify existing communication patterns still work
  - Test with delayed message delivery
  - _Requirements: 5.4, 5.5_

- [ ] 8.1 Write property tests for backward compatibility
  - **Property 10: Backward Compatibility**
  - **Validates: Requirements 5.4, 5.5**

- [ ] 9. Implement fallback queuing for completed tool calls
  - When tool call is already completed (cannot be canceled)
  - Queue new message for delivery after current processing completes
  - Ensure no message loss
  - _Requirements: 6.5_

- [ ] 9.1 Write property tests for fallback queuing
  - **Property 12: Fallback Queuing for Completed Tool Calls**
  - **Validates: Requirements 6.5**

- [ ] 10. Implement state consistency checks
  - Verify active processing registry matches actual agent state
  - Verify message queue consistency with MessageBus state
  - Verify chat history consistency after modifications
  - _Requirements: 7.1, 7.2, 7.3, 7.4_

- [ ] 10.1 Write property tests for state consistency
  - **Property 13: State Consistency After Interruption**
  - **Validates: Requirements 7.1, 7.2, 7.4**

- [ ] 11. Implement error handling and recovery
  - Handle tool call cancellation failures
  - Handle chat history corruption gracefully
  - Detect and recover from state inconsistencies
  - Log errors appropriately
  - _Requirements: 7.5_

- [ ] 11.1 Write property tests for error handling
  - **Property 14: Error Detection and Recovery**
  - **Validates: Requirements 7.5**

- [ ] 12. Implement tool call identification in LlmHandler
  - Add method to identify pending tool call in current processing
  - Support multiple tool calls in flight
  - Handle edge cases (no pending call, already completed)
  - _Requirements: 6.1, 6.4, 6.5_

- [ ] 12.1 Write property tests for tool call identification
  - **Property 11: Tool Call Identification and Cancellation**
  - **Validates: Requirements 6.3, 6.4**

- [ ] 13. Checkpoint - Ensure all tests pass
  - Run all unit tests for message interruption components
  - Run all property-based tests for correctness properties
  - Verify no regressions in existing functionality
  - Ask the user if questions arise

- [ ] 14. Integration testing
  - Test interruption flow end-to-end with real agents
  - Test with multiple concurrent agents
  - Test with delayed message delivery
  - Test error scenarios and recovery
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1, 6.1, 7.1_

- [ ] 14.1 Write integration tests
  - Test complete interruption flow
  - Test concurrent agent scenarios
  - Test error recovery

- [ ] 15. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive implementation
- Each task references specific requirements for traceability
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Integration tests verify end-to-end functionality
- Checkpoints ensure incremental validation

