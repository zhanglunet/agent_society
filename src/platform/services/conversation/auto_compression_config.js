/**
 * 自动压缩配置定义
 * 
 * 定义自动历史消息压缩功能的配置结构和默认值。
 * 配置项用于控制自动压缩的触发条件、保留策略和摘要生成参数。
 */

/**
 * 自动压缩配置的默认值
 * 
 * @type {AutoCompressionConfig}
 */
export const DEFAULT_AUTO_COMPRESSION_CONFIG = {
  // 是否启用自动压缩功能
  enabled: true,
  
  // 触发自动压缩的上下文使用率阈值（0-1之间）
  // 当上下文使用率达到此阈值时，触发自动压缩
  threshold: 0.8,
  
  // 压缩时保留的最近消息数量
  // 压缩后会保留系统提示词、摘要和最近的N条消息
  keepRecentCount: 10,
  
  // 摘要的最大token数量
  // 限制生成的摘要长度，避免摘要过长
  summaryMaxTokens: 1000,
  
  // 摘要生成使用的模型名称
  // 必须由用户在配置文件中指定，无默认值
  // 建议使用较快的模型如 gpt-4o-mini
  summaryModel: null,
  
  // 摘要生成的超时时间（毫秒）
  // 超过此时间未完成则视为失败，不执行压缩
  summaryTimeout: 30000
};

/**
 * 自动压缩配置类型定义（JSDoc）
 * 
 * @typedef {Object} AutoCompressionConfig
 * @property {boolean} enabled - 是否启用自动压缩
 * @property {number} threshold - 触发阈值（0-1）
 * @property {number} keepRecentCount - 保留最近消息数量
 * @property {number} summaryMaxTokens - 摘要最大token数
 * @property {string|null} summaryModel - 摘要生成模型（必需配置）
 * @property {number} summaryTimeout - 摘要生成超时时间（毫秒）
 */

/**
 * 验证自动压缩配置的有效性
 * 
 * @param {any} config - 待验证的配置对象
 * @returns {{valid: boolean, errors: string[]}} 验证结果
 */
export function validateAutoCompressionConfig(config) {
  const errors = [];
  
  if (!config || typeof config !== 'object') {
    errors.push('配置必须是一个对象');
    return { valid: false, errors };
  }
  
  // 验证 enabled
  if (typeof config.enabled !== 'boolean') {
    errors.push('enabled 必须是布尔值');
  }
  
  // 验证 threshold
  if (typeof config.threshold !== 'number' || config.threshold < 0 || config.threshold > 1) {
    errors.push('threshold 必须是 0-1 之间的数字');
  }
  
  // 验证 keepRecentCount
  if (typeof config.keepRecentCount !== 'number' || config.keepRecentCount < 1 || !Number.isInteger(config.keepRecentCount)) {
    errors.push('keepRecentCount 必须是大于0的整数');
  }
  
  // 验证 summaryMaxTokens
  if (typeof config.summaryMaxTokens !== 'number' || config.summaryMaxTokens < 100 || !Number.isInteger(config.summaryMaxTokens)) {
    errors.push('summaryMaxTokens 必须是大于等于100的整数');
  }
  
  // 验证 summaryModel（可以为null，但如果不为null则必须是字符串）
  if (config.summaryModel !== null && typeof config.summaryModel !== 'string') {
    errors.push('summaryModel 必须是字符串或null');
  }
  
  // 验证 summaryTimeout
  if (typeof config.summaryTimeout !== 'number' || config.summaryTimeout < 1000 || !Number.isInteger(config.summaryTimeout)) {
    errors.push('summaryTimeout 必须是大于等于1000的整数（毫秒）');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * 合并用户配置和默认配置
 * 
 * @param {Partial<AutoCompressionConfig>} userConfig - 用户提供的配置
 * @returns {AutoCompressionConfig} 合并后的完整配置
 */
export function mergeAutoCompressionConfig(userConfig = {}) {
  return {
    ...DEFAULT_AUTO_COMPRESSION_CONFIG,
    ...userConfig
  };
}

/**
 * 检查配置是否可用于自动压缩
 * 
 * 自动压缩需要配置有效且启用，同时必须指定摘要模型
 * 
 * @param {AutoCompressionConfig} config - 配置对象
 * @returns {{available: boolean, reason?: string}} 可用性检查结果
 */
export function isAutoCompressionAvailable(config) {
  const validation = validateAutoCompressionConfig(config);
  
  if (!validation.valid) {
    return {
      available: false,
      reason: `配置无效: ${validation.errors.join(', ')}`
    };
  }
  
  if (!config.enabled) {
    return {
      available: false,
      reason: '自动压缩功能已禁用'
    };
  }
  
  if (!config.summaryModel) {
    return {
      available: false,
      reason: '未配置摘要生成模型 (summaryModel)'
    };
  }
  
  return { available: true };
}