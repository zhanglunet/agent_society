<script setup lang="ts">
/**
 * 文本渲染器
 * 
 * 用于显示纯文本文件
 * 
 * @module components/file-viewer/renderers/TextRenderer
 */
import { computed } from 'vue';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

/**
 * 文本内容
 */
const textContent = computed(() => {
  if (typeof props.content.data === 'string') {
    return props.content.data;
  }
  // 如果是 ArrayBuffer，尝试解码为文本
  if (props.content.data instanceof ArrayBuffer) {
    const decoder = new TextDecoder('utf-8');
    return decoder.decode(props.content.data);
  }
  return '';
});

/**
 * 行数
 */
const lineCount = computed(() => {
  return textContent.value.split('\n').length;
});
</script>

<template>
  <div class="text-renderer flex flex-col h-full bg-[var(--bg)]">
    <!-- 信息栏 -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <span class="text-xs text-[var(--text-3)]">{{ lineCount }} 行</span>
      <span class="text-xs text-[var(--text-3)]">{{ content.mimeType }}</span>
    </div>

    <!-- 文本内容 -->
    <div class="flex-1 overflow-auto">
      <pre class="p-4 text-sm font-mono text-[var(--text-1)] whitespace-pre-wrap break-all">{{ textContent }}</pre>
    </div>
  </div>
</template>

<style scoped>
.text-renderer {
  width: 100%;
  height: 100%;
}

pre {
  min-height: 100%;
  line-height: 1.6;
}
</style>
