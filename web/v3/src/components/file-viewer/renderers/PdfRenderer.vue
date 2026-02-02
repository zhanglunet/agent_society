<script setup lang="ts">
/**
 * PDF 渲染器
 * 
 * 使用浏览器原生 PDF 查看器或提供下载
 * 
 * @module components/file-viewer/renderers/PdfRenderer
 */
import { ref, onMounted } from 'vue';
import { Download, ExternalLink, FileText } from 'lucide-vue-next';
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
 * 下载
 */
const download = () => {
  fileViewerService.downloadFile(props.workspaceId, props.filePath, props.fileName);
};

/**
 * 在新标签页打开
 */
const openInNewTab = () => {
  if (!pdfUrl.value) return;
  window.open(pdfUrl.value, '_blank');
};
</script>

<template>
  <div class="pdf-renderer flex flex-col h-full bg-[var(--bg)]">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <div class="flex items-center gap-2">
        <FileText class="w-4 h-4 text-red-500" />
        <span class="text-sm text-[var(--text-1)]">PDF 文档</span>
      </div>
      
      <div class="flex items-center gap-2">
        <Button variant="text" size="small" v-tooltip.top="'新标签页打开'" @click="openInNewTab">
          <ExternalLink class="w-4 h-4" />
        </Button>
        <Button variant="text" size="small" v-tooltip.top="'下载'" @click="download">
          <Download class="w-4 h-4" />
        </Button>
      </div>
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
        <p class="text-sm mb-4">无法显示 PDF 预览</p>
        <Button variant="primary" size="small" @click="download">
          <Download class="w-4 h-4 mr-2" />
          下载查看
        </Button>
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
