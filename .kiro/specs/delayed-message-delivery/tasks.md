# Implementation Plan: Delayed Message Delivery

## Overview

为消息总线添加延迟投递能力，修改 MessageBus、ToolExecutor 和 MessageProcessor 三个模块。

## Tasks

- [x] 1. 扩展 MessageBus 支持延迟消息
  - [x] 1.1 添加延迟消息存储结构
    - 在 MessageBus 构造函数中添加 `_delayedMessages = []`
    - _Requirements: 1.1_
  - [x] 1.2 修改 send() 方法支持 delayMs 参数
    - 当 delayMs > 0 时，将消息存入延迟队列并按 deliverAt 排序
    - 当 delayMs <= 0 或未指定时，保持原有立即投递逻辑
    - 返回值包含 scheduledDeliveryTime（延迟消息）
    - _Requirements: 1.1, 1.2, 1.3, 3.1_
  - [x] 1.3 编写 send() 延迟参数的属性测试
    - **Property 3: 零延迟等价于立即投递**
    - **Property 4: 负延迟被规范化为零**
    - **Validates: Requirements 1.2, 1.3**
  - [x] 1.4 实现 deliverDueMessages() 方法
    - 检查延迟队列中到期的消息
    - 将到期消息移入收件人的立即队列
    - 记录投递日志
    - _Requirements: 2.1, 2.2, 2.4_
  - [x] 1.5 编写 deliverDueMessages() 的属性测试
    - **Property 1: 延迟消息不会提前投递**
    - **Property 5: 延迟消息保持发送顺序**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 1.6 实现 getDelayedCount() 方法
    - 返回延迟消息总数或指定收件人的延迟消息数
    - _Requirements: 3.2_
  - [x] 1.7 实现 forceDeliverAllDelayed() 方法
    - 将所有延迟消息立即投递到收件人队列
    - 清空延迟队列
    - _Requirements: 4.1_
  - [x] 1.8 编写 forceDeliverAllDelayed() 的属性测试
    - **Property 6: 关闭时延迟消息被强制投递**
    - **Validates: Requirements 4.1**

- [x] 2. 更新 ToolExecutor 的 send_message 工具
  - [x] 2.1 更新 send_message 工具定义
    - 添加可选的 delayMs 参数及描述
    - _Requirements: 1.4_
  - [x] 2.2 修改 _executeSendMessage() 方法
    - 传递 delayMs 参数给 sendMessage
    - 返回包含 scheduledDeliveryTime 的结果
    - _Requirements: 1.1, 3.1_

- [x] 3. 更新 MessageProcessor 集成延迟检查
  - [x] 3.1 在 processingLoop() 中添加延迟消息检查
    - 在调度消息处理前调用 deliverDueMessages()
    - _Requirements: 2.3_
  - [x] 3.2 在关闭流程中处理延迟消息
    - 优雅关闭时调用 forceDeliverAllDelayed()
    - 强制退出时记录警告日志
    - _Requirements: 4.1, 4.2, 4.3_

- [x] 4. Checkpoint - 确保所有测试通过
  - 运行所有单元测试和属性测试
  - 确保现有测试不受影响
  - 如有问题请询问用户

- [x] 5. 编写集成测试
  - [x] 5.1 端到端延迟消息测试
    - 测试完整的延迟消息发送和接收流程
    - _Requirements: 1.1, 2.1_
  - [x] 5.2 系统关闭时延迟消息处理测试
    - 测试优雅关闭和强制退出场景
    - _Requirements: 4.1, 4.2_

## Notes

- 属性测试使用 fast-check 库，每个属性至少运行 100 次迭代
- 修改 MessageBus 时需确保向后兼容，不影响现有消息处理逻辑
