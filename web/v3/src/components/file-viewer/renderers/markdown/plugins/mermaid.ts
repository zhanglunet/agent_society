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
        securityLevel: 'strict',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      });
      
      mermaidLoaded = true;
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
    element.innerHTML = '<div class="mermaid-error">图表加载失败</div>';
    return;
  }

  const content = element.getAttribute('data-content');
  if (!content) return;

  try {
    // 生成唯一 ID
    const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
    
    // 渲染
    const { svg } = await mermaid.render(id, content);
    
    // 替换内容
    element.innerHTML = svg;
    element.classList.add('mermaid-rendered');
  } catch (err) {
    console.error('[MermaidPlugin] 渲染失败:', err);
    element.innerHTML = `<div class="mermaid-error">
      <div>图表语法错误</div>
      <pre style="font-size: 12px; margin-top: 8px; opacity: 0.7;">${escapeHtml(content.substring(0, 200))}</pre>
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
  
  if (elements.length === 0) return;
  
  // 先加载库
  await loadMermaid();
  
  // 并行渲染
  const promises = Array.from(elements).map(el => renderMermaid(el as HTMLElement));
  await Promise.all(promises);
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
