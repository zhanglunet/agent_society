/**
 * 文件查看器模块入口
 * 
 * @module components/file-viewer
 */

import type { useDialog } from 'primevue/usedialog';
import { h, ref, type InjectionKey, type Ref } from 'vue';
import FileViewer from './FileViewer.vue';
import FileViewerHeader from './FileViewerHeader.vue';
import { fileViewerService } from './services/fileViewerService';
import type { FileViewerOptions } from './types';

// 提供 viewMode 的 key
export const ViewModeKey: InjectionKey<Ref<'preview' | 'source'>> = Symbol('viewMode');

// 提供 copyFunction 的 key
export const CopyFunctionKey: InjectionKey<Ref<{ copy: () => void; copied: { value: boolean } } | null>> = Symbol('copyFunction');

/**
 * 打开文件查看器的选项
 */
export interface OpenFileViewerOptions {
  dialog: ReturnType<typeof useDialog>;
  workspaceId: string;
  filePath: string;
  options?: FileViewerOptions;
  width?: string;
  height?: string;
  maximized?: boolean;
}

/**
 * 打开文件查看器
 */
export async function openFileViewer(params: OpenFileViewerOptions) {
  const {
    dialog,
    workspaceId,
    filePath,
    options,
    width = '80vw',
    height = '75vh',
    maximized = false
  } = params;

  if (!dialog) {
    throw new Error('openFileViewer requires a dialog instance');
  }

  const fileName = filePath.split('/').pop() || filePath;

  // 先获取文件信息
  let fileInfo: { mimeType?: string; size?: number; hasViewMode?: boolean } = {};
  try {
    const content = await fileViewerService.getFile(workspaceId, filePath);
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    fileInfo = {
      mimeType: content.mimeType,
      size: content.size,
      hasViewMode: content.mimeType === 'text/markdown' ||
                   content.mimeType === 'text/html' ||
                   ext === 'md' ||
                   ext === 'html' ||
                   ext === 'htm'
    };
  } catch {
    // 获取失败也继续打开
  }

  // 创建共享的 viewMode - 放在 dialog 数据中
  const viewMode = ref<'preview' | 'source'>('preview');

  // 创建共享的复制功能对象
  const copyFunction = ref<{ copy: () => void; copied: { value: boolean } } | null>(null);

  // 保存原始尺寸，用于还原
  const originalSize = {
    width: maximized ? width : width,  // 如果初始就是最大化，保存的应该是非最大化的尺寸
    height: maximized ? height : height,
    maxWidth: '100vw',
    maxHeight: '100vh'
  };

  const dialogInstance = dialog.open(FileViewer, {
    props: {
      header: '', // 使用自定义 header
      style: {
        width: maximized ? '100vw' : width,
        height: maximized ? '100vh' : height,
        maxWidth: '100vw',
        maxHeight: '100vh'
      },
      modal: true,
      dismissableMask: false,
      closable: false,
      closeOnEscape: false,
      maximizable: false,
      pt: {
        root: ({ state }: any) => ({
          class: [
            state.maximized ? '!w-screen !h-screen !max-w-none !m-0' : ''
          ]
        }),
        header: {
          class: ['hidden'] // 隐藏默认 header，使用自定义
        },
        content: ({ state }: any) => ({
          class: [
            'overflow-hidden p-0',
            state.maximized ? '!w-full !h-[calc(100vh-3rem)]' : ''
          ]
        })
      }
    },
    data: {
      workspaceId,
      filePath,
      fileName,
      viewMode, // 共享的 viewMode
      mimeType: fileInfo.mimeType,
      size: fileInfo.size,
      hasViewMode: fileInfo.hasViewMode,
      options
    },
    templates: {
      // 使用自定义 header
      header: (dialogProps: any) => {
        console.log('[index.ts] header called, dialogProps:', dialogProps);

        // 从 dialog 实例获取最新的数据
        const instance = dialogProps?.instance;
        const data = instance?.data;
        const sharedViewMode = data?.viewMode || viewMode;

        // 创建控制方法
        const handleMaximize = () => {
          console.log('[index.ts] === handleMaximize ===');

          // 找到最新的 dialog（最后创建的）
          const allDialogs = Array.from(document.querySelectorAll('.p-dialog')) as HTMLElement[];
          console.log('[index.ts] 找到', allDialogs.length, '个 dialog');

          // 最后创建的 dialog 应该就是我们的文件查看器
          const targetDialog = allDialogs[allDialogs.length - 1];
          console.log('[index.ts] targetDialog:', targetDialog);

          if (targetDialog) {
            // 获取计算后的实际宽度来判断是否最大化
            const computedStyle = window.getComputedStyle(targetDialog);
            const actualWidth = computedStyle.width;
            const viewportWidth = window.innerWidth;
            // 如果实际宽度接近视口宽度（允许5px误差），则认为是最大化状态
            const isMaximized = Math.abs(parseFloat(actualWidth) - viewportWidth) < 5;

            console.log('[index.ts] 实际宽度:', actualWidth, ', 视口宽度:', viewportWidth, ', 是否最大化:', isMaximized);

            if (isMaximized) {
              // 还原
              console.log('[index.ts] 还原到原始尺寸:', originalSize);
              targetDialog.classList.remove('maximized');
              targetDialog.style.width = originalSize.width;
              targetDialog.style.height = originalSize.height;
              targetDialog.style.maxWidth = originalSize.maxWidth;
              targetDialog.style.maxHeight = originalSize.maxHeight;
              targetDialog.style.margin = '';
            } else {
              // 最大化
              console.log('[index.ts] 最大化 dialog');
              targetDialog.classList.add('maximized');
              targetDialog.style.width = '100vw';
              targetDialog.style.height = '100vh';
              targetDialog.style.maxWidth = '100vw';
              targetDialog.style.maxHeight = '100vh';
              targetDialog.style.margin = '0';
              targetDialog.style.top = '0';
              targetDialog.style.left = '0';
            }
          } else {
            console.error('[index.ts] 无法找到 dialog 元素');
          }
        };

        const handleClose = () => {
          console.log('[index.ts] handleClose called, dialogInstance:', dialogInstance);

          const instance = dialogInstance as any;
          if (typeof instance?.close === 'function') {
            instance.close();
          } else if (typeof dialogProps?.close === 'function') {
            dialogProps.close();
          } else {
            console.error('[index.ts] 无法找到 close 方法');
          }
        };

        console.log('[index.ts] Rendering FileViewerHeader, copyFunction:', copyFunction);
        return h(FileViewerHeader, {
          fileName,
          workspaceId,
          filePath,
          mimeType: fileInfo.mimeType,
          size: fileInfo.size,
          hasViewMode: fileInfo.hasViewMode,
          viewMode: sharedViewMode,
          copyFunction: copyFunction,
          maximized: dialogProps?.state?.maximized,
          onMaximize: handleMaximize,
          onClose: handleClose
        });
      }
    }
  });

  return dialogInstance;
}

export { default as FileViewer } from './FileViewer.vue';
export { fileViewerService } from './services/fileViewerService';
export { mimeTypeRegistry } from './mimeTypeRegistry';
export type { 
  FileContent, 
  FileViewerOptions, 
  RendererProps, 
  FileInfo,
  WorkspaceFilesResponse,
  MimeTypeHandler 
} from './types';
