<script setup lang="ts">
/**
 * 文件查看器自定义标题栏
 * 
 * 包含：文件名 | 类型·大小 | [预览|源码] | 下载 | 全屏 | 关闭
 */
import { computed } from 'vue';
import type { Ref } from 'vue';
import { X, Download, Maximize2, Minimize2, Eye, Code } from 'lucide-vue-next';
import Button from 'primevue/button';
import { fileViewerService } from './services/fileViewerService';

const props = defineProps<{
  fileName: string;
  workspaceId: string;
  filePath: string;
  mimeType?: string;
  size?: number;
  hasViewMode?: boolean;
  viewMode?: Ref<'preview' | 'source'>;
  maximized?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'maximize'): void;
}>();

// 当前 viewMode 值
const currentMode = computed(() => props.viewMode?.value ?? 'preview');

// 设置 viewMode
const setPreview = () => {
  console.log('[FileViewerHeader] setPreview called, props.viewMode:', props.viewMode);
  if (props.viewMode) {
    console.log('[FileViewerHeader] Before set, current value:', props.viewMode.value);
    props.viewMode.value = 'preview';
    console.log('[FileViewerHeader] After set, new value:', props.viewMode.value);
  }
};
const setSource = () => {
  console.log('[FileViewerHeader] setSource called, props.viewMode:', props.viewMode);
  if (props.viewMode) {
    console.log('[FileViewerHeader] Before set, current value:', props.viewMode.value);
    props.viewMode.value = 'source';
    console.log('[FileViewerHeader] After set, new value:', props.viewMode.value);
  }
};

const isDownloadable = computed(() => {
  if (!props.mimeType) return true;
  return props.mimeType !== 'text/html' && !props.mimeType.startsWith('text/html');
});

const formatSize = (size?: number) => {
  if (!size) return '';
  return fileViewerService.formatFileSize(size);
};

const downloadFile = () => {
  fileViewerService.downloadFile(props.workspaceId, props.filePath, props.fileName);
};

const handleMaximize = () => {
  emit('maximize');
};

const handleClose = () => {
  emit('close');
};
</script>

<template>
  <div class="flex items-center justify-between w-full px-2">
    <!-- 左侧：文件名 | 类型·大小 -->
    <div class="flex items-center gap-2 min-w-0 flex-1">
      <span class="font-medium text-sm truncate" :title="fileName">
        {{ fileName }}
      </span>
      <span v-if="mimeType" class="text-xs text-[var(--text-3)]">
        {{ mimeType }} · {{ formatSize(size) }}
      </span>
    </div>
    
    <!-- 右侧按钮组 -->
    <div class="flex items-center gap-0.5 shrink-0">
      <!-- 预览/源码切换 -->
      <div v-if="hasViewMode && viewMode" class="flex items-center gap-0.5 mr-2">
        <Button
          :variant="currentMode === 'preview' ? 'primary' : 'text'"
          size="small"
          class="!px-2 !py-1"
          @click="setPreview"
        >
          <Eye class="w-3.5 h-3.5 mr-1" />
          预览
        </Button>
        <Button
          :variant="currentMode === 'source' ? 'primary' : 'text'"
          size="small"
          class="!px-2 !py-1"
          @click="setSource"
        >
          <Code class="w-3.5 h-3.5 mr-1" />
          源码
        </Button>
      </div>
      
      <!-- 下载 -->
      <Button
        v-if="isDownloadable"
        variant="text"
        size="small"
        @click="downloadFile"
        class="!w-8 !h-8"
        v-tooltip.bottom="'下载'"
      >
        <Download class="w-4 h-4" />
      </Button>
      
      <!-- 全屏 -->
      <Button
        variant="text"
        size="small"
        @click="handleMaximize"
        class="!w-8 !h-8"
        v-tooltip.bottom="maximized ? '还原' : '全屏'"
      >
        <Minimize2 v-if="maximized" class="w-4 h-4" />
        <Maximize2 v-else class="w-4 h-4" />
      </Button>
      
      <!-- 关闭 -->
      <Button
        variant="text"
        size="small"
        @click="handleClose"
        class="!w-8 !h-8"
        v-tooltip.bottom="'关闭'"
      >
        <X class="w-4 h-4" />
      </Button>
    </div>
  </div>
</template>
