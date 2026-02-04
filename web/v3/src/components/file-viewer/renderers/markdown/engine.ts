/**
 * Markdown 渲染引擎
 * 
 * @module components/file-viewer/renderers/markdown/engine
 */

import MarkdownIt from 'markdown-it';
import footnote from 'markdown-it-footnote';
import type { RenderOptions, RenderResult, HeadingInfo } from './markdown.types';
import { sanitizeHtml } from './utils/sanitizer';
import { generateAnchorId, resolveImage, resolveLink } from './utils/path';
import { codeHighlightPlugin } from './plugins/code-highlight';
import { mathPlugin, hasMath as checkHasMath } from './plugins/math';

/**
 * Markdown 引擎接口
 */
export interface MarkdownEngine {
  render: (content: string, options?: RenderOptions) => RenderResult;
  use: (plugin: { name: string; install: (engine: MarkdownEngine) => void }) => void;
  md: MarkdownIt;
}

/**
 * 创建 Markdown 渲染引擎
 */
export function createMarkdownEngine(): MarkdownEngine {
  // 创建 markdown-it 实例
  const md = new MarkdownIt({
    html: true, // 允许安全的 HTML（后续由 DOMPurify 过滤）
    breaks: true, // 转换换行为 <br>
    linkify: true, // 自动识别链接
    typographer: true, // 启用排版优化
    highlight: (str, lang) => {
      // 代码高亮占位，后续由插件处理
      return `<pre><code class="language-${lang || 'text'}">${escapeHtml(str)}</code></pre>`;
    }
  });

  // 使用注脚插件
  md.use(footnote);

  // 存储已使用的锚点 ID
  const usedAnchorIds = new Set<string>();

  // 存储标题信息
  let headings: HeadingInfo[] = [];

  // 是否包含特殊内容
  let hasMath = false;
  let hasMermaid = false;

  /**
   * 转义 HTML 特殊字符
   */
  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * 自定义标题渲染规则（添加锚点）
   */
  md.renderer.rules.heading_open = (tokens, idx, options, _env, self) => {
    const token = tokens[idx];
    if (!token) return self.renderToken(tokens, idx, options);
    
    const level = parseInt(token.tag.slice(1), 10);

    // 获取标题内容
    let content = '';
    for (let i = idx + 1; i < tokens.length && tokens[i]?.type !== 'heading_close'; i++) {
      if (tokens[i]?.type === 'inline') {
        content += tokens[i]?.content || '';
      }
    }

    // 生成锚点 ID
    const id = generateAnchorId(content, usedAnchorIds);

    // 记录标题信息
    headings.push({ level, text: content, id });

    // 添加锚点属性
    token.attrSet('id', id);

    return self.renderToken(tokens, idx, options);
  };

  /**
   * 自定义链接渲染规则
   */
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!token) return self.renderToken(tokens, idx, options);
    
    const href = token.attrGet('href') || '';

    // 获取文件路径（从环境变量）
    const filePath = (env as any)?.filePath || '';

    // 解析链接
    const resolved = resolveLink(href, filePath);

    // 根据类型设置属性
    if (resolved.type === 'external') {
      token.attrSet('target', '_blank');
      token.attrSet('rel', 'noopener noreferrer');
    } else if (resolved.type === 'anchor') {
      token.attrSet('class', 'anchor-link');
    } else if (resolved.type === 'internal') {
      token.attrSet('class', 'internal-link');
      token.attrSet('data-path', resolved.path);
    }

    return self.renderToken(tokens, idx, options);
  };

  /**
   * 自定义图片渲染规则
   */
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!token) return self.renderToken(tokens, idx, options);
    
    const src = token.attrGet('src') || '';
    const alt = token.content || '';

    // 获取文件路径和工作区 ID
    const filePath = (env as any)?.filePath || '';
    const workspaceId = (env as any)?.workspaceId;

    // 解析图片路径
    const resolved = resolveImage(src, filePath, workspaceId);

    // 设置属性
    token.attrSet('src', resolved.src);
    token.attrSet('alt', alt);
    token.attrSet('class', 'markdown-image');
    token.attrSet('data-src', resolved.originalSrc);

    // 添加懒加载
    if (!resolved.isExternal) {
      token.attrSet('loading', 'lazy');
    }

    return self.renderToken(tokens, idx, options);
  };

  /**
   * 自定义代码块渲染规则（检测 Mermaid 和数学公式）
   */
  const originalFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    if (!token) {
      return originalFence ? originalFence(tokens, idx, options, env, self) : '';
    }
    
    const info = token.info.trim();
    const content = token.content;

    // 检测 Mermaid
    if (info === 'mermaid') {
      hasMermaid = true;
      return `<div class="mermaid" data-content="${escapeHtml(content)}">${escapeHtml(content)}</div>`;
    }

    // 检测数学公式块
    if (info === 'math' || info === 'latex') {
      hasMath = true;
      return `<div class="math-block" data-content="${escapeHtml(content)}">$$${escapeHtml(content)}$$</div>`;
    }

    // 普通代码块 - 添加 data-lang 属性用于后处理高亮
    const lang = info.split(' ')[0];
    if (lang) {
      return `<pre data-lang="${escapeHtml(lang)}"><code class="language-${escapeHtml(lang)}">${escapeHtml(content)}</code></pre>`;
    }
    return `<pre><code>${escapeHtml(content)}</code></pre>`;
  };

  /**
   * 渲染 Markdown
   */
  function render(content: string, options: RenderOptions = {}): RenderResult {
    // 重置状态
    usedAnchorIds.clear();
    headings = [];
    hasMath = false;
    hasMermaid = false;

    // 准备环境变量
    const env = {
      filePath: options.filePath || '',
      workspaceId: options.workspaceId
    };

    // 渲染
    let html = md.render(content, env);

    // 安全过滤
    html = sanitizeHtml(html);

    // 检测是否包含数学公式（代码块形式 + 行内/块级形式）
    const finalHasMath = hasMath || checkHasMath(content);

    return {
      html,
      headings,
      hasMath: finalHasMath,
      hasMermaid
    };
  }

  /**
   * 使用插件
   */
  function use(plugin: { name: string; install: (engine: MarkdownEngine) => void }) {
    plugin.install(engine);
  }

  const engine: MarkdownEngine = {
    render,
    use,
    md
  };

  // 安装代码高亮插件
  engine.use(codeHighlightPlugin);
  
  // 安装数学公式插件
  engine.use(mathPlugin);

  return engine;
}

// 导出单例
let engineInstance: MarkdownEngine | null = null;

export function getMarkdownEngine(): MarkdownEngine {
  if (!engineInstance) {
    engineInstance = createMarkdownEngine();
  }
  return engineInstance;
}
