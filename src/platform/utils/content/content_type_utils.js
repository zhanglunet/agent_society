/**
 * Content Type Utilities
 * 
 * 通用的内容类型检测和映射工具。
 * 提供 MIME 类型、文件扩展名、二进制类型检测等功能。
 * 
 * 从 artifact_content_router 和 capability_router 中提取的通用部分。
 * 
 * Requirements: 5.2, 5.4, 5.5
 */

/**
 * @typedef {Object} BinaryTypeResult
 * @property {'image' | 'audio' | 'video' | 'document' | 'other'} type - Binary content type
 * @property {number} confidence - Detection confidence (0-1)
 */

/**
 * MIME type to binary type mappings
 */
export const MIME_TYPE_MAPPINGS = {
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
export const EXTENSION_MAPPINGS = {
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
export const FRIENDLY_TYPE_NAMES = {
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
 * Attachment type to capability type mappings
 */
export const ATTACHMENT_TYPE_TO_CAPABILITY = {
  image: 'vision',
  audio: 'audio',
  file: 'file',
  video: 'video'
};

/**
 * Detect the specific type of binary content
 * 
 * @param {Object} artifact - Artifact object
 * @returns {BinaryTypeResult} Binary type and confidence
 */
export function detectBinaryType(artifact) {
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
    const ext = extractExtension(filename);
    if (ext && EXTENSION_MAPPINGS[ext]) {
      return {
        type: EXTENSION_MAPPINGS[ext],
        confidence: 0.85
      };
    }
  }
  
  // Default: unknown type
  return {
    type: 'other',
    confidence: 0.5
  };
}

/**
 * Extract file extension from filename
 * 
 * @param {string} filename - Filename
 * @returns {string|null} Extension (with dot) or null
 */
export function extractExtension(filename) {
  if (!filename || typeof filename !== 'string') {
    return null;
  }
  
  const lastDot = filename.lastIndexOf('.');
  if (lastDot > 0 && lastDot < filename.length - 1) {
    return filename.substring(lastDot).toLowerCase();
  }
  
  return null;
}

/**
 * Get friendly type name for MIME type
 * 
 * @param {string} mimeType - MIME type
 * @returns {string} Friendly type name
 */
export function getFriendlyTypeName(mimeType) {
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
