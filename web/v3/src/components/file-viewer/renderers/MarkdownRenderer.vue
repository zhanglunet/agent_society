<script setup lang="ts">
/**
 * Markdown 渲染器
 * 
 * @module components/file-viewer/renderers/MarkdownRenderer
 */
import { computed } from 'vue';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps & { viewMode?: 'preview' | 'source' }>();

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
 * 简单的 Markdown 转 HTML
 */
const renderMarkdown = (md: string): string => {
  let html = md
    .replace(/```(\w+)?\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />')
    .replace(/^\s*[-*+]\s+(.*$)/gim, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.*$)/gim, '<li>$1</li>')
    .replace(/^>\s+(.*$)/gim, '<blockquote>$1</blockquote>')
    .replace(/^---$/gim, '<hr />')
    .replace(/\n\n/g, '</p><p>');
  
  return `<div class="markdown-content">${html}</div>`;
};

/**
 * 渲染后的 HTML
 */
const renderedHtml = computed(() => {
  return renderMarkdown(markdownContent.value);
});
</script>

<template>
  <div class="markdown-renderer flex flex-col h-full bg-[var(--bg)]">
    <div class="flex-1 overflow-auto">
      <div 
        v-if="viewMode === 'preview'" 
        class="markdown-body p-6 max-w-4xl mx-auto"
        v-html="renderedHtml"
      />
      <pre v-else class="p-4 text-sm font-mono text-[var(--text-1)] whitespace-pre-wrap">{{ markdownContent }}</pre>
    </div>
  </div>
</template>

<style scoped>
.markdown-renderer {
  width: 100%;
  height: 100%;
}

.markdown-body :deep(h1) { font-size: 2em; font-weight: bold; margin-bottom: 0.5em; color: var(--text-1); }
.markdown-body :deep(h2) { font-size: 1.5em; font-weight: bold; margin-top: 1em; margin-bottom: 0.5em; color: var(--text-1); border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
.markdown-body :deep(h3) { font-size: 1.25em; font-weight: bold; margin-top: 1em; margin-bottom: 0.5em; color: var(--text-1); }
.markdown-body :deep(p) { margin-bottom: 1em; line-height: 1.6; color: var(--text-1); }
.markdown-body :deep(code) { background: var(--surface-2); padding: 0.2em 0.4em; border-radius: 3px; font-family: monospace; font-size: 0.9em; }
.markdown-body :deep(pre) { background: var(--surface-2); padding: 1em; border-radius: 6px; overflow-x: auto; margin-bottom: 1em; }
.markdown-body :deep(pre code) { background: none; padding: 0; }
.markdown-body :deep(blockquote) { border-left: 4px solid var(--primary); padding-left: 1em; margin-left: 0; margin-bottom: 1em; color: var(--text-2); }
.markdown-body :deep(ul), .markdown-body :deep(ol) { margin-bottom: 1em; padding-left: 2em; }
.markdown-body :deep(li) { margin-bottom: 0.3em; }
.markdown-body :deep(a) { color: var(--primary); text-decoration: none; }
.markdown-body :deep(a:hover) { text-decoration: underline; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid var(--border); margin: 1.5em 0; }
.markdown-body :deep(img) { max-width: 100%; height: auto; }
.markdown-body :deep(strong) { font-weight: bold; }
.markdown-body :deep(em) { font-style: italic; }
</style>
