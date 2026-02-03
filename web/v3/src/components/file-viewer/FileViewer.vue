<script setup lang="ts">
/**
 * 文件内容查看器组件
 *
 * @module components/file-viewer/FileViewer
 */
import { ref, computed, onMounted, shallowRef, inject, provide, toRef, toRaw } from 'vue';
import { AlertCircle, Loader2 } from 'lucide-vue-next';
import { fileViewerService } from './services/fileViewerService';
import { mimeTypeRegistry } from './mimeTypeRegistry';
import { ViewModeKey } from './index';
import { CopyFunctionKey } from './injectionKeys';
import type { FileContent } from './types';

// 注入 Dialog 数据
const dialogRef = inject<any>('dialogRef');

// 获取 dialog 数据
const dialogData = dialogRef?.value?.data;

// 响应式数据
const workspaceId = ref(dialogData?.workspaceId || '');
const filePath = ref(dialogData?.filePath || '');
const fileName = ref(dialogData?.fileName || '');

// viewMode - 使用 toRef 保持引用，避免自动解包
const viewMode = dialogData ? toRef(dialogData, 'viewMode') : ref<'preview' | 'source'>('preview');

// 提供给子组件
provide(ViewModeKey, viewMode);

// 复制功能状态
const copied = ref(false);

// 设置复制函数（由 CodeRenderer 调用）
const setCopyFunction = (fn: () => void) => {
  console.log('[FileViewer] setCopyFunction called, dialogData:', dialogData);
  // 使用 toRaw 获取原始对象，避免 Vue Proxy 自动解包
  if (dialogData) {
    const rawDialogData = toRaw(dialogData);
    console.log('[FileViewer] rawDialogData:', rawDialogData);
    const cf = rawDialogData?.copyFunction;
    console.log('[FileViewer] cf from rawDialogData:', cf, 'typeof cf:', typeof cf);
    if (cf && typeof cf === 'object' && 'value' in cf) {
      cf.value = {
        copy: fn,
        copied
      };
      console.log('[FileViewer] dialogData.copyFunction.value updated:', cf.value);
    } else {
      console.log('[FileViewer] cf is invalid, cf:', cf);
    }
  } else {
    console.log('[FileViewer] dialogData is null');
  }
};

// 提供复制功能的设置方法（给 CodeRenderer 用）
provide(CopyFunctionKey, {
  setCopyFunction,
  copied
});

// Dialog 控制方法 - 提供给子组件使用
const maximized = computed(() => {
  // 尝试从 dialogRef 获取 maximized 状态
  const dialog = dialogRef?.value;
  return dialog?.maximized || dialog?.state?.maximized || false;
});

const dialogContext = {
  maximized,
  maximize: () => {
    console.log('[FileViewer] maximize called, dialogRef:', dialogRef);
    const dialog = dialogRef?.value;
    console.log('[FileViewer] dialog:', dialog);
    console.log('[FileViewer] dialog keys:', dialog ? Object.keys(dialog) : 'N/A');

    if (typeof dialog?.maximize === 'function') {
      dialog.maximize();
    } else if (typeof (dialog as any)?.toggleMaximize === 'function') {
      (dialog as any).toggleMaximize();
    } else if (dialog?.$parent) {
      console.log('[FileViewer] trying through $parent');
      const parentDialog = dialog.$parent;
      console.log('[FileViewer] parentDialog:', parentDialog);
      if (typeof (parentDialog as any)?.maximize === 'function') {
        (parentDialog as any).maximize();
      } else if (typeof (parentDialog as any)?.toggleMaximize === 'function') {
        (parentDialog as any).toggleMaximize();
      }
    }
  },
  close: () => {
    console.log('[FileViewer] close called, dialogRef:', dialogRef);
    const dialog = dialogRef?.value;

    if (typeof dialog?.close === 'function') {
      dialog.close();
    } else {
      console.error('[FileViewer] 无法找到 close 方法');
    }
  }
};

// 提供对话框控制方法
provide('dialogContext', dialogContext);

// 组件状态
const loading = ref(false);
const error = ref<string | null>(null);
const fileContent = ref<FileContent | null>(null);
const rendererComponent = shallowRef<any>(null);

// 文件扩展名
const fileExtension = computed(() => {
  const path = filePath.value;
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

  if (!workspaceId.value || !filePath.value) {
    error.value = '缺少必要参数';
    loading.value = false;
    return;
  }

  try {
    const content = await fileViewerService.getFile(workspaceId.value, filePath.value);
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
        :file-name="fileName"
        :file-path="filePath"
        :workspace-id="workspaceId"
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
