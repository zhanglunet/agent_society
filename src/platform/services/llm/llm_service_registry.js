import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { createNoopModuleLogger } from "../../utils/logger/logger.js";

/**
 * 默认的模型能力配置（仅文本）
 */
const DEFAULT_CAPABILITIES = {
  input: ["text"],
  output: ["text"]
};

/**
 * 验证 capabilities 配置是否有效
 * @param {any} capabilities - capabilities 配置对象
 * @returns {{valid: boolean, errors: string[], normalized: {input: string[], output: string[]}}}
 */
function validateCapabilities(capabilities) {
  const errors = [];
  
  // 如果没有 capabilities，使用默认值
  if (capabilities === undefined || capabilities === null) {
    return { valid: true, errors: [], normalized: { ...DEFAULT_CAPABILITIES } };
  }
  
  // capabilities 必须是对象
  if (typeof capabilities !== "object" || Array.isArray(capabilities)) {
    errors.push("capabilities必须是对象");
    return { valid: false, errors, normalized: { ...DEFAULT_CAPABILITIES } };
  }
  
  const normalized = {
    input: [],
    output: []
  };
  
  // 验证 input 数组
  if (capabilities.input !== undefined) {
    if (!Array.isArray(capabilities.input)) {
      errors.push("capabilities.input必须是数组");
    } else {
      for (let i = 0; i < capabilities.input.length; i++) {
        const item = capabilities.input[i];
        if (typeof item !== "string" || item.length === 0) {
          errors.push(`capabilities.input[${i}]必须是非空字符串`);
        } else {
          normalized.input.push(item);
        }
      }
    }
  } else {
    // 如果没有指定 input，默认为 text
    normalized.input = ["text"];
  }
  
  // 验证 output 数组
  if (capabilities.output !== undefined) {
    if (!Array.isArray(capabilities.output)) {
      errors.push("capabilities.output必须是数组");
    } else {
      for (let i = 0; i < capabilities.output.length; i++) {
        const item = capabilities.output[i];
        if (typeof item !== "string" || item.length === 0) {
          errors.push(`capabilities.output[${i}]必须是非空字符串`);
        } else {
          normalized.output.push(item);
        }
      }
    }
  } else {
    // 如果没有指定 output，默认为 text
    normalized.output = ["text"];
  }
  
  return { valid: errors.length === 0, errors, normalized };
}

/**
 * 验证服务配置条目是否有效
 * @param {any} service - 服务配置对象
 * @returns {{valid: boolean, errors: string[], capabilitiesWarnings?: string[]}}
 */
function validateServiceConfig(service) {
  const errors = [];
  const capabilitiesWarnings = [];
  
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
  
  // 验证 capabilities（可选字段，有错误时记录警告但不阻止加载）
  const capValidation = validateCapabilities(service.capabilities);
  if (!capValidation.valid) {
    capabilitiesWarnings.push(...capValidation.errors);
  }
  
  return { valid: errors.length === 0, errors, capabilitiesWarnings };
}

/**
 * @typedef {Object} ModelCapabilities
 * @property {string[]} input - 支持的输入能力类型
 * @property {string[]} output - 支持的输出能力类型
 */

/**
 * @typedef {Object} LlmServiceConfig
 * @property {string} id - 服务唯一标识
 * @property {string} name - 服务名称
 * @property {string} baseURL - API 基础 URL
 * @property {string} model - 模型名称
 * @property {string} apiKey - API 密钥
 * @property {string[]} capabilityTags - 能力标签
 * @property {ModelCapabilities} capabilities - 模型能力配置
 * @property {string} description - 服务描述
 */

/**
 * LLM 服务注册表：加载和管理多个大模型服务配置
 */
export class LlmServiceRegistry {
  /**
   * @param {{configDir?: string, logger?: object, configService?: object}} options
   */
  constructor(options = {}) {
    this.configDir = options.configDir ?? "config";
    this.log = options.logger ?? createNoopModuleLogger();
    this._configService = options.configService;
    this._loaded = false;
  }

  /**
   * 加载服务配置 (保持兼容性，但现在主要依赖 configService)
   * @returns {Promise<{loaded: boolean, services: LlmServiceConfig[], errors: string[]}>}
   */
  async load() {
    this._loaded = true;
    const services = await this.getServices();
    return {
      loaded: true,
      services,
      errors: []
    };
  }

  /**
   * 获取所有可用服务
   * @returns {Promise<LlmServiceConfig[]>}
   */
  async getServices() {
    let servicesArray = [];

    if (this._configService) {
      try {
        const result = await this._configService.getServices();
        servicesArray = Array.isArray(result) ? result : (result.services || []);
      } catch (err) {
        void this.log.error("从 ConfigService 获取服务失败", { error: err.message });
      }
    }

    if (servicesArray.length === 0) {
      const localPath = path.resolve(process.cwd(), this.configDir, "llmservices.local.json");
      const defaultPath = path.resolve(process.cwd(), this.configDir, "llmservices.json");
      let configPath = existsSync(localPath) ? localPath : (existsSync(defaultPath) ? defaultPath : null);

      if (configPath) {
        try {
          const raw = await readFile(configPath, "utf8");
          const data = JSON.parse(raw);
          servicesArray = Array.isArray(data.services) ? data.services : [];
        } catch (err) {
          void this.log.error("读取 LLM 服务配置文件失败", { configPath, error: err.message });
        }
      }
    }

    const validServices = [];
    for (const service of servicesArray) {
      const validation = validateServiceConfig(service);
      if (validation.valid) {
        const capValidation = validateCapabilities(service.capabilities);
        validServices.push({
          ...service,
          capabilities: capValidation.normalized
        });
      }
    }
    return validServices;
  }

  /**
   * 根据 ID 获取服务
   * @param {string} serviceId
   * @returns {Promise<LlmServiceConfig | null>}
   */
  async getServiceById(serviceId) {
    const services = await this.getServices();
    return services.find(s => s.id === serviceId) ?? null;
  }

  /**
   * 检查是否有可用服务
   * @returns {Promise<boolean>}
   */
  async hasServices() {
    const services = await this.getServices();
    return services.length > 0;
  }

  /**
   * 获取服务数量
   * @returns {Promise<number>}
   */
  async getServiceCount() {
    const services = await this.getServices();
    return services.length;
  }

  /**
   * 根据能力标签查询服务
   * @param {string} tag - 能力标签
   * @returns {Promise<LlmServiceConfig[]>}
   */
  async getServicesByCapabilityTag(tag) {
    const services = await this.getServices();
    return services.filter(s => s.capabilityTags.includes(tag));
  }

  /**
   * 检查是否已加载
   * @returns {boolean}
   */
  isLoaded() {
    return this._loaded;
  }

  /**
   * 检查服务是否支持指定能力
   * @param {string} serviceId - 服务ID
   * @param {string} capabilityType - 能力类型
   * @param {'input' | 'output' | 'both'} [direction='input'] - 方向
   * @returns {Promise<boolean>}
   */
  async hasCapability(serviceId, capabilityType, direction = 'input') {
    const service = await this.getServiceById(serviceId);
    if (!service || !service.capabilities) {
      return false;
    }
    
    const caps = service.capabilities;
    
    if (direction === 'both') {
      const hasInput = Array.isArray(caps.input) && caps.input.includes(capabilityType);
      const hasOutput = Array.isArray(caps.output) && caps.output.includes(capabilityType);
      return hasInput && hasOutput;
    } else if (direction === 'output') {
      return Array.isArray(caps.output) && caps.output.includes(capabilityType);
    } else {
      // 默认检查 input
      return Array.isArray(caps.input) && caps.input.includes(capabilityType);
    }
  }

  /**
   * 获取服务的所有能力
   * @param {string} serviceId - 服务ID
   * @returns {Promise<ModelCapabilities | null>}
   */
  async getCapabilities(serviceId) {
    const service = await this.getServiceById(serviceId);
    if (!service) {
      return null;
    }
    return service.capabilities ?? null;
  }

  /**
   * 根据能力类型查询支持的服务
   * @param {string} capabilityType - 能力类型
   * @param {'input' | 'output' | 'both'} [direction='input'] - 方向
   * @returns {Promise<LlmServiceConfig[]>}
   */
  async getServicesByCapability(capabilityType, direction = 'input') {
    const services = await this.getServices();
    const result = [];
    for (const service of services) {
      const hasCap = await this.hasCapability(service.id, capabilityType, direction);
      if (hasCap) {
        result.push(service);
      }
    }
    return result;
  }
}

// 导出验证函数供测试使用
export { validateCapabilities, DEFAULT_CAPABILITIES };
