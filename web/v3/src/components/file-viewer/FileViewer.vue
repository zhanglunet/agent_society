<script setup lang="ts">
/**
 * 文件内容查看器组件
 * 
 * 功能：独立存在的文件查看器，支持多种文件格式的预览
 * 设计原则：
 * 1. 完全独立，不与任何现有模块耦合
 * 2. 通过 MIME 类型自动选择渲染方式
 * 3. 模块化架构，易于扩展新的文件类型支持
 * 4. 统一的错误处理和加载状态
 * 
 * 支持的文件类型：
 * - 图片: image/* (png, jpg, gif, svg, webp等)
 * - 视频: video/* (mp4, webm, ogg等)
 * - 音频: audio/* (mp3, wav, ogg等)
 * - 文本: text/* (txt, html, css, js等)
 * - Markdown: text/markdown
 * - JSON: application/json
 * - PDF: application/pdf
 * 
 * @module components/file-viewer/FileViewer
 */
import { ref, computed, onMounted, shallowRef, inject } from 'vue';
import Button from 'primevue/button';
import { X, Download, FileText, AlertCircle, Loader2 } from 'lucide-vue-next';
import { fileViewerService } from './services/fileViewerService';
import { mimeTypeRegistry } from './mimeTypeRegistry';
import type { FileViewerOptions, FileContent } from './types';

// 注入 Dialog 数据
const dialogRef = inject<any>('dialogRef');

// 从 dialog 获取数据或使用 props
const getDialogData = () => {
  if (dialogRef?.value?.data) {
    return {
      workspaceId: dialogRef.value.data.workspaceId,
      filePath: dialogRef.value.data.filePath,
      options: dialogRef.value.data.options
    };
  }
  return null;
};

// 组件属性
const props = defineProps<{
  /** 工作区ID */
  workspaceId?: string;
  /** 文件路径 */
  filePath?: string;
  /** 可选配置 */
  options?: FileViewerOptions;
}>();

// 获取实际的数据（优先从 dialog 获取）
const actualData = computed(() => {
  const dialogData = getDialogData();
  return {
    workspaceId: dialogData?.workspaceId || props.workspaceId || '',
    filePath: dialogData?.filePath || props.filePath || '',
    options: dialogData?.options || props.options
  };
});

// 事件
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'error', error: Error): void;
}>();

// 组件状态
const loading = ref(false);
const error = ref<string | null>(null);
const fileContent = ref<FileContent | null>(null);

// 动态加载的渲染器组件
const rendererComponent = shallowRef<any>(null);

// 计算文件信息
const fileName = computed(() => {
  const path = actualData.value.filePath;
  if (!path) return '';
  return path.split('/').pop() || path;
});

const fileExtension = computed(() => {
  const path = actualData.value.filePath;
  if (!path) return '';
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
});

// 是否可下载
const isDownloadable = computed(() => {
  return fileContent.value?.mimeType !== 'text/html' && 
         !fileContent.value?.mimeType.startsWith('text/html');
});

/**
 * 加载文件内容
 */
const loadFile = async () => {
  loading.value = true;
  error.value = null;
  
  const { workspaceId, filePath } = actualData.value;
  
  if (!workspaceId || !filePath) {
    error.value = '缺少必要参数：workspaceId 或 filePath';
    loading.value = false;
    return;
  }
  
  try {
    // 获取文件内容
    const content = await fileViewerService.getFile(workspaceId, filePath);
    fileContent.value = content;
    
    // 根据 MIME 类型获取渲染器
    const renderer = mimeTypeRegistry.getRenderer(content.mimeType, fileExtension.value);
    rendererComponent.value = renderer;
    
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载文件失败';
    emit('error', err instanceof Error ? err : new Error(String(err)));
  } finally {
    loading.value = false;
  }
};

/**
 * 下载文件
 */
const downloadFile = () => {
  if (!fileContent.value) return;
  const { workspaceId, filePath } = actualData.value;
  if (!workspaceId || !filePath) return;
  fileViewerService.downloadFile(workspaceId, filePath, fileName.value);
};

/**
 * 获取文件图标
 */
const getFileIcon = () => {
  if (!fileContent.value) return FileText;
  return mimeTypeRegistry.getFileIcon(fileContent.value.mimeType, fileExtension.value || '');
};

// 组件挂载时加载文件
onMounted(() => {
  loadFile();
});
</script>

<template>
  <div class="file-viewer flex flex-col h-full bg-[var(--surface-1)] text-[var(--text-1)]">
    <!-- 头部工具栏 -->
    <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <div class="flex items-center gap-3 min-w-0">
        <component 
          :is="getFileIcon()" 
          class="w-5 h-5 text-[var(--primary)] shrink-0" 
        />
        <div class="min-w-0">
          <h3 class="font-medium text-sm truncate" :title="fileName">
            {{ fileName }}
          </h3>
          <p v-if="fileContent" class="text-xs text-[var(--text-3)]">
            {{ fileContent.mimeType }} · {{ fileViewerService.formatFileSize(fileContent.size) }}
          </p>
        </div>
      </div>
      
      <div class="flex items-center gap-2 shrink-0">
        <!-- 下载按钮 -->
        <Button
          v-if="isDownloadable"
          variant="text"
          size="small"
          v-tooltip.top="'下载文件'"
          @click="downloadFile"
        >
          <Download class="w-4 h-4" />
        </Button>
        
        <!-- 关闭按钮 -->
        <Button
          variant="text"
          size="small"
          v-tooltip.top="'关闭'"
          @click="emit('close')"
        >
          <X class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- 内容区域 -->
    <div class="flex-1 overflow-hidden relative">
      <!-- 加载状态 -->
      <div 
        v-if="loading" 
        class="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg)]"
      >
        <Loader2 class="w-10 h-10 animate-spin text-[var(--primary)] mb-3" />
        <p class="text-sm text-[var(--text-3)]">加载中...</p>
      </div>

      <!-- 错误状态 -->
      <div 
        v-else-if="error" 
        class="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg)] p-8"
      >
        <AlertCircle class="w-12 h-12 text-red-500 mb-3" />
        <p class="text-sm text-[var(--text-1)] mb-1">加载失败</p>
        <p class="text-xs text-[var(--text-3)] text-center max-w-md">{{ error }}</p>
        <Button 
          variant="text" 
          size="small" 
          class="mt-4"
          @click="loadFile"
        >
          重试
        </Button>
      </div>

      <!-- 文件内容渲染 -->
      <component
        v-else-if="rendererComponent && fileContent"
        :is="rendererComponent"
        :content="fileContent"
        :file-name="fileName"
        :file-path="actualData.filePath"
        :workspace-id="actualData.workspaceId"
        class="h-full"
      />

      <!-- 不支持的文件类型 -->
      <div 
        v-else 
        class="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg)] p-8"
      >
        <FileText class="w-12 h-12 text-[var(--text-3)] mb-3" />
        <p class="text-sm text-[var(--text-1)] mb-1">不支持的文件类型</p>
        <p class="text-xs text-[var(--text-3)] text-center">
          该文件类型暂不支持预览，请下载后查看
        </p>
        <Button 
          variant="primary" 
          size="small" 
          class="mt-4"
          @click="downloadFile"
        >
          <Download class="w-4 h-4 mr-2" />
          下载文件
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-viewer {
  /* 确保在全屏模式下也能正常工作 */
  width: 100%;
  height: 100%;
}
</style>
