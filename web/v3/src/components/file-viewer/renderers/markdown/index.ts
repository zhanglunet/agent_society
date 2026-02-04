/**
 * Markdown 渲染模块
 * 
 * @module components/file-viewer/renderers/markdown
 */

// 类型导出
export type {
  RenderOptions,
  RenderResult,
  HeadingInfo,
  ResolvedLink,
  ResolvedImage,
  OpenFileOptions
} from './markdown.types';

// 引擎导出
export { createMarkdownEngine, getMarkdownEngine } from './engine';

// 工具函数导出
export {
  normalizePath,
  resolveRelativePath,
  resolveLink,
  resolveImage,
  generateAnchorId,
  isExternalLink,
  isAnchorLink,
  isEmailLink
} from './utils/path';

export { sanitizeHtml, hasDangerousContent, escapeHtml } from './utils/sanitizer';
