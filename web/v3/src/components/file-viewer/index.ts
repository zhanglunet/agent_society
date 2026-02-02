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
      dismissableMask: true,
      closable: false,
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
          console.log('[index.ts] dialogInstance:', dialogInstance);
          console.log('[index.ts] dialogInstance keys:', dialogInstance ? Object.keys(dialogInstance) : 'N/A');
          console.log('[index.ts] dialogProps:', dialogProps);
          console.log('[index.ts] dialogProps keys:', dialogProps ? Object.keys(dialogProps) : 'N/A');

          // 尝试不同的方式来访问 dialog 方法
          const instance = dialogInstance as any;
          console.log('[index.ts] instance.maximize:', typeof instance?.maximize);
          console.log('[index.ts] instance.toggleMaximize:', typeof instance?.toggleMaximize);
          console.log('[index.ts] dialogProps.maximize:', typeof dialogProps?.maximize);
          console.log('[index.ts] dialogProps.toggleMaximize:', typeof (dialogProps as any)?.toggleMaximize);
          console.log('[index.ts] dialogProps.maximizable:', (dialogProps as any)?.maximizable);
          console.log('[index.ts] dialogProps.maximized:', (dialogProps as any)?.maximized);

          if (typeof instance?.maximize === 'function') {
            instance.maximize();
          } else if (typeof instance?.toggleMaximize === 'function') {
            instance.toggleMaximize();
          } else if (typeof dialogProps?.maximize === 'function') {
            dialogProps.maximize();
          } else if (typeof (dialogProps as any)?.toggleMaximize === 'function') {
            (dialogProps as any).toggleMaximize();
          } else {
            // 尝试通过 state 属性来切换最大化状态
            const currentState = (dialogProps as any)?.state?.maximized;
            console.log('[index.ts] 当前 maximized 状态:', currentState);
            // 可能需要通过设置 state 来切换
            if ((dialogProps as any)?.state) {
              (dialogProps as any).state.maximized = !currentState;
            } else {
              console.error('[index.ts] 无法找到 maximize 方法');
            }
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

        return h(FileViewerHeader, {
          fileName,
          workspaceId,
          filePath,
          mimeType: fileInfo.mimeType,
          size: fileInfo.size,
          hasViewMode: fileInfo.hasViewMode,
          viewMode: sharedViewMode,
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
