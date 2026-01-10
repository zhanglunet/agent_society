/**
 * 附件管理器组件
 * 管理待发送的附件列表，包括状态跟踪和预览渲染
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

const AttachmentManager = {
  /**
   * 附件列表
   * @type {Array<{id: string, file: File|Blob, type: string, filename: string, size: number, status: string, progress: number, artifactRef?: string, preview?: string, error?: string}>}
   */
  attachments: [],

  /**
   * 预览容器元素
   * @type {HTMLElement|null}
   */
  previewContainer: null,

  /**
   * 状态变化回调
   * @type {function|null}
   */
  onStateChange: null,

  /**
   * 生成唯一ID
   * @returns {string}
   */
  _generateId() {
    return `attachment_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  },

  /**
   * 初始化附件管理器
   * @param {HTMLElement} previewContainer - 预览区域容器
   * @param {function} [onStateChange] - 状态变化回调
   */
  init(previewContainer, onStateChange) {
    this.previewContainer = previewContainer;
    this.onStateChange = onStateChange;
    this.attachments = [];
    this.render();
  },

  /**
   * 添加附件
   * @param {File|Blob} file - 文件对象
   * @param {string} type - 类型 ('image' | 'file')
   * @param {string} [preview] - 预览URL (图片的 data URL)
   * @returns {string} 附件ID
   */
  add(file, type, preview = null) {
    const id = this._generateId();
    const attachment = {
      id,
      file,
      type,
      filename: file.name || `${type}_${Date.now()}`,
      size: file.size,
      status: 'pending', // pending, uploading, ready, error
      progress: 0,
      preview: preview || null,
      artifactRef: null,
      error: null
    };
    
    this.attachments.push(attachment);
    this.render();
    this._notifyStateChange();
    
    return id;
  },

  /**
   * 移除附件
   * @param {string} id - 附件ID
   * @returns {boolean} 是否成功移除
   */
  remove(id) {
    const index = this.attachments.findIndex(a => a.id === id);
    if (index === -1) {
      return false;
    }
    
    // 释放预览URL
    const attachment = this.attachments[index];
    if (attachment.preview && attachment.preview.startsWith('blob:')) {
      URL.revokeObjectURL(attachment.preview);
    }
    
    this.attachments.splice(index, 1);
    this.render();
    this._notifyStateChange();
    
    return true;
  },

  /**
   * 清空所有附件
   */
  clear() {
    // 释放所有预览URL
    this.attachments.forEach(attachment => {
      if (attachment.preview && attachment.preview.startsWith('blob:')) {
        URL.revokeObjectURL(attachment.preview);
      }
    });
    
    this.attachments = [];
    this.render();
    this._notifyStateChange();
  },

  /**
   * 更新附件状态
   * @param {string} id - 附件ID
   * @param {object} updates - 更新内容
   */
  update(id, updates) {
    const attachment = this.attachments.find(a => a.id === id);
    if (attachment) {
      Object.assign(attachment, updates);
      this.render();
      this._notifyStateChange();
    }
  },

  /**
   * 设置附件上传进度
   * @param {string} id - 附件ID
   * @param {number} progress - 进度 (0-100)
   */
  setProgress(id, progress) {
    this.update(id, { progress, status: 'uploading' });
  },

  /**
   * 设置附件上传成功
   * @param {string} id - 附件ID
   * @param {string} artifactRef - 工件引用
   */
  setReady(id, artifactRef) {
    this.update(id, { status: 'ready', progress: 100, artifactRef });
  },

  /**
   * 设置附件上传失败
   * @param {string} id - 附件ID
   * @param {string} error - 错误信息
   */
  setError(id, error) {
    this.update(id, { status: 'error', error });
  },

  /**
   * 获取附件数量
   * @returns {number}
   */
  count() {
    return this.attachments.length;
  },

  /**
   * 检查是否有附件
   * @returns {boolean}
   */
  hasAttachments() {
    return this.attachments.length > 0;
  },

  /**
   * 检查是否所有附件都已上传完成
   * @returns {boolean}
   */
  allReady() {
    return this.attachments.length > 0 && 
           this.attachments.every(a => a.status === 'ready');
  },

  /**
   * 检查是否有正在上传的附件
   * @returns {boolean}
   */
  hasUploading() {
    return this.attachments.some(a => a.status === 'uploading');
  },

  /**
   * 检查是否有待上传的附件
   * @returns {boolean}
   */
  hasPending() {
    return this.attachments.some(a => a.status === 'pending');
  },

  /**
   * 获取所有待上传的附件
   * @returns {Array}
   */
  getPending() {
    return this.attachments.filter(a => a.status === 'pending');
  },

  /**
   * 获取所有已上传的附件引用
   * @returns {Array<{type: string, artifactRef: string, filename: string}>}
   */
  getArtifactRefs() {
    return this.attachments
      .filter(a => a.status === 'ready' && a.artifactRef)
      .map(a => ({
        type: a.type,
        artifactRef: a.artifactRef,
        filename: a.filename
      }));
  },

  /**
   * 获取所有附件（用于上传）
   * @returns {Array<{file: File|Blob, options: {type: string, filename: string}}>}
   */
  getFilesForUpload() {
    return this.attachments
      .filter(a => a.status === 'pending')
      .map(a => ({
        file: a.file,
        options: {
          type: a.type,
          filename: a.filename
        },
        id: a.id
      }));
  },

  /**
   * 通知状态变化
   * @private
   */
  _notifyStateChange() {
    if (this.onStateChange && typeof this.onStateChange === 'function') {
      this.onStateChange({
        count: this.count(),
        hasAttachments: this.hasAttachments(),
        allReady: this.allReady(),
        hasUploading: this.hasUploading(),
        hasPending: this.hasPending()
      });
    }
  },

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string}
   */
  _formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  },

  /**
   * 渲染预览区域
   */
  render() {
    if (!this.previewContainer) return;

    if (this.attachments.length === 0) {
      this.previewContainer.innerHTML = '';
      this.previewContainer.style.display = 'none';
      return;
    }

    this.previewContainer.style.display = 'flex';
    
    const html = this.attachments.map(attachment => {
      const statusClass = `attachment-${attachment.status}`;
      const isImage = attachment.type === 'image';
      
      // 构建预览内容
      let previewContent = '';
      if (isImage && attachment.preview) {
        previewContent = `<img src="${attachment.preview}" alt="${this._escapeHtml(attachment.filename)}" class="attachment-thumbnail" />`;
      } else {
        // 文件图标
        previewContent = `<div class="attachment-icon">📄</div>`;
      }
      
      // 构建进度条
      let progressBar = '';
      if (attachment.status === 'uploading') {
        progressBar = `
          <div class="attachment-progress">
            <div class="attachment-progress-bar" style="width: ${attachment.progress}%"></div>
          </div>
        `;
      }
      
      // 构建状态指示器
      let statusIndicator = '';
      if (attachment.status === 'ready') {
        statusIndicator = '<span class="attachment-status-icon ready">✓</span>';
      } else if (attachment.status === 'error') {
        statusIndicator = '<span class="attachment-status-icon error">✗</span>';
      } else if (attachment.status === 'uploading') {
        statusIndicator = '<span class="attachment-status-icon uploading">⏳</span>';
      }
      
      return `
        <div class="attachment-item ${statusClass}" data-attachment-id="${attachment.id}">
          <div class="attachment-preview">
            ${previewContent}
            ${statusIndicator}
          </div>
          <div class="attachment-info">
            <span class="attachment-name" title="${this._escapeHtml(attachment.filename)}">${this._escapeHtml(this._truncateFilename(attachment.filename, 15))}</span>
            <span class="attachment-size">${this._formatFileSize(attachment.size)}</span>
          </div>
          ${progressBar}
          <button class="attachment-remove" onclick="AttachmentManager.remove('${attachment.id}')" title="移除">×</button>
          ${attachment.error ? `<div class="attachment-error" title="${this._escapeHtml(attachment.error)}">⚠️</div>` : ''}
        </div>
      `;
    }).join('');

    this.previewContainer.innerHTML = html;
  },

  /**
   * 截断文件名
   * @param {string} filename - 文件名
   * @param {number} maxLength - 最大长度
   * @returns {string}
   */
  _truncateFilename(filename, maxLength) {
    if (filename.length <= maxLength) return filename;
    const ext = filename.lastIndexOf('.') > 0 ? filename.slice(filename.lastIndexOf('.')) : '';
    const name = filename.slice(0, filename.length - ext.length);
    const truncatedName = name.slice(0, maxLength - ext.length - 3) + '...';
    return truncatedName + ext;
  },

  /**
   * HTML 转义
   * @param {string} text - 原始文本
   * @returns {string}
   */
  _escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// 导出供其他模块使用
window.AttachmentManager = AttachmentManager;
