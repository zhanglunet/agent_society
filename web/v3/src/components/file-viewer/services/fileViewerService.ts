/**
 * 文件查看器服务
 * 
 * 负责与后端 API 交互，直接通过 /workspace-files/ 接口获取文件内容
 * 提供打开新文件查看器的功能
 * 
 * @module components/file-viewer/services/fileViewerService
 */
import type { FileContent } from '../types';

// 动态导入以避免循环依赖
let openFileViewerFn: ((params: any) => any) | null = null;

/**
 * 注册打开文件查看器函数
 * 由 file-viewer/index.ts 在初始化时调用
 */
export function registerOpenFileViewer(fn: (params: any) => any) {
  openFileViewerFn = fn;
}

const RAW_FILES_URL = '/workspace-files';

/**
 * 文件查看器服务
 */
class FileViewerService {
  /**
   * 获取文件内容
   * 
   * 使用 /workspace-files/:workspaceId/:filePath 直接获取文件内容
   * 通过 HTTP 响应头的 Content-Type 判断文件类型
   * 
   * @param workspaceId - 工作区ID
   * @param filePath - 文件路径
   * @returns 文件内容
   */
  async getFile(workspaceId: string, filePath: string): Promise<FileContent> {
    const url = this.getRawFileUrl(workspaceId, filePath);
    
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('文件不存在');
      }
      throw new Error(`获取文件失败: HTTP ${response.status}`);
    }

    // 从 HTTP 头获取 Content-Type
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    
    // 获取 Content-Length（如果存在）
    const contentLength = response.headers.get('content-length');
    const size = contentLength ? parseInt(contentLength, 10) : 0;

    // 判断是否为文本类型
    const isText = contentType.startsWith('text/') || 
                   contentType === 'application/json' ||
                   contentType === 'application/javascript' ||
                   contentType.includes('xml') ||
                   contentType === 'application/pdf' ||
                   contentType.startsWith('image/svg');

    if (isText) {
      const text = await response.text();
      return {
        data: text,
        mimeType: contentType,
        size: size || new Blob([text]).size,
      };
    } else {
      const arrayBuffer = await response.arrayBuffer();
      return {
        data: arrayBuffer,
        mimeType: contentType,
        size: size || arrayBuffer.byteLength,
      };
    }
  }

  /**
   * 获取原始文件访问 URL
   * 
   * @param workspaceId - 工作区ID
   * @param filePath - 文件路径
   * @returns 可直接访问的 URL
   */
  getRawFileUrl(workspaceId: string, filePath: string): string {
    // 确保 filePath 不以 / 开头
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    return `${RAW_FILES_URL}/${encodeURIComponent(workspaceId)}/${cleanPath.split('/').map(p => encodeURIComponent(p)).join('/')}`;
  }

  /**
   * 下载文件
   * 
   * @param workspaceId - 工作区ID
   * @param filePath - 文件路径
   * @param fileName - 下载时的文件名
   */
  async downloadFile(workspaceId: string, filePath: string, fileName?: string): Promise<void> {
    const url = this.getRawFileUrl(workspaceId, filePath);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName || filePath.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /**
   * 格式化文件大小
   * 
   * @param bytes - 字节数
   * @returns 格式化后的字符串
   */
  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const k = 1024;
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + units[i];
  }

  /**
   * 获取文件扩展名
   * 
   * @param fileName - 文件名
   * @returns 扩展名（小写）
   */
  getFileExtension(fileName: string): string {
    const parts = fileName.split('.');
    return parts.length > 1 ? parts.pop()?.toLowerCase() || '' : '';
  }

  /**
   * 打开文件查看器
   * 创建新的文件查看器对话框
   * 
   * @param options - 打开选项
   * @param options.workspaceId - 工作区ID
   * @param options.filePath - 文件路径
   * @param options.fileName - 文件名（可选）
   * @param options.viewMode - 初始视图模式（可选）
   * @returns Promise<dialogInstance | null>
   */
  async openFile(options: {
    workspaceId: string;
    filePath: string;
    fileName?: string;
    viewMode?: 'preview' | 'source';
  }): Promise<any> {
    if (!openFileViewerFn) {
      console.error('[FileViewerService] openFileViewer 未注册');
      // 降级方案：使用 window.open 打开 raw 文件
      const url = this.getRawFileUrl(options.workspaceId, options.filePath);
      window.open(url, '_blank');
      return null;
    }

    // 获取全局 dialog 实例（从 window 对象获取）
    const dialog = (window as any).$dialog;
    if (!dialog) {
      console.error('[FileViewerService] 全局 dialog 实例未找到');
      const url = this.getRawFileUrl(options.workspaceId, options.filePath);
      window.open(url, '_blank');
      return null;
    }

    try {
      return await openFileViewerFn({
        dialog,
        workspaceId: options.workspaceId,
        filePath: options.filePath,
        maximized: false
      });
    } catch (err) {
      console.error('[FileViewerService] 打开文件失败:', err);
      // 降级方案
      const url = this.getRawFileUrl(options.workspaceId, options.filePath);
      window.open(url, '_blank');
      return null;
    }
  }
}

// 导出单例实例
export const fileViewerService = new FileViewerService();
