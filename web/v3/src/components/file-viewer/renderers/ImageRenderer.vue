<script setup lang="ts">
/**
 * 图片渲染器
 * 
 * 支持格式：PNG, JPG, GIF, WebP, SVG, BMP, ICO 等
 * 
 * @module components/file-viewer/renderers/ImageRenderer
 */
import { ref, computed, onMounted } from 'vue';
import { ZoomIn, ZoomOut, RotateCcw, AlertCircle } from 'lucide-vue-next';
import Button from 'primevue/button';
import { fileViewerService } from '../services/fileViewerService';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

// 状态
const scale = ref(1);
const rotation = ref(0);
const imageUrl = ref<string>('');
const loading = ref(true);
const error = ref<string | null>(null);

/**
 * 初始化图片
 */
onMounted(() => {
  // 直接使用原始文件 URL
  imageUrl.value = fileViewerService.getRawFileUrl(props.workspaceId, props.filePath);
  loading.value = false;
});

/**
 * 缩放
 */
const zoom = (delta: number) => {
  const newScale = scale.value + delta;
  if (newScale >= 0.1 && newScale <= 5) {
    scale.value = newScale;
  }
};

/**
 * 旋转
 */
const rotate = () => {
  rotation.value = (rotation.value + 90) % 360;
};

/**
 * 重置
 */
const reset = () => {
  scale.value = 1;
  rotation.value = 0;
};

/**
 * 获取图片样式
 */
const imageStyle = computed(() => ({
  transform: `scale(${scale.value}) rotate(${rotation.value}deg)`,
  transition: 'transform 0.2s ease',
  maxWidth: '100%',
  maxHeight: '100%'
}));
</script>

<template>
  <div class="image-renderer flex flex-col h-full bg-[var(--bg)] relative">
    <!-- 悬浮工具栏 -->
    <div class="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 px-3 py-1.5 rounded-full bg-[var(--surface-1)]/90 backdrop-blur shadow-lg border border-[var(--border)]">
      <Button variant="text" size="small" v-tooltip.bottom="'缩小'" @click="zoom(-0.2)">
        <ZoomOut class="w-4 h-4" />
      </Button>
      <span class="text-xs text-[var(--text-3)] min-w-[50px] text-center">
        {{ Math.round(scale * 100) }}%
      </span>
      <Button variant="text" size="small" v-tooltip.bottom="'放大'" @click="zoom(0.2)">
        <ZoomIn class="w-4 h-4" />
      </Button>
      <div class="w-px h-3 bg-[var(--border)] mx-1" />
      <Button variant="text" size="small" v-tooltip.bottom="'旋转'" @click="rotate">
        <RotateCcw class="w-4 h-4" />
      </Button>
      <Button variant="text" size="small" v-tooltip.bottom="'重置'" @click="reset">
        <span class="text-xs">重置</span>
      </Button>
    </div>

    <!-- 图片显示区域 -->
    <div class="flex-1 overflow-auto flex items-center justify-center p-4">
      <div v-if="loading" class="flex items-center justify-center">
        <div class="animate-spin w-8 h-8 border-2 border-[var(--primary)] border-t-transparent rounded-full" />
      </div>
      
      <div v-else-if="error" class="flex flex-col items-center text-[var(--text-3)]">
        <AlertCircle class="w-12 h-12 mb-2" />
        <p class="text-sm">{{ error }}</p>
      </div>
      
      <img
        v-else
        :src="imageUrl"
        :alt="fileName"
        class="object-contain"
        :style="imageStyle"
        @load="loading = false"
        @error="error = '图片加载失败'"
      />
    </div>
  </div>
</template>

<style scoped>
.image-renderer {
  width: 100%;
  height: 100%;
}

img {
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
}
</style>
