<script setup lang="ts">
/**
 * 文件查看器自定义标题栏
 *
 * 包含：文件名 | 类型·大小 | [预览|源码] | 复制 | 下载 | 全屏 | 关闭
 */
import { computed, ref, type Ref } from 'vue';
import { X, Download, Maximize2, Minimize2, Eye, Code, Copy, Check, Play } from 'lucide-vue-next';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import { fileViewerService } from './services/fileViewerService';
import { uiCommandService } from '../../services/uiCommandService';

const props = defineProps<{
  fileName: string;
  workspaceId: string;
  filePath: string;
  mimeType?: string;
  size?: number;
  hasViewMode?: boolean;
  viewMode?: Ref<'preview' | 'source'>;
  copyFunction?: Ref<{ copy: () => void; copied: { value: boolean } } | null>;
  getFileContent?: Ref<(() => string) | null>;
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
  console.log('[FileViewerHeader] handleMaximize called');
  emit('maximize');
};

const handleClose = () => {
  console.log('[FileViewerHeader] handleClose called');
  emit('close');
};

// 打印日志用于调试
console.log('[FileViewerHeader] props.copyFunction:', props.copyFunction);

// 是否显示复制按钮
const showCopyButton = computed(() => {
  const cfValue = props.copyFunction?.value;
  const hasCopy = cfValue !== null && cfValue !== undefined;
  console.log('[FileViewerHeader] showCopyButton computed, cfValue:', cfValue, 'hasCopy:', hasCopy);
  return hasCopy;
});

// 是否是 JavaScript 文件
const isJavaScript = computed(() => {
  const mimeType = props.mimeType || '';
  const fileName = props.fileName || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  return mimeType === 'text/javascript' ||
         mimeType === 'application/javascript' ||
         mimeType === 'application/x-javascript' ||
         ext === 'js' ||
         ext === 'mjs' ||
         ext === 'cjs';
});

// 运行状态
const running = ref(false);
const runResult = ref<any>(null);
const runError = ref<string | null>(null);
const showResult = ref(false);

// 运行 JavaScript 代码
const handleRun = async () => {
  if (!props.getFileContent?.value) {
    console.error('[FileViewerHeader] getFileContent not available');
    return;
  }

  const code = props.getFileContent.value();
  if (!code) {
    console.error('[FileViewerHeader] No code content available');
    return;
  }

  running.value = true;
  runError.value = null;
  runResult.value = null;

  try {
    const result = await uiCommandService.executeScript(code);
    console.log('[FileViewerHeader] Run result:', result);

    if (result.ok) {
      runResult.value = result.result;
      showResult.value = true;
    } else {
      runError.value = result.error || '运行失败';
      showResult.value = true;
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    runError.value = error;
    showResult.value = true;
    console.error('[FileViewerHeader] Run error:', error);
  } finally {
    running.value = false;
  }
};

// 复制状态
const copiedState = computed(() => {
  const cfValue = props.copyFunction?.value;
  if (!cfValue) return false;
  // copied 可能是 Ref 或普通对象
  const copied = (cfValue as any).copied;
  if (typeof copied === 'object' && 'value' in copied) {
    return copied.value;
  }
  if (typeof copied === 'boolean') {
    return copied;
  }
  return false;
});

// 复制处理函数
const handleCopy = () => {
  console.log('[FileViewerHeader] handleCopy called, props.copyFunction?.value:', props.copyFunction?.value);
  props.copyFunction?.value?.copy();
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

      <!-- 运行按钮（仅 JavaScript 文件显示） -->
      <Button
        v-if="isJavaScript"
        variant="text"
        size="small"
        @click="handleRun"
        :disabled="running"
        class="!w-8 !h-8"
        v-tooltip.bottom="'运行代码'"
      >
        <Play v-if="!running" class="w-4 h-4" />
        <div v-else class="w-4 h-4 animate-spin border-2 border-current border-t-transparent rounded-full" />
      </Button>

      <!-- 复制按钮（仅代码渲染器显示） -->
      <Button
        v-if="showCopyButton"
        variant="text"
        size="small"
        @click="handleCopy"
        class="!w-8 !h-8"
        v-tooltip.bottom="copiedState ? '已复制' : '复制代码'"
      >
        <Check v-if="copiedState" class="w-4 h-4 text-green-500" />
        <Copy v-else class="w-4 h-4" />
      </Button>

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

  <!-- 运行结果对话框 -->
  <Dialog
    v-model:visible="showResult"
    modal
    header="运行结果"
    :style="{ width: '600px' }"
    :dismissableMask="false"
    :closeOnEscape="false"
  >
    <div v-if="runError" class="text-red-500">
      <p class="font-medium mb-2">运行出错：</p>
      <pre class="bg-red-50 p-3 rounded text-sm overflow-auto max-h-96">{{ runError }}</pre>
    </div>
    <div v-else-if="runResult" class="text-green-600">
      <p class="font-medium mb-2">运行成功：</p>
      <pre class="bg-green-50 p-3 rounded text-sm overflow-auto max-h-96">{{ JSON.stringify(runResult.result || runResult.output || '无返回值', null, 2) }}</pre>
      <p v-if="runResult.files && runResult.files.length > 0" class="mt-3 text-sm">
        生成了 {{ runResult.files.length }} 个文件：
        <ul class="list-disc list-inside">
          <li v-for="file in runResult.files" :key="file.path">{{ file.path }}</li>
        </ul>
      </p>
    </div>
    <template #footer>
      <Button label="关闭" @click="showResult = false" variant="text" />
    </template>
  </Dialog>
</template>
