/**
 * Artifact Content Router
 * 
 * Routes artifact content based on model capabilities and content type.
 * Intelligently routes binary content to appropriate message fields (image_url, file)
 * or provides text descriptions as fallback for unsupported content types.
 * 
 * Requirements: 1, 2, 3, 4, 5, 6, 7, 8
 */

import { createNoopModuleLogger } from "./utils/logger/logger.js";

/**
 * @typedef {Object} ContentRouteResult
 * @property {'text' | 'image' | 'binary'} contentType - Content type classification
 * @property {'text' | 'image_url' | 'file'} routing - Routing destination
 * @property {string} [content] - Text content or description
 * @property {Object} [imageUrl] - image_url format data
 * @property {string} imageUrl.type - Always "image_url"
 * @property {Object} imageUrl.image_url - Image URL object
 * @property {string} imageUrl.image_url.url - Data URL with base64 image
 * @property {Object} [file] - file format data
 * @property {Object} metadata - Additional metadata
 */

/**
 * @typedef {Object} BinaryTypeResult
 * @property {'image' | 'audio' | 'video' | 'document' | 'other'} type - Binary content type
 * @property {number} confidence - Detection confidence (0-1)
 */

/**
 * MIME type to binary type mappings
 */
const MIME_TYPE_MAPPINGS = {
  // Images
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'image/bmp': 'image',
  'image/avif': 'image',
  'image/svg+xml': 'image',
  'image/tiff': 'image',
  
  // Audio
  'audio/mpeg': 'audio',
  'audio/mp3': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/aac': 'audio',
  'audio/flac': 'audio',
  
  // Video
  'video/mp4': 'video',
  'video/webm': 'video',
  'video/quicktime': 'video',
  'video/x-msvideo': 'video',
  'video/mpeg': 'video',
  
  // Documents
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/vnd.ms-powerpoint': 'document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'document'
};

/**
 * Extension to binary type mappings
 */
const EXTENSION_MAPPINGS = {
  // Images
  '.jpg': 'image',
  '.jpeg': 'image',
  '.png': 'image',
  '.gif': 'image',
  '.webp': 'image',
  '.bmp': 'image',
  '.avif': 'image',
  '.svg': 'image',
  '.tiff': 'image',
  '.tif': 'image',
  
  // Audio
  '.mp3': 'audio',
  '.wav': 'audio',
  '.ogg': 'audio',
  '.aac': 'audio',
  '.flac': 'audio',
  '.m4a': 'audio',
  
  // Video
  '.mp4': 'video',
  '.webm': 'video',
  '.mov': 'video',
  '.avi': 'video',
  '.mkv': 'video',
  '.flv': 'video',
  
  // Documents
  '.pdf': 'document',
  '.doc': 'document',
  '.docx': 'document',
  '.xls': 'document',
  '.xlsx': 'document',
  '.ppt': 'document',
  '.pptx': 'document'
};

/**
 * Friendly type names for user-facing descriptions
 */
const FRIENDLY_TYPE_NAMES = {
  'image/jpeg': 'JPEG Image',
  'image/jpg': 'JPEG Image',
  'image/png': 'PNG Image',
  'image/gif': 'GIF Image',
  'image/webp': 'WebP Image',
  'image/bmp': 'BMP Image',
  'image/avif': 'AVIF Image',
  'image/svg+xml': 'SVG Image',
  'application/pdf': 'PDF Document',
  'application/msword': 'Word Document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word Document',
  'application/vnd.ms-excel': 'Excel Spreadsheet',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'Excel Spreadsheet',
  'application/vnd.ms-powerpoint': 'PowerPoint Presentation',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PowerPoint Presentation',
  'audio/mpeg': 'MP3 Audio',
  'audio/mp3': 'MP3 Audio',
  'audio/wav': 'WAV Audio',
  'audio/ogg': 'OGG Audio',
  'video/mp4': 'MP4 Video',
  'video/webm': 'WebM Video',
  'video/quicktime': 'QuickTime Video',
  'application/octet-stream': 'Binary File'
};

/**
 * Artifact Content Router Class
 */
export class ArtifactContentRouter {
  /**
   * @param {Object} options - Configuration options
   * @param {Object} [options.serviceRegistry] - LLM service registry
   * @param {Object} [options.binaryDetector] - Binary detector instance
   * @param {Object} [options.logger] - Logger instance
   */
  constructor(options = {}) {
    this.serviceRegistry = options.serviceRegistry || null;
    this.binaryDetector = options.binaryDetector || null;
    this.logger = options.logger || createNoopModuleLogger();
  }

  /**
   * Detect the specific type of binary content
   * 
   * @param {Object} artifact - Artifact object
   * @returns {BinaryTypeResult} Binary type and confidence
   */
  detectBinaryType(artifact) {
    const mimeType = artifact?.mimeType || artifact?.meta?.mimeType;
    const filename = artifact?.meta?.filename || artifact?.id;
    
    // Priority 1: MIME type detection
    if (mimeType && typeof mimeType === 'string') {
      const normalizedMime = mimeType.toLowerCase().trim();
      
      // Check exact match
      if (MIME_TYPE_MAPPINGS[normalizedMime]) {
        return {
          type: MIME_TYPE_MAPPINGS[normalizedMime],
          confidence: 0.95
        };
      }
      
      // Check prefix match
      if (normalizedMime.startsWith('image/')) {
        return { type: 'image', confidence: 0.9 };
      }
      if (normalizedMime.startsWith('audio/')) {
        return { type: 'audio', confidence: 0.9 };
      }
      if (normalizedMime.startsWith('video/')) {
        return { type: 'video', confidence: 0.9 };
      }
    }
    
    // Priority 2: Extension detection
    if (filename && typeof filename === 'string') {
      const ext = this._extractExtension(filename);
      if (ext && EXTENSION_MAPPINGS[ext]) {
        return {
          type: EXTENSION_MAPPINGS[ext],
          confidence: 0.85
        };
      }
    }
    
    // Priority 3: Content-based detection (if binaryDetector available)
    // This is a fallback and would require the content buffer
    
    // Default: unknown type
    return {
      type: 'other',
      confidence: 0.5
    };
  }

  /**
   * Check if a service has a specific capability
   * 
   * @param {string} serviceId - Service ID
   * @param {string} capability - Capability name ('vision', 'file', 'audio', 'video')
   * @returns {boolean} True if capability is supported
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
      void this.logger?.warn?.('Error checking capability', {
        serviceId,
        capability,
        error: error?.message
      });
      return false;
    }
  }

  /**
   * Route artifact content based on type and model capabilities
   * 
   * @param {Object} artifact - Artifact object from ArtifactStore
   * @param {string} serviceId - Current agent's LLM service ID
   * @returns {Promise<ContentRouteResult>} Routing result
   */
  async routeContent(artifact, serviceId) {
    // Handle null/undefined artifact
    if (!artifact) {
      return {
        contentType: 'text',
        routing: 'text',
        content: '[Error: Artifact not found]',
        metadata: {}
      };
    }
    
    // Handle text content
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
    
    // Handle binary content
    const binaryTypeResult = this.detectBinaryType(artifact);
    const binaryType = binaryTypeResult.type;
    
    void this.logger?.debug?.('Detected binary type', {
      artifactId: artifact.id,
      binaryType,
      confidence: binaryTypeResult.confidence,
      mimeType: artifact.mimeType || artifact.meta?.mimeType
    });
    
    // Route based on binary type and capabilities
    if (binaryType === 'image') {
      return await this._routeImageContent(artifact, serviceId, binaryType);
    } else {
      return await this._routeNonImageBinaryContent(artifact, serviceId, binaryType);
    }
  }

  /**
   * Route image content
   * @private
   */
  async _routeImageContent(artifact, serviceId, binaryType) {
    const hasVision = this.hasCapability(serviceId, 'vision');
    
    if (hasVision) {
      // Route to image_url field
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
      // Fallback to text description
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
   * Route non-image binary content
   * @private
   */
  async _routeNonImageBinaryContent(artifact, serviceId, binaryType) {
    const hasFile = this.hasCapability(serviceId, 'file');
    
    if (hasFile) {
      // Route to file field using file_url format with base64 data URL
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
      // Fallback to text description
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
   * Format image content as image_url object
   * 
   * @param {string} base64Content - Base64 encoded image data
   * @param {string} mimeType - Image MIME type
   * @returns {Object} image_url format object
   */
  formatImageUrl(base64Content, mimeType) {
    // Validate and normalize MIME type
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
   * Generate text description for unsupported binary content
   * 
   * @param {Object} artifact - Artifact object
   * @param {string} binaryType - Binary type ('image', 'audio', 'video', 'document', 'other')
   * @returns {string} Text description
   */
  generateTextDescription(artifact, binaryType) {
    const filename = artifact.meta?.filename || artifact.id || 'unknown file';
    const artifactId = artifact.id || 'unknown';
    const mimeType = artifact.mimeType || artifact.meta?.mimeType || 'application/octet-stream';
    const friendlyType = this._getFriendlyTypeName(mimeType);
    
    // Determine required capability and service example based on binary type
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

  /**
   * Get friendly type name for MIME type
   * @private
   */
  _getFriendlyTypeName(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
      return 'Binary File';
    }
    
    const normalized = mimeType.toLowerCase().trim();
    
    // Check exact match
    if (FRIENDLY_TYPE_NAMES[normalized]) {
      return FRIENDLY_TYPE_NAMES[normalized];
    }
    
    // Check prefix match
    if (normalized.startsWith('image/')) {
      return 'Image File';
    }
    if (normalized.startsWith('audio/')) {
      return 'Audio File';
    }
    if (normalized.startsWith('video/')) {
      return 'Video File';
    }
    if (normalized.startsWith('text/')) {
      return 'Text File';
    }
    
    // Return MIME type as-is
    return mimeType;
  }

  /**
   * Extract file extension from filename
   * @private
   */
  _extractExtension(filename) {
    if (!filename || typeof filename !== 'string') {
      return null;
    }
    
    const lastDot = filename.lastIndexOf('.');
    if (lastDot > 0 && lastDot < filename.length - 1) {
      return filename.substring(lastDot).toLowerCase();
    }
    
    return null;
  }
}

export default ArtifactContentRouter;
