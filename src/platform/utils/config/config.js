import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * 配置管理器：管理所有配置文件的读取、写入、验证。
 * 
 * 职责：
 * - 读取和解析配置文件（app.json, llmservices.json, logging.json）
 * - 写入和更新配置文件
 * - 配置验证和安全处理（API Key 掩码）
 * 
 * 设计约束：
 * - 优先加载 .local.json 文件
 * - 写入操作总是针对 .local.json 文件
 * - 文件不存在时返回合理的默认值
 */
export class Config {
  /**
   * 构造函数
   * @param {string} configDir - 配置目录路径（相对或绝对）
   * @param {object} [logger] - 可选的日志记录器
   */
  constructor(configDir, logger = null) {
    // 确保 configDir 是绝对路径
    this.configDir = path.isAbsolute(configDir) 
      ? configDir 
      : path.resolve(process.cwd(), configDir);
    
    this.log = logger || {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };
    
    // 配置文件路径
    this.appJsonPath = path.join(this.configDir, "app.json");
    this.appLocalJsonPath = path.join(this.configDir, "app.local.json");
    this.llmServicesJsonPath = path.join(this.configDir, "llmservices.json");
    this.llmServicesLocalJsonPath = path.join(this.configDir, "llmservices.local.json");
  }

  // ========== 应用配置 ==========
  
  /**
   * 加载应用配置
   * @param {{dataDir?:string}} [options] - 可选配置
   * @returns {Promise<object>} 配置对象
   */
  async loadApp(options = {}) {
    // 确定配置文件路径（优先 local）
    let configPath;
    if (existsSync(this.appLocalJsonPath)) {
      configPath = this.appLocalJsonPath;
    } else if (existsSync(this.appJsonPath)) {
      configPath = this.appJsonPath;
    } else {
      throw new Error(`配置文件不存在: ${this.appJsonPath}`);
    }

    const raw = await readFile(configPath, "utf8");
    const cfg = JSON.parse(raw);

    // 加载日志配置
    const loggingConfigPath = cfg.loggingConfigPath
      ? path.resolve(process.cwd(), String(cfg.loggingConfigPath))
      : null;
    let logging = loggingConfigPath ? await this._loadOptionalJson(loggingConfigPath) : null;

    // 处理 dataDir
    const dataDir = options.dataDir
      ? (path.isAbsolute(options.dataDir) ? options.dataDir : path.resolve(process.cwd(), options.dataDir))
      : null;

    // 如果提供了 dataDir，尝试加载 dataDir 下的 logging.json（优先级高于全局配置）
    if (dataDir) {
      const dataDirLoggingPath = path.resolve(dataDir, "logging.json");
      const dataDirLogging = await this._loadOptionalJson(dataDirLoggingPath);
      if (dataDirLogging) {
        logging = dataDirLogging;
      }
    }

    // 如果提供了 dataDir，覆盖日志目录配置
    if (dataDir && logging) {
      logging.logsDir = path.resolve(dataDir, "logs");
    }

    // 加载 LLM 服务配置
    const llmServices = await this._loadLlmServicesConfigInternal();

    return {
      promptsDir: path.resolve(process.cwd(), cfg.promptsDir),
      workspacesDir: dataDir ? path.resolve(dataDir, "workspaces") : (cfg.workspacesDir ? path.resolve(process.cwd(), cfg.workspacesDir) : path.resolve(process.cwd(), "data/workspaces")),
      runtimeDir: dataDir ? path.resolve(dataDir, "state") : path.resolve(process.cwd(), cfg.runtimeDir),
      maxSteps: Number.isFinite(cfg.maxSteps) ? cfg.maxSteps : 200,
      maxToolRounds: Number.isFinite(cfg.maxToolRounds) ? cfg.maxToolRounds : 20000,
      httpPort: Number.isFinite(cfg.httpPort) ? cfg.httpPort : 3000,
      enableHttp: typeof cfg.enableHttp === "boolean" ? cfg.enableHttp : false,
      llm: cfg.llm
        ? {
            baseURL: String(cfg.llm.baseURL ?? ""),
            model: String(cfg.llm.model ?? ""),
            apiKey: String(cfg.llm.apiKey ?? ""),
            maxConcurrentRequests: this._validateMaxConcurrentRequests(cfg.llm.maxConcurrentRequests)
          }
        : null,
      logging,
      dataDir,
      modules: cfg.modules ?? {},
      contextLimit: cfg.contextLimit ?? null,
      llmServices
    };
  }

  // ========== LLM 配置 ==========
  
  /**
   * 获取 LLM 配置
   * @returns {Promise<{llm: object, source: string}>}
   */
  async getLlm() {
    let configPath;
    let source;

    if (existsSync(this.appLocalJsonPath)) {
      configPath = this.appLocalJsonPath;
      source = "local";
    } else if (existsSync(this.appJsonPath)) {
      configPath = this.appJsonPath;
      source = "default";
    } else {
      throw new Error("配置文件不存在");
    }

    const content = await readFile(configPath, "utf8");
    const config = JSON.parse(content);
    
    return {
      llm: config.llm || {},
      source
    };
  }

  /**
   * 保存 LLM 配置
   * @param {object} llmConfig - LLM 配置对象
   * @returns {Promise<void>}
   */
  async saveLlm(llmConfig) {
    // 如果 app.local.json 不存在，从 app.json 复制
    if (!existsSync(this.appLocalJsonPath)) {
      if (!existsSync(this.appJsonPath)) {
        throw new Error("app.json 不存在，无法创建本地配置");
      }
      await copyFile(this.appJsonPath, this.appLocalJsonPath);
      void this.log.info("已从 app.json 复制到 app.local.json");
    }

    // 读取现有配置
    const content = await readFile(this.appLocalJsonPath, "utf8");
    const config = JSON.parse(content);

    // 只更新 llm 字段（如果没有传递新的 apiKey，保留原来的值）
    const existingApiKey = config.llm?.apiKey || "";
    const existingMaxTokens = config.llm?.maxTokens;
    config.llm = {
      baseURL: llmConfig.baseURL || "",
      model: llmConfig.model || "",
      apiKey: llmConfig.apiKey || existingApiKey,
      maxConcurrentRequests: typeof llmConfig.maxConcurrentRequests === "number" 
        ? llmConfig.maxConcurrentRequests 
        : 2,
      maxTokens: typeof llmConfig.maxTokens === "number" 
        ? llmConfig.maxTokens 
        : existingMaxTokens,
      capabilities: llmConfig.capabilities || { input: ["text"], output: ["text"] }
    };

    // 保存配置
    await writeFile(this.appLocalJsonPath, JSON.stringify(config, null, 2), "utf8");
    void this.log.info("LLM 配置已保存", { path: this.appLocalJsonPath });
  }

  /**
   * 验证 LLM 配置
   * @param {object} config - LLM 配置对象
   * @returns {{valid: boolean, errors: object}} 验证结果
   */
  validateLlm(config) {
    const errors = {};

    if (!config.baseURL || typeof config.baseURL !== "string" || !config.baseURL.trim()) {
      errors.baseURL = "baseURL 不能为空";
    }

    if (!config.model || typeof config.model !== "string" || !config.model.trim()) {
      errors.model = "model 不能为空";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  // ========== LLM 服务配置 ==========
  
  /**
   * 获取 LLM 服务列表
   * 只读取 llmservices.local.json，不存在则返回空列表
   * llmservices_template.json 只是模板参考，不读取
   * @returns {Promise<{services: object[], source: string}>}
   */
  async getServices() {
    if (!existsSync(this.llmServicesLocalJsonPath)) {
      return { services: [], source: "none" };
    }

    const content = await readFile(this.llmServicesLocalJsonPath, "utf8");
    const config = JSON.parse(content);
    
    return {
      services: Array.isArray(config.services) ? config.services : [],
      source: "local"
    };
  }

  /**
   * 添加 LLM 服务
   * @param {object} service - 服务配置
   * @returns {Promise<object>} 添加的服务（带掩码的 apiKey）
   * @throws {Error} 如果服务 ID 已存在
   */
  async addService(service) {
    await this._ensureLocalServices();

    const content = await readFile(this.llmServicesLocalJsonPath, "utf8");
    const config = JSON.parse(content);
    const services = Array.isArray(config.services) ? config.services : [];

    // 检查 ID 是否已存在
    if (services.some(s => s.id === service.id)) {
      throw new Error(`服务 ID "${service.id}" 已存在`);
    }

    // 添加新服务
    const newService = {
      id: service.id,
      name: service.name || "",
      baseURL: service.baseURL || "",
      model: service.model || "",
      apiKey: service.apiKey || "",
      maxConcurrentRequests: typeof service.maxConcurrentRequests === "number" 
        ? service.maxConcurrentRequests 
        : 2,
      maxTokens: typeof service.maxTokens === "number" ? service.maxTokens : undefined,
      capabilityTags: Array.isArray(service.capabilityTags) ? service.capabilityTags : [],
      capabilities: service.capabilities || { input: ["text"], output: ["text"] },
      description: service.description || ""
    };

    services.push(newService);
    config.services = services;

    await writeFile(this.llmServicesLocalJsonPath, JSON.stringify(config, null, 2), "utf8");
    void this.log.info("LLM 服务已添加", { serviceId: service.id });

    // 返回带掩码的服务
    return {
      ...newService,
      apiKey: this.maskApiKey(newService.apiKey)
    };
  }

  /**
   * 更新 LLM 服务
   * @param {string} serviceId - 服务 ID
   * @param {object} service - 服务配置
   * @returns {Promise<object>} 更新后的服务（带掩码的 apiKey）
   * @throws {Error} 如果服务不存在
   */
  async updateService(serviceId, service) {
    await this._ensureLocalServices();

    const content = await readFile(this.llmServicesLocalJsonPath, "utf8");
    const config = JSON.parse(content);
    const services = Array.isArray(config.services) ? config.services : [];

    // 查找服务索引
    const index = services.findIndex(s => s.id === serviceId);
    if (index === -1) {
      throw new Error(`服务 "${serviceId}" 不存在`);
    }

    // 更新服务（如果没有传递新的 apiKey，保留原来的值）
    const existingService = services[index];
    const updatedService = {
      id: service.id || serviceId,
      name: service.name || "",
      baseURL: service.baseURL || "",
      model: service.model || "",
      apiKey: service.apiKey || existingService.apiKey || "",
      maxConcurrentRequests: typeof service.maxConcurrentRequests === "number" 
        ? service.maxConcurrentRequests 
        : 2,
      maxTokens: typeof service.maxTokens === "number" 
        ? service.maxTokens 
        : existingService.maxTokens,
      capabilityTags: Array.isArray(service.capabilityTags) ? service.capabilityTags : [],
      capabilities: service.capabilities || existingService.capabilities || { input: ["text"], output: ["text"] },
      description: service.description || ""
    };

    services[index] = updatedService;
    config.services = services;

    await writeFile(this.llmServicesLocalJsonPath, JSON.stringify(config, null, 2), "utf8");
    void this.log.info("LLM 服务已更新", { serviceId });

    // 返回带掩码的服务
    return {
      ...updatedService,
      apiKey: this.maskApiKey(updatedService.apiKey)
    };
  }

  /**
   * 删除 LLM 服务
   * @param {string} serviceId - 服务 ID
   * @returns {Promise<void>}
   * @throws {Error} 如果服务不存在
   */
  async deleteService(serviceId) {
    await this._ensureLocalServices();

    const content = await readFile(this.llmServicesLocalJsonPath, "utf8");
    const config = JSON.parse(content);
    const services = Array.isArray(config.services) ? config.services : [];

    // 查找服务索引
    const index = services.findIndex(s => s.id === serviceId);
    if (index === -1) {
      throw new Error(`服务 "${serviceId}" 不存在`);
    }

    // 删除服务
    services.splice(index, 1);
    config.services = services;

    await writeFile(this.llmServicesLocalJsonPath, JSON.stringify(config, null, 2), "utf8");
    void this.log.info("LLM 服务已删除", { serviceId });
  }

  /**
   * 验证 LLM 服务配置
   * @param {object} service - LLM 服务配置对象
   * @returns {{valid: boolean, errors: object}} 验证结果
   */
  validateService(service) {
    const errors = {};

    if (!service.id || typeof service.id !== "string" || !service.id.trim()) {
      errors.id = "id 不能为空";
    }

    if (!service.name || typeof service.name !== "string" || !service.name.trim()) {
      errors.name = "name 不能为空";
    }

    if (!service.baseURL || typeof service.baseURL !== "string" || !service.baseURL.trim()) {
      errors.baseURL = "baseURL 不能为空";
    }

    if (!service.model || typeof service.model !== "string" || !service.model.trim()) {
      errors.model = "model 不能为空";
    }

    return {
      valid: Object.keys(errors).length === 0,
      errors
    };
  }

  // ========== 工具方法 ==========
  
  /**
   * 掩码 API Key，只显示最后 4 个字符
   * @param {string} apiKey - 原始 API Key
   * @returns {string} 掩码后的 API Key
   */
  maskApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== "string") {
      return "****";
    }
    // 去除首尾空白后检查长度
    const trimmed = apiKey.trim();
    if (trimmed.length <= 4) {
      return "****";
    }
    return "****" + apiKey.slice(-4);
  }

  /**
   * 检查本地应用配置文件是否存在
   * @returns {boolean} 是否存在 app.local.json
   */
  hasLocalApp() {
    return existsSync(this.appLocalJsonPath);
  }

  /**
   * 检查本地 LLM 服务配置文件是否存在
   * @returns {boolean} 是否存在 llmservices.local.json
   */
  hasLocalServices() {
    return existsSync(this.llmServicesLocalJsonPath);
  }

  // ========== 私有方法 ==========
  
  /**
   * 尝试加载 JSON 文件；不存在则返回 null
   * @private
   * @param {string} absPath - 文件绝对路径
   * @returns {Promise<any|null>}
   */
  async _loadOptionalJson(absPath) {
    try {
      const raw = await readFile(absPath, "utf8");
      return JSON.parse(raw);
    } catch (err) {
      if (err && typeof err === "object" && err.code === "ENOENT") return null;
      throw err;
    }
  }

  /**
   * 验证并返回有效的最大并发请求数
   * @private
   * @param {any} value - 配置值
   * @returns {number} 有效的最大并发请求数
   */
  _validateMaxConcurrentRequests(value) {
    const defaultValue = 3;
    
    // 如果未配置，使用默认值
    if (value === undefined || value === null) {
      return defaultValue;
    }
    
    // 必须是数字类型且为正整数
    if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
      console.warn(`Invalid maxConcurrentRequests value: ${value}. Using default value: ${defaultValue}`);
      return defaultValue;
    }
    
    return value;
  }

  /**
   * 加载 LLM 服务配置（内部使用）
   * @private
   * @returns {Promise<{services: any[], configPath: string|null, configSource: string|null}>}
   */
  async _loadLlmServicesConfigInternal() {
    let configPath = null;
    let configSource = null;
    
    // 只读取 llmservices.local.json，llmservices_template.json 只是模板参考
    if (!existsSync(this.llmServicesLocalJsonPath)) {
      return { services: [], configPath: null, configSource: null };
    }
    
    configPath = this.llmServicesLocalJsonPath;
    configSource = "local";
    
    try {
      const raw = await readFile(configPath, "utf8");
      const data = JSON.parse(raw);
      const services = Array.isArray(data?.services) ? data.services : [];
      return { services, configPath, configSource };
    } catch {
      // 解析失败时返回空配置
      return { services: [], configPath, configSource };
    }
  }

  /**
   * 确保本地 LLM 服务配置文件存在
   * @private
   * @returns {Promise<void>}
   */
  async _ensureLocalServices() {
    if (existsSync(this.llmServicesLocalJsonPath)) {
      return;
    }

    // 创建空配置（llmservices_template.json 只是模板参考，不自动复制）
    await writeFile(this.llmServicesLocalJsonPath, JSON.stringify({ services: [] }, null, 2), "utf8");
    void this.log.info("已创建空的 llmservices.local.json");
  }
}
