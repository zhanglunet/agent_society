<script setup lang="ts">
/**
 * 音频渲染器
 * 
 * 支持格式：MP3, WAV, OGG, AAC, FLAC 等
 * 
 * @module components/file-viewer/renderers/AudioRenderer
 */
import { ref, onMounted } from 'vue';
import { Music, Download, AlertCircle } from 'lucide-vue-next';
import Button from 'primevue/button';
import { fileViewerService } from '../services/fileViewerService';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

// 状态
const audioUrl = ref<string>('');
const error = ref<string | null>(null);

/**
 * 初始化音频
 */
onMounted(() => {
  // 直接使用原始文件 URL
  audioUrl.value = fileViewerService.getRawFileUrl(props.workspaceId, props.filePath);
});

/**
 * 下载
 */
const download = () => {
  fileViewerService.downloadFile(props.workspaceId, props.filePath, props.fileName);
};
</script>

<template>
  <div class="audio-renderer flex flex-col h-full bg-[var(--bg)]">
    <!-- 工具栏 -->
    <div class="flex items-center justify-end gap-2 p-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <Button variant="text" size="small" v-tooltip.top="'下载'" @click="download">
        <Download class="w-4 h-4" />
      </Button>
    </div>

    <!-- 音频显示区域 -->
    <div class="flex-1 flex flex-col items-center justify-center p-8">
      <div v-if="error" class="flex flex-col items-center text-[var(--text-3)]">
        <AlertCircle class="w-12 h-12 mb-2" />
        <p class="text-sm">{{ error }}</p>
      </div>
      
      <template v-else-if="audioUrl">
        <div class="w-24 h-24 rounded-full bg-[var(--surface-2)] flex items-center justify-center mb-6">
          <Music class="w-12 h-12 text-[var(--primary)]" />
        </div>
        
        <p class="text-lg font-medium text-[var(--text-1)] mb-2">{{ fileName }}</p>
        <p class="text-sm text-[var(--text-3)] mb-6">{{ content.mimeType }}</p>
        
        <audio
          :src="audioUrl"
          controls
          class="w-full max-w-md"
          :type="content.mimeType"
        >
          您的浏览器不支持音频播放
        </audio>
      </template>
    </div>
  </div>
</template>

<style scoped>
.audio-renderer {
  width: 100%;
  height: 100%;
}

audio {
  outline: none;
}

audio::-webkit-media-controls-panel {
  background: var(--surface-2);
}
</style>
