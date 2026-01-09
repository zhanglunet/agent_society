import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, appendFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createNoopModuleLogger } from "./logger.js";

/**
 * HTTP服务器组件：提供REST API接口与Agent Society交互。
 * 
 * 端点：
 * - POST /api/submit - 提交需求给根智能体
 * - POST /api/send - 发送消息到指定智能体
 * - GET /api/messages/:taskId - 查询任务消息（按taskId）
 * - GET /api/agents - 列出所有智能体（含持久化数据）
 * - GET /api/roles - 列出所有岗位及智能体数量
 * - GET /api/agent-messages/:agentId - 查询智能体消息（按agentId）
 * - GET /api/org/tree - 获取组织层级树结构
 * - GET /api/org/role-tree - 获取岗位从属关系树结构
 * - POST /api/agent/:agentId/custom-name - 设置智能体自定义名称
 * - GET /api/agent-custom-names - 获取所有智能体自定义名称
 * - POST /api/role/:roleId/prompt - 更新岗位职责提示词
 * - GET /web/* - 静态文件服务
 * - GET /artifacts/* - 工件文件服务
 */
export class HTTPServer {
  /**
   * @param {{port?:number, society?:any, logger?:any, runtimeDir?:string, artifactsDir?:string}} options
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
    // 去重检查
    if (this._messagesById.has(message.id)) {
      return;
    }
    
    this._messagesById.set(message.id, message);

    const { from, to } = message;

    // 存储到发送者的消息列表
    if (from) {
      if (!this._messagesByAgent.has(from)) {
        this._messagesByAgent.set(from, []);
      }
      this._messagesByAgent.get(from).push(message);
      await this._appendMessageToFile(from, message);
    }

    // 存储到接收者的消息列表（如果不同于发送者）
    if (to && to !== from) {
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
          const messageId = originalSend(msg);
          // 存储消息
          void this._storeMessage({
            id: messageId,
            from: msg.from,
            to: msg.to,
            taskId: msg.taskId,
            payload: msg.payload,
            createdAt: new Date().toISOString()
          });
          return messageId;
        };
      }

      // 监听工具调用事件（如果 runtime 支持）
      if (society.runtime && typeof society.runtime.onToolCall === "function") {
        society.runtime.onToolCall((event) => {
          void this._storeToolCall(event);
        });
      }
    }
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
          this._handleRequest(req, res);
        });

        this._server.on("error", (err) => {
          const message = err && typeof err.message === "string" ? err.message : String(err);
          void this.log.error("HTTP服务器错误", { error: message });
          resolve({ ok: false, error: message });
        });

        this._server.listen(this.port, () => {
          this._isRunning = true;
          void this.log.info("HTTP服务器启动", { port: this.port });
          resolve({ ok: true, port: this.port });
        });
      } catch (err) {
        const message = err && typeof err.message === "string" ? err.message : String(err);
        void this.log.error("HTTP服务器启动失败", { error: message });
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
  _handleRequest(req, res) {
    try {
      const url = new URL(req.url ?? "/", `http://localhost:${this.port}`);
      const method = req.method?.toUpperCase() ?? "GET";
      const pathname = url.pathname;

      void this.log.debug("收到HTTP请求", { method, pathname });

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
      } else if (method === "GET" && pathname.startsWith("/api/messages/")) {
        const taskId = pathname.slice("/api/messages/".length);
        this._handleGetMessages(taskId, res);
      } else if (method === "GET" && pathname === "/api/agents") {
        this._handleGetAgents(res);
      } else if (method === "GET" && pathname === "/api/roles") {
        this._handleGetRoles(res);
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
          this._handleAbortLlmCall(agentId, res);
        } else {
          this._sendJson(res, 404, { error: "not_found", path: pathname });
        }
      } else if (method === "GET" && pathname === "/api/agent-custom-names") {
        this._handleGetCustomNames(res);
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
      } else if (pathname.startsWith("/api/modules")) {
        // 模块 API 路由
        this._handleModuleApi(req, res, method, pathname).catch(err => {
          void this.log.error("处理模块 API 请求失败", { pathname, error: err.message, stack: err.stack });
          this._sendJson(res, 500, { error: "internal_error", message: err.message });
        });
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

      if (!agentId || typeof agentId !== "string") {
        this._sendJson(res, 400, { error: "missing_agent_id", message: "请求体必须包含agentId或to字段" });
        return;
      }

      if (!text || typeof text !== "string") {
        this._sendJson(res, 400, { error: "missing_text", message: "请求体必须包含text或message字段" });
        return;
      }

      if (!this.society) {
        this._sendJson(res, 500, { error: "society_not_initialized" });
        return;
      }

      // 调用User_Endpoint将消息发送到指定智能体
      const options = taskId ? { taskId } : {};
      const result = this.society.sendTextToAgent(agentId, text, options);

      if (result.error) {
        this._sendJson(res, 400, { error: result.error });
        return;
      }

      void this.log.info("HTTP发送消息", { agentId, taskId: result.taskId });
      this._sendJson(res, 200, { 
        ok: true,
        messageId: randomUUID(), // 生成消息ID用于追踪
        taskId: result.taskId,
        to: result.to
      });
    });
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
          llmServiceId: null
        },
        {
          id: "user",
          name: "user",
          rolePrompt: "用户端点",
          createdBy: null,
          createdAt: null,
          agentCount: 1,
          llmServiceId: null
        },
        ...roles.map(r => ({
          id: r.id,
          name: r.name,
          rolePrompt: r.rolePrompt,
          createdBy: r.createdBy,
          createdAt: r.createdAt,
          agentCount: agentCountByRole.get(r.id) ?? 0,
          llmServiceId: r.llmServiceId ?? null
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
  _handleAbortLlmCall(agentId, res) {
    if (!this.society || !this.society.runtime) {
      void this.log.error("中断请求失败：系统未初始化", { agentId });
      this._sendJson(res, 500, { error: "society_not_initialized" });
      return;
    }

    try {
      const result = this.society.runtime.abortAgentLlmCall(agentId);

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
        timestamp: new Date().toISOString()
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
      this._sendJson(res, 403, { error: "forbidden", message: "路径访问被拒绝" });
      return;
    }

    try {
      // 检查文件是否存在
      if (!existsSync(resolvedPath)) {
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
      void this.log.error("读取静态文件失败", { path: relativePath, error: err.message });
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
    const resolvedPath = path.resolve(filePath);
    if (!resolvedPath.startsWith(artifactsDir)) {
      this._sendJson(res, 403, { error: "forbidden", message: "路径访问被拒绝" });
      return;
    }

    try {
      // 检查文件是否存在
      if (!existsSync(resolvedPath)) {
        void this.log.warn("工件文件不存在", { path: relativePath, resolvedPath });
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
}
