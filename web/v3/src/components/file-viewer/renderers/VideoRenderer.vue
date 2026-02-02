<script setup lang="ts">
/**
 * 视频渲染器
 * 
 * 支持格式：MP4, WebM, OGG, MOV 等
 * 
 * @module components/file-viewer/renderers/VideoRenderer
 */
import { ref, onMounted } from 'vue';
import { Download, AlertCircle } from 'lucide-vue-next';
import Button from 'primevue/button';
import { fileViewerService } from '../services/fileViewerService';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

// 状态
const videoUrl = ref<string>('');
const error = ref<string | null>(null);

/**
 * 初始化视频
 */
onMounted(() => {
  // 直接使用原始文件 URL
  videoUrl.value = fileViewerService.getRawFileUrl(props.workspaceId, props.filePath);
});

/**
 * 下载
 */
const download = () => {
  fileViewerService.downloadFile(props.workspaceId, props.filePath, props.fileName);
};
</script>

<template>
  <div class="video-renderer flex flex-col h-full bg-[var(--bg)]">
    <!-- 工具栏 -->
    <div class="flex items-center justify-end gap-2 p-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <Button variant="text" size="small" v-tooltip.top="'下载'" @click="download">
        <Download class="w-4 h-4" />
      </Button>
    </div>

    <!-- 视频显示区域 -->
    <div class="flex-1 overflow-auto flex items-center justify-center p-4">
      <div v-if="error" class="flex flex-col items-center text-[var(--text-3)]">
        <AlertCircle class="w-12 h-12 mb-2" />
        <p class="text-sm">{{ error }}</p>
      </div>
      
      <video
        v-else-if="videoUrl"
        :src="videoUrl"
        controls
        class="max-w-full max-h-full rounded-lg shadow-lg"
        :type="content.mimeType"
      >
        您的浏览器不支持视频播放
      </video>
    </div>
  </div>
</template>

<style scoped>
.video-renderer {
  width: 100%;
  height: 100%;
}

video {
  background: #000;
}
</style>
