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

// 全屏查看器状态
let fullscreenViewer: HTMLElement | null = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let translateX = 0;
let translateY = 0;
let scale = 1;

/**
 * 检测系统主题
 * 项目使用 'my-app-dark' 类名标记暗色模式
 */
function detectTheme(): 'light' | 'dark' {
  // 检查 document.documentElement 是否有 my-app-dark 类
  if (document.documentElement.classList.contains('my-app-dark')) return 'dark';
  // 检查是否有 data-theme 属性
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark') return 'dark';
  // 检查 prefers-color-scheme（作为后备）
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

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
      
      // 初始化配置（不设置主题，每次渲染时动态设置）
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
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
 * 创建全屏查看器
 */
function createFullscreenViewer(svgContent: string): void {
  // 如果已存在，先移除
  if (fullscreenViewer) {
    fullscreenViewer.remove();
  }

  // 重置状态
  translateX = 0;
  translateY = 0;
  scale = 1;
  
  const isDark = detectTheme() === 'dark';

  // 创建遮罩层
  fullscreenViewer = document.createElement('div');
  fullscreenViewer.className = 'mermaid-fullscreen-viewer';
  fullscreenViewer.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: ${isDark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    overflow: hidden;
  `;

  // 创建内容容器
  const contentContainer = document.createElement('div');
  contentContainer.className = 'mermaid-fullscreen-content';
  contentContainer.style.cssText = `
    transform: translate(0px, 0px) scale(1);
    transition: transform 0.1s ease-out;
    max-width: 90%;
    max-height: 90%;
    background: ${isDark ? '#1e1e1e' : '#ffffff'};
    border-radius: 12px;
    padding: 24px;
    box-shadow: 0 8px 32px ${isDark ? 'rgba(0, 0, 0, 0.5)' : 'rgba(0, 0, 0, 0.15)'};
    border: 1px solid ${isDark ? '#333333' : '#e5e5e5'};
  `;
  contentContainer.innerHTML = svgContent;

  // 创建关闭按钮
  const closeBtn = document.createElement('button');
  closeBtn.innerHTML = '✕';
  closeBtn.style.cssText = `
    position: absolute;
    top: 20px;
    right: 20px;
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
    color: ${isDark ? '#ffffff' : '#333333'};
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
    transition: background 0.2s, color 0.2s;
  `;
  closeBtn.onmouseenter = () => { 
    closeBtn.style.background = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)'; 
  };
  closeBtn.onmouseleave = () => { 
    closeBtn.style.background = isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'; 
  };
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    closeFullscreenViewer();
  };

  // 创建提示文字
  const hint = document.createElement('div');
  hint.textContent = '滚轮缩放 · 拖拽移动 · 点击空白处关闭';
  hint.style.cssText = `
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    color: ${isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(0, 0, 0, 0.5)'};
    font-size: 14px;
    pointer-events: none;
    user-select: none;
  `;

  fullscreenViewer.appendChild(contentContainer);
  fullscreenViewer.appendChild(closeBtn);
  fullscreenViewer.appendChild(hint);
  document.body.appendChild(fullscreenViewer);

  // 添加事件监听
  setupViewerEvents(fullscreenViewer, contentContainer);
}

/**
 * 设置查看器事件
 */
function setupViewerEvents(viewer: HTMLElement, content: HTMLElement): void {
  // 鼠标按下 - 开始拖拽
  viewer.addEventListener('mousedown', (e) => {
    if (e.target === viewer || e.target === content) {
      isDragging = true;
      dragStartX = e.clientX - translateX;
      dragStartY = e.clientY - translateY;
      viewer.style.cursor = 'grabbing';
    }
  });

  // 鼠标移动 - 拖拽
  window.addEventListener('mousemove', (e) => {
    if (!isDragging || !fullscreenViewer) return;
    e.preventDefault();
    translateX = e.clientX - dragStartX;
    translateY = e.clientY - dragStartY;
    updateTransform(content);
  });

  // 鼠标释放 - 结束拖拽
  window.addEventListener('mouseup', () => {
    isDragging = false;
    if (fullscreenViewer) {
      fullscreenViewer.style.cursor = 'grab';
    }
  });

  // 滚轮缩放
  viewer.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.1, Math.min(5, scale * delta));
    updateTransform(content);
  }, { passive: false });

  // 点击空白处关闭
  viewer.addEventListener('click', (e) => {
    if (e.target === viewer) {
      closeFullscreenViewer();
    }
  });

  // ESC 键关闭
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeFullscreenViewer();
      window.removeEventListener('keydown', handleKeyDown);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
}

/**
 * 更新变换
 */
function updateTransform(content: HTMLElement): void {
  content.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
}

/**
 * 关闭全屏查看器
 */
function closeFullscreenViewer(): void {
  if (fullscreenViewer) {
    fullscreenViewer.remove();
    fullscreenViewer = null;
  }
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
    content = encoded;
  }

  // 清理内容：去除首尾空白行
  const cleanContent = content.trim();
  
  // 根据当前主题动态设置
  const isDark = detectTheme() === 'dark';
  
  try {
    // 生成唯一 ID
    const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
    
    // 动态设置主题
    mermaid.initialize({
      startOnLoad: false,
      theme: isDark ? 'dark' : 'default',
      securityLevel: 'loose',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    });
    
    // 渲染
    const { svg } = await mermaid.render(id, cleanContent);
    
    // 替换内容
    element.innerHTML = svg;
    element.classList.add('mermaid-rendered');
    
    // 添加点击事件 - 全屏查看
    element.style.cursor = 'pointer';
    element.title = '点击全屏查看';
    element.addEventListener('click', () => {
      createFullscreenViewer(svg);
    });
    
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
export async function updateMermaidTheme(_isDark?: boolean): Promise<void> {
  if (!mermaid) return;
  
  // 重新渲染所有图表以应用新主题
  const containers = document.querySelectorAll('.mermaid-rendered');
  for (const container of Array.from(containers)) {
    container.classList.remove('mermaid-rendered');
    const element = container as HTMLElement;
    // 清空内容，保留 data-content
    const encoded = element.getAttribute('data-content');
    if (encoded) {
      element.innerHTML = '';
      await renderMermaid(element);
    }
  }
}

/**
 * 渲染所有未渲染的 Mermaid 图表
 */
export async function renderAllMermaid(container: HTMLElement): Promise<void> {
  const elements = container.querySelectorAll('.mermaid:not(.mermaid-rendered)');
  
  if (elements.length === 0) return;
  
  // 先加载库
  await loadMermaid();
  
  if (!mermaid) {
    console.error('[MermaidPlugin] Mermaid 库未加载');
    return;
  }
  
  // 逐个渲染
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

/**
 * 预加载常用语言
 */
export async function preloadCommonLanguages(): Promise<void> {
  const commonLangs = ['python', 'java', 'bash', 'yaml', 'sql', 'rust'];
  await Promise.all(commonLangs.map(() => Promise.resolve()));
}
