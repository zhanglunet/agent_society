<script setup lang="ts">
/**
 * Markdown 渲染器
 * 
 * 支持 Markdown 文档预览
 * 
 * @module components/file-viewer/renderers/MarkdownRenderer
 */
import { computed, ref } from 'vue';
import { Eye, Code, Download } from 'lucide-vue-next';
import Button from 'primevue/button';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

// 状态
const viewMode = ref<'preview' | 'source'>('preview');

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
 * 简单的 Markdown 转 HTML（生产环境建议使用 marked 库）
 */
const renderMarkdown = (md: string): string => {
  let html = md
    // 代码块
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // 标题
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    // 粗体
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    // 斜体
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    // 链接
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    // 图片
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
    // 无序列表
    .replace(/^\s*[-*+]\s+(.*$)/gim, '<li>$1</li>')
    // 有序列表
    .replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>')
    // 引用
    .replace(/^>\s+(.*$)/gim, '<blockquote>$1</blockquote>')
    // 水平线
    .replace(/^---$/gim, '<hr />')
    // 段落
    .replace(/\n\n/g, '</p><p>');
  
  return `<div class="markdown-content">${html}</div>`;
};

/**
 * 渲染后的 HTML
 */
const renderedHtml = computed(() => {
  return renderMarkdown(markdownContent.value);
});

/**
 * 下载
 */
const download = () => {
  const blob = new Blob([markdownContent.value], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = props.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
</script>

<template>
  <div class="markdown-renderer flex flex-col h-full bg-[var(--bg)]">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <div class="flex items-center gap-2">
        <Button
          :variant="viewMode === 'preview' ? 'primary' : 'text'"
          size="small"
          @click="viewMode = 'preview'"
        >
          <Eye class="w-4 h-4 mr-1" />
          预览
        </Button>
        <Button
          :variant="viewMode === 'source' ? 'primary' : 'text'"
          size="small"
          @click="viewMode = 'source'"
        >
          <Code class="w-4 h-4 mr-1" />
          源码
        </Button>
      </div>
      
      <Button variant="text" size="small" v-tooltip.top="'下载'" @click="download">
        <Download class="w-4 h-4" />
      </Button>
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 overflow-auto">
      <!-- 预览模式 -->
      <div 
        v-if="viewMode === 'preview'" 
        class="markdown-body p-6 max-w-4xl mx-auto"
        v-html="renderedHtml"
      />
      
      <!-- 源码模式 -->
      <pre v-else class="p-4 text-sm font-mono text-[var(--text-1)] whitespace-pre-wrap">{{ markdownContent }}</pre>
    </div>
  </div>
</template>

<style scoped>
.markdown-renderer {
  width: 100%;
  height: 100%;
}

.markdown-body :deep(h1) {
  font-size: 2em;
  font-weight: bold;
  margin-bottom: 0.5em;
  color: var(--text-1);
}

.markdown-body :deep(h2) {
  font-size: 1.5em;
  font-weight: bold;
  margin-top: 1em;
  margin-bottom: 0.5em;
  color: var(--text-1);
  border-bottom: 1px solid var(--border);
  padding-bottom: 0.3em;
}

.markdown-body :deep(h3) {
  font-size: 1.25em;
  font-weight: bold;
  margin-top: 1em;
  margin-bottom: 0.5em;
  color: var(--text-1);
}

.markdown-body :deep(p) {
  margin-bottom: 1em;
  line-height: 1.6;
  color: var(--text-1);
}

.markdown-body :deep(code) {
  background: var(--surface-2);
  padding: 0.2em 0.4em;
  border-radius: 3px;
  font-family: monospace;
  font-size: 0.9em;
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
}

.markdown-body :deep(blockquote) {
  border-left: 4px solid var(--primary);
  padding-left: 1em;
  margin-left: 0;
  margin-bottom: 1em;
  color: var(--text-2);
}

.markdown-body :deep(ul), .markdown-body :deep(ol) {
  margin-bottom: 1em;
  padding-left: 2em;
}

.markdown-body :deep(li) {
  margin-bottom: 0.3em;
}

.markdown-body :deep(a) {
  color: var(--primary);
  text-decoration: none;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

.markdown-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--border);
  margin: 1.5em 0;
}

.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
}

.markdown-body :deep(strong) {
  font-weight: bold;
}

.markdown-body :deep(em) {
  font-style: italic;
}
</style>
