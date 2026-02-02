/**
 * 文件查看器模块入口
 * 
 * @module components/file-viewer
 */

import type { useDialog } from 'primevue/usedialog';
import { h, ref } from 'vue';
import FileViewer from './FileViewer.vue';
import FileViewerHeader from './FileViewerHeader.vue';
import { fileViewerService } from './services/fileViewerService';
import type { FileViewerOptions } from './types';

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

  // 先获取文件信息用于显示在标题栏
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
    // 如果获取失败，仍然打开查看器
  }

  // 创建响应式的 viewMode，供 header 和 content 共享
  const viewModeRef = ref<'preview' | 'source'>('preview');
  const maximizedRef = ref(maximized);

  return dialog.open(FileViewer, {
    props: {
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
      viewMode: viewModeRef,
      maximized: maximizedRef,
      options
    },
    templates: {
      header: (props: any) => h(FileViewerHeader, { 
        fileName,
        workspaceId,
        filePath,
        mimeType: fileInfo.mimeType,
        size: fileInfo.size,
        hasViewMode: fileInfo.hasViewMode,
        viewMode: viewModeRef,
        maximized: maximizedRef,
        maximize: () => {
          maximizedRef.value = !maximizedRef.value;
          if (props?.maximize) {
            props.maximize();
          }
        },
        close: props?.close
      })
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
