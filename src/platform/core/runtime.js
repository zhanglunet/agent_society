import path from "node:path";
import { Config } from "../utils/config/config.js";
import { MessageBus } from "./message_bus.js";
import { OrgPrimitives } from "./org_primitives.js";
import { PromptLoader } from "../prompt_loader.js";
import { LlmClient } from "../services/llm/llm_client.js";
import { Logger, createNoopModuleLogger, normalizeLoggingConfig } from "../utils/logger/logger.js";
import { ConversationManager } from "../services/conversation/conversation_manager.js";
import { HttpClient } from "../services/http/http_client.js";
import { WorkspaceManager } from "../services/workspace/workspace_manager.js";
import { ContactManager } from "../services/contact/contact_manager.js";
import { ModuleLoader } from "../extensions/module_loader.js";
import { LlmServiceRegistry } from "../services/llm/llm_service_registry.js";
import { ModelSelector } from "../services/llm/model_selector.js";
import { ToolGroupManager } from "../extensions/tool_group_manager.js";
import { ContentAdapter } from "../utils/content/content_adapter.js";
import { ContentRouter } from "../utils/content/content_router.js";

import { OrgTemplateRepository } from "../services/org_templates/org_template_repository.js";
import { UiCommandBroker } from "../services/ui/ui_command_broker.js";

// 导入子模块
import { JavaScriptExecutor } from "../runtime/javascript_executor.js";
import { BrowserJavaScriptExecutor } from "../runtime/browser_javascript_executor.js";
import { ContextBuilder } from "../runtime/context_builder.js";
import { AgentManager } from "../runtime/agent_manager.js";
import { ToolExecutor } from "../runtime/tool_executor.js";
import { ShutdownManager } from "../runtime/shutdown_manager.js";
import { RuntimeState } from "../runtime/runtime_state.js";
import { RuntimeEvents } from "../runtime/runtime_events.js";
import { RuntimeLifecycle } from "../runtime/runtime_lifecycle.js";
import { RuntimeTools } from "../runtime/runtime_tools.js";
import { RuntimeLlm } from "../runtime/runtime_llm.js";
import { AgentCancelManager } from "../runtime/agent_cancel_manager.js";
import { TurnEngine } from "../runtime/turn_engine.js";
import { ComputeScheduler } from "../runtime/compute_scheduler.js";

/**
 * Runtime - 运行时核心协调器
 * 
 * 【职责】
 * Runtime 类作为核心协调器，负责：
 * 1. 系统初始化：加载配置、初始化服务、注册智能体
 * 2. 配置管理：管理系统配置和服务配置
 * 3. 服务初始化：初始化各个平台服务（MessageBus、OrgPrimitives、WorkspaceManager 等）
 * 4. 子模块组合：导入并组合各个功能子模块
 * 5. 统一接口：提供统一的公共 API，委托给子模块实现
 * 
 * 【模块化架构】
 * Runtime 将具体功能委托给以下子模块：
 * - RuntimeState: 状态管理（智能体注册表、运算状态、插话队列等）
 * - RuntimeEvents: 事件系统（工具调用、错误、LLM 重试等事件）
 * - RuntimeLifecycle: 生命周期管理（智能体创建、恢复、注册、查询、中断等）
 * - RuntimeMessaging: 消息处理循环（消息调度、处理、插话、并发控制）
 * - RuntimeTools: 工具管理（工具定义、工具执行、工具组管理、工具权限检查）
 * - RuntimeLlm: LLM 交互管理（LLM 调用、上下文构建、错误处理）
 * - JavaScriptExecutor: JavaScript 代码执行
 * - BrowserJavaScriptExecutor: 浏览器 JavaScript 执行
 * - ContextBuilder: 上下文构建
 * - AgentManager: 智能体生命周期管理
 * - MessageProcessor: 消息调度和处理
 * - ToolExecutor: 工具定义和执行
 * - ShutdownManager: 优雅关闭管理
 * 
 * 【设计原则】
 * - 单一职责：Runtime 只负责协调，不实现具体功能
 * - 低耦合：通过子模块接口进行交互
 * - 高内聚：相关功能集中在对应的子模块中
 * - 向后兼容：保持公共 API 不变
 * 
 * 【需求】
 * Requirements: 3.2, 7.1, 7.2
 */
export class Runtime {
  /**
   * 构造函数 - 初始化 Runtime 核心协调器
   * 
   * 【初始化流程】
   * 1. 保存配置参数
   * 2. 初始化临时日志系统
   * 3. 初始化事件系统模块
   * 4. 初始化状态管理模块
   * 5. 暴露状态属性（向后兼容）
   * 6. 初始化临时服务实例
   * 7. 初始化所有子模块
   * 
   * @param {{config?:object, configService?:Config, maxSteps?:number, configPath?:string, maxToolRounds?:number, idleWarningMs?:number, dataDir?:string}} options
   */
  constructor(options = {}) {
    // ==================== 配置参数 ====================
    this._passedConfig = options.config ?? null; // 外部传入的配置对象
    this._configService = options.configService ?? null; // 外部传入的配置服务
    
    // 如果提供了 configPath，创建 Config 服务
    if (options.configPath && !this._configService) {
      const configDir = path.dirname(options.configPath);
      this._configService = new Config(configDir);
    }
    
    this.maxSteps = options.maxSteps ?? 200;
    this.maxToolRounds = options.maxToolRounds ?? 20000;
    this.maxContextMessages = options.maxContextMessages ?? 50;
    this.idleWarningMs = options.idleWarningMs ?? 300000; // 默认5分钟
    this.dataDir = options.dataDir ?? null; // 自定义数据目录
    this._stopRequested = false;
    this._processingLoopPromise = null;
    
    // ==================== 日志系统（临时） ====================
    // 在 init() 中会重新初始化
    this.loggerRoot = new Logger(normalizeLoggingConfig(null));
    this.log = createNoopModuleLogger();
    
    // ==================== 事件系统模块 ====================
    this._events = new RuntimeEvents({
      logger: this.log
    });
    
    // ==================== 状态管理模块 ====================
    this._state = new RuntimeState({
      logger: this.log,
      onComputeStatusChange: (agentId, status) => this._events.emitComputeStatusChange(agentId, status)
    });
    
    // ==================== 向后兼容：暴露状态属性 ====================
    // 直接暴露状态属性以保持向后兼容
    this._agents = this._state._agents;
    this._agentMetaById = this._state._agentMetaById;
    this._agentComputeStatus = this._state._agentComputeStatus;
    this._activeProcessingAgents = this._state._activeProcessingAgents;
    this._interruptionQueues = this._state._interruptionQueues;
    this._conversations = this._state._conversations;
    this._taskWorkspaces = this._state._taskWorkspaces;
    this._agentTaskBriefs = this._state._agentTaskBriefs;
    this._stateLocks = this._state._stateLocks;
    
    // ==================== 行为注册表 ====================
    this._behaviorRegistry = new Map();
    
    // ==================== ConversationManager ====================
    // 使用 RuntimeState 的 conversations
    this._conversationManager = new ConversationManager({ 
      maxContextMessages: this.maxContextMessages,
      conversations: this._state.getConversations(),
      contextLimit: options.contextLimit ?? null
    });
    
    // ==================== 任务和工作空间映射 ====================
    this._rootTaskAgentByTaskId = new Map();
    this._rootTaskRoleByTaskId = new Map();
    this._rootTaskEntryAgentAnnouncedByTaskId = new Set();
    this._agentLastActivityTime = new Map(); // 跟踪智能体最后活动时间
    this._idleWarningEmitted = new Set(); // 跟踪已发出空闲警告的智能体
    
    // ==================== 临时服务实例 ====================
    // 在 init() 中会重新初始化带 logger
    this.workspaceManager = new WorkspaceManager();
    this.contactManager = new ContactManager();
    this.moduleLoader = new ModuleLoader();
    this.serviceRegistry = null;
    this.modelSelector = null;
    this.capabilityRouter = null;
    this.contentAdapter = null;
    /** @type {Map<string, LlmClient>} */
    this.llmClientPool = new Map();
    this.toolGroupManager = new ToolGroupManager({ registerBuiltins: false });
    
    // ==================== 子模块初始化 ====================
    // 这些子模块封装了 Runtime 的具体功能实现
    /** @type {RuntimeState} 状态管理器 */
    this._stateManager = this._state;
    /** @type {RuntimeEvents} 事件系统 */
    this._eventsManager = this._events;
    /** @type {JavaScriptExecutor} JavaScript 执行器（Node.js 降级模式） */
    this._jsExecutor = new JavaScriptExecutor(this);
    /** @type {BrowserJavaScriptExecutor} 浏览器 JavaScript 执行器 */
    this._browserJsExecutor = new BrowserJavaScriptExecutor(this);
    /** @type {ContextBuilder} 上下文构建器 */
    this._contextBuilder = new ContextBuilder(this);
    /** @type {AgentManager} 智能体管理器 */
    this._agentManager = new AgentManager(this);
    /** @type {RuntimeLifecycle} 生命周期管理器 */
    this._lifecycle = new RuntimeLifecycle(this);
    /** @type {ToolExecutor} 工具执行器 */
    this._toolExecutor = new ToolExecutor(this);
    /** @type {RuntimeTools} 工具管理器 */
    this._tools = new RuntimeTools(this);
    /** @type {RuntimeLlm} LLM 交互管理器 */
    this._llm = new RuntimeLlm(this);
    /** @type {AgentCancelManager} 智能体取消/停止信号管理器 */
    this._cancelManager = new AgentCancelManager({ logger: this.log });
    /** @type {TurnEngine} 回合引擎（协程式） */
    this._turnEngine = new TurnEngine(this);
    /** @type {ComputeScheduler} 协程式计算调度器 */
    this._computeScheduler = new ComputeScheduler(this, this._turnEngine);
    /** @type {ShutdownManager} 关闭管理器 */
    this._shutdownManager = new ShutdownManager(this);
  }

  // ==================== 事件系统接口 ====================
  // 以下方法委托给 RuntimeEvents 子模块处理

  /**
   * 注册工具调用事件监听器
   * 
   * 【委托】委托给 RuntimeEvents 处理
   * 
   * @param {(event: {agentId: string, toolName: string, args: object, result: any, taskId: string|null}) => void} listener
   */
  onToolCall(listener) {
    this._events.onToolCall(listener);
  }

  /**
   * 触发工具调用事件
   * 
   * 【委托】委托给 RuntimeEvents 处理
   * 
   * @param {{agentId: string, toolName: string, args: object, result: any, taskId: string|null}} event
   */
  _emitToolCall(event) {
    this._events.emitToolCall(event);
  }

  /**
   * 注册错误事件监听器
   * 
   * 【委托】委托给 RuntimeEvents 处理
   * 
   * @param {(event: {agentId: string, errorType: string, message: string, timestamp: string, [key: string]: any}) => void} listener
   */
  onError(listener) {
    this._events.onError(listener);
  }

  /**
   * 触发错误事件（用于向前端广播错误）
   * 
   * 【委托】委托给 RuntimeEvents 处理
   * 
   * @param {{agentId: string, errorType: string, message: string, timestamp: string, [key: string]: any}} event
   */
  _emitError(event) {
    this._events.emitError(event);
  }

  /**
   * 注册 LLM 重试事件监听器
   * 
   * 【委托】委托给 RuntimeEvents 处理
   * 
   * @param {(event: {agentId: string, attempt: number, maxRetries: number, delayMs: number, errorMessage: string, timestamp: string}) => void} listener
   */
  onLlmRetry(listener) {
    this._events.onLlmRetry(listener);
  }

  /**
   * 触发 LLM 重试事件
   * 
   * 【委托】委托给 RuntimeEvents 处理
   * 
   * @param {{agentId: string, attempt: number, maxRetries: number, delayMs: number, errorMessage: string, timestamp: string}} event
   */
  _emitLlmRetry(event) {
    this._events.emitLlmRetry(event);
  }

  /**
   * 触发运算状态变更事件
   * 
   * 【委托】委托给 RuntimeEvents 处理
   * 
   * @param {string} agentId - 智能体ID
   * @param {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'} status - 新状态
   */
  _emitComputeStatusChange(agentId, status) {
    this._events.emitComputeStatusChange(agentId, status);
  }

  /**
   * 注册运算状态变更事件监听器
   * 
   * 【委托】委托给 RuntimeEvents 处理
   * 
   * @param {(event: {agentId: string, status: string, timestamp: string}) => void} listener
   */
  onComputeStatusChange(listener) {
    this._events.onComputeStatusChange(listener);
  }

  // ==================== 消息处理接口 ====================
  // 以下方法委托给 RuntimeMessaging 子模块处理

  /**
   * 处理消息中断（当新消息到达正在处理的智能体时）
   * 
   * 【委托】委托给 RuntimeMessaging 处理
   * 【调用者】MessageBus 在检测到活跃处理智能体时调用
   * 
   * @param {string} agentId - 智能体ID
   * @param {object} newMessage - 新到达的消息
   * @returns {void}
   * 
   * Requirements: 1.1, 1.4, 5.1
   */
  handleMessageInterruption(agentId, newMessage) {
    this._state.addInterruption(agentId, newMessage);
    const status = this._state.getAgentComputeStatus(agentId);
    if (status === "waiting_llm") {
      this._cancelManager?.abort(agentId, { reason: "message_interruption" });
      this.llm?.abort(agentId);
    }
  }

  /**
   * 启动常驻异步消息循环（不阻塞调用者）
   * 
   * 【委托】委托给 RuntimeMessaging 处理
   * 
   * @returns {Promise<void>}
   */
  async startProcessing() {
    return await this._computeScheduler.start();
  }

  /**
   * 运行消息循环直到消息耗尽或达到步数上限
   * 
   * 【委托】委托给 RuntimeMessaging 处理
   * 
   * @returns {Promise<void>}
   */
  async run() {
    return await this._computeScheduler.start();
  }

  // ==================== 状态管理接口 ====================
  // 以下方法委托给 RuntimeState 子模块处理

  /**
   * 获取智能体状态锁（用于原子性操作）
   * 
   * 【委托】委托给 RuntimeState 处理
   * 【实现】使用 Promise 队列实现简单的互斥锁机制
   * 
   * @param {string} agentId - 智能体ID
   * @returns {Promise<Function>} 返回释放锁的函数
   */
  async _acquireLock(agentId) {
    return await this._state.acquireLock(agentId);
  }

  /**
   * 释放智能体状态锁
   * 
   * 【委托】委托给 RuntimeState 处理
   * 
   * @param {Function} releaseFn - 释放函数
   */
  _releaseLock(releaseFn) {
    this._state.releaseLock(releaseFn);
  }

  /**
   * 设置智能体的运算状态
   * 
   * 【委托】委托给 RuntimeState 处理
   * 
   * @param {string} agentId - 智能体ID
   * @param {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'} status - 新状态
   */
  setAgentComputeStatus(agentId, status) {
    this._state.setAgentComputeStatus(agentId, status);
  }

  /**
   * 获取智能体的运算状态
   * 
   * 【委托】委托给 RuntimeState 处理
   * 
   * @param {string} agentId - 智能体ID
   * @returns {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'|null}
   */
  getAgentComputeStatus(agentId) {
    return this._state.getAgentComputeStatus(agentId);
  }

  // ==================== 初始化方法 ====================
  // Runtime 核心协调器的主要职责：初始化和配置管理

  /**
   * 初始化平台能力组件
   * 
   * 【初始化流程】
   * 1. 加载配置文件
   * 2. 初始化日志系统
   * 3. 初始化核心服务（MessageBus、OrgPrimitives、PromptLoader、LlmClient）
   * 4. 加载系统提示词
   * 5. 初始化辅助服务（HttpClient、WorkspaceManager、ContactManager）
   * 6. 初始化工具组管理器
   * 7. 初始化模块加载器并加载模块
   * 8. 初始化 LLM 服务注册表和模型选择器
   * 9. 初始化内容适配器和内容路由器
   * 10. 配置对话历史管理
   * 11. 恢复智能体实例
   * 12. 加载对话历史
   * 13. 初始化浏览器 JavaScript 执行器
   * 
   * @returns {Promise<void>}
   */
  async init() {
    // 优先使用外部传入的配置对象，否则使用配置服务加载
    if (!this._passedConfig) {
      if (!this._configService) {
        throw new Error("必须提供 config 对象或 configService 实例");
      }
      this.config = await this._configService.loadApp({ dataDir: this.dataDir });
    } else {
      this.config = this._passedConfig;
    }
    this.maxSteps = this.config.maxSteps ?? this.maxSteps;
    this.maxToolRounds = this.config.maxToolRounds ?? this.maxToolRounds;
    this.idleWarningMs = this.config.idleWarningMs ?? this.idleWarningMs;
    this.loggerRoot = new Logger(normalizeLoggingConfig(this.config.logging));
    this.log = this.loggerRoot.forModule("runtime");

    this.uiCommandBroker = new UiCommandBroker({ logger: this.loggerRoot.forModule("ui") });
    
    // 更新 RuntimeState 的 logger
    this._state.log = this.log;
    
    // 更新 RuntimeEvents 的 logger
    this._events.log = this.log;

    void this.log.info("运行时初始化开始", {
      maxSteps: this.maxSteps,
      maxToolRounds: this.maxToolRounds,
      idleWarningMs: this.idleWarningMs
    });

    this.bus = new MessageBus({ 
      logger: this.loggerRoot.forModule("bus"),
      getAgentStatus: (agentId) => this._state.getAgentComputeStatus(agentId),
      isAgentActivelyProcessing: (agentId) => this._state.isAgentActivelyProcessing(agentId),
      onInterruptionNeeded: (agentId, message) => this.handleMessageInterruption(agentId, message)
    });

    this.prompts = new PromptLoader({ promptsDir: this.config.promptsDir, logger: this.loggerRoot.forModule("prompts") });
    this.org = new OrgPrimitives({ runtimeDir: this.config.runtimeDir, logger: this.loggerRoot.forModule("org") });
    await this.org.loadIfExists();
    this.orgTemplates = new OrgTemplateRepository({ baseDir: path.resolve(process.cwd(), "org"), logger: this.loggerRoot.forModule("org_templates") });
    this.systemBasePrompt = await this.prompts.loadSystemPromptFile("base.txt");
    this.systemComposeTemplate = await this.prompts.loadSystemPromptFile("compose.txt");
    this.systemToolRules = await this.prompts.loadSystemPromptFile("tool_rules.txt");
    // 加载工作空间使用指南（可选，文件不存在时使用空字符串）
    try {
      this.systemWorkspacePrompt = await this.prompts.loadSystemPromptFile("workspace.txt");
    } catch {
      this.systemWorkspacePrompt = "";
      void this.log.debug("工作空间提示词文件不存在，跳过加载");
    }
    this.llm = this.config.llm ? new LlmClient({ 
      ...this.config.llm, 
      logger: this.loggerRoot.forModule("llm"),
      onRetry: (event) => this._emitLlmRetry(event)
    }) : null;
    this.httpClient = new HttpClient({ logger: this.loggerRoot.forModule("http") });
    // 重新初始化 WorkspaceManager 带 logger
    this.workspaceManager = new WorkspaceManager({ 
      workspacesDir: this.config.workspacesDir,
      logger: this.loggerRoot.forModule("workspace") 
    });
    // 重新初始化 ContactManager 带 logger
    this.contactManager = new ContactManager({ logger: this.loggerRoot.forModule("contact") });

    // 初始化工具组管理器（带 logger，注册内置工具组）
    this.toolGroupManager = new ToolGroupManager({ 
      logger: this.loggerRoot.forModule("tool_groups"),
      registerBuiltins: true 
    });
    // 用实际的工具定义更新内置工具组
    this._registerBuiltinToolGroups();

    // 初始化模块加载器并加载配置中启用的模块
    this.moduleLoader = new ModuleLoader({ logger: this.loggerRoot.forModule("modules") });
    // 支持数组格式 (length > 0) 和对象格式 (Object.keys().length > 0)
    const hasModules = this.config.modules && (
      (Array.isArray(this.config.modules) && this.config.modules.length > 0) ||
      (!Array.isArray(this.config.modules) && typeof this.config.modules === "object" && Object.keys(this.config.modules).length > 0)
    );
    if (hasModules) {
      const moduleResult = await this.moduleLoader.loadModules(this.config.modules, this);
      void this.log.info("模块加载完成", {
        loaded: moduleResult.loaded,
        errors: moduleResult.errors.length
      });
    }

    // 初始化 LLM 服务注册表和模型选择器
    // 获取配置目录：优先使用配置服务的目录，否则使用默认目录
    const configDir = this._configService?.configDir ?? "config";
    this.serviceRegistry = new LlmServiceRegistry({
      configDir: configDir,
      logger: this.loggerRoot.forModule("llm_service_registry")
    });
    await this.serviceRegistry.load();
    
    // 加载模型选择提示词模板
    let modelSelectorPrompt = "";
    try {
      modelSelectorPrompt = await this.prompts.loadSystemPromptFile("model_selector.txt");
    } catch {
      void this.log.warn("模型选择提示词模板加载失败，模型选择功能将不可用");
    }
    
    // 初始化模型选择器（仅当有默认 LLM 和提示词模板时）
    if (this.llm && modelSelectorPrompt) {
      this.modelSelector = new ModelSelector({
        llmClient: this.llm,
        serviceRegistry: this.serviceRegistry,
        promptTemplate: modelSelectorPrompt,
        logger: this.loggerRoot.forModule("model_selector")
      });
      void this.log.info("模型选择器初始化完成", {
        hasServices: this.serviceRegistry.hasServices(),
        serviceCount: this.serviceRegistry.getServiceCount()
      });
    } else {
      this.modelSelector = null;
      void this.log.info("模型选择器未初始化", {
        hasLlm: !!this.llm,
        hasPromptTemplate: !!modelSelectorPrompt
      });
    }

    // 初始化内容适配器
    this.contentAdapter = new ContentAdapter({
      serviceRegistry: this.serviceRegistry,
      logger: this.loggerRoot.forModule("content_adapter")
    });

    // 初始化内容路由器
    this.contentRouter = new ContentRouter({
      serviceRegistry: this.serviceRegistry,
      workspaceManager: this.workspaceManager,
      contentAdapter: this.contentAdapter,
      logger: this.loggerRoot.forModule("content_router")
    });
    
    void this.log.info("内容路由器初始化完成");

    // 加载上下文限制配置并更新 ConversationManager
    if (this.config.contextLimit) {
      this._conversationManager.contextLimit = this.config.contextLimit;
      void this.log.info("上下文限制配置已加载", {
        maxTokens: this.config.contextLimit.maxTokens,
        warningThreshold: this.config.contextLimit.warningThreshold,
        criticalThreshold: this.config.contextLimit.criticalThreshold,
        hardLimitThreshold: this.config.contextLimit.hardLimitThreshold
      });
    }

    // 加载上下文状态提示词模板
    const contextPromptTemplates = {};
    try {
      contextPromptTemplates.contextStatus = await this.prompts.loadSystemPromptFile("context_status.txt");
    } catch { /* 使用默认值 */ }
    try {
      contextPromptTemplates.contextExceeded = await this.prompts.loadSystemPromptFile("context_exceeded.txt");
    } catch { /* 使用默认值 */ }
    try {
      contextPromptTemplates.contextCritical = await this.prompts.loadSystemPromptFile("context_critical.txt");
    } catch { /* 使用默认值 */ }
    try {
      contextPromptTemplates.contextWarning = await this.prompts.loadSystemPromptFile("context_warning.txt");
    } catch { /* 使用默认值 */ }
    
    if (Object.keys(contextPromptTemplates).length > 0) {
      this._conversationManager.setPromptTemplates(contextPromptTemplates);
      void this.log.debug("上下文状态提示词模板已加载", {
        templates: Object.keys(contextPromptTemplates)
      });
    }

    // 配置对话历史持久化目录
    const conversationsDir = path.join(this.config.runtimeDir, "conversations");
    this._conversationManager.setConversationsDir(conversationsDir);
    this._conversationManager.setLogger(this.loggerRoot.forModule("conversation"));

    // 从持久化的组织状态恢复智能体实例
    await this._restoreAgentsFromOrg();

    // 加载持久化的对话历史
    const convResult = await this._conversationManager.loadAllConversations();
    if (convResult.loaded > 0) {
      void this.log.info("对话历史加载完成", { 
        loaded: convResult.loaded, 
        errors: convResult.errors.length 
      });
    }

    // 初始化浏览器 JavaScript 执行器
    await this._browserJsExecutor.init();

    void this.log.info("运行时初始化完成", {
      agents: this._agents.size,
      browserJsExecutorAvailable: this._browserJsExecutor.isBrowserAvailable()
    });
  }

  /**
   * 从组织状态恢复智能体实例到内存中。
   * 在服务器重启后调用，确保之前创建的智能体能够继续处理消息。
   * @returns {Promise<void>}
   */
  async _restoreAgentsFromOrg() {
    return await this._lifecycle.restoreAgentsFromOrg();
  }

  /**
   * 注册某个岗位名对应的行为工厂。
   * @param {string} roleName
   * @param {(ctx: any) => Function} behaviorFactory
   */
  registerRoleBehavior(roleName, behaviorFactory) {
    this._lifecycle.registerRoleBehavior(roleName, behaviorFactory);
  }

  /**
   * 向运行时注册一个智能体实例。
   * @param {Agent} agent
   */
  registerAgentInstance(agent) {
    this._lifecycle.registerAgentInstance(agent);
  }

  /**
   * 列出当前运行时已注册的智能体实例（仅用于对外选择/检索）。
   * @returns {{id:string, roleId:string, roleName:string}[]}
   */
  listAgentInstances() {
    return this._lifecycle.listAgentInstances();
  }

  /**
   * 获取指定智能体的状态信息。
   * @param {string} agentId
   * @returns {{id:string, roleId:string, roleName:string, parentAgentId:string|null, status:string, queueDepth:number, conversationLength:number}|null}
   */
  getAgentStatus(agentId) {
    return this._lifecycle.getAgentStatus(agentId);
  }

  /**
   * 获取所有智能体的队列深度。
   * @returns {{agentId:string, queueDepth:number}[]}
   */
  getQueueDepths() {
    return this._lifecycle.getQueueDepths();
  }

  /**
   * 根据岗位创建并注册智能体实例。
   * @param {{roleId:string, parentAgentId?:string}} input
   * @returns {Promise<Agent>}
   */
  async spawnAgent(input) {
    return await this._lifecycle.spawnAgent(input);
  }

  /**
   * 以“调用者智能体”身份创建子级智能体：parentAgentId 由系统自动填充。
   * @param {string} callerAgentId
   * @param {{roleId:string, parentAgentId?:string}} input
   * @returns {Promise<Agent>}
   */
  async spawnAgentAs(callerAgentId, input) {
    return await this._lifecycle.spawnAgentAs(callerAgentId, input);
  }

  /**
   * 通过祖先链查找智能体的工作空间ID。
   * 从当前智能体开始向上查找，直到找到第一个有工作空间的祖先。
   * @param {string} agentId
   * @returns {string|null} 工作空间ID，如果没有则返回 null
   */
  findWorkspaceIdForAgent(agentId) {
    return this._lifecycle.findWorkspaceIdForAgent(agentId);
  }

  /**
   * 中止智能体的 LLM 调用。
   * @param {string} agentId - 智能体ID
   * @returns {{ok: boolean, agentId: string, aborted: boolean}} 中止结果
   */
  abortAgentLlmCall(agentId) {
    return this._lifecycle.abortAgentLlmCall(agentId);
  }

  /**
   * 强制终止指定智能体及其后代（用于 HTTP/管理员侧删除）。
   * @param {string} agentId
   * @param {{deletedBy?:string, reason?:string}} [options]
   * @returns {Promise<{ok:boolean, agentId:string, termination?:any, reason?:string}>}
   */
  async forceTerminateAgent(agentId, options = {}) {
    return await this._lifecycle.forceTerminateAgent(agentId, options);
  }

  /**
   * 启动常驻异步消息循环（不阻塞调用者）。
   * @returns {Promise<void>}
   */
  async startProcessing() {
    return await this._computeScheduler.start();
  }

  /**
   * 运行消息循环直到消息耗尽或达到步数上限。
   * @returns {Promise<void>}
   */
  async run() {
    return await this._computeScheduler.start();
  }

  /**
   * 注册内置工具组的实际工具定义。
   * 在 init() 中调用，用实际的工具定义替换 ToolGroupManager 中的占位符。
   * @private
   */
  _registerBuiltinToolGroups() {
    this._tools.registerBuiltinToolGroups();
  }

  /**
   * 获取指定智能体可用的工具定义。
   * 根据智能体岗位配置的工具组返回相应的工具定义。
   * @param {string} agentId - 智能体ID
   * @returns {any[]} 工具定义列表
   */
  getToolDefinitionsForAgent(agentId) {
    return this._tools.getToolDefinitionsForAgent(agentId);
  }

  /**
   * 检查工具是否对指定智能体可用。
   * @param {string} agentId - 智能体ID
   * @param {string} toolName - 工具名称
   * @returns {boolean}
   */
  isToolAvailableForAgent(agentId, toolName) {
    return this._tools.isToolAvailableForAgent(agentId, toolName);
  }

  /**
   * 返回可供 LLM 工具调用的工具定义（OpenAI tools schema）。
   * @returns {any[]}
   */
  /**
   * 生成工具组可选值的描述文本。
   * 从 toolGroupManager 动态获取所有已注册的工具组。
   * @returns {string}
   */
  _generateToolGroupsDescription() {
    return this._tools.generateToolGroupsDescription();
  }

  getToolDefinitions() {
    return this._tools.getToolDefinitions();
  }

  /**
   * 执行一次工具调用并返回可序列化结果。
   * 
   * 本方法将工具执行委托给 ToolExecutor 子模块，避免代码重复。
   * 
   * @param {any} ctx - 智能体上下文
  }

  /**
   * 执行一次工具调用并返回可序列化结果。
   * 
   * 本方法将工具执行委托给 ToolExecutor 子模块，避免代码重复。
   * 
   * @param {any} ctx - 智能体上下文
   * @param {string} toolName - 工具名称
   * @param {any} args - 工具参数
   * @returns {Promise<any>} 执行结果
   */
  async executeToolCall(ctx, toolName, args) {
    return await this._tools.executeToolCall(ctx, toolName, args);
  }

  /**
   * 使用 LLM 处理一条消息，并通过工具调用驱动平台动作。
   * @param {any} ctx
   * @param {any} message
   * @returns {Promise<void>}
   */
  async _handleWithLlm(ctx, message) {
    // 委托给 RuntimeLlm 处理
    return await this._llm.handleWithLlm(ctx, message);
  }

  /**
   * 向父智能体发送错误通知的统一方法，同时触发全局错误事件。
   * @param {string} agentId - 当前智能体ID
   * @param {any} originalMessage - 原始消息
   * @param {{errorType: string, message: string, [key: string]: any}} errorInfo - 错误信息
   * @returns {Promise<void>}
   * @private
   */
  async _sendErrorNotificationToParent(agentId, originalMessage, errorInfo) {
    // 委托给 RuntimeLlm 处理
    return await this._llm.sendErrorNotificationToParent(agentId, originalMessage, errorInfo);
  }

  /**
   * 生成当前智能体的 system prompt（包含工具调用规则）。
   * @param {any} ctx
   * @returns {string}
   */
  _buildSystemPromptForAgent(ctx) {
    // 委托给 RuntimeLlm 处理
    return this._llm.buildSystemPromptForAgent(ctx);
  }

  /**
   * 将运行时消息格式化为 LLM 可理解的文本输入。
   * @param {any} ctx - 智能体上下文
   * @param {any} message - 消息对象
   * @returns {Promise<string>}
   */
  async _formatMessageForLlm(ctx, message) {
    // 委托给 RuntimeLlm 处理
    return await this._llm.formatMessageForLlm(ctx, message);
  }

  /**
   * 获取发送者信息（用于消息格式化）
   * @param {string} senderId - 发送者ID
   * @returns {{role: string}|null}
   */
  _getSenderInfo(senderId) {
    // 委托给 RuntimeLlm 处理
    return this._llm.getSenderInfo(senderId);
  }

  /**
   * 获取或确保某个智能体的会话上下文已准备就绪。
   * 
   * 【职责】
   * 将会话上下文的确保逻辑委托给 ConversationManager。
   * 这保证了职责的单一性：ConversationManager 负责存储和历史加载，RuntimeLlm 负责 LLM 交互。
   * 
   * @param {string} agentId - 智能体ID
   * @param {string} systemPrompt - 系统提示词
   * @returns {any[]} 会话消息数组
   */
  _ensureConversation(agentId, systemPrompt) {
    return this._conversationManager.ensureConversation(agentId, systemPrompt);
  }

  /**
   * 构建注入给智能体的运行时上下文。
   * @param {Agent} [agent]
   * @returns {any}
   */
  _buildAgentContext(agent) {
    // 委托给 ContextBuilder 处理
    return this._contextBuilder.buildAgentContext(agent);
  }

  /**
   * 设置智能体的运算状态。
   * @param {string} agentId - 智能体ID
   * @param {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'} status - 新状态
   */
  setAgentComputeStatus(agentId, status) {
    // 委托给 RuntimeState 处理
    this._state.setAgentComputeStatus(agentId, status);
  }

  /**
   * 获取智能体的运算状态。
   * @param {string} agentId - 智能体ID
   * @returns {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'|null}
   */
  getAgentComputeStatus(agentId) {
    // 委托给 RuntimeState 处理
    return this._state.getAgentComputeStatus(agentId);
  }

  /**
   * 获取指定 LLM 服务的客户端实例。
   * 如果服务不存在或未配置，返回 null。
   * @param {string} serviceId - LLM 服务 ID
   * @returns {LlmClient|null} LlmClient 实例，如果服务不存在则返回 null
   */
  getLlmClientForService(serviceId) {
    if (!serviceId || !this.serviceRegistry) {
      return null;
    }

    // 检查池中是否已有该服务的客户端
    if (this.llmClientPool.has(serviceId)) {
      return this.llmClientPool.get(serviceId);
    }

    // 从服务注册表获取服务配置
    const serviceConfig = this.serviceRegistry.getServiceById(serviceId);
    if (!serviceConfig) {
      void this.log.warn("LLM 服务不存在", { serviceId });
      return null;
    }

    // 创建新的 LlmClient 实例
    try {
      const client = new LlmClient({
        baseURL: serviceConfig.baseURL,
        model: serviceConfig.model,
        apiKey: serviceConfig.apiKey,
        maxTokens: serviceConfig.maxTokens,
        maxConcurrentRequests: serviceConfig.maxConcurrentRequests ?? 2,
        logger: this.loggerRoot.forModule(`llm_${serviceId}`),
        onRetry: (event) => this._emitLlmRetry(event)
      });

      // 存入池中
      this.llmClientPool.set(serviceId, client);

      void this.log.info("创建 LlmClient 实例", {
        serviceId,
        serviceName: serviceConfig.name,
        model: serviceConfig.model
      });

      return client;
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err);
      void this.log.error("创建 LlmClient 失败", { serviceId, error: message });
      return null;
    }
  }

  /**
   * 获取智能体应使用的 LlmClient。
   * 根据智能体岗位的 llmServiceId 获取对应的 LlmClient，如果未指定或服务不可用则使用默认 LlmClient。
   * @param {string} agentId - 智能体ID
   * @returns {LlmClient|null} LlmClient 实例
   */
  getLlmClientForAgent(agentId) {
    if (!agentId) {
      return this.llm;
    }

    // 获取智能体的岗位信息
    const agent = this._agents.get(agentId);
    if (!agent) {
      return this.llm;
    }

    const role = this.org.getRole(agent.roleId);
    if (!role || !role.llmServiceId) {
      // 岗位未指定 llmServiceId，使用默认 LlmClient
      return this.llm;
    }

    // 尝试获取指定服务的 LlmClient
    const serviceClient = this.getLlmClientForService(role.llmServiceId);
    if (serviceClient) {
      return serviceClient;
    }

    // 服务不可用，回退到默认 LlmClient
    void this.log.warn("岗位指定的 LLM 服务不可用，使用默认 LlmClient", {
      agentId,
      roleId: agent.roleId,
      llmServiceId: role.llmServiceId
    });
    return this.llm;
  }

  /**
   * 获取智能体使用的 LLM 服务 ID
   * @param {string} agentId - 智能体ID
   * @returns {string|null} LLM 服务 ID，如果使用默认服务则返回 null
   */
  getLlmServiceIdForAgent(agentId) {
    if (!agentId) {
      return null;
    }

    const agent = this._agents.get(agentId);
    if (!agent) {
      return null;
    }

    const role = this.org.getRole(agent.roleId);
    if (!role || !role.llmServiceId) {
      return null;
    }

    // 检查服务是否存在
    if (this.serviceRegistry?.getServiceById?.(role.llmServiceId)) {
      return role.llmServiceId;
    }

    return null;
  }

  /**
   * 重新加载默认 LLM Client。
   * 从配置文件重新读取 LLM 配置并创建新的 LlmClient 实例。
   * @returns {Promise<void>}
   */
  async reloadLlmClient() {
    try {
      // 使用配置服务重新加载配置
      if (!this._configService) {
        throw new Error("配置服务未初始化，无法重新加载");
      }
      
      const newConfig = await this._configService.loadApp({ dataDir: this.dataDir });
      
      if (!newConfig.llm) {
        void this.log.warn("配置文件中没有 LLM 配置");
        return;
      }

      // 创建新的 LlmClient 实例
      const newLlmClient = new LlmClient({
        ...newConfig.llm,
        logger: this.loggerRoot.forModule("llm"),
        onRetry: (event) => this._emitLlmRetry(event)
      });

      // 替换旧的 LlmClient
      this.llm = newLlmClient;
      
      // 更新配置中的 llm 部分
      this.config.llm = newConfig.llm;

      void this.log.info("默认 LLM Client 已重新加载", {
        baseURL: newConfig.llm.baseURL,
        model: newConfig.llm.model
      });
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err);
      void this.log.error("重新加载 LLM Client 失败", { error: message });
      throw err;
    }
  }

  /**
   * 重新加载 LLM 服务注册表。
   * 从配置文件重新读取服务配置并清空客户端池。
   * @returns {Promise<void>}
   */
  async reloadLlmServiceRegistry() {
    try {
      // 清空现有的客户端池
      this.llmClientPool.clear();
      void this.log.info("LLM 客户端池已清空");

      // 重新加载服务注册表
      if (this.serviceRegistry) {
        const result = await this.serviceRegistry.load();
        void this.log.info("LLM 服务注册表已重新加载", {
          loaded: result.loaded,
          serviceCount: result.services.length,
          errors: result.errors.length
        });
      } else {
        void this.log.warn("服务注册表未初始化，跳过重新加载");
      }
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err);
      void this.log.error("重新加载 LLM 服务注册表失败", { error: message });
      throw err;
    }
  }

  /**
   * 获取智能体所属的 taskId。
   * 通过追溯智能体的创建链，找到由 root 创建的入口智能体对应的 taskId。
   * @param {string} agentId
   * @returns {string|null}
   */
  _getAgentTaskId(agentId) {
    // root 和 user 不属于任何 task
    if (agentId === "root" || agentId === "user") {
      return null;
    }
    
    // 查找该智能体是否是某个 task 的入口智能体
    for (const [taskId, agentInfo] of this._rootTaskAgentByTaskId.entries()) {
      if (agentInfo.id === agentId) {
        return taskId;
      }
    }
    
    // 追溯父链，找到入口智能体
    let currentId = agentId;
    const visited = new Set();
    
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      
      // 检查当前智能体是否是某个 task 的入口智能体
      for (const [taskId, agentInfo] of this._rootTaskAgentByTaskId.entries()) {
        if (agentInfo.id === currentId) {
          return taskId;
        }
      }
      
      // 获取父智能体
      const meta = this._agentMetaById.get(currentId);
      if (!meta || !meta.parentAgentId || meta.parentAgentId === "root") {
        break;
      }
      currentId = meta.parentAgentId;
    }
    
    return null;
  }

  /**
   * 获取智能体对应的 taskId（用于工作空间访问）。
   * 这是 _getAgentTaskId 的别名，用于工具执行时查找工作空间。
   * @param {string} agentId
   * @returns {string|null}
   */
  _getTaskIdForAgent(agentId) {
    return this._getAgentTaskId(agentId);
  }

  /**
   * 执行智能体终止操作。
   * @param {any} ctx
   * @param {{agentId:string, reason?:string}} args
   * @returns {Promise<{ok:boolean, terminatedAgentId?:string, error?:string}>}
   */
  async _executeTerminateAgent(ctx, args) {
    const callerId = ctx.agent?.id ?? null;
    const targetId = args?.agentId;

    if (!callerId) {
      return { error: "missing_caller_agent" };
    }

    if (!targetId || typeof targetId !== "string") {
      return { error: "missing_agent_id" };
    }

    // 验证目标智能体是否存在
    if (!this._agents.has(targetId)) {
      void this.log.warn("terminate_agent 目标智能体不存在", { callerId, targetId });
      return { error: "agent_not_found", agentId: targetId };
    }

    // 验证是否为子智能体（只能终止自己创建的子智能体）
    const targetMeta = this._agentMetaById.get(targetId);
    if (!targetMeta || targetMeta.parentAgentId !== callerId) {
      void this.log.warn("terminate_agent 权限验证失败：非子智能体", {
        callerId,
        targetId,
        targetParentAgentId: targetMeta?.parentAgentId ?? null
      });
      return { error: "not_child_agent", message: "只能终止自己创建的子智能体" };
    }

    void this.log.info("开始终止智能体", { callerId, targetId, reason: args.reason ?? null });

    // 收集所有需要终止的智能体（包括级联终止的子智能体）
    const agentsToTerminate = this._collectDescendantAgents(targetId);
    agentsToTerminate.unshift(targetId); // 将目标智能体放在最前面

    // 对所有智能体执行停止操作（中止 LLM 调用、清空队列）
    for (const agentId of agentsToTerminate) {
      // 设置状态为 terminating
      this._state.setAgentComputeStatus(agentId, 'terminating');

      // 统一取消语义：递增 epoch + abort signal（用于丢弃晚到结果）
      this._cancelManager?.abort(agentId, { reason: "terminate_agent" });
      
      // 中止 LLM 调用
      const aborted = this.llm?.abort(agentId) ?? false;
      if (aborted) {
        void this.log.info("终止时中止 LLM 调用", { agentId });
      }
      
      // 清空消息队列
      const clearedMessages = this.bus?.clearQueue(agentId) ?? [];
      const clearedCount = Array.isArray(clearedMessages) ? clearedMessages.length : 0;
      if (clearedCount > 0) {
        void this.log.info("终止时清空消息队列", { agentId, clearedCount });
      }
    }

    // 清理所有智能体的运行时状态（从子到父的顺序）
    for (const agentId of agentsToTerminate.reverse()) {
      // 清理智能体注册
      this._agents.delete(agentId);

      // 清理会话上下文
      this._conversations.delete(agentId);
      
      // 删除持久化的对话历史文件
      void this._conversationManager.deletePersistedConversation(agentId);

      // 清理智能体元数据
      this._agentMetaById.delete(agentId);
      
      this._agentTaskBriefs.delete(agentId);

      // 清理空闲跟踪数据
      this._agentLastActivityTime.delete(agentId);
      this._idleWarningEmitted.delete(agentId);
      
      // 清理运算状态
      this._agentComputeStatus.delete(agentId);

      // 清理取消状态
      this._cancelManager?.clear(agentId);
    }

    // 持久化终止事件到组织状态（会自动处理级联终止）
    await this.org.recordTermination(targetId, callerId, args.reason);

    void this.log.info("智能体终止完成", { callerId, targetId });
    
    // 记录智能体生命周期事件
    void this.loggerRoot.logAgentLifecycleEvent("agent_terminated", {
      agentId: targetId,
      terminatedBy: callerId,
      reason: args.reason ?? null
    });

    return { ok: true, terminatedAgentId: targetId };
  }

  /**
   * 处理智能体队列中的待处理消息（在终止前调用）。
   * @param {string} agentId
   * @returns {Promise<void>}
   */
  async _drainAgentQueue(agentId) {
    const agent = this._agents.get(agentId);
    if (!agent) return;

    let processedCount = 0;
    const maxDrainMessages = 100; // 防止无限循环

    while (processedCount < maxDrainMessages) {
      const msg = this.bus.receiveNext(agentId);
      if (!msg) break;

      processedCount += 1;
      void this.log.debug("终止前处理消息", {
        agentId,
        messageId: msg.id,
        from: msg.from,
        processedCount
      });

      try {
        await agent.onMessage(this._buildAgentContext(agent), msg);
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
        void this.log.error("终止前消息处理失败", { agentId, messageId: msg.id, message });
      }
    }

    if (processedCount > 0) {
      void this.log.info("终止前消息处理完成", { agentId, processedCount });
    }
  }

  /**
   * 收集指定智能体的所有后代智能体 ID（用于级联终止）。
   * @param {string} parentId - 父智能体 ID
   * @returns {string[]} 后代智能体 ID 数组
   */
  _collectDescendantAgents(parentId) {
    const descendants = [];
    
    // 遍历所有智能体，找到直接子智能体
    for (const [agentId, meta] of this._agentMetaById) {
      if (meta.parentAgentId === parentId) {
        descendants.push(agentId);
        // 递归收集孙子智能体
        const grandchildren = this._collectDescendantAgents(agentId);
        descendants.push(...grandchildren);
      }
    }
    
    return descendants;
  }

  /**
   * 级联停止所有子智能体。
   * @param {string} parentAgentId - 父智能体 ID
   * @returns {string[]} 被停止的智能体 ID 列表
   */
  _cascadeStopAgents(parentAgentId) {
    return this._lifecycle.cascadeStopAgents(parentAgentId);
  }

  /**
   * 执行 spawn_agent_with_task：创建智能体并立即发送任务消息。
   * @param {any} ctx
   * @param {{roleId:string, taskBrief:object, initialMessage:object}} args
   * @returns {Promise<{id?:string, roleId?:string, roleName?:string, messageId?:string, error?:string}>}
   */
  async _executeSpawnAgentWithTask(ctx, args) {
    const creatorId = ctx.agent?.id ?? null;
    if (!creatorId) {
      return { error: "missing_creator_agent" };
    }

    // 验证 initialMessage 参数
    if (!args.initialMessage || typeof args.initialMessage !== "object") {
      return { error: "missing_initial_message", message: "initialMessage 是必填参数" };
    }

    // 直接使用底层的 spawnAgentAs 方法创建智能体
    try {
      const agent = await this.spawnAgentAs(creatorId, {
        roleId: args.roleId,
        taskBrief: args.taskBrief
      });

      const newAgentId = agent.id;
      const taskId = ctx.currentMessage?.taskId ?? null;

      // 构建任务消息 payload
      const messagePayload = {
        message_type: args.initialMessage.message_type ?? "task_assignment",
        ...args.initialMessage
      };

      // 发送任务消息给新创建的智能体
      const sendResult = this.bus.send({
        to: newAgentId,
        from: creatorId,
        taskId,
        payload: messagePayload
      });

      void this.log.info("spawn_agent_with_task 完成", {
        creatorId,
        newAgentId,
        roleId: agent.roleId,
        roleName: agent.roleName,
        messageId: sendResult.messageId,
        taskId
      });

      // 记录智能体发送消息的生命周期事件
      void this.loggerRoot.logAgentLifecycleEvent("agent_message_sent", {
        agentId: creatorId,
        messageId: sendResult.messageId,
        to: newAgentId,
        taskId
      });

      return {
        id: newAgentId,
        roleId: agent.roleId,
        roleName: agent.roleName,
        messageId: sendResult.messageId
      };
    } catch (error) {
      void this.log.error("spawn_agent_with_task 失败", {
        creatorId,
        roleId: args.roleId,
        error: error.message
      });
      return { error: "spawn_failed", message: error.message };
    }
  }

  async _runJavaScriptTool(args, messageId = null, agentId = null) {
    // 使用浏览器 JavaScript 执行器
    // 浏览器执行器会自动处理：
    // - 代码验证
    // - 异步代码支持（Promise/await）
    // - Canvas 绘图和导出
    // - 浏览器不可用时降级到 Node.js 执行
    return await this._browserJsExecutor.execute(args, messageId, agentId);
  }

  _detectBlockedJavaScriptTokens(code) {
    // 使用正则匹配完整单词边界，避免误报（如 "required" 匹配 "require"）
    const patterns = [
      { name: "require", regex: /\brequire\s*\(/ },
      { name: "process", regex: /\bprocess\./ },
      { name: "child_process", regex: /\bchild_process\b/ },
      { name: "fs", regex: /\bfs\./ },
      { name: "os", regex: /\bos\./ },
      { name: "net", regex: /\bnet\./ },
      { name: "http", regex: /\bhttp\./ },
      { name: "https", regex: /\bhttps\./ },
      { name: "dgram", regex: /\bdgram\./ },
      { name: "worker_threads", regex: /\bworker_threads\b/ },
      { name: "vm", regex: /\bvm\./ },
      { name: "import()", regex: /\bimport\s*\(/ },
      { name: "Deno", regex: /\bDeno\./ },
      { name: "Bun", regex: /\bBun\./ }
    ];
    const found = [];
    for (const p of patterns) {
      if (p.regex.test(code)) found.push(p.name);
    }
    return found;
  }

  _toJsonSafeValue(value) {
    if (value === undefined) return { value: null };
    try {
      const json = JSON.stringify(value);
      if (json === undefined) return { value: null };
      if (json.length > 200000) return { error: "result_too_large", maxJsonLength: 200000, jsonLength: json.length };
      return { value: JSON.parse(json) };
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      return { error: "non_json_serializable_return", message };
    }
  }

  /**
   * 执行上下文压缩操作。
   * @param {any} ctx
   * @param {{summary:string, keepRecentCount?:number}} args
   * @returns {{ok:boolean, compressed?:boolean, originalCount?:number, newCount?:number, error?:string}}
   */
  _executeCompressContext(ctx, args) {
    const agentId = ctx.agent?.id ?? null;

    if (!agentId) {
      return { ok: false, error: "missing_agent_id" };
    }

    const summary = args?.summary;
    if (!summary || typeof summary !== "string") {
      return { ok: false, error: "invalid_summary" };
    }

    const keepRecentCount = args?.keepRecentCount ?? 10;

    // 获取压缩前的上下文状态
    const beforeStatus = this._conversationManager.getContextStatus(agentId);

    void this.log.info("执行上下文压缩", { 
      agentId, 
      keepRecentCount,
      summaryLength: summary.length,
      beforeUsedTokens: beforeStatus.usedTokens,
      beforeUsagePercent: (beforeStatus.usagePercent * 100).toFixed(1) + '%'
    });

    const result = this._conversationManager.compress(agentId, summary, keepRecentCount);

    if (result.ok && result.compressed) {
      // 压缩后清除 token 使用统计，等待下次 LLM 调用时重新统计
      this._conversationManager.clearTokenUsage(agentId);
      
      void this.log.info("上下文压缩完成", { 
        agentId, 
        originalCount: result.originalCount, 
        newCount: result.newCount,
        tokenUsageCleared: true
      });
    }

    return result;
  }

  /**
   * 检查智能体上下文长度并在超限时发出警告。
   * @param {string} agentId
   * @returns {{warning:boolean, currentCount?:number, maxCount?:number}}
   */
  _checkContextAndWarn(agentId) {
    // 委托给 RuntimeLlm 处理
    return this._llm.checkContextAndWarn(agentId);
  }

  /**
   * 更新智能体的最后活动时间。
   * @param {string} agentId
   */
  _updateAgentActivity(agentId) {
    this._agentLastActivityTime.set(agentId, Date.now());
    // 重置空闲警告状态
    this._idleWarningEmitted.delete(agentId);
  }

  /**
   * 获取智能体的最后活动时间。
   * @param {string} agentId
   * @returns {number|null} 时间戳（毫秒），如果智能体不存在则返回null
   */
  getAgentLastActivityTime(agentId) {
    return this._agentLastActivityTime.get(agentId) ?? null;
  }

  /**
   * 获取智能体的空闲时长（毫秒）。
   * @param {string} agentId
   * @returns {number|null} 空闲时长（毫秒），如果智能体不存在则返回null
   */
  getAgentIdleTime(agentId) {
    const lastActivity = this._agentLastActivityTime.get(agentId);
    if (lastActivity === undefined) {
      return null;
    }
    return Date.now() - lastActivity;
  }

  /**
   * 检查所有智能体的空闲状态，对超过配置时长的智能体发出警告。
   * @returns {{agentId:string, idleTimeMs:number}[]} 空闲超时的智能体列表
   */
  checkIdleAgents() {
    const idleAgents = [];
    const now = Date.now();
    
    for (const agentId of this._agents.keys()) {
      const lastActivity = this._agentLastActivityTime.get(agentId);
      if (lastActivity === undefined) continue;
      
      const idleTimeMs = now - lastActivity;
      if (idleTimeMs > this.idleWarningMs) {
        idleAgents.push({ agentId, idleTimeMs });
        
        // 只在首次超时时发出警告
        if (!this._idleWarningEmitted.has(agentId)) {
          this._idleWarningEmitted.add(agentId);
          void this.log.warn("智能体空闲超时", {
            agentId,
            idleTimeMs,
            idleWarningMs: this.idleWarningMs
          });
        }
      }
    }
    
    return idleAgents;
  }

  /**
   * 设置空闲警告阈值（毫秒）。
   * @param {number} ms
   */
  setIdleWarningMs(ms) {
    this.idleWarningMs = ms;
  }

  /**
   * 设置优雅关闭处理。
   * 监听 SIGINT 和 SIGTERM 信号，执行优雅关闭流程。
   * 第一次 Ctrl+C 触发优雅关闭，第二次 Ctrl+C 强制退出。
   * @param {{httpServer?:any, shutdownTimeoutMs?:number}} [options]
   * @returns {void}
   */
  setupGracefulShutdown(options = {}) {
    if(this._forceExit){
      process.exit(1);
    }
    const httpServer = options.httpServer ?? null;
    const shutdownTimeoutMs = options.shutdownTimeoutMs ?? 30000;

    // 防止重复设置
    if (this._gracefulShutdownSetup) {
      void this.log.warn("优雅关闭已设置，跳过重复设置");
      return;
    }
    this._gracefulShutdownSetup = true;
    this._httpServerRef = httpServer;
    this._shutdownTimeoutMs = shutdownTimeoutMs;
    this._isShuttingDown = false;
    this._forceExit = false;
    this._shutdownStartTime = null;

    const shutdown = async (signal) => {
      // 如果已经在关闭中，第二次信号强制退出
      if (this._isShuttingDown) {
        this._forceExit = true;
        void this.log.warn("收到第二次关闭信号，强制退出", { signal });
        process.stdout.write("\n强制退出...\n");
        process.exit(1);
      }
      this._isShuttingDown = true;
      this._shutdownStartTime = Date.now();
      
      process.stdout.write("\n正在优雅关闭，再按一次 Ctrl+C 强制退出...\n");

      void this.log.info("收到关闭信号，开始优雅关闭", { signal });

      // 步骤1: 停止接收新消息
      this._stopRequested = true;
      void this.log.info("已停止接收新消息");

      // 步骤2: 等待当前处理完成（最多 shutdownTimeoutMs）
      const waitStart = Date.now();
      while (this._processingLoopPromise && Date.now() - waitStart < shutdownTimeoutMs) {
        await new Promise((r) => setTimeout(r, 100));
      }

      const waitDuration = Date.now() - waitStart;
      const timedOut = this._processingLoopPromise !== null;
      if (timedOut) {
        void this.log.warn("等待处理完成超时", { 
          waitDuration, 
          shutdownTimeoutMs 
        });
      } else {
        void this.log.info("当前处理已完成", { waitDuration });
      }

      // 步骤3: 持久化状态
      try {
        await this.org.persist();
        void this.log.info("组织状态持久化完成");
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void this.log.error("组织状态持久化失败", { error: message });
      }

      // 步骤3.5: 持久化所有对话历史
      try {
        await this._conversationManager.flushAll();
        void this.log.info("对话历史持久化完成");
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void this.log.error("对话历史持久化失败", { error: message });
      }

      // 步骤4: 关闭 HTTP 服务器
      if (this._httpServerRef) {
        try {
          await this._httpServerRef.stop();
          void this.log.info("HTTP服务器已关闭");
        } catch (err) {
          const message = err && typeof err.message === "string" ? err.message : String(err);
          void this.log.error("HTTP服务器关闭失败", { error: message });
        }
      }

      // 步骤5: 记录关闭摘要
      const pendingCount = this.bus.getPendingCount();
      const processedAgents = this._agents.size;
      const shutdownDuration = Date.now() - this._shutdownStartTime;

      void this.log.info("关闭完成", {
        signal,
        shutdownDuration,
        pendingMessages: pendingCount,
        activeAgents: processedAgents,
        timedOut
      });

      // 退出进程
      process.exit(0);
    };

    // 注册信号处理器
    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    void this.log.info("优雅关闭处理已设置", { shutdownTimeoutMs });
  }

  /**
   * 检查是否正在关闭中。
   * @returns {boolean}
   */
  isShuttingDown() {
    return this._isShuttingDown ?? false;
  }

  /**
   * 获取关闭状态信息。
   * @returns {{isShuttingDown:boolean, shutdownStartTime:number|null, shutdownTimeoutMs:number|null}}
   */
  getShutdownStatus() {
    return {
      isShuttingDown: this._isShuttingDown ?? false,
      shutdownStartTime: this._shutdownStartTime ?? null,
      shutdownTimeoutMs: this._shutdownTimeoutMs ?? null
    };
  }

  /**
   * 手动触发优雅关闭（用于测试或程序化关闭）。
   * @param {{signal?:string}} [options]
   * @returns {Promise<{ok:boolean, pendingMessages:number, activeAgents:number, shutdownDuration:number}>}
   */
  async shutdown(options = {}) {
    const signal = options.signal ?? "MANUAL";
    const shutdownTimeoutMs = this._shutdownTimeoutMs ?? 30000;

    // 防止重复触发
    if (this._isShuttingDown) {
      void this.log.info("关闭已在进行中", { signal });
      return { 
        ok: false, 
        pendingMessages: this.bus.getPendingCount(), 
        activeAgents: this._agents.size,
        shutdownDuration: 0
      };
    }
    this._isShuttingDown = true;
    this._shutdownStartTime = Date.now();

    void this.log.info("开始手动优雅关闭", { signal });

    // 步骤1: 停止接收新消息
    this._stopRequested = true;
    void this.log.info("已停止接收新消息");

    // 步骤2: 等待当前处理完成（最多 shutdownTimeoutMs）
    const waitStart = Date.now();
    while (this._processingLoopPromise && Date.now() - waitStart < shutdownTimeoutMs) {
      await new Promise((r) => setTimeout(r, 100));
    }

    const waitDuration = Date.now() - waitStart;
    const timedOut = this._processingLoopPromise !== null;
    if (timedOut) {
      void this.log.warn("等待处理完成超时", { waitDuration, shutdownTimeoutMs });
    } else {
      void this.log.info("当前处理已完成", { waitDuration });
    }

    // 步骤3: 持久化状态
    try {
      await this.org.persist();
      void this.log.info("组织状态持久化完成");
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err);
      void this.log.error("组织状态持久化失败", { error: message });
    }

    // 步骤3.5: 持久化所有对话历史
    try {
      await this._conversationManager.flushAll();
      void this.log.info("对话历史持久化完成");
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err);
      void this.log.error("对话历史持久化失败", { error: message });
    }

    // 步骤4: 关闭 HTTP 服务器
    if (this._httpServerRef) {
      try {
        await this._httpServerRef.stop();
        void this.log.info("HTTP服务器已关闭");
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void this.log.error("HTTP服务器关闭失败", { error: message });
      }
    }

    // 步骤4.5: 关闭浏览器 JavaScript 执行器
    if (this._browserJsExecutor) {
      try {
        await this._browserJsExecutor.shutdown();
        void this.log.info("浏览器 JavaScript 执行器已关闭");
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void this.log.error("浏览器 JavaScript 执行器关闭失败", { error: message });
      }
    }

    // 步骤5: 记录关闭摘要
    const pendingCount = this.bus.getPendingCount();
    const processedAgents = this._agents.size;
    const shutdownDuration = Date.now() - this._shutdownStartTime;

    void this.log.info("关闭完成", {
      signal,
      shutdownDuration,
      pendingMessages: pendingCount,
      activeAgents: processedAgents,
      timedOut
    });

    return {
      ok: true,
      pendingMessages: pendingCount,
      activeAgents: processedAgents,
      shutdownDuration
    };
  }
}
