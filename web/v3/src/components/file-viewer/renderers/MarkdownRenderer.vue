<script setup lang="ts">
/**
 * Markdown 渲染器
 * 
 * @module components/file-viewer/renderers/MarkdownRenderer
 * 
 * 功能：
 * - Markdown 基础语法渲染（基于 markdown-it）
 * - 标题锚点生成与平滑滚动
 * - 图片点击预览
 * - 文档链接跳转（外部新窗口，内部新查看器）
 */
import { computed, inject, ref, onMounted, watch, nextTick } from 'vue';
import { ViewModeKey } from '../index';
import type { RendererProps } from '../types';
import { getMarkdownEngine } from './markdown';
import './markdown/prism-theme.css';
import './markdown/katex-theme.css';
import type { RenderResult } from './markdown';
import { renderAllMermaid } from './markdown/plugins/mermaid';
import { renderAllMath } from './markdown/plugins/math';
import { renderAllCodeBlocks } from './markdown/plugins/code-highlight';

const props = defineProps<RendererProps>();
const emit = defineEmits<{
  /** 请求打开其他文件（内部文档链接） */
  (e: 'openFile', path: string): void;
}>();

// 注入 viewMode
const injectedViewMode = inject(ViewModeKey);

// 获取当前值
const viewMode = computed(() => {
  const value = typeof injectedViewMode === 'object' && injectedViewMode !== null && 'value' in injectedViewMode
    ? injectedViewMode.value
    : injectedViewMode;
  return value;
});

// 预览容器 ref
const previewRef = ref<HTMLElement | null>(null);

// Markdown 引擎
const engine = getMarkdownEngine();

/**
 * Markdown 内容
 */
const markdownContent = computed(() => {
  if (typeof props.content.data === 'string') {
    return props.content.data;
  }
  if (props.content.data instanceof ArrayBuffer) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(props.content.data);
  }
  return '';
});

/**
 * 渲染结果
 */
const renderResult = computed<RenderResult>(() => {
  const content = markdownContent.value;
  if (!content) {
    return { html: '' };
  }

  return engine.render(content, {
    filePath: props.filePath,
    workspaceId: props.workspaceId
  });
});

/**
 * 渲染后的 HTML
 */
const renderedHtml = computed(() => {
  return renderResult.value.html;
});

/**
 * 处理点击事件
 * - 锚点链接：平滑滚动到对应位置
 * - 图片：打开大图预览
 * - 内部链接：发送 openFile 事件
 * - 外部链接：新窗口打开（已有 target="_blank"）
 */
/**
 * 处理点击事件
 * 处理锚点点击、链接点击、图片点击等
 */
const handleClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement;

  // 1. 处理锚点链接点击（标题旁的 # 或文档内的锚点链接）
  const anchorLink = target.closest('a[href^="#"]');
  if (anchorLink) {
    e.preventDefault();
    const href = anchorLink.getAttribute('href');
    if (href && href.startsWith('#')) {
      const id = href.slice(1);
      scrollToHeading(id);
    }
    return;
  }

  // 2. 处理图片点击
  const img = target.closest('img.markdown-image');
  if (img) {
    e.preventDefault();
    const src = img.getAttribute('src');
    if (src) {
      openImagePreview(src);
    }
    return;
  }

  // 3. 处理内部文档链接
  const internalLink = target.closest('a.internal-link');
  if (internalLink) {
    e.preventDefault();
    const path = internalLink.getAttribute('data-path');
    if (path) {
      emit('openFile', path);
    }
    return;
  }
};

/**
 * 平滑滚动到指定标题
 */
const scrollToHeading = (id: string) => {
  if (!previewRef.value) return;

  try {
    // 使用 CSS.escape 安全地转义 ID
    const safeId = CSS.escape ? CSS.escape(id) : id.replace(/(["\\#$%&'()*+,.\/:;<=>?@[\\]^`{|}~])/g, '\\$1');
    const element = previewRef.value.querySelector(`#${safeId}`);

    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });

      // 添加高亮效果
      element.classList.add('heading-highlight');
      setTimeout(() => {
        element.classList.remove('heading-highlight');
      }, 2000);
    }
  } catch (err) {
    console.warn('[MarkdownRenderer] 滚动到锚点失败:', err);
  }
};

/**
 * 打开图片预览
 */
const openImagePreview = (src: string) => {
  // 创建预览遮罩
  const overlay = document.createElement('div');
  overlay.className = 'image-preview-overlay';
  overlay.innerHTML = `
    <div class="image-preview-container">
      <img src="${src}" alt="预览" />
    </div>
    <button class="image-preview-close">&times;</button>
  `;

  // 样式
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    cursor: zoom-out;
  `;

  const container = overlay.querySelector('.image-preview-container') as HTMLElement;
  if (container) {
    container.style.cssText = `
      max-width: 90%;
      max-height: 90%;
    `;
  }

  const img = overlay.querySelector('img') as HTMLImageElement;
  if (img) {
    img.style.cssText = `
      max-width: 100%;
      max-height: 90vh;
      object-fit: contain;
      border-radius: 4px;
    `;
  }

  const closeBtn = overlay.querySelector('.image-preview-close') as HTMLElement;
  if (closeBtn) {
    closeBtn.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: white;
      font-size: 36px;
      cursor: pointer;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    `;
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.2)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    });
  }

  // 关闭函数
  const close = () => {
    if (overlay.parentNode) {
      document.body.removeChild(overlay);
    }
    document.removeEventListener('keydown', escHandler);
  };

  // ESC 键关闭
  const escHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
    }
  };

  // 事件绑定
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });
  closeBtn?.addEventListener('click', close);
  document.addEventListener('keydown', escHandler);

  // 添加到页面
  document.body.appendChild(overlay);
};

/**
 * 处理 URL hash 变化
 * 支持通过 URL #heading-id 直接定位
 */
const handleHashChange = () => {
  const hash = window.location.hash;
  if (hash && hash.startsWith('#')) {
    const id = hash.slice(1);
    // 延迟执行，等待渲染完成
    setTimeout(() => scrollToHeading(id), 100);
  }
};

// 监听内容变化，渲染 Mermaid 和 Math，处理 hash 定位
watch(renderedHtml, () => {
  nextTick(() => {
    if (!previewRef.value) return;
    
    // 总是尝试渲染（函数内部会检查是否有需要渲染的元素）
    renderAllMermaid(previewRef.value);
    renderAllMath(previewRef.value);
    renderAllCodeBlocks(previewRef.value);
    
    // 处理 hash 定位
    handleHashChange();
  });
});

// 监听视图模式变化，切回预览视图时重新渲染
watch(viewMode, (mode) => {
  if (mode === 'preview') {
    nextTick(() => {
      if (!previewRef.value) return;
      renderAllMermaid(previewRef.value);
      renderAllMath(previewRef.value);
      renderAllCodeBlocks(previewRef.value);
    });
  }
});

onMounted(() => {
  // 初始化渲染 Mermaid、Math 和代码高亮
  if (previewRef.value) {
    renderAllMermaid(previewRef.value);
    renderAllMath(previewRef.value);
    renderAllCodeBlocks(previewRef.value);
  }
  // 初始化 hash 定位
  handleHashChange();
});
</script>

<template>
  <div class="markdown-renderer flex flex-col h-full bg-[var(--bg)]">
    <div ref="previewRef" class="flex-1 overflow-auto">
      <div v-if="viewMode === 'preview'" class="markdown-body p-6 max-w-4xl mx-auto" v-html="renderedHtml"
        @click="handleClick" />
      <pre v-else class="p-4 text-sm font-mono text-[var(--text-1)] whitespace-pre-wrap">{{ markdownContent }}</pre>
    </div>
  </div>
</template>

<style scoped>
.markdown-renderer {
  width: 100%;
  height: 100%;
}

/* 标题样式 */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  color: var(--text-1);
  font-weight: bold;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  position: relative;
}

.markdown-body :deep(h1) {
  font-size: 2em;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.3em;
}

.markdown-body :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.3em;
}

.markdown-body :deep(h3) {
  font-size: 1.25em;
}

.markdown-body :deep(h4) {
  font-size: 1em;
}

/* 锚点链接样式 */
.markdown-body :deep(.anchor-link) {
  position: absolute;
  left: -1.2em;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-3);
  text-decoration: none;
  font-size: 0.8em;
  opacity: 0;
  transition: opacity 0.2s;
  padding: 0.2em 0.4em;
}

.markdown-body :deep(h1:hover .anchor-link),
.markdown-body :deep(h2:hover .anchor-link),
.markdown-body :deep(h3:hover .anchor-link),
.markdown-body :deep(h4:hover .anchor-link),
.markdown-body :deep(h5:hover .anchor-link),
.markdown-body :deep(h6:hover .anchor-link) {
  opacity: 1;
}

.markdown-body :deep(.anchor-link:hover) {
  color: var(--primary);
}

/* 标题高亮动画 */
.markdown-body :deep(.heading-highlight) {
  animation: highlight-pulse 2s ease;
}

@keyframes highlight-pulse {

  0%,
  100% {
    background: transparent;
  }

  20%,
  80% {
    background: var(--surface-3);
    border-radius: 4px;
  }
}

/* 段落 */
.markdown-body :deep(p) {
  margin-bottom: 1em;
  line-height: 1.6;
  color: var(--text-1);
}

/* 代码 */
.markdown-body :deep(code) {
  background: var(--surface-2);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.9em;
  color: var(--text-1);
}

.markdown-body :deep(pre) {
  background: var(--surface-2);
  padding: 1em;
  border-radius: 6px;
  overflow-x: auto;
  margin-bottom: 1em;
}

.markdown-body :deep(pre code) {
  background: none;
  padding: 0;
  font-size: 0.85em;
  line-height: 1.5;
}

/* 引用 */
.markdown-body :deep(blockquote) {
  border-left: 4px solid var(--primary);
  padding-left: 1em;
  margin-left: 0;
  margin-bottom: 1em;
  color: var(--text-2);
}

/* 列表 */
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin-bottom: 1em;
  padding-left: 2em;
  color: var(--text-1);
}

.markdown-body :deep(li) {
  margin-bottom: 0.3em;
}

.markdown-body :deep(li)>ul,
.markdown-body :deep(li)>ol {
  margin-top: 0.3em;
}

/* 链接 */
.markdown-body :deep(a) {
  color: var(--primary);
  text-decoration: none;
  cursor: pointer;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

/* 内部链接标记 */
.markdown-body :deep(a.internal-link)::after {
  content: ' ↗';
  font-size: 0.8em;
  opacity: 0.6;
}

/* 分隔线 */
.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1.5em 0;
}

/* 图片 */
.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  cursor: zoom-in;
  transition: transform 0.2s;
}

.markdown-body :deep(img:hover) {
  transform: scale(1.01);
}

/* 表格 */
.markdown-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 1em;
  color: var(--text-1);
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
  padding: 0.5em 1em;
  border: 1px solid var(--border);
}

.markdown-body :deep(th) {
  background: var(--surface-2);
  font-weight: bold;
}

.markdown-body :deep(tr:nth-child(even)) {
  background: var(--surface-1);
}

/* 强调 */
.markdown-body :deep(strong) {
  font-weight: bold;
}

.markdown-body :deep(em) {
  font-style: italic;
}

/* 删除线 */
.markdown-body :deep(del) {
  text-decoration: line-through;
  opacity: 0.7;
}

/* 注脚样式 */
.markdown-body :deep(.footnote-ref) {
  font-size: 0.8em;
  vertical-align: super;
  margin-left: 2px;
}

.markdown-body :deep(.footnote-ref) a {
  text-decoration: none;
}

.markdown-body :deep(.footnotes) {
  margin-top: 2em;
  padding-top: 1em;
  border-top: 1px solid var(--border);
  font-size: 0.9em;
}

.markdown-body :deep(.footnotes ol) {
  padding-left: 1.5em;
}

.markdown-body :deep(.footnote-backref) {
  text-decoration: none;
  margin-left: 0.5em;
}

/* 数学公式样式 */
.markdown-body :deep(.math-inline) {
  display: inline;
}

.markdown-body :deep(.math-block) {
  display: block;
  margin: 1em 0;
  overflow-x: auto;
}

/* Mermaid 图表样式 */
.markdown-body :deep(.mermaid) {
  text-align: center;
  margin: 1em 0;
  padding: 1em;
  background: var(--surface-1);
  border-radius: 8px;
  border: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
}

.markdown-body :deep(.mermaid:hover) {
  background: var(--surface-2);
  border-color: var(--border-hover);
}

.markdown-body :deep(.mermaid-rendered) {
  display: inline-block;
  background: transparent;
}

.markdown-body :deep(.mermaid-rendered svg) {
  max-width: 100%;
  height: auto;
}

.markdown-body :deep(.mermaid-error) {
  color: #d73a49;
  background: var(--surface-2);
  padding: 1em;
  border-radius: 4px;
  font-size: 0.9em;
}

/* Mermaid 全屏查看器样式 */
:deep(.mermaid-fullscreen-viewer) {
  animation: fade-in 0.2s ease;
}

:deep(.mermaid-fullscreen-content) {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

:deep(.mermaid-fullscreen-content svg) {
  max-width: 100%;
  max-height: 80vh;
  height: auto;
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
