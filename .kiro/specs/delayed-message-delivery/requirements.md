# Requirements Document

## Introduction

本功能为 `send_message` 工具添加可选的延迟投递能力，允许智能体发送的消息在指定时间后才进入收件人的消息队列。这对于实现定时任务、延迟通知、重试机制等场景非常有用。

## Glossary

- **Message_Bus**: 消息总线，负责消息的队列管理和投递
- **Delayed_Message**: 延迟消息，指定了延迟时间的消息，在延迟时间到达后才入列
- **Delay_Ms**: 延迟毫秒数，消息从发送到实际入列的等待时间
- **Pending_Queue**: 待处理队列，收件人的消息队列
- **Delayed_Queue**: 延迟队列，存放尚未到达投递时间的消息

## Requirements

### Requirement 1: 延迟参数支持

**User Story:** As a 智能体开发者, I want to 在发送消息时指定延迟时间, so that 消息可以在指定时间后才被收件人接收。

#### Acceptance Criteria

1. WHEN a send_message call includes a delayMs parameter, THE Message_Bus SHALL store the message in a delayed queue instead of the immediate queue
2. WHEN delayMs is not provided or is 0, THE Message_Bus SHALL deliver the message immediately as before
3. WHEN delayMs is a negative number, THE Message_Bus SHALL treat it as 0 and deliver immediately
4. THE send_message tool definition SHALL include an optional delayMs parameter of type number with description "延迟投递时间（毫秒），消息将在指定时间后才进入收件人队列"

### Requirement 2: 延迟消息投递

**User Story:** As a 系统, I want to 在延迟时间到达后自动将消息投递到收件人队列, so that 延迟消息能够被正常处理。

#### Acceptance Criteria

1. WHEN a delayed message's delay time has elapsed, THE Message_Bus SHALL move the message from the delayed queue to the recipient's pending queue
2. WHEN multiple delayed messages reach their delivery time simultaneously, THE Message_Bus SHALL deliver them in the order they were originally sent
3. WHILE the runtime is running, THE Message_Bus SHALL periodically check for delayed messages ready for delivery
4. WHEN a delayed message is delivered, THE Message_Bus SHALL log the delivery event with original send time and actual delivery time

### Requirement 3: 延迟消息状态查询

**User Story:** As a 智能体, I want to 知道我发送的延迟消息的状态, so that 我可以了解消息是否已投递。

#### Acceptance Criteria

1. WHEN send_message is called with delayMs > 0, THE Message_Bus SHALL return a response including scheduledDeliveryTime in addition to messageId
2. THE Message_Bus SHALL provide a method to query the count of pending delayed messages for a recipient

### Requirement 4: 系统关闭时的延迟消息处理

**User Story:** As a 系统管理员, I want to 在系统关闭时妥善处理延迟消息, so that 不会丢失重要消息。

#### Acceptance Criteria

1. WHEN the runtime is stopping gracefully, THE Message_Bus SHALL immediately deliver all pending delayed messages before shutdown
2. WHEN the runtime is force-exiting, THE Message_Bus SHALL log a warning about undelivered delayed messages
3. IF delayed messages exist during shutdown, THEN THE Message_Bus SHALL log the count of messages being force-delivered or abandoned
