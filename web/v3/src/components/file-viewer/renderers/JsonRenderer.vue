<script setup lang="ts">
/**
 * JSON 渲染器
 * 
 * 支持 JSON 格式化显示和折叠
 * 
 * @module components/file-viewer/renderers/JsonRenderer
 */
import { computed, ref } from 'vue';
import { Copy, Check } from 'lucide-vue-next';
import Button from 'primevue/button';
import type { RendererProps } from '../types';

const props = defineProps<RendererProps>();

// 状态
const copied = ref(false);

/**
 * JSON 内容
 */
const jsonContent = computed(() => {
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
 * 格式化的 JSON
 */
const formattedJson = computed(() => {
  try {
    const parsed = JSON.parse(jsonContent.value);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return jsonContent.value;
  }
});

/**
 * 是否有效的 JSON
 */
const isValidJson = computed(() => {
  try {
    JSON.parse(jsonContent.value);
    return true;
  } catch {
    return false;
  }
});

/**
 * 复制到剪贴板
 */
const copyToClipboard = async () => {
  try {
    await navigator.clipboard.writeText(formattedJson.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 2000);
  } catch (err) {
    console.error('复制失败:', err);
  }
};
</script>

<template>
  <div class="json-renderer flex flex-col h-full bg-[var(--bg)] relative">
    <!-- JSON 验证状态 -->
    <div class="absolute top-3 left-3 z-10">
      <span 
        v-if="isValidJson" 
        class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700"
      >
        有效 JSON
      </span>
      <span 
        v-else 
        class="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700"
      >
        无效 JSON
      </span>
    </div>

    <!-- 悬浮复制按钮 -->
    <div class="absolute top-3 right-3 z-10">
      <Button
        variant="text"
        size="small"
        v-tooltip.bottom="copied ? '已复制' : '复制 JSON'"
        @click="copyToClipboard"
        class="bg-[var(--surface-1)]/80 backdrop-blur"
      >
        <Check v-if="copied" class="w-4 h-4 text-green-500" />
        <Copy v-else class="w-4 h-4" />
      </Button>
    </div>

    <!-- JSON 内容 -->
    <div class="flex-1 overflow-auto">
      <pre class="p-4 pt-12 text-sm font-mono"><code class="json">{{ formattedJson }}</code></pre>
    </div>
  </div>
</template>

<style scoped>
.json-renderer {
  width: 100%;
  height: 100%;
}

pre {
  margin: 0;
  min-height: 100%;
}

code.json {
  color: var(--text-1);
  line-height: 1.6;
}

/* JSON 语法高亮 */
code.json :deep(.string) { color: #22c55e; }
code.json :deep(.number) { color: #f59e0b; }
code.json :deep(.boolean) { color: #3b82f6; }
code.json :deep(.null) { color: #ef4444; }
code.json :deep(.key) { color: #8b5cf6; }
</style>
