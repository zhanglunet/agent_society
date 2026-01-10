/**
 * 上传服务模块
 * 负责处理文件上传逻辑，包括进度跟踪和状态管理
 * 
 * Requirements: 5.1, 8.1, 8.2
 */

const UploadService = {
  /**
   * API 上传端点
   */
  UPLOAD_ENDPOINT: '/api/upload',

  /**
   * 最大文件大小 (10MB)
   */
  MAX_FILE_SIZE: 10 * 1024 * 1024,

  /**
   * 上传文件到服务器
   * @param {Blob|File} file - 文件数据
   * @param {object} options - 上传选项
   * @param {string} options.type - 文件类型 ('image' | 'file')
   * @param {string} options.filename - 文件名
   * @param {function} [options.onProgress] - 进度回调 (progress: number) => void
   * @returns {Promise<{ok: boolean, artifactRef?: string, metadata?: object, error?: string}>}
   */
  async upload(file, options = {}) {
    const { type = 'file', filename, onProgress } = options;

    // 验证文件大小
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        ok: false,
        error: 'file_too_large',
        message: `文件大小超过限制（最大 ${this.MAX_FILE_SIZE / 1024 / 1024}MB）`
      };
    }

    // 构建 FormData
    const formData = new FormData();
    formData.append('file', file, filename || file.name || 'upload');
    formData.append('type', type);
    if (filename) {
      formData.append('filename', filename);
    }

    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();

      // 进度事件
      if (onProgress && typeof onProgress === 'function') {
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded / event.total) * 100);
            onProgress(progress);
          }
        });
      }

      // 完成事件
      xhr.addEventListener('load', () => {
        try {
          const response = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && response.ok) {
            resolve({
              ok: true,
              artifactRef: response.artifactRef,
              metadata: response.metadata
            });
          } else {
            console.error('[UploadService] 上传失败:', {
              filename: filename || file.name,
              type,
              size: file.size,
              status: xhr.status,
              response
            });
            resolve({
              ok: false,
              error: response.error || 'upload_failed',
              message: response.message || '上传失败'
            });
          }
        } catch (err) {
          console.error('[UploadService] 解析响应失败:', {
            filename: filename || file.name,
            status: xhr.status,
            responseText: xhr.responseText,
            error: err
          });
          resolve({
            ok: false,
            error: 'parse_error',
            message: '解析响应失败'
          });
        }
      });

      // 错误事件
      xhr.addEventListener('error', (event) => {
        console.error('[UploadService] 上传网络错误:', {
          filename: filename || file.name,
          type,
          size: file.size,
          event
        });
        resolve({
          ok: false,
          error: 'network_error',
          message: '网络错误，请检查连接'
        });
      });

      // 超时事件
      xhr.addEventListener('timeout', () => {
        console.error('[UploadService] 上传超时:', {
          filename: filename || file.name,
          type,
          size: file.size,
          timeout: xhr.timeout
        });
        resolve({
          ok: false,
          error: 'timeout',
          message: '上传超时'
        });
      });

      // 中止事件
      xhr.addEventListener('abort', () => {
        resolve({
          ok: false,
          error: 'aborted',
          message: '上传已取消'
        });
      });

      // 发送请求
      xhr.open('POST', this.UPLOAD_ENDPOINT);
      xhr.timeout = 60000; // 60秒超时
      xhr.send(formData);
    });
  },

  /**
   * 批量上传文件
   * @param {Array<{file: Blob|File, options: object}>} files - 文件列表
   * @param {function} [onFileProgress] - 单个文件进度回调 (index: number, progress: number) => void
   * @returns {Promise<Array<{ok: boolean, artifactRef?: string, metadata?: object, error?: string}>>}
   */
  async uploadAll(files, onFileProgress) {
    const results = await Promise.all(
      files.map((item, index) => {
        const progressCallback = onFileProgress
          ? (progress) => onFileProgress(index, progress)
          : undefined;
        
        return this.upload(item.file, {
          ...item.options,
          onProgress: progressCallback
        });
      })
    );
    return results;
  },

  /**
   * 验证文件大小
   * @param {File|Blob} file - 文件对象
   * @returns {{valid: boolean, error?: string}}
   */
  validateFileSize(file) {
    if (!file) {
      return { valid: false, error: '文件不能为空' };
    }
    if (file.size > this.MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `文件大小超过限制（最大 ${this.MAX_FILE_SIZE / 1024 / 1024}MB）`
      };
    }
    return { valid: true };
  }
};

// 导出供其他模块使用
window.UploadService = UploadService;
