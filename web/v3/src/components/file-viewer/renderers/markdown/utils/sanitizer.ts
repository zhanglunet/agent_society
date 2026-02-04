/**
 * HTML 安全过滤工具
 * 
 * @module components/file-viewer/renderers/markdown/utils/sanitizer
 */

import DOMPurify from 'dompurify';

/**
 * 允许的标签列表
 */
const ALLOWED_TAGS = [
  // 标题
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  // 段落和文本
  'p', 'br', 'hr', 'blockquote', 'div', 'span',
  // 列表
  'ul', 'ol', 'li',
  // 强调
  'strong', 'em', 'b', 'i', 'code', 'pre',
  // 链接和媒体
  'a', 'img',
  // 表格
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
  // 其他
  'sup', 'sub', 'del', 'ins', 'mark',
  // 注脚
  'section', 'footer'
];

/**
 * 允许的属性列表
 */
const ALLOWED_ATTR = [
  // 全局属性
  'class', 'id',
  // 链接属性
  'href', 'title', 'target', 'rel',
  // 图片属性
  'src', 'alt', 'width', 'height', 'loading',
  // 代码属性
  'data-lang',
  // 锚点
  'data-path', 'data-src',
  // 数学公式
  'data-math',
  // Mermaid
  'data-content',
  // 注脚
  'aria-describedby', 'role'
];



/**
 * 配置 DOMPurify
 */
function createDOMPurify() {
  // 浏览器环境
  if (typeof window !== 'undefined') {
    return DOMPurify(window);
  }
  // SSR 环境返回空实现
  return {
    sanitize: (html: string, _options?: any) => html
  };
}

/**
 * 净化 HTML
 * @param html 原始 HTML
 * @returns 净化后的安全 HTML
 */
export function sanitizeHtml(html: string): string {
  const purify = createDOMPurify();

  const result = purify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: true,  // 允许 data-* 属性（用于 math, mermaid 等）
    SANITIZE_DOM: true,
    KEEP_CONTENT: true
  });
  return result.toString();
}

/**
 * 检查是否包含危险内容
 * @param html HTML 内容
 * @returns 是否包含危险内容
 */
export function hasDangerousContent(html: string): boolean {
  const dangerousPatterns = [
    /<script\b/i,
    /<style\b/i,
    /javascript:/i,
    /on\w+\s*=/i, // 事件处理器 onclick= onerror= 等
    /<iframe\b/i,
    /<object\b/i,
    /<embed\b/i
  ];

  return dangerousPatterns.some(pattern => pattern.test(html));
}

/**
 * 转义 HTML 特殊字符
 * @param text 纯文本
 * @returns 转义后的文本
 */
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
