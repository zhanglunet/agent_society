<script setup lang="ts">
/**
 * PDF 渲染器
 * 
 * 使用浏览器原生 PDF 查看器或提供下载
 * 
 * @module components/file-viewer/renderers/PdfRenderer
 */
import { ref, onMounted } from 'vue';
import { ExternalLink, FileText } from 'lucide-vue-next';
import Button from 'primevue/button';
import { fileViewerService } from '../services/fileViewerService';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

// 状态
const pdfUrl = ref<string>('');

/**
 * 初始化 PDF
 */
onMounted(() => {
  // 直接使用原始文件 URL
  pdfUrl.value = fileViewerService.getRawFileUrl(props.workspaceId, props.filePath);
});

/**
 * 在新标签页打开
 */
const openInNewTab = () => {
  if (!pdfUrl.value) return;
  window.open(pdfUrl.value, '_blank');
};
</script>

<template>
  <div class="pdf-renderer flex flex-col h-full bg-[var(--bg)] relative">
    <!-- 悬浮新标签页打开按钮 -->
    <div class="absolute top-3 right-3 z-10">
      <Button 
        variant="text" 
        size="small" 
        v-tooltip.bottom="'新标签页打开'" 
        @click="openInNewTab"
        class="bg-[var(--surface-1)]/80 backdrop-blur"
      >
        <ExternalLink class="w-4 h-4" />
      </Button>
    </div>

    <!-- PDF 显示区域 -->
    <div class="flex-1 overflow-hidden">
      <iframe
        v-if="pdfUrl"
        :src="pdfUrl"
        class="w-full h-full border-0"
        type="application/pdf"
        title="PDF Viewer"
      />
      
      <!-- 备用提示（当 iframe 不支持 PDF 时） -->
      <div 
        v-else 
        class="flex flex-col items-center justify-center h-full text-[var(--text-3)]"
      >
        <FileText class="w-16 h-16 mb-4" />
        <p class="text-sm">无法显示 PDF 预览</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pdf-renderer {
  width: 100%;
  height: 100%;
}

iframe {
  background: #525659; /* PDF.js 默认背景色 */
}
</style>
