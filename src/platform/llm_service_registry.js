import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createNoopModuleLogger } from "./logger.js";

/**
 * 验证服务配置条目是否有效
 * @param {any} service - 服务配置对象
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateServiceConfig(service) {
  const errors = [];
  
  if (!service || typeof service !== "object") {
    errors.push("服务配置必须是对象");
    return { valid: false, errors };
  }
  
  // 必填字段验证
  if (typeof service.id !== "string" || service.id.length === 0) {
    errors.push("服务ID必须是非空字符串");
  }
  if (typeof service.name !== "string" || service.name.length === 0) {
    errors.push("服务名称必须是非空字符串");
  }
  if (typeof service.baseURL !== "string" || service.baseURL.length === 0) {
    errors.push("服务baseURL必须是非空字符串");
  }
  if (typeof service.model !== "string" || service.model.length === 0) {
    errors.push("服务model必须是非空字符串");
  }
  if (typeof service.apiKey !== "string") {
    errors.push("服务apiKey必须是字符串");
  }
  if (!Array.isArray(service.capabilityTags)) {
    errors.push("服务capabilityTags必须是数组");
  }
  if (typeof service.description !== "string") {
    errors.push("服务description必须是字符串");
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * @typedef {Object} LlmServiceConfig
 * @property {string} id - 服务唯一标识
 * @property {string} name - 服务名称
 * @property {string} baseURL - API 基础 URL
 * @property {string} model - 模型名称
 * @property {string} apiKey - API 密钥
 * @property {string[]} capabilityTags - 能力标签
 * @property {string} description - 服务描述
 * @property {number} [maxConcurrentRequests] - 最大并发请求数
 */

/**
 * LLM 服务注册表：加载和管理多个大模型服务配置
 */
export class LlmServiceRegistry {
  /**
   * @param {{configDir?: string, logger?: object}} options
   */
  constructor(options = {}) {
    this.configDir = options.configDir ?? "config";
    this.log = options.logger ?? createNoopModuleLogger();
    /** @type {Map<string, LlmServiceConfig>} */
    this._services = new Map();
    this._loaded = false;
  }

  /**
   * 加载服务配置（优先 local 文件）
   * @returns {Promise<{loaded: boolean, services: LlmServiceConfig[], errors: string[]}>}
   */
  async load() {
    const errors = [];
    const localPath = path.resolve(process.cwd(), this.configDir, "llmservices.local.json");
    const defaultPath = path.resolve(process.cwd(), this.configDir, "llmservices.json");
    
    let configPath = null;
    let configSource = null;
    
    // 优先加载 local 配置文件
    if (existsSync(localPath)) {
      configPath = localPath;
      configSource = "local";
    } else if (existsSync(defaultPath)) {
      configPath = defaultPath;
      configSource = "default";
    }
    
    // 如果两个文件都不存在，使用空服务列表
    if (!configPath) {
      void this.log.info("LLM服务配置文件不存在，使用空服务列表", {
        localPath,
        defaultPath
      });
      this._services.clear();
      this._loaded = true;
      return { loaded: true, services: [], errors: [] };
    }
    
    try {
      const raw = await readFile(configPath, "utf8");
      let data;
      
      try {
        data = JSON.parse(raw);
      } catch (parseErr) {
        void this.log.error("LLM服务配置JSON解析失败", {
          configPath,
          error: parseErr.message
        });
        this._services.clear();
        this._loaded = true;
        return { loaded: false, services: [], errors: ["JSON解析失败: " + parseErr.message] };
      }
      
      // 验证配置结构
      if (!data || typeof data !== "object") {
        errors.push("配置文件根对象无效");
        this._services.clear();
        this._loaded = true;
        return { loaded: false, services: [], errors };
      }
      
      const servicesArray = Array.isArray(data.services) ? data.services : [];
      
      // 验证并加载每个服务配置
      this._services.clear();
      for (let i = 0; i < servicesArray.length; i++) {
        const service = servicesArray[i];
        const validation = validateServiceConfig(service);
        
        if (validation.valid) {
          // 标准化服务配置
          const normalizedService = {
            id: service.id,
            name: service.name,
            baseURL: service.baseURL,
            model: service.model,
            apiKey: service.apiKey,
            capabilityTags: service.capabilityTags,
            description: service.description,
            maxConcurrentRequests: service.maxConcurrentRequests
          };
          this._services.set(service.id, normalizedService);
        } else {
          void this.log.warn("跳过无效的服务配置条目", {
            index: i,
            serviceId: service?.id ?? "unknown",
            errors: validation.errors
          });
          errors.push(`services[${i}]: ${validation.errors.join(", ")}`);
        }
      }
      
      this._loaded = true;
      void this.log.info("LLM服务配置加载完成", {
        configPath,
        configSource,
        totalServices: servicesArray.length,
        validServices: this._services.size,
        skippedServices: servicesArray.length - this._services.size
      });
      
      return {
        loaded: true,
        services: Array.from(this._services.values()),
        errors
      };
      
    } catch (err) {
      void this.log.error("LLM服务配置加载失败", {
        configPath,
        error: err.message
      });
      this._services.clear();
      this._loaded = true;
      return { loaded: false, services: [], errors: [err.message] };
    }
  }

  /**
   * 获取所有可用服务
   * @returns {LlmServiceConfig[]}
   */
  getServices() {
    return Array.from(this._services.values());
  }

  /**
   * 根据 ID 获取服务
   * @param {string} serviceId
   * @returns {LlmServiceConfig | null}
   */
  getServiceById(serviceId) {
    return this._services.get(serviceId) ?? null;
  }

  /**
   * 检查是否有可用服务
   * @returns {boolean}
   */
  hasServices() {
    return this._services.size > 0;
  }

  /**
   * 获取服务数量
   * @returns {number}
   */
  getServiceCount() {
    return this._services.size;
  }

  /**
   * 根据能力标签查询服务
   * @param {string} tag - 能力标签
   * @returns {LlmServiceConfig[]}
   */
  getServicesByCapabilityTag(tag) {
    const result = [];
    for (const service of this._services.values()) {
      if (service.capabilityTags.includes(tag)) {
        result.push(service);
      }
    }
    return result;
  }

  /**
   * 检查是否已加载
   * @returns {boolean}
   */
  isLoaded() {
    return this._loaded;
  }
}
