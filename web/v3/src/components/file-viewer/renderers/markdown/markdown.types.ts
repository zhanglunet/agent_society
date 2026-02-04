/**
 * Markdown 渲染器类型定义
 * 
 * @module components/file-viewer/renderers/markdown
 */

/**
 * Markdown 渲染选项
 */
export interface RenderOptions {
  /** 当前文件路径（用于解析相对路径） */
  filePath?: string;
  /** 工作区 ID */
  workspaceId?: string;
  /** 是否启用代码高亮 */
  enableCodeHighlight?: boolean;
  /** 是否启用锚点 */
  enableAnchor?: boolean;
  /** 是否启用数学公式 */
  enableMath?: boolean;
  /** 是否启用 Mermaid 图表 */
  enableMermaid?: boolean;
}

/**
 * Markdown 渲染结果
 */
export interface RenderResult {
  /** 渲染后的 HTML */
  html: string;
  /** 提取的标题列表（用于目录） */
  headings?: HeadingInfo[];
  /** 是否包含数学公式 */
  hasMath?: boolean;
  /** 是否包含 Mermaid 图表 */
  hasMermaid?: boolean;
}

/**
 * 标题信息
 */
export interface HeadingInfo {
  /** 标题级别 1-6 */
  level: number;
  /** 标题文本 */
  text: string;
  /** 锚点 ID */
  id: string;
}

/**
 * 链接类型
 */
export type LinkType = 'external' | 'internal' | 'anchor' | 'email';

/**
 * 解析后的链接信息
 */
export interface ResolvedLink {
  /** 链接类型 */
  type: LinkType;
  /** 解析后的路径 */
  path: string;
  /** 原始 href */
  originalHref: string;
}

/**
 * 图片路径解析结果
 */
export interface ResolvedImage {
  /** 解析后的完整 URL */
  src: string;
  /** 原始路径 */
  originalSrc: string;
  /** 是否为外部图片 */
  isExternal: boolean;
}

/**
 * 代码块信息
 */
export interface CodeBlockInfo {
  /** 语言 */
  lang?: string;
  /** 代码内容 */
  code: string;
}

/**
 * 插件接口
 */
export interface MarkdownPlugin {
  /** 插件名称 */
  name: string;
  /** 安装函数 */
  install: (engine: MarkdownEngine) => void;
}

/**
 * Markdown 引擎接口（简化）
 */
export interface MarkdownEngine {
  /** 渲染 Markdown */
  render: (content: string, options?: RenderOptions) => RenderResult;
  /** 使用插件 */
  use: (plugin: MarkdownPlugin) => void;
}

/**
 * 文件查看器打开选项
 */
export interface OpenFileOptions {
  /** 工作区 ID */
  workspaceId: string;
  /** 文件路径 */
  filePath: string;
  /** 文件名 */
  fileName?: string;
  /** 初始视图模式 */
  viewMode?: 'preview' | 'source';
}
