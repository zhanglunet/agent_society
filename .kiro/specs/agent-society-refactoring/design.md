# 设计文档：Agent Society 代码重构

## 概述

本设计文档描述 Agent Society 项目的代码重构方案。重构目标是优化代码组织结构，提高可维护性和可扩展性，同时保持所有现有功能不变。

### 重构原则

1. **功能保持不变**：重构不改变任何功能，只改变代码组织方式
2. **向后兼容**：保持对外 API 接口不变
3. **渐进式重构**：可以分阶段执行，每个阶段都能保持系统可运行
4. **测试覆盖**：重构前后测试必须通过
5. **遵循项目规范**：按照 AGENTS.md 中的架构原则和编码规范

## 现有系统架构分析

### 系统概览

Agent Society 是一个基于大模型的智能体自组织社会化系统，核心功能包括：

- **多智能体协作框架**：支持动态创建岗位和智能体实例
- **异步消息通信**：基于消息总线的智能体间通信
- **工件存储系统**：管理智能体产生的工件
- **多模型支持**：支持多个 LLM 服务和智能路由
- **模块化扩展**：可插拔的模块系统
- **Web UI 和 HTTP API**：提供 Web 界面和 HTTP 接口
- **上下文管理**：支持对话历史压缩和 token 限制
- **并发控制**：LLM 请求并发控制

### 核心模块职责

#### 1. AgentSociety（系统入口）
- **职责**：面向用户的系统入口，隐藏运行时与根智能体的构建细节
- **主要功能**：
  - 初始化系统
  - 提交用户需求
  - 启动 HTTP 服务器
  - 优雅关闭管理
- **文件**：`src/platform/agent_society.js`

#### 2. Runtime（运行时核心）
- **职责**：将平台能力与智能体行为连接起来，作为核心协调器
- **主要功能**：
  - 协调各个子系统
  - 管理智能体生命周期
  - 处理消息调度
  - 执行工具调用
  - 处理 LLM 交互
- **文件**：`src/platform/runtime.js`
- **子模块**：`src/platform/runtime/` 目录下的 7 个子模块

#### 3. MessageBus（消息总线）
- **职责**：异步消息传递，按收件人队列缓存消息
- **主要功能**：
  - 发送和接收消息
  - 延迟消息投递
  - 消息队列管理
  - 中断检测
- **文件**：`src/platform/message_bus.js`

#### 4. OrgPrimitives（组织原语）
- **职责**：岗位和智能体的持久化存储
- **主要功能**：
  - 创建和管理岗位
  - 创建和管理智能体
  - 记录终止事件
  - 数据验证
- **文件**：`src/platform/org_primitives.js`

#### 5. ArtifactStore（工件存储）
- **职责**：工件的存储和检索
- **主要功能**：
  - 写入工件
  - 读取工件
  - 二进制检测
  - 元信息管理
- **文件**：`src/platform/artifact_store.js`

#### 6. LlmClient（LLM 客户端）
- **职责**：与 LLM 服务通信
- **主要功能**：
  - 调用聊天补全
  - 重试机制
  - 并发控制
  - 请求中断
- **文件**：`src/platform/llm_client.js`

#### 7. ConversationManager（会话管理器）
- **职责**：管理智能体的会话上下文
- **主要功能**：
  - 上下文压缩
  - Token 使用统计
  - 对话历史持久化
  - 上下文状态检查
- **文件**：`src/platform/conversation_manager.js`

#### 8. WorkspaceManager（工作空间管理器）
- **职责**：任务工作空间的文件操作
- **主要功能**：
  - 绑定工作空间
  - 文件读写
  - 目录列表
  - 路径安全验证
- **文件**：`src/platform/workspace_manager.js`

#### 9. Runtime 子模块（已部分重构）
- **JavaScriptExecutor**：JavaScript 代码执行
- **ContextBuilder**：上下文构建
- **AgentManager**：智能体生命周期管理
- **MessageProcessor**：消息调度和处理
- **ToolExecutor**：工具定义和执行
- **LlmHandler**：LLM 交互处理
- **ShutdownManager**：优雅关闭管理
- **文件**：`src/platform/runtime/` 目录

#### 10. 辅助服务模块
- **ConfigService**：配置管理
- **Logger**：日志系统
- **HttpServer**：HTTP 服务器
- **HttpClient**：HTTP 客户端
- **CommandExecutor**：命令执行
- **ContactManager**：联系人管理
- **ModuleLoader**：模块加载器
- **LlmServiceRegistry**：LLM 服务注册表
- **ModelSelector**：模型选择器
- **ToolGroupManager**：工具组管理器
- **CapabilityRouter**：能力路由器
- **ContentAdapter**：内容适配器
- **ArtifactContentRouter**：工件内容路由器
- **BinaryDetector**：二进制检测器
- **ConcurrencyController**：并发控制器

### 关键业务流程

#### 1. 系统启动流程
```
AgentSociety.init()
  → Runtime.init()
    → 加载配置
    → 初始化各个服务
    → 注册 user 和 root 智能体
    → 启动 HTTP 服务器（可选）
    → 启动消息处理循环
```

#### 2. 需求提交流程
```
AgentSociety.submitRequirement(text)
  → 绑定工作空间（可选）
  → MessageBus.send(to: "root", payload: text)
  → MessageProcessor 调度消息
  → Agent.onMessage()
    → LlmHandler 处理
      → ToolExecutor 执行工具
```

#### 3. 智能体创建流程
```
ToolExecutor.executeToolCall("spawn_agent")
  → AgentManager.spawnAgent()
    → OrgPrimitives.createAgent()
    → 创建 Agent 实例
    → 注册到 Runtime
    → 分配工作空间（root 的直接子智能体）
```

#### 4. 消息处理流程
```
MessageProcessor.processingLoop()
  → MessageBus.receiveNext()
  → Agent.onMessage()
    → LlmHandler.handleWithLlm()
      → LlmClient.chat()
      → ToolExecutor.executeToolCall()
      → ConversationManager 更新上下文
```

### 模块依赖关系

```
AgentSociety
  ├─ Runtime
  │   ├─ MessageBus
  │   ├─ OrgPrimitives
  │   ├─ ArtifactStore
  │   ├─ LlmClient
  │   ├─ ConversationManager
  │   ├─ WorkspaceManager
  │   ├─ CommandExecutor
  │   ├─ ContactManager
  │   ├─ ModuleLoader
  │   ├─ LlmServiceRegistry
  │   ├─ ModelSelector
  │   ├─ ToolGroupManager
  │   ├─ HttpClient
  │   ├─ Logger
  │   └─ runtime/
  │       ├─ JavaScriptExecutor
  │       ├─ ContextBuilder
  │       ├─ AgentManager
  │       ├─ MessageProcessor
  │       ├─ ToolExecutor
  │       ├─ LlmHandler
  │       └─ ShutdownManager
  └─ HTTPServer
```

## 代码结构问题分析

### 问题 1：职责重叠和冗余

#### 1.1 配置管理冗余
- **问题**：`config.js` 和 `config_service.js` 职责重叠
- **现状**：
  - `config.js` 提供 `loadConfig()` 函数
  - `config_service.js` 提供 `ConfigService` 类
  - 两者都处理配置加载，但方式不同
- **影响**：配置加载逻辑分散，难以维护

#### 1.2 消息格式化和验证分散
- **问题**：消息相关功能分散在多个文件
- **现状**：
  - `message_formatter.js`：消息格式化
  - `message_validator.js`：消息验证
  - `task_brief.js`：任务委托书验证和格式化
- **影响**：相关功能分散，不便于统一管理

#### 1.3 内容处理模块职责不清
- **问题**：内容处理相关模块职责交叉
- **现状**：
  - `content_adapter.js`：内容适配
  - `artifact_content_router.js`：工件内容路由
  - `binary_detector.js`：二进制检测
  - `capability_router.js`：能力路由
- **影响**：内容处理逻辑分散，职责边界模糊

### 问题 2：模块职责不清晰

#### 2.1 Runtime 类过于庞大
- **问题**：Runtime 类承担过多职责
- **现状**：
  - 虽然已经拆分出 7 个子模块，但 Runtime 主类仍然很大
  - Runtime 类直接管理大量状态（_agents, _conversations, _agentMetaById 等）
  - Runtime 类包含大量辅助方法
- **影响**：Runtime 类代码量大，难以理解和维护

#### 2.2 模块边界不清晰
- **问题**：部分模块的职责边界不够清晰
- **现状**：
  - `prompt_loader.js`：只负责加载提示词，功能单一
  - `logger.js`：包含日志系统和日志配置，职责混合
  - `http_server.js` 和 `http_client.js`：HTTP 相关功能分散
- **影响**：模块职责不够聚焦，难以独立理解

### 问题 3：高耦合

#### 3.1 Runtime 与子模块的耦合
- **问题**：Runtime 子模块与 Runtime 主类高度耦合
- **现状**：
  - 子模块通过 `this.runtime` 访问 Runtime 的所有状态和方法
  - 子模块直接修改 Runtime 的内部状态
  - 缺乏明确的接口抽象
- **影响**：子模块难以独立测试，修改 Runtime 影响范围大

#### 3.2 模块间的直接依赖
- **问题**：部分模块间存在直接依赖
- **现状**：
  - LlmClient 直接依赖 ConcurrencyController
  - ArtifactStore 直接依赖 BinaryDetector
  - WorkspaceManager 直接依赖文件系统操作
- **影响**：模块间耦合度高，难以替换实现

### 问题 4：低内聚

#### 4.1 辅助功能分散
- **问题**：辅助功能分散在多个文件中
- **现状**：
  - 消息相关：message_formatter, message_validator, task_brief
  - 内容处理：content_adapter, artifact_content_router, binary_detector, capability_router
  - 配置相关：config, config_service
- **影响**：相关功能分散，不便于统一管理和复用

#### 4.2 工具相关功能分散
- **问题**：工具相关功能分散
- **现状**：
  - ToolExecutor 定义和执行工具
  - ToolGroupManager 管理工具组
  - ModuleLoader 加载模块工具
- **影响**：工具相关逻辑分散，难以统一管理

### 问题 5：目录结构不够清晰

#### 5.1 平铺式结构
- **问题**：src/platform 目录下文件过多（27 个文件 + 1 个子目录）
- **现状**：所有模块平铺在同一目录下
- **影响**：难以快速定位相关模块，缺乏层次感

#### 5.2 缺乏功能域分组
- **问题**：没有按功能域组织目录
- **现状**：
  - 核心模块、辅助模块、工具模块混在一起
  - 缺乏明确的分组标准
- **影响**：难以理解系统的整体结构

## 重构方案

### 目录结构优化

#### 新的目录结构

```
src/platform/
├── core/                    # 核心模块
│   ├── agent_society.js     # 系统入口
│   ├── runtime.js           # 运行时核心
│   ├── message_bus.js       # 消息总线
│   └── org_primitives.js    # 组织原语
│
├── services/                # 服务模块
│   ├── artifact/            # 工件服务
│   │   ├── artifact_store.js
│   │   ├── binary_detector.js
│   │   └── content_router.js
│   ├── llm/                 # LLM 服务
│   │   ├── llm_client.js
│   │   ├── llm_service_registry.js
│   │   ├── model_selector.js
│   │   └── concurrency_controller.js
│   ├── conversation/        # 会话服务
│   │   └── conversation_manager.js
│   ├── workspace/           # 工作空间服务
│   │   ├── workspace_manager.js
│   │   └── command_executor.js
│   ├── http/                # HTTP 服务
│   │   ├── http_server.js
│   │   └── http_client.js
│   └── contact/             # 联系人服务
│       └── contact_manager.js
│
├── runtime/                 # Runtime 子模块
│   ├── agent_manager.js
│   ├── message_processor.js
│   ├── tool_executor.js
│   ├── llm_handler.js
│   ├── context_builder.js
│   ├── javascript_executor.js
│   ├── browser_javascript_executor.js
│   └── shutdown_manager.js
│
├── utils/                   # 工具模块
│   ├── message/             # 消息工具
│   │   ├── message_formatter.js
│   │   ├── message_validator.js
│   │   └── task_brief.js
│   ├── content/             # 内容工具
│   │   ├── content_adapter.js
│   │   └── capability_router.js
│   ├── config/              # 配置工具
│   │   ├── config_loader.js
│   │   └── config_service.js
│   └── logger/              # 日志工具
│       └── logger.js
│
├── extensions/              # 扩展模块
│   ├── module_loader.js
│   └── tool_group_manager.js
│
└── index.js                 # 统一导出
```

#### 目录说明文档

每个目录需要创建对应的 `[目录名].md` 文件，描述该目录的作用和包含的文件。

### 模块职责重新划分

#### 1. 核心模块（core/）

**职责**：系统的核心功能，不可替换

- **agent_society.js**：系统入口，用户接口
- **runtime.js**：运行时核心，协调各个子系统
- **message_bus.js**：消息总线，智能体间通信
- **org_primitives.js**：组织原语，持久化存储

#### 2. 服务模块（services/）

**职责**：提供独立的服务功能，可以独立测试和替换

##### 2.1 工件服务（services/artifact/）
- **artifact_store.js**：工件存储和检索
- **binary_detector.js**：二进制文件检测
- **content_router.js**：内容路由（合并 artifact_content_router 和 capability_router）

##### 2.2 LLM 服务（services/llm/）
- **llm_client.js**：LLM 客户端
- **llm_service_registry.js**：LLM 服务注册表
- **model_selector.js**：模型选择器
- **concurrency_controller.js**：并发控制器

##### 2.3 会话服务（services/conversation/）
- **conversation_manager.js**：会话管理器

##### 2.4 工作空间服务（services/workspace/）
- **workspace_manager.js**：工作空间管理器
- **command_executor.js**：命令执行器

##### 2.5 HTTP 服务（services/http/）
- **http_server.js**：HTTP 服务器
- **http_client.js**：HTTP 客户端

##### 2.6 联系人服务（services/contact/）
- **contact_manager.js**：联系人管理器

#### 3. Runtime 子模块（runtime/）

**职责**：Runtime 的功能模块，已经部分重构

- **agent_manager.js**：智能体生命周期管理
- **message_processor.js**：消息调度和处理
- **tool_executor.js**：工具定义和执行
- **llm_handler.js**：LLM 交互处理
- **context_builder.js**：上下文构建
- **javascript_executor.js**：JavaScript 执行
- **browser_javascript_executor.js**：浏览器 JavaScript 执行
- **shutdown_manager.js**：优雅关闭管理

#### 4. 工具模块（utils/）

**职责**：提供辅助功能，可以被多个模块复用

##### 4.1 消息工具（utils/message/）
- **message_formatter.js**：消息格式化
- **message_validator.js**：消息验证
- **task_brief.js**：任务委托书处理

##### 4.2 内容工具（utils/content/）
- **content_adapter.js**：内容适配
- **capability_router.js**：能力路由（从 services/artifact/content_router.js 中提取通用部分）

##### 4.3 配置工具（utils/config/）
- **config_loader.js**：配置加载（从 config.js 重命名）
- **config_service.js**：配置服务

##### 4.4 日志工具（utils/logger/）
- **logger.js**：日志系统

#### 5. 扩展模块（extensions/）

**职责**：可插拔的扩展功能

- **module_loader.js**：模块加载器
- **tool_group_manager.js**：工具组管理器

### 模块合并和拆分

#### 合并方案

##### 1. 内容路由模块合并
**合并**：`artifact_content_router.js` + `capability_router.js` → `services/artifact/content_router.js`

**理由**：
- 两者都处理内容路由
- 职责高度相关
- 合并后可以统一管理内容路由逻辑

**实现**：
- 保留 artifact_content_router 的核心逻辑
- 将 capability_router 的通用部分提取到 utils/content/
- 工件特定的路由逻辑保留在 services/artifact/content_router.js

##### 2. 配置模块整合
**整合**：`config.js` + `config_service.js` → `utils/config/`

**理由**：
- 配置相关功能应该集中管理
- 避免职责重叠

**实现**：
- `config.js` 重命名为 `config_loader.js`，专注于配置文件加载
- `config_service.js` 保持不变，提供配置服务接口
- 两者放在同一目录下，便于统一管理

#### 拆分方案

##### 1. Runtime 类进一步拆分
**拆分**：将 Runtime 类的部分职责提取到独立模块

**理由**：
- Runtime 类仍然过于庞大
- 部分职责可以独立出来

**实现**：
- 状态管理：提取到 `runtime/state_manager.js`
- 工具上下文构建：已在 `runtime/context_builder.js`
- 错误处理：提取到 `runtime/error_handler.js`

### 降低耦合

#### 1. 依赖注入

**原则**：通过构造函数注入依赖，而不是直接访问全局状态

**示例**：

```javascript
// 修改前：子模块直接访问 Runtime 的所有状态
class AgentManager {
  constructor(runtime) {
    this.runtime = runtime;
  }
  
  async spawnAgent(input) {
    // 直接访问 runtime 的内部状态
    const meta = await this.runtime.org.createAgent(input);
    this.runtime._agents.set(agent.id, agent);
  }
}

// 修改后：通过接口访问必要的服务
class AgentManager {
  constructor(options) {
    this.org = options.org;
    this.agentRegistry = options.agentRegistry;
    this.log = options.log;
  }
  
  async spawnAgent(input) {
    const meta = await this.org.createAgent(input);
    this.agentRegistry.register(agent.id, agent);
  }
}
```

#### 2. 接口抽象

**原则**：定义清晰的接口，隔离实现细节

**示例**：

```javascript
// 定义 AgentRegistry 接口
class AgentRegistry {
  register(agentId, agent) {}
  get(agentId) {}
  has(agentId) {}
  delete(agentId) {}
  list() {}
}

// Runtime 实现该接口
class Runtime {
  constructor() {
    this._agents = new Map();
    this.agentRegistry = {
      register: (id, agent) => this._agents.set(id, agent),
      get: (id) => this._agents.get(id),
      has: (id) => this._agents.has(id),
      delete: (id) => this._agents.delete(id),
      list: () => Array.from(this._agents.values())
    };
  }
}
```

#### 3. 事件驱动

**原则**：使用事件机制解耦模块间的通信

**示例**：

```javascript
// 修改前：直接调用
class LlmClient {
  async chat(input) {
    // 直接调用回调
    if (this._onRetry) {
      this._onRetry(event);
    }
  }
}

// 修改后：使用事件
class LlmClient extends EventEmitter {
  async chat(input) {
    // 发出事件
    this.emit('retry', event);
  }
}
```

### 提高内聚

#### 1. 功能聚合

**原则**：将相关功能集中在同一模块内

**示例**：

```javascript
// 修改前：消息相关功能分散
// message_formatter.js
export function formatMessageForAgent(message) {}

// message_validator.js
export function validateMessageFormat(message) {}

// task_brief.js
export function validateTaskBrief(brief) {}
export function formatTaskBrief(brief) {}

// 修改后：消息相关功能集中
// utils/message/index.js
export class MessageUtils {
  static format(message) {}
  static validate(message) {}
  static formatTaskBrief(brief) {}
  static validateTaskBrief(brief) {}
}
```

#### 2. 模块内部组织

**原则**：模块内部按功能组织，保持清晰的结构

**示例**：

```javascript
// services/artifact/artifact_store.js
export class ArtifactStore {
  // 公共接口
  async putArtifact(artifact) {}
  async getArtifact(ref) {}
  
  // 内部辅助方法（私有）
  async _writeMetadata(id, metadata) {}
  async _detectBinary(buffer, options) {}
  _getExtensionFromMimeType(mimeType, filename) {}
}
```

## 数据模型

### 核心数据结构

#### 1. Agent（智能体）
```typescript
interface Agent {
  id: string;
  roleId: string;
  roleName: string;
  rolePrompt: string;
  behavior: (ctx: AgentContext, message: Message) => Promise<void>;
}
```

#### 2. Role（岗位）
```typescript
interface Role {
  id: string;
  name: string;
  rolePrompt: string;
  createdBy: string;
  toolGroups?: string[];
  llmServiceId?: string;
}
```

#### 3. Message（消息）
```typescript
interface Message {
  id: string;
  to: string;
  from: string;
  payload: any;
  taskId?: string;
  createdAt: string;
  deliverAt?: string;
}
```

#### 4. Artifact（工件）
```typescript
interface Artifact {
  id: string;
  type: string;
  content: any;
  meta?: object;
  messageId?: string;
  createdAt: string;
  isBinary?: boolean;
  mimeType?: string;
}
```

## 错误处理

### 错误处理策略

1. **异常隔离**：智能体消息处理异常不影响其他智能体
2. **错误通知**：向父智能体发送错误通知
3. **日志记录**：完整记录错误堆栈和上下文
4. **优雅降级**：关键服务失败时提供降级方案

### 错误类型

1. **配置错误**：配置文件格式错误、必填项缺失
2. **网络错误**：LLM 服务不可达、HTTP 请求超时
3. **业务错误**：智能体不存在、权限验证失败
4. **系统错误**：文件系统错误、内存不足

## 测试策略

### 测试层次

#### 1. 单元测试
- **目标**：测试单个模块的功能
- **覆盖**：所有公共接口、边界条件、错误处理
- **工具**：使用项目现有的测试框架

#### 2. 集成测试
- **目标**：测试模块间的协作
- **覆盖**：消息流转、工具调用、状态同步
- **场景**：
  - 智能体创建和终止
  - 消息发送和接收
  - 工件存储和检索
  - LLM 调用和重试

#### 3. 端到端测试
- **目标**：测试完整的业务流程
- **覆盖**：从需求提交到任务完成的完整流程
- **场景**：
  - 用户提交需求
  - Root 创建岗位和智能体
  - 智能体协作完成任务
  - 结果返回给用户

### 测试要求

1. **重构前测试**：为所有模块编写测试用例
2. **重构中测试**：每个阶段完成后运行测试
3. **重构后测试**：确保所有测试通过
4. **回归测试**：确保功能保持不变


## 正确性属性

属性是关于系统应该如何行为的形式化陈述，可以跨多个有效执行进行验证。属性作为人类可读规范和机器可验证正确性保证之间的桥梁。

### 属性 1：代码行数限制

*对于任意* 重构后的源代码文件，排除注释和空行后的代码行数不应超过 500 行

**验证：需求 3.2**

### 属性 2：无循环依赖

*对于任意* 两个模块 A 和 B，如果 A 依赖 B，则 B 不应直接或间接依赖 A

**验证：需求 3.3, 6.3**

### 属性 3：目录层级限制

*对于任意* src/platform 下的文件路径，从 src/platform 到文件的目录层级不应超过 3 层

**验证：需求 4.3**

### 属性 4：目录说明文档完整性

*对于任意* src/platform 下的目录，应该存在对应的 [目录名].md 说明文档

**验证：需求 4.2, 12.2**

### 属性 5：API 接口向后兼容

*对于任意* 重构前导出的公共接口，重构后应该保持相同的函数签名和导出路径（或提供兼容性导出）

**验证：需求 8.1, 9.1**

### 属性 6：测试套件通过

*对于任意* 重构阶段，完成后运行现有测试套件应该全部通过

**验证：需求 8.4, 10.2, 11.5**

### 属性 7：系统行为一致性

*对于任意* 关键业务流程（需求提交、智能体创建、消息传递、工件存储），重构前后的系统行为应该完全一致

**验证：需求 8.5**

### 属性 8：模块路径兼容性

*对于任意* 发生路径变更的模块，旧路径应该仍然可以通过兼容性导出进行导入

**验证：需求 9.2**

### 属性 9：函数别名兼容性

*对于任意* 发生名称变更的函数，旧函数名应该仍然可以通过别名导出进行调用

**验证：需求 9.3**

### 属性 10：测试文件覆盖

*对于任意* 重构后的源代码模块，应该存在对应的测试文件

**验证：需求 11.1**

### 属性 11：公共接口测试覆盖

*对于任意* 模块的公共接口（导出的函数、类、方法），应该有对应的测试用例

**验证：需求 11.2**

### 属性 12：测试覆盖率达标

*对于任意* 重构后的代码库，测试覆盖率应该达到设定的阈值（建议 ≥ 80%）

**验证：需求 11.3**

## 迁移计划

### 阶段划分

重构分为 5 个独立阶段，每个阶段完成后系统可正常运行。

#### 阶段 1：测试基础建设（1-2 周）

**目标**：为现有代码建立完整的测试覆盖

**任务**：
1. 为核心模块编写单元测试
2. 为关键业务流程编写集成测试
3. 建立测试基准（记录重构前的测试结果）
4. 设置 CI/CD 流程

**验收标准**：
- 测试覆盖率达到 80% 以上
- 所有测试通过
- CI/CD 流程正常运行

**风险**：
- 测试编写工作量大
- 可能发现现有代码的 bug

**应对措施**：
- 优先测试核心功能
- 发现的 bug 单独记录，不在重构中修复

#### 阶段 2：目录结构调整（1 周）

**目标**：按照新的目录结构组织代码

**任务**：
1. 创建新的目录结构
2. 移动文件到新目录
3. 更新导入路径
4. 创建目录说明文档
5. 提供兼容性导出

**验收标准**：
- 新目录结构符合设计
- 所有测试通过
- 旧导入路径仍然可用

**风险**：
- 导入路径更新遗漏
- 破坏现有功能

**应对措施**：
- 使用自动化工具更新导入路径
- 保留兼容性导出
- 每次移动后运行测试

#### 阶段 3：模块合并和拆分（2-3 周）

**目标**：合并冗余模块，拆分过大模块

**任务**：
1. 合并配置模块（config.js + config_service.js）
2. 合并内容路由模块（artifact_content_router + capability_router）
3. 合并消息工具模块（message_formatter + message_validator + task_brief）
4. 拆分 Runtime 类（提取状态管理、错误处理）
5. 更新测试

**验收标准**：
- 模块职责清晰
- 代码行数符合限制
- 所有测试通过
- 提供兼容性导出

**风险**：
- 模块合并可能引入新的耦合
- 模块拆分可能破坏现有逻辑

**应对措施**：
- 保持公共接口不变
- 逐个模块进行，每次完成后测试
- 提供兼容性导出

#### 阶段 4：降低耦合（2-3 周）

**目标**：通过依赖注入和接口抽象降低模块间耦合

**任务**：
1. 为 Runtime 子模块实现依赖注入
2. 定义清晰的接口抽象
3. 使用事件机制解耦模块通信
4. 更新测试

**验收标准**：
- 无循环依赖
- 模块可以独立测试
- 所有测试通过

**风险**：
- 接口设计不合理
- 依赖注入增加复杂度

**应对措施**：
- 参考现有代码的使用模式设计接口
- 保持接口简单
- 逐步重构，不一次性改动过大

#### 阶段 5：文档和清理（1 周）

**目标**：完善文档，清理临时代码

**任务**：
1. 更新架构文档
2. 编写迁移指南
3. 清理兼容性代码（可选）
4. 生成依赖关系图
5. 编写重构总结

**验收标准**：
- 所有文档完整
- 所有测试通过
- 代码整洁

**风险**：
- 文档不完整
- 清理兼容性代码可能破坏向后兼容

**应对措施**：
- 文档审阅
- 保留兼容性代码至少一个大版本

### 回滚方案

每个阶段都使用 Git 分支进行开发，完成后合并到主分支。如果发现问题，可以：

1. **立即回滚**：恢复到上一个稳定版本
2. **修复后继续**：在分支上修复问题后重新合并
3. **暂停重构**：暂停当前阶段，评估风险后决定是否继续

### 进度监控

使用以下指标监控重构进度：

1. **测试通过率**：所有测试应该持续通过
2. **代码覆盖率**：应该保持或提高
3. **模块数量**：应该减少（合并冗余模块）
4. **代码行数**：应该符合限制
5. **循环依赖数量**：应该为 0

## 风险评估

### 高风险项

#### 1. Runtime 类重构
- **风险**：Runtime 是系统核心，修改可能影响所有功能
- **影响**：系统无法启动或运行异常
- **应对**：
  - 保持公共接口不变
  - 逐步重构，每次改动小
  - 充分测试

#### 2. 模块路径变更
- **风险**：导入路径更新遗漏导致运行时错误
- **影响**：系统无法启动
- **应对**：
  - 使用自动化工具更新导入路径
  - 提供兼容性导出
  - 运行测试验证

#### 3. 测试覆盖不足
- **风险**：重构引入的 bug 无法被测试发现
- **影响**：功能异常但未被发现
- **应对**：
  - 重构前建立完整测试覆盖
  - 重构后增加测试用例
  - 进行手工测试

### 中风险项

#### 1. 模块合并
- **风险**：合并后的模块职责不清晰
- **影响**：代码难以维护
- **应对**：
  - 明确合并后的模块职责
  - 保持模块内部组织清晰
  - 代码审阅

#### 2. 依赖注入
- **风险**：接口设计不合理增加复杂度
- **影响**：代码难以理解
- **应对**：
  - 参考现有使用模式
  - 保持接口简单
  - 代码审阅

### 低风险项

#### 1. 目录结构调整
- **风险**：目录结构不合理
- **影响**：代码组织不清晰
- **应对**：
  - 参考业界最佳实践
  - 团队讨论确定
  - 可以后续调整

#### 2. 文档更新
- **风险**：文档不完整或不准确
- **影响**：开发者难以理解系统
- **应对**：
  - 文档审阅
  - 持续更新

## 总结

本设计文档描述了 Agent Society 项目的代码重构方案，包括：

1. **现有系统分析**：梳理了系统架构、核心模块、业务流程和依赖关系
2. **问题识别**：识别了职责重叠、模块职责不清、高耦合、低内聚、目录结构不清晰等问题
3. **重构方案**：提出了目录结构优化、模块职责重新划分、模块合并拆分、降低耦合、提高内聚的方案
4. **正确性属性**：定义了 12 个可验证的正确性属性
5. **迁移计划**：制定了 5 个阶段的渐进式重构计划
6. **风险评估**：识别了高、中、低风险项并制定了应对措施

重构遵循以下原则：
- 功能保持不变
- 向后兼容
- 渐进式重构
- 测试覆盖
- 遵循项目规范

通过本次重构，将实现：
- 代码结构清晰，易于理解和维护
- 模块职责明确，高内聚低耦合
- 目录组织合理，便于快速定位
- 测试覆盖完整，保证代码质量
