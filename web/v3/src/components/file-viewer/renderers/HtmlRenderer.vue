<script setup lang="ts">
/**
 * HTML 渲染器
 *
 * @module components/file-viewer/renderers/HtmlRenderer
 */
import { computed, inject } from 'vue';
import { ViewModeKey } from '../index';
import { fileViewerService } from '../services/fileViewerService';
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
 * 获取文件 URL
 */
const fileUrl = computed(() => {
  return fileViewerService.getRawFileUrl(props.workspaceId, props.filePath);
});
</script>

<template>
  <div class="html-renderer flex flex-col h-full bg-[var(--bg)]">
    <div class="flex-1 overflow-auto">
      <pre v-if="viewMode === 'source'" class="p-4 text-sm font-mono text-[var(--text-1)] whitespace-pre-wrap">{{ htmlContent }}</pre>
      <iframe
        v-else
        :src="fileUrl"
        class="w-full h-full border-0"
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
