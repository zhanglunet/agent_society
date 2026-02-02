<script setup lang="ts">
/**
 * HTML 渲染器
 * 
 * 支持 HTML 源码显示（出于安全考虑，不直接渲染 HTML）
 * 
 * @module components/file-viewer/renderers/HtmlRenderer
 */
import { computed, ref } from 'vue';
import { Eye, Code, Download, AlertTriangle } from 'lucide-vue-next';
import Button from 'primevue/button';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

// 状态
const viewMode = ref<'source' | 'preview'>('source');

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
 * 安全的预览 HTML（ sandboxed iframe ）
 */
const sandboxedHtml = computed(() => {
  // 添加基础样式使内容可读
  const styles = `
    <style>
      body { 
        font-family: system-ui, -apple-system, sans-serif; 
        padding: 20px; 
        line-height: 1.6;
        color: #333;
      }
      img { max-width: 100%; height: auto; }
      pre { 
        background: #f5f5f5; 
        padding: 15px; 
        overflow-x: auto;
        border-radius: 4px;
      }
      code { 
        background: #f5f5f5; 
        padding: 2px 6px; 
        border-radius: 3px;
        font-family: monospace;
      }
    </style>
  `;
  return styles + htmlContent.value;
});

/**
 * 下载
 */
const download = () => {
  const blob = new Blob([htmlContent.value], { type: 'text/html' });
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
  <div class="html-renderer flex flex-col h-full bg-[var(--bg)]">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <div class="flex items-center gap-2">
        <Button
          :variant="viewMode === 'source' ? 'primary' : 'text'"
          size="small"
          @click="viewMode = 'source'"
        >
          <Code class="w-4 h-4 mr-1" />
          源码
        </Button>
        <Button
          :variant="viewMode === 'preview' ? 'primary' : 'text'"
          size="small"
          @click="viewMode = 'preview'"
        >
          <Eye class="w-4 h-4 mr-1" />
          预览
        </Button>
      </div>
      
      <div class="flex items-center gap-2">
        <div 
          v-if="viewMode === 'preview'" 
          class="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded"
        >
          <AlertTriangle class="w-3 h-3" />
          <span>安全模式</span>
        </div>
        <Button variant="text" size="small" v-tooltip.top="'下载'" @click="download">
          <Download class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 overflow-auto">
      <!-- 源码模式 -->
      <pre v-if="viewMode === 'source'" class="p-4 text-sm font-mono text-[var(--text-1)] whitespace-pre-wrap">{{ htmlContent }}</pre>
      
      <!-- 预览模式（沙箱 iframe） -->
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
