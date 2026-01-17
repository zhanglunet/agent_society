/**
 * 能力路由器
 * 
 * 根据模型能力决定如何处理消息内容。
 * 支持的内容类型直接传递给 LLM，不支持的内容转换为文本描述。
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { formatMultimodalContent, isTextFile } from './utils/message/message_formatter.js';

/**
 * 附件类型到能力类型的映射
 */
const ATTACHMENT_TYPE_TO_CAPABILITY = {
  image: 'vision',
  audio: 'audio',
  file: 'file',
  video: 'video'
};

/**
 * 能力路由器类
 */
export class CapabilityRouter {
  /**
   * @param {Object} options - 配置选项
   * @param {Object} options.serviceRegistry - LLM 服务注册表
   * @param {Object} options.contentAdapter - 内容适配器
   * @param {Object} [options.logger] - 日志记录器
   */
  constructor(options = {}) {
    this.serviceRegistry = options.serviceRegistry;
    this.contentAdapter = options.contentAdapter;
    this.logger = options.logger || console;
  }

  /**
   * 根据模型能力路由消息内容
   * @param {Object} message - 原始消息
   * @param {string} serviceId - 当前使用的服务ID
   * @param {Object} [options] - 额外选项
   * @param {function} [options.getImageBase64] - 获取图片 base64 数据的函数
   * @param {function} [options.getFileContent] - 获取文件内容的函数
   * @param {string} [options.formattedTextContent] - 预格式化的文本内容（如果提供，将使用此内容而不是从 payload 提取）
   * @returns {Promise<Object>} 路由结果
   */
  async routeContent(message, serviceId, options = {}) {
    const { getImageBase64, getFileContent, formattedTextContent } = options;
    
    // 获取消息内容和附件
    const payload = message?.payload;
    // 如果提供了预格式化的文本内容，使用它；否则从 payload 提取
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
      // 将文件内容添加到文本中
      const fileContents = await this._processFileAttachments(supportedFiles, getFileContent);
      if (typeof processedContent === 'string') {
        processedContent = processedContent + fileContents;
      } else if (Array.isArray(processedContent)) {
        // 多模态内容，添加文件内容作为文本
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
   * 检查消息是否包含需要特殊能力的内容
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
   * 检查服务是否支持处理消息中的所有内容
   * @param {Object} message - 消息对象
   * @param {string} serviceId - 服务ID
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
      
      // 检查是否为文本文件
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

export default CapabilityRouter;
