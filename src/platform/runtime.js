import { loadConfig } from "./config.js";
import { ArtifactStore } from "./artifact_store.js";
import { MessageBus } from "./message_bus.js";
import { OrgPrimitives } from "./org_primitives.js";
import { PromptLoader } from "./prompt_loader.js";
import { LlmClient } from "./llm_client.js";
import { Logger, createNoopModuleLogger, normalizeLoggingConfig } from "./logger.js";
import { Agent } from "../agents/agent.js";
import { ConversationManager } from "./conversation_manager.js";
import { HttpClient } from "./http_client.js";
import { WorkspaceManager } from "./workspace_manager.js";
import { CommandExecutor } from "./command_executor.js";
import { validateTaskBrief, formatTaskBrief } from "./task_brief.js";
import { ContactManager } from "./contact_manager.js";
import { formatMessageForAgent } from "./message_formatter.js";
import { validateMessageFormat } from "./message_validator.js";

/**
 * 运行时：将平台能力（org/message/artifact/prompt）与智能体行为连接起来。
 */
export class Runtime {
  /**
   * @param {{maxSteps?:number, configPath?:string, maxToolRounds?:number, idleWarningMs?:number, dataDir?:string}} options
   */
  constructor(options = {}) {
    this.maxSteps = options.maxSteps ?? 200;
    this.configPath = options.configPath ?? "config/app.json";
    this.maxToolRounds = options.maxToolRounds ?? 200;
    this.maxContextMessages = options.maxContextMessages ?? 50;
    this.idleWarningMs = options.idleWarningMs ?? 300000; // 默认5分钟
    this.dataDir = options.dataDir ?? null; // 自定义数据目录
    this._stopRequested = false;
    this._processingLoopPromise = null;
    this._agents = new Map();
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
    this._taskWorkspaces = new Map(); // 跟踪任务工作空间 taskId -> workspacePath
    this._agentTaskBriefs = new Map(); // 跟踪智能体的 TaskBrief agentId -> TaskBrief
    this.loggerRoot = new Logger(normalizeLoggingConfig(null));
    this.log = createNoopModuleLogger();
    // 初始化 WorkspaceManager 和 CommandExecutor（在 init() 中会重新初始化带 logger）
    this.workspaceManager = new WorkspaceManager();
    this.commandExecutor = new CommandExecutor();
    // 初始化 ContactManager（在 init() 中会重新初始化带 logger）
    this.contactManager = new ContactManager();
  }

  /**
   * 初始化平台能力组件。
   * @returns {Promise<void>}
   */
  async init() {
    this.config = await loadConfig(this.configPath, { dataDir: this.dataDir });
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

    this.bus = new MessageBus({ logger: this.loggerRoot.forModule("bus") });
    this.artifacts = new ArtifactStore({ artifactsDir: this.config.artifactsDir, logger: this.loggerRoot.forModule("artifacts") });
    this.prompts = new PromptLoader({ promptsDir: this.config.promptsDir, logger: this.loggerRoot.forModule("prompts") });
    this.org = new OrgPrimitives({ runtimeDir: this.config.runtimeDir, logger: this.loggerRoot.forModule("org") });
    await this.org.loadIfExists();
    this.systemBasePrompt = await this.prompts.loadSystemPromptFile("base.txt");
    this.systemComposeTemplate = await this.prompts.loadSystemPromptFile("compose.txt");
    this.systemToolRules = await this.prompts.loadSystemPromptFile("tool_rules.txt");
    this.llm = this.config.llm ? new LlmClient({ ...this.config.llm, logger: this.loggerRoot.forModule("llm") }) : null;
    this.httpClient = new HttpClient({ logger: this.loggerRoot.forModule("http") });
    // 重新初始化 WorkspaceManager 和 CommandExecutor 带 logger
    this.workspaceManager = new WorkspaceManager({ logger: this.loggerRoot.forModule("workspace") });
    this.commandExecutor = new CommandExecutor({ logger: this.loggerRoot.forModule("command") });
    // 重新初始化 ContactManager 带 logger
    this.contactManager = new ContactManager({ logger: this.loggerRoot.forModule("contact") });

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

    void this.log.info("运行时初始化完成", {
      agents: this._agents.size
    });
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
    void this.log.info("运行时常驻消息循环开始");
    while (!this._stopRequested) {
      if (!this.bus.hasPending()) {
        await this.bus.waitForMessage({ timeoutMs: 1000 });
        continue;
      }

      let steps = 0;
      while (!this._stopRequested && steps < this.maxSteps && this.bus.hasPending()) {
        steps += 1;
        const delivered = await this._deliverOneRound();
        if (!delivered) break;
        if (steps % 5 === 0) {
          await new Promise((r) => setImmediate(r));
        }
      }
      await new Promise((r) => setImmediate(r));
    }
    void this.log.info("运行时常驻消息循环结束", { stopRequested: this._stopRequested });
  }

  async _deliverOneRound() {
    let delivered = false;
    for (const agentId of this._agents.keys()) {
      if (this._stopRequested) break;
      const msg = this.bus.receiveNext(agentId);
      if (!msg) continue;
      delivered = true;
      const agent = this._agents.get(agentId);
      
      // 更新智能体最后活动时间
      this._updateAgentActivity(agentId);
      
      void this.log.debug("投递消息", {
        to: agentId,
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
      
      // 错误隔离：捕获单个智能体的异常，记录日志后继续处理其他智能体
      try {
        await agent.onMessage(this._buildAgentContext(agent), msg);
      } catch (err) {
        const errorMessage = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
        void this.log.error("智能体消息处理异常（已隔离）", {
          agentId,
          messageId: msg.id ?? null,
          from: msg.from,
          taskId: msg.taskId ?? null,
          error: errorMessage
        });
        // 继续处理其他智能体，不中断循环
      }
    }
    return delivered;
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
   * 返回可供 LLM 工具调用的工具定义（OpenAI tools schema）。
   * @returns {any[]}
   */
  getToolDefinitions() {
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
          description: "创建岗位（Role），必须提供岗位名与岗位提示词。",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              rolePrompt: { type: "string" }
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
          name: "wait_for_message",
          description: "进入等待状态，结束当前消息的处理，等待下一条消息到达后再继续。",
          parameters: {
            type: "object",
            properties: {}
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
            "运行一段 JavaScript 代码（在 new Function 中执行）。涉及严格计算/精确数值/统计/日期时间/格式转换等必须可复现的结果时，优先调用本工具用代码计算，不要靠大模型猜测。每次调用都是全新执行环境：不带任何上下文、不保留任何状态、不支持跨调用变量引用。参数 input 会作为变量 input 传入代码。code 必须是“函数体”形式的代码（可包含多行语句），需要显式 return 一个可 JSON 序列化的值；如果返回 Promise，会等待其 resolve 后再作为工具结果返回。为降低风险：本工具不会注入/提供文件系统、进程、OS、网络等能力，也不会传入 require/process/fs/os 等对象；但这不是安全沙箱，请不要尝试任何带副作用或越权的代码。",
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
          description: "发起 HTTPS 请求访问外部 API 或网页。仅支持 HTTPS 协议。请求和响应数据会被记录到日志中。",
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
      }
    ];
  }

  /**
   * 执行一次工具调用并返回可序列化结果。
   * @param {any} ctx
   * @param {string} toolName
   * @param {any} args
   * @returns {Promise<any>}
   */
  async executeToolCall(ctx, toolName, args) {
    try {
      void this.log.debug("执行工具调用", {
        agentId: ctx.agent?.id ?? null,
        toolName,
        args: args ?? null
      });
      if (toolName === "find_role_by_name") {
        const result = ctx.tools.findRoleByName(args.name);
        void this.log.debug("工具调用完成", { toolName, ok: true });
        return result;
      }
      if (toolName === "create_role") {
        const isRoot = ctx.agent?.id === "root";
        const taskId = ctx.currentMessage?.taskId ?? null;
        const isFromUser = ctx.currentMessage?.from === "user";

        if (isRoot && isFromUser && taskId) {
          const existingRoleId = this._rootTaskRoleByTaskId.get(taskId);
          if (existingRoleId) {
            const existing = this.org.getRole(existingRoleId);
            if (existing) {
              void this.log.debug("根智能体复用岗位（按 taskId）", { taskId, roleId: existingRoleId, roleName: existing.name });
              return existing;
            }
          }
        }

        const existing = ctx.tools.findRoleByName(args.name);
        if (existing) {
          if (isRoot && isFromUser && taskId) {
            this._rootTaskRoleByTaskId.set(taskId, existing.id);
          }
          const result = existing;
          void this.log.debug("工具调用完成", { toolName, ok: true, roleId: result?.id ?? null, reused: true });
          return result;
        }

        const result = await ctx.tools.createRole({ name: args.name, rolePrompt: args.rolePrompt });
        if (isRoot && isFromUser && taskId) {
          this._rootTaskRoleByTaskId.set(taskId, result.id);
        }
        void this.log.debug("工具调用完成", { toolName, ok: true, roleId: result?.id ?? null });
        return result;
      }
      if (toolName === "spawn_agent") {
        const taskId = ctx.currentMessage?.taskId ?? null;
        const isRoot = ctx.agent?.id === "root";
        const isFromUser = ctx.currentMessage?.from === "user";

        const rawParent = args.parentAgentId;
        const creatorId = ctx.agent?.id ?? null;
        if (!creatorId) return { error: "missing_creator_agent" };

        // 验证 TaskBrief（Requirements 1.4）
        const taskBrief = args?.taskBrief;
        const taskBriefValidation = validateTaskBrief(taskBrief);
        if (!taskBriefValidation.valid) {
          void this.log.warn("spawn_agent TaskBrief 验证失败（已拦截）", {
            agentId: creatorId,
            errors: taskBriefValidation.errors
          });
          return { 
            error: "invalid_task_brief", 
            missing_fields: taskBriefValidation.errors 
          };
        }

        const currentRoleId = ctx.agent?.roleId ?? null;
        const targetRoleId = args?.roleId ?? null;
        const targetRole = targetRoleId ? this.org.getRole(String(targetRoleId)) : null;
        if (!targetRole) {
          void this.log.warn("spawn_agent 目标岗位不存在（已拦截）", { agentId: creatorId, roleId: targetRoleId ?? null });
          return { error: "unknown_role", roleId: targetRoleId ?? null };
        }
        const isChildRole = String(targetRole.createdBy ?? "") === String(creatorId) && String(targetRole.id) !== String(currentRoleId ?? "");
        if (!isChildRole) {
          void this.log.warn("spawn_agent 非子岗位（已拦截）", {
            agentId: creatorId,
            roleId: targetRole.id,
            roleCreatedBy: targetRole.createdBy ?? null,
            currentRoleId: currentRoleId ?? null
          });
          return {
            error: "not_child_role",
            roleId: targetRole.id,
            roleCreatedBy: targetRole.createdBy ?? null,
            currentRoleId: currentRoleId ?? null
          };
        }

        const missingParent =
          rawParent === null || rawParent === undefined || rawParent === "" || rawParent === "null" || rawParent === "undefined";
        if (!missingParent && String(rawParent) !== String(creatorId)) {
          void this.log.warn("spawn_agent 的 parentAgentId 非创建者（已拦截）", {
            creatorId,
            parentAgentId: rawParent
          });
          return { error: "invalid_parentAgentId", expected: creatorId, got: rawParent };
        }
        const parentAgentId = missingParent ? creatorId : rawParent;

        if (isRoot && taskId) {
          const existing = this._rootTaskAgentByTaskId.get(taskId);
          if (existing) {
            if (args.roleId && existing.roleId && String(args.roleId) !== String(existing.roleId)) {
              void this.log.warn("根智能体尝试创建不同岗位子智能体（已强制复用）", {
                taskId,
                existing,
                requestedRoleId: args.roleId
              });
            }
            const result = { id: existing.id, roleId: existing.roleId, roleName: existing.roleName };
            if (isFromUser && !this._rootTaskEntryAgentAnnouncedByTaskId.has(taskId)) {
              this.bus.send({
                to: "user",
                from: "root",
                taskId,
                payload: { agentId: existing.id }
              });
              this._rootTaskEntryAgentAnnouncedByTaskId.add(taskId);
            }
            void this.log.debug("工具调用完成", { toolName, ok: true, agentId: existing.id, reused: true });
            return result;
          }
        }

        const agent = await ctx.tools.spawnAgent({ roleId: args.roleId, parentAgentId, taskBrief });
        const result = { id: agent.id, roleId: agent.roleId, roleName: agent.roleName };
        
        // 存储 TaskBrief（用于后续注入上下文）
        this._agentTaskBriefs.set(agent.id, taskBrief);
        
        // 初始化子智能体的联系人注册表（Requirements 2.1, 2.2, 2.8）
        const collaborators = taskBrief?.collaborators ?? [];
        this.contactManager.initRegistry(agent.id, parentAgentId, collaborators);
        
        // 将子智能体添加到父智能体的联系人注册表（Requirements 2.5）
        this.contactManager.addContact(parentAgentId, {
          id: agent.id,
          role: agent.roleName,
          source: 'child'
        });
        
        if (isRoot && taskId) {
          this._rootTaskAgentByTaskId.set(taskId, result);
          if (isFromUser && !this._rootTaskEntryAgentAnnouncedByTaskId.has(taskId)) {
            this.bus.send({
              to: "user",
              from: "root",
              taskId,
              payload: { agentId: agent.id }
            });
            this._rootTaskEntryAgentAnnouncedByTaskId.add(taskId);
          }
        }
        void this.log.debug("工具调用完成", { toolName, ok: true, agentId: agent.id });
        return result;
      }
      if (toolName === "send_message") {
        // from 字段由系统自动填充，忽略调用者提供的 from 字段（Requirements 9.1, 9.5）
        const senderId = ctx.agent?.id ?? "unknown";
        const recipientId = String(args?.to ?? "");
        
        // 验证收件人存在（对于 root 和 user 特殊处理）
        const isRecipientSpecial = recipientId === "root" || recipientId === "user";
        if (!recipientId || (!isRecipientSpecial && !this._agents.has(recipientId))) {
          void this.log.warn("send_message 收件人不存在（已拦截）", { to: recipientId, from: senderId });
          return { error: "unknown_recipient", to: recipientId };
        }
        
        // 联系人验证：检查接收者是否在发送者的 Contact_Registry 中（Requirements 2.6）
        // 只有当发送者有联系人注册表时才进行验证
        if (this.contactManager.hasRegistry(senderId)) {
          const canSend = this.contactManager.canSendMessage(senderId, recipientId);
          if (!canSend.allowed) {
            void this.log.warn("send_message 联系人验证失败（已拦截）", { 
              from: senderId, 
              to: recipientId, 
              error: canSend.error 
            });
            return { error: canSend.error, to: recipientId };
          }
        }
        
        // 获取当前消息的 taskId（由系统自动传递）
        const currentTaskId = ctx.currentMessage?.taskId ?? null;
        
        // 消息路由验证：非 root/user 智能体只能与 root、user 和同一 task 内的智能体通信
        const isRootOrUser = senderId === "root" || senderId === "user";
        
        if (!isRootOrUser && !isRecipientSpecial) {
          // 普通智能体之间的通信，需要验证是否在同一 task 内
          const senderTaskId = this._getAgentTaskId(senderId);
          const recipientTaskId = this._getAgentTaskId(recipientId);
          
          if (senderTaskId !== recipientTaskId) {
            void this.log.warn("send_message 跨任务通信被拦截", { 
              from: senderId, 
              to: recipientId, 
              senderTaskId, 
              recipientTaskId 
            });
            return { error: "cross_task_communication_denied", from: senderId, to: recipientId };
          }
        }
        
        // 首次消息双向联系：自动将发送者添加到接收者的 Contact_Registry（Requirements 5.2）
        if (this.contactManager.hasRegistry(recipientId)) {
          const recipientContact = this.contactManager.getContact(recipientId, senderId);
          if (!recipientContact) {
            this.contactManager.addContact(recipientId, {
              id: senderId,
              role: ctx.agent?.roleName ?? 'unknown',
              source: 'first_message'
            });
            void this.log.debug("首次消息：自动添加发送者到接收者联系人列表", {
              sender: senderId,
              recipient: recipientId
            });
          }
        }
        
        // 消息类型验证：可选验证，不阻止发送但记录警告（Requirements 8.5）
        const messageValidation = validateMessageFormat(args.payload);
        if (!messageValidation.valid) {
          void this.log.warn("send_message 消息格式验证警告（不阻止发送）", {
            from: senderId,
            to: recipientId,
            message_type: messageValidation.message_type,
            errors: messageValidation.errors
          });
        }
        
        const messageId = ctx.tools.sendMessage({
          to: recipientId,
          from: senderId, // 系统自动填充 from 字段
          taskId: currentTaskId, // 系统自动传递 taskId
          payload: args.payload
        });
        const result = { messageId };
        void this.log.debug("工具调用完成", { toolName, ok: true, messageId });
        
        // 记录智能体发送消息的生命周期事件
        void this.loggerRoot.logAgentLifecycleEvent("agent_message_sent", {
          agentId: senderId,
          messageId,
          to: recipientId,
          taskId: currentTaskId
        });
        
        return result;
      }
      if (toolName === "wait_for_message") {
        ctx.yieldRequested = true;
        const result = { ok: true };
        void this.log.debug("工具调用完成", { toolName, ok: true });
        return result;
      }
      if (toolName === "put_artifact") {
        const ref = await ctx.tools.putArtifact({ type: args.type, content: args.content, meta: args.meta });
        const result = { artifactRef: ref };
        void this.log.debug("工具调用完成", { toolName, ok: true, artifactRef: ref });
        return result;
      }
      if (toolName === "get_artifact") {
        const result = await ctx.tools.getArtifact(args.ref);
        void this.log.debug("工具调用完成", { toolName, ok: true, found: Boolean(result) });
        return result;
      }
      if (toolName === "console_print") {
        process.stdout.write(String(args.text ?? ""));
        void this.log.debug("工具调用完成", { toolName, ok: true, length: String(args.text ?? "").length });
        return { ok: true };
      }
      if (toolName === "terminate_agent") {
        const result = await this._executeTerminateAgent(ctx, args);
        void this.log.debug("工具调用完成", { toolName, ok: !result.error, agentId: args.agentId });
        return result;
      }
      if (toolName === "spawn_agent_with_task") {
        // spawn_agent_with_task: 创建智能体并立即发送任务消息（二合一接口）
        const result = await this._executeSpawnAgentWithTask(ctx, args);
        void this.log.debug("工具调用完成", { toolName, ok: !result.error, agentId: result.id ?? null });
        return result;
      }
      if (toolName === "run_javascript") {
        const result = await this._runJavaScriptTool(args);
        void this.log.debug("工具调用完成", { toolName, ok: true });
        return result;
      }
      if (toolName === "compress_context") {
        const result = this._executeCompressContext(ctx, args);
        void this.log.debug("工具调用完成", { toolName, ok: !result.error, compressed: result.compressed ?? false });
        return result;
      }
      if (toolName === "get_context_status") {
        const agentId = ctx.agent?.id ?? null;
        if (!agentId) {
          return { error: "missing_agent_id" };
        }
        const status = this._conversationManager.getContextStatus(agentId);
        const result = {
          usedTokens: status.usedTokens,
          maxTokens: status.maxTokens,
          usagePercent: status.usagePercent,
          usagePercentStr: (status.usagePercent * 100).toFixed(1) + '%',
          status: status.status,
          thresholds: {
            warning: this._conversationManager.contextLimit.warningThreshold,
            critical: this._conversationManager.contextLimit.criticalThreshold,
            hardLimit: this._conversationManager.contextLimit.hardLimitThreshold
          }
        };
        void this.log.debug("工具调用完成", { toolName, ok: true, status: result.status });
        return result;
      }
      if (toolName === "http_request") {
        const agentId = ctx.agent?.id ?? null;
        if (!agentId) {
          return { error: "missing_agent_id" };
        }
        const { response, error, requestLog } = await this.httpClient.request(agentId, {
          url: args.url,
          method: args.method,
          headers: args.headers,
          body: args.body,
          timeoutMs: args.timeoutMs
        });
        if (error) {
          void this.log.debug("工具调用完成", { toolName, ok: false, error, requestId: requestLog.requestId });
          return { 
            error, 
            requestId: requestLog.requestId,
            latencyMs: requestLog.latencyMs ?? null
          };
        }
        const result = {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
          body: response.body,
          latencyMs: response.latencyMs,
          requestId: requestLog.requestId
        };
        void this.log.debug("工具调用完成", { toolName, ok: true, requestId: requestLog.requestId, status: response.status });
        return result;
      }
      if (toolName === "read_file") {
        const taskId = this._getTaskIdForAgent(ctx.agent?.id);
        if (!taskId) {
          return { error: "workspace_not_bound", message: "当前智能体未绑定工作空间" };
        }
        const result = await this.workspaceManager.readFile(taskId, args.path);
        void this.log.debug("工具调用完成", { toolName, ok: !result.error, path: args.path });
        return result;
      }
      if (toolName === "write_file") {
        const taskId = this._getTaskIdForAgent(ctx.agent?.id);
        if (!taskId) {
          return { error: "workspace_not_bound", message: "当前智能体未绑定工作空间" };
        }
        const result = await this.workspaceManager.writeFile(taskId, args.path, args.content);
        void this.log.debug("工具调用完成", { toolName, ok: result.ok, path: args.path });
        return result;
      }
      if (toolName === "list_files") {
        const taskId = this._getTaskIdForAgent(ctx.agent?.id);
        if (!taskId) {
          return { error: "workspace_not_bound", message: "当前智能体未绑定工作空间" };
        }
        const result = await this.workspaceManager.listFiles(taskId, args.path ?? ".");
        void this.log.debug("工具调用完成", { toolName, ok: !result.error, path: args.path ?? "." });
        return result;
      }
      if (toolName === "get_workspace_info") {
        const taskId = this._getTaskIdForAgent(ctx.agent?.id);
        if (!taskId) {
          return { error: "workspace_not_bound", message: "当前智能体未绑定工作空间" };
        }
        const result = await this.workspaceManager.getWorkspaceInfo(taskId);
        void this.log.debug("工具调用完成", { toolName, ok: !result.error });
        return result;
      }
      if (toolName === "run_command") {
        const taskId = this._getTaskIdForAgent(ctx.agent?.id);
        if (!taskId) {
          return { error: "workspace_not_bound", message: "当前智能体未绑定工作空间" };
        }
        const workspacePath = this.workspaceManager.getWorkspacePath(taskId);
        if (!workspacePath) {
          return { error: "workspace_not_bound", message: "工作空间路径未找到" };
        }
        const result = await this.commandExecutor.execute(workspacePath, args.command, {
          timeoutMs: args.timeoutMs
        });
        void this.log.debug("工具调用完成", { toolName, ok: !result.error, command: args.command });
        return result;
      }
      void this.log.warn("未知工具调用", { toolName });
      return { error: `unknown_tool:${toolName}` };
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
    if (!this.llm) return;

    const agentId = ctx.agent?.id ?? null;

    // 检查上下文是否已超过硬性限制
    if (agentId && this._conversationManager.isContextExceeded(agentId)) {
      const status = this._conversationManager.getContextStatus(agentId);
      void this.log.error("上下文超过硬性限制，拒绝 LLM 调用", {
        agentId,
        usedTokens: status.usedTokens,
        maxTokens: status.maxTokens,
        usagePercent: (status.usagePercent * 100).toFixed(1) + '%'
      });
      
      // 向父智能体发送错误通知
      const parentAgentId = this._agentMetaById.get(agentId)?.parentAgentId ?? null;
      if (parentAgentId && this._agents.has(parentAgentId)) {
        this.bus.send({
          to: parentAgentId,
          from: agentId,
          taskId: message?.taskId ?? null,
          payload: {
            kind: "error",
            errorType: "context_limit_exceeded",
            message: `智能体 ${agentId} 上下文超过硬性限制 (${(status.usagePercent * 100).toFixed(1)}%)，无法继续处理`,
            agentId,
            usedTokens: status.usedTokens,
            maxTokens: status.maxTokens,
            usagePercent: status.usagePercent,
            originalMessageId: message?.id ?? null
          }
        });
      }
      return;
    }

    ctx.currentMessage = message;
    const systemPrompt = this._buildSystemPromptForAgent(ctx);
    const conv = this._ensureConversation(ctx.agent.id, systemPrompt);
    
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
        msg = await this.llm.chat({ messages: conv, tools, meta: llmMeta });
      } catch (err) {
        const text = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
        void this.log.error("LLM 调用失败", { agentId: ctx.agent?.id ?? null, messageId: message?.id ?? null, message: text });
        this._stopRequested = true;
        return;
      }
      if (!msg) return;
      
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
        
        return;
      }

      const toolNames = toolCalls.map((c) => c?.function?.name).filter(Boolean);
      void this.log.debug("LLM 返回工具调用", {
        agentId: ctx.agent?.id ?? null,
        count: toolCalls.length,
        toolNames
      });

      for (const call of toolCalls) {
        let args = {};
        try {
          args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
        } catch {
          args = {};
        }
        void this.log.debug("解析工具调用参数", { name: call.function?.name ?? null });
        const result = await this.executeToolCall(ctx, call.function?.name, args);
        conv.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify(result ?? null)
        });
      }
      if (ctx.yieldRequested) {
        ctx.yieldRequested = false;
        return;
      }
    }
    void this.log.warn("工具调用轮次达到上限，强制停止本次处理", {
      agentId: ctx.agent?.id ?? null,
      messageId: message?.id ?? null,
      maxToolRounds: this.maxToolRounds
    });

    // 向父智能体发送错误通知（需求 5.3）
    if (agentId) {
      const parentAgentId = this._agentMetaById.get(agentId)?.parentAgentId ?? null;
      if (parentAgentId && this._agents.has(parentAgentId)) {
        this.bus.send({
          to: parentAgentId,
          from: agentId,
          taskId: message?.taskId ?? null,
          payload: {
            kind: "error",
            errorType: "max_tool_rounds_exceeded",
            message: `智能体 ${agentId} 超过最大工具调用轮次限制 (${this.maxToolRounds})`,
            agentId,
            maxToolRounds: this.maxToolRounds,
            originalMessageId: message?.id ?? null
          }
        });
        void this.log.info("已向父智能体发送工具调用超限通知", {
          agentId,
          parentAgentId,
          maxToolRounds: this.maxToolRounds
        });
      }
    }
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
      return rootPrompt + runtimeInfo;
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
      taskText: ""
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
      tools,
      agent: agent ?? null
    };
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

    // 处理待处理消息（在终止前处理完队列中的消息）
    await this._drainAgentQueue(targetId);

    // 清理智能体注册
    this._agents.delete(targetId);

    // 清理会话上下文
    this._conversations.delete(targetId);

    // 清理智能体元数据
    this._agentMetaById.delete(targetId);

    // 清理空闲跟踪数据
    this._agentLastActivityTime.delete(targetId);
    this._idleWarningEmitted.delete(targetId);

    // 持久化终止事件到组织状态
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
    const messageId = this.bus.send({
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
      messageId,
      taskId
    });

    // 记录智能体发送消息的生命周期事件
    void this.loggerRoot.logAgentLifecycleEvent("agent_message_sent", {
      agentId: creatorId,
      messageId,
      to: newAgentId,
      taskId
    });

    return {
      id: newAgentId,
      roleId: spawnResult.roleId,
      roleName: spawnResult.roleName,
      messageId
    };
  }

  async _runJavaScriptTool(args) {
    const code = args?.code;
    const input = args?.input;
    if (typeof code !== "string") return { error: "invalid_args", message: "code must be a string" };
    if (code.length > 20000) return { error: "code_too_large", maxLength: 20000, length: code.length };

    const blocked = this._detectBlockedJavaScriptTokens(code);
    if (blocked.length > 0) return { error: "blocked_code", blocked };

    try {
      const prelude =
        '"use strict";\n' +
        "const require=undefined, process=undefined, globalThis=undefined, module=undefined, exports=undefined, __filename=undefined, __dirname=undefined;\n" +
        "const fetch=undefined, XMLHttpRequest=undefined, WebSocket=undefined;\n";
      const fn = new Function("input", prelude + String(code));
      let value = fn(input);
      if (value && (typeof value === "object" || typeof value === "function") && typeof value.then === "function") {
        value = await value;
      }
      const jsonSafe = this._toJsonSafeValue(value);
      if (jsonSafe.error) return jsonSafe;
      return jsonSafe.value;
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err ?? "unknown error");
      return { error: "js_execution_failed", message };
    }
  }

  _detectBlockedJavaScriptTokens(code) {
    const tokens = [
      "require",
      "process",
      "child_process",
      "fs",
      "os",
      "net",
      "http",
      "https",
      "dgram",
      "worker_threads",
      "vm",
      "import(",
      "Deno",
      "Bun"
    ];
    const found = [];
    for (const t of tokens) {
      if (code.includes(t)) found.push(t);
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
    this._shutdownStartTime = null;

    const shutdown = async (signal) => {
      // 如果已经在关闭中，第二次信号强制退出
      if (this._isShuttingDown) {
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
        void this.log.info("状态持久化完成");
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void this.log.error("状态持久化失败", { error: message });
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
      void this.log.info("状态持久化完成");
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err);
      void this.log.error("状态持久化失败", { error: message });
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

    return {
      ok: true,
      pendingMessages: pendingCount,
      activeAgents: processedAgents,
      shutdownDuration
    };
  }
}
