import path from "node:path";
import { loadConfig } from "./config.js";
import { ArtifactStore } from "./artifact_store.js";
import { MessageBus } from "./message_bus.js";
import { OrgPrimitives } from "./org_primitives.js";
import { PromptLoader } from "./prompt_loader.js";
import { LlmClient } from "./llm_client.js";
import { Logger, createNoopModuleLogger, normalizeLoggingConfig, formatLocalTime } from "./logger.js";
import { Agent } from "../agents/agent.js";
import { ConversationManager } from "./conversation_manager.js";
import { HttpClient } from "./http_client.js";
import { WorkspaceManager } from "./workspace_manager.js";
import { CommandExecutor } from "./command_executor.js";
import { validateTaskBrief, formatTaskBrief } from "./task_brief.js";
import { ContactManager } from "./contact_manager.js";
import { formatMessageForAgent } from "./message_formatter.js";
import { validateMessageFormat } from "./message_validator.js";
import { ModuleLoader } from "./module_loader.js";
import { LlmServiceRegistry } from "./llm_service_registry.js";
import { ModelSelector } from "./model_selector.js";
import { ToolGroupManager } from "./tool_group_manager.js";
import { CapabilityRouter } from "./capability_router.js";
import { ContentAdapter } from "./content_adapter.js";
import { ArtifactContentRouter } from "./artifact_content_router.js";

// 导入子模块
import { JavaScriptExecutor } from "./runtime/javascript_executor.js";
import { BrowserJavaScriptExecutor } from "./runtime/browser_javascript_executor.js";
import { ContextBuilder } from "./runtime/context_builder.js";
import { AgentManager } from "./runtime/agent_manager.js";
import { MessageProcessor } from "./runtime/message_processor.js";
import { ToolExecutor } from "./runtime/tool_executor.js";
import { LlmHandler } from "./runtime/llm_handler.js";
import { ShutdownManager } from "./runtime/shutdown_manager.js";

/**
 * 运行时：将平台能力（org/message/artifact/prompt）与智能体行为连接起来。
 * 
 * 【模块化架构】
 * Runtime 类作为核心协调器，将具体功能委托给以下子模块：
 * - JavaScriptExecutor: JavaScript 代码执行
 * - ContextBuilder: 上下文构建
 * - AgentManager: 智能体生命周期管理
 * - MessageProcessor: 消息调度和处理
 * - ToolExecutor: 工具定义和执行
 * - LlmHandler: LLM 交互处理
 * - ShutdownManager: 优雅关闭管理
 * 
 * 公共 API 保持不变，内部实现委托给子模块。
 */
export class Runtime {
  /**
   * @param {{config?:object, maxSteps?:number, configPath?:string, maxToolRounds?:number, idleWarningMs?:number, dataDir?:string}} options
   */
  constructor(options = {}) {
    this._passedConfig = options.config ?? null; // 外部传入的配置
    this.maxSteps = options.maxSteps ?? 200;
    this.configPath = options.configPath ?? "config/app.json";
    this.maxToolRounds = options.maxToolRounds ?? 200;
    this.maxContextMessages = options.maxContextMessages ?? 50;
    this.idleWarningMs = options.idleWarningMs ?? 300000; // 默认5分钟
    this.dataDir = options.dataDir ?? null; // 自定义数据目录
    this._stopRequested = false;
    this._processingLoopPromise = null;
    this._agents = new Map();
    this._activeProcessingAgents = new Set(); // 正在处理消息的智能体集合（用于并发控制）
    this._interruptionQueues = new Map(); // 插话消息队列：agentId -> Array<Message>（Requirements 1.1, 4.1）
    this._behaviorRegistry = new Map();
    this._conversations = new Map();
    this._conversationManager = new ConversationManager({ 
      maxContextMessages: this.maxContextMessages,
      conversations: this._conversations,
      contextLimit: options.contextLimit ?? null
    });
    this._rootTaskAgentByTaskId = new Map();
    this._rootTaskRoleByTaskId = new Map();
    this._rootTaskEntryAgentAnnouncedByTaskId = new Set();
    this._agentMetaById = new Map();
    this._agentLastActivityTime = new Map(); // 跟踪智能体最后活动时间
    this._idleWarningEmitted = new Set(); // 跟踪已发出空闲警告的智能体
    this._agentComputeStatus = new Map(); // 跟踪智能体运算状态: 'idle' | 'waiting_llm' | 'processing' | 'stopping' | 'stopped' | 'terminating'
    this._stateLocks = new Map(); // 状态锁：agentId -> Promise 队列
    this._taskWorkspaces = new Map(); // 跟踪任务工作空间 taskId -> workspacePath
    this._agentTaskBriefs = new Map(); // 跟踪智能体的 TaskBrief agentId -> TaskBrief
    this.loggerRoot = new Logger(normalizeLoggingConfig(null));
    this.log = createNoopModuleLogger();
    // 初始化 WorkspaceManager 和 CommandExecutor（在 init() 中会重新初始化带 logger）
    this.workspaceManager = new WorkspaceManager();
    this.commandExecutor = new CommandExecutor();
    // 初始化 ContactManager（在 init() 中会重新初始化带 logger）
    this.contactManager = new ContactManager();
    // 工具调用事件监听器
    this._toolCallListeners = new Set();
    // 错误事件监听器（用于向前端广播错误）
    this._errorListeners = new Set();
    // LLM 重试事件监听器
    this._llmRetryListeners = new Set();
    // 模块加载器（在 init() 中会重新初始化带 logger）
    this.moduleLoader = new ModuleLoader();
    // LLM 服务注册表和模型选择器（在 init() 中初始化）
    this.serviceRegistry = null;
    this.modelSelector = null;
    // 能力路由器和内容适配器（在 init() 中初始化）
    this.capabilityRouter = null;
    this.contentAdapter = null;
    /** @type {Map<string, LlmClient>} */
    this.llmClientPool = new Map();
    // 工具组管理器（在 init() 中会重新初始化带 logger）
    this.toolGroupManager = new ToolGroupManager({ registerBuiltins: false });
    
    // 初始化子模块（模块化架构）
    // 这些子模块封装了 Runtime 的具体功能实现
    /** @type {JavaScriptExecutor} JavaScript 执行器（Node.js 降级模式） */
    this._jsExecutor = new JavaScriptExecutor(this);
    /** @type {BrowserJavaScriptExecutor} 浏览器 JavaScript 执行器 */
    this._browserJsExecutor = new BrowserJavaScriptExecutor(this);
    /** @type {ContextBuilder} 上下文构建器 */
    this._contextBuilder = new ContextBuilder(this);
    /** @type {AgentManager} 智能体管理器 */
    this._agentManager = new AgentManager(this);
    /** @type {MessageProcessor} 消息处理器 */
    this._messageProcessor = new MessageProcessor(this);
    /** @type {ToolExecutor} 工具执行器 */
    this._toolExecutor = new ToolExecutor(this);
    /** @type {LlmHandler} LLM 处理器 */
    this._llmHandler = new LlmHandler(this);
    /** @type {ShutdownManager} 关闭管理器 */
    this._shutdownManager = new ShutdownManager(this);
  }

  /**
   * 注册工具调用事件监听器。
   * @param {(event: {agentId: string, toolName: string, args: object, result: any, taskId: string|null}) => void} listener
   */
  onToolCall(listener) {
    if (typeof listener === "function") {
      this._toolCallListeners.add(listener);
    }
  }

  /**
   * 触发工具调用事件。
   * @param {{agentId: string, toolName: string, args: object, result: any, taskId: string|null}} event
   */
  _emitToolCall(event) {
    for (const listener of this._toolCallListeners) {
      try {
        listener(event);
      } catch (err) {
        void this.log?.warn?.("工具调用事件监听器执行失败", { error: err?.message ?? String(err) });
      }
    }
  }

  /**
   * 注册错误事件监听器。
   * @param {(event: {agentId: string, errorType: string, message: string, timestamp: string, [key: string]: any}) => void} listener
   */
  onError(listener) {
    if (typeof listener === "function") {
      this._errorListeners.add(listener);
    }
  }

  /**
   * 触发错误事件（用于向前端广播错误）。
   * @param {{agentId: string, errorType: string, message: string, timestamp: string, [key: string]: any}} event
   */
  _emitError(event) {
    for (const listener of this._errorListeners) {
      try {
        listener(event);
      } catch (err) {
        void this.log?.warn?.("错误事件监听器执行失败", { error: err?.message ?? String(err) });
      }
    }
  }

  /**
   * 注册 LLM 重试事件监听器。
   * @param {(event: {agentId: string, attempt: number, maxRetries: number, delayMs: number, errorMessage: string, timestamp: string}) => void} listener
   */
  onLlmRetry(listener) {
    if (typeof listener === "function") {
      this._llmRetryListeners.add(listener);
    }
  }

  /**
   * 触发 LLM 重试事件。
   * @param {{agentId: string, attempt: number, maxRetries: number, delayMs: number, errorMessage: string, timestamp: string}} event
   */
  _emitLlmRetry(event) {
    for (const listener of this._llmRetryListeners) {
      try {
        listener(event);
      } catch (err) {
        void this.log?.warn?.("LLM 重试事件监听器执行失败", { error: err?.message ?? String(err) });
      }
    }
  }

  /**
   * 设置智能体运算状态。
   * @param {string} agentId - 智能体ID
   * @param {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'} status - 运算状态
   */
  setAgentComputeStatus(agentId, status) {
    if (agentId) {
      this._agentComputeStatus.set(agentId, status);
      this._emitComputeStatusChange(agentId, status);
    }
  }

  /**
   * 获取智能体运算状态。
   * @param {string} agentId - 智能体ID
   * @returns {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'} 运算状态
   */
  getAgentComputeStatus(agentId) {
    return this._agentComputeStatus.get(agentId) ?? 'idle';
  }

  /**
   * 检查智能体是否正在活跃处理消息。
   * @param {string} agentId - 智能体ID
   * @returns {boolean} 是否正在活跃处理
   */
  isAgentActivelyProcessing(agentId) {
    return this._activeProcessingAgents.has(agentId);
  }

  /**
   * 添加插话消息到智能体的插话队列。
   * 当智能体正在处理消息时收到新消息，新消息会被加入插话队列。
   * 
   * @param {string} agentId - 智能体ID
   * @param {object} message - 插话消息
   * @returns {void}
   * 
   * Requirements: 1.1, 4.1, 4.2, 4.3, 4.4
   */
  addInterruption(agentId, message) {
    if (!this._interruptionQueues.has(agentId)) {
      this._interruptionQueues.set(agentId, []);
    }
    this._interruptionQueues.get(agentId).push(message);
    
    void this.log.info("添加插话消息", {
      agentId,
      messageFrom: message.from,
      messageId: message.id ?? 'unknown',
      queueLength: this._interruptionQueues.get(agentId).length
    });
  }

  /**
   * 获取并清空智能体的插话队列。
   * 返回所有待处理的插话消息，并清空队列。
   * 
   * @param {string} agentId - 智能体ID
   * @returns {Array<object>} 插话消息数组（FIFO顺序）
   * 
   * Requirements: 1.1, 4.1, 4.2, 4.3, 4.4
   */
  getAndClearInterruptions(agentId) {
    const interruptions = this._interruptionQueues.get(agentId) ?? [];
    this._interruptionQueues.delete(agentId);
    
    if (interruptions.length > 0) {
      void this.log.info("获取插话消息", {
        agentId,
        count: interruptions.length
      });
    }
    
    return interruptions;
  }

  /**
   * 获取所有智能体的运算状态。
   * @returns {Object.<string, 'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'>} 智能体ID到运算状态的映射
   */
  getAllAgentComputeStatus() {
    return Object.fromEntries(this._agentComputeStatus);
  }

  /**
   * 中断指定智能体的 LLM 调用。
   * @param {string} agentId - 智能体ID
   * @param {boolean} [cascade=false] - 是否级联停止所有子智能体
   * @returns {Promise<{ok: boolean, aborted: boolean, reason?: string, cascadeStopped?: string[]}>}
   */
  async abortAgentLlmCall(agentId, cascade = false) {
    if (!agentId) {
      return { ok: false, aborted: false, reason: 'missing_agent_id' };
    }

    const agent = this._agents.get(agentId);
    if (!agent) {
      return { ok: false, aborted: false, reason: 'agent_not_found' };
    }

    // 获取状态锁，确保原子性操作
    const release = await this._acquireLock(agentId);
    
    try {
      const currentStatus = this.getAgentComputeStatus(agentId);
      
      // 如果已经在停止中或已停止，直接返回
      if (currentStatus === 'stopping' || currentStatus === 'stopped' || currentStatus === 'terminating') {
        return { ok: true, aborted: false, reason: 'already_stopped' };
      }
      
      // 如果是级联停止，允许停止任何状态的智能体（包括 idle）
      // 如果不是级联停止，只允许停止活跃的智能体（waiting_llm 或 processing）
      if (!cascade && currentStatus !== 'waiting_llm' && currentStatus !== 'processing') {
        return { ok: true, aborted: false, reason: 'not_active' };
      }

      // 设置状态为 stopping（过渡状态）
      this.setAgentComputeStatus(agentId, 'stopping');

      // 调用 LLM 客户端的 abort 方法
      const aborted = this.llm?.abort(agentId) ?? false;
      
      // 清空消息队列
      const clearedMessages = this.bus?.clearQueue(agentId) ?? [];
      const clearedCount = Array.isArray(clearedMessages) ? clearedMessages.length : 0;
      
      // 级联停止子智能体（如果需要）
      let cascadeStopped = [];
      if (cascade) {
        cascadeStopped = this._cascadeStopAgents(agentId);
        if (cascadeStopped.length > 0) {
          void this.log.info("级联停止子智能体", { 
            agentId, 
            stoppedCount: cascadeStopped.length,
            stoppedAgents: cascadeStopped
          });
        }
      }
      
      // 设置最终状态为 stopped
      this.setAgentComputeStatus(agentId, 'stopped');
      
      if (aborted) {
        void this.log.info("LLM 调用已中断", { 
          agentId, 
          previousStatus: currentStatus,
          clearedMessages: clearedCount,
          cascadeStopped: cascadeStopped.length
        });
      } else {
        void this.log.info("智能体处理已停止", { 
          agentId, 
          previousStatus: currentStatus,
          hadActiveLlmCall: false,
          clearedMessages: clearedCount,
          cascadeStopped: cascadeStopped.length
        });
      }
      
      // 记录中断事件，用于调试和监控
      void this.loggerRoot.logAgentLifecycleEvent("llm_call_aborted", {
        agentId,
        timestamp: formatLocalTime(),
        reason: "user_requested",
        previousStatus: currentStatus,
        llmCallAborted: aborted,
        clearedMessages: clearedCount,
        cascadeStopped: cascadeStopped.length
      });

      const result = { 
        ok: true, 
        aborted: aborted || currentStatus === 'processing'
      };
      
      if (cascadeStopped.length > 0) {
        result.cascadeStopped = cascadeStopped;
      }
      
      return result;
    } finally {
      // 确保锁总是被释放
      this._releaseLock(release);
    }
  }

  /**
   * 触发运算状态变更事件。
   * @param {string} agentId - 智能体ID
   * @param {'idle'|'waiting_llm'|'processing'|'stopping'|'stopped'|'terminating'} status - 新状态
   */
  _emitComputeStatusChange(agentId, status) {
    for (const listener of this._computeStatusListeners ?? []) {
      try {
        listener({ agentId, status, timestamp: formatLocalTime() });
      } catch (err) {
        void this.log?.warn?.("运算状态事件监听器执行失败", { error: err?.message ?? String(err) });
      }
    }
  }

  /**
   * 处理消息中断（当新消息到达正在处理的智能体时）。
   * 这个方法由 MessageBus 在检测到活跃处理智能体时调用。
   * 
   * @param {string} agentId - 智能体ID
   * @param {object} newMessage - 新到达的消息
   * @returns {void}
   * 
   * Requirements: 1.1, 1.4, 5.1
   */
  handleMessageInterruption(agentId, newMessage) {
    // 异步处理中断，不阻塞消息发送
    // 中断处理将在后台执行，消息已经被加入队列
    void this._processInterruption(agentId, newMessage);
  }

  /**
   * 异步处理中断逻辑。
   * @param {string} agentId - 智能体ID
   * @param {object} newMessage - 新到达的消息
   * @private
   */
  async _processInterruption(agentId, newMessage) {
    try {
      void this.log.info("开始处理消息中断", {
        agentId,
        messageFrom: newMessage.from,
        messageId: newMessage.id ?? 'unknown'
      });

      // 检查智能体是否仍在活跃处理中
      if (!this.isAgentActivelyProcessing(agentId)) {
        void this.log.info("智能体已不在活跃处理中，跳过中断", { agentId });
        return;
      }

      // 将消息添加到插话队列
      this.addInterruption(agentId, newMessage);
      
      void this.log.info("插话消息已添加到队列，将在下次检查点处理", {
        agentId,
        messageId: newMessage.id ?? 'unknown'
      });
    } catch (err) {
      void this.log.error("处理消息中断时发生错误", {
        agentId,
        error: err?.message ?? String(err),
        stack: err?.stack
      });
    }
  }

  /**
   * 注册运算状态变更事件监听器。
   * @param {(event: {agentId: string, status: string, timestamp: string}) => void} listener
   */
  onComputeStatusChange(listener) {
    if (!this._computeStatusListeners) {
      this._computeStatusListeners = new Set();
    }
    if (typeof listener === "function") {
      this._computeStatusListeners.add(listener);
    }
  }

  /**
   * 获取智能体状态锁（用于原子性操作）。
   * 使用 Promise 队列实现简单的互斥锁机制。
   * @param {string} agentId - 智能体ID
   * @returns {Promise<Function>} 返回释放锁的函数
   */
  async _acquireLock(agentId) {
    if (!this._stateLocks.has(agentId)) {
      this._stateLocks.set(agentId, Promise.resolve());
    }
    const currentLock = this._stateLocks.get(agentId);
    let releaseFn;
    const newLock = new Promise(resolve => { releaseFn = resolve; });
    this._stateLocks.set(agentId, currentLock.then(() => newLock));
    await currentLock;
    return releaseFn;
  }

  /**
   * 释放智能体状态锁。
   * @param {Function} releaseFn - 释放函数
   */
  _releaseLock(releaseFn) {
    if (releaseFn) releaseFn();
  }

  /**
   * 初始化平台能力组件。
   * @returns {Promise<void>}
   */
  async init() {
    // 优先使用外部传入的配置，否则自己读取
    this.config = this._passedConfig ?? await loadConfig(this.configPath, { dataDir: this.dataDir });
    this.maxSteps = this.config.maxSteps ?? this.maxSteps;
    this.maxToolRounds = this.config.maxToolRounds ?? this.maxToolRounds;
    this.idleWarningMs = this.config.idleWarningMs ?? this.idleWarningMs;
    this.loggerRoot = new Logger(normalizeLoggingConfig(this.config.logging));
    this.log = this.loggerRoot.forModule("runtime");

    void this.log.info("运行时初始化开始", {
      configPath: this.configPath,
      maxSteps: this.maxSteps,
      maxToolRounds: this.maxToolRounds,
      idleWarningMs: this.idleWarningMs
    });

    this.bus = new MessageBus({ 
      logger: this.loggerRoot.forModule("bus"),
      getAgentStatus: (agentId) => this.getAgentComputeStatus(agentId),
      isAgentActivelyProcessing: (agentId) => this.isAgentActivelyProcessing(agentId),
      onInterruptionNeeded: (agentId, message) => this.handleMessageInterruption(agentId, message)
    });
    this.artifacts = new ArtifactStore({ artifactsDir: this.config.artifactsDir, logger: this.loggerRoot.forModule("artifacts") });
    this.prompts = new PromptLoader({ promptsDir: this.config.promptsDir, logger: this.loggerRoot.forModule("prompts") });
    this.org = new OrgPrimitives({ runtimeDir: this.config.runtimeDir, logger: this.loggerRoot.forModule("org") });
    await this.org.loadIfExists();
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
    // 重新初始化 WorkspaceManager 和 CommandExecutor 带 logger
    this.workspaceManager = new WorkspaceManager({ logger: this.loggerRoot.forModule("workspace") });
    this.commandExecutor = new CommandExecutor({ logger: this.loggerRoot.forModule("command") });
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
    this.serviceRegistry = new LlmServiceRegistry({
      configDir: path.dirname(this.configPath),
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

    // 初始化内容适配器和能力路由器
    this.contentAdapter = new ContentAdapter({
      serviceRegistry: this.serviceRegistry,
      logger: this.loggerRoot.forModule("content_adapter")
    });
    this.capabilityRouter = new CapabilityRouter({
      serviceRegistry: this.serviceRegistry,
      contentAdapter: this.contentAdapter,
      logger: this.loggerRoot.forModule("capability_router")
    });
    void this.log.info("能力路由器初始化完成");

    // 初始化工件内容路由器
    this.artifactContentRouter = new ArtifactContentRouter({
      serviceRegistry: this.serviceRegistry,
      binaryDetector: this.artifacts?.binaryDetector,
      logger: this.loggerRoot.forModule("artifact_content_router")
    });
    void this.log.info("工件内容路由器初始化完成");

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
    const agentMetas = this.org.listAgents();
    let restoredCount = 0;
    let skippedCount = 0;

    for (const meta of agentMetas) {
      // 跳过已终止的智能体
      if (meta.status === "terminated") {
        skippedCount++;
        continue;
      }

      // 跳过已经注册的智能体（如 root、user）
      if (this._agents.has(meta.id)) {
        continue;
      }

      // 获取岗位信息
      const role = this.org.getRole(meta.roleId);
      if (!role) {
        void this.log.warn("恢复智能体失败：岗位不存在", { agentId: meta.id, roleId: meta.roleId });
        skippedCount++;
        continue;
      }

      // 创建智能体实例
      const roleName = role.name ?? "unknown";
      const behaviorFactory = this._behaviorRegistry.get(roleName);
      const behavior = behaviorFactory
        ? behaviorFactory(this._buildAgentContext())
        : this.llm
          ? async (ctx, message) => await ctx.runtime._handleWithLlm(ctx, message)
          : async () => {};

      const agent = new Agent({
        id: meta.id,
        roleId: meta.roleId,
        roleName,
        rolePrompt: role.rolePrompt ?? "",
        behavior
      });

      this.registerAgentInstance(agent);
      this._agentMetaById.set(agent.id, { 
        id: meta.id, 
        roleId: meta.roleId, 
        parentAgentId: meta.parentAgentId ?? null 
      });
      this._agentLastActivityTime.set(agent.id, Date.now());
      restoredCount++;

      void this.log.debug("恢复智能体实例", {
        id: agent.id,
        roleId: agent.roleId,
        roleName: agent.roleName,
        parentAgentId: meta.parentAgentId ?? null
      });
    }

    if (restoredCount > 0 || skippedCount > 0) {
      void this.log.info("智能体恢复完成", { 
        restored: restoredCount, 
        skipped: skippedCount,
        total: this._agents.size 
      });
    }
  }

  /**
   * 注册某个岗位名对应的行为工厂。
   * @param {string} roleName
   * @param {(ctx: any) => Function} behaviorFactory
   */
  registerRoleBehavior(roleName, behaviorFactory) {
    this._behaviorRegistry.set(roleName, behaviorFactory);
  }

  /**
   * 向运行时注册一个智能体实例。
   * @param {Agent} agent
   */
  registerAgentInstance(agent) {
    this._agents.set(agent.id, agent);
  }

  /**
   * 列出当前运行时已注册的智能体实例（仅用于对外选择/检索）。
   * @returns {{id:string, roleId:string, roleName:string}[]}
   */
  listAgentInstances() {
    return Array.from(this._agents.values()).map((a) => ({
      id: a.id,
      roleId: a.roleId,
      roleName: a.roleName
    }));
  }

  /**
   * 获取指定智能体的状态信息。
   * @param {string} agentId
   * @returns {{id:string, roleId:string, roleName:string, parentAgentId:string|null, status:string, queueDepth:number, conversationLength:number}|null}
   */
  getAgentStatus(agentId) {
    const agent = this._agents.get(agentId);
    if (!agent) {
      return null;
    }
    
    const meta = this._agentMetaById.get(agentId);
    const queueDepth = this.bus.getQueueDepth(agentId);
    const conversation = this._conversations.get(agentId);
    const conversationLength = conversation ? conversation.length : 0;
    
    return {
      id: agent.id,
      roleId: agent.roleId,
      roleName: agent.roleName,
      parentAgentId: meta?.parentAgentId ?? null,
      status: "active",
      queueDepth,
      conversationLength
    };
  }

  /**
   * 获取所有智能体的队列深度。
   * @returns {{agentId:string, queueDepth:number}[]}
   */
  getQueueDepths() {
    const result = [];
    for (const agentId of this._agents.keys()) {
      const queueDepth = this.bus.getQueueDepth(agentId);
      result.push({ agentId, queueDepth });
    }
    return result;
  }

  /**
   * 根据岗位创建并注册智能体实例。
   * @param {{roleId:string, parentAgentId?:string}} input
   * @returns {Promise<Agent>}
   */
  async spawnAgent(input) {
    if (
      !input ||
      typeof input.parentAgentId !== "string" ||
      input.parentAgentId.length === 0 ||
      input.parentAgentId === "null" ||
      input.parentAgentId === "undefined"
    ) {
      throw new Error("parentAgentId_required");
    }
    const meta = await this.org.createAgent(input);
    const role = this.org.getRole(meta.roleId);
    const roleName = role?.name ?? "unknown";
    const behaviorFactory = this._behaviorRegistry.get(roleName);
    const behavior = behaviorFactory
      ? behaviorFactory(this._buildAgentContext())
      : this.llm
        ? async (ctx, message) => await ctx.runtime._handleWithLlm(ctx, message)
        : async () => {};
    const agent = new Agent({
      id: meta.id,
      roleId: meta.roleId,
      roleName,
      rolePrompt: role?.rolePrompt ?? "",
      behavior
    });
    this.registerAgentInstance(agent);
    this._agentMetaById.set(agent.id, { id: meta.id, roleId: meta.roleId, parentAgentId: meta.parentAgentId ?? null });
    // 初始化智能体最后活动时间
    this._agentLastActivityTime.set(agent.id, Date.now());
    
    // 工作空间处理：只有 root 的直接子智能体需要分配工作空间
    if (input.parentAgentId === "root") {
      const workspaceId = agent.id;
      // 使用 dataDir 或 runtimeDir 的父目录作为基础路径
      const baseDir = this.config.dataDir ?? path.dirname(this.config.runtimeDir);
      const workspacePath = path.join(baseDir, "workspaces", workspaceId);
      await this.workspaceManager.assignWorkspace(workspaceId, workspacePath);
      void this.log.info("为智能体分配工作空间", {
        agentId: agent.id,
        workspaceId,
        workspacePath
      });
    }
    // 非 root 的子智能体不需要任何操作，工作空间通过查找祖先链确定
    
    void this.log.info("创建智能体实例", {
      id: agent.id,
      roleId: agent.roleId,
      roleName: agent.roleName,
      parentAgentId: meta.parentAgentId ?? null
    });
    // 记录智能体生命周期事件
    void this.loggerRoot.logAgentLifecycleEvent("agent_created", {
      agentId: agent.id,
      roleId: agent.roleId,
      roleName: agent.roleName,
      parentAgentId: meta.parentAgentId ?? null
    });
    return agent;
  }

  /**
   * 以“调用者智能体”身份创建子级智能体：parentAgentId 由系统自动填充。
   * @param {string} callerAgentId
   * @param {{roleId:string, parentAgentId?:string}} input
   * @returns {Promise<Agent>}
   */
  async spawnAgentAs(callerAgentId, input) {
    const rawParent = input?.parentAgentId;
    const missingParent = rawParent === null || rawParent === undefined || rawParent === "" || rawParent === "null" || rawParent === "undefined";
    if (!missingParent && String(rawParent) !== String(callerAgentId)) {
      throw new Error("invalid_parentAgentId");
    }
    return await this.spawnAgent({ roleId: input.roleId, parentAgentId: callerAgentId });
  }

  /**
   * 通过祖先链查找智能体的工作空间ID。
   * 从当前智能体开始向上查找，直到找到第一个有工作空间的祖先。
   * @param {string} agentId
   * @returns {string|null} 工作空间ID，如果没有则返回 null
   */
  findWorkspaceIdForAgent(agentId) {
    let currentAgentId = agentId;
    
    while (currentAgentId && currentAgentId !== "root" && currentAgentId !== "user") {
      // 检查当前智能体是否有工作空间
      if (this.workspaceManager.hasWorkspace(currentAgentId)) {
        return currentAgentId;
      }
      
      // 获取父智能体ID
      const meta = this._agentMetaById.get(currentAgentId);
      if (!meta || !meta.parentAgentId) {
        break;
      }
      currentAgentId = meta.parentAgentId;
    }
    
    return null;
  }

  /**
   * 启动常驻异步消息循环（不阻塞调用者）。
   * @returns {Promise<void>}
   */
  async startProcessing() {
    if (this._processingLoopPromise) return this._processingLoopPromise;
    this._stopRequested = false;
    this._processingLoopPromise = this._processingLoop().finally(() => {
      this._processingLoopPromise = null;
    });
    return this._processingLoopPromise;
  }

  async _processingLoop() {
    void this.log.info("运行时常驻消息循环开始（生产者-消费者模式）");
    
    // 获取最大并发数（从LLM客户端配置）
    const maxConcurrent = this.llm?.concurrencyController?.maxConcurrentRequests ?? 3;
    
    while (!this._stopRequested) {
      // 检查并投递到期的延迟消息
      this.bus.deliverDueMessages();
      
      // 尝试调度新的消息处理
      const scheduled = await this._scheduleMessageProcessing(maxConcurrent);
      
      if (!scheduled && !this.bus.hasPending()) {
        // 没有调度成功且没有待处理消息，等待新消息
        await this.bus.waitForMessage({ timeoutMs: 100 });
      } else if (!scheduled) {
        // 有待处理消息但无法调度（可能是并发已满或智能体正在处理）
        // 短暂等待后重试
        await new Promise((r) => setTimeout(r, 10));
      }
      
      // 让出事件循环
      await new Promise((r) => setImmediate(r));
    }
    
    if (this._forceExit) {
      // 强制退出时记录未投递的延迟消息
      const remainingDelayed = this.bus.getDelayedCount();
      if (remainingDelayed > 0) {
        void this.log.warn("强制退出，丢弃延迟消息", { count: remainingDelayed });
      }
      void this.log.info("强制退出，跳过等待活跃消息");
      process.exit(1);
    }
    
    // 优雅关闭时强制投递所有延迟消息
    const forcedCount = this.bus.forceDeliverAllDelayed();
    if (forcedCount > 0) {
      void this.log.info("关闭时强制投递延迟消息", { count: forcedCount });
    }
    
    // 等待所有正在处理的消息完成（除非强制退出）
    while (this._activeProcessingAgents.size > 0 && !this._forceExit) {
      void this.log.info("等待活跃消息处理完成", { 
        activeCount: this._activeProcessingAgents.size,
        activeAgents: [...this._activeProcessingAgents]
      });
      await new Promise((r) => setTimeout(r, 100));
    }
    
    
    void this.log.info("运行时常驻消息循环结束", { stopRequested: this._stopRequested });
  }

  /**
   * 调度消息处理（生产者-消费者模式的调度器）
   * @param {number} maxConcurrent 最大并发数
   * @returns {Promise<boolean>} 是否成功调度了新的消息处理
   */
  async _scheduleMessageProcessing(maxConcurrent) {
    // 检查是否还有并发槽位
    if (this._activeProcessingAgents.size >= maxConcurrent) {
      return false;
    }
    
    // 遍历所有智能体，找到有待处理消息且当前未在处理中的智能体
    for (const agentId of this._agents.keys()) {
      if (this._stopRequested) break;
      
      // 跳过正在处理消息的智能体（单智能体串行约束）
      if (this._activeProcessingAgents.has(agentId)) {
        continue;
      }
      
      // 检查是否有待处理消息
      const msg = this.bus.receiveNext(agentId);
      if (!msg) continue;
      
      // 标记智能体为处理中
      this._activeProcessingAgents.add(agentId);
      
      // 异步处理消息（不等待完成）
      this._processAgentMessage(agentId, msg).finally(() => {
        this._activeProcessingAgents.delete(agentId);
      });
      
      void this.log.debug("调度消息处理", {
        agentId,
        messageId: msg.id,
        activeCount: this._activeProcessingAgents.size,
        maxConcurrent
      });
      
      return true; // 成功调度了一个
    }
    
    return false;
  }

  /**
   * 处理单个智能体的消息
   * @param {string} agentId 智能体ID
   * @param {object} msg 消息对象
   */
  async _processAgentMessage(agentId, msg) {
    const agent = this._agents.get(agentId);
    if (!agent) {
      void this.log.warn("智能体不存在，跳过消息处理", { agentId, messageId: msg.id });
      return;
    }
    
    // 检查智能体状态：如果已停止或正在停止，跳过处理
    const status = this.getAgentComputeStatus(agentId);
    if (status === 'stopped' || status === 'stopping' || status === 'terminating') {
      void this.log.info("智能体已停止，跳过消息处理", {
        agentId,
        status,
        messageId: msg.id,
        from: msg.from
      });
      return;
    }
    
    // 更新智能体最后活动时间
    this._updateAgentActivity(agentId);
    
    void this.log.debug("开始处理消息", {
      agentId,
      from: msg.from,
      taskId: msg.taskId ?? null,
      messageId: msg.id ?? null
    });
    
    // 记录智能体收到消息的生命周期事件
    void this.loggerRoot.logAgentLifecycleEvent("agent_message_received", {
      agentId,
      messageId: msg.id ?? null,
      from: msg.from,
      taskId: msg.taskId ?? null
    });
    
    try {
      await agent.onMessage(this._buildAgentContext(agent), msg);
    } catch (err) {
      const errorMessage = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      const errorType = err?.name ?? "UnknownError";
      
      void this.log.error("智能体消息处理异常（已隔离）", {
        agentId,
        messageId: msg.id ?? null,
        from: msg.from,
        taskId: msg.taskId ?? null,
        errorType,
        error: errorMessage,
        stack: err?.stack ?? null,
        willContinueProcessing: true
      });
      
      // 确保智能体状态重置为空闲
      this.setAgentComputeStatus(agentId, 'idle');
      
      // 向父智能体发送错误通知
      try {
        await this._sendErrorNotificationToParent(agentId, msg, {
          errorType: "agent_message_processing_failed",
          message: `智能体 ${agentId} 消息处理异常: ${errorMessage}`,
          originalError: errorMessage,
          errorName: errorType
        });
      } catch (notifyErr) {
        void this.log.error("发送异常通知失败", {
          agentId,
          notifyError: notifyErr?.message ?? String(notifyErr)
        });
      }
    }
  }

  async _deliverOneRound() {
    if (this._stopRequested) return false;
    
    // 获取最大并发数
    const maxConcurrent = this.llm?.concurrencyController?.maxConcurrentRequests ?? 3;
    
    // 收集可以处理的消息（不超过并发限制）
    const pendingDeliveries = [];
    for (const agentId of this._agents.keys()) {
      if (pendingDeliveries.length >= maxConcurrent) break;
      if (this._activeProcessingAgents.has(agentId)) continue;
      
      const msg = this.bus.receiveNext(agentId);
      if (!msg) continue;
      
      const agent = this._agents.get(agentId);
      pendingDeliveries.push({ agentId, agent, msg });
      this._activeProcessingAgents.add(agentId);
    }
    
    if (pendingDeliveries.length === 0) {
      return false;
    }
    
    void this.log.debug("并发投递消息", {
      count: pendingDeliveries.length,
      agents: pendingDeliveries.map(d => d.agentId)
    });
    
    // 并发处理所有消息
    const deliveryPromises = pendingDeliveries.map(async ({ agentId, msg }) => {
      try {
        await this._processAgentMessage(agentId, msg);
      } finally {
        this._activeProcessingAgents.delete(agentId);
      }
    });
    
    await Promise.all(deliveryPromises);
    
    return true;
  }

  /**
   * 运行消息循环直到消息耗尽或达到步数上限。
   * @returns {Promise<void>}
   */
  async run() {
    this._stopRequested = false;
    let steps = 0;
    void this.log.info("运行时消息循环开始", { maxSteps: this.maxSteps });
    while (!this._stopRequested && steps < this.maxSteps && this.bus.hasPending()) {
      steps += 1;
      const delivered = await this._deliverOneRound();
      if (!delivered) break;
    }
    void this.log.info("运行时消息循环结束", {
      steps,
      stopRequested: this._stopRequested,
      hasPending: this.bus.hasPending()
    });
  }

  /**
   * 注册内置工具组的实际工具定义。
   * 在 init() 中调用，用实际的工具定义替换 ToolGroupManager 中的占位符。
   * @private
   */
  _registerBuiltinToolGroups() {
    // 获取所有内置工具定义
    const allTools = this.getToolDefinitions();
    
    // 工具名到工具组的映射
    const toolGroupMapping = {
      find_role_by_name: "org_management",
      create_role: "org_management",
      spawn_agent: "org_management",
      spawn_agent_with_task: "org_management",
      terminate_agent: "org_management",
      send_message: "org_management",
      put_artifact: "artifact",
      get_artifact: "artifact",
      read_file: "workspace",
      write_file: "workspace",
      list_files: "workspace",
      get_workspace_info: "workspace",
      run_command: "command",
      run_javascript: "command",
      http_request: "network",
      compress_context: "context",
      get_context_status: "context",
      console_print: "console"
    };
    
    // 按工具组分类
    const toolsByGroup = {
      org_management: [],
      artifact: [],
      workspace: [],
      command: [],
      network: [],
      context: [],
      console: []
    };
    
    // 分类工具定义（去重）
    const seenTools = new Set();
    for (const tool of allTools) {
      const toolName = tool?.function?.name;
      if (!toolName || seenTools.has(toolName)) continue;
      
      const groupId = toolGroupMapping[toolName];
      if (groupId && toolsByGroup[groupId]) {
        toolsByGroup[groupId].push(tool);
        seenTools.add(toolName);
      }
    }
    
    // 更新每个内置工具组的工具定义
    for (const [groupId, tools] of Object.entries(toolsByGroup)) {
      if (tools.length > 0) {
        this.toolGroupManager.updateGroupTools(groupId, tools);
      }
    }
    
    void this.log.debug("内置工具组工具定义已更新", {
      groups: Object.keys(toolsByGroup),
      toolCounts: Object.fromEntries(
        Object.entries(toolsByGroup).map(([k, v]) => [k, v.length])
      )
    });
  }

  /**
   * 获取指定智能体可用的工具定义。
   * 根据智能体岗位配置的工具组返回相应的工具定义。
   * @param {string} agentId - 智能体ID
   * @returns {any[]} 工具定义列表
   */
  getToolDefinitionsForAgent(agentId) {
    // root 岗位硬编码只有 org_management
    if (agentId === "root") {
      return this.toolGroupManager.getToolDefinitions(["org_management"]);
    }
    
    // 获取智能体元数据
    const meta = this._agentMetaById.get(agentId);
    if (!meta) {
      // 智能体不存在，返回所有工具（向后兼容）
      return this.getToolDefinitions();
    }
    
    // 获取岗位信息
    const role = this.org.getRole(meta.roleId);
    if (!role) {
      // 岗位不存在，返回所有工具（向后兼容）
      return this.getToolDefinitions();
    }
    
    // 获取岗位配置的工具组，未配置则使用全部工具组
    const toolGroups = role.toolGroups ?? this.toolGroupManager.getAllGroupIds();
    const builtinTools = this.toolGroupManager.getToolDefinitions(toolGroups);
    
    // 合并模块提供的工具定义（模块工具暂时对所有非 root 岗位可用）
    return [...builtinTools, ...this.moduleLoader.getToolDefinitions()];
  }

  /**
   * 检查工具是否对指定智能体可用。
   * @param {string} agentId - 智能体ID
   * @param {string} toolName - 工具名称
   * @returns {boolean}
   */
  isToolAvailableForAgent(agentId, toolName) {
    // 检查是否是模块工具（模块工具对所有非 root 岗位可用）
    if (this.moduleLoader.hasToolName(toolName)) {
      return agentId !== "root";
    }
    
    // root 岗位硬编码只有 org_management
    if (agentId === "root") {
      return this.toolGroupManager.isToolInGroups(toolName, ["org_management"]);
    }
    
    // 获取智能体元数据
    const meta = this._agentMetaById.get(agentId);
    if (!meta) {
      // 智能体不存在，允许所有工具（向后兼容）
      return true;
    }
    
    // 获取岗位信息
    const role = this.org.getRole(meta.roleId);
    if (!role) {
      // 岗位不存在，允许所有工具（向后兼容）
      return true;
    }
    
    // 获取岗位配置的工具组，未配置则使用全部工具组
    const toolGroups = role.toolGroups ?? this.toolGroupManager.getAllGroupIds();
    return this.toolGroupManager.isToolInGroups(toolName, toolGroups);
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
    const groups = this.toolGroupManager.listGroups();
    if (groups.length === 0) {
      return "工具组标识符列表，限制该岗位可用的工具函数。不指定则使用全部工具组。";
    }
    
    const groupDescriptions = groups
      .map(g => `${g.id}（${g.description}）`)
      .join("、");
    
    return `工具组标识符列表，限制该岗位可用的工具函数。可选值：${groupDescriptions}。不指定则使用全部工具组。`;
  }

  getToolDefinitions() {
    // 动态生成工具组描述
    const toolGroupsDescription = this._generateToolGroupsDescription();
    
    return [
      {
        type: "function",
        function: {
          name: "find_role_by_name",
          description: "按岗位名查找岗位，返回 role 或 null。",
          parameters: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "create_role",
          description: "创建岗位（Role），定义智能体的职责和行为规范。必须提供岗位名与岗位提示词。可通过 toolGroups 参数限制该岗位可用的工具函数，实现对大模型上下文长度的压缩。",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string", description: "岗位名称，如 task_executor、web_crawler 等" },
              rolePrompt: { type: "string", description: "岗位提示词，描述该岗位的职责、行为规范和工作边界" },
              toolGroups: { 
                type: "array", 
                items: { type: "string" },
                description: toolGroupsDescription
              }
            },
            required: ["name", "rolePrompt"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "spawn_agent",
          description: "在指定岗位上创建智能体实例（Agent Instance），必须提供任务委托书（Task Brief）。注意：spawn_agent 只创建智能体，不会自动发送任务消息！创建后必须用 send_message 向新智能体发送具体任务。如需创建并立即发送任务，请使用 spawn_agent_with_task。",
          parameters: {
            type: "object",
            properties: {
              roleId: { type: "string", description: "岗位ID" },
              taskBrief: {
                type: "object",
                description: "任务委托书，包含任务的完整说明",
                properties: {
                  objective: { type: "string", description: "目标描述" },
                  constraints: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "技术约束（如：使用HTML+JS、Python等）" 
                  },
                  inputs: { type: "string", description: "输入说明" },
                  outputs: { type: "string", description: "输出要求" },
                  completion_criteria: { type: "string", description: "完成标准" },
                  collaborators: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        agentId: { type: "string", description: "协作者智能体ID" },
                        role: { type: "string", description: "协作者角色" },
                        description: { type: "string", description: "协作说明" }
                      },
                      required: ["agentId", "role"]
                    },
                    description: "预设协作联系人"
                  },
                  references: {
                    type: "array",
                    items: { type: "string" },
                    description: "参考资料"
                  },
                  priority: { type: "string", description: "优先级" }
                },
                required: ["objective", "constraints", "inputs", "outputs", "completion_criteria"]
              }
            },
            required: ["roleId", "taskBrief"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "spawn_agent_with_task",
          description: "创建智能体实例并立即发送任务消息（二合一接口）。相当于 spawn_agent + send_message，省去一次工具调用。推荐在需要立即分配任务时使用。",
          parameters: {
            type: "object",
            properties: {
              roleId: { type: "string", description: "岗位ID" },
              taskBrief: {
                type: "object",
                description: "任务委托书，包含任务的完整说明",
                properties: {
                  objective: { type: "string", description: "目标描述" },
                  constraints: { 
                    type: "array", 
                    items: { type: "string" },
                    description: "技术约束（如：使用HTML+JS、Python等）" 
                  },
                  inputs: { type: "string", description: "输入说明" },
                  outputs: { type: "string", description: "输出要求" },
                  completion_criteria: { type: "string", description: "完成标准" },
                  collaborators: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        agentId: { type: "string", description: "协作者智能体ID" },
                        role: { type: "string", description: "协作者角色" },
                        description: { type: "string", description: "协作说明" }
                      },
                      required: ["agentId", "role"]
                    },
                    description: "预设协作联系人"
                  },
                  references: {
                    type: "array",
                    items: { type: "string" },
                    description: "参考资料"
                  },
                  priority: { type: "string", description: "优先级" }
                },
                required: ["objective", "constraints", "inputs", "outputs", "completion_criteria"]
              },
              initialMessage: {
                type: "object",
                description: "创建后立即发送给新智能体的任务消息内容（payload）",
                properties: {
                  message_type: { type: "string", description: "消息类型，默认 task_assignment" },
                  task: { type: "string", description: "具体任务描述" },
                  interfaces: { type: "object", description: "接口定义" },
                  deliverable: { type: "string", description: "交付物说明" },
                  dependencies: { type: "array", items: { type: "string" }, description: "依赖模块" }
                }
              }
            },
            required: ["roleId", "taskBrief", "initialMessage"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "send_message",
          description: "发送异步消息。from 默认使用当前智能体 id。taskId 由系统自动处理，无需传入。",
          parameters: {
            type: "object",
            properties: {
              to: { type: "string" },
              payload: { type: "object" }
            },
            required: ["to", "payload"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "put_artifact",
          description: "写入工件并返回 artifactRef。",
          parameters: {
            type: "object",
            properties: {
              type: { type: "string" },
              content: {},
              meta: { type: "object" }
            },
            required: ["type", "content"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_artifact",
          description: "读取工件引用并返回工件内容。",
          parameters: {
            type: "object",
            properties: { ref: { type: "string" } },
            required: ["ref"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "console_print",
          description: "向控制台输出文本。",
          parameters: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "terminate_agent",
          description: "终止指定的子智能体实例并回收资源。只能终止自己创建的子智能体。",
          parameters: {
            type: "object",
            properties: {
              agentId: { type: "string", description: "要终止的智能体ID" },
              reason: { type: "string", description: "终止原因（可选）" }
            },
            required: ["agentId"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "run_javascript",
          description:
            "运行一段 JavaScript 代码（在 new Function 中执行）。涉及严格计算/精确数值/统计/日期时间/格式转换等必须可复现的结果时，优先调用本工具用代码计算，不要靠大模型猜测。每次调用都是全新执行环境：不带任何上下文、不保留任何状态、不支持跨调用变量引用。参数 input 会作为变量 input 传入代码。code 必须是“函数体”形式的代码（可包含多行语句），需要显式 return 一个可 JSON 序列化的值；如果返回 Promise，会等待其 resolve 后再作为工具结果返回。为降低风险：本工具不会注入/提供文件系统、进程、OS、网络等能力，也不会传入 require/process/fs/os 等对象；但这不是安全沙箱，请不要尝试任何带副作用或越权的代码。【Canvas 绘图】本工具支持 Canvas 绘图功能。调用 getCanvas(width, height) 获取 Canvas 对象（默认尺寸 800x600），然后使用 getContext('2d') 进行绘图。脚本执行完成后，Canvas 内容会自动导出为 PNG 图像并保存到工件库，返回结果中包含 images 数组。示例：const canvas = getCanvas(400, 300); const ctx = canvas.getContext('2d'); ctx.fillStyle = 'red'; ctx.fillRect(50, 50, 100, 100); return 'done';【中文字体】绘制中文文本时必须指定中文字体，否则会显示方块。可用字体：'Microsoft YaHei'（微软雅黑）、'SimHei'（黑体）、'SimSun'（宋体）、'KaiTi'（楷体）、'DengXian'（等线）。示例：ctx.font = '24px Microsoft YaHei'; ctx.fillText('你好', 50, 50);",
          parameters: {
            type: "object",
            properties: {
              code: { type: "string" },
              input: {}
            },
            required: ["code"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "compress_context",
          description: "【强制要求】压缩会话历史，保留系统提示词、最近消息和指定的重要内容摘要。当上下文使用率达到警告阈值(70%)或更高时必须调用。上下文超过硬性限制(95%)将导致后续 LLM 调用失败。",
          parameters: {
            type: "object",
            properties: {
              summary: { 
                type: "string", 
                description: "对被压缩历史的重要内容摘要" 
              },
              keepRecentCount: { 
                type: "number", 
                description: "保留最近多少条消息，默认10" 
              }
            },
            required: ["summary"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_context_status",
          description: "查询当前智能体的上下文使用状态，包括已使用 token 数、最大限制、使用百分比和状态级别。",
          parameters: {
            type: "object",
            properties: {}
          }
        }
      },
      {
        type: "function",
        function: {
          name: "http_request",
          description: "发起 HTTP/HTTPS 请求调用已知的、确定的 API 接口。【适用场景】调用 REST API、JSON API、GraphQL 等有明确接口规范的服务；获取结构化数据（JSON、XML 等）；与后端服务进行程序化交互。【不适用场景】如需模拟人类浏览网页、访问需要 JavaScript 渲染的动态页面、执行点击/输入等页面交互、处理登录/验证码等复杂流程，请使用 chrome 工具组（chrome_launch、chrome_navigate、chrome_screenshot 等）。",
          parameters: {
            type: "object",
            properties: {
              url: { 
                type: "string", 
                description: "请求 URL，必须是 HTTPS 协议" 
              },
              method: { 
                type: "string", 
                enum: ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
                description: "HTTP 方法，默认 GET" 
              },
              headers: { 
                type: "object", 
                description: "请求头（键值对）" 
              },
              body: { 
                description: "请求体，POST/PUT/PATCH 时使用。对象会自动 JSON 序列化" 
              },
              timeoutMs: { 
                type: "number", 
                description: "超时时间（毫秒），默认 30000" 
              }
            },
            required: ["url"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "read_file",
          description: "读取工作空间内的文件内容。只能访问当前任务绑定的工作空间内的文件。",
          parameters: {
            type: "object",
            properties: {
              path: { 
                type: "string", 
                description: "文件的相对路径（相对于工作空间根目录）" 
              }
            },
            required: ["path"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "write_file",
          description: "在工作空间内创建或修改文件。只能在当前任务绑定的工作空间内写入。",
          parameters: {
            type: "object",
            properties: {
              path: { 
                type: "string", 
                description: "文件的相对路径（相对于工作空间根目录）" 
              },
              content: { 
                type: "string", 
                description: "文件内容" 
              }
            },
            required: ["path", "content"]
          }
        }
      },
      {
        type: "function",
        function: {
          name: "list_files",
          description: "列出工作空间内指定目录的文件和子目录。",
          parameters: {
            type: "object",
            properties: {
              path: { 
                type: "string", 
                description: "目录的相对路径，默认为根目录" 
              }
            }
          }
        }
      },
      {
        type: "function",
        function: {
          name: "get_workspace_info",
          description: "获取当前工作空间的状态信息，包括文件数量、目录数量、总大小、最近修改时间。",
          parameters: {
            type: "object",
            properties: {}
          }
        }
      },
      {
        type: "function",
        function: {
          name: "run_command",
          description: "在工作空间内执行终端命令。命令将在工作空间目录下执行。危险命令（如 sudo、rm -rf / 等）会被拦截。",
          parameters: {
            type: "object",
            properties: {
              command: { 
                type: "string", 
                description: "要执行的命令" 
              },
              timeoutMs: { 
                type: "number", 
                description: "超时时间（毫秒），默认60000" 
              }
            },
            required: ["command"]
          }
        }
      },
      // 合并模块提供的工具定义
      ...this.moduleLoader.getToolDefinitions()
    ];
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
    try {
      void this.log.debug("执行工具调用", {
        agentId: ctx.agent?.id ?? null,
        toolName,
        args: args ?? null
      });
      
      // 委托给 ToolExecutor 处理所有工具调用
      return await this._toolExecutor.executeToolCall(ctx, toolName, args);
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      void this.log.error("工具调用执行失败", { toolName, message });
      return { error: "tool_execution_failed", toolName, message };
    }
  }

  /**
   * 使用 LLM 处理一条消息，并通过工具调用驱动平台动作。
   * @param {any} ctx
   * @param {any} message
   * @returns {Promise<void>}
   */
  async _handleWithLlm(ctx, message) {
    // 委托给 LlmHandler 处理
    return await this._llmHandler.handleWithLlm(ctx, message);
  }

  /**
   * 执行 LLM 处理循环（内部方法）。
   * @param {any} ctx
   * @param {any} message
   * @param {any[]} conv
   * @param {string|null} agentId
   * @param {LlmClient} llmClient - 要使用的 LLM 客户端
   * @returns {Promise<void>}
   * @private
   */
  async _doLlmProcessing(ctx, message, conv, agentId, llmClient) {
    // 在用户消息中注入上下文状态提示
    const contextStatusPrompt = this._conversationManager.buildContextStatusPrompt(agentId);
    const userContent = this._formatMessageForLlm(ctx, message) + contextStatusPrompt;
    conv.push({ role: "user", content: userContent });

    // 检查上下文长度并在超限时发出警告
    this._checkContextAndWarn(ctx.agent.id);

    const tools = this.getToolDefinitions();
    for (let i = 0; i < this.maxToolRounds; i += 1) {
      let msg = null;
      try {
        const llmMeta = {
          agentId: ctx.agent?.id ?? null,
          roleId: ctx.agent?.roleId ?? null,
          roleName: ctx.agent?.roleName ?? null,
          messageId: message?.id ?? null,
          messageFrom: message?.from ?? null,
          taskId: message?.taskId ?? null,
          round: i + 1
        };
        void this.log.info("请求 LLM", llmMeta);
        // 设置状态为等待LLM响应
        this.setAgentComputeStatus(agentId, 'waiting_llm');
        msg = await llmClient.chat({ messages: conv, tools, meta: llmMeta });
        
        // 检查智能体状态：如果已被停止或正在停止，丢弃响应
        const statusAfterLlm = this.getAgentComputeStatus(agentId);
        if (statusAfterLlm === 'stopped' || statusAfterLlm === 'stopping' || statusAfterLlm === 'terminating') {
          void this.log.info("智能体已停止，丢弃 LLM 响应", {
            agentId,
            status: statusAfterLlm,
            messageId: message?.id ?? null
          });
          return; // 丢弃响应，结束处理
        }
        
        // LLM响应后设置为处理中
        this.setAgentComputeStatus(agentId, 'processing');
      } catch (err) {
        // 改进的异常处理：区分不同类型的错误
        this.setAgentComputeStatus(agentId, 'idle');
        const text = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
        const errorType = err?.name ?? "UnknownError";
        
        // 详细记录异常信息
        void this.log.error("LLM 调用失败", { 
          agentId: ctx.agent?.id ?? null, 
          messageId: message?.id ?? null, 
          taskId: message?.taskId ?? null,
          errorType,
          message: text,
          round: i + 1,
          stack: err?.stack ?? null
        });

        // 从对话历史中移除导致失败的用户消息，避免下次调用时再次发送
        if (i === 0 && conv.length > 0 && conv[conv.length - 1].role === "user") {
          conv.pop();
          void this.log.info("已从对话历史中移除导致失败的用户消息", {
            agentId: ctx.agent?.id ?? null,
            messageId: message?.id ?? null
          });
        }

        // 根据错误类型决定处理策略
        if (errorType === "AbortError") {
          // 中断错误：记录日志但不停止整个系统
          void this.log.info("LLM 调用被用户中断，智能体将继续处理其他消息", { 
            agentId: ctx.agent?.id ?? null,
            messageId: message?.id ?? null,
            taskId: message?.taskId ?? null
          });
          
          // 不发送通知消息（根据需求 2.4）
          
          return; // 结束当前消息处理，但不停止整个系统
        } else {
          // 其他错误：记录详细信息，向父智能体发送错误通知，但不停止系统
          void this.log.error("LLM 调用遇到非中断错误", {
            agentId: ctx.agent?.id ?? null,
            messageId: message?.id ?? null,
            taskId: message?.taskId ?? null,
            errorType,
            errorMessage: text,
            willContinueProcessing: true
          });
          
          // 向父智能体发送错误通知
          await this._sendErrorNotificationToParent(agentId, message, {
            errorType: "llm_call_failed",
            message: `LLM 调用失败: ${text}`,
            originalError: text,
            errorName: errorType
          });
          
          return; // 结束当前消息处理，但不停止整个系统
        }
      }
      if (!msg) {
        this.setAgentComputeStatus(agentId, 'idle');
        return;
      }
      
      // 更新 token 使用统计（基于 LLM 返回的实际值）
      if (agentId && msg._usage) {
        this._conversationManager.updateTokenUsage(agentId, msg._usage);
        const status = this._conversationManager.getContextStatus(agentId);
        void this.log.debug("更新上下文 token 使用统计", {
          agentId,
          promptTokens: msg._usage.promptTokens,
          completionTokens: msg._usage.completionTokens,
          totalTokens: msg._usage.totalTokens,
          usagePercent: (status.usagePercent * 100).toFixed(1) + '%',
          status: status.status
        });
        
        // 如果更新后超过硬性限制，记录警告（下次调用时会被拒绝）
        if (status.status === 'exceeded') {
          void this.log.warn("上下文已超过硬性限制，下次 LLM 调用将被拒绝", {
            agentId,
            usedTokens: status.usedTokens,
            maxTokens: status.maxTokens,
            usagePercent: (status.usagePercent * 100).toFixed(1) + '%'
          });
        }
      }
      
      conv.push(msg);

      const toolCalls = msg.tool_calls ?? [];
      if (!toolCalls || toolCalls.length === 0) {
        // 检测 LLM 是否在文本中描述了工具调用意图但没有实际调用
        const content = msg.content ?? "";
        const toolIntentPatterns = [
          /我将.*创建/,
          /让我.*创建/,
          /我需要.*创建/,
          /我会.*创建/,
          /首先.*创建/,
          /create_role/i,
          /spawn_agent/i,
          /send_message/i,
          /我将.*调用/,
          /让我.*调用/,
          /我要.*调用/
        ];
        const hasToolIntent = toolIntentPatterns.some(pattern => pattern.test(content));
        
        if (hasToolIntent && i < this.maxToolRounds - 1) {
          // LLM 描述了工具调用意图但没有实际调用，添加提示并重试
          void this.log.warn("检测到 LLM 描述了工具调用意图但未实际调用，添加提示重试", {
            agentId: ctx.agent?.id ?? null,
            round: i + 1,
            contentPreview: content.substring(0, 200)
          });
          
          conv.push({
            role: "user",
            content: "【系统提示】你刚才描述了想要执行的操作，但没有实际调用工具函数。请注意：你必须通过 tool_calls 调用工具函数来执行操作，而不是在文本中描述。例如，如果你想创建岗位，请直接调用 create_role 工具；如果你想创建智能体，请直接调用 spawn_agent 工具。请立即调用相应的工具函数来执行你描述的操作。"
          });
          continue; // 继续下一轮，让 LLM 重新生成带 tool_calls 的响应
        }
        
        // 没有工具调用但有文本内容，自动发送给 user
        if (content.trim()) {
          const currentAgentId = ctx.agent?.id ?? "unknown";
          // 没有调用 send_message 的回复默认发给 user
          const targetId = "user";
          const currentTaskId = ctx.currentMessage?.taskId ?? null;
          
          void this.log.info("LLM 返回纯文本无 tool_calls，自动发送消息", {
            agentId: currentAgentId,
            targetId,
            contentPreview: content.substring(0, 100)
          });
          
          const sendResult = ctx.tools.sendMessage({
            to: targetId,
            from: currentAgentId,
            taskId: currentTaskId,
            payload: { text: content.trim() }
          });
          
          // 记录智能体发送消息的生命周期事件
          void this.loggerRoot.logAgentLifecycleEvent("agent_message_sent", {
            agentId: currentAgentId,
            messageId: sendResult?.messageId ?? null,
            to: targetId,
            taskId: currentTaskId,
            autoSent: true
          });
        }
        
        // 没有工具调用，处理完成，重置为空闲状态
        this.setAgentComputeStatus(agentId, 'idle');
        return;
      }

      const toolNames = toolCalls.map((c) => c?.function?.name).filter(Boolean);
      void this.log.debug("LLM 返回工具调用", {
        agentId: ctx.agent?.id ?? null,
        count: toolCalls.length,
        toolNames
      });

      for (const call of toolCalls) {
        // 在执行每个工具调用前检查智能体状态
        const statusBeforeTool = this.getAgentComputeStatus(agentId);
        if (statusBeforeTool === 'stopped' || statusBeforeTool === 'stopping' || statusBeforeTool === 'terminating') {
          void this.log.info("智能体已停止，跳过剩余工具调用", {
            agentId,
            status: statusBeforeTool,
            toolName: call.function?.name ?? "unknown",
            remainingCalls: toolCalls.length
          });
          // 立即返回，不执行任何工具调用
          return;
        }
        
        let args = {};
        try {
          args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch (parseErr) {
          // 工具参数解析失败
          const parseError = parseErr && typeof parseErr.message === "string" ? parseErr.message : String(parseErr ?? "unknown parse error");
          void this.log.error("工具调用参数解析失败", { 
            agentId: ctx.agent?.id ?? null,
            toolName: call.function?.name ?? "unknown",
            arguments: call.function?.arguments ?? "null",
            parseError,
            callId: call.id
          });
          
          // 返回解析错误结果，继续处理其他工具调用
          conv.push({
            role: "tool",
            tool_call_id: call.id,
            content: JSON.stringify({
              error: "参数解析失败",
              details: parseError,
              toolName: call.function?.name ?? "unknown"
            })
          });
          continue;
        }
        
        const toolName = call.function?.name ?? null;
        void this.log.debug("解析工具调用参数", { name: toolName });
        
        let result = null;
        try {
          result = await this.executeToolCall(ctx, toolName, args);
        } catch (toolErr) {
          // 工具执行失败
          const toolError = toolErr && typeof toolErr.message === "string" ? toolErr.message : String(toolErr ?? "unknown tool error");
          void this.log.error("工具执行失败", {
            agentId: ctx.agent?.id ?? null,
            toolName,
            args,
            toolError,
            callId: call.id,
            stack: toolErr?.stack ?? null
          });
          
          // 返回工具执行错误结果，继续处理其他工具调用
          result = {
            error: "工具执行失败",
            details: toolError,
            toolName,
            args
          };
        }
        
        // 在工具执行后再次检查状态
        const statusAfterTool = this.getAgentComputeStatus(agentId);
        if (statusAfterTool === 'stopped' || statusAfterTool === 'stopping' || statusAfterTool === 'terminating') {
          void this.log.info("智能体在工具执行后已停止，跳过剩余工具调用", {
            agentId,
            status: statusAfterTool,
            executedTool: toolName
          });
          // 立即返回，不继续处理
          return;
        }
        
        // 触发工具调用事件
        this._emitToolCall({
          agentId: ctx.agent?.id ?? null,
          toolName,
          args,
          result,
          taskId: message?.taskId ?? null,
          callId: call.id,
          timestamp: new Date().toISOString(),
          reasoningContent: msg.reasoning_content ?? null
        });
        
        conv.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result ?? null)
        });
      }
      if (ctx.yieldRequested) {
        ctx.yieldRequested = false;
        this.setAgentComputeStatus(agentId, 'idle');
        return;
      }
    }
    // 工具调用轮次达到上限，重置为空闲状态
    this.setAgentComputeStatus(agentId, 'idle');
    void this.log.warn("工具调用轮次达到上限，强制停止本次处理", {
      agentId: ctx.agent?.id ?? null,
      messageId: message?.id ?? null,
      maxToolRounds: this.maxToolRounds
    });

    // 向父智能体发送错误通知（需求 5.3）
    if (agentId) {
      await this._sendErrorNotificationToParent(agentId, message, {
        errorType: "max_tool_rounds_exceeded",
        message: `智能体 ${agentId} 超过最大工具调用轮次限制 (${this.maxToolRounds})`,
        maxToolRounds: this.maxToolRounds
      });
    }
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
    if (!agentId) return;
    
    const timestamp = new Date().toISOString();
    const errorPayload = {
      kind: "error",
      errorType: errorInfo.errorType,
      message: errorInfo.message,
      agentId,
      originalMessageId: originalMessage?.id ?? null,
      taskId: originalMessage?.taskId ?? null,
      timestamp,
      ...errorInfo
    };
    
    // 触发全局错误事件（用于前端显示）
    this._emitError({
      agentId,
      errorType: errorInfo.errorType,
      message: errorInfo.message,
      originalMessageId: originalMessage?.id ?? null,
      taskId: originalMessage?.taskId ?? null,
      timestamp,
      ...errorInfo
    });

    // 1. 直接存储错误消息到聊天记录（不通过 bus.send，避免触发消息处理）
    const errorMessageId = randomUUID();
    const errorMessage = {
      id: errorMessageId,
      from: agentId,
      to: agentId,
      taskId: originalMessage?.taskId ?? null,
      payload: errorPayload,
      createdAt: timestamp
    };
    
    if (typeof this._storeErrorMessageCallback === 'function') {
      try {
        this._storeErrorMessageCallback(errorMessage);
        void this.log.info("已保存错误消息到智能体聊天记录", {
          agentId,
          errorType: errorInfo.errorType,
          messageId: errorMessageId
        });
      } catch (storeErr) {
        void this.log.error("保存错误消息到聊天记录失败", {
          agentId,
          errorType: errorInfo.errorType,
          error: storeErr?.message ?? String(storeErr)
        });
      }
    }
    
    // 2. 向父智能体发送错误通知（通过 bus.send，让父智能体知道子智能体出错了）
    const parentAgentId = this._agentMetaById.get(agentId)?.parentAgentId ?? null;
    if (!parentAgentId || !this._agents.has(parentAgentId)) {
      void this.log.debug("未找到父智能体，跳过向父智能体发送错误通知", { 
        agentId, 
        parentAgentId,
        errorType: errorInfo.errorType 
      });
      return;
    }

    try {
      this.bus.send({
        to: parentAgentId,
        from: agentId,
        taskId: originalMessage?.taskId ?? null,
        payload: errorPayload
      });
      
      void this.log.info("已向父智能体发送错误通知", {
        agentId,
        parentAgentId,
        errorType: errorInfo.errorType,
        taskId: originalMessage?.taskId ?? null
      });
    } catch (notifyErr) {
      void this.log.error("发送错误通知失败", {
        agentId,
        parentAgentId,
        errorType: errorInfo.errorType,
        notifyError: notifyErr?.message ?? String(notifyErr)
      });
    }
  }

  /**
   * 格式化工具组信息，用于注入到系统提示词中。
   * @returns {string}
   * @private
   */
  _formatToolGroupsInfo() {
    const groups = this.toolGroupManager.listGroups();
    if (!groups || groups.length === 0) {
      return "";
    }
    
    const lines = groups.map(g => `- ${g.id}：${g.description}（${g.tools.join("、")}）`);
    return `\n\n【可用工具组列表】\n${lines.join("\n")}`;
  }

  /**
   * 生成当前智能体的 system prompt（包含工具调用规则）。
   * @param {any} ctx
   * @returns {string}
   */
  _buildSystemPromptForAgent(ctx) {
    const toolRules = ctx.systemToolRules ? "\n\n" + ctx.systemToolRules : "";
    const agentId = ctx.agent?.id ?? "";
    const parentAgentId = this._agentMetaById.get(agentId)?.parentAgentId ?? null;
    const runtimeInfo = `\n\n【运行时信息】\nagentId=${agentId}\nparentAgentId=${parentAgentId ?? ""}`;

    if (ctx.agent?.id === "root") {
      const rootPrompt = ctx.agent?.rolePrompt ?? "";
      // 动态注入可用工具组列表
      const toolGroupsInfo = this._formatToolGroupsInfo();
      return rootPrompt + runtimeInfo + toolGroupsInfo;
    }

    const base = ctx.systemBasePrompt ?? "";
    const role = ctx.agent?.rolePrompt ?? "";
    
    // 获取并格式化 TaskBrief（Requirements 1.5）
    const taskBrief = this._agentTaskBriefs.get(agentId);
    const taskBriefText = taskBrief ? "\n\n" + formatTaskBrief(taskBrief) : "";
    
    // 获取联系人列表信息
    const contacts = this.contactManager.listContacts(agentId);
    let contactsText = "";
    if (contacts && contacts.length > 0) {
      const contactLines = contacts.map(c => `- ${c.role}（${c.id}）`);
      contactsText = `\n\n【联系人列表】\n${contactLines.join('\n')}`;
    }
    
    const composed = ctx.tools.composePrompt({
      base,
      composeTemplate: ctx.systemComposeTemplate ?? "{{BASE}}\n{{ROLE}}\n{{TASK}}",
      rolePrompt: role,
      taskText: "",
      workspace: ctx.systemWorkspacePrompt ?? ""
    });
    return composed + runtimeInfo + taskBriefText + contactsText + toolRules;
  }

  /**
   * 将运行时消息格式化为 LLM 可理解的文本输入。
   * 对于非 root 智能体，隐藏 taskId 以降低心智负担。
   * @param {any} ctx
   * @param {any} message
   * @returns {string}
   */
  _formatMessageForLlm(ctx, message) {
    const isRoot = ctx?.agent?.id === "root";
    
    // root 智能体使用原有格式（需要看到 taskId）
    if (isRoot) {
      const payloadText =
        message?.payload?.text ??
        message?.payload?.content ??
        (typeof message?.payload === "string" ? message.payload : null);
      const payload = payloadText ?? JSON.stringify(message?.payload ?? {}, null, 2);
      return `from=${message?.from ?? ""}\nto=${message?.to ?? ""}\ntaskId=${message?.taskId ?? ""}\npayload=${payload}`;
    }
    
    // 非 root 智能体使用新的消息格式化器（Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6）
    const senderId = message?.from ?? 'unknown';
    const senderInfo = this._getSenderInfo(senderId);
    return formatMessageForAgent(message, senderInfo);
  }

  /**
   * 获取发送者信息（用于消息格式化）
   * @param {string} senderId - 发送者ID
   * @returns {{role: string}|null}
   * @private
   */
  _getSenderInfo(senderId) {
    if (senderId === 'user') {
      return { role: 'user' };
    }
    if (senderId === 'root') {
      return { role: 'root' };
    }
    
    // 尝试从已注册的智能体获取角色信息
    const agent = this._agents.get(senderId);
    if (agent) {
      return { role: agent.roleName ?? 'unknown' };
    }
    
    // 尝试从智能体元数据获取
    const meta = this._agentMetaById.get(senderId);
    if (meta) {
      const role = this.org.getRole(meta.roleId);
      return { role: role?.name ?? 'unknown' };
    }
    
    return { role: 'unknown' };
  }

  /**
   * 获取或创建某个智能体的会话上下文。
   * @param {string} agentId
   * @param {string} systemPrompt
   * @returns {any[]}
   */
  _ensureConversation(agentId, systemPrompt) {
    if (!this._conversations.has(agentId)) {
      this._conversations.set(agentId, [{ role: "system", content: systemPrompt }]);
    }
    return this._conversations.get(agentId);
  }

  /**
   * 构建注入给智能体的运行时上下文。
   * @param {Agent} [agent]
   * @returns {any}
   */
  _buildAgentContext(agent) {
    const tools = {
      findRoleByName: (name) => this.org.findRoleByName(name),
      createRole: (input) =>
        this.org.createRole({
          ...input,
          createdBy: input?.createdBy ?? (agent?.id ? agent.id : null)
        }),
      spawnAgent: async (input) => {
        const callerId = agent?.id ?? null;
        if (!callerId) throw new Error("missing_creator_agent");
        return await this.spawnAgentAs(callerId, input);
      },
      sendMessage: (message) => {
        const to = message?.to ?? null;
        if (!to || !this._agents.has(String(to))) {
          void this.log.warn("发送消息收件人不存在（已拦截）", { to: to ?? null, from: message?.from ?? null });
          return null;
        }
        return this.bus.send(message);
      },
      putArtifact: (artifact) => this.artifacts.putArtifact(artifact),
      getArtifact: (ref) => this.artifacts.getArtifact(ref),
      saveImage: (buffer, meta) => this.artifacts.saveImage(buffer, meta),
      composePrompt: (parts) => this.prompts.compose(parts),
      consolePrint: (text) => process.stdout.write(String(text ?? ""))
    };

    return {
      runtime: this,
      org: this.org,
      bus: this.bus,
      artifacts: this.artifacts,
      prompts: this.prompts,
      systemBasePrompt: this.systemBasePrompt,
      systemComposeTemplate: this.systemComposeTemplate,
      systemToolRules: this.systemToolRules,
      systemWorkspacePrompt: this.systemWorkspacePrompt,
      tools,
      agent: agent ?? null
    };
  }

  /**
   * 获取指定服务的 LlmClient（懒加载，池化复用）。
   * @param {string} serviceId - 服务ID
   * @returns {LlmClient|null} LlmClient 实例，如果服务不存在则返回 null
   */
  getLlmClientForService(serviceId) {
    if (!serviceId) {
      return null;
    }

    // 检查池中是否已有该服务的客户端
    if (this.llmClientPool.has(serviceId)) {
      return this.llmClientPool.get(serviceId);
    }

    // 从注册表获取服务配置
    const serviceConfig = this.serviceRegistry?.getServiceById(serviceId);
    if (!serviceConfig) {
      void this.log.warn("LLM服务不存在", { serviceId });
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
    if (this.serviceRegistry?.getService?.(role.llmServiceId)) {
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
      // 重新加载配置
      const newConfig = await loadConfig(this.configPath, { dataDir: this.dataDir });
      
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
      this.setAgentComputeStatus(agentId, 'terminating');
      
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

      // 清理空闲跟踪数据
      this._agentLastActivityTime.delete(agentId);
      this._idleWarningEmitted.delete(agentId);
      
      // 清理运算状态
      this._agentComputeStatus.delete(agentId);
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
    const stoppedAgents = [];
    
    // 收集所有子智能体
    const descendants = this._collectDescendantAgents(parentAgentId);
    
    // 对每个子智能体执行停止操作
    for (const agentId of descendants) {
      const agent = this._agents.get(agentId);
      if (!agent) continue;
      
      const currentStatus = this.getAgentComputeStatus(agentId);
      
      // 只停止活跃的智能体
      if (currentStatus === 'waiting_llm' || currentStatus === 'processing' || currentStatus === 'idle') {
        // 设置状态为 stopping
        this.setAgentComputeStatus(agentId, 'stopping');
        
        // 中止 LLM 调用
        const aborted = this.llm?.abort(agentId) ?? false;
        if (aborted) {
          void this.log.info("级联停止：中止 LLM 调用", { agentId, parentAgentId });
        }
        
        // 清空消息队列
        const clearedMessages = this.bus?.clearQueue(agentId) ?? [];
        const clearedCount = Array.isArray(clearedMessages) ? clearedMessages.length : 0;
        if (clearedCount > 0) {
          void this.log.info("级联停止：清空消息队列", { agentId, parentAgentId, clearedCount });
        }
        
        // 设置最终状态为 stopped
        this.setAgentComputeStatus(agentId, 'stopped');
        
        stoppedAgents.push(agentId);
        
        void this.log.info("级联停止智能体", { agentId, parentAgentId });
      }
    }
    
    return stoppedAgents;
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

    // 复用 spawn_agent 的逻辑创建智能体
    const spawnResult = await this.executeToolCall(ctx, "spawn_agent", {
      roleId: args.roleId,
      taskBrief: args.taskBrief
    });

    // 如果创建失败，直接返回错误
    if (spawnResult.error) {
      return spawnResult;
    }

    const newAgentId = spawnResult.id;
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
      roleId: spawnResult.roleId,
      roleName: spawnResult.roleName,
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
      roleId: spawnResult.roleId,
      roleName: spawnResult.roleName,
      messageId: sendResult.messageId
    };
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
    const result = this._conversationManager.checkAndWarn(agentId);
    
    if (result.warning) {
      void this.log.warn("智能体上下文超过限制", {
        agentId,
        currentCount: result.currentCount,
        maxCount: result.maxCount
      });
    }

    return result;
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
