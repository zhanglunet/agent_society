import { randomUUID } from "node:crypto";
import path from "node:path";
import { Agent } from "../../agents/agent.js";
import { Runtime } from "./runtime.js";
import { HTTPServer } from "../http_server.js";
import { ConfigService } from "../config_service.js";
import { createNoopModuleLogger } from "../logger.js";

/**
 * 面向"用户"的系统入口：隐藏运行时与根智能体的构建细节。
 * 用户只需要：
 * 1) 提交自然语言需求给根智能体；
 * 2) 通过用户端点智能体发送消息到指定智能体，并接收异步回传。
 */
export class AgentSociety {
  /**
   * @param {{config?:object, configPath?:string, maxSteps?:number, httpPort?:number, enableHttp?:boolean, shutdownTimeoutMs?:number, dataDir?:string}} [options]
   */
  constructor(options = {}) {
    this.runtime = new Runtime(options);
    this._dataDir = options.dataDir ?? null;
    this._userInbox = [];
    this._userMessageListeners = new Set();
    this.log = createNoopModuleLogger();
    this._rootPrompt = null;
    this._httpPort = options.httpPort ?? 3000;
    this._enableHttp = options.enableHttp ?? false;
    this._httpServer = null;
    this._shutdownTimeoutMs = options.shutdownTimeoutMs ?? 30000;
  }

  /**
   * 初始化系统：加载配置、初始化平台能力，并创建根智能体与用户端点。
   * @returns {Promise<void>}
   */
  async init() {
    void this.log.info("系统初始化开始");
    await this.runtime.init();
    this.log = this.runtime.loggerRoot.forModule("society");
    this._rootPrompt = await this.runtime.prompts.loadSystemPromptFile("root.txt");
    
    this._registerUserEndpointAgent();
    this._registerRootAgent();
    
    // 启动HTTP服务器（如果启用）
    if (this._enableHttp) {
      await this._startHttpServer();
    }
    
    // 设置优雅关闭处理
    this.runtime.setupGracefulShutdown({
      httpServer: this._httpServer,
      shutdownTimeoutMs: this._shutdownTimeoutMs ?? 30000
    });
    
    void this.runtime.startProcessing();
    void this.log.info("系统初始化完成");
  }

  /**
   * 提交自然语言需求描述给根智能体，由根智能体自组织创建组织并启动执行。
   * @param {string} text
   * @param {{workspacePath?: string}} [options] - 可选参数
   * @returns {Promise<{taskId:string, workspacePath?:string}|{error:string}>}
   */
  async submitRequirement(text, options = {}) {
    const taskId = randomUUID();
    void this.log.info("提交需求", { taskId, length: String(text ?? "").length, workspacePath: options.workspacePath ?? null });
    
    // 如果指定了工作空间，绑定到任务
    if (options.workspacePath) {
      const bindResult = await this.runtime.workspaceManager.bindWorkspace(
        taskId, 
        options.workspacePath
      );
      if (!bindResult.ok) {
        void this.log.error("工作空间绑定失败", { taskId, error: bindResult.error });
        return { error: bindResult.error };
      }
      void this.log.info("工作空间绑定成功", { taskId, workspacePath: options.workspacePath });
    }
    
    this.sendTextToAgent("root", String(text ?? ""), { taskId });
    void this.log.info("需求处理结束", { taskId });
    
    const result = { taskId };
    if (options.workspacePath) {
      result.workspacePath = options.workspacePath;
    }
    return result;
  }

  /**
   * 用户向指定智能体发送一条文本消息（不阻塞）。
   * 消息直接发送到目标智能体，不经过用户端点的队列。
   * @param {string} agentId
   * @param {string} text
   * @param {{taskId?:string}} [options]
   * @returns {{taskId:string, to:string}|{error:string}}
   */
  sendTextToAgent(agentId, text, options = {}) {
    const toAgentId = String(agentId ?? "").trim();
    if (!toAgentId) {
      return { error: "目标智能体ID不能为空" };
    }
    // 验证目标智能体ID不能是"user"
    if (toAgentId === "user") {
      void this.log.warn("用户尝试发送消息到user端点", { toAgentId });
      return { error: "不能向用户端点发送消息，请指定其他智能体ID" };
    }
    const taskId = options?.taskId ?? randomUUID();
    
    // 构建 payload：支持字符串或带附件的对象
    let payload;
    if (typeof text === 'object' && text !== null) {
      // 已经是对象格式（带 attachments），直接使用
      payload = text;
    } else {
      // 纯文本格式
      payload = { text: String(text ?? "") };
    }
    
    // 直接发送到目标智能体，from="user"
    this.runtime.bus.send({
      to: toAgentId,
      from: "user",
      taskId,
      payload
    });
    void this.log.info("用户消息已发送", { toAgentId, taskId, hasAttachments: !!(payload.attachments?.length) });
    return { taskId, to: toAgentId };
  }

  /**
   * 为用户注册一个消息回调（接收组织对用户的异步消息）。
   * @param {(message:any)=>void} handler
   * @returns {()=>void} unsubscribe
   */
  onUserMessage(handler) {
    this._userMessageListeners.add(handler);
    return () => this._userMessageListeners.delete(handler);
  }

  /**
   * 等待用户端点收到满足条件的消息。
   * @param {(message:any)=>boolean} predicate
   * @param {{timeoutMs?:number}} [options]
   * @returns {Promise<any|null>}
   */
  async waitForUserMessage(predicate, options = {}) {
    const timeoutMs = typeof options.timeoutMs === "number" ? options.timeoutMs : 0;
    const existingIndex = this._userInbox.findIndex((m) => predicate(m));
    if (existingIndex >= 0) return this._userInbox[existingIndex];

    return await new Promise((resolve) => {
      let done = false;
      const unsub = this.onUserMessage((m) => {
        if (done) return;
        if (!predicate(m)) return;
        done = true;
        unsub();
        resolve(m);
      });

      if (timeoutMs > 0) {
        setTimeout(() => {
          if (done) return;
          done = true;
          unsub();
          resolve(null);
        }, timeoutMs);
      }
    });
  }


  /**
   * 注册一个本地"用户端点智能体"，用于接收组织内智能体发给用户的异步消息。
   * 用户端点只处理 to="user" 的消息（来自组织内智能体），不再处理用户发送的消息转发。
   * @returns {void}
   */
  _registerUserEndpointAgent() {
    const userEndpoint = new Agent({
      id: "user",
      roleId: "user",
      roleName: "user",
      rolePrompt: "",
      behavior: async (ctx, message) => {
        // 用户端点只接收来自组织内智能体的消息（to="user"）
        // 不再处理 from="user" to="user" 的转发逻辑，因为用户消息现在直接发送到目标智能体
        
        const from = String(message?.from ?? "");
        const taskId = String(message?.taskId ?? "");
        const payload = message?.payload ?? null;
        
        // 记录到用户收件箱
        this._userInbox.push(message);
        
        const payloadText = payload && typeof payload === "object" && "text" in payload ? payload.text : null;
        const out = payloadText === null || payloadText === undefined ? JSON.stringify(payload, null, 2) : String(payloadText);

        // 增强日志：显示消息内容
        void this.log.info("用户端点收到消息", { 
          agentId: "user", 
          messageId: message?.id ?? null, 
          from, 
          taskId, 
          payload,
          payloadPreview: out.length > 200 ? out.substring(0, 200) + "..." : out
        });
        process.stdout.write(`[user] from=${from} taskId=${taskId}\n${out}\n`);

        // 通知所有注册的消息监听器
        for (const h of this._userMessageListeners) {
          try {
            h(message);
          } catch {}
        }
      }
    });
    this.runtime.registerAgentInstance(userEndpoint);
  }

  /**
   * 在系统初始化阶段创建根智能体（Root），并将其行为绑定到 LLM 工具调用循环。
   * @returns {void}
   */
  _registerRootAgent() {
    const rootPrompt = this._rootPrompt ?? "";

    const rootAgent = new Agent({
      id: "root",
      roleId: "root",
      roleName: "root",
      rolePrompt: rootPrompt,
      behavior: async (ctx, message) => await ctx.runtime._handleWithLlm(ctx, message)
    });
    this.runtime.registerAgentInstance(rootAgent);
  }

  /**
   * 启动HTTP服务器。
   * @returns {Promise<{ok:boolean, port?:number, error?:string}>}
   */
  async _startHttpServer() {
    try {
      this._httpServer = new HTTPServer({
        port: this._httpPort,
        logger: this.runtime.loggerRoot.forModule("http")
      });
      this._httpServer.setSociety(this);
      
      // 设置配置服务，用于配置管理 API
      if (this.runtime.configPath) {
        const configDir = path.dirname(this.runtime.configPath);
        const configService = new ConfigService(
          configDir,
          this.runtime.loggerRoot.forModule("config")
        );
        this._httpServer.setConfigService(configService);
        void this.log.info("HTTP服务器配置服务已设置", { configDir });
      } else {
        void this.log.warn("HTTP服务器配置服务未设置，配置目录未知");
      }
      
      // 设置运行时目录，用于消息持久化
      if (this.runtime.config?.runtimeDir) {
        this._httpServer.setRuntimeDir(this.runtime.config.runtimeDir);
        void this.log.info("HTTP服务器消息持久化目录已设置", { runtimeDir: this.runtime.config.runtimeDir });
      } else {
        void this.log.warn("HTTP服务器消息持久化目录未设置，消息将不会持久化");
      }
      
      // 设置工件目录，用于静态文件服务
      if (this.runtime.config?.artifactsDir) {
        this._httpServer.setArtifactsDir(this.runtime.config.artifactsDir);
        void this.log.info("HTTP服务器工件目录已设置", { artifactsDir: this.runtime.config.artifactsDir });
      } else {
        void this.log.warn("HTTP服务器工件目录未设置，/artifacts/* 路径将不可用");
      }
      
      const result = await this._httpServer.start();
      
      if (result.ok) {
        void this.log.info("HTTP服务器启动成功", { port: result.port });
      } else {
        void this.log.error("HTTP服务器启动失败，继续以控制台模式运行", { error: result.error });
        this._httpServer = null;
      }
      
      return result;
    } catch (err) {
      const message = err && typeof err.message === "string" ? err.message : String(err);
      void this.log.error("HTTP服务器启动异常，继续以控制台模式运行", { error: message });
      this._httpServer = null;
      return { ok: false, error: message };
    }
  }

  /**
   * 停止HTTP服务器。
   * @returns {Promise<{ok:boolean}>}
   */
  async stopHttpServer() {
    if (this._httpServer) {
      const result = await this._httpServer.stop();
      this._httpServer = null;
      return result;
    }
    return { ok: true };
  }

  /**
   * 获取HTTP服务器实例。
   * @returns {HTTPServer|null}
   */
  getHttpServer() {
    return this._httpServer;
  }

  /**
   * 检查HTTP服务器是否正在运行。
   * @returns {boolean}
   */
  isHttpServerRunning() {
    return this._httpServer?.isRunning() ?? false;
  }

  /**
   * 手动触发优雅关闭。
   * @returns {Promise<{ok:boolean, pendingMessages:number, activeAgents:number, shutdownDuration:number}>}
   */
  async shutdown() {
    void this.log.info("开始系统关闭");
    return await this.runtime.shutdown({ signal: "MANUAL" });
  }

  /**
   * 检查系统是否正在关闭中。
   * @returns {boolean}
   */
  isShuttingDown() {
    return this.runtime.isShuttingDown();
  }
}
