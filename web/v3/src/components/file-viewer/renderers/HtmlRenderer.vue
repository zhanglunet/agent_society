<script setup lang="ts">
/**
 * HTML 渲染器
 * 
 * @module components/file-viewer/renderers/HtmlRenderer
 */
import { computed, inject } from 'vue';
import { AlertTriangle } from 'lucide-vue-next';
import { ViewModeKey } from '../index';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

// 注入 viewMode - 这是一个 Ref
const injectedViewMode = inject(ViewModeKey);
// 获取当前值（如果不是 ref 则返回本身）
const viewMode = computed(() => {
  return typeof injectedViewMode === 'object' && injectedViewMode !== null && 'value' in injectedViewMode
    ? injectedViewMode.value
    : injectedViewMode;
});

/**
 * HTML 内容
 */
const htmlContent = computed(() => {
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
 * 安全的预览 HTML
 */
const sandboxedHtml = computed(() => {
  const styles = `
    <style>
      body { font-family: system-ui, -apple-system, sans-serif; padding: 20px; line-height: 1.6; color: #333; }
      img { max-width: 100%; height: auto; }
      pre { background: #f5f5f5; padding: 15px; overflow-x: auto; border-radius: 4px; }
      code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
    </style>
  `;
  return styles + htmlContent.value;
});
</script>

<template>
  <div class="html-renderer flex flex-col h-full bg-[var(--bg)] relative">
    <div 
      v-if="viewMode === 'preview'" 
      class="absolute bottom-3 left-3 z-10 flex items-center gap-1 text-xs text-amber-600 bg-amber-50/90 px-2 py-1 rounded-full"
    >
      <AlertTriangle class="w-3 h-3" />
      <span>沙箱模式</span>
    </div>

    <div class="flex-1 overflow-auto">
      <pre v-if="viewMode === 'source'" class="p-4 text-sm font-mono text-[var(--text-1)] whitespace-pre-wrap">{{ htmlContent }}</pre>
      <iframe
        v-else
        :srcdoc="sandboxedHtml"
        class="w-full h-full border-0"
        sandbox="allow-scripts"
        title="HTML Preview"
      />
    </div>
  </div>
</template>

<style scoped>
.html-renderer {
  width: 100%;
  height: 100%;
}

pre {
  margin: 0;
  min-height: 100%;
  line-height: 1.6;
}

iframe {
  background: white;
}
</style>
