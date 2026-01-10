# 需求文档

## 简介

重构 `src/platform/runtime.js` 文件，将其拆分为多个专注的模块，提高代码可维护性、可测试性和可读性。当前文件超过 2000 行，包含了运行时核心、工具执行、LLM 处理、智能体管理、消息处理等多个职责，违反了单一职责原则。

**重要约束**：本次重构只做结构调整，不修改任何业务逻辑。所有拆分出的模块必须保持原有行为完全一致。

## 术语表

- **Runtime**: 运行时核心类，负责协调各模块工作
- **Tool_Executor**: 工具执行器，负责执行所有工具调用
- **LLM_Handler**: LLM 处理器，负责与 LLM 交互和消息循环
- **Agent_Manager**: 智能体管理器，负责智能体的创建、终止和状态管理
- **Message_Processor**: 消息处理器，负责消息调度和投递
- **Context_Builder**: 上下文构建器，负责构建智能体上下文和系统提示词
- **Shutdown_Manager**: 关闭管理器，负责优雅关闭流程
- **JavaScript_Executor**: JavaScript 执行器，负责安全执行 JS 代码

## 需求

### 需求 1: 工具执行器模块拆分

**用户故事:** 作为开发者，我希望工具执行逻辑被拆分到独立模块，以便我可以独立地添加、修改或测试工具。

#### 验收标准

1. 当创建 Tool_Executor 模块时，该模块应包含所有工具定义和执行逻辑
2. 当执行工具时，Tool_Executor 应处理执行并返回结果给调用者
3. 当添加新工具时，Tool_Executor 应允许注册而无需修改 Runtime 核心
4. Tool_Executor 应导出 `getToolDefinitions()` 和 `executeToolCall()` 方法
5. 当工具执行失败时，Tool_Executor 应返回结构化的错误信息
6. Tool_Executor 模块应包含详细注释，说明每个工具的用途、参数和返回值

### 需求 2: LLM 处理器模块拆分

**用户故事:** 作为开发者，我希望 LLM 交互逻辑被拆分到独立模块，以便我可以修改 LLM 处理而不影响其他运行时组件。

#### 验收标准

1. 当创建 LLM_Handler 模块时，该模块应包含所有 LLM 交互逻辑
2. LLM_Handler 应处理与 LLM 的工具调用循环
3. LLM_Handler 应在 LLM 交互期间管理会话上下文
4. 当 LLM 调用失败时，LLM_Handler 应处理错误并通知父智能体
5. LLM_Handler 应支持中断正在进行的 LLM 调用
6. LLM_Handler 模块应包含详细注释，说明 LLM 调用流程和错误处理策略

### 需求 3: 智能体管理器模块拆分

**用户故事:** 作为开发者，我希望智能体生命周期管理被拆分到独立模块，以便我可以独立于运行时核心管理智能体。

#### 验收标准

1. 当创建 Agent_Manager 模块时，该模块应处理智能体的创建、终止和状态跟踪
2. Agent_Manager 应管理智能体元数据和父子关系
3. Agent_Manager 应跟踪智能体活动时间和空闲状态
4. Agent_Manager 应处理从持久化状态恢复智能体
5. 当智能体被终止时，Agent_Manager 应级联终止子智能体
6. Agent_Manager 模块应包含详细注释，说明智能体生命周期和父子关系管理

### 需求 4: 消息处理器模块拆分

**用户故事:** 作为开发者，我希望消息处理逻辑被拆分到独立模块，以便我可以修改消息调度而不影响其他组件。

#### 验收标准

1. 当创建 Message_Processor 模块时，该模块应处理消息调度和投递
2. Message_Processor 应支持可配置限制的并发消息处理
3. Message_Processor 应跟踪活跃处理的智能体以防止重复处理
4. Message_Processor 应与消息总线集成以检索消息
5. 当处理失败时，Message_Processor 应隔离失败并继续处理其他消息
6. Message_Processor 模块应包含详细注释，说明消息调度策略和并发控制机制

### 需求 5: 上下文构建器模块拆分

**用户故事:** 作为开发者，我希望上下文构建逻辑被拆分到独立模块，以便我可以修改提示词组合而不影响运行时逻辑。

#### 验收标准

1. 当创建 Context_Builder 模块时，该模块应处理系统提示词组合
2. Context_Builder 应格式化消息以供 LLM 消费
3. Context_Builder 应将运行时信息、任务委托书和联系人列表注入提示词
4. Context_Builder 应构建包含工具和引用的智能体执行上下文
5. Context_Builder 应处理用于 token 管理的上下文状态提示
6. Context_Builder 模块应包含详细注释，说明提示词组合规则和上下文注入策略

### 需求 6: 关闭管理器模块拆分

**用户故事:** 作为开发者，我希望优雅关闭逻辑被拆分到独立模块，以便我可以独立修改关闭行为。

#### 验收标准

1. 当创建 Shutdown_Manager 模块时，该模块应处理优雅关闭流程
2. Shutdown_Manager 应支持信号处理（SIGINT、SIGTERM）
3. Shutdown_Manager 应支持第二次信号时强制退出
4. Shutdown_Manager 应在关闭期间协调状态持久化
5. Shutdown_Manager 应提供关闭状态信息
6. Shutdown_Manager 模块应包含详细注释，说明关闭流程的各个阶段和超时处理

### 需求 7: Runtime 核心精简

**用户故事:** 作为开发者，我希望 Runtime 类成为一个精简的协调器，以便更容易理解和维护。

#### 验收标准

1. 当重构完成时，Runtime 类应少于 500 行
2. Runtime 应委托给专门的模块处理特定功能
3. Runtime 应保持与现有公共 API 的向后兼容性
4. Runtime 应初始化和协调所有子模块
5. Runtime 应暴露与重构前相同的公共方法
6. Runtime 核心应包含详细注释，说明各模块的职责划分和协作关系

### 需求 8: JavaScript 执行器模块拆分

**用户故事:** 作为开发者，我希望 JavaScript 执行逻辑被拆分到独立模块，以便我可以独立修改沙箱行为。

#### 验收标准

1. 当创建 JavaScript_Executor 模块时，该模块应处理 JavaScript 代码执行
2. JavaScript_Executor 应检测并阻止危险代码模式
3. JavaScript_Executor 应支持 Canvas 绘图功能
4. JavaScript_Executor 应将结果转换为 JSON 安全值
5. 当执行失败时，JavaScript_Executor 应返回结构化的错误信息
6. JavaScript_Executor 模块应包含详细注释，说明安全限制和 Canvas 支持的实现方式

### 需求 9: 代码注释规范

**用户故事:** 作为开发者，我希望所有拆分的模块都有详细的注释，以便我能快速理解代码的设计初衷和使用方式。

#### 验收标准

1. 每个模块文件顶部应包含模块概述注释，说明模块的职责和设计初衷
2. 每个模块应包含使用流程说明，描述模块如何与其他模块协作
3. 每个公共方法应包含 JSDoc 注释，说明参数、返回值和使用场景
4. 关键的业务逻辑应包含行内注释，解释为什么这样实现
5. 模块之间的依赖关系应在注释中明确说明
6. 复杂的数据流应包含流程图或示意图（使用 ASCII 或 Mermaid）
