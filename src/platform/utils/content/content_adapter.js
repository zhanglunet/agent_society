/**
 * 内容适配器
 * 
 * 负责将不支持的内容类型转换为文本描述，让智能体可以理解并决定是否转发。
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.4
 */

import { createNoopModuleLogger } from "../logger/logger.js";

/**
 * 内容类型到能力类型的映射
 */
const CONTENT_TYPE_TO_CAPABILITY = {
  image: "vision",
  audio: "audio",
  file: "file"
};

/**
 * 内容类型的中文标签
 */
const CONTENT_TYPE_LABELS = {
  image: "图片",
  audio: "音频",
  file: "文件"
};

/**
 * 格式化文件大小为人类可读格式
 * @param {number} bytes - 字节数
 * @returns {string}
 */
function formatFileSize(bytes) {
  if (bytes === undefined || bytes === null || isNaN(bytes)) {
    return "未知";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}

/**
 * 内容适配器：将不支持的内容转换为文本描述
 */
export class ContentAdapter {
  /**
   * @param {{
   *   serviceRegistry?: object,
   *   agentRegistry?: object,
   *   logger?: object
   * }} options
   */
  constructor(options = {}) {
    this.serviceRegistry = options.serviceRegistry ?? null;
    this.agentRegistry = options.agentRegistry ?? null;
    this.log = options.logger ?? createNoopModuleLogger();
  }

  /**
   * 将不支持的内容转换为文本描述
   * @param {{type: 'image' | 'audio' | 'file', path: string, filename?: string, size?: number, mimeType?: string}} attachment - 附件信息
   * @returns {{text: string, structuredInfo: object}}
   */
  adaptToText(attachment) {
    const contentType = attachment.type || "file";
    const typeLabel = CONTENT_TYPE_LABELS[contentType] || "文件";
    const capabilityType = CONTENT_TYPE_TO_CAPABILITY[contentType] || "file";
    
    // 查找具备相应能力的智能体
    const suggestedAgents = this.findCapableAgents(capabilityType);
    
    // 构建结构化信息
    const structuredInfo = {
      contentType,
      path: attachment.path,
      filename: attachment.filename || null,
      size: attachment.size !== undefined ? attachment.size : null,
      mimeType: attachment.mimeType || null,
      suggestedAgents: suggestedAgents.length > 0 ? suggestedAgents : null
    };
    
    // 构建文本描述
    const lines = [
      "【收到附件】",
      `类型: ${typeLabel}`,
    ];
    
    if (attachment.filename) {
      lines.push(`文件名: ${attachment.filename}`);
    }
    
    lines.push(`路径: ${attachment.path}`);
    
    if (attachment.size !== undefined && attachment.size !== null) {
      lines.push(`文件大小: ${formatFileSize(attachment.size)}`);
    }
    
    if (attachment.mimeType) {
      lines.push(`MIME类型: ${attachment.mimeType}`);
    }
    
    lines.push("");
    lines.push(`如需处理此${typeLabel}，可以使用 send_message 工具将其转发给具备${this._getCapabilityLabel(capabilityType)}能力的智能体。`);
    
    if (suggestedAgents.length > 0) {
      lines.push(`建议转发给: ${suggestedAgents.join(", ")}`);
    }
    
    const text = lines.join("\n");
    
    void this.log.debug("内容适配完成", {
      contentType,
      path: attachment.path,
      suggestedAgentsCount: suggestedAgents.length
    });
    
    return { text, structuredInfo };
  }

  /**
   * 批量转换多个附件
   * @param {Array<{type: string, path: string, filename?: string, size?: number, mimeType?: string}>} attachments - 附件列表
   * @returns {Array<{text: string, structuredInfo: object}>}
   */
  adaptMultiple(attachments) {
    if (!Array.isArray(attachments)) {
      return [];
    }
    return attachments.map(att => this.adaptToText(att));
  }

  /**
   * 查询具备指定能力的智能体
   * @param {string} capabilityType - 能力类型
   * @returns {string[]} - 智能体ID列表
   */
  findCapableAgents(capabilityType) {
    // 如果没有 agentRegistry，返回空列表
    if (!this.agentRegistry) {
      return [];
    }
    
    // 如果 agentRegistry 有 getAgentsByCapability 方法，使用它
    if (typeof this.agentRegistry.getAgentsByCapability === "function") {
      return this.agentRegistry.getAgentsByCapability(capabilityType);
    }
    
    // 如果 agentRegistry 有 getAgents 方法，遍历查找
    if (typeof this.agentRegistry.getAgents === "function") {
      const agents = this.agentRegistry.getAgents();
      const result = [];
      
      for (const agent of agents) {
        // 检查智能体是否有对应能力
        if (this._agentHasCapability(agent, capabilityType)) {
          result.push(agent.id);
        }
      }
      
      return result;
    }
    
    return [];
  }

  /**
   * 检查智能体是否具备指定能力
   * @param {object} agent - 智能体对象
   * @param {string} capabilityType - 能力类型
   * @returns {boolean}
   * @private
   */
  _agentHasCapability(agent, capabilityType) {
    // 如果智能体有 serviceId，通过 serviceRegistry 检查
    if (agent.serviceId && this.serviceRegistry) {
      return this.serviceRegistry.hasCapability(agent.serviceId, capabilityType, "input");
    }
    
    // 如果智能体直接有 capabilities 属性
    if (agent.capabilities && Array.isArray(agent.capabilities.input)) {
      return agent.capabilities.input.includes(capabilityType);
    }
    
    return false;
  }

  /**
   * 获取能力类型的中文标签
   * @param {string} capabilityType - 能力类型
   * @returns {string}
   * @private
   */
  _getCapabilityLabel(capabilityType) {
    const labels = {
      vision: "视觉理解",
      audio: "音频理解",
      file: "文件阅读",
      text: "文本对话"
    };
    return labels[capabilityType] || capabilityType;
  }
}

// 导出辅助函数供测试使用
export { formatFileSize, CONTENT_TYPE_TO_CAPABILITY, CONTENT_TYPE_LABELS };
