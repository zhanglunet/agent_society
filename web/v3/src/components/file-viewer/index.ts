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

  return dialog.open(FileViewer, {
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
        // 从 dialog 实例获取最新的数据
        const instance = dialogProps?.instance;
        const data = instance?.data;
        const sharedViewMode = data?.viewMode || viewMode;
        
        return h(FileViewerHeader, {
          fileName,
          workspaceId,
          filePath,
          mimeType: fileInfo.mimeType,
          size: fileInfo.size,
          hasViewMode: fileInfo.hasViewMode,
          viewMode: sharedViewMode,
          maximized: dialogProps?.state?.maximized,
          onMaximize: () => {
            if (dialogProps?.maximize) {
              dialogProps.maximize();
            }
          },
          onClose: () => {
            if (dialogProps?.close) {
              dialogProps.close();
            }
          }
        });
      }
    }
  });
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
