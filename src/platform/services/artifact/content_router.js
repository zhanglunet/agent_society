/**
 * 内容路由器
 * 
 * 根据内容类型和模型能力，将内容路由到合适的处理方式。
 * 
 * 功能：
 * 1. 工件内容路由：根据工件类型（图片、文件等）和模型能力路由
 * 2. 消息内容路由：根据消息附件类型和模型能力路由
 * 3. 能力检查：检查模型是否支持特定内容类型
 * 
 * Requirements: 5.2, 5.4, 5.5
 */

import { createNoopModuleLogger } from "../../utils/logger/logger.js";
import { formatMultimodalContent, isTextFile } from '../../utils/message/message_formatter.js';
import {
  ATTACHMENT_TYPE_TO_CAPABILITY,
  detectBinaryType,
  getFriendlyTypeName
} from '../../utils/content/content_type_utils.js';

/**
 * @typedef {Object} ContentRouteResult
 * @property {'text' | 'image' | 'binary'} contentType - 内容类型分类
 * @property {'text' | 'image_url' | 'file'} routing - 路由目标
 * @property {string} [content] - 文本内容或描述
 * @property {Object} [imageUrl] - image_url 格式数据
 * @property {Object} [file] - file 格式数据
 * @property {Object} metadata - 附加元数据
 */

/**
 * @typedef {Object} MessageRouteResult
 * @property {boolean} canProcess - 是否所有内容都可以处理
 * @property {string|Array} processedContent - 处理后的内容
 * @property {Array} unsupportedAttachments - 不支持的附件列表
 * @property {string|null} textDescription - 不支持内容的文本描述
 */

/**
 * 内容路由器类
 */
export class ContentRouter {
  /**
   * 构造函数
   * 
   * @param {Object} options - 配置选项
   * @param {Object} [options.serviceRegistry] - LLM 服务注册表
   * @param {Object} [options.binaryDetector] - 二进制检测器实例
   * @param {Object} [options.contentAdapter] - 内容适配器实例
   * @param {Object} [options.logger] - 日志记录器实例
   */
  constructor(options = {}) {
    this.serviceRegistry = options.serviceRegistry || null;
    this.binaryDetector = options.binaryDetector || null;
    this.contentAdapter = options.contentAdapter || null;
    this.logger = options.logger || createNoopModuleLogger();
  }

  /**
   * 检查服务是否具有特定能力
   * 
   * @param {string} serviceId - 服务 ID
   * @param {string} capability - 能力名称 ('vision', 'file', 'audio', 'video')
   * @returns {boolean} 如果支持该能力返回 true
   */
  hasCapability(serviceId, capability) {
    if (!this.serviceRegistry || !serviceId) {
      return false;
    }
    
    try {
      const capabilities = this.serviceRegistry.getCapabilities(serviceId);
      if (!capabilities || !capabilities.input) {
        return false;
      }
      
      return Array.isArray(capabilities.input) && capabilities.input.includes(capability);
    } catch (error) {
      void this.logger?.warn?.('检查能力时出错', {
        serviceId,
        capability,
        error: error?.message
      });
      return false;
    }
  }

  /**
   * 检测二进制内容的具体类型
   * 
   * @param {Object} artifact - 工件对象
   * @returns {BinaryTypeResult} 二进制类型和置信度
   */
  detectBinaryType(artifact) {
    return detectBinaryType(artifact);
  }

  /**
   * 路由工件内容
   * 根据工件类型和模型能力路由
   * 
   * @param {Object} artifact - 来自 ArtifactStore 的工件对象
   * @param {string} serviceId - 当前智能体的 LLM 服务 ID
   * @returns {Promise<ContentRouteResult>} 路由结果
   */
  async routeArtifactContent(artifact, serviceId) {
    // 处理 null/undefined 工件
    if (!artifact) {
      return {
        contentType: 'text',
        routing: 'text',
        content: '[错误：工件未找到]',
        metadata: {}
      };
    }
    
    // 处理文本内容
    if (!artifact.isBinary) {
      return {
        contentType: 'text',
        routing: 'text',
        content: artifact.content || '',
        metadata: {
          id: artifact.id,
          type: artifact.type,
          createdAt: artifact.createdAt
        }
      };
    }
    
    // 处理二进制内容
    const binaryTypeResult = detectBinaryType(artifact);
    const binaryType = binaryTypeResult.type;
    
    void this.logger?.debug?.('检测到二进制类型', {
      artifactId: artifact.id,
      binaryType,
      confidence: binaryTypeResult.confidence,
      mimeType: artifact.mimeType || artifact.meta?.mimeType
    });
    
    // 根据二进制类型和能力路由
    if (binaryType === 'image') {
      return await this._routeImageContent(artifact, serviceId, binaryType);
    } else {
      return await this._routeNonImageBinaryContent(artifact, serviceId, binaryType);
    }
  }

  /**
   * 路由消息内容
   * 根据消息附件和模型能力路由
   * 
   * @param {Object} message - 原始消息
   * @param {string} serviceId - 当前服务 ID
   * @param {Object} [options] - 额外选项
   * @param {function} [options.getImageBase64] - 获取图片 base64 数据的函数
   * @param {function} [options.getFileContent] - 获取文件内容的函数
   * @param {string} [options.formattedTextContent] - 预格式化的文本内容
   * @returns {Promise<MessageRouteResult>} 路由结果
   */
  async routeMessageContent(message, serviceId, options = {}) {
    const { getImageBase64, getFileContent, formattedTextContent } = options;
    
    // 获取消息内容和附件
    const payload = message?.payload;
    const textContent = formattedTextContent !== undefined ? formattedTextContent : this._extractTextContent(payload);
    const attachments = this._extractAttachments(payload);
    
    // 如果没有附件，直接返回文本内容
    if (!attachments || attachments.length === 0) {
      return {
        canProcess: true,
        processedContent: textContent,
        unsupportedAttachments: [],
        textDescription: null
      };
    }
    
    // 获取服务能力
    const capabilities = this.serviceRegistry?.getCapabilities?.(serviceId);
    const inputCapabilities = capabilities?.input || ['text'];
    
    // 分类附件：支持的和不支持的
    const supportedAttachments = [];
    const unsupportedAttachments = [];
    
    for (const attachment of attachments) {
      const requiredCapability = this._getRequiredCapability(attachment);
      const isSupported = inputCapabilities.includes(requiredCapability);
      
      if (isSupported) {
        supportedAttachments.push(attachment);
      } else {
        unsupportedAttachments.push(attachment);
      }
    }

    // 处理支持的附件
    let processedContent = textContent;
    
    // 处理图片附件（如果支持 vision）
    const supportedImages = supportedAttachments.filter(a => a.type === 'image');
    if (supportedImages.length > 0 && getImageBase64) {
      processedContent = await formatMultimodalContent(
        textContent,
        supportedImages,
        getImageBase64
      );
    }
    
    // 处理文件附件（如果支持 file）
    const supportedFiles = supportedAttachments.filter(a => a.type === 'file' || a.type === 'document');
    if (supportedFiles.length > 0 && getFileContent) {
      const fileContents = await this._processFileAttachments(supportedFiles, getFileContent);
      if (typeof processedContent === 'string') {
        processedContent = processedContent + fileContents;
      } else if (Array.isArray(processedContent)) {
        processedContent.push({
          type: 'text',
          text: fileContents
        });
      }
    }
    
    // 处理不支持的附件 - 转换为文本描述
    let textDescription = null;
    if (unsupportedAttachments.length > 0 && this.contentAdapter) {
      const adaptedContents = this.contentAdapter.adaptMultiple(unsupportedAttachments);
      textDescription = adaptedContents.map(ac => ac.text).join('\n\n');
      
      // 将文本描述添加到内容中
      if (typeof processedContent === 'string') {
        processedContent = processedContent + '\n\n' + textDescription;
      } else if (Array.isArray(processedContent)) {
        processedContent.push({
          type: 'text',
          text: '\n\n' + textDescription
        });
      }
    }
    
    return {
      canProcess: unsupportedAttachments.length === 0,
      processedContent,
      unsupportedAttachments,
      textDescription
    };
  }

  /**
   * 统一的路由方法
   * 根据第一个参数类型自动选择路由方式
   * 
   * @param {Object} artifactOrMessage - 工件对象或消息对象
   * @param {string} serviceId - 服务 ID
   * @param {Object} [options] - 额外选项（用于消息路由）
   * @returns {Promise<ContentRouteResult|MessageRouteResult>} 路由结果
   */
  async routeContent(artifactOrMessage, serviceId, options = {}) {
    // 检查是工件（有 isBinary 属性）还是消息（有 payload 属性）
    if (artifactOrMessage && typeof artifactOrMessage === 'object') {
      // 如果有 isBinary 属性，是工件
      if ('isBinary' in artifactOrMessage || 'content' in artifactOrMessage && !('payload' in artifactOrMessage)) {
        return await this.routeArtifactContent(artifactOrMessage, serviceId);
      }
      // 否则，作为消息处理
      return await this.routeMessageContent(artifactOrMessage, serviceId, options);
    }
    
    // 默认：作为工件处理
    return await this.routeArtifactContent(artifactOrMessage, serviceId);
  }

  /**
   * 检查消息需要哪些能力
   * 
   * @param {Object} message - 消息对象
   * @returns {string[]} 需要的能力类型列表
   */
  getRequiredCapabilities(message) {
    const payload = message?.payload;
    const attachments = this._extractAttachments(payload);
    
    if (!attachments || attachments.length === 0) {
      return ['text'];
    }
    
    const capabilities = new Set(['text']);
    
    for (const attachment of attachments) {
      const capability = this._getRequiredCapability(attachment);
      capabilities.add(capability);
    }
    
    return Array.from(capabilities);
  }

  /**
   * 检查服务是否支持消息中的所有内容
   * 
   * @param {Object} message - 消息对象
   * @param {string} serviceId - 服务 ID
   * @returns {Object} 检查结果
   */
  checkCapabilitySupport(message, serviceId) {
    const requiredCapabilities = this.getRequiredCapabilities(message);
    const capabilities = this.serviceRegistry?.getCapabilities?.(serviceId);
    const inputCapabilities = capabilities?.input || ['text'];
    
    const supported = [];
    const unsupported = [];
    
    for (const cap of requiredCapabilities) {
      if (inputCapabilities.includes(cap)) {
        supported.push(cap);
      } else {
        unsupported.push(cap);
      }
    }
    
    return {
      allSupported: unsupported.length === 0,
      supported,
      unsupported,
      requiredCapabilities
    };
  }

  /**
   * 格式化图片内容为 image_url 对象
   * 
   * @param {string} base64Content - Base64 编码的图片数据
   * @param {string} mimeType - 图片 MIME 类型
   * @returns {Object} image_url 格式对象
   */
  formatImageUrl(base64Content, mimeType) {
    const normalizedMime = mimeType && typeof mimeType === 'string' 
      ? mimeType.toLowerCase().trim() 
      : 'image/jpeg';
    
    return {
      type: 'image_url',
      image_url: {
        url: `data:${normalizedMime};base64,${base64Content}`
      }
    };
  }

  /**
   * 为不支持的二进制内容生成文本描述
   * 
   * @param {Object} artifact - 工件对象
   * @param {string} binaryType - 二进制类型
   * @returns {string} 文本描述
   */
  generateTextDescription(artifact, binaryType) {
    const filename = artifact.meta?.filename || artifact.id || 'unknown file';
    const artifactId = artifact.id || 'unknown';
    const mimeType = artifact.mimeType || artifact.meta?.mimeType || 'application/octet-stream';
    const friendlyType = getFriendlyTypeName(mimeType);
    
    // Determine required capability based on binary type
    let requiredCapability = 'file';
    let capabilityDescription = '文件读取';
    
    if (binaryType === 'image') {
      requiredCapability = 'vision';
      capabilityDescription = '视觉（图像理解）';
    }
    
    return `[需要专门处理] ${filename} (artifact:${artifactId})
类型: ${friendlyType}

操作指南: 创建具有 ${capabilityDescription} 能力的专门智能体来处理此工件。

步骤:
1. 使用 create_role 创建角色，指定支持 ${requiredCapability} 能力的大模型
2. 使用 spawn_agent_with_task 创建智能体并分配任务
3. 在任务中说明：
   - 需要读取工件 artifact:${artifactId}
   - 需要完成什么分析或处理
   - 完成后通过 send_message 报告结果
4. 任务描述要简洁明确，只说明目标和期望的输出

重要提示:
- 创建角色时只分配任务，不要要求他用工件读取。创建智能体的时候以任务的方式告诉他需要从工件里读取，并告知工件ID。以此保持该岗位的通用性，将来可以复用。
- 不要在任务中提及技术限制或能力约束
- 不要解释为什么需要创建新代理
- 让新代理专注于任务本身，而不是技术细节
- 不要把你能力的确实作为对新的岗位和智能体的技术约束
- 对新的岗位和智能体没有技术约束，不要说技术约束，不是编程任务
注意: 创建角色时必须指定支持 ${requiredCapability} 能力的。`;
  }

  // ==================== 私有方法 ====================

  /**
   * 路由图片内容
   * @private
   */
  async _routeImageContent(artifact, serviceId, binaryType) {
    const hasVision = this.hasCapability(serviceId, 'vision');
    
    if (hasVision) {
      const imageUrl = this.formatImageUrl(
        artifact.content,
        artifact.mimeType || artifact.meta?.mimeType || 'image/jpeg'
      );
      
      return {
        contentType: 'image',
        routing: 'image_url',
        imageUrl,
        metadata: {
          id: artifact.id,
          type: artifact.type,
          filename: artifact.meta?.filename,
          mimeType: artifact.mimeType || artifact.meta?.mimeType,
          binaryType,
          createdAt: artifact.createdAt
        }
      };
    } else {
      const description = this.generateTextDescription(artifact, binaryType);
      
      return {
        contentType: 'image',
        routing: 'text',
        content: description,
        metadata: {
          id: artifact.id,
          type: artifact.type,
          filename: artifact.meta?.filename,
          mimeType: artifact.mimeType || artifact.meta?.mimeType,
          binaryType,
          createdAt: artifact.createdAt
        }
      };
    }
  }

  /**
   * 路由非图片二进制内容
   * @private
   */
  async _routeNonImageBinaryContent(artifact, serviceId, binaryType) {
    const hasFile = this.hasCapability(serviceId, 'file');
    
    if (hasFile) {
      const mimeType = artifact.mimeType || artifact.meta?.mimeType || 'application/octet-stream';
      const base64Data = Buffer.isBuffer(artifact.content) 
        ? artifact.content.toString('base64')
        : Buffer.from(artifact.content).toString('base64');
      const dataUrl = `data:${mimeType};base64,${base64Data}`;
      
      return {
        contentType: 'binary',
        routing: 'file',
        file: {
          type: 'file_url',
          file_url: {
            url: dataUrl
          }
        },
        metadata: {
          id: artifact.id,
          type: artifact.type,
          filename: artifact.meta?.filename,
          mimeType: artifact.mimeType || artifact.meta?.mimeType,
          binaryType,
          createdAt: artifact.createdAt
        }
      };
    } else {
      const description = this.generateTextDescription(artifact, binaryType);
      
      return {
        contentType: 'binary',
        routing: 'text',
        content: description,
        metadata: {
          id: artifact.id,
          type: artifact.type,
          filename: artifact.meta?.filename,
          mimeType: artifact.mimeType || artifact.meta?.mimeType,
          binaryType,
          createdAt: artifact.createdAt
        }
      };
    }
  }

  /**
   * 从 payload 中提取文本内容
   * @private
   */
  _extractTextContent(payload) {
    if (payload === null || payload === undefined) {
      return '';
    }
    if (typeof payload === 'string') {
      return payload;
    }
    if (typeof payload === 'object') {
      return payload.text ?? payload.content ?? '';
    }
    return String(payload);
  }

  /**
   * 从 payload 中提取附件列表
   * @private
   */
  _extractAttachments(payload) {
    if (!payload || typeof payload !== 'object') {
      return [];
    }
    const attachments = payload.attachments;
    if (!Array.isArray(attachments)) {
      return [];
    }
    return attachments;
  }

  /**
   * 获取附件所需的能力类型
   * @private
   */
  _getRequiredCapability(attachment) {
    const type = attachment?.type;
    return ATTACHMENT_TYPE_TO_CAPABILITY[type] || 'file';
  }

  /**
   * 处理文件附件，读取内容
   * @private
   */
  async _processFileAttachments(attachments, getFileContent) {
    const contents = [];
    
    for (const att of attachments) {
      const filename = att.filename || 'unknown';
      
      if (!isTextFile(filename)) {
        contents.push(`\n\n【附件: ${filename} (${att.artifactRef})】\n[二进制文件，如果需要读取内容，需要建立专门读取该类型文件的智能体帮助解读]`);
        continue;
      }
      
      try {
        const fileData = await getFileContent(att.artifactRef);
        if (fileData && fileData.content) {
          const maxLength = 50000;
          let content = fileData.content;
          let truncated = false;
          
          if (content.length > maxLength) {
            content = content.slice(0, maxLength);
            truncated = true;
          }
          
          contents.push(`\n\n【附件: ${filename}】\n\`\`\`\n${content}${truncated ? '\n... [内容已截断]' : ''}\n\`\`\``);
        } else {
          contents.push(`\n\n【附件: ${filename}】\n[文件读取失败]`);
        }
      } catch (err) {
        contents.push(`\n\n【附件: ${filename}】\n[文件读取错误: ${err?.message || '未知错误'}]`);
      }
    }
    
    return contents.join('');
  }
}

export default ContentRouter;
