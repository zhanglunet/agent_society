import { readFile, writeFile, copyFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

/**
 * 配置服务：负责读取和保存应用配置文件。
 * 
 * 支持的配置文件：
 * - app.json / app.local.json - 应用主配置（包含默认 LLM 配置）
 * - llmservices.json / llmservices.local.json - LLM 服务列表配置
 * 
 * 优先级规则：
 * - 读取时优先使用 .local.json 文件
 * - 写入时总是写入 .local.json 文件
 */
export class ConfigService {
  /**
   * @param {string} configDir - 配置目录路径
   * @param {object} [logger] - 可选的日志记录器
   */
  constructor(configDir, logger = null) {
    this.configDir = configDir;
    this.log = logger || {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {}
    };
    
    // 配置文件路径
    this.appJsonPath = path.join(configDir, "app.json");
    this.appLocalJsonPath = path.join(configDir, "app.local.json");
    this.llmServicesJsonPath = path.join(configDir, "llmservices.json");
    this.llmServicesLocalJsonPath = path.join(configDir, "llmservices.local.json");
  }

  /**
   * 检查本地配置文件是否存在。
   * @returns {boolean} 是否存在 app.local.json
   */
  hasLocalConfig() {
    return existsSync(this.appLocalJsonPath);
  }

  /**
   * 检查本地 LLM 服务配置文件是否存在。
   * @returns {boolean} 是否存在 llmservices.local.json
   */
  hasLocalLlmServicesConfig() {
    return existsSync(this.llmServicesLocalJsonPath);
  }

  /**
   * 掩码 API Key，只显示最后 4 个字符。
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
   * 获取 LLM 配置。
   * 优先读取 app.local.json，如果不存在则读取 app.json。
   * @returns {Promise<{llm: object, source: string}>}
   */
  async getLlmConfig() {
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
   * 保存 LLM 配置。
   * 如果 app.local.json 不存在，先从 app.json 复制。
   * 只更新 llm 字段，保留其他配置。
   * @param {object} llmConfig - LLM 配置对象
   * @returns {Promise<void>}
   */
  async saveLlmConfig(llmConfig) {
    let config;

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
    config = JSON.parse(content);

    // 只更新 llm 字段
    config.llm = {
      baseURL: llmConfig.baseURL || "",
      model: llmConfig.model || "",
      apiKey: llmConfig.apiKey || "",
      maxConcurrentRequests: typeof llmConfig.maxConcurrentRequests === "number" 
        ? llmConfig.maxConcurrentRequests 
        : 2
    };

    // 保存配置
    await writeFile(this.appLocalJsonPath, JSON.stringify(config, null, 2), "utf8");
    void this.log.info("LLM 配置已保存", { path: this.appLocalJsonPath });
  }

  /**
   * 获取所有 LLM 服务配置。
   * 优先读取 llmservices.local.json，如果不存在则读取 llmservices.json。
   * @returns {Promise<{services: object[], source: string}>}
   */
  async getLlmServices() {
    let configPath;
    let source;

    if (existsSync(this.llmServicesLocalJsonPath)) {
      configPath = this.llmServicesLocalJsonPath;
      source = "local";
    } else if (existsSync(this.llmServicesJsonPath)) {
      configPath = this.llmServicesJsonPath;
      source = "default";
    } else {
      // 如果两个文件都不存在，返回空列表
      return { services: [], source: "none" };
    }

    const content = await readFile(configPath, "utf8");
    const config = JSON.parse(content);
    
    return {
      services: Array.isArray(config.services) ? config.services : [],
      source
    };
  }

  /**
   * 确保本地 LLM 服务配置文件存在。
   * 如果不存在，从默认配置复制或创建空配置。
   * @returns {Promise<void>}
   */
  async _ensureLocalLlmServicesConfig() {
    if (existsSync(this.llmServicesLocalJsonPath)) {
      return;
    }

    if (existsSync(this.llmServicesJsonPath)) {
      await copyFile(this.llmServicesJsonPath, this.llmServicesLocalJsonPath);
      void this.log.info("已从 llmservices.json 复制到 llmservices.local.json");
    } else {
      // 创建空配置
      await writeFile(this.llmServicesLocalJsonPath, JSON.stringify({ services: [] }, null, 2), "utf8");
      void this.log.info("已创建空的 llmservices.local.json");
    }
  }

  /**
   * 添加 LLM 服务。
   * @param {object} service - 服务配置
   * @returns {Promise<object>} 添加的服务（带掩码的 apiKey）
   * @throws {Error} 如果服务 ID 已存在
   */
  async addLlmService(service) {
    await this._ensureLocalLlmServicesConfig();

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
      capabilityTags: Array.isArray(service.capabilityTags) ? service.capabilityTags : [],
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
   * 更新 LLM 服务。
   * @param {string} serviceId - 服务 ID
   * @param {object} service - 服务配置
   * @returns {Promise<object>} 更新后的服务（带掩码的 apiKey）
   * @throws {Error} 如果服务不存在
   */
  async updateLlmService(serviceId, service) {
    await this._ensureLocalLlmServicesConfig();

    const content = await readFile(this.llmServicesLocalJsonPath, "utf8");
    const config = JSON.parse(content);
    const services = Array.isArray(config.services) ? config.services : [];

    // 查找服务索引
    const index = services.findIndex(s => s.id === serviceId);
    if (index === -1) {
      throw new Error(`服务 "${serviceId}" 不存在`);
    }

    // 更新服务
    const updatedService = {
      id: service.id || serviceId,
      name: service.name || "",
      baseURL: service.baseURL || "",
      model: service.model || "",
      apiKey: service.apiKey || "",
      maxConcurrentRequests: typeof service.maxConcurrentRequests === "number" 
        ? service.maxConcurrentRequests 
        : 2,
      capabilityTags: Array.isArray(service.capabilityTags) ? service.capabilityTags : [],
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
   * 删除 LLM 服务。
   * @param {string} serviceId - 服务 ID
   * @returns {Promise<void>}
   * @throws {Error} 如果服务不存在
   */
  async deleteLlmService(serviceId) {
    await this._ensureLocalLlmServicesConfig();

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
   * 验证 LLM 配置。
   * @param {object} config - LLM 配置对象
   * @returns {{valid: boolean, errors: object}} 验证结果
   */
  validateLlmConfig(config) {
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

  /**
   * 验证 LLM 服务配置。
   * @param {object} service - LLM 服务配置对象
   * @returns {{valid: boolean, errors: object}} 验证结果
   */
  validateLlmService(service) {
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
}
