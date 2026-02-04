/**
 * Mermaid 图表插件
 * 
 * @module components/file-viewer/renderers/markdown/plugins/mermaid
 */

import type { MarkdownEngine } from '../engine';

// Mermaid 动态导入
let mermaid: any = null;
let mermaidLoaded = false;
let mermaidLoading: Promise<void> | null = null;

/**
 * 加载 Mermaid 库
 */
async function loadMermaid(): Promise<void> {
  if (mermaidLoaded) return;
  if (mermaidLoading) return mermaidLoading;

  mermaidLoading = (async () => {
    try {
      const m = await import('mermaid');
      mermaid = m.default;
      
      // 初始化配置
      mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      });
      
      mermaidLoaded = true;
      console.log('[MermaidPlugin] 加载成功');
    } catch (err) {
      console.error('[MermaidPlugin] 加载失败:', err);
    }
  })();

  return mermaidLoading;
}

/**
 * 渲染 Mermaid 图表
 */
async function renderMermaid(element: HTMLElement): Promise<void> {
  if (!mermaid) {
    await loadMermaid();
  }
  
  if (!mermaid) {
    element.innerHTML = '<div class="mermaid-error">图表库加载失败</div>';
    return;
  }

  const encoded = element.getAttribute('data-content');
  if (!encoded) {
    console.warn('[MermaidPlugin] 元素缺少 data-content 属性');
    return;
  }

  // 解码 base64 内容
  let content: string;
  try {
    content = decodeURIComponent(escape(window.atob(encoded)));
  } catch (e) {
    // 兼容旧格式（未编码的内容）
    content = encoded;
  }

  // 清理内容：去除首尾空白行
  const cleanContent = content.trim();
  
  console.log('[MermaidPlugin] 渲染图表:', cleanContent.substring(0, 50) + '...');

  try {
    // 生成唯一 ID
    const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
    
    // 渲染
    const { svg } = await mermaid.render(id, cleanContent);
    
    // 替换内容
    element.innerHTML = svg;
    element.classList.add('mermaid-rendered');
    console.log('[MermaidPlugin] 渲染成功');
  } catch (err) {
    console.error('[MermaidPlugin] 渲染失败:', err);
    element.innerHTML = `<div class="mermaid-error">
      <div>图表语法错误</div>
      <pre style="font-size: 12px; margin-top: 8px; opacity: 0.7;">${escapeHtml(cleanContent.substring(0, 200))}</pre>
    </div>`;
  }
}

/**
 * 转义 HTML
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 更新 Mermaid 主题
 */
export async function updateMermaidTheme(isDark: boolean): Promise<void> {
  if (!mermaid) return;
  
  mermaid.initialize({
    theme: isDark ? 'dark' : 'default'
  });
}

/**
 * 渲染所有未渲染的 Mermaid 图表
 */
export async function renderAllMermaid(container: HTMLElement): Promise<void> {
  const elements = container.querySelectorAll('.mermaid:not(.mermaid-rendered)');
  
  console.log('[MermaidPlugin] 找到图表元素:', elements.length);
  
  if (elements.length === 0) return;
  
  // 先加载库
  await loadMermaid();
  
  if (!mermaid) {
    console.error('[MermaidPlugin] Mermaid 库未加载');
    return;
  }
  
  // 逐个渲染（避免并发问题）
  for (const el of Array.from(elements)) {
    await renderMermaid(el as HTMLElement);
  }
}

/**
 * Mermaid 插件
 */
export const mermaidPlugin = {
  name: 'mermaid',
  
  install(engine: MarkdownEngine) {
    // 在渲染后处理 Mermaid
    const originalRender = engine.render;
    
    engine.render = function(content: string, options?: any) {
      const result = originalRender.call(this, content, options);
      
      // 如果有 Mermaid，标记需要渲染
      if (result.html.includes('class="mermaid"')) {
        result.hasMermaid = true;
      }
      
      return result;
    };
  }
};
