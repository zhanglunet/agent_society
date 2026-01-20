/**
 * MIME类型常量定义
 * 统一管理工件类型的MIME类型映射
 */

/**
 * 图片类型MIME类型列表
 */
export const IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg', 
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/bmp',
  'image/tiff'
];

/**
 * JSON类型MIME类型列表
 */
export const JSON_MIME_TYPES = [
  'application/json',
  'application/json5',
  'text/json'
];

/**
 * 文本类型MIME类型列表
 */
export const TEXT_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'text/x-markdown'
];

/**
 * 代码类型MIME类型列表
 */
export const CODE_MIME_TYPES = [
  'text/javascript',
  'application/javascript',
  'text/typescript',
  'text/x-python',
  'text/x-java-source',
  'text/x-c',
  'text/x-c++',
  'text/x-go',
  'text/x-rust',
  'text/x-ruby',
  'text/x-php',
  'application/x-python-code',
  'application/x-javascript'
];

/**
 * HTML类型MIME类型
 */
export const HTML_MIME_TYPE = 'text/html';

/**
 * CSS类型MIME类型
 */
export const CSS_MIME_TYPE = 'text/css';

/**
 * 检查是否为图片类型
 * @param {string} mimeType - MIME类型
 * @returns {boolean}
 */
export function isImageType(mimeType) {
  return IMAGE_MIME_TYPES.includes((mimeType || '').toLowerCase());
}

/**
 * 检查是否为JSON类型
 * @param {string} mimeType - MIME类型
 * @returns {boolean}
 */
export function isJsonType(mimeType) {
  return JSON_MIME_TYPES.includes((mimeType || '').toLowerCase());
}

/**
 * 检查是否为文本类型
 * @param {string} mimeType - MIME类型
 * @returns {boolean}
 */
export function isTextType(mimeType) {
  return TEXT_MIME_TYPES.includes((mimeType || '').toLowerCase());
}

/**
 * 检查是否为代码类型
 * @param {string} mimeType - MIME类型
 * @returns {boolean}
 */
export function isCodeType(mimeType) {
  return CODE_MIME_TYPES.includes((mimeType || '').toLowerCase());
}

/**
 * 检查是否为HTML类型
 * @param {string} mimeType - MIME类型
 * @returns {boolean}
 */
export function isHtmlType(mimeType) {
  return (mimeType || '').toLowerCase() === HTML_MIME_TYPE;
}

/**
 * 检查是否为CSS类型
 * @param {string} mimeType - MIME类型
 * @returns {boolean}
 */
export function isCssType(mimeType) {
  return (mimeType || '').toLowerCase() === CSS_MIME_TYPE;
}

/**
 * 根据MIME类型获取工件分组类型
 * @param {string} mimeType - MIME类型
 * @returns {string} 分组类型
 */
export function getArtifactGroupType(mimeType) {
  if (isImageType(mimeType)) return 'image';
  if (isJsonType(mimeType)) return 'json';
  if (isTextType(mimeType)) return 'text';
  if (isCodeType(mimeType)) return 'code';
  if (isHtmlType(mimeType)) return 'html';
  if (isCssType(mimeType)) return 'css';
  return 'other';
}

/**
 * 根据MIME类型获取文件图标
 * @param {string} mimeType - MIME类型
 * @returns {string} 图标emoji
 */
export function getFileIconByMimeType(mimeType) {
  if (isImageType(mimeType)) return "🖼️";
  if (isJsonType(mimeType)) return "📄";
  if (isTextType(mimeType)) return "📝";
  if (isCodeType(mimeType)) return "💻";
  if (isHtmlType(mimeType)) return "🌐";
  if (isCssType(mimeType)) return "🎨";
  return "📋";
}

/**
 * 常用MIME类型示例（用于文档和提示）
 */
export const MIME_TYPE_EXAMPLES = {
  json: 'application/json',
  text: 'text/plain',
  html: 'text/html',
  css: 'text/css',
  javascript: 'text/javascript',
  typescript: 'text/typescript',
  python: 'text/x-python',
  markdown: 'text/markdown',
  png: 'image/png',
  jpeg: 'image/jpeg'
};