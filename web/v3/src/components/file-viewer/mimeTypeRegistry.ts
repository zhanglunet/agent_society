/**
 * MIME 类型注册表
 * 
 * 负责管理各种文件类型的渲染器，支持：
 * 1. 根据 MIME 类型自动匹配渲染器
 * 2. 支持通配符匹配（如 image/*）
 * 3. 基于文件扩展名的辅助匹配
 * 4. 优先级处理
 * 
 * @module components/file-viewer/mimeTypeRegistry
 */
import { markRaw } from 'vue';
import { 
  FileText, Image, Video, Music, FileJson, 
  FileCode, FileType2, ScrollText 
} from 'lucide-vue-next';
import type { MimeTypeHandler, Component } from './types';

// 导入渲染器组件
import ImageRenderer from './renderers/ImageRenderer.vue';
import VideoRenderer from './renderers/VideoRenderer.vue';
import AudioRenderer from './renderers/AudioRenderer.vue';
import TextRenderer from './renderers/TextRenderer.vue';
import MarkdownRenderer from './renderers/MarkdownRenderer.vue';
import JsonRenderer from './renderers/JsonRenderer.vue';
import HtmlRenderer from './renderers/HtmlRenderer.vue';
import PdfRenderer from './renderers/PdfRenderer.vue';
import CodeRenderer from './renderers/CodeRenderer.vue';

/**
 * MIME 类型注册表类
 */
class MimeTypeRegistry {
  private handlers: MimeTypeHandler[] = [];

  constructor() {
    this.registerDefaultHandlers();
  }

  /**
   * 注册 MIME 类型处理器
   */
  register(handler: MimeTypeHandler): void {
    // 使用 markRaw 避免 Vue 响应式劫持
    this.handlers.push({
      ...handler,
      component: markRaw(handler.component),
      icon: markRaw(handler.icon)
    });
    
    // 按优先级排序（高的在前）
    this.handlers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /**
   * 注销 MIME 类型处理器
   */
  unregister(mimePattern: string): void {
    this.handlers = this.handlers.filter(h => {
      const patterns = Array.isArray(h.mimePattern) ? h.mimePattern : [h.mimePattern];
      return !patterns.includes(mimePattern);
    });
  }

  /**
   * 根据 MIME 类型和扩展名获取渲染器
   */
  getRenderer(mimeType: string, extension?: string): Component | null {
    // 1. 首先尝试精确匹配 MIME 类型
    for (const handler of this.handlers) {
      if (this.matchesMimeType(mimeType, handler.mimePattern)) {
        return handler.component;
      }
    }

    // 2. 如果没有匹配，尝试根据扩展名匹配
    if (extension) {
      for (const handler of this.handlers) {
        if (handler.extensions?.includes(extension.toLowerCase())) {
          return handler.component;
        }
      }
    }

    // 3. 最后尝试通配符匹配（如 text/*）
    const mainType = mimeType.split('/')[0];
    for (const handler of this.handlers) {
      if (this.matchesMimeType(`${mainType}/*`, handler.mimePattern)) {
        return handler.component;
      }
    }

    return null;
  }

  /**
   * 根据 MIME 类型和扩展名获取文件图标
   */
  getFileIcon(mimeType: string, extension?: string): Component {
    for (const handler of this.handlers) {
      if (this.matchesMimeType(mimeType, handler.mimePattern)) {
        return handler.icon;
      }
    }

    // 根据扩展名尝试匹配
    if (extension) {
      for (const handler of this.handlers) {
        if (handler.extensions?.includes(extension.toLowerCase())) {
          return handler.icon;
        }
      }
    }

    return FileText;
  }

  /**
   * 检查 MIME 类型是否匹配模式
   */
  private matchesMimeType(mimeType: string, pattern: string | string[]): boolean {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    
    for (const p of patterns) {
      // 精确匹配
      if (p === mimeType) return true;
      
      // 通配符匹配（如 image/*）
      if (p.endsWith('/*')) {
        const prefix = p.slice(0, -1);
        if (mimeType.startsWith(prefix)) return true;
      }
      
      // 多类型匹配（如 text/plain,text/markdown）
      if (p.includes(',')) {
        const types = p.split(',').map(t => t.trim());
        if (types.includes(mimeType)) return true;
      }
    }
    
    return false;
  }

  /**
   * 获取所有支持的 MIME 类型
   */
  getSupportedTypes(): string[] {
    const types: string[] = [];
    for (const handler of this.handlers) {
      const patterns = Array.isArray(handler.mimePattern) 
        ? handler.mimePattern 
        : [handler.mimePattern];
      types.push(...patterns);
    }
    return [...new Set(types)];
  }

  /**
   * 注册默认的 MIME 类型处理器
   */
  private registerDefaultHandlers(): void {
    // 图片渲染器
    this.register({
      mimePattern: 'image/*',
      extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico'],
      component: ImageRenderer,
      icon: Image,
      priority: 100
    });

    // 视频渲染器
    this.register({
      mimePattern: ['video/*', 'application/mp4'],
      extensions: ['mp4', 'webm', 'ogg', 'mov', 'avi', 'mkv'],
      component: VideoRenderer,
      icon: Video,
      priority: 100
    });

    // 音频渲染器
    this.register({
      mimePattern: 'audio/*',
      extensions: ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a'],
      component: AudioRenderer,
      icon: Music,
      priority: 100
    });

    // PDF 渲染器
    this.register({
      mimePattern: 'application/pdf',
      extensions: ['pdf'],
      component: PdfRenderer,
      icon: FileType2,
      priority: 100
    });

    // Markdown 渲染器（在普通文本之前注册，优先级更高）
    this.register({
      mimePattern: ['text/markdown', 'text/x-markdown'],
      extensions: ['md', 'markdown', 'mdx'],
      component: MarkdownRenderer,
      icon: ScrollText,
      priority: 90
    });

    // JSON 渲染器
    this.register({
      mimePattern: 'application/json',
      extensions: ['json'],
      component: JsonRenderer,
      icon: FileJson,
      priority: 90
    });

    // HTML 渲染器（在安全模式下显示源码）
    this.register({
      mimePattern: ['text/html', 'application/xhtml+xml'],
      extensions: ['html', 'htm', 'xhtml'],
      component: HtmlRenderer,
      icon: FileCode,
      priority: 90
    });

    // 代码文件渲染器
    this.register({
      mimePattern: [
        'text/javascript',
        'application/javascript',
        'application/typescript',
        'text/css',
        'text/x-python',
        'application/x-python-code',
        'text/x-java',
        'text/x-c',
        'text/x-c++',
        'text/x-go',
        'text/x-rust',
        'text/x-sh',
        'application/x-sh'
      ],
      extensions: [
        'js', 'ts', 'tsx', 'jsx', 'vue', 
        'css', 'scss', 'sass', 'less',
        'py', 'java', 'c', 'cpp', 'cc', 'h', 'hpp',
        'go', 'rs', 'rb', 'php', 'swift', 'kt',
        'sh', 'bash', 'zsh', 'ps1', 'bat', 'cmd'
      ],
      component: CodeRenderer,
      icon: FileCode,
      priority: 80
    });

    // 普通文本渲染器（最低优先级，作为兜底）
    this.register({
      mimePattern: 'text/*',
      extensions: ['txt', 'log', 'csv', 'tsv', 'ini', 'conf', 'cfg', 'properties'],
      component: TextRenderer,
      icon: FileText,
      priority: 10
    });
  }
}

// 导出单例实例
export const mimeTypeRegistry = new MimeTypeRegistry();
