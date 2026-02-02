<script setup lang="ts">
/**
 * 文件内容查看器组件
 * 
 * @module components/file-viewer/FileViewer
 */
import { ref, computed, onMounted, shallowRef, inject, type Ref } from 'vue';
import { AlertCircle, Loader2 } from 'lucide-vue-next';
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
      fileName: dialogRef.value.data.fileName,
      viewMode: dialogRef.value.data.viewMode as Ref<'preview' | 'source'> | undefined,
      options: dialogRef.value.data.options
    };
  }
  return null;
};

// 组件属性
const props = defineProps<{
  workspaceId?: string;
  filePath?: string;
  options?: FileViewerOptions;
}>();

// 获取实际的数据（优先从 dialog 获取）
const actualData = computed(() => {
  const dialogData = getDialogData();
  return {
    workspaceId: dialogData?.workspaceId || props.workspaceId || '',
    filePath: dialogData?.filePath || props.filePath || '',
    fileName: dialogData?.fileName || '',
    viewMode: dialogData?.viewMode,
    options: dialogData?.options || props.options
  };
});

// 组件状态
const loading = ref(false);
const error = ref<string | null>(null);
const fileContent = ref<FileContent | null>(null);
const rendererComponent = shallowRef<any>(null);

// 文件扩展名
const fileExtension = computed(() => {
  const path = actualData.value.filePath;
  if (!path) return '';
  const parts = path.split('.');
  return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
});

/**
 * 加载文件内容
 */
const loadFile = async () => {
  loading.value = true;
  error.value = null;
  
  const { workspaceId, filePath } = actualData.value;
  
  if (!workspaceId || !filePath) {
    error.value = '缺少必要参数';
    loading.value = false;
    return;
  }
  
  try {
    const content = await fileViewerService.getFile(workspaceId, filePath);
    fileContent.value = content;
    const renderer = mimeTypeRegistry.getRenderer(content.mimeType, fileExtension.value);
    rendererComponent.value = renderer;
  } catch (err) {
    error.value = err instanceof Error ? err.message : '加载文件失败';
  } finally {
    loading.value = false;
  }
};

// 组件挂载时加载文件
onMounted(() => {
  loadFile();
});
</script>

<template>
  <div class="file-viewer flex flex-col h-full bg-[var(--surface-1)] text-[var(--text-1)]">
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
        <p class="text-sm text-[var(--text-1)]">{{ error }}</p>
      </div>

      <!-- 文件内容渲染 -->
      <component
        v-else-if="rendererComponent && fileContent"
        :is="rendererComponent"
        :content="fileContent"
        :file-name="actualData.fileName"
        :file-path="actualData.filePath"
        :workspace-id="actualData.workspaceId"
        :view-mode="actualData.viewMode?.value || 'preview'"
        class="h-full"
      />

      <!-- 不支持的文件类型 -->
      <div 
        v-else 
        class="absolute inset-0 flex flex-col items-center justify-center bg-[var(--bg)] p-8"
      >
        <AlertCircle class="w-12 h-12 text-[var(--text-3)] mb-3" />
        <p class="text-sm text-[var(--text-1)]">不支持的文件类型</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.file-viewer {
  width: 100%;
  height: 100%;
}
</style>
