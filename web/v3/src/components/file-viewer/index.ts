/**
 * 文件查看器模块入口
 * 
 * 提供独立打开文件查看器的方法，可用于：
 * - 工作区文件管理器
 * - 聊天消息中的文件
 * - 搜索结果中的文件
 * - 任何需要预览文件的地方
 * 
 * @example
 * ```ts
 * import { useDialog } from 'primevue/usedialog';
 * import { openFileViewer } from '@/components/file-viewer';
 * 
 * const dialog = useDialog();
 * 
 * // 打开文件
 * openFileViewer({
 *   dialog,
 *   workspaceId: 'org-123',
 *   filePath: 'documents/report.pdf'
 * });
 * ```
 * 
 * @module components/file-viewer
 */

import type { useDialog } from 'primevue/usedialog';
import FileViewer from './FileViewer.vue';
import type { FileViewerOptions } from './types';

/**
 * 打开文件查看器的选项
 */
export interface OpenFileViewerOptions {
  /** Dialog 实例（必须在组件 setup 中通过 useDialog() 获取） */
  dialog: ReturnType<typeof useDialog>;
  /** 工作区ID */
  workspaceId: string;
  /** 文件路径 */
  filePath: string;
  /** 可选配置 */
  options?: FileViewerOptions;
  /** 对话框宽度 */
  width?: string;
  /** 对话框高度 */
  height?: string;
  /** 是否最大化 */
  maximized?: boolean;
}

/**
 * 打开文件查看器
 * 
 * 这是一个独立的方法，需要在组件 setup 中获取 dialog 实例后调用
 * 
 * @param params - 打开参数
 * @returns 对话框引用
 * 
 * @example
 * ```ts
 * // 在组件中使用
 * import { useDialog } from 'primevue/usedialog';
 * import { openFileViewer } from '@/components/file-viewer';
 * 
 * const dialog = useDialog();
 * 
 * // 打开文件
 * openFileViewer({
 *   dialog,
 *   workspaceId: 'workspace-123',
 *   filePath: 'images/logo.png'
 * });
 * 
 * // 自定义尺寸
 * openFileViewer({
 *   dialog,
 *   workspaceId: 'workspace-123',
 *   filePath: 'documents/report.pdf',
 *   width: '90vw',
 *   height: '85vh',
 *   maximized: true
 * });
 * ```
 */
export function openFileViewer(params: OpenFileViewerOptions) {
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
    throw new Error('openFileViewer requires a dialog instance. Please pass the dialog from useDialog() in your component setup.');
  }

  return dialog.open(FileViewer, {
    props: {
      header: filePath.split('/').pop() || filePath,
      style: {
        width: maximized ? '100vw' : width,
        height: maximized ? '100vh' : height,
        maxWidth: '100vw',
        maxHeight: '100vh'
      },
      modal: true,
      dismissableMask: true,
      closable: true,
      maximizable: true,
      pt: {
        root: ({ state }: any) => ({
          class: [
            state.maximized ? '!w-screen !h-screen !max-w-none !m-0' : ''
          ]
        }),
        content: ({ state }: any) => ({
          class: [
            'overflow-hidden p-0',
            state.maximized ? '!w-full !h-[calc(100vh-4rem)]' : ''
          ]
        })
      }
    },
    data: {
      workspaceId,
      filePath,
      options
    },
    onClose: () => {
      // 可选的关闭回调
    }
  });
}

// 导出组件和类型
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
