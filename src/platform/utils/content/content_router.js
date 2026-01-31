/**
 * 内容路由器
 * 
 * 根据内容类型和模型能力，将内容路由到合适的处理方式。
 * 
 * 功能：
 * 1. 文件内容路由：根据文件类型（图片、文件等）和模型能力路由
 * 2. 消息内容路由：根据消息附件类型和模型能力路由
 * 3. 能力检查：检查模型是否支持特定内容类型
 * 
 * Requirements: 5.2, 5.4, 5.5
 */

import { createNoopModuleLogger } from "../logger/logger.js";
import { formatMultimodalContent, isTextFile } from '../message/message_formatter.js';
import {
  ATTACHMENT_TYPE_TO_CAPABILITY,
  detectBinaryType,
  getFriendlyTypeName
} from './content_type_utils.js';

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
   * @param {Object} [options.workspaceManager] - 工作区管理器实例
   * @param {Object} [options.contentAdapter] - 内容适配器实例
   * @param {Object} [options.logger] - 日志记录器实例
   */
  constructor(options = {}) {
    this.serviceRegistry = options.serviceRegistry || null;
    this.workspaceManager = options.workspaceManager || null;
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
   * 路由文件内容
   * 根据文件类型和模型能力路由
   * 
   * @param {string} path - 文件路径
   * @param {string} serviceId - 当前智能体的 LLM 服务 ID
   * @param {string} [workspaceId] - 工作区 ID (可选)
   * @returns {Promise<ContentRouteResult>} 路由结果
   */
  async routeFileContent(path, serviceId, workspaceId = null) {
    if (!this.workspaceManager) {
      throw new Error('ContentRouter: WorkspaceManager is required for routeFileContent');
    }

    try {
      // 如果没有提供 workspaceId，尝试通过 path 推断 (兼容旧逻辑或特定场景)
      // 但现在我们优先要求明确的 workspaceId
      const fileInfo = await this.workspaceManager.getFileInfo(workspaceId, path);
      if (!fileInfo) {
        return {
          contentType: 'text',
          routing: 'text',
          content: `[错误：文件未找到: ${path}]`,
          metadata: { path }
        };
      }

      // 处理文本内容
      if (!fileInfo.isBinary) {
        const readResult = await this.workspaceManager.readFile(workspaceId, path, { length: 5000 });
        return {
          contentType: 'text',
          routing: 'text',
          content: readResult.content || '',
          metadata: {
            path: fileInfo.path,
            filename: fileInfo.filename,
            mimeType: fileInfo.mimeType,
            size: fileInfo.size,
            mtime: fileInfo.mtime
          }
        };
      }

      // 处理二进制内容
      const binaryTypeResult = detectBinaryType(fileInfo);
      const binaryType = binaryTypeResult.type;
      
      void this.logger?.debug?.('检测到二进制类型', {
        path: fileInfo.path,
        binaryType,
        confidence: binaryTypeResult.confidence,
        mimeType: fileInfo.mimeType
      });
      
      // 根据二进制类型和能力路由
      if (binaryType === 'image') {
        return await this._routeImageContent(fileInfo, serviceId, binaryType, workspaceId);
      } else {
        return await this._routeNonImageBinaryContent(fileInfo, serviceId, binaryType, workspaceId);
      }
    } catch (error) {
      void this.logger?.error?.('路由文件内容时出错', { path, serviceId, error: error.message });
      return {
        contentType: 'text',
        routing: 'text',
        content: `[错误：处理文件时出错: ${error.message}]`,
        metadata: { path }
      };
    }
  }

  /**
   * 路由消息内容
   * 根据消息附件和模型能力路由
   * 
   * @param {Object} message - 原始消息
   * @param {string} serviceId - 当前服务 ID
   * @param {Object} [options] - 额外选项
   * @param {string} [options.formattedTextContent] - 预格式化的文本内容
   * @param {string} [options.workspaceId] - 工作区 ID
   * @returns {Promise<MessageRouteResult>} 路由结果
   */
  async routeMessageContent(message, serviceId, options = {}) {
    const { formattedTextContent, workspaceId } = options;
    
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
    if (supportedImages.length > 0 && this.workspaceManager) {
      const getImageBase64 = async (path) => {
        const result = await this.workspaceManager.readFile(workspaceId, path, { encoding: 'base64' });
        return result.content;
      };
      
      processedContent = await formatMultimodalContent(
        textContent,
        supportedImages,
        getImageBase64
      );
    }
    
    // 处理文件附件（如果支持 file）
    const supportedFiles = supportedAttachments.filter(a => a.type === 'file' || a.type === 'document');
    if (supportedFiles.length > 0 && this.workspaceManager) {
      const fileContents = await this._processFileAttachments(supportedFiles, workspaceId);
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
   * @param {Object} fileInfo - 文件信息对象
   * @param {string} binaryType - 二进制类型
   * @returns {string} 文本描述
   */
  generateTextDescription(fileInfo, binaryType) {
    const filename = fileInfo.filename || fileInfo.path || 'unknown file';
    const path = fileInfo.path || 'unknown';
    const mimeType = fileInfo.mimeType || 'application/octet-stream';
    const friendlyType = getFriendlyTypeName(mimeType);
    
    // Determine required capability based on binary type
    let requiredCapability = 'file';
    let capabilityDescription = '文件读取';
    
    if (binaryType === 'image') {
      requiredCapability = 'vision';
      capabilityDescription = '视觉（图像理解）';
    }
    
    return `[需要专门处理] ${filename} (${path})
类型: ${friendlyType}

操作指南: 创建具有 ${capabilityDescription} 能力的专门智能体来处理此文件。

步骤:
1. 使用 create_role 创建角色，指定支持 ${requiredCapability} 能力的大模型
2. 使用 spawn_agent_with_task 创建智能体并分配任务
3. 在任务中说明：
   - 需要读取文件 ${path}
   - 需要完成什么分析或处理
   - 完成后通过 send_message 报告结果
4. 任务描述要简洁明确，只说明目标和期望的输出

重要提示:
- 创建角色时只分配任务，不要要求他用文件读取。创建智能体的时候以任务的方式告诉他需要从文件里读取，并告知文件路径。以此保持该岗位的通用性，将来可以复用。
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
  async _routeImageContent(fileInfo, serviceId, binaryType, workspaceId = null) {
    const hasVision = this.hasCapability(serviceId, 'vision');
    
    if (hasVision) {
      const result = await this.workspaceManager.readFile(workspaceId, fileInfo.path, { encoding: 'base64' });
      const imageUrl = this.formatImageUrl(
        result.content,
        fileInfo.mimeType || 'image/jpeg'
      );
      
      return {
        contentType: 'image',
        routing: 'image_url',
        imageUrl,
        metadata: {
          path: fileInfo.path,
          filename: fileInfo.filename,
          mimeType: fileInfo.mimeType,
          binaryType,
          size: fileInfo.size,
          mtime: fileInfo.mtime
        }
      };
    } else {
      const description = this.generateTextDescription(fileInfo, binaryType);
      
      return {
        contentType: 'image',
        routing: 'text',
        content: description,
        metadata: {
          path: fileInfo.path,
          filename: fileInfo.filename,
          mimeType: fileInfo.mimeType,
          binaryType,
          size: fileInfo.size,
          mtime: fileInfo.mtime
        }
      };
    }
  }

  /**
   * 路由非图片二进制内容
   * @private
   */
  async _routeNonImageBinaryContent(fileInfo, serviceId, binaryType, workspaceId = null) {
    const hasFile = this.hasCapability(serviceId, 'file');
    
    if (hasFile) {
      const mimeType = fileInfo.mimeType || 'application/octet-stream';
      const result = await this.workspaceManager.readFile(workspaceId, fileInfo.path, { encoding: 'base64' });
      const dataUrl = `data:${mimeType};base64,${result.content}`;
      
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
          path: fileInfo.path,
          filename: fileInfo.filename,
          mimeType: fileInfo.mimeType,
          binaryType,
          size: fileInfo.size,
          mtime: fileInfo.mtime
        }
      };
    } else {
      const description = this.generateTextDescription(fileInfo, binaryType);
      
      return {
        contentType: 'binary',
        routing: 'text',
        content: description,
        metadata: {
          path: fileInfo.path,
          filename: fileInfo.filename,
          mimeType: fileInfo.mimeType,
          binaryType,
          size: fileInfo.size,
          mtime: fileInfo.mtime
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
  async _processFileAttachments(attachments, workspaceId = null) {
    const contents = [];
    
    for (const att of attachments) {
      const filename = att.filename || 'unknown';
      const path = att.path;
      
      if (!path) {
        contents.push(`\n\n【附件: ${filename}】\n[未提供文件路径]`);
        continue;
      }

      if (!isTextFile(filename)) {
        contents.push(`\n\n【附件: ${filename} (${path})】\n[二进制文件，如果需要读取内容，需要建立专门读取该类型文件的智能体帮助解读]`);
        continue;
      }
      
      try {
        const fileData = await this.workspaceManager.readFile(workspaceId, path, { length: 50000 });
        if (fileData && fileData.content) {
          let content = fileData.content;
          const truncated = fileData.readLength < fileData.totalLength;
          
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
