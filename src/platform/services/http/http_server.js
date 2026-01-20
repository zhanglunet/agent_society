import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createNoopModuleLogger, formatLocalTime } from "../../utils/logger/logger.js";

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
 * - GET /api/workspaces/:workspaceId/file?path=xxx - 获取工作空间文件内容
 * - GET /api/workspaces/:workspaceId/meta - 获取工作空间元信息
 * - GET /web/* - 静态文件服务
 * - GET /artifacts/* - 工件文件服务
 * - GET /workspace-files/:workspaceId/:filePath - 工作空间文件服务
 */
export class HTTPServer {
  /**
   * @param {{port?:number, society?:any, logger?:any, runtimeDir?:string, artifactsDir?:string, configService?:any}} options
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
    this._artifactsDir = options.artifactsDir ?? null;
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
  }

  /**
   * 设置配置服务。
   * @param {any} configService - ConfigService 实例
   */
  setConfigService(configService) {
    this._configService = configService;
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
  }

  /**
   * 设置工件目录。
   * @param {string} artifactsDir
   */
  setArtifactsDir(artifactsDir) {
    this._artifactsDir = artifactsDir;
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
   * @param {{agentId: string, toolName: string, args: object, result: any, taskId: string|null, callId: string, timestamp: string}} event
   * @returns {Promise<void>}
   */
  async _storeToolCall(event) {
    const { agentId, toolName, args, result, taskId, callId, timestamp, reasoningContent } = event;
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
        result
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
        this._handleGetAgents(res);
      } else if (method === "GET" && pathname === "/api/events") {
        // 获取最近的错误和重试事件
        this._handleGetEvents(req, res);
      } else if (method === "GET" && pathname === "/api/roles") {
        this._handleGetRoles(res);
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
      } else if (method === "GET" && pathname === "/api/artifacts") {
        // 获取工件列表
        this._handleGetArtifacts(res);
      } else if (method === "GET" && pathname.startsWith("/api/artifacts/")) {
        const parts = pathname.slice("/api/artifacts/".length).split("/");
        const artifactId = decodeURIComponent(parts[0]);
        if (parts.length === 1) {
          // 获取单个工件内容
          this._handleGetArtifact(artifactId, res);
        } else if (parts[1] === "metadata") {
          // 获取工件元数据
          this._handleGetArtifactMetadata(artifactId, res);
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
        this._handleGetCustomNames(res);
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
      } else if (method === "GET" && pathname.startsWith("/web/")) {
        // 异步处理静态文件
        this._handleStaticFile(pathname, res).catch(err => {
          void this.log.error("处理静态文件请求失败", { pathname, error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "GET" && (pathname === "/web" || pathname === "/")) {
        // 重定向到 /web/index.html
        this._handleStaticFile("/web/index.html", res).catch(err => {
          void this.log.error("处理静态文件请求失败", { pathname: "/web/index.html", error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
      } else if (method === "GET" && pathname.startsWith("/artifacts/")) {
        // 工件文件服务
        this._handleArtifactFile(pathname, res).catch(err => {
          void this.log.error("处理工件文件请求失败", { pathname, error: err.message, stack: err.stack });
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
      } else if (method === "GET" && pathname.startsWith("/api/workspaces/")) {
        // 工作空间相关API
        const parts = pathname.slice("/api/workspaces/".length).split("/");
        const workspaceId = decodeURIComponent(parts[0]);
        if (parts.length === 1 || (parts.length === 2 && parts[1] === "")) {
          // 获取工作空间文件列表: GET /api/workspaces/:workspaceId
          this._handleGetWorkspaceFiles(workspaceId, res).catch(err => {
            void this.log.error("处理工作空间文件列表请求失败", { workspaceId, error: err.message, stack: err.stack });
            this._sendJson(res, 500, { error: "internal_error", message: err.message });
          });
        } else if (parts[1] === "file") {
          // 获取工作空间文件内容: GET /api/workspaces/:workspaceId/file?path=xxx
          const filePath = url.searchParams.get("path") || "";
          this._handleGetWorkspaceFile(workspaceId, filePath, res).catch(err => {
            void this.log.error("处理工作空间文件内容请求失败", { workspaceId, filePath, error: err.message, stack: err.stack });
            this._sendJson(res, 500, { error: "internal_error", message: err.message });
          });
        } else if (parts[1] === "meta") {
          // 获取工作空间元信息: GET /api/workspaces/:workspaceId/meta
          this._handleGetWorkspaceMeta(workspaceId, res).catch(err => {
            void this.log.error("处理工作空间元信息请求失败", { workspaceId, error: err.message, stack: err.stack });
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
    this._readJsonBody(req, (err, body) => {
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
      const result = this.society.sendTextToAgent("root", text);
      
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
            artifactRef: att.artifactRef,
            filename: att.filename
          }))
        };
      }

      // 调用User_Endpoint将消息发送到指定智能体
      const options = taskId ? { taskId } : {};
      const result = this.society.sendTextToAgent(agentId, messagePayload, options);

      if (result.error) {
        this._sendJson(res, 400, { error: result.error });
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

  /**
   * 处理 POST /api/upload - 文件上传。
   * Content-Type: multipart/form-data
   * 
   * Request:
   *   - file: 文件数据
   *   - type: 'image' | 'file'
   *   - filename: 原始文件名
   *
   * Response:
   *   {
   *     ok: true,
   *     artifactRef: "artifact:uuid",
   *     metadata: {
   *       id: "uuid",
   *       type: "image",
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

    // 检查 artifactStore 是否可用
    if (!this.society || !this.society.runtime || !this.society.runtime.artifacts) {
      void this.log.error("文件上传失败: artifact store 未初始化", {
        hasSociety: !!this.society,
        hasRuntime: !!(this.society && this.society.runtime),
        hasArtifacts: !!(this.society && this.society.runtime && this.society.runtime.artifacts)
      });
      this._sendJson(res, 500, { error: "artifact_store_not_initialized", message: "工件存储服务未初始化" });
      return;
    }

    const artifactStore = this.society.runtime.artifacts;

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

      // 获取文件类型和文件名
      const type = fields.type || "file";
      const filename = fields.filename || file.filename || `upload_${Date.now()}`;
      const mimeType = file.mimeType || "application/octet-stream";

      // 保存文件到 artifact store
      const result = await artifactStore.saveUploadedFile(file.buffer, {
        type,
        filename,
        mimeType
      });

      void this.log.info("文件上传成功", { 
        artifactRef: result.artifactRef, 
        filename, 
        size: file.buffer.length,
        type,
        mimeType
      });

      this._sendJson(res, 200, {
        ok: true,
        artifactRef: result.artifactRef,
        metadata: result.metadata
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
  _handleGetAgents(res) {
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
          customName: this.getCustomName("root")
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
          customName: this.getCustomName("user")
        },
        ...persistedAgents.map(a => ({
          id: a.id,
          roleId: a.roleId,
          roleName: roleMap.get(a.roleId) ?? a.roleId,
          parentAgentId: a.parentAgentId,
          createdAt: a.createdAt,
          lastActiveAt: this._getLastActiveAt(a.id),
          status: a.status ?? "active",
          computeStatus: getComputeStatus(a.id),
          terminatedAt: a.terminatedAt,
          customName: this.getCustomName(a.id)
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
      const roles = org ? org.listRoles() : [];
      const agents = org ? org.listAgents() : [];

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

      // 使用 ContextBuilder 构建 system prompt
      let systemPrompt = "";
      if (runtime._contextBuilder && typeof runtime._contextBuilder.buildSystemPromptForAgent === "function") {
        systemPrompt = runtime._contextBuilder.buildSystemPromptForAgent(ctx);
      } else {
        // 降级方案：使用旧的方法
        systemPrompt = runtime._buildSystemPromptForAgent(ctx);
      }

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
      const agents = org ? org.listAgents() : [];
      const roles = org ? org.listRoles() : [];
      
      // 创建岗位ID到名称的映射
      const roleMap = new Map(roles.map(r => [r.id, r.name]));

      // 构建智能体映射
      const agentMap = new Map();
      agentMap.set("root", {
        id: "root",
        roleName: "root",
        parentAgentId: null,
        status: "active",
        children: []
      });
      agentMap.set("user", {
        id: "user",
        roleName: "user",
        parentAgentId: null,
        status: "active",
        children: []
      });

      for (const agent of agents) {
        agentMap.set(agent.id, {
          id: agent.id,
          roleName: roleMap.get(agent.roleId) ?? agent.roleId,
          parentAgentId: agent.parentAgentId,
          status: agent.status ?? "active",
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

      // 添加用户定义的岗位
      for (const role of roles) {
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
        await this.setCustomName(agentId, customName || "");
        void this.log.info("设置智能体自定义名称", { agentId, customName: customName || "(cleared)" });
        this._sendJson(res, 200, { 
          ok: true, 
          agentId, 
          customName: this.getCustomName(agentId) 
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

        const termination = await org.recordTermination(agentId, deletedBy, reason);

        void this.log.info("删除智能体", { agentId, deletedBy, reason });
        this._sendJson(res, 200, { 
          ok: true, 
          agentId,
          termination
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

        const deleteResult = await org.deleteRole(roleId, deletedBy, reason);

        void this.log.info("删除岗位", { 
          roleId, 
          roleName: role.name,
          deletedBy, 
          reason,
          affectedAgentsCount: deleteResult.affectedAgents.length,
          affectedRolesCount: deleteResult.affectedRoles.length
        });
        
        this._sendJson(res, 200, { 
          ok: true, 
          roleId,
          roleName: role.name,
          deleteResult
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
  _handleGetCustomNames(res) {
    try {
      const customNames = this.getAllCustomNames();
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
  async _handleStaticFile(pathname, res) {
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
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon"
      };
      const contentType = contentTypes[ext] ?? "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.writeHead(200);
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
   * 处理工件文件请求。
   * @param {string} pathname - 请求路径
   * @param {import("node:http").ServerResponse} res
   */
  async _handleArtifactFile(pathname, res) {
    // 检查是否配置了工件目录
    if (!this._artifactsDir) {
      this._sendJson(res, 500, { error: "artifacts_not_configured", message: "工件目录未配置" });
      return;
    }

    const { ArtifactStore } = require("../artifact/artifact_store.js");

    // 移除 /artifacts/ 前缀，获取相对路径
    let relativePath = pathname.replace(/^\/artifacts\/?/, "");
    if (!relativePath || relativePath === "") {
      this._sendJson(res, 400, { error: "invalid_path", message: "文件路径不能为空" });
      return;
    }

    // 构建文件路径
    const filePath = path.join(this._artifactsDir, relativePath);

    // 安全检查：防止路径遍历攻击
    const artifactsDir = path.resolve(this._artifactsDir);
    let resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(artifactsDir)) {
      this._sendJson(res, 403, { error: "forbidden", message: "路径访问被拒绝" });
      return;
    }

    try {
      // 检查文件是否存在
      if (!existsSync(resolvedPath)) {
        // 文件不存在时，检查是否有同名的 .meta 文件
        // 从 relativePath 中提取可能的 artifactId（去掉扩展名）
        const artifactId = path.basename(relativePath, path.extname(relativePath)) || relativePath;
        const metaFilePath = path.join(this._artifactsDir, `${artifactId}${ArtifactStore.META_EXTENSION}`);
        
        if (existsSync(metaFilePath)) {
          try {
            const metaContent = await readFile(metaFilePath, "utf8");
            const metadata = JSON.parse(metaContent);
            const extension = metadata.extension || ".json";
            
            // 使用 .meta 文件中的扩展名构建实际文件路径
            const actualFilePath = path.join(this._artifactsDir, `${artifactId}${extension}`);
            const actualResolvedPath = path.resolve(actualFilePath);
            
            // 再次进行安全检查
            if (!actualResolvedPath.startsWith(artifactsDir)) {
              this._sendJson(res, 403, { error: "forbidden", message: "路径访问被拒绝" });
              return;
            }
            
            if (existsSync(actualResolvedPath)) {
              // 找到了实际文件，更新路径
              resolvedPath = actualResolvedPath;
              relativePath = `${artifactId}${extension}`;
              void this.log.debug("通过 .meta 文件找到工件", { artifactId, extension, actualPath: relativePath });
            } else {
              void this.log.warn("工件文件不存在（.meta 文件存在但工件文件缺失）", { 
                path: relativePath, 
                metaFile: metaFilePath,
                expectedFile: actualFilePath 
              });
              this._sendJson(res, 404, { error: "not_found", path: pathname });
              return;
            }
          } catch (e) {
            // .meta 文件解析失败，返回 404
            void this.log.warn("工件文件不存在（.meta 文件解析失败）", { path: relativePath, error: e.message });
            this._sendJson(res, 404, { error: "not_found", path: pathname });
            return;
          }
        } else {
          void this.log.warn("工件文件不存在", { path: relativePath, resolvedPath });
          this._sendJson(res, 404, { error: "not_found", path: pathname });
          return;
        }
      }

      // 读取文件内容
      const content = await readFile(resolvedPath);

      // 根据文件扩展名设置 Content-Type
      const ext = path.extname(relativePath).toLowerCase();
      const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".ico": "image/x-icon",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".xml": "application/xml; charset=utf-8",
        ".pdf": "application/pdf"
      };
      const contentType = contentTypes[ext] ?? "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.writeHead(200);
      res.end(content);

      void this.log.debug("HTTP工件文件", { path: relativePath });
    } catch (err) {
      void this.log.error("读取工件文件失败", { path: relativePath, error: err.message });
      this._sendJson(res, 500, { error: "read_file_failed", message: err.message });
    }
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
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(statusCode);
    res.end(JSON.stringify(data));
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
   * 处理 GET /api/artifacts - 获取工件列表。
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetArtifacts(res) {
    try {
      if (!this._artifactsDir) {
        // 工件目录未设置时返回空列表
        this._sendJson(res, 200, { artifacts: [], count: 0 });
        return;
      }

      const { readdirSync, statSync, existsSync, readFileSync } = require("node:fs");
      const { ArtifactStore } = require("../artifact/artifact_store.js");
      
      // 目录不存在时返回空列表
      if (!existsSync(this._artifactsDir)) {
        this._sendJson(res, 200, { artifacts: [], count: 0 });
        return;
      }
      
      // 获取所有文件（不仅仅是 JSON），但过滤掉 .meta 文件
      const files = readdirSync(this._artifactsDir).filter(filename => {
        return !ArtifactStore.isMetaFile(filename);
      });
      
      const artifacts = files.map(filename => {
        const filePath = path.join(this._artifactsDir, filename);
        const stat = statSync(filePath);
        const extension = path.extname(filename);
        const id = filename.replace(extension, "");
        
        // 尝试读取元信息文件
        let metadata = null;
        const metaFilePath = path.join(this._artifactsDir, `${id}${ArtifactStore.META_EXTENSION}`);
        if (existsSync(metaFilePath)) {
          try {
            const metaContent = readFileSync(metaFilePath, "utf8");
            metadata = JSON.parse(metaContent);
          } catch (e) {
            // 忽略元信息读取错误
          }
        }
        
        return {
          id,
          filename,
          size: stat.size,
          createdAt: metadata?.createdAt || stat.birthtime?.toISOString() || stat.mtime?.toISOString(),
          extension: metadata?.extension || extension,
          type: metadata?.type || null,
          messageId: metadata?.messageId || null,
          // 添加元数据中的名称信息
          meta: metadata?.meta || null,
          name: metadata?.meta?.name || null
        };
      }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      void this.log.debug("HTTP查询工件列表", { count: artifacts.length });
      this._sendJson(res, 200, { 
        artifacts,
        count: artifacts.length
      });
    } catch (err) {
      void this.log.error("查询工件列表失败", { error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/artifacts/:id - 获取单个工件内容。
   * @param {string} artifactId
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetArtifact(artifactId, res) {
    try {
      if (!this._artifactsDir) {
        this._sendJson(res, 500, { error: "artifacts_dir_not_set" });
        return;
      }

      const { readFileSync, existsSync } = require("node:fs");
      const { ArtifactStore } = require("../artifact/artifact_store.js");
      
      // 尝试读取元信息文件获取扩展名
      let extension = ".json";
      const metaFilePath = path.join(this._artifactsDir, `${artifactId}${ArtifactStore.META_EXTENSION}`);
      let metadata = null;
      
      if (existsSync(metaFilePath)) {
        try {
          const metaContent = readFileSync(metaFilePath, "utf8");
          metadata = JSON.parse(metaContent);
          extension = metadata.extension || ".json";
        } catch (e) {
          // 忽略元信息读取错误，使用默认扩展名
        }
      }
      
      const filePath = path.join(this._artifactsDir, `${artifactId}${extension}`);
      
      if (!existsSync(filePath)) {
        this._sendJson(res, 404, { error: "artifact_not_found", id: artifactId });
        return;
      }

      const rawContent = readFileSync(filePath, "utf8");
      let content;
      
      // 尝试解析为 JSON
      try {
        content = JSON.parse(rawContent);
      } catch (e) {
        content = rawContent;
      }

      // 返回合并后的工件对象
      const artifact = {
        id: artifactId,
        content,
        ...(metadata || { createdAt: new Date().toISOString() })
      };

      void this.log.debug("HTTP查询工件", { id: artifactId });
      this._sendJson(res, 200, artifact);
    } catch (err) {
      void this.log.error("查询工件失败", { id: artifactId, error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/artifacts/:id/metadata - 获取工件元数据。
   * @param {string} artifactId
   * @param {import("node:http").ServerResponse} res
   */
  _handleGetArtifactMetadata(artifactId, res) {
    try {
      if (!this._artifactsDir) {
        this._sendJson(res, 500, { error: "artifacts_dir_not_set" });
        return;
      }

      const { readFileSync, existsSync, statSync } = require("node:fs");
      const { ArtifactStore } = require("../artifact/artifact_store.js");
      
      // 首先尝试读取 .meta 文件
      const metaFilePath = path.join(this._artifactsDir, `${artifactId}${ArtifactStore.META_EXTENSION}`);
      
      if (existsSync(metaFilePath)) {
        try {
          const metaContent = readFileSync(metaFilePath, "utf8");
          const metadata = JSON.parse(metaContent);
          
          // 获取工件文件的大小
          const extension = metadata.extension || ".json";
          const artifactFilePath = path.join(this._artifactsDir, `${artifactId}${extension}`);
          let size = 0;
          if (existsSync(artifactFilePath)) {
            const stat = statSync(artifactFilePath);
            size = stat.size;
          }
          
          void this.log.debug("HTTP查询工件元数据（从meta文件）", { id: artifactId });
          this._sendJson(res, 200, {
            ...metadata,
            filename: `${artifactId}${extension}`,
            size
          });
          return;
        } catch (e) {
          // 元信息文件解析失败，继续尝试旧格式
        }
      }
      
      // 兼容旧格式：从 JSON 工件文件中读取元信息
      const filePath = path.join(this._artifactsDir, `${artifactId}.json`);
      
      if (!existsSync(filePath)) {
        this._sendJson(res, 404, { error: "artifact_not_found", id: artifactId });
        return;
      }

      const content = readFileSync(filePath, "utf8");
      const artifact = JSON.parse(content);
      const stat = statSync(filePath);

      const metadata = {
        id: artifact.id || artifactId,
        filename: `${artifactId}.json`,
        size: stat.size,
        extension: ".json",
        createdAt: artifact.createdAt,
        messageId: artifact.messageId || null,
        type: artifact.type || null,
        mimeType: "application/json"
      };

      void this.log.debug("HTTP查询工件元数据（从工件文件）", { id: artifactId });
      this._sendJson(res, 200, metadata);
    } catch (err) {
      void this.log.error("查询工件元数据失败", { id: artifactId, error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
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
      const workspacesDir = this._getWorkspacesDir();
      if (!workspacesDir) {
        this._sendJson(res, 200, { workspaces: [], count: 0 });
        return;
      }

      const { readdirSync, statSync, existsSync, readFileSync } = require("node:fs");
      
      if (!existsSync(workspacesDir)) {
        this._sendJson(res, 200, { workspaces: [], count: 0 });
        return;
      }

      const entries = readdirSync(workspacesDir, { withFileTypes: true });
      const workspaces = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const workspaceId = entry.name;
          const workspacePath = path.join(workspacesDir, workspaceId);
          const stat = statSync(workspacePath);
          
          // 尝试读取元信息文件
          let metadata = null;
          const metaFilePath = path.join(workspacesDir, `${workspaceId}.meta.json`);
          if (existsSync(metaFilePath)) {
            try {
              const metaContent = readFileSync(metaFilePath, "utf8");
              metadata = JSON.parse(metaContent);
            } catch (e) {
              // 忽略元信息读取错误
            }
          }

          // 统计文件数量
          let fileCount = 0;
          try {
            const files = readdirSync(workspacePath);
            fileCount = files.length;
          } catch (e) {
            // 忽略读取错误
          }

          workspaces.push({
            id: workspaceId,
            name: metadata?.name || workspaceId,
            createdAt: metadata?.createdAt || stat.birthtime?.toISOString() || stat.mtime?.toISOString(),
            modifiedAt: stat.mtime?.toISOString(),
            fileCount,
            metadata
          });
        }
      }

      // 按修改时间降序排列
      workspaces.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

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
      const workspacesDir = this._getWorkspacesDir();
      if (!workspacesDir) {
        this._sendJson(res, 500, { error: "workspaces_dir_not_set" });
        return;
      }

      const { readdirSync, statSync, existsSync, readFileSync } = require("node:fs");
      const workspacePath = path.join(workspacesDir, workspaceId);

      if (!existsSync(workspacePath)) {
        this._sendJson(res, 404, { error: "workspace_not_found", id: workspaceId });
        return;
      }

      // 读取工作空间元信息
      let workspaceMeta = null;
      const metaFilePath = path.join(workspacesDir, `${workspaceId}.meta.json`);
      if (existsSync(metaFilePath)) {
        try {
          const metaContent = readFileSync(metaFilePath, "utf8");
          workspaceMeta = JSON.parse(metaContent);
        } catch (e) {
          // 忽略元信息读取错误
        }
      }

      // 递归获取所有文件
      const files = [];
      const collectFiles = (dirPath, relativePath = "") => {
        const entries = readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const entryRelativePath = relativePath ? `${relativePath}/${entry.name}` : entry.name;
          const entryFullPath = path.join(dirPath, entry.name);
          
          if (entry.isDirectory()) {
            collectFiles(entryFullPath, entryRelativePath);
          } else {
            const stat = statSync(entryFullPath);
            const extension = path.extname(entry.name).toLowerCase();
            
            // 从工作空间元信息中获取文件的元信息
            const fileMeta = workspaceMeta?.files?.[entryRelativePath] || null;
            
            files.push({
              name: entry.name,
              path: entryRelativePath,
              size: stat.size,
              extension,
              createdAt: stat.birthtime?.toISOString() || stat.mtime?.toISOString(),
              modifiedAt: stat.mtime?.toISOString(),
              messageId: fileMeta?.messageId || null,
              agentId: fileMeta?.agentId || null,
              meta: fileMeta
            });
          }
        }
      };

      collectFiles(workspacePath);

      // 按修改时间降序排列
      files.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));

      void this.log.debug("HTTP查询工作空间文件列表", { workspaceId, count: files.length });
      this._sendJson(res, 200, { 
        workspaceId,
        name: workspaceMeta?.name || workspaceId,
        files, 
        count: files.length,
        metadata: workspaceMeta
      });
    } catch (err) {
      void this.log.error("查询工作空间文件列表失败", { workspaceId, error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/workspaces/:workspaceId/file?path=xxx - 获取工作空间文件内容。
   * @param {string} workspaceId
   * @param {string} filePath
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetWorkspaceFile(workspaceId, filePath, res) {
    try {
      const workspacesDir = this._getWorkspacesDir();
      if (!workspacesDir) {
        this._sendJson(res, 500, { error: "workspaces_dir_not_set" });
        return;
      }

      if (!filePath) {
        this._sendJson(res, 400, { error: "file_path_required" });
        return;
      }

      const { existsSync, readFileSync, statSync } = require("node:fs");
      const workspacePath = path.join(workspacesDir, workspaceId);

      if (!existsSync(workspacePath)) {
        this._sendJson(res, 404, { error: "workspace_not_found", id: workspaceId });
        return;
      }

      // 安全检查：防止路径遍历
      const normalizedPath = path.normalize(filePath);
      if (normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) {
        this._sendJson(res, 403, { error: "path_traversal_blocked" });
        return;
      }

      const fullPath = path.join(workspacePath, normalizedPath);
      const resolvedPath = path.resolve(fullPath);
      const resolvedWorkspace = path.resolve(workspacePath);

      if (!resolvedPath.startsWith(resolvedWorkspace)) {
        this._sendJson(res, 403, { error: "path_traversal_blocked" });
        return;
      }

      if (!existsSync(fullPath)) {
        this._sendJson(res, 404, { error: "file_not_found", path: filePath });
        return;
      }

      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        this._sendJson(res, 400, { error: "is_directory", path: filePath });
        return;
      }

      // 读取工作空间元信息获取文件的元信息
      let fileMeta = null;
      const metaFilePath = path.join(workspacesDir, `${workspaceId}.meta.json`);
      if (existsSync(metaFilePath)) {
        try {
          const metaContent = readFileSync(metaFilePath, "utf8");
          const workspaceMeta = JSON.parse(metaContent);
          fileMeta = workspaceMeta?.files?.[normalizedPath] || null;
        } catch (e) {
          // 忽略元信息读取错误
        }
      }

      // 读取文件内容
      const content = readFileSync(fullPath, "utf8");
      const extension = path.extname(filePath).toLowerCase();

      void this.log.debug("HTTP读取工作空间文件", { workspaceId, filePath });
      this._sendJson(res, 200, {
        workspaceId,
        path: normalizedPath,
        name: path.basename(filePath),
        content,
        size: stat.size,
        extension,
        modifiedAt: stat.mtime?.toISOString(),
        messageId: fileMeta?.messageId || null,
        agentId: fileMeta?.agentId || null,
        meta: fileMeta
      });
    } catch (err) {
      void this.log.error("读取工作空间文件失败", { workspaceId, filePath, error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /api/workspaces/:workspaceId/meta - 获取工作空间元信息。
   * @param {string} workspaceId
   * @param {import("node:http").ServerResponse} res
   */
  async _handleGetWorkspaceMeta(workspaceId, res) {
    try {
      const workspacesDir = this._getWorkspacesDir();
      if (!workspacesDir) {
        this._sendJson(res, 500, { error: "workspaces_dir_not_set" });
        return;
      }

      const { existsSync, readFileSync, statSync } = require("node:fs");
      const workspacePath = path.join(workspacesDir, workspaceId);

      if (!existsSync(workspacePath)) {
        this._sendJson(res, 404, { error: "workspace_not_found", id: workspaceId });
        return;
      }

      const metaFilePath = path.join(workspacesDir, `${workspaceId}.meta.json`);
      let metadata = null;

      if (existsSync(metaFilePath)) {
        try {
          const metaContent = readFileSync(metaFilePath, "utf8");
          metadata = JSON.parse(metaContent);
        } catch (e) {
          // 元信息文件解析失败
        }
      }

      const stat = statSync(workspacePath);

      void this.log.debug("HTTP查询工作空间元信息", { workspaceId });
      this._sendJson(res, 200, {
        workspaceId,
        name: metadata?.name || workspaceId,
        createdAt: metadata?.createdAt || stat.birthtime?.toISOString(),
        modifiedAt: stat.mtime?.toISOString(),
        metadata
      });
    } catch (err) {
      void this.log.error("查询工作空间元信息失败", { workspaceId, error: err.message });
      this._sendJson(res, 500, { error: "internal_error", message: err.message });
    }
  }

  /**
   * 处理 GET /workspace-files/:workspaceId/:filePath - 工作空间文件静态服务。
   * @param {string} pathname
   * @param {import("node:http").ServerResponse} res
   */
  async _handleWorkspaceFile(pathname, res) {
    const workspacesDir = this._getWorkspacesDir();
    if (!workspacesDir) {
      this._sendJson(res, 500, { error: "workspaces_not_configured", message: "工作空间目录未配置" });
      return;
    }

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

    // 构建文件路径
    const fullPath = path.join(workspacesDir, workspaceId, filePath);

    // 安全检查：防止路径遍历攻击
    const resolvedWorkspacesDir = path.resolve(workspacesDir);
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(resolvedWorkspacesDir)) {
      this._sendJson(res, 403, { error: "forbidden", message: "路径访问被拒绝" });
      return;
    }

    try {
      // 检查文件是否存在
      if (!existsSync(resolvedPath)) {
        void this.log.warn("工作空间文件不存在", { workspaceId, filePath, resolvedPath });
        this._sendJson(res, 404, { error: "not_found", path: pathname });
        return;
      }

      // 读取文件内容
      const content = await readFile(resolvedPath);

      // 根据文件扩展名设置 Content-Type
      const ext = path.extname(filePath).toLowerCase();
      const contentTypes = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "application/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".webp": "image/webp",
        ".ico": "image/x-icon",
        ".txt": "text/plain; charset=utf-8",
        ".md": "text/markdown; charset=utf-8",
        ".xml": "application/xml; charset=utf-8",
        ".pdf": "application/pdf"
      };
      const contentType = contentTypes[ext] ?? "application/octet-stream";

      res.setHeader("Content-Type", contentType);
      res.writeHead(200);
      res.end(content);

      void this.log.debug("HTTP工作空间文件", { workspaceId, filePath });
    } catch (err) {
      void this.log.error("读取工作空间文件失败", { workspaceId, filePath, error: err.message });
      this._sendJson(res, 500, { error: "read_file_failed", message: err.message });
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

        // 触发 LLM Client 重新加载
        await this._reloadLlmClient();

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

        // 触发 LLM Service Registry 重新加载
        await this._reloadLlmServiceRegistry();

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

        // 触发 LLM Service Registry 重新加载
        await this._reloadLlmServiceRegistry();

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

      // 触发 LLM Service Registry 重新加载
      await this._reloadLlmServiceRegistry();

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
   * 重新加载 LLM Client。
   * 配置保存后调用此方法使新配置立即生效。
   * @returns {Promise<void>}
   */
  async _reloadLlmClient() {
    if (!this.society || !this.society.runtime) {
      void this.log.warn("无法重新加载 LLM Client：society 或 runtime 未初始化");
      return;
    }

    try {
      const runtime = this.society.runtime;
      if (typeof runtime.reloadLlmClient === "function") {
        await runtime.reloadLlmClient();
        this.setLlmStatus("connected");
        void this.log.info("LLM Client 已重新加载");
      } else {
        void this.log.warn("runtime 不支持 reloadLlmClient 方法");
      }
    } catch (err) {
      this.setLlmStatus("error", err.message);
      void this.log.error("重新加载 LLM Client 失败", { error: err.message });
      throw err;
    }
  }

  /**
   * 重新加载 LLM Service Registry。
   * 服务配置变更后调用此方法使新配置立即生效。
   * @returns {Promise<void>}
   */
  async _reloadLlmServiceRegistry() {
    if (!this.society || !this.society.runtime) {
      void this.log.warn("无法重新加载 LLM Service Registry：society 或 runtime 未初始化");
      return;
    }

    try {
      const runtime = this.society.runtime;
      if (typeof runtime.reloadLlmServiceRegistry === "function") {
        await runtime.reloadLlmServiceRegistry();
        void this.log.info("LLM Service Registry 已重新加载");
      } else {
        void this.log.warn("runtime 不支持 reloadLlmServiceRegistry 方法");
      }
    } catch (err) {
      void this.log.error("重新加载 LLM Service Registry 失败", { error: err.message });
      throw err;
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
