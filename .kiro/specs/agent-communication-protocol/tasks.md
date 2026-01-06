# Implementation Plan: Agent Communication Protocol

## Overview

本实现计划将智能体通信协议改进分解为可执行的编码任务。实现顺序遵循依赖关系：先实现核心数据结构和验证逻辑，再实现 ContactManager，然后增强现有工具，最后更新提示词模板。

## Tasks

- [x] 1. 实现 TaskBrief 数据结构和验证逻辑
  - [x] 1.1 创建 TaskBrief 验证函数
    - 在 `src/platform/task_brief.js` 中实现 `validateTaskBrief` 函数
    - 验证必填字段：objective、constraints、inputs、outputs、completion_criteria
    - 返回 `{ valid: boolean, errors: string[] }` 格式
    - _Requirements: 1.2, 1.4_
  - [x] 1.2 编写 TaskBrief 验证属性测试
    - **Property 1: Task Brief 验证**
    - **Validates: Requirements 1.2, 1.4**
  - [x] 1.3 实现 TaskBrief 格式化函数
    - 将 TaskBrief 格式化为可注入上下文的文本
    - 包含所有字段的结构化展示
    - _Requirements: 1.5_

- [x] 2. 实现 ContactManager 组件
  - [x] 2.1 创建 ContactManager 类
    - 在 `src/platform/contact_manager.js` 中实现
    - 实现 `initRegistry`、`canSendMessage`、`addContact`、`getContact`、`listContacts` 方法
    - 处理 root 和 user 的特殊情况
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
  - [x] 2.2 编写联系人注册表初始化属性测试
    - **Property 3: 联系人注册表初始化**
    - **Validates: Requirements 2.1, 2.2**
  - [x] 2.3 编写联系人查询属性测试
    - **Property 5: 联系人查询**
    - **Validates: Requirements 2.6**
    - 注意：联系人注册表仅用于记录和查询，不阻止消息发送
  - [x] 2.4 实现联系人注册表持久化
    - 在 OrgPrimitives 中添加联系人注册表的保存和加载
    - 更新 org.json 数据结构
    - _Requirements: 2.7_

- [x] 3. Checkpoint - 确保核心组件测试通过
  - 运行所有测试，确保 TaskBrief 和 ContactManager 功能正常
  - 如有问题，请向用户询问

- [x] 4. 增强 spawn_agent 工具
  - [x] 4.1 更新 spawn_agent 工具定义
    - 添加 taskBrief 参数到工具 schema
    - 更新工具描述说明 Task_Brief 必填字段
    - _Requirements: 1.1_
  - [x] 4.2 实现 spawn_agent 中的 TaskBrief 验证
    - 调用 validateTaskBrief 验证输入
    - 缺少必填字段时返回错误
    - _Requirements: 1.4_
  - [x] 4.3 实现 TaskBrief 注入子智能体上下文
    - 创建子智能体时将 TaskBrief 格式化并注入初始上下文
    - _Requirements: 1.5_
  - [x] 4.4 编写 TaskBrief 注入上下文属性测试
    - **Property 2: Task Brief 注入上下文**
    - **Validates: Requirements 1.5**
  - [x] 4.5 实现预设协作者处理
    - 解析 taskBrief.collaborators 字段
    - 将协作者添加到子智能体的 Contact_Registry
    - _Requirements: 2.8, 7.1, 7.2_
  - [x] 4.6 编写预设协作者处理属性测试
    - **Property 6: 预设协作者处理**
    - **Validates: Requirements 2.8, 7.1, 7.2, 7.4**
  - [x] 4.7 实现父子智能体联系人自动添加
    - 创建子智能体后自动将其添加到父智能体的 Contact_Registry
    - _Requirements: 2.5_
  - [x] 4.8 编写父子智能体联系人属性测试
    - **Property 4: 父子智能体联系人自动添加**
    - **Validates: Requirements 2.5**

- [x] 5. 增强 send_message 工具
  - [x] 5.1 联系人注册表记录（不做发送验证）
    - 联系人注册表仅用于记录和查询联系人信息
    - 智能体可以向任何已存在的智能体发送消息
    - _Requirements: 2.6_
  - [x] 5.2 实现首次消息双向联系
    - 首次消息时自动将发送者添加到接收者的 Contact_Registry
    - _Requirements: 5.2_
  - [x] 5.3 编写首次消息双向联系属性测试
    - **Property 7: 首次消息双向联系**
    - **Validates: Requirements 5.2**
  - [x] 5.4 确保 from 字段自动填充
    - 验证系统自动填充 from 字段
    - 忽略调用者提供的 from 字段
    - _Requirements: 9.1, 9.5_
  - [x] 5.5 编写 from 字段自动填充属性测试
    - **Property 8: from 字段自动填充**
    - **Validates: Requirements 9.1, 9.5**

- [x] 6. 实现消息格式化
  - [x] 6.1 创建消息格式化函数
    - 在 `src/platform/message_formatter.js` 中实现 `formatMessageForAgent` 函数
    - 生成来源标识行、消息内容、回复提示
    - 处理 user 消息的特殊格式
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 6.2 编写消息格式化属性测试
    - **Property 9: 消息格式化**
    - **Validates: Requirements 9.2, 9.3, 10.1, 10.2, 10.3, 10.4, 10.5, 10.6**
  - [x] 6.3 集成消息格式化到消息投递流程
    - 在 Runtime 的消息投递逻辑中调用格式化函数
    - 将格式化后的消息注入智能体上下文
    - _Requirements: 10.6_

- [x] 7. Checkpoint - 确保工具增强测试通过
  - 运行所有测试，确保 spawn_agent 和 send_message 增强功能正常
  - 如有问题，请向用户询问

- [x] 8. 实现消息类型验证
  - [x] 8.1 创建消息类型验证函数
    - 在 `src/platform/message_validator.js` 中实现
    - 验证 task_assignment、introduction_request、introduction_response 等类型
    - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - [x] 8.2 编写消息类型验证属性测试
    - **Property 10: 消息类型验证**
    - **Validates: Requirements 8.2, 8.3, 8.4, 8.5**
  - [x] 8.3 集成消息类型验证到 send_message
    - 可选验证，不阻止发送但记录警告
    - _Requirements: 8.5_

- [x] 9. 更新提示词模板
  - [x] 9.1 更新 root.txt 提示词
    - 添加 Task_Brief 必填字段说明
    - 强调技术约束必须明确传递
    - _Requirements: 6.1, 6.5_
  - [x] 9.2 更新 base.txt 提示词
    - 添加 Contact_Registry 说明
    - 添加介绍式通信机制说明
    - 添加如何请求介绍和响应介绍的指导
    - _Requirements: 6.2, 6.4_
  - [x] 9.3 更新 tool_rules.txt 提示词
    - 添加 spawn_agent 需要 Task_Brief 的说明
    - 添加 send_message 联系人验证的说明
    - _Requirements: 6.3_

- [x] 10. 更新 dev_team.js 示例
  - [x] 10.1 更新架构师提示词
    - 添加创建程序员时必须提供完整 Task_Brief 的说明
    - 强调技术约束（如"静态网页"）必须写入 constraints
    - _Requirements: 6.3, 6.5_
  - [x] 10.2 更新程序员提示词
    - 添加查看 Task_Brief 获取任务详情的说明
    - 添加如何请求介绍获取协作支持的说明
    - _Requirements: 6.4_

- [x] 11. Final Checkpoint - 确保所有测试通过
  - 运行完整测试套件
  - 验证 dev_team.js 示例正常工作
  - 如有问题，请向用户询问

## Notes

- 所有任务都是必需的，包括测试任务
- 每个任务引用了具体的需求编号以便追溯
- 属性测试使用 fast-check 库，每个测试至少运行 100 次迭代
- Checkpoint 任务用于验证阶段性成果
