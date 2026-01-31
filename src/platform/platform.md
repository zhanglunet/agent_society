# platform

## 综述
该目录包含 29 个文件与 5 个子目录，直接文件类型以 .js、.md 为主。

本目录提供智能体平台的主要实现与集成，包括：
- 面向外部的 HTTP 接口（REST API、静态资源与文件服务）。
- 与大模型服务交互的客户端、服务注册表与模型选择逻辑。
- 工作区（workspace）管理、元数据维护、多模态内容路由，用于将工作区文件转换为模型可处理的格式。
- 运行时配套的工作空间文件操作能力。
- 消息格式化、消息类型校验、任务委托书（TaskBrief）结构化数据。
- 可插拔模块加载与工具组管理，用于扩展工具能力。

子目录中，core/ 与 runtime/ 包含核心实现代码；services/、utils/、extensions/ 当前以说明文档为主，用于对本目录内的实现文件做功能分组说明。

## 文件列表
- agent_society.js: 功能：提供 AgentSociety 的向后兼容导出。责任：兼容旧的 import 路径，避免上层调用方迁移时中断。内部结构：导出 AgentSociety（从 core/agent_society.js 重新导出），并标记为 deprecated。
- content_router.js: 功能：根据内容类型与模型能力，将内容路由为 text、image_url 或 file 形态。责任：在消息组装阶段将附件转换为模型可接收的数据结构，无法处理时提供文本描述回退。内部结构：导出 ContentRouter；包含 ContentRouteResult 与 BinaryTypeResult 类型定义；提供二进制类型判定与能力检查相关方法。
- workspace_manager.js: 功能：工作区管理。责任：绑定/分配工作空间目录，进行懒加载创建，并提供文件读写、目录列举等操作时的路径安全约束基础。内部结构：导出 WorkspaceManager；内部维护 _workspaces 映射；主要方法包括 getWorkspace、writeFile、deleteFile、listFiles、hasWorkspace。
- workspace.js: 功能：工作区实例。责任：提供具体工作区的文件操作、元数据持久化、MIME 类型检测等功能。内部结构：导出 Workspace 类。
- binary_detector.js: 功能：二进制检测。责任：基于 MIME、扩展名、内容特征进行多层检测，并对结果做缓存与统计。内部结构：导出 BinaryDetector；公开方法 detectBinary；包含内部缓存、超时保护与若干分类表（MIME_CLASSIFICATIONS、EXTENSION_CLASSIFICATIONS）。
- capability_router.js: 功能：按模型输入能力路由消息内容。责任：当消息包含附件时，区分可直接传递给模型的内容与需要转为文本描述的内容，并返回可用于 LLM 调用的 processedContent。内部结构：导出 CapabilityRouter；主要方法包括 routeContent、getRequiredCapabilities、checkCapabilitySupport；依赖 message_formatter.js（formatMultimodalContent、isTextFile）。
- concurrency_controller.js: 功能：LLM 请求并发控制。责任：限制并发数量，并对同一智能体的请求做互斥约束；提供取消活跃/排队请求的能力。内部结构：导出 RequestInfo、ConcurrencyStats、ConcurrencyController；主要方法 executeRequest、cancelRequest；内部维护 activeRequests 与 requestQueue。
- config.js: 功能：读取并解析平台配置。责任：按优先级加载 app.local.json/app.json 与 llmservices.local.json/llmservices.json，并对部分字段做默认值与路径归一化。内部结构：导出 loadConfig；包含内部函数 loadLlmServicesConfig、_loadOptionalJson、_validateMaxConcurrentRequests。
- config_service.js: 功能：配置读写服务。责任：读取/保存 app.local.json 与 llmservices.local.json，提供 API key 掩码与 LLM 服务条目增删改等操作。内部结构：导出 ConfigService；包含 hasLocalConfig、getLlmConfig、saveLlmConfig、getLlmServices、addLlmService、updateLlmService 等方法。
- contact_manager.js: 功能：联系人注册表管理。责任：维护智能体的联系人注册表数据，并提供初始化、查询、添加与持久化恢复等能力。内部结构：导出 ContactManager；主要方法包括 initRegistry、isContactKnown、addContact、listContacts、getAllRegistries、loadFromData；保留 canSendMessage 作为兼容方法。
- content_adapter.js: 功能：将不支持的附件转换为文本描述。责任：为不具备对应能力的模型提供回退文本，并在有 agentRegistry 时给出可处理该类型的智能体建议。内部结构：导出 ContentAdapter；导出辅助函数 formatFileSize 与若干映射常量；主要方法包括 adaptToText、adaptMultiple、findCapableAgents。
- conversation_manager.js: 功能：会话上下文与对话历史管理。责任：维护智能体对话消息列表、token 使用统计与上下文限制；支持磁盘持久化与防抖保存。内部结构：导出 ConversationManager；包含持久化目录配置、loadAllConversations、persistConversation、persistConversationNow 等方法。
- http_client.js: 功能：为智能体提供 HTTPS 请求能力。责任：限制仅允许 https 协议；记录请求/响应摘要与详细日志；支持超时控制与响应体截断。内部结构：导出 HttpClient 与 createHttpClient；主要方法 request；内部包含 _validateUrl、_truncateForLog、_logRequest。
- http_server.js: 功能：HTTP 服务器与 REST API。责任：提供与 AgentSociety/Runtime 交互的 API（提交需求、发送消息、查询消息/组织/岗位/工具组、配置读写、工作区访问、模块信息等），并提供静态资源与文件服务。内部结构：导出 HTTPServer；公开方法包括 start、stop、setRuntimeDir、setWorkspacesDir、setConfigService、setLlmStatus；内部维护按 taskId/agentId/messageId 的消息索引、自定义名称存储与最近错误/重试事件队列。
- llm_client.js: 功能：最小 LLM 客户端。责任：通过 OpenAI SDK 调用 OpenAI 兼容接口，支持重试、并发控制、按 agentId 中断请求与调用指标记录。内部结构：导出 LlmClient；主要方法 chat；内部包含 _chatWithRetry、_executeChatRequest（含 legacy 路径）；依赖 ConcurrencyController。
- llm_service_registry.js: 功能：LLM 服务注册表。责任：从 llmservices.local.json/llmservices.json 加载并验证服务条目与 capabilities；提供服务与能力信息查询。内部结构：导出 LlmServiceRegistry；包含内部校验函数 validateCapabilities 与 validateServiceConfig；内部维护 _services Map。
- logger.js: 功能：日志系统。责任：按模块日志级别输出日志到控制台与文件，并提供结构化日志与生命周期事件记录。内部结构：导出 formatLocalTime、Logger、ModuleLogger；Logger 提供 forModule、write、writeStructured、logAgentLifecycleEvent、logLlmMetrics。
- message_bus.js: 功能：提供 MessageBus 的向后兼容导出。责任：兼容旧的 import 路径，避免上层调用方迁移时中断。内部结构：导出 MessageBus（从 core/message_bus.js 重新导出），并标记为 deprecated。
- message_formatter.js: 功能：消息格式化与附件辅助函数。责任：将消息格式化为智能体可读文本；将包含图片的输入转换为多模态内容；提供附件提取与文本文件扩展名判定。内部结构：导出 formatMessageForAgent、formatMultimodalContent、hasImageAttachments、getImageAttachments、hasFileAttachments、getFileAttachments、isTextFile。
- message_validator.js: 功能：消息类型校验。责任：按 message_type 对 payload 结构进行校验，并提供类型枚举与快速判断方法。内部结构：导出 MessageType、VALID_MESSAGE_TYPES、validateMessageFormat、isValidMessageType；内部包含若干类型校验函数（task_assignment、introduction_*、collaboration_*、status_report）。
- model_selector.js: 功能：模型服务选择器。责任：根据岗位提示词与可用服务列表，调用 LLM 给出 serviceId 选择结果与原因，并对结果做解析与校验。内部结构：导出 ModelSelector；主要方法 selectService；内部包含 _buildSelectionPrompt 与 _parseSelectionResult。
- module_loader.js: 功能：可插拔模块加载器。责任：根据配置从 modules 目录动态导入模块，校验模块接口，注册模块工具与工具组映射，并提供模块工具调用入口。内部结构：导出 ModuleLoader；主要方法 loadModules、getToolDefinitions、executeToolCall；内部维护 _modules、_toolNameToModule、_moduleToolGroupIds。
- org_primitives.js: 功能：提供 OrgPrimitives 的向后兼容导出。责任：兼容旧的 import 路径，避免上层调用方迁移时中断。内部结构：导出 OrgPrimitives（从 core/org_primitives.js 重新导出），并标记为 deprecated。
- platform.md: 功能：本目录说明文档。责任：描述目录综述、文件列表与子目录列表。内部结构：包含“综述 / 文件列表 / 子目录列表”。
- prompt_loader.js: 功能：提示词加载与拼接。责任：从 promptsDir 读取预置提示词与模板文件并缓存；按模板占位符装配最终系统提示词。内部结构：导出 PromptLoader；主要方法 loadSystemPromptFile、compose；内部维护 _cache。
- runtime.js: 功能：提供 Runtime 的向后兼容导出。责任：兼容旧的 import 路径，避免上层调用方迁移时中断。内部结构：导出 Runtime（从 core/runtime.js 重新导出），并标记为 deprecated。
- task_brief.js: 功能：TaskBrief 结构与格式化。责任：校验父智能体给子智能体的任务委托书字段完整性，并生成可注入上下文的文本。内部结构：导出 validateTaskBrief、formatTaskBrief；内部维护必填字段列表 REQUIRED_FIELDS。
- tool_group_manager.js: 功能：工具组管理。责任：注册内置工具组与动态工具组，维护工具名到工具组的映射，并按工具组集合返回合并后的工具定义。内部结构：导出 BUILTIN_TOOL_GROUPS、ToolGroupManager；主要方法包括 registerGroup、unregisterGroup、updateGroupTools、getToolDefinitions、listGroups。
- workspace_manager.js: 功能：工作区管理。责任：绑定/分配工作空间目录，进行懒加载创建，并提供文件读写、目录列举等操作时的路径安全约束基础。内部结构：导出 WorkspaceManager；内部维护 _workspaces 映射；主要方法包括 getWorkspace、writeFile、deleteFile、listFiles、hasWorkspace。
- workspace.js: 功能：工作区实例。责任：提供具体工作区的文件操作、元数据持久化、MIME 类型检测等功能。内部结构：导出 Workspace 类。
- content_router.js: 功能：内容路由。责任：根据内容类型与模型能力，将文件内容路由为 text、image_url 或 file 形态。内部结构：导出 ContentRouter。

## 子目录列表
- core: 核心模块包含系统的核心功能，这些模块是系统运行的基础，不可替换。（详见 core/core.md）。
- extensions: 扩展模块提供可插拔的扩展功能，可以动态加载和卸载。（本目录当前为说明文档，详见 extensions/extensions.md）。
- runtime: Runtime 类拆分后的子模块目录，包含智能体生命周期管理、上下文构建、消息处理、工具执行、LLM 交互与优雅关闭等实现。（详见 runtime/runtime.md）。
- services: 服务模块提供独立的服务功能，可以独立测试和替换；按功能域分为 workspace、llm、conversation、http、contact。（本目录当前为说明文档，详见 services/services.md）。
- utils: 工具模块提供辅助功能，可以被多个模块复用；按 message、content、config、logger 分类。（本目录当前为说明文档，详见 utils/utils.md）。
