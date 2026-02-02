<script setup lang="ts">
/**
 * JSON 渲染器
 * 
 * 支持 JSON 格式化显示和折叠
 * 
 * @module components/file-viewer/renderers/JsonRenderer
 */
import { computed, ref } from 'vue';
import { Copy, Check, Download, Code } from 'lucide-vue-next';
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

/**
 * 下载
 */
const download = () => {
  const blob = new Blob([jsonContent.value], { type: 'application/json' });
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
  <div class="json-renderer flex flex-col h-full bg-[var(--bg)]">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] bg-[var(--surface-2)] shrink-0">
      <div class="flex items-center gap-2">
        <Code class="w-4 h-4 text-[var(--primary)]" />
        <span class="text-sm text-[var(--text-1)]">JSON</span>
        <span 
          v-if="isValidJson" 
          class="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700"
        >
          有效
        </span>
        <span 
          v-else 
          class="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700"
        >
          无效
        </span>
      </div>
      
      <div class="flex items-center gap-2">
        <Button
          variant="text"
          size="small"
          v-tooltip.top="copied ? '已复制' : '复制'"
          @click="copyToClipboard"
        >
          <Check v-if="copied" class="w-4 h-4 text-green-500" />
          <Copy v-else class="w-4 h-4" />
        </Button>
        <Button variant="text" size="small" v-tooltip.top="'下载'" @click="download">
          <Download class="w-4 h-4" />
        </Button>
      </div>
    </div>

    <!-- JSON 内容 -->
    <div class="flex-1 overflow-auto">
      <pre class="p-4 text-sm font-mono"><code class="json">{{ formattedJson }}</code></pre>
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
