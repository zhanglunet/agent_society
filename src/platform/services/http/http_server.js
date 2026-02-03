import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createNoopModuleLogger, formatLocalTime } from "../../utils/logger/logger.js";
import { UiCommandBroker } from "../ui/ui_command_broker.js";
import { WorkspaceManager } from "../workspace/workspace_manager.js";

/**
 * HTTP服务器组件：提供REST API接口与Agent Society交互。
 * 
 * 端点：
 * - POST /api/submit - 提交需求给根智能体
 * - POST /api/send - 发送消息到指定智能体
 * - GET /api/messages/:taskId - 查询任务消息（按taskId）
 * - GET /api/agents - 列出所有智能体（含持久化数据）
 * - GET /api/roles - 列出所有岗位及智能体数量（含 toolGroups）
 * - GET /api/tool-groups - 获取所有可用工具组列表
 * - POST /api/role/:roleId/tool-groups - 更新岗位工具组配置
 * - GET /api/agent-messages/:agentId - 查询智能体消息（按agentId）
 * - GET /api/agent/:agentId/system-prompt - 获取智能体的完整 system prompt
 * - GET /api/org/tree - 获取组织层级树结构
 * - GET /api/org/role-tree - 获取岗位从属关系树结构
 * - POST /api/agent/:agentId/custom-name - 设置智能体自定义名称
 * - GET /api/agent-custom-names - 获取所有智能体自定义名称
 * - POST /api/role/:roleId/prompt - 更新岗位职责提示词
 * - GET /api/config/status - 获取配置状态
 * - GET /api/config/llm - 获取 LLM 配置
 * - POST /api/config/llm - 保存 LLM 配置
 * - GET /api/config/llm-services - 获取 LLM 服务列表配置
 * - POST /api/config/llm-services - 添加 LLM 服务
 * - POST /api/config/llm-services/:serviceId - 更新 LLM 服务
 * - DELETE /api/config/llm-services/:serviceId - 删除 LLM 服务
 * - GET /api/workspaces - 获取工作空间列表
 * - GET /api/workspaces/:workspaceId - 获取工作空间文件列表
 * - GET /api/workspaces/:workspaceId/file?path=xxx - 获取工作空间文件元数据
 * - GET /api/workspaces/:workspaceId/meta - 获取工作空间元信息
 * - GET /web/* - 静态文件服务
 * - GET /workspace-files/:workspaceId/:filePath - 工作空间文件服务
 */
export class HTTPServer {
  /**
   * @param {{port?:number, society?:any, logger?:any, runtimeDir?:string, configService?:any}} options
   */
  constructor(options = {}) {
    this.port = options.port ?? 3000;
    this.society = options.society ?? null;
    this.log = options.logger ?? createNoopModuleLogger();
    this._server = null;
    this._messagesByTaskId = new Map(); // taskId -> messages[]
    this._isRunning = false;
    
    // 消息存储相关
    this._runtimeDir = options.runtimeDir ?? null;
    this._messagesByAgent = new Map(); // agentId -> messages[]
    this._messagesById = new Map(); // messageId -> message（用于去重）
    
    // 自定义名称存储
    this._customNames = new Map(); // agentId -> customName
    
    // 配置服务
    this._configService = options.configService ?? null;
    
    // LLM 连接状态跟踪
    this._llmStatus = "unknown"; // "connected" | "disconnected" | "error" | "unknown"
    this._llmLastError = null;
    
    // 错误和重试事件存储（用于前端轮询）
    this._recentErrors = []; // 最近的错误事件
    this._recentRetries = []; // 最近的重试事件
    this._maxRecentEvents = 50; // 最多保留的事件数量

    this._uiCommandBroker = new UiCommandBroker({ logger: this.log });

    // 初始化工作区管理器
    this._workspaceManager = new WorkspaceManager({
      workspacesDir: options.workspacesDir || (this._runtimeDir ? path.join(this._runtimeDir, "workspaces") : null),
      logger: this.log
    });
  }

  /**
   * 设置配置服务。
   * @param {any} configService - ConfigService 实例
   */
  setConfigService(configService) {
    this._configService = configService;
  }

  /**
   * 设置运行时对象。
   * @param {any} runtime - Runtime 实例
   */
  setRuntime(runtime) {
    this._runtime = runtime;
    if (runtime && runtime.uiCommandBroker) {
      this._uiCommandBroker = runtime.uiCommandBroker;
    }
    if (runtime && runtime.workspaceManager) {
      this._workspaceManager = runtime.workspaceManager;
    }
  }

  /**
   * 设置 LLM 连接状态。
   * @param {"connected"|"disconnected"|"error"} status - 连接状态
   * @param {string|null} error - 错误消息（仅当 status 为 "error" 时）
   */
  setLlmStatus(status, error = null) {
    this._llmStatus = status;
    this._llmLastError = error;
    void this.log.debug("LLM 状态更新", { status, error });
  }

  /**
   * 设置运行时数据目录。
   * @param {string} runtimeDir
   */
  setRuntimeDir(runtimeDir) {
    this._runtimeDir = runtimeDir;
    // 不再这里更新工作区管理器的目录，因为在 setRuntime 中已经继承了 Runtime 的 workspaceManager，
    // 其目录由 Runtime 统一管理。在这里修改会导致路径不一致（runtimeDir/workspaces vs dataDir/workspaces）。
  }

  /**
   * 获取消息存储目录路径。
   * @returns {string|null}
   */
  _getMessagesDir() {
    if (!this._runtimeDir) return null;
    return path.join(this._runtimeDir, "web", "messages");
  }

  /**
   * 获取自定义名称存储文件路径。
   * @returns {string|null}
   */
  _getCustomNamesFilePath() {
    if (!this._runtimeDir) return null;
    return path.join(this._runtimeDir, "web", "custom-names.json");
  }

  /**
   * 加载自定义名称配置。
   * @returns {Promise<void>}
   */
  async _loadCustomNames() {
    const filePath = this._getCustomNamesFilePath();
    if (!filePath) return;

    try {
      if (!existsSync(filePath)) {
        return;
      }
      const content = await readFile(filePath, "utf8");
      const data = JSON.parse(content);
      this._customNames.clear();
      for (const [agentId, customName] of Object.entries(data)) {
        if (customName && typeof customName === "string") {
          this._customNames.set(agentId, customName);
        }
      }
      void this.log.debug("加载自定义名称", { count: this._customNames.size });
    } catch (err) {
      void this.log.warn("加载自定义名称失败", { error: err.message });
    }
  }

  /**
   * 保存自定义名称配置。
   * @returns {Promise<void>}
   */
  async _saveCustomNames() {
    const filePath = this._getCustomNamesFilePath();
    if (!filePath) return;

    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      await mkdir(dir, { recursive: true });

      const data = Object.fromEntries(this._customNames);
      await writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
      void this.log.debug("保存自定义名称", { count: this._customNames.size });
    } catch (err) {
      void this.log.error("保存自定义名称失败", { error: err.message });
      throw err;
    }
  }

  /**
   * 设置智能体自定义名称。
   * @param {string} agentId - 智能体ID
   * @param {string} customName - 自定义名称（空字符串表示清除）
   * @returns {Promise<void>}
   */
  async setCustomName(agentId, customName) {
    if (customName && typeof customName === "string" && customName.trim()) {
      this._customNames.set(agentId, customName.trim());
    } else {
      this._customNames.delete(agentId);
    }
    await this._saveCustomNames();
  }

  /**
   * 获取智能体自定义名称。
   * @param {string} agentId - 智能体ID
   * @returns {string|null} 自定义名称，如果没有则返回null
   */
  getCustomName(agentId) {
    return this._customNames.get(agentId) || null;
  }

  /**
   * 获取所有自定义名称。
   * @returns {object} agentId -> customName 映射
   */
  getAllCustomNames() {
    return Object.fromEntries(this._customNames);
  }

  /**
   * 确保消息存储目录存在。
   * @returns {Promise<void>}
   */
  async _ensureMessagesDir() {
    const dir = this._getMessagesDir();
    if (dir) {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * 从文件加载指定智能体的消息。
   * @param {string} agentId - 智能体ID
   * @returns {Promise<any[]>} 消息列表
   */
  async _loadMessagesForAgent(agentId) {
    // 如果内存中已有，直接返回
    if (this._messagesByAgent.has(agentId)) {
      return this._messagesByAgent.get(agentId);
    }

    const dir = this._getMessagesDir();
    if (!dir) {
      return [];
    }

    const filePath = path.join(dir, `${agentId}.jsonl`);
    const messages = [];
    const localMessageIds = new Set(); // 用于单个智能体内部去重

    try {
      if (!existsSync(filePath)) {
        this._messagesByAgent.set(agentId, messages);
        return messages;
      }

      const content = await readFile(filePath, "utf8");
      const lines = content.split("\n").filter(line => line.trim());

      for (const line of lines) {
        try {
          const msg = JSON.parse(line);
          // 去重：只在当前智能体的消息列表内去重，不跨智能体去重
          if (!localMessageIds.has(msg.id)) {
            messages.push(msg);
            localMessageIds.add(msg.id);
            // 同时更新全局索引（用于快速查找）
            this._messagesById.set(msg.id, msg);
          }
        } catch (parseErr) {
          // 跳过解析失败的行，继续加载其他消息
          void this.log.warn("消息解析失败，已跳过", { agentId, error: parseErr.message });
        }
      }

      // 按时间排序
      messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      this._messagesByAgent.set(agentId, messages);
      
      void this.log.debug("加载智能体消息", { agentId, count: messages.length });
    } catch (err) {
      void this.log.warn("加载消息文件失败", { agentId, error: err.message });
    }

    return messages;
  }

  /**
   * 追加消息到智能体的消息文件。
   * @param {string} agentId - 智能体ID
   * @param {object} message - 消息对象
   * @returns {Promise<void>}
   */
  async _appendMessageToFile(agentId, message) {
    const dir = this._getMessagesDir();
    if (!dir) return;

    await this._ensureMessagesDir();
    const filePath = path.join(dir, `${agentId}.jsonl`);
    const line = JSON.stringify(message) + "\n";

    try {
      await appendFile(filePath, line, "utf8");
    } catch (err) {
      void this.log.error("追加消息到文件失败", { agentId, error: err.message });
    }
  }

  /**
   * 存储消息到内存和文件。
   * @param {object} message - 消息对象
   * @returns {Promise<void>}
   */
  async _storeMessage(message) {
    // 检查是否是延迟消息的投递
    const existingMessage = this._messagesById.get(message.id);
    if (existingMessage) {
      // 如果是延迟消息投递（有 deliveredAt 字段），需要存储到收件人的消息列表
      if (message.deliveredAt && existingMessage.scheduledDeliveryTime) {
        // 创建收件人视角的消息（用实际投递时间作为 createdAt）
        const recipientMessage = {
          ...existingMessage,
          createdAt: message.deliveredAt,  // 用实际投递时间
          deliveredAt: message.deliveredAt,
          scheduledDeliveryTime: undefined  // 收件人不需要看到预计时间
        };
        delete recipientMessage.scheduledDeliveryTime;
        
        const to = existingMessage.to;
        const from = existingMessage.from;
        
        // 只存储到收件人的消息列表（发送者已经在发送时存储过了）
        if (to && to !== from) {
          if (!this._messagesByAgent.has(to)) {
            this._messagesByAgent.set(to, []);
          }
          this._messagesByAgent.get(to).push(recipientMessage);
          await this._appendMessageToFile(to, recipientMessage);
        }
        
        // 更新发送者消息的 deliveredAt 字段
        existingMessage.deliveredAt = message.deliveredAt;
        return;
      }
      // 其他情况跳过（真正的重复消息）
      return;
    }
    
    this._messagesById.set(message.id, message);

    const { from, to } = message;
    const isDelayedMessage = !!message.scheduledDeliveryTime;

    // 存储到发送者的消息列表
    if (from) {
      if (!this._messagesByAgent.has(from)) {
        this._messagesByAgent.set(from, []);
      }
      this._messagesByAgent.get(from).push(message);
      await this._appendMessageToFile(from, message);
    }

    // 存储到接收者的消息列表（如果不同于发送者）
    // 延迟消息在发送时不存储到收件人列表，等投递时再存储
    if (to && to !== from && !isDelayedMessage) {
      if (!this._messagesByAgent.has(to)) {
        this._messagesByAgent.set(to, []);
      }
      this._messagesByAgent.get(to).push(message);
      await this._appendMessageToFile(to, message);
    }
  }

  /**
   * 设置关联的AgentSociety实例。
   * @param {any} society
   */
  setSociety(society) {
    this.society = society;
    // 注册消息监听器，收集所有消息
    if (society) {
      // 监听用户收到的消息（保持原有功能）
      society.onUserMessage((message) => {
        const taskId = message?.taskId;
        if (taskId) {
          if (!this._messagesByTaskId.has(taskId)) {
            this._messagesByTaskId.set(taskId, []);
          }
          this._messagesByTaskId.get(taskId).push({
            id: message.id,
            from: message.from,
            to: message.to ?? "user",
            taskId: message.taskId,
            payload: message.payload,
            createdAt: message.createdAt
          });
        }
        // 同时存储到按智能体分组的存储中
        void this._storeMessage({
          id: message.id,
          from: message.from,
          to: message.to ?? "user",
          taskId: message.taskId,
          payload: message.payload,
          createdAt: message.createdAt
        });
      });

      // 监听所有消息（如果 society 支持）
      if (typeof society.onAllMessages === "function") {
        society.onAllMessages((message) => {
          void this._storeMessage({
            id: message.id,
            from: message.from,
            to: message.to,
            taskId: message.taskId,
            payload: message.payload,
            createdAt: message.createdAt
          });
        });
      }

      // 监听消息总线（如果可访问）
      if (society.runtime && society.runtime.bus) {
        const originalSend = society.runtime.bus.send.bind(society.runtime.bus);
        society.runtime.bus.send = (msg) => {
          const result = originalSend(msg);
          // 存储消息（包含延迟消息的预计到达时间）
          void this._storeMessage({
            id: result.messageId,
            from: msg.from,
            to: msg.to,
            taskId: msg.taskId,
            payload: msg.payload,
            createdAt: formatLocalTime(),
            scheduledDeliveryTime: result.scheduledDeliveryTime ?? null  // 延迟消息的预计到达时间
          });
          return result;
        };
        
        // 监听延迟消息投递事件（确保前端能看到延迟投递的消息）
        society.runtime.bus.onDelayedDelivery((message) => {
          void this._storeMessage({
            id: message.id,
            from: message.from,
            to: message.to,
            taskId: message.taskId,
            payload: message.payload,
            createdAt: message.createdAt,
            deliveredAt: formatLocalTime()  // 实际投递时间
          });
        });
      }

      // 监听工具调用事件（如果 runtime 支持）
      if (society.runtime && typeof society.runtime.onToolCall === "function") {
        society.runtime.onToolCall((event) => {
          void this._storeToolCall(event);
        });
      }
      
      // 监听错误事件（如果 runtime 支持）
      if (society.runtime && typeof society.runtime.onError === "function") {
        society.runtime.onError((event) => {
          this._storeErrorEvent(event);
        });
      }
      
      // 监听 LLM 重试事件（如果 runtime 支持）
      if (society.runtime && typeof society.runtime.onLlmRetry === "function") {
        society.runtime.onLlmRetry((event) => {
          this._storeRetryEvent(event);
        });
      }
      
      // 注册错误消息存储回调到 runtime
      if (society.runtime) {
        society.runtime._storeErrorMessageCallback = (message) => {
          void this._storeMessage(message);
        };
      }
    }
  }
  
  /**
   * 存储错误事件。
   * @param {{agentId: string, errorType: string, message: string, timestamp: string, [key: string]: any}} event
   */
  _storeErrorEvent(event) {
    this._recentErrors.push(event);
    // 限制存储数量
    if (this._recentErrors.length > this._maxRecentEvents) {
      this._recentErrors.shift();
    }
    void this.log.info("存储错误事件", { agentId: event.agentId, errorType: event.errorType, message: event.message });
  }
  
  /**
   * 存储重试事件。
   * @param {{agentId: string, attempt: number, maxRetries: number, delayMs: number, errorMessage: string, timestamp: string}} event
   */
  _storeRetryEvent(event) {
    this._recentRetries.push(event);
    // 限制存储数量
    if (this._recentRetries.length > this._maxRecentEvents) {
      this._recentRetries.shift();
    }
    void this.log.info("存储重试事件", { agentId: event.agentId, attempt: event.attempt, maxRetries: event.maxRetries, errorMessage: event.errorMessage });
  }
  
  /**
   * 获取最近的错误事件（并清除已获取的）。
   * @param {string} [since] - 只返回此时间戳之后的事件
   * @returns {{errors: Array, retries: Array}}
   */
  getRecentEvents(since) {
    let errors = this._recentErrors;
    let retries = this._recentRetries;
    
    if (since) {
      const sinceTime = new Date(since).getTime();
      errors = errors.filter(e => new Date(e.timestamp).getTime() > sinceTime);
      retries = retries.filter(e => new Date(e.timestamp).getTime() > sinceTime);
    }
    
    return { errors, retries };
  }

  /**
   * 存储工具调用记录。
   * @param {{agentId: string, toolName: string, args: object, result: any, taskId: string|null, callId: string, timestamp: string, usage?: {promptTokens: number, completionTokens: number, totalTokens: number}}} event
   * @returns {Promise<void>}
   */
  async _storeToolCall(event) {
    const { agentId, toolName, args, result, taskId, callId, timestamp, reasoningContent, usage } = event;
    if (!agentId) return;

    // send_message 已经作为消息显示，不需要重复显示为工具调用
    // 但需要将 reasoning_content 关联到发送的消息
    if (toolName === "send_message") {
      if (reasoningContent && result && result.messageId) {
        // 更新已存储的消息，添加 reasoning_content
        const message = this._messagesById.get(result.messageId);
        if (message) {
          message.reasoning_content = reasoningContent;
        }
      }
      return;
    }

    // 创建工具调用消息
    const toolCallMessage = {
      id: `tool-${callId}`,
      type: "tool_call",
      from: agentId,
      to: agentId,
      taskId,
      payload: {
        toolName,
        args,
        result,
        usage: usage ?? null
      },
      createdAt: timestamp
    };
    
    // 如果有思考内容，添加到消息中
    if (reasoningContent) {
      toolCallMessage.reasoning_content = reasoningContent;
    }

    // 存储到智能体的消息列表
    if (!this._messagesByAgent.has(agentId)) {
      this._messagesByAgent.set(agentId, []);
    }
    
    // 避免重复添加
    if (!this._messagesById.has(toolCallMessage.id)) {
      this._messagesById.set(toolCallMessage.id, toolCallMessage);
      this._messagesByAgent.get(agentId).push(toolCallMessage);
      await this._appendMessageToFile(agentId, toolCallMessage);
      
      // 重新按时间排序，确保工具调用消息显示在正确的位置
      const messages = this._messagesByAgent.get(agentId);
      messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    }
  }

  /**
   * 预加载所有已存在的消息文件。
   * @returns {Promise<void>}
   */
  async _preloadAllMessages() {
    const dir = this._getMessagesDir();
    if (!dir || !existsSync(dir)) {
      return;
    }

    try {
      const { readdir } = await import("node:fs/promises");
      const files = await readdir(dir);
      const jsonlFiles = files.filter(f => f.endsWith(".jsonl"));
      
      for (const file of jsonlFiles) {
        const agentId = file.replace(".jsonl", "");
        // 只加载尚未在内存中的智能体消息
        if (!this._messagesByAgent.has(agentId)) {
          await this._loadMessagesForAgent(agentId);
        }
      }
      
      void this.log.info("预加载消息完成", { 
        fileCount: jsonlFiles.length, 
        totalMessages: this._messagesById.size 
      });
    } catch (err) {
      void this.log.warn("预加载消息失败", { error: err.message });
    }
  }

  /**
   * 启动HTTP服务器。
   * @returns {Promise<{ok:boolean, port?:number, error?:string}>}
   */
  async start() {
    if (this._isRunning) {
      return { ok: true, port: this.port };
    }

    // 确保消息目录存在
    await this._ensureMessagesDir();
    
    // 预加载所有已存在的消息
    await this._preloadAllMessages();
    
    // 加载自定义名称
    await this._loadCustomNames();

    return new Promise((resolve) => {
      try {
        this._server = createServer((req, res) => {
          this._handleRequest(req, res).catch(err => {
            void this.log.error("处理请求时发生异常", { 
              error: err?.message ?? String(err),
              stack: err?.stack ?? null
            });
            try {
              this._sendJson(res, 500, { error: "internal_error", message: err?.message ?? String(err) });
            } catch (sendErr) {
              void this.log.error("发送错误响应失败", { error: sendErr?.message ?? String(sendErr) });
            }
          });
        });

        this._server.on("error", (err) => {
          const message = err && typeof err.message === "string" ? err.message : String(err);
          void this.log.error("HTTP服务器错误", { error: message, stack: err?.stack });
          resolve({ ok: false, error: message });
        });

        this._server.listen(this.port, () => {
          this._isRunning = true;
          void this.log.info("HTTP服务器启动", { port: this.port });
          resolve({ ok: true, port: this.port });
        });
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void this.log.error("HTTP服务器启动失败", { error: message, stack: err?.stack });
        resolve({ ok: false, error: message });
      }
    });
  }

  /**
   * 停止HTTP服务器。
   * @returns {Promise<{ok:boolean}>}
   */
  async stop() {
    if (!this._server || !this._isRunning) {
      return { ok: true };
    }

    return new Promise((resolve) => {
      this._server.close((err) => {
        this._isRunning = false;
        if (err) {
          const message = err && typeof err.message === "string" ? err.message : String(err);
          void this.log.error("HTTP服务器关闭错误", { error: message });
          resolve({ ok: false, error: message });
        } else {
          void this.log.info("HTTP服务器已关闭");
          resolve({ ok: true });
        }
      });
    });
  }

  /**
   * 检查服务器是否正在运行。
   * @returns {boolean}
   */
  isRunning() {
    return this._isRunning;
  }

  /**
   * 处理HTTP请求。
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  async _handleRequest(req, res) {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
      const method = req.method?.toUpperCase() ?? "GET";
      const pathname = url.pathname;

      void this.log.debug("收到HTTP请求", { method, pathname, url: req.url });

      // 设置CORS头
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");

      if (method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      // 路由分发
      if (method === "POST" && pathname === "/api/submit") {
        this._handleSubmit(req, res);
      } else if (method === "POST" && pathname === "/api/send") {
        this._handleSend(req, res);
      } else if (method === "POST" && pathname === "/api/root/new-session") {
        this._handleRootNewSession(req, res);
      } else if (method === "POST" && pathname === "/api/upload") {
        // 文件上传: POST /api/upload
        this._handleUpload(req, res).catch(err => {
          void this.log.error("处理文件上传请求失败", { error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "GET" && pathname.startsWith("/api/messages/")) {
        const taskId = pathname.slice("/api/messages/".length);
        this._handleGetMessages(taskId, res);
      } else if (method === "GET" && pathname === "/api/agents") {
        await this._handleGetAgents(res);
      } else if (method === "GET" && pathname === "/api/events") {
        // 获取最近的错误和重试事件
        this._handleGetEvents(req, res);
      } else if (method === "GET" && pathname === "/api/ui-commands/poll") {
        await this._handleUiCommandsPoll(req, res, url);
      } else if (method === "POST" && pathname === "/api/ui-commands/result") {
        this._handleUiCommandsResult(req, res);
      } else if (method === "GET" && pathname === "/api/roles") {
        this._handleGetRoles(res);
      } else if (method === "GET" && pathname === "/api/org-templates") {
        this._handleGetOrgTemplates(req, res).catch(err => {
          void this.log.error("处理组织模板列表请求失败", { error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "POST" && pathname === "/api/org-templates") {
        this._handleCreateOrgTemplate(req, res);
      } else if (method === "POST" && pathname.startsWith("/api/org-templates/") && pathname.endsWith("/rename")) {
        const match = pathname.match(/^\/api\/org-templates\/(.+)\/rename$/);
        if (match) {
          const orgName = decodeURIComponent(match[1]);
          this._handleRenameOrgTemplate(req, orgName, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "DELETE" && pathname.startsWith("/api/org-templates/")) {
        const orgName = decodeURIComponent(pathname.slice("/api/org-templates/".length));
        this._handleDeleteOrgTemplate(orgName, res).catch(err => {
          void this.log.error("处理删除组织模板请求失败", { orgName, error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "GET" && pathname.startsWith("/api/org-templates/") && pathname.endsWith("/info")) {
        const match = pathname.match(/^\/api\/org-templates\/(.+)\/info$/);
        if (match) {
          const orgName = decodeURIComponent(match[1]);
          this._handleGetOrgTemplateInfo(orgName, res).catch(err => {
            void this.log.error("处理组织模板 info.md 请求失败", { orgName, error: err.message, stack: err.stack });
            this._sendJson(res, 500, { error: "internal_error", message: err.message });
          });
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "PUT" && pathname.startsWith("/api/org-templates/") && pathname.endsWith("/info")) {
        const match = pathname.match(/^\/api\/org-templates\/(.+)\/info$/);
        if (match) {
          const orgName = decodeURIComponent(match[1]);
          this._handleUpdateOrgTemplateInfo(req, orgName, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "GET" && pathname.startsWith("/api/org-templates/") && pathname.endsWith("/org")) {
        const match = pathname.match(/^\/api\/org-templates\/(.+)\/org$/);
        if (match) {
          const orgName = decodeURIComponent(match[1]);
          this._handleGetOrgTemplateOrg(orgName, res).catch(err => {
            void this.log.error("处理组织模板 org.md 请求失败", { orgName, error: err.message, stack: err.stack });
            this._sendJson(res, 500, { error: "internal_error", message: err.message });
          });
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "PUT" && pathname.startsWith("/api/org-templates/") && pathname.endsWith("/org")) {
        const match = pathname.match(/^\/api\/org-templates\/(.+)\/org$/);
        if (match) {
          const orgName = decodeURIComponent(match[1]);
          this._handleUpdateOrgTemplateOrg(req, orgName, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "GET" && pathname === "/api/tool-groups") {
        // 获取工具组列表
        this._handleGetToolGroups(res);
      } else if (method === "POST" && pathname.startsWith("/api/role/") && pathname.endsWith("/tool-groups")) {
        // 更新岗位工具组: POST /api/role/:roleId/tool-groups
        const match = pathname.match(/^\/api\/role\/(.+)\/tool-groups$/);
        if (match) {
          const roleId = decodeURIComponent(match[1]);
          this._handleUpdateRoleToolGroups(req, roleId, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "DELETE" && pathname.startsWith("/api/agent/")) {
        // 删除智能体: DELETE /api/agent/:agentId
        const agentId = decodeURIComponent(pathname.slice("/api/agent/".length));
        this._handleDeleteAgent(req, agentId, res);
      } else if (method === "DELETE" && pathname.startsWith("/api/role/")) {
        // 删除岗位: DELETE /api/role/:roleId
        const roleId = decodeURIComponent(pathname.slice("/api/role/".length));
        this._handleDeleteRole(req, roleId, res);
      } else if (method === "GET" && pathname.startsWith("/api/agent-messages/")) {
        const agentId = decodeURIComponent(pathname.slice("/api/agent-messages/".length));
        // 异步处理
        this._handleGetAgentMessages(agentId, res).catch(err => {
          void this.log.error("处理智能体消息请求失败", { agentId, error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "GET" && pathname.startsWith("/api/agent-conversation/")) {
        const agentId = decodeURIComponent(pathname.slice("/api/agent-conversation/".length));
        // 异步处理
        this._handleGetAgentConversation(agentId, res).catch(err => {
          void this.log.error("处理智能体对话历史请求失败", { agentId, error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "GET" && pathname.startsWith("/api/agent/") && pathname.endsWith("/system-prompt")) {
        // 获取智能体 system prompt: GET /api/agent/:agentId/system-prompt
        const match = pathname.match(/^\/api\/agent\/(.+)\/system-prompt$/);
        if (match) {
          const agentId = decodeURIComponent(match[1]);
          this._handleGetAgentSystemPrompt(agentId, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "GET" && pathname === "/api/org/tree") {
        this._handleGetOrgTree(res);
      } else if (method === "GET" && pathname === "/api/org/role-tree") {
        this._handleGetRoleTree(res);
      } else if (method === "POST" && pathname.startsWith("/api/agent/") && pathname.endsWith("/custom-name")) {
        // 提取 agentId: /api/agent/:agentId/custom-name
        const match = pathname.match(/^\/api\/agent\/(.+)\/custom-name$/);
        if (match) {
          const agentId = decodeURIComponent(match[1]);
          this._handleSetCustomName(req, agentId, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "POST" && pathname.startsWith("/api/agent/") && pathname.endsWith("/abort")) {
        // 提取 agentId: /api/agent/:agentId/abort
        const match = pathname.match(/^\/api\/agent\/(.+)\/abort$/);
        if (match) {
          const agentId = decodeURIComponent(match[1]);
          await this._handleAbortLlmCall(agentId, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "GET" && pathname === "/api/agent-custom-names") {
        await this._handleGetCustomNames(res);
      } else if (method === "GET" && pathname === "/api/config/status") {
        // 获取配置状态
        this._handleGetConfigStatus(res);
      } else if (method === "GET" && pathname === "/api/config/llm") {
        // 获取 LLM 配置
        this._handleGetLlmConfig(res).catch(err => {
          void this.log.error("处理获取 LLM 配置请求失败", { error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "POST" && pathname === "/api/config/llm") {
        // 保存 LLM 配置
        this._handleSaveLlmConfig(req, res);
      } else if (method === "GET" && pathname === "/api/config/llm-services") {
        // 获取 LLM 服务列表配置
        this._handleGetLlmServicesConfig(res).catch(err => {
          void this.log.error("处理获取 LLM 服务配置请求失败", { error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "POST" && pathname === "/api/config/llm-services") {
        // 添加 LLM 服务
        this._handleAddLlmServiceConfig(req, res);
      } else if (method === "POST" && pathname.startsWith("/api/config/llm-services/")) {
        // 更新 LLM 服务: POST /api/config/llm-services/:serviceId
        const serviceId = decodeURIComponent(pathname.slice("/api/config/llm-services/".length));
        this._handleUpdateLlmServiceConfig(req, serviceId, res);
      } else if (method === "DELETE" && pathname.startsWith("/api/config/llm-services/")) {
        // 删除 LLM 服务: DELETE /api/config/llm-services/:serviceId
        const serviceId = decodeURIComponent(pathname.slice("/api/config/llm-services/".length));
        this._handleDeleteLlmServiceConfig(serviceId, res);
      } else if (method === "GET" && pathname === "/api/llm-services") {
        // 获取 LLM 服务列表
        this._handleGetLlmServices(res);
      } else if (method === "POST" && pathname.startsWith("/api/role/") && pathname.endsWith("/llm-service")) {
        // 更新岗位 LLM 服务: POST /api/role/:roleId/llm-service
        const match = pathname.match(/^\/api\/role\/(.+)\/llm-service$/);
        if (match) {
          const roleId = decodeURIComponent(match[1]);
          this._handleUpdateRoleLlmService(req, roleId, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "POST" && pathname.startsWith("/api/role/") && pathname.endsWith("/prompt")) {
        // 提取 roleId: /api/role/:roleId/prompt
        const match = pathname.match(/^\/api\/role\/(.+)\/prompt$/);
        if (match) {
          const roleId = decodeURIComponent(match[1]);
          this._handleUpdateRolePrompt(req, roleId, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if ((method === "GET" || method === "HEAD") && pathname.startsWith("/web/")) {
        // 异步处理静态文件
        this._handleStaticFile(req, pathname, res).catch(err => {
          void this.log.error("处理静态文件请求失败", { pathname, error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if ((method === "GET" || method === "HEAD") && (pathname === "/web" || pathname === "/")) {
        // 重定向到 /web/index.html
        this._handleStaticFile(req, "/web/index.html", res).catch(err => {
          void this.log.error("处理静态文件请求失败", { pathname: "/web/index.html", error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "GET" && pathname.startsWith("/workspace-files/")) {
        // 工作空间文件服务
        this._handleWorkspaceFile(pathname, res).catch(err => {
          void this.log.error("处理工作空间文件请求失败", { pathname, error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (pathname.startsWith("/api/modules")) {
        // 模块 API 路由
        this._handleModuleApi(req, res, method, pathname).catch(err => {
          void this.log.error("处理模块 API 请求失败", { pathname, error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "GET" && pathname === "/api/workspaces") {
        // 获取工作空间列表
        this._handleGetWorkspaces(res).catch(err => {
          void this.log.error("处理工作空间列表请求失败", { error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (pathname.startsWith("/api/workspaces/")) {
        // 工作空间相关API
        const parts = pathname.slice("/api/workspaces/".length).split("/");
        const workspaceId = decodeURIComponent(parts[0]);
        if (parts.length === 1 || (parts.length === 2 && parts[1] === "")) {
          if (method === "GET") {
            // 获取工作空间文件列表: GET /api/workspaces/:workspaceId
            this._handleGetWorkspaceFiles(workspaceId, res).catch(err => {
              void this.log.error("处理工作空间文件列表请求失败", { workspaceId, error: err.message, stack: err.stack });
              this._sendJson(res, 500, { error: "internal_error", message: err.message });
            });
          } else if (method === "DELETE") {
            // 删除工作空间: DELETE /api/workspaces/:workspaceId
            this._handleDeleteWorkspace(workspaceId, res).catch(err => {
              void this.log.error("处理删除工作空间请求失败", { workspaceId, error: err.message, stack: err.stack });
              this._sendJson(res, 500, { error: "internal_error", message: err.message });
            });
          }
        } else if (parts[1] === "file") {
          // 获取工作空间文件元数据: GET /api/workspaces/:workspaceId/file?path=xxx
          const filePath = url.searchParams.get("path") || "";
          if (method === "GET") {
            this._handleGetWorkspaceFile(workspaceId, filePath, res).catch(err => {
              void this.log.error("处理工作空间文件内容请求失败", { workspaceId, filePath, error: err.message, stack: err.stack });
              this._sendJson(res, 500, { error: "internal_error", message: err.message });
            });
          } else if (method === "POST") {
            this._handlePostWorkspaceFile(req, workspaceId, filePath, res).catch(err => {
              void this.log.error("处理工作空间文件写入请求失败", { workspaceId, filePath, error: err.message, stack: err.stack });
              this._sendJson(res, 500, { error: "internal_error", message: err.message });
            });
          } else if (method === "DELETE") {
            this._handleDeleteWorkspaceFile(workspaceId, filePath, res).catch(err => {
              void this.log.error("处理工作空间文件删除请求失败", { workspaceId, filePath, error: err.message, stack: err.stack });
              this._sendJson(res, 500, { error: "internal_error", message: err.message });
            });
          }
        } else if (parts[1] === "meta") {
          // 获取工作空间元信息: GET /api/workspaces/:workspaceId/meta
          this._handleGetWorkspaceMeta(workspaceId, res).catch(err => {
            void this.log.error("处理工作空间元信息请求失败", { workspaceId, error: err.message, stack: err.stack });
            this._sendJson(res, 500, { error: "internal_error", message: err.message });
          });
        } else if (parts[1] === "disk-usage") {
          // 获取工作空间空间占用: GET /api/workspaces/:workspaceId/disk-usage
          this._handleGetWorkspaceDiskUsage(workspaceId, res).catch(err => {
            void this.log.error("处理工作空间空间占用请求失败", { workspaceId, error: err.message, stack: err.stack });
            this._sendJson(res, 500, { error: "internal_error", message: err.message });
          });
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else {
        this._sendJson(res, 404, { error: "not_found", path: pathname });
      }
    } catch (err) {
      // 全局错误处理：捕获路由分发过程中的同步错误
      const message = err && typeof err.message === "string" ? err.message : String(err);
      const stack = err && err.stack ? err.stack : undefined;
      void this.log.error("HTTP请求处理异常", { 
        url: req.url, 
        method: req.method, 
        error: message,
        stack 
      });
      try {
        this._sendJson(res, 500, { error: "internal_error", message });
      } catch (sendErr) {
        // 如果响应也失败了，记录但不再抛出
        void this.log.error("发送错误响应失败", { error: sendErr.message });
      }
    }
  }

  /**
   * 处理 POST /api/submit - 提交需求给根智能体。
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  _handleSubmit(req, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      const text = body?.text;
      if (!text || typeof text !== "string") {
        this._sendJson(res, 400, { error: "missing_text", message: "请求体必须包含text字段" });
        return;
      }

      if (!this.society) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      // 调用User_Endpoint将需求转发给根智能体
      const result = await this.society.submitRequirement(text);
      
      if (result.error) {
        this._sendJson(res, 400, { error: result.error });
        return;
      }

      void this.log.info("HTTP提交需求", { taskId: result.taskId });
      this._sendJson(res, 200, { taskId: result.taskId });
    });
  }

  /**
   * 处理 POST /api/send - 发送消息到指定智能体。
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  _handleSend(req, res) {
    this._readJsonBody(req, (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      // 支持两种字段名：agentId/to 和 text/message
      const agentId = body?.agentId ?? body?.to;
      const text = body?.text ?? body?.message;
      const taskId = body?.taskId;
      const attachments = body?.attachments; // 附件数组

      if (!agentId || typeof agentId !== "string") {
        this._sendJson(res, 400, { error: "missing_agent_id", message: "请求体必须包含agentId或to字段" });
        return;
      }

      // 允许空文本（如果有附件）
      const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
      if ((!text || typeof text !== "string") && !hasAttachments) {
        this._sendJson(res, 400, { error: "missing_text", message: "请求体必须包含text或message字段，或者包含attachments" });
        return;
      }

      if (!this.society) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      // 构建消息 payload
      let messagePayload = text || "";
      if (hasAttachments) {
        // 如果有附件，将消息转换为带附件的格式
        messagePayload = {
          text: text || "",
          attachments: attachments.map(att => ({
            type: att.type,
            path: att.path,
            filename: att.filename
          }))
        };
      }

      // 调用User_Endpoint将消息发送到指定智能体
      const options = taskId ? { taskId } : {};
      const result = this.society.sendTextToAgent(agentId, messagePayload, options);

      if (result.error) {
        const isAgentStateError = typeof result.error === "string" && result.error.startsWith("agent_");
        const statusCode = isAgentStateError ? 409 : 400;
        this._sendJson(res, statusCode, { error: result.error });
        return;
      }

      void this.log.info("HTTP发送消息", { agentId, taskId: result.taskId, hasAttachments });
      this._sendJson(res, 200, { 
        ok: true,
        messageId: randomUUID(), // 生成消息ID用于追踪
        taskId: result.taskId,
        to: result.to
      });
    });
  }

  _handleRootNewSession(req, res) {
    this._readJsonBody(req, async (err) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      const runtime = this._runtime;
      if (!runtime || !runtime._conversationManager) {
        this._sendJson(res, 500, { error: "runtime_not_initialized" });
        return;
      }

      const agentId = "root";

      try {
        runtime._conversationManager.clearTokenUsage?.(agentId);
        runtime._conversationManager.deleteConversation?.(agentId);
        await runtime._conversationManager.deletePersistedConversation?.(agentId);

        const timestamp = new Date().toISOString();
        await this._storeMessage({
          id: randomUUID(),
          from: agentId,
          to: agentId,
          taskId: null,
          payload: { text: "--- 新会话 ---" },
          createdAt: timestamp
        });

        this._sendJson(res, 200, { ok: true });
      } catch (e) {
        void this.log.error("root 新会话失败", { error: e?.message ?? String(e), stack: e?.stack });
        this._sendJson(res, 500, { error: "internal_error", message: e?.message ?? String(e) });
      }
    });
  }

  /**
   * 处理 POST /api/upload - 文件上传。
   * Content-Type: multipart/form-data
   * 
   * Request:
   *   - file: 文件数据
   *   - workspaceId: 工作区ID
   *   - path: 文件路径（相对于工作区根目录）
   *   - filename: 原始文件名
   *
   * Response:
   *   {
   *     ok: true,
   *     path: "relative/path/to/file",
   *     metadata: {
   *       id: "uuid",
   *       type: "file",
   *       filename: "photo.jpg",
   *       size: 12345,
   *       mimeType: "image/jpeg",
   *       createdAt: "2026-01-10T..."
   *     }
   *   }
   * 
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  async _handleUpload(req, res) {
    // 最大文件大小 10MB
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    
    // 检查 Content-Type
    const contentType = req.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
      void this.log.warn("文件上传失败: Content-Type 错误", { contentType });
      this._sendJson(res, 400, { error: "invalid_content_type", message: "Content-Type 必须是 multipart/form-data" });
      return;
    }

    // 检查 workspaceManager 是否可用
    if (!this._workspaceManager) {
      void this.log.error("文件上传失败: workspace manager 未初始化");
      this._sendJson(res, 500, { error: "workspace_manager_not_initialized", message: "工作区管理服务未初始化" });
      return;
    }

    try {
      // 解析 multipart/form-data
      const { fields, file } = await this._parseMultipartFormData(req, MAX_FILE_SIZE);
      
      if (!file || !file.buffer || file.buffer.length === 0) {
        void this.log.warn("文件上传失败: 请求中缺少文件");
        this._sendJson(res, 400, { error: "missing_file", message: "请求中缺少文件" });
        return;
      }

      // 检查文件大小
      if (file.buffer.length > MAX_FILE_SIZE) {
        void this.log.warn("文件上传失败: 文件过大", { size: file.buffer.length, maxSize: MAX_FILE_SIZE });
        this._sendJson(res, 413, { error: "file_too_large", message: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` });
        return;
      }

      // 获取工作区ID和路径
      const workspaceId = fields.workspaceId || "default";
      const filename = fields.filename || file.filename || `upload_${Date.now()}`;
      const relativePath = fields.path || filename;

      // 获取工作区
      const workspace = this._workspaceManager.getWorkspace(workspaceId);
      
      // 保存文件到工作区
      await workspace.writeFile(relativePath, file.buffer);
      const metadata = workspace.getFileMetadata(relativePath);

      void this.log.info("文件上传成功", { 
        workspaceId,
        path: relativePath, 
        filename, 
        size: file.buffer.length,
        mimeType: metadata.mimeType
      });

      this._sendJson(res, 200, {
        ok: true,
        path: relativePath,
        metadata
      });
    } catch (err) {
      void this.log.error("文件上传失败", { error: err.message, stack: err.stack });
      
      // 检查是否是文件大小超限错误
      if (err.message && err.message.includes("too large")) {
        this._sendJson(res, 413, { error: "file_too_large", message: err.message });
        return;
      }
      
      this._sendJson(res, 500, { error: "upload_failed", message: err.message });
    }
  }

  /**
   * 解析 multipart/form-data 请求。
   * @param {import("node:http").IncomingMessage} req
   * @param {number} maxSize - 最大文件大小
   * @returns {Promise<{fields: object, file: {buffer: Buffer, filename: string, mimeType: string}|null}>}
   * @private
   */
  async _parseMultipartFormData(req, maxSize) {
    return new Promise((resolve, reject) => {
      const contentType = req.headers["content-type"] || "";
      const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/);
      if (!boundaryMatch) {
        reject(new Error("无法解析 boundary"));
        return;
      }
      const boundary = boundaryMatch[1] || boundaryMatch[2];
      const delimiter = Buffer.from(`--${boundary}`);
      const closeDelimiter = Buffer.from(`--${boundary}--`);

      const chunks = [];
      let totalSize = 0;

      req.on("data", (chunk) => {
        totalSize += chunk.length;
        if (totalSize > maxSize + 10000) { // 额外允许一些头部空间
          req.destroy();
          reject(new Error(`文件大小超过限制（最大 ${maxSize / 1024 / 1024}MB）`));
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        try {
          const buffer = Buffer.concat(chunks);
          const result = this._parseMultipartBuffer(buffer, delimiter, closeDelimiter);
          resolve(result);
        } catch (err) {
          reject(err);
        }
      });

      req.on("error", (err) => {
        reject(err);
      });
    });
  }

  /**
   * 解析 multipart buffer。
   * @param {Buffer} buffer
   * @param {Buffer} delimiter
   * @param {Buffer} closeDelimiter
   * @returns {{fields: object, file: {buffer: Buffer, filename: string, mimeType: string}|null}}
   * @private
   */
  _parseMultipartBuffer(buffer, delimiter, closeDelimiter) {
    const fields = {};
    let file = null;

    // 分割各个部分
    let start = 0;
    let delimiterIndex = buffer.indexOf(delimiter, start);
    
    while (delimiterIndex !== -1) {
      // 跳过 delimiter
      start = delimiterIndex + delimiter.length;
      
      // 检查是否是结束标记
      if (buffer.slice(start, start + 2).toString() === "--") {
        break;
      }
      
      // 跳过 CRLF
      if (buffer[start] === 0x0d && buffer[start + 1] === 0x0a) {
        start += 2;
      }
      
      // 找到下一个 delimiter
      let nextDelimiter = buffer.indexOf(delimiter, start);
      if (nextDelimiter === -1) {
        nextDelimiter = buffer.indexOf(closeDelimiter, start);
      }
      if (nextDelimiter === -1) {
        break;
      }
      
      // 提取这个部分的内容
      const partBuffer = buffer.slice(start, nextDelimiter);
      
      // 解析这个部分
      const part = this._parseMultipartPart(partBuffer);
      if (part) {
        if (part.isFile) {
          file = {
            buffer: part.content,
            filename: part.filename || "upload",
            mimeType: part.contentType || "application/octet-stream"
          };
        } else if (part.name) {
          fields[part.name] = part.content.toString("utf8");
        }
      }
      
      delimiterIndex = nextDelimiter;
    }

    return { fields, file };
  }

  /**
   * 解析单个 multipart 部分。
   * @param {Buffer} partBuffer
   * @returns {{name?: string, filename?: string, contentType?: string, content: Buffer, isFile: boolean}|null}
   * @private
   */
  _parseMultipartPart(partBuffer) {
    // 找到头部和内容的分隔（双 CRLF）
    const headerEndIndex = partBuffer.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEndIndex === -1) {
      return null;
    }

    const headerStr = partBuffer.slice(0, headerEndIndex).toString("utf8");
    let content = partBuffer.slice(headerEndIndex + 4);
    
    // 移除末尾的 CRLF
    if (content.length >= 2 && content[content.length - 2] === 0x0d && content[content.length - 1] === 0x0a) {
      content = content.slice(0, -2);
    }

    // 解析头部
    const headers = {};
    const headerLines = headerStr.split("\r\n");
    for (const line of headerLines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim().toLowerCase();
        const value = line.slice(colonIndex + 1).trim();
        headers[key] = value;
      }
    }

    // 解析 Content-Disposition
    const disposition = headers["content-disposition"] || "";
    const nameMatch = disposition.match(/name="([^"]+)"/);
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    
    const name = nameMatch ? nameMatch[1] : null;
    const filename = filenameMatch ? filenameMatch[1] : null;
    const contentType = headers["content-type"] || null;
    const isFile = !!filename || !!contentType;

    return {
      name,
      filename,
      contentType,
      content,
      isFile
    };
  }

  /**
   * 处理 GET /api/messages/:taskId - 查询任务消息。
   * @param {string} taskId
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetMessages(taskId, res) {
    if (!taskId || taskId.trim() === "") {
      this._sendJson(res, 400, { error: "missing_task_id" });
      return;
    }

    const messages = this._messagesByTaskId.get(taskId) ?? [];
    
    void this.log.debug("HTTP查询消息", { taskId, count: messages.length });
    this._sendJson(res, 200, { 
      taskId,
      messages,
      count: messages.length
    });
  }

  /**
   * 获取智能体的最后活跃时间（基于消息）。
   * @param {string} agentId - 智能体ID
   * @returns {string|null} 最后活跃时间的 ISO 字符串，如果没有消息则返回 null
   */
  _getLastActiveAt(agentId) {
    const messages = this._messagesByAgent.get(agentId);
    if (!messages || messages.length === 0) {
      return null;
    }
    // 消息已按时间排序，取最后一条
    const lastMessage = messages[messages.length - 1];
    return lastMessage.createdAt || null;
  }

  /**
   * 处理 GET /api/agents - 列出所有智能体（从OrgPrimitives读取持久化数据）。
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetAgents(res) {
    try {
      if (!this.society || !this.society.runtime) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      // 从 OrgPrimitives 获取持久化的智能体数据
      const org = this.society.runtime.org;
      const persistedAgents = org ? org.listAgents() : [];
      const roles = org ? org.listRoles() : [];
      
      // 创建岗位ID到名称的映射
      const roleMap = new Map(roles.map(r => [r.id, r.name]));
      
      // 获取运算状态
      const runtime = this.society.runtime;
      const getComputeStatus = (agentId) => {
        if (runtime && typeof runtime.getAgentComputeStatus === 'function') {
          return runtime.getAgentComputeStatus(agentId);
        }
        return 'idle';
      };

      // 构建智能体列表，包含 root 和 user
      const agents = [
        {
          id: "root",
          roleId: "root",
          roleName: "root",
          parentAgentId: null,
          createdAt: null,
          lastActiveAt: this._getLastActiveAt("root"),
          status: "active",
          computeStatus: getComputeStatus("root"),
          customName: null
        },
        {
          id: "user",
          roleId: "user",
          roleName: "user",
          parentAgentId: null,
          createdAt: null,
          lastActiveAt: this._getLastActiveAt("user"),
          status: "active",
          computeStatus: getComputeStatus("user"),
          customName: null
        },
        // 过滤掉已终止的智能体
        ...persistedAgents
          .filter(a => a.status !== "terminated")
          .map(a => ({
            id: a.id,
            roleId: a.roleId,
            roleName: roleMap.get(a.roleId) ?? a.roleId,
            parentAgentId: a.parentAgentId,
            createdAt: a.createdAt,
            lastActiveAt: this._getLastActiveAt(a.id),
            status: a.status ?? "active",
            computeStatus: getComputeStatus(a.id),
            terminatedAt: a.terminatedAt,
            customName: a.name ?? null
          }))
      ];
      
      void this.log.debug("HTTP查询智能体列表", { count: agents.length });
      this._sendJson(res, 200, { 
        agents,
        count: agents.length
      });
    } catch (err) {
      void this.log.error("查询智能体列表失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/events - 获取最近的错误和重试事件。
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetEvents(req, res) {
    try {
      const url = new URL(req.url, `http://localhost:${this.port}`);
      const since = url.searchParams.get("since");
      
      const { errors, retries } = this.getRecentEvents(since);
      
      this._sendJson(res, 200, { 
        errors,
        retries,
        timestamp: formatLocalTime()
      });
    } catch (err) {
      void this.log.error("获取事件失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/roles - 列出所有岗位及智能体数量。
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetRoles(res) {
    try {
      if (!this.society || !this.society.runtime) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      const org = this.society.runtime.org;
      const allRoles = org ? org.listRoles() : [];
      const agents = org ? org.listAgents() : [];

      // 过滤已删除的岗位
      const roles = allRoles.filter(r => r.status !== "deleted");

      // 统计每个岗位的智能体数量
      const agentCountByRole = new Map();
      for (const agent of agents) {
        const count = agentCountByRole.get(agent.roleId) ?? 0;
        agentCountByRole.set(agent.roleId, count + 1);
      }

      // 构建岗位列表，包含 root 和 user
      const rolesWithCount = [
        {
          id: "root",
          name: "root",
          rolePrompt: "系统根智能体",
          createdBy: null,
          createdAt: null,
          agentCount: 1,
          llmServiceId: null,
          toolGroups: ["org_management"]  // root 岗位硬编码为 org_management
        },
        {
          id: "user",
          name: "user",
          rolePrompt: "用户端点",
          createdBy: null,
          createdAt: null,
          agentCount: 1,
          llmServiceId: null,
          toolGroups: null  // user 不需要工具组
        },
        ...roles.map(r => ({
          id: r.id,
          name: r.name,
          rolePrompt: r.rolePrompt,
          createdBy: r.createdBy,
          createdAt: r.createdAt,
          agentCount: agentCountByRole.get(r.id) ?? 0,
          llmServiceId: r.llmServiceId ?? null,
          toolGroups: r.toolGroups ?? null  // null 表示使用默认的全部工具组
        }))
      ];

      void this.log.debug("HTTP查询岗位列表", { count: rolesWithCount.length });
      this._sendJson(res, 200, {
        roles: rolesWithCount,
        count: rolesWithCount.length
      });
    } catch (err) {
      void this.log.error("查询岗位列表失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  async _handleGetOrgTemplates(req, res) {
    if (!this.society || !this.society.runtime || !this.society.runtime.orgTemplates) {
      this._sendJson(res, 500, { error: "org_templates_not_initialized" });
      return;
    }

    const templates = await this.society.runtime.orgTemplates.listTemplateInfos();
    this._sendJson(res, 200, { templates, count: templates.length });
  }

  _handleCreateOrgTemplate(req, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }
      const orgName = body?.orgName;
      if (!orgName || typeof orgName !== "string") {
        this._sendJson(res, 400, { error: "missing_org_name", message: "请求体必须包含 orgName 字段" });
        return;
      }

      if (!this.society || !this.society.runtime || !this.society.runtime.orgTemplates) {
        this._sendJson(res, 500, { error: "org_templates_not_initialized" });
        return;
      }

      try {
        const result = await this.society.runtime.orgTemplates.createTemplate(orgName);
        this._sendJson(res, 200, result);
      } catch (createErr) {
        if (createErr && createErr.code === "EEXIST") {
          this._sendJson(res, 409, { error: "already_exists", message: "组织模板已存在" });
          return;
        }
        if (createErr && createErr.code === "INVALID_ORG_NAME") {
          this._sendJson(res, 400, { error: "invalid_org_name", message: createErr.message });
          return;
        }
        void this.log.error("创建组织模板失败", { orgName, error: createErr.message, stack: createErr.stack });
        this._sendJson(res, 500, { error: "create_failed", message: createErr.message });
      }
    });
  }

  _handleRenameOrgTemplate(req, orgName, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      const newOrgName = body?.newOrgName;
      if (!newOrgName || typeof newOrgName !== "string") {
        this._sendJson(res, 400, { error: "missing_new_org_name", message: "请求体必须包含 newOrgName 字段" });
        return;
      }

      if (!this.society || !this.society.runtime || !this.society.runtime.orgTemplates) {
        this._sendJson(res, 500, { error: "org_templates_not_initialized" });
        return;
      }

      try {
        const result = await this.society.runtime.orgTemplates.renameTemplate(orgName, newOrgName);
        this._sendJson(res, 200, result);
      } catch (renameErr) {
        if (renameErr && renameErr.code === "INVALID_ORG_NAME") {
          this._sendJson(res, 400, { error: "invalid_org_name", message: renameErr.message });
          return;
        }
        if (renameErr && renameErr.code === "ENOENT") {
          this._sendJson(res, 404, { error: "not_found", orgName });
          return;
        }
        if (renameErr && (renameErr.code === "EEXIST" || renameErr.code === "ENOTEMPTY")) {
          this._sendJson(res, 409, { error: "already_exists", message: "目标组织模板已存在" });
          return;
        }
        void this.log.error("重命名组织模板失败", { orgName, newOrgName, error: renameErr.message, stack: renameErr.stack });
        this._sendJson(res, 500, { error: "rename_failed", message: renameErr.message });
      }
    });
  }

  async _handleDeleteOrgTemplate(orgName, res) {
    if (!orgName || typeof orgName !== "string") {
      this._sendJson(res, 400, { error: "missing_org_name" });
      return;
    }
    if (!this.society || !this.society.runtime || !this.society.runtime.orgTemplates) {
      this._sendJson(res, 500, { error: "org_templates_not_initialized" });
      return;
    }
    try {
      await this.society.runtime.orgTemplates.deleteTemplate(orgName);
      this._sendJson(res, 200, { ok: true, orgName });
    } catch (deleteErr) {
      if (deleteErr && (deleteErr.code === "ENOENT" || deleteErr.code === "INVALID_ORG_NAME")) {
        this._sendJson(res, 404, { error: "not_found", orgName });
        return;
      }
      void this.log.error("删除组织模板失败", { orgName, error: deleteErr.message, stack: deleteErr.stack });
      this._sendJson(res, 500, { error: "delete_failed", message: deleteErr.message });
    }
  }

  async _handleGetOrgTemplateInfo(orgName, res) {
    if (!orgName || typeof orgName !== "string") {
      this._sendJson(res, 400, { error: "missing_org_name" });
      return;
    }
    if (!this.society || !this.society.runtime || !this.society.runtime.orgTemplates) {
      this._sendJson(res, 500, { error: "org_templates_not_initialized" });
      return;
    }
    try {
      const infoMd = await this.society.runtime.orgTemplates.readInfo(orgName);
      this._sendJson(res, 200, { orgName, infoMd });
    } catch (readErr) {
      if (readErr && (readErr.code === "ENOENT" || readErr.code === "INVALID_ORG_NAME")) {
        this._sendJson(res, 404, { error: "not_found", orgName });
        return;
      }
      void this.log.error("读取组织模板 info.md 失败", { orgName, error: readErr.message, stack: readErr.stack });
      this._sendJson(res, 500, { error: "read_failed", message: readErr.message });
    }
  }

  _handleUpdateOrgTemplateInfo(req, orgName, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }
      const content = body?.content ?? body?.infoMd;
      if (content === undefined || typeof content !== "string") {
        this._sendJson(res, 400, { error: "invalid_content", message: "content 必须是字符串" });
        return;
      }
      if (!this.society || !this.society.runtime || !this.society.runtime.orgTemplates) {
        this._sendJson(res, 500, { error: "org_templates_not_initialized" });
        return;
      }
      try {
        await this.society.runtime.orgTemplates.readInfo(orgName);
      } catch (readErr) {
        if (readErr && (readErr.code === "ENOENT" || readErr.code === "INVALID_ORG_NAME")) {
          this._sendJson(res, 404, { error: "not_found", orgName });
          return;
        }
      }
      try {
        await this.society.runtime.orgTemplates.writeInfo(orgName, content);
        this._sendJson(res, 200, { ok: true, orgName });
      } catch (saveErr) {
        if (saveErr && saveErr.code === "INVALID_ORG_NAME") {
          this._sendJson(res, 400, { error: "invalid_org_name", message: saveErr.message });
          return;
        }
        void this.log.error("更新组织模板 info.md 失败", { orgName, error: saveErr.message, stack: saveErr.stack });
        this._sendJson(res, 500, { error: "update_failed", message: saveErr.message });
      }
    });
  }

  async _handleGetOrgTemplateOrg(orgName, res) {
    if (!orgName || typeof orgName !== "string") {
      this._sendJson(res, 400, { error: "missing_org_name" });
      return;
    }
    if (!this.society || !this.society.runtime || !this.society.runtime.orgTemplates) {
      this._sendJson(res, 500, { error: "org_templates_not_initialized" });
      return;
    }
    try {
      const orgMd = await this.society.runtime.orgTemplates.readOrg(orgName);
      this._sendJson(res, 200, { orgName, orgMd });
    } catch (readErr) {
      if (readErr && (readErr.code === "ENOENT" || readErr.code === "INVALID_ORG_NAME")) {
        this._sendJson(res, 404, { error: "not_found", orgName });
        return;
      }
      void this.log.error("读取组织模板 org.md 失败", { orgName, error: readErr.message, stack: readErr.stack });
      this._sendJson(res, 500, { error: "read_failed", message: readErr.message });
    }
  }

  _handleUpdateOrgTemplateOrg(req, orgName, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }
      const content = body?.content ?? body?.orgMd;
      if (content === undefined || typeof content !== "string") {
        this._sendJson(res, 400, { error: "invalid_content", message: "content 必须是字符串" });
        return;
      }
      if (!this.society || !this.society.runtime || !this.society.runtime.orgTemplates) {
        this._sendJson(res, 500, { error: "org_templates_not_initialized" });
        return;
      }
      try {
        await this.society.runtime.orgTemplates.readOrg(orgName);
      } catch (readErr) {
        if (readErr && (readErr.code === "ENOENT" || readErr.code === "INVALID_ORG_NAME")) {
          this._sendJson(res, 404, { error: "not_found", orgName });
          return;
        }
      }
      try {
        await this.society.runtime.orgTemplates.writeOrg(orgName, content);
        this._sendJson(res, 200, { ok: true, orgName });
      } catch (saveErr) {
        if (saveErr && saveErr.code === "INVALID_ORG_NAME") {
          this._sendJson(res, 400, { error: "invalid_org_name", message: saveErr.message });
          return;
        }
        void this.log.error("更新组织模板 org.md 失败", { orgName, error: saveErr.message, stack: saveErr.stack });
        this._sendJson(res, 500, { error: "update_failed", message: saveErr.message });
      }
    });
  }

  /**
   * 处理 GET /api/agent-messages/:agentId - 查询智能体消息。
   * @param {string} agentId
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetAgentMessages(agentId, res) {
    if (!agentId || agentId.trim() === "") {
      this._sendJson(res, 400, { error: "missing_agent_id" });
      return;
    }

    try {
      const messages = await this._loadMessagesForAgent(agentId);
      
      void this.log.debug("HTTP查询智能体消息", { agentId, count: messages.length });
      this._sendJson(res, 200, {
        agentId,
        messages,
        count: messages.length
      });
    } catch (err) {
      void this.log.error("查询智能体消息失败", { agentId, error: err.message });
      this._sendJson(res, 500, { error: "load_messages_failed", message: err.message });
    }
  }

  /**
   * 处理 GET /api/agent-conversation/:agentId - 获取智能体的对话历史（包含 reasoning_content）。
   * @param {string} agentId
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetAgentConversation(agentId, res) {
    if (!agentId || agentId.trim() === "") {
      this._sendJson(res, 400, { error: "missing_agent_id" });
      return;
    }

    try {
      // 从对话历史文件中读取
      const conversationsDir = this._getConversationsDir();
      if (!conversationsDir) {
        this._sendJson(res, 200, { agentId, messages: [], thinkingMap: {} });
        return;
      }

      const filePath = path.join(conversationsDir, `${agentId}.json`);
      
      if (!existsSync(filePath)) {
        this._sendJson(res, 200, { agentId, messages: [], thinkingMap: {} });
        return;
      }

      const content = await readFile(filePath, "utf8");
      const data = JSON.parse(content);
      const messages = data.messages || [];

      // 提取 reasoning_content，建立多种 key 到 reasoning_content 的映射
      const thinkingMap = {};
      let msgIndex = 0;
      for (const msg of messages) {
        if (msg.role === "assistant" && msg.reasoning_content) {
          // 如果有 tool_calls，用第一个 tool_call 的 id 作为 key
          if (msg.tool_calls && msg.tool_calls.length > 0) {
            const callId = msg.tool_calls[0].id;
            if (callId) {
              thinkingMap[callId] = msg.reasoning_content;
            }
          }
          // 用消息内容作为备用 key（用于没有 tool_calls 的情况）
          if (msg.content) {
            const contentKey = `content:${msg.content.substring(0, 100)}`;
            thinkingMap[contentKey] = msg.reasoning_content;
          }
          // 用消息索引作为兜底 key（用于 content 为空且没有 tool_calls 的情况）
          thinkingMap[`index:${msgIndex}`] = msg.reasoning_content;
        }
        msgIndex++;
      }

      void this.log.debug("HTTP查询智能体对话历史", { agentId, messageCount: messages.length, thinkingCount: Object.keys(thinkingMap).length });
      this._sendJson(res, 200, {
        agentId,
        messages,
        thinkingMap
      });
    } catch (err) {
      void this.log.error("查询智能体对话历史失败", { agentId, error: err.message });
      this._sendJson(res, 500, { error: "load_conversation_failed", message: err.message });
    }
  }

  /**
   * 获取对话历史目录路径。
   * @returns {string|null}
   */
  _getConversationsDir() {
    if (!this.society || !this.society.runtime || !this.society.runtime.config) {
      return null;
    }
    const runtimeDir = this.society.runtime.config.runtimeDir;
    if (!runtimeDir) return null;
    return path.join(runtimeDir, "conversations");
  }

  /**
   * 处理 GET /api/agent/:agentId/system-prompt - 获取智能体的完整 system prompt。
   * @param {string} agentId
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetAgentSystemPrompt(agentId, res) {
    if (!agentId || agentId.trim() === "") {
      this._sendJson(res, 400, { error: "missing_agent_id" });
      return;
    }

    try {
      if (!this.society || !this.society.runtime) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      const runtime = this.society.runtime;
      
      // 获取智能体信息（先从运行中的智能体获取，如果没有则从持久化数据获取）
      let agent = runtime._agents.get(agentId);
      let rolePrompt = "";
      
      if (!agent && agentId !== "root" && agentId !== "user") {
        // 尝试从 OrgPrimitives 获取已终止的智能体信息
        const org = runtime.org;
        if (org) {
          const persistedAgent = org.getAgent(agentId);
          if (persistedAgent) {
            // 获取岗位的 rolePrompt
            const role = org.getRole(persistedAgent.roleId);
            rolePrompt = role?.rolePrompt || "";
            // 构造一个临时的 agent 对象
            agent = {
              id: persistedAgent.id,
              roleId: persistedAgent.roleId,
              roleName: role?.name || persistedAgent.roleId,
              rolePrompt: rolePrompt
            };
          }
        }
        
        // 如果还是找不到，返回 404
        if (!agent) {
          this._sendJson(res, 404, { error: "agent_not_found", agentId });
          return;
        }
      }

      // 构建上下文对象（模拟 LlmHandler 中的上下文构建）
      const ctx = {
        agent: agent || { id: agentId, rolePrompt: "" },
        systemBasePrompt: runtime.systemBasePrompt || "",
        systemComposeTemplate: runtime.systemComposeTemplate || "",
        systemToolRules: runtime.systemToolRules || "",
        systemWorkspacePrompt: runtime.systemWorkspacePrompt || "",
        tools: {
          composePrompt: (parts) => runtime.prompts.compose(parts)
        }
      };

      const systemPrompt = runtime._buildSystemPromptForAgent(ctx);

      void this.log.debug("HTTP查询智能体 system prompt", { agentId, promptLength: systemPrompt.length });
      this._sendJson(res, 200, {
        agentId,
        systemPrompt,
        length: systemPrompt.length
      });
    } catch (err) {
      void this.log.error("查询智能体 system prompt 失败", { agentId, error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "get_system_prompt_failed", message: err.message });
    }
  }

  /**
   * 处理 GET /api/org/tree - 获取组织层级树结构。
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetOrgTree(res) {
    try {
      if (!this.society || !this.society.runtime) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      const org = this.society.runtime.org;
      const allAgents = org ? org.listAgents() : [];
      const roles = org ? org.listRoles() : [];

      // 过滤已终止的智能体
      const agents = allAgents.filter(a => a.status !== "terminated");
      
      // 创建岗位ID到名称的映射
      const roleMap = new Map(roles.map(r => [r.id, r.name]));

      // 构建智能体映射
      const agentMap = new Map();
      agentMap.set("root", {
        id: "root",
        roleName: "root",
        parentAgentId: null,
        status: "active",
        customName: null,
        children: []
      });
      agentMap.set("user", {
        id: "user",
        roleName: "user",
        parentAgentId: null,
        status: "active",
        customName: null,
        children: []
      });

      for (const agent of agents) {
        agentMap.set(agent.id, {
          id: agent.id,
          roleName: roleMap.get(agent.roleId) ?? agent.roleId,
          parentAgentId: agent.parentAgentId,
          status: agent.status ?? "active",
          customName: agent.name ?? null,
          children: []
        });
      }

      // 构建树结构
      const roots = [];
      for (const [id, node] of agentMap) {
        if (node.parentAgentId && agentMap.has(node.parentAgentId)) {
          agentMap.get(node.parentAgentId).children.push(node);
        } else if (id === "root" || id === "user") {
          roots.push(node);
        } else if (!node.parentAgentId) {
          roots.push(node);
        }
      }

      void this.log.debug("HTTP查询组织树", { nodeCount: agentMap.size });
      this._sendJson(res, 200, {
        tree: roots,
        nodeCount: agentMap.size
      });
    } catch (err) {
      void this.log.error("查询组织树失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/org/role-tree - 获取岗位从属关系树结构。
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetRoleTree(res) {
    try {
      if (!this.society || !this.society.runtime) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      const org = this.society.runtime.org;
      const roles = org ? org.listRoles() : [];
      const agents = org ? org.listAgents() : [];

      // 过滤已删除的岗位
      const activeRoles = roles.filter(r => r.status !== "deleted");

      // 统计每个岗位的智能体数量（区分活跃和已终止）
      const agentCountByRole = new Map();
      const activeAgentCountByRole = new Map();
      for (const agent of agents) {
        const count = agentCountByRole.get(agent.roleId) ?? 0;
        agentCountByRole.set(agent.roleId, count + 1);
        
        if (agent.status !== "terminated") {
          const activeCount = activeAgentCountByRole.get(agent.roleId) ?? 0;
          activeAgentCountByRole.set(agent.roleId, activeCount + 1);
        }
      }

      // 构建岗位映射
      const roleMap = new Map();
      
      // 添加系统岗位
      roleMap.set("root", {
        id: "root",
        name: "root",
        createdBy: null,
        agentCount: 1,
        activeAgentCount: 1,
        children: []
      });

      // 添加用户定义的岗位（只添加未删除的）
      for (const role of activeRoles) {
        roleMap.set(role.id, {
          id: role.id,
          name: role.name,
          createdBy: role.createdBy,
          createdAt: role.createdAt,
          agentCount: agentCountByRole.get(role.id) ?? 0,
          activeAgentCount: activeAgentCountByRole.get(role.id) ?? 0,
          children: []
        });
      }

      // 构建树结构（基于 createdBy 关系）
      // createdBy 是创建该岗位的智能体 ID，我们需要找到该智能体所属的岗位
      const agentToRoleMap = new Map();
      agentToRoleMap.set("root", "root");
      for (const agent of agents) {
        agentToRoleMap.set(agent.id, agent.roleId);
      }

      const roots = [];
      for (const [id, node] of roleMap) {
        if (id === "root") {
          roots.push(node);
          continue;
        }

        // 找到创建者智能体所属的岗位
        const creatorAgentId = node.createdBy;
        const parentRoleId = creatorAgentId ? agentToRoleMap.get(creatorAgentId) : null;
        
        if (parentRoleId && roleMap.has(parentRoleId)) {
          roleMap.get(parentRoleId).children.push(node);
        } else {
          // 如果找不到父岗位，作为根节点
          roots.push(node);
        }
      }

      void this.log.debug("HTTP查询岗位树", { nodeCount: roleMap.size });
      this._sendJson(res, 200, {
        tree: roots,
        nodeCount: roleMap.size
      });
    } catch (err) {
      void this.log.error("查询岗位树失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 POST /api/agent/:agentId/custom-name - 设置智能体自定义名称。
   * @param {import("node:http").IncomingMessage} req
   * @param {string} agentId - 智能体ID
   * @param {import("node:http").ServerResponse} res
   */
  _handleSetCustomName(req, agentId, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      const customName = body?.customName;
      if (customName !== undefined && typeof customName !== "string") {
        this._sendJson(res, 400, { error: "invalid_custom_name", message: "customName 必须是字符串" });
        return;
      }

      try {
        if (!this.society || !this.society.runtime || !this.society.runtime.org) {
          this._sendJson(res, 500, { error: "society_not_initialized" });
          return;
        }

        const updated = await this.society.runtime.org.setAgentName(agentId, customName || null);
        if (!updated) {
          this._sendJson(res, 404, { error: "agent_not_found", message: "智能体不存在" });
          return;
        }
        void this.log.info("设置智能体自定义名称", { agentId, customName: customName || "(cleared)" });
        this._sendJson(res, 200, { 
          ok: true, 
          agentId, 
          customName: updated.name ?? null
        });
      } catch (saveErr) {
        void this.log.error("保存自定义名称失败", { agentId, error: saveErr.message });
        this._sendJson(res, 500, { error: "save_failed", message: saveErr.message });
      }
    });
  }

  /**
   * 处理 DELETE /api/agent/:agentId - 删除智能体（软删除）。
   * @param {import("node:http").IncomingMessage} req
   * @param {string} agentId - 智能体ID
   * @param {import("node:http").ServerResponse} res
   */
  _handleDeleteAgent(req, agentId, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      const reason = body?.reason || "用户删除";
      const deletedBy = body?.deletedBy || "user";

      try {
        if (!this.society || !this.society.runtime || !this.society.runtime.org) {
          this._sendJson(res, 500, { error: "society_not_initialized" });
          return;
        }

        const org = this.society.runtime.org;
        const agent = org.getAgent(agentId);
        
        if (!agent) {
          this._sendJson(res, 404, { error: "agent_not_found", message: "智能体不存在" });
          return;
        }

        if (agent.status === "terminated") {
          this._sendJson(res, 400, { error: "agent_already_terminated", message: "智能体已被终止" });
          return;
        }

        // 不允许删除系统智能体
        if (agentId === "root" || agentId === "user") {
          this._sendJson(res, 400, { error: "cannot_delete_system_agent", message: "不能删除系统智能体" });
          return;
        }

        const forceResult = await this.society.runtime.forceTerminateAgent(agentId, { deletedBy, reason });
        if (!forceResult.ok) {
          const statusCode =
            forceResult.reason === "agent_not_found" ? 404
              : forceResult.reason === "agent_already_terminated" ? 400
                : forceResult.reason === "cannot_delete_system_agent" ? 400
                  : 500;
          this._sendJson(res, statusCode, { error: forceResult.reason ?? "delete_failed" });
          return;
        }

        void this.log.info("删除智能体", { agentId, deletedBy, reason });
        this._sendJson(res, 200, {
          ok: true,
          agentId,
          termination: forceResult.termination
        });
      } catch (deleteErr) {
        void this.log.error("删除智能体失败", { agentId, error: deleteErr.message });
        this._sendJson(res, 500, { error: "delete_failed", message: deleteErr.message });
      }
    });
  }

  /**
   * 处理 DELETE /api/role/:roleId - 删除岗位（软删除）。
   * @param {import("node:http").IncomingMessage} req
   * @param {string} roleId - 岗位ID
   * @param {import("node:http").ServerResponse} res
   */
  _handleDeleteRole(req, roleId, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      const reason = body?.reason || "用户删除";
      const deletedBy = body?.deletedBy || "user";

      try {
        if (!this.society || !this.society.runtime || !this.society.runtime.org) {
          this._sendJson(res, 500, { error: "society_not_initialized" });
          return;
        }

        const org = this.society.runtime.org;
        const role = org.getRole(roleId);
        
        if (!role) {
          this._sendJson(res, 404, { error: "role_not_found", message: "岗位不存在" });
          return;
        }

        if (role.status === "deleted") {
          this._sendJson(res, 400, { error: "role_already_deleted", message: "岗位已被删除" });
          return;
        }

        // 不允许删除系统岗位
        if (roleId === "root" || roleId === "user") {
          this._sendJson(res, 400, { error: "cannot_delete_system_role", message: "不能删除系统岗位" });
          return;
        }

        // 调用 runtime 的 deleteRole 方法，它会处理完整的删除流程
        const result = await this.society.runtime.deleteRole(roleId, deletedBy, reason);
        
        if (!result.ok) {
          const statusCode =
            result.error === "role_not_found" ? 404 :
              result.error === "role_already_deleted" ? 400 :
                result.error === "cannot_delete_system_role" ? 400 :
                  500;
          this._sendJson(res, statusCode, { error: result.error, message: "删除岗位失败" });
          return;
        }

        void this.log.info("删除岗位", { 
          roleId, 
          roleName: role.name,
          deletedBy, 
          reason,
          affectedAgentsCount: result.deleteResult?.affectedAgents?.length ?? 0,
          affectedRolesCount: result.deleteResult?.affectedRoles?.length ?? 0,
          terminatedAgentsCount: result.deleteResult?.terminatedAgents?.length ?? 0,
          failedAgentsCount: result.deleteResult?.failedAgents?.length ?? 0
        });
        
        this._sendJson(res, 200, { 
          ok: true, 
          roleId,
          roleName: role.name,
          deleteResult: result.deleteResult
        });
      } catch (deleteErr) {
        void this.log.error("删除岗位失败", { roleId, error: deleteErr.message });
        this._sendJson(res, 500, { error: "delete_failed", message: deleteErr.message });
      }
    });
  }

  /**
   * 处理 POST /api/agent/:agentId/abort - 中断智能体的 LLM 调用。
   * @param {string} agentId - 智能体ID
   * @param {import("node:http").ServerResponse} res
   */
  async _handleAbortLlmCall(agentId, res) {
    if (!this.society || !this.society.runtime) {
      void this.log.error("中断请求失败：系统未初始化", { agentId });
      this._sendJson(res, 500, { error: "society_not_initialized" });
      return;
    }

    try {
      const result = await this.society.runtime.abortAgentLlmCall(agentId);

      if (!result.ok) {
        const statusCode = result.reason === "agent_not_found" ? 404 : 400;
        void this.log.warn("中断请求失败", { 
          agentId, 
          reason: result.reason,
          statusCode 
        });
        this._sendJson(res, statusCode, { error: result.reason });
        return;
      }

      void this.log.info("处理 LLM 中断请求", { 
        agentId, 
        aborted: result.aborted,
        reason: result.reason ?? null
      });
      
      this._sendJson(res, 200, { 
        ok: true, 
        agentId, 
        aborted: result.aborted,
        reason: result.reason ?? null,
        timestamp: formatLocalTime()
      });
    } catch (err) {
      const errorMessage = err?.message ?? String(err);
      void this.log.error("处理中断请求时发生异常", {
        agentId,
        error: errorMessage,
        stack: err?.stack ?? null
      });
      
      this._sendJson(res, 500, { 
        error: "internal_error", 
        message: errorMessage,
        agentId
      });
    }
  }

  /**
   * 处理 GET /api/agent-custom-names - 获取所有智能体自定义名称。
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetCustomNames(res) {
    try {
      if (!this.society || !this.society.runtime) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      const org = this.society.runtime.org;
      const agents = org ? org.listAgents() : [];
      const customNames = {};
      for (const a of agents) {
        if (!a || typeof a.id !== "string") continue;
        if (typeof a.name === "string" && a.name.trim()) {
          customNames[a.id] = a.name.trim();
        }
      }
      void this.log.debug("HTTP查询自定义名称", { count: Object.keys(customNames).length });
      this._sendJson(res, 200, { customNames });
    } catch (err) {
      void this.log.error("查询自定义名称失败", { error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 POST /api/role/:roleId/prompt - 更新岗位职责提示词。
   * @param {import("node:http").IncomingMessage} req
   * @param {string} roleId - 岗位ID
   * @param {import("node:http").ServerResponse} res
   */
  _handleUpdateRolePrompt(req, roleId, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      const rolePrompt = body?.rolePrompt;
      if (rolePrompt === undefined || typeof rolePrompt !== "string") {
        this._sendJson(res, 400, { error: "invalid_role_prompt", message: "rolePrompt 必须是字符串" });
        return;
      }

      // 检查是否是系统岗位
      if (roleId === "root" || roleId === "user") {
        this._sendJson(res, 400, { error: "cannot_modify_system_role", message: "不能修改系统岗位" });
        return;
      }

      try {
        if (!this.society || !this.society.runtime || !this.society.runtime.org) {
          this._sendJson(res, 500, { error: "society_not_initialized" });
          return;
        }

        const org = this.society.runtime.org;
        const updatedRole = await org.updateRole(roleId, { rolePrompt });
        
        if (!updatedRole) {
          this._sendJson(res, 404, { error: "role_not_found", message: "岗位不存在" });
          return;
        }

        void this.log.info("更新岗位职责提示词", { roleId, promptLength: rolePrompt.length });
        this._sendJson(res, 200, { 
          ok: true, 
          role: updatedRole
        });
      } catch (saveErr) {
        void this.log.error("更新岗位职责提示词失败", { roleId, error: saveErr.message });
        this._sendJson(res, 500, { error: "update_failed", message: saveErr.message });
      }
    });
  }

  /**
   * 处理 GET /api/llm-services - 获取所有 LLM 服务列表。
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetLlmServices(res) {
    try {
      if (!this.society || !this.society.runtime) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      const runtime = this.society.runtime;
      const serviceRegistry = runtime.serviceRegistry;
      
      if (!serviceRegistry) {
        // 如果没有服务注册表，返回空列表
        this._sendJson(res, 200, { services: [], count: 0 });
        return;
      }

      const services = serviceRegistry.getServices().map(s => ({
        id: s.id,
        name: s.name,
        description: s.description || "",
        capabilityTags: s.capabilityTags || [],
        model: s.model
      }));

      void this.log.debug("HTTP查询LLM服务列表", { count: services.length });
      this._sendJson(res, 200, { services, count: services.length });
    } catch (err) {
      void this.log.error("查询LLM服务列表失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 POST /api/role/:roleId/llm-service - 更新岗位的 LLM 服务。
   * @param {import("node:http").IncomingMessage} req
   * @param {string} roleId - 岗位ID
   * @param {import("node:http").ServerResponse} res
   */
  _handleUpdateRoleLlmService(req, roleId, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      // llmServiceId 可以是字符串或 null（表示使用默认服务）
      const llmServiceId = body?.llmServiceId;
      if (llmServiceId !== null && llmServiceId !== undefined && typeof llmServiceId !== "string") {
        this._sendJson(res, 400, { error: "invalid_llm_service_id", message: "llmServiceId 必须是字符串或 null" });
        return;
      }

      // 检查是否是系统岗位
      if (roleId === "root" || roleId === "user") {
        this._sendJson(res, 400, { error: "cannot_modify_system_role", message: "不能修改系统岗位" });
        return;
      }

      try {
        if (!this.society || !this.society.runtime || !this.society.runtime.org) {
          this._sendJson(res, 500, { error: "society_not_initialized" });
          return;
        }

        const org = this.society.runtime.org;
        const updatedRole = await org.updateRole(roleId, { llmServiceId: llmServiceId ?? null });
        
        if (!updatedRole) {
          this._sendJson(res, 404, { error: "role_not_found", message: "岗位不存在" });
          return;
        }

        void this.log.info("更新岗位LLM服务", { roleId, llmServiceId: updatedRole.llmServiceId });
        this._sendJson(res, 200, { 
          ok: true, 
          role: updatedRole
        });
      } catch (saveErr) {
        void this.log.error("更新岗位LLM服务失败", { roleId, error: saveErr.message });
        this._sendJson(res, 500, { error: "update_failed", message: saveErr.message });
      }
    });
  }

  /**
   * 处理静态文件请求。
   * @param {string} pathname - 请求路径
   * @param {import("node:http").ServerResponse} res
   */
  async _handleStaticFile(req, pathname, res) {
    // 移除 /web/ 前缀，获取相对路径
    let relativePath = pathname.replace(/^\/web\/?/, "");
    if (!relativePath || relativePath === "") {
      relativePath = "index.html";
    }

    // 构建文件路径（相对于项目根目录的 web 文件夹）
    const filePath = path.join(process.cwd(), "web", relativePath);

    // 安全检查：防止路径遍历攻击
    const webDir = path.join(process.cwd(), "web");
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(webDir)) {
      void this.log.warn("路径访问被拒绝", { resolvedPath, webDir });
      this._sendJson(res, 403, { error: "forbidden", message: "路径访问被拒绝" });
      return;
    }

    try {
      // 检查文件是否存在
      if (!existsSync(resolvedPath)) {
        void this.log.warn("静态文件不存在", { path: pathname, resolvedPath });
        this._sendJson(res, 404, { error: "not_found", path: pathname });
        return;
      }

      // 读取文件内容
      const content = await readFile(resolvedPath);

      // 根据文件扩展名设置 Content-Type
      const ext = path.extname(relativePath).toLowerCase();
      const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".wasm": "application/wasm",
        ".map": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon"
      };
      const contentType = contentTypes[ext] ?? "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      if (relativePath === "wllama/dist" || relativePath.startsWith("wllama/dist/")) {
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      }
      res.writeHead(200);
      if (req.method === "HEAD") {
        res.end();
        return;
      }
      res.end(content);

      void this.log.debug("HTTP静态文件", { path: relativePath });
    } catch (err) {
      void this.log.error("读取静态文件失败", { 
        path: relativePath, 
        resolvedPath,
        error: err.message,
        stack: err.stack 
      });
      this._sendJson(res, 500, { error: "read_file_failed", message: err.message });
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   * @param {URL} url
   */
  async _handleUiCommandsPoll(req, res, url) {
    const clientId = url.searchParams.get("clientId") ?? "";
    const timeoutMs = Number(url.searchParams.get("timeoutMs") ?? "25000");

    if (!clientId) {
      this._sendJson(res, 400, { error: "missing_client_id" });
      return;
    }

    try {
      const command = await this._uiCommandBroker.waitForNextCommand(clientId, timeoutMs);
      this._sendJson(res, 200, { ok: true, command: command ?? null });
    } catch (err) {
      const message = err?.message ?? String(err);
      this._sendJson(res, 500, { error: "ui_poll_failed", message });
    }
  }

  /**
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  _handleUiCommandsResult(req, res) {
    this._readJsonBody(req, (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      const commandId = body?.commandId;
      const ok = body?.ok === true;
      const result = body?.result;
      const error = body?.error;

      if (!commandId || typeof commandId !== "string") {
        this._sendJson(res, 400, { error: "missing_command_id" });
        return;
      }

      const resolved = this._uiCommandBroker.resolveResult(commandId, { ok, result, error });
      if (!resolved.ok) {
        this._sendJson(res, 404, { error: "command_not_pending", commandId });
        return;
      }

      this._sendJson(res, 200, { ok: true });
    });
  }

  /**
   * 读取请求体JSON。
   * @param {import("node:http").IncomingMessage} req
   * @param {(err:Error|null, body?:any)=>void} callback
   */
  _readJsonBody(req, callback) {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        // 如果请求体为空，返回null而不是尝试解析
        if (body.trim() === "") {
          callback(null, null);
          return;
        }
        const parsed = JSON.parse(body);
        callback(null, parsed);
      } catch (err) {
        callback(err);
      }
    });
    req.on("error", (err) => {
      callback(err);
    });
  }

  /**
   * 发送JSON响应。
   * @param {import("node:http").ServerResponse} res
   * @param {number} statusCode
   * @param {any} data
   */
  _sendJson(res, statusCode, data) {
    try {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.writeHead(statusCode);
      const jsonStr = JSON.stringify(data);
      res.end(jsonStr);
    } catch (err) {
      // JSON序列化失败时的错误处理
      void this.log.error("JSON序列化失败", { 
        statusCode, 
        error: err.message, 
        stack: err.stack,
        dataType: typeof data,
        dataKeys: data && typeof data === 'object' ? Object.keys(data) : null
      });
      
      // 尝试发送一个简单的错误响应
      try {
        if (!res.headersSent) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(500);
        }
        res.end(JSON.stringify({ error: "json_serialization_error", message: err.message }));
      } catch (finalErr) {
        void this.log.error("发送错误响应也失败", { error: finalErr.message });
        res.end();
      }
    }
  }

  /**
   * 获取指定taskId的消息列表（用于测试）。
   * @param {string} taskId
   * @returns {any[]}
   */
  getMessagesByTaskId(taskId) {
    return this._messagesByTaskId.get(taskId) ?? [];
  }

  /**
   * 获取指定智能体的消息列表（用于测试）。
   * @param {string} agentId
   * @returns {any[]}
   */
  getMessagesByAgentId(agentId) {
    return this._messagesByAgent.get(agentId) ?? [];
  }

  /**
   * 清除所有消息记录（用于测试）。
   */
  clearMessages() {
    this._messagesByTaskId.clear();
    this._messagesByAgent.clear();
    this._messagesById.clear();
  }

  /**
   * 处理模块 API 请求。
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   * @param {string} method
   * @param {string} pathname
   */
  async _handleModuleApi(req, res, method, pathname) {
    // 检查 runtime 是否可用
    if (!this.society || !this.society.runtime || !this.society.runtime.moduleLoader) {
      this._sendJson(res, 500, { error: "modules_not_initialized" });
      return;
    }

    const moduleLoader = this.society.runtime.moduleLoader;
    
    // 解析路径: /api/modules, /api/modules/:name, /api/modules/:name/...
    const pathParts = pathname.slice("/api/modules".length).split("/").filter(Boolean);
    
    // GET /api/modules - 获取所有已加载模块列表
    if (method === "GET" && pathParts.length === 0) {
      const modules = moduleLoader.getLoadedModules();
      this._sendJson(res, 200, { ok: true, modules, count: modules.length });
      return;
    }

    const moduleName = pathParts[0];
    const subPath = pathParts.slice(1);

    // GET /api/modules/:name - 获取指定模块详情
    if (method === "GET" && pathParts.length === 1) {
      const modules = moduleLoader.getLoadedModules();
      const moduleInfo = modules.find(m => m.name === moduleName);
      if (!moduleInfo) {
        this._sendJson(res, 404, { error: "module_not_found", moduleName });
        return;
      }
      this._sendJson(res, 200, { ok: true, module: moduleInfo });
      return;
    }

    // GET /api/modules/:name/web-component - 获取模块的 Web 组件定义
    if (method === "GET" && subPath.length === 1 && subPath[0] === "web-component") {
      const components = moduleLoader.getWebComponents();
      const component = components.find(c => c.moduleName === moduleName);
      if (!component) {
        this._sendJson(res, 404, { error: "web_component_not_found", moduleName });
        return;
      }
      
      // 如果组件定义包含 panelPath，读取文件内容
      const componentDef = component.component;
      if (componentDef.panelPath) {
        try {
          const panelDir = path.dirname(componentDef.panelPath);
          const baseName = path.basename(componentDef.panelPath, '.html');
          
          // 读取 HTML、CSS、JS 文件
          let html = '', css = '', js = '';
          
          const htmlPath = path.join(process.cwd(), componentDef.panelPath);
          const cssPath = path.join(process.cwd(), panelDir, `${baseName}.css`);
          const jsPath = path.join(process.cwd(), panelDir, `${baseName}.js`);
          
          if (existsSync(htmlPath)) {
            const htmlContent = await readFile(htmlPath, 'utf8');
            // 提取 body 内容
            const bodyMatch = htmlContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            html = bodyMatch ? bodyMatch[1].trim() : htmlContent;
          }
          
          if (existsSync(cssPath)) {
            css = await readFile(cssPath, 'utf8');
          }
          
          if (existsSync(jsPath)) {
            js = await readFile(jsPath, 'utf8');
          }
          
          this._sendJson(res, 200, { 
            ok: true, 
            html, 
            css, 
            js,
            moduleName: componentDef.moduleName,
            displayName: componentDef.displayName,
            icon: componentDef.icon
          });
          return;
        } catch (err) {
          void this.log.error("读取模块 Web 组件文件失败", { moduleName, error: err.message });
          this._sendJson(res, 500, { error: "read_component_failed", message: err.message });
          return;
        }
      }
      
      this._sendJson(res, 200, { ok: true, component: componentDef });
      return;
    }

    // 路由到模块的 HTTP 处理器
    const httpHandler = moduleLoader.getModuleHttpHandler(moduleName);
    if (!httpHandler) {
      this._sendJson(res, 404, { error: "module_http_handler_not_found", moduleName });
      return;
    }

    try {
      // 对于 POST 请求，读取请求体
      let body = null;
      if (method === "POST") {
        body = await new Promise((resolve, reject) => {
          this._readJsonBody(req, (err, data) => {
            if (err) reject(err);
            else resolve(data);
          });
        });
      }

      // 调用模块的 HTTP 处理器
      const result = await httpHandler(req, res, subPath, body);
      this._sendJson(res, 200, result);
    } catch (err) {
      const message = err?.message ?? String(err);
      void this.log.error("模块 HTTP 处理器错误", { moduleName, error: message });
      this._sendJson(res, 500, { error: "module_handler_error", moduleName, message });
    }
  }

  /**
   * 获取工作空间目录路径。
   * @returns {string|null}
   */
  _getWorkspacesDir() {
    if (!this._runtimeDir) return null;
    // 工作空间目录在 runtimeDir 的上一级的 workspaces 目录
    const dataDir = path.dirname(this._runtimeDir);
    return path.join(dataDir, "workspaces");
  }

  /**
   * 处理 GET /api/workspaces - 获取工作空间列表。
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetWorkspaces(res) {
    try {
      const list = await this._workspaceManager.listWorkspaces();
      const workspaces = [];

      for (const item of list) {
        const ws = await this._workspaceManager.getWorkspace(item.id);
        const meta = await ws._readGlobalMeta();
        const usage = await ws.getDiskUsage();

        workspaces.push({
          id: item.id,
          name: meta.name || item.id,
          createdAt: meta.createdAt || new Date(item.updatedAt).toISOString(),
          modifiedAt: new Date(item.updatedAt).toISOString(),
          fileCount: usage.fileCount,
          diskUsage: usage.totalSize,
          metadata: meta
        });
      }

      void this.log.debug("HTTP查询工作空间列表", { count: workspaces.length });
      this._sendJson(res, 200, { workspaces, count: workspaces.length });
    } catch (err) {
      void this.log.error("查询工作空间列表失败", { error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/workspaces/:workspaceId - 获取工作空间文件列表。
   * @param {string} workspaceId
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetWorkspaceFiles(workspaceId, res) {
    try {
      const ws = await this._workspaceManager.getWorkspace(workspaceId);
      
      const meta = await ws._readGlobalMeta();
      const tree = await ws.getTree();
      
      const files = Object.entries(meta.files).map(([filePath, info]) => ({
        name: filePath.split("/").pop(),
        path: filePath,
        size: info.size,
        extension: path.extname(filePath).toLowerCase(),
        createdAt: info.updatedAt,
        modifiedAt: info.updatedAt,
        mimeType: info.mimeType,
        meta: info
      }));

      // 按修改时间降序排列
      files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

      void this.log.debug("HTTP查询工作空间文件列表", { workspaceId, count: files.length });
      this._sendJson(res, 200, { 
        workspaceId,
        name: meta.name || workspaceId,
        files, 
        count: files.length,
        tree,
        metadata: meta
      });
    } catch (err) {
      void this.log.error("查询工作空间文件列表失败", { workspaceId, error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/workspaces/:workspaceId/file?path=xxx - 获取工作空间文件元数据。
   * @param {string} workspaceId
   * @param {string} filePath
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetWorkspaceFile(workspaceId, filePath, res) {
    try {
      const ws = await this._workspaceManager.getWorkspace(workspaceId);
      const fileInfo = await ws.getFileInfo(filePath);

      void this.log.debug("HTTP获取工作空间文件元数据", { workspaceId, filePath });
      this._sendJson(res, 200, {
        workspaceId,
        path: filePath,
        name: path.basename(filePath),
        mimeType: fileInfo.mimeType,
        size: fileInfo.size,
        mtime: fileInfo.mtime
      });
    } catch (err) {
      void this.log.error("获取工作空间文件元数据失败", { workspaceId, filePath, error: err.message });
      const statusCode = err.message === "file_not_found" ? 404 : (err.message === "path_traversal_blocked" ? 403 : 500);
      this._sendJson(res, statusCode, { error: err.message });
    }
  }

  /**
   * 处理 POST /api/workspaces/:workspaceId/file?path=xxx - 写入工作空间文件。
   */
  async _handlePostWorkspaceFile(req, workspaceId, filePath, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      try {
        const { content, mimeType, operator, messageId, offset } = body;
        if (content === undefined) {
          this._sendJson(res, 400, { error: "content_required" });
          return;
        }

        const ws = await this._workspaceManager.getWorkspace(workspaceId);
        const result = await ws.writeFile(filePath, content, { mimeType, operator, messageId, offset });

        void this.log.info("HTTP写入工作空间文件", { workspaceId, filePath, size: result.size, offset });
        this._sendJson(res, 200, { ok: true, ...result });
      } catch (err) {
        void this.log.error("写入工作空间文件失败", { workspaceId, filePath, error: err.message });
        this._sendJson(res, 500, { error: err.message });
      }
    });
  }

  /**
   * 处理 DELETE /api/workspaces/:workspaceId/file?path=xxx - 删除工作空间文件。
   */
  async _handleDeleteWorkspaceFile(workspaceId, filePath, res) {
    try {
      const ws = await this._workspaceManager.getWorkspace(workspaceId);
      await ws.deleteFile(filePath);

      void this.log.info("HTTP删除工作空间文件", { workspaceId, filePath });
      this._sendJson(res, 200, { ok: true });
    } catch (err) {
      void this.log.error("删除工作空间文件失败", { workspaceId, filePath, error: err.message });
      this._sendJson(res, 500, { error: err.message });
    }
  }

  /**
   * 处理 DELETE /api/workspaces/:workspaceId - 删除工作空间。
   */
  async _handleDeleteWorkspace(workspaceId, res) {
    try {
      await this._workspaceManager.deleteWorkspace(workspaceId);
      this._sendJson(res, 200, { ok: true });
    } catch (err) {
      this._sendJson(res, 500, { error: err.message });
    }
  }

  /**
   * 处理 GET /api/workspaces/:workspaceId/meta - 获取工作空间元信息。
   * @param {string} workspaceId
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetWorkspaceMeta(workspaceId, res) {
    try {
      const ws = await this._workspaceManager.getWorkspace(workspaceId);
      const meta = await ws._readGlobalMeta();
      const usage = await ws.getDiskUsage();

      void this.log.debug("HTTP查询工作空间元信息", { workspaceId });
      this._sendJson(res, 200, {
        workspaceId,
        name: meta.name || workspaceId,
        createdAt: meta.createdAt || meta.lastSync,
        modifiedAt: meta.lastSync,
        fileCount: usage.fileCount,
        diskUsage: usage.totalSize,
        metadata: meta
      });
    } catch (err) {
      void this.log.error("查询工作空间元信息失败", { workspaceId, error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/workspaces/:workspaceId/disk-usage - 获取磁盘占用。
   */
  async _handleGetWorkspaceDiskUsage(workspaceId, res) {
    try {
      const ws = await this._workspaceManager.getWorkspace(workspaceId);
      const usage = await ws.getDiskUsage();
      this._sendJson(res, 200, usage);
    } catch (err) {
      this._sendJson(res, 500, { error: err.message });
    }
  }

  /**
   * 处理 GET /workspace-files/:workspaceId/:filePath - 工作空间文件静态服务。
   * @param {string} pathname
   * @param {import("node:http").ServerResponse} res
   */
  async _handleWorkspaceFile(pathname, res) {
    try {
      // 移除 /workspace-files/ 前缀，获取相对路径
      let relativePath = pathname.replace(/^\/workspace-files\/?/, "");
      if (!relativePath || relativePath === "") {
        this._sendJson(res, 400, { error: "invalid_path", message: "文件路径不能为空" });
        return;
      }

      // 解析 workspaceId 和文件路径
      const parts = relativePath.split("/");
      if (parts.length < 2) {
        this._sendJson(res, 400, { error: "invalid_path", message: "路径格式错误" });
        return;
      }

      const workspaceId = decodeURIComponent(parts[0]);
      const filePath = parts.slice(1).map(p => decodeURIComponent(p)).join("/");

      const ws = await this._workspaceManager.getWorkspace(workspaceId);
      const result = await ws.readFile(filePath, { offset: 0, length: 10 * 1024 * 1024 }); // 静态服务允许读取较大内容

      res.setHeader("Content-Type", result.mimeType);
      res.writeHead(200);
      
      // 如果是文本，readFile 返回的是字符串，否则是 base64
      if (result.mimeType.startsWith('text/') || result.mimeType === 'application/json' || result.mimeType === 'application/javascript') {
        res.end(result.content);
      } else {
        res.end(Buffer.from(result.content, 'base64'));
      }

      void this.log.debug("HTTP工作空间文件静态服务", { workspaceId, filePath });
    } catch (err) {
      void this.log.error("读取工作空间文件失败", { error: err.message });
      const statusCode = err.message === "file_not_found" ? 404 : 500;
      this._sendJson(res, statusCode, { error: err.message });
    }
  }

  // ==================== Config API Handlers ====================

  /**
   * 处理 GET /api/config/status - 获取配置状态。
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetConfigStatus(res) {
    try {
      const hasLocalConfig = this._configService ? this._configService.hasLocalApp() : false;
      
      this._sendJson(res, 200, {
        hasLocalConfig,
        llmStatus: this._llmStatus,
        lastError: this._llmLastError
      });
    } catch (err) {
      void this.log.error("获取配置状态失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/config/llm - 获取 LLM 配置。
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetLlmConfig(res) {
    if (!this._configService) {
      this._sendJson(res, 500, { error: "config_service_not_initialized" });
      return;
    }

    try {
      const result = await this._configService.getLlm();
      
      // 掩码 API Key
      const maskedLlm = {
        ...result.llm,
        apiKey: this._configService.maskApiKey(result.llm.apiKey)
      };

      this._sendJson(res, 200, {
        llm: maskedLlm,
        source: result.source
      });
    } catch (err) {
      void this.log.error("获取 LLM 配置失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 POST /api/config/llm - 保存 LLM 配置。
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  _handleSaveLlmConfig(req, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      if (!this._configService) {
        this._sendJson(res, 500, { error: "config_service_not_initialized" });
        return;
      }

      try {
        // 验证配置
        const validation = this._configService.validateLlm(body);
        if (!validation.valid) {
          this._sendJson(res, 400, { error: "validation_error", details: validation.errors });
          return;
        }

        // 保存配置
        await this._configService.saveLlm(body);

        // 返回掩码后的配置
        const maskedLlm = {
          baseURL: body.baseURL,
          model: body.model,
          apiKey: this._configService.maskApiKey(body.apiKey),
          maxConcurrentRequests: body.maxConcurrentRequests ?? 2
        };

        void this.log.info("LLM 配置已保存");
        this._sendJson(res, 200, { ok: true, llm: maskedLlm });
      } catch (err) {
        void this.log.error("保存 LLM 配置失败", { error: err.message, stack: err.stack });
        this._sendJson(res, 500, { error: "internal_error", message: err.message });
      }
    });
  }

  /**
   * 处理 GET /api/config/llm-services - 获取 LLM 服务列表配置。
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetLlmServicesConfig(res) {
    if (!this._configService) {
      this._sendJson(res, 500, { error: "config_service_not_initialized" });
      return;
    }

    try {
      const result = await this._configService.getServices();
      
      // 掩码所有服务的 API Key
      const maskedServices = result.services.map(s => ({
        ...s,
        apiKey: this._configService.maskApiKey(s.apiKey)
      }));

      this._sendJson(res, 200, {
        services: maskedServices,
        source: result.source
      });
    } catch (err) {
      void this.log.error("获取 LLM 服务配置失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 POST /api/config/llm-services - 添加 LLM 服务。
   * @param {import("node:http").IncomingMessage} req
   * @param {import("node:http").ServerResponse} res
   */
  _handleAddLlmServiceConfig(req, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      if (!this._configService) {
        this._sendJson(res, 500, { error: "config_service_not_initialized" });
        return;
      }

      try {
        // 验证服务配置
        const validation = this._configService.validateService(body);
        if (!validation.valid) {
          this._sendJson(res, 400, { error: "validation_error", details: validation.errors });
          return;
        }

        // 添加服务
        const service = await this._configService.addService(body);

        void this.log.info("LLM 服务已添加", { serviceId: body.id });
        this._sendJson(res, 200, { ok: true, service });
      } catch (err) {
        // 检查是否是重复 ID 错误
        if (err.message && err.message.includes("已存在")) {
          this._sendJson(res, 409, { error: "duplicate_id", message: err.message });
          return;
        }
        void this.log.error("添加 LLM 服务失败", { error: err.message, stack: err.stack });
        this._sendJson(res, 500, { error: "internal_error", message: err.message });
      }
    });
  }

  /**
   * 处理 POST /api/config/llm-services/:serviceId - 更新 LLM 服务。
   * @param {import("node:http").IncomingMessage} req
   * @param {string} serviceId - 服务 ID
   * @param {import("node:http").ServerResponse} res
   */
  _handleUpdateLlmServiceConfig(req, serviceId, res) {
    this._readJsonBody(req, async (err, body) => {
      if (err) {
        this._sendJson(res, 400, { error: "invalid_json", message: err.message });
        return;
      }

      if (!this._configService) {
        this._sendJson(res, 500, { error: "config_service_not_initialized" });
        return;
      }

      try {
        // 验证服务配置
        const validation = this._configService.validateService(body);
        if (!validation.valid) {
          this._sendJson(res, 400, { error: "validation_error", details: validation.errors });
          return;
        }

        // 更新服务
        const service = await this._configService.updateService(serviceId, body);

        void this.log.info("LLM 服务已更新", { serviceId });
        this._sendJson(res, 200, { ok: true, service });
      } catch (err) {
        // 检查是否是服务不存在错误
        if (err.message && err.message.includes("不存在")) {
          this._sendJson(res, 404, { error: "not_found", message: err.message });
          return;
        }
        void this.log.error("更新 LLM 服务失败", { serviceId, error: err.message, stack: err.stack });
        this._sendJson(res, 500, { error: "internal_error", message: err.message });
      }
    });
  }

  /**
   * 处理 DELETE /api/config/llm-services/:serviceId - 删除 LLM 服务。
   * @param {string} serviceId - 服务 ID
   * @param {import("node:http").ServerResponse} res
   */
  async _handleDeleteLlmServiceConfig(serviceId, res) {
    if (!this._configService) {
      this._sendJson(res, 500, { error: "config_service_not_initialized" });
      return;
    }

    try {
      // 删除服务
      await this._configService.deleteService(serviceId);

      void this.log.info("LLM 服务已删除", { serviceId });
      this._sendJson(res, 200, { ok: true, deletedId: serviceId });
    } catch (err) {
      // 检查是否是服务不存在错误
      if (err.message && err.message.includes("不存在")) {
        this._sendJson(res, 404, { error: "not_found", message: err.message });
        return;
      }
      void this.log.error("删除 LLM 服务失败", { serviceId, error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/tool-groups - 获取所有可用工具组列表。
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetToolGroups(res) {
    try {
      if (!this.society || !this.society.runtime) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      const toolGroupManager = this.society.runtime.toolGroupManager;
      if (!toolGroupManager) {
        this._sendJson(res, 500, { error: "tool_group_manager_not_initialized" });
        return;
      }

      const groups = toolGroupManager.listGroups();
      
      void this.log.debug("HTTP查询工具组列表", { count: groups.length });
      this._sendJson(res, 200, {
        toolGroups: groups,
        count: groups.length
      });
    } catch (err) {
      void this.log.error("查询工具组列表失败", { error: err.message, stack: err.stack });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 POST /api/role/:roleId/tool-groups - 更新岗位工具组配置。
   * @param {import("node:http").IncomingMessage} req
   * @param {string} roleId
   * @param {import("node:http").ServerResponse} res
   */
  _handleUpdateRoleToolGroups(req, roleId, res) {
    let body = "";
    req.on("data", chunk => { body += chunk; });
    req.on("end", async () => {
      try {
        if (!this.society || !this.society.runtime) {
          this._sendJson(res, 500, { error: "society_not_initialized" });
          return;
        }

        // 不允许修改 root 和 user 岗位的工具组
        if (roleId === "root" || roleId === "user") {
          this._sendJson(res, 400, { 
            error: "cannot_modify_system_role", 
            message: "不能修改系统岗位的工具组配置" 
          });
          return;
        }

        const org = this.society.runtime.org;
        if (!org) {
          this._sendJson(res, 500, { error: "org_not_initialized" });
          return;
        }

        const role = org.getRole(roleId);
        if (!role) {
          this._sendJson(res, 404, { error: "role_not_found", roleId });
          return;
        }

        let data;
        try {
          data = JSON.parse(body);
        } catch (parseErr) {
          this._sendJson(res, 400, { error: "invalid_json", message: parseErr.message });
          return;
        }

        // toolGroups 可以是数组或 null
        const toolGroups = data.toolGroups;
        if (toolGroups !== null && !Array.isArray(toolGroups)) {
          this._sendJson(res, 400, { 
            error: "invalid_tool_groups", 
            message: "toolGroups 必须是数组或 null" 
          });
          return;
        }

        // 验证工具组是否存在
        if (Array.isArray(toolGroups) && toolGroups.length > 0) {
          const toolGroupManager = this.society.runtime.toolGroupManager;
          if (toolGroupManager) {
            const invalidGroups = toolGroups.filter(g => !toolGroupManager.hasGroup(g));
            if (invalidGroups.length > 0) {
              this._sendJson(res, 400, { 
                error: "invalid_tool_group_ids", 
                message: `以下工具组不存在: ${invalidGroups.join(", ")}`,
                invalidGroups 
              });
              return;
            }
          }
        }

        // 更新岗位
        const updatedRole = await org.updateRole(roleId, { toolGroups });
        
        if (!updatedRole) {
          this._sendJson(res, 500, { error: "update_failed" });
          return;
        }

        void this.log.info("HTTP更新岗位工具组", { 
          roleId, 
          roleName: role.name, 
          toolGroups: updatedRole.toolGroups 
        });
        
        this._sendJson(res, 200, { 
          ok: true, 
          role: {
            id: updatedRole.id,
            name: updatedRole.name,
            toolGroups: updatedRole.toolGroups
          }
        });
      } catch (err) {
        void this.log.error("更新岗位工具组失败", { roleId, error: err.message, stack: err.stack });
        this._sendJson(res, 500, { error: "internal_error", message: err.message });
      }
    });
  }
}
