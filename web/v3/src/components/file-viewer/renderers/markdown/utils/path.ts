/**
 * 路径处理工具函数
 * 
 * @module components/file-viewer/renderers/markdown/utils/path
 */

import type { ResolvedLink, ResolvedImage } from '../markdown.types';

/**
 * 规范化路径（处理 . 和 ..）
 * @param path 原始路径
 * @returns 规范化后的路径
 */
export function normalizePath(path: string): string {
  const parts = path.split('/');
  const result: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      // 返回上级目录
      result.pop();
    } else if (part !== '.' && part !== '') {
      // 跳过当前目录 . 和空字符串
      result.push(part);
    }
  }

  return result.join('/');
}

/**
 * 解析相对路径为绝对路径
 * @param relativePath 相对路径
 * @param basePath 基础路径（当前文件路径）
 * @returns 绝对路径
 */
export function resolveRelativePath(relativePath: string, basePath: string): string {
  // 如果已经是绝对路径，直接返回
  if (relativePath.startsWith('/')) {
    return relativePath.slice(1); // 移除开头的 /
  }

  // 获取基础目录
  const baseDir = basePath.includes('/')
    ? basePath.substring(0, basePath.lastIndexOf('/') + 1)
    : '';

  // 拼接并规范化
  const resolvedPath = normalizePath(baseDir + relativePath);
  return resolvedPath;
}

/**
 * 判断是否为外部链接
 * @param href 链接地址
 */
export function isExternalLink(href: string): boolean {
  return href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('//');
}

/**
 * 判断是否为邮件链接
 * @param href 链接地址
 */
export function isEmailLink(href: string): boolean {
  return href.startsWith('mailto:');
}

/**
 * 判断是否为锚点链接
 * @param href 链接地址
 */
export function isAnchorLink(href: string): boolean {
  return href.startsWith('#');
}

/**
 * 解析链接类型和路径
 * @param href 原始 href
 * @param basePath 当前文件路径
 * @returns 解析后的链接信息
 */
export function resolveLink(href: string, basePath: string): ResolvedLink {
  // 锚点链接
  if (isAnchorLink(href)) {
    return {
      type: 'anchor',
      path: href,
      originalHref: href
    };
  }

  // 外部链接
  if (isExternalLink(href)) {
    return {
      type: 'external',
      path: href,
      originalHref: href
    };
  }

  // 邮件链接
  if (isEmailLink(href)) {
    return {
      type: 'email',
      path: href,
      originalHref: href
    };
  }

  // 内部文档链接
  const resolvedPath = resolveRelativePath(href, basePath);
  return {
    type: 'internal',
    path: resolvedPath,
    originalHref: href
  };
}

/**
 * 解析图片路径
 * @param src 原始 src
 * @param basePath 当前文件路径
 * @param workspaceId 工作区 ID
 * @returns 解析后的图片信息
 */
export function resolveImage(src: string, basePath: string, workspaceId?: string): ResolvedImage {
  // 外部图片或 data URI
  if (isExternalLink(src) || src.startsWith('data:')) {
    return {
      src,
      originalSrc: src,
      isExternal: true
    };
  }

  // 需要工作区 ID 才能解析
  if (!workspaceId) {
    console.warn('[Markdown] 缺少 workspaceId，无法解析图片路径:', src);
    return {
      src,
      originalSrc: src,
      isExternal: false
    };
  }

  // 绝对路径（相对于工作区根）
  if (src.startsWith('/')) {
    return {
      src: `/workspace-files/${workspaceId}${src}`,
      originalSrc: src,
      isExternal: false
    };
  }

  // 相对路径
  const resolvedPath = resolveRelativePath(src, basePath);
  return {
    src: `/workspace-files/${workspaceId}/${resolvedPath}`,
    originalSrc: src,
    isExternal: false
  };
}

/**
 * 生成锚点 ID
 * 将标题文本转换为 URL 友好的 ID
 * @param text 标题文本
 * @param usedIds 已使用的 ID 集合（用于去重）
 * @returns 唯一锚点 ID
 */
export function generateAnchorId(text: string, usedIds: Set<string> = new Set()): string {
  // 提取纯文本（去除 Markdown 标记）
  const plainText = text
    .replace(/\*\*(.*?)\*\*/g, '$1') // 粗体
    .replace(/\*(.*?)\*/g, '$1') // 斜体
    .replace(/`([^`]+)`/g, '$1') // 行内代码
    .trim();

  // 转换为 URL 友好格式
  let id = plainText
    .toLowerCase()
    .replace(/[^\w\s-]/g, '') // 移除非字母数字字符
    .replace(/\s+/g, '-') // 空格转为连字符
    .replace(/-+/g, '-') // 多个连字符合并
    .replace(/^-|-$/g, ''); // 移除首尾连字符

  // 保底值
  if (!id) {
    id = 'heading';
  }

  // 去重处理
  let uniqueId = id;
  let counter = 1;
  while (usedIds.has(uniqueId)) {
    uniqueId = `${id}-${counter}`;
    counter++;
  }

  usedIds.add(uniqueId);
  return uniqueId;
}
