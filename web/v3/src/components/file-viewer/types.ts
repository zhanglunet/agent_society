/**
 * 文件查看器类型定义
 * 
 * @module components/file-viewer/types
 */

import type { Component, DefineComponent } from 'vue';

// 重新导出 Component 类型供其他模块使用
export type { Component, DefineComponent };

/**
 * 文件内容数据结构
 */
export interface FileContent {
  /** 文件内容 (ArrayBuffer 或 string) */
  data: ArrayBuffer | string;
  /** MIME 类型 */
  mimeType: string;
  /** 文件大小（字节） */
  size: number;
  /** 最后修改时间 */
  lastModified?: number;
}

/**
 * 文件查看器配置选项
 */
export interface FileViewerOptions {
  /** 是否只读模式（禁用编辑） */
  readOnly?: boolean;
  /** 是否显示行号（针对代码文件） */
  showLineNumbers?: boolean;
  /** 主题（light/dark） */
  theme?: 'light' | 'dark';
  /** 自定义渲染器配置 */
  rendererOptions?: Record<string, any>;
}

/**
 * 渲染器组件属性
 */
export interface RendererProps {
  /** 文件内容 */
  content: FileContent;
  /** 文件名 */
  fileName: string;
  /** 文件路径 */
  filePath: string;
  /** 工作区ID */
  workspaceId: string;
}

/**
 * MIME 类型处理器接口
 */
export interface MimeTypeHandler {
  /** MIME 类型匹配模式（支持通配符，如 'image/*'） */
  mimePattern: string | string[];
  /** 文件扩展名列表（可选，用于辅助匹配） */
  extensions?: string[];
  /** 渲染器组件 */
  component: Component;
  /** 文件图标组件 */
  icon: Component;
  /** 优先级（数字越大优先级越高，用于解决冲突） */
  priority?: number;
  /** 是否支持二进制数据 */
  supportsBinary?: boolean;
}

/**
 * 文件信息
 */
export interface FileInfo {
  /** 文件名 */
  name: string;
  /** 文件路径 */
  path: string;
  /** 文件大小 */
  size: number;
  /** MIME 类型 */
  mimeType: string;
  /** 最后修改时间 */
  lastModified?: number;
}

/**
 * 工作区文件列表响应
 */
export interface WorkspaceFilesResponse {
  /** 文件列表 */
  files: FileInfo[];
  /** 总文件数 */
  total: number;
}
