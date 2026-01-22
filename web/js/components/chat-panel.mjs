/**
 * 对话面板组件
 * 显示与选中智能体的对话消息，支持发送消息
 */

// 导入MIME类型常量
import { 
  IMAGE_MIME_TYPES, JSON_MIME_TYPES, TEXT_MIME_TYPES, CODE_MIME_TYPES, 
  HTML_MIME_TYPE, CSS_MIME_TYPE, isImageType, getArtifactGroupType, getFileIconByMimeType
} from '../utils/mime-types.mjs';

// 导入 ArtifactManager
import ArtifactManager from './artifact-manager.mjs';

const ChatPanel = {
  // 组件状态
  currentAgentId: null,  // 当前智能体 ID
  currentAgent: null,    // 当前智能体对象
  messages: [],          // 消息列表
  messagesById: new Map(), // 消息 ID 索引
  thinkingMap: {},       // 思考过程映射（tool_call_id -> reasoning_content）
  isUploading: false,    // 是否正在上传附件
  autoScroll: true,      // 是否自动滚动到底部

  // DOM 元素引用
  headerTitle: null,
  headerRole: null,
  headerStatus: null,
  messageList: null,
  chatInput: null,
  sendBtn: null,
  imageUploadBtn: null,
  fileUploadBtn: null,
  imageInput: null,
  fileInput: null,
  attachmentPreview: null,

  /**
   * 初始化组件
   */
  init() {
    this.headerTitle = document.querySelector('.chat-title .agent-name');
    this.headerRole = document.querySelector('.chat-title .agent-role');
    this.headerStatus = document.querySelector('.chat-status');
    this.messageList = document.getElementById('message-list');
    this.chatInput = document.getElementById('chat-input');
    this.sendBtn = document.getElementById('send-btn');
    
    // 上传相关元素
    this.imageUploadBtn = document.getElementById('image-upload-btn');
    this.fileUploadBtn = document.getElementById('file-upload-btn');
    this.imageInput = document.getElementById('image-input');
    this.fileInput = document.getElementById('file-input');
    this.attachmentPreview = document.getElementById('attachment-preview');

    // 绑定发送按钮事件
    if (this.sendBtn) {
      this.sendBtn.addEventListener('click', () => this.sendMessage());
    }

    // 绑定输入框回车事件
    if (this.chatInput) {
      this.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });
    }
    
    // 初始化附件管理器
    if (this.attachmentPreview && window.AttachmentManager) {
      AttachmentManager.init(this.attachmentPreview, (state) => {
        this._onAttachmentStateChange(state);
      });
    }
    
    // 初始化自动滚动按钮
    this.initAutoScrollButton();
    
    // 绑定上传按钮事件
    this._bindUploadEvents();
    
    // 初始化工件交互处理器
    this._initArtifactInteractionHandler();
  },

  /**
   * 绑定上传相关事件
   * @private
   */
  _bindUploadEvents() {
    // 图片上传按钮
    if (this.imageUploadBtn && this.imageInput) {
      this.imageUploadBtn.addEventListener('click', () => {
        this.imageInput.click();
      });
      
      this.imageInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
          await this._handleImageSelect(file);
        }
        // 清空 input 以便重复选择同一文件
        this.imageInput.value = '';
      });
    }
    
    // 文件上传按钮
    if (this.fileUploadBtn && this.fileInput) {
      this.fileUploadBtn.addEventListener('click', () => {
        this.fileInput.click();
      });
      
      this.fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files || []);
        for (const file of files) {
          await this._handleFileSelect(file);
        }
        // 清空 input 以便重复选择同一文件
        this.fileInput.value = '';
      });
    }
  },

  /**
   * 处理图片选择
   * @param {File} file - 图片文件
   * @private
   */
  async _handleImageSelect(file) {
    if (!window.ImageConverter || !window.AttachmentManager) {
      Toast.show('图片上传功能未就绪', 'error');
      return;
    }
    
    // 验证文件大小
    if (window.UploadService) {
      const validation = UploadService.validateFileSize(file);
      if (!validation.valid) {
        Toast.show(validation.error, 'error');
        return;
      }
    }
    
    // 检查是否为支持的图片格式
    const isSupported = await ImageConverter.isSupportedImage(file);
    if (!isSupported) {
      Toast.show('不支持的图片格式', 'error');
      return;
    }
    
    try {
      // 转换为 JPEG
      const result = await ImageConverter.convertToJpeg(file);
      
      // 创建缩略图预览
      const thumbnail = await ImageConverter.createThumbnail(file);
      
      // 添加到附件管理器
      const attachmentId = AttachmentManager.add(result.blob, 'image', thumbnail);
      
      // 更新附件的文件名（使用原始文件名但改为 .jpg 扩展名）
      const originalName = file.name || 'image';
      const baseName = originalName.replace(/\.[^.]+$/, '');
      AttachmentManager.update(attachmentId, { filename: baseName + '.jpg' });
      
    } catch (err) {
      console.error('[ChatPanel] 图片处理失败:', {
        filename: file.name,
        type: file.type,
        size: file.size,
        error: err.message,
        stack: err.stack
      });
      Toast.show('图片处理失败: ' + err.message, 'error');
    }
  },

  /**
   * 处理文件选择
   * @param {File} file - 文件
   * @private
   */
  async _handleFileSelect(file) {
    if (!window.AttachmentManager) {
      Toast.show('文件上传功能未就绪', 'error');
      return;
    }
    
    // 验证文件大小
    if (window.UploadService) {
      const validation = UploadService.validateFileSize(file);
      if (!validation.valid) {
        Toast.show(validation.error, 'error');
        return;
      }
    }
    
    // 检查是否为图片，如果是则作为图片处理
    if (window.ImageConverter && file.type.startsWith('image/')) {
      const isSupported = await ImageConverter.isSupportedImage(file);
      if (isSupported) {
        await this._handleImageSelect(file);
        return;
      }
    }
    
    // 作为普通文件添加
    AttachmentManager.add(file, 'file');
  },

  /**
   * 初始化工件交互处理器
   * 使用事件委托处理动态生成的工件链接和图片点击
   * @private
   */
  _initArtifactInteractionHandler() {
    if (!this.messageList) return;
    
    // 使用事件委托监听工件链接和图片点击
    this.messageList.addEventListener('click', (e) => {
      // 检查是否点击了工件链接
      if (e.target.classList.contains('artifact-link')) {
        e.preventDefault(); // 阻止默认的链接跳转行为
        
        // 从事件目标获取工件ID（字符串）
        const artifactId = e.target.dataset.artifactId;
        
        if (!artifactId) {
          console.error('[ChatPanel] 工件链接缺少ID');
          return;
        }
        
        // 处理工件点击（传递字符串ID）
        this._handleArtifactClick(artifactId);
      }
      
      // 检查是否点击了图片（包括消息附件中的图片和工件缩略图）
      if (e.target.tagName === 'IMG' && e.target.dataset.artifactId) {
        e.preventDefault(); // 阻止默认行为
        
        // 从事件目标获取工件ID（字符串）
        const artifactId = e.target.dataset.artifactId;
        
        if (!artifactId) {
          console.error('[ChatPanel] 图片缺少工件ID');
          return;
        }
        
        // 处理工件点击（传递字符串ID）
        this._handleArtifactClick(artifactId);
      }
    });
  },

  /**
   * 处理工件点击事件
   * 统一使用工件管理器打开，不再根据类型分发
   * @param {string} artifactId - 工件ID字符串
   * @private
   */
  _handleArtifactClick(artifactId) {
    try {
      // 验证工件ID
      if (!artifactId || typeof artifactId !== 'string') {
        throw new Error('无效的工件ID');
      }
      
      // 统一使用工件管理器打开
      this._openArtifactWithManager(artifactId);
      
    } catch (error) {
      console.error('[ChatPanel] 处理工件点击失败:', {
        artifactId: artifactId,
        error: error.message,
        stack: error.stack
      });
      
      // 使用统一的错误处理
      this._handleArtifactError(artifactId, error, '工件点击处理失败');
    }
  },

  /**
   * 使用工件管理器打开工件
   * 只传递ID字符串，工件管理器会自己获取元数据
   * @param {string} artifactId - 工件ID字符串
   * @private
   */
  _openArtifactWithManager(artifactId) {
    try {
      // 使用单例模式获取实例
      const manager = ArtifactManager.getInstance();
      
      // 显示工件管理器窗口
      manager.show();
      
      // 打开工件（只传递ID字符串）
      manager.openArtifact(artifactId);
      
    } catch (error) {
      console.error('[ChatPanel] 使用工件管理器打开工件失败:', error);
      
      // 抛出错误，让调用者处理
      throw new Error(`工件管理器打开失败: ${error.message}`);
    }
  },

  /**
   * 在新标签页中打开工件（后备方案）
   * @param {string} artifactId - 工件ID字符串
   * @private
   */
  _openArtifactInNewTab(artifactId) {
    try {
      if (!artifactId) {
        throw new Error('工件ID为空');
      }
      
      const artifactUrl = `/artifacts/${encodeURIComponent(artifactId)}`;
      const newWindow = window.open(artifactUrl, '_blank');
      
      // 检查是否成功打开新窗口（可能被弹窗阻止器阻止）
      if (!newWindow) {
        throw new Error('无法打开新窗口，可能被弹窗阻止器阻止');
      }
      
    } catch (error) {
      console.error('[ChatPanel] 在新标签页打开工件失败:', error);
      
      // 抛出错误，让调用者处理
      throw new Error(`新标签页打开失败: ${error.message}`);
    }
  },

  /**
   * 处理工件错误的统一方法
   * @param {string} artifactId - 工件ID字符串
   * @param {Error} error - 错误对象
   * @param {string} userMessage - 用户友好的错误消息
   * @private
   */
  _handleArtifactError(artifactId, error, userMessage) {
    // 记录详细错误信息
    console.error('[ChatPanel] 工件处理错误:', {
      artifactId: artifactId,
      userMessage: userMessage,
      error: error.message,
      stack: error.stack
    });
    
    // 显示用户友好的错误提示
    this._showArtifactClickError(artifactId, error, userMessage);
  },

  /**
   * 显示工件点击错误提示
   * @param {string} artifactId - 工件ID字符串
   * @param {Error} error - 错误对象
   * @param {string} userMessage - 用户友好的错误消息
   * @private
   */
  _showArtifactClickError(artifactId, error, userMessage = '打开工件失败') {
    const fullMessage = `${userMessage}: ${error.message}`;
    
    // 使用 Toast 显示错误（如果可用）
    if (window.Toast) {
      window.Toast.show(fullMessage, 'error');
      
      // 延迟显示后备选项，避免同时弹出多个提示
      setTimeout(() => {
        this._showFallbackOptions(artifactId);
      }, 2000);
      
    } else {
      // 后备方案：使用 alert
      alert(fullMessage);
      this._showFallbackOptions(artifactId);
    }
  },

  /**
   * 显示后备选项
   * @param {string} artifactId - 工件ID字符串
   * @private
   */
  _showFallbackOptions(artifactId) {
    // 构建后备选项
    const options = [];
    
    // 选项1：在新标签页中打开
    options.push({
      text: '在新标签页中打开',
      action: () => {
        try {
          this._openArtifactInNewTab(artifactId);
        } catch (fallbackError) {
          console.error('[ChatPanel] 后备方案也失败了:', fallbackError);
          if (window.Toast) {
            window.Toast.show('所有打开方式都失败了', 'error');
          } else {
            alert('所有打开方式都失败了');
          }
        }
      }
    });
    
    // 选项2：复制工件链接
    options.push({
      text: '复制工件链接',
      action: () => {
        const artifactUrl = `${window.location.origin}/artifacts/${encodeURIComponent(artifactId)}`;
        this._copyToClipboard(artifactUrl, '工件链接已复制到剪贴板');
      }
    });
    
    // 选项3：查看工件信息
    options.push({
      text: '查看工件信息',
      action: () => {
        this._showArtifactInfo(artifactId);
      }
    });
    
    // 如果有 Toast 系统，使用更友好的选项显示
    if (window.Toast && window.Toast.showOptions) {
      window.Toast.showOptions('选择其他方式打开工件:', options);
    } else {
      // 后备方案：使用 confirm 对话框
      const optionText = options.map((opt, index) => `${index + 1}. ${opt.text}`).join('\n');
      const choice = prompt(`选择其他方式打开工件:\n${optionText}\n\n请输入选项编号 (1-${options.length}):`);
      
      const choiceIndex = parseInt(choice) - 1;
      if (choiceIndex >= 0 && choiceIndex < options.length) {
        options[choiceIndex].action();
      }
    }
  },

  /**
   * 复制文本到剪贴板
   * @param {string} text - 要复制的文本
   * @param {string} successMessage - 成功消息
   * @private
   */
  _copyToClipboard(text, successMessage = '已复制到剪贴板') {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        // 使用现代 Clipboard API
        navigator.clipboard.writeText(text).then(() => {
          if (window.Toast) {
            window.Toast.show(successMessage, 'success');
          } else {
            alert(successMessage);
          }
        }).catch((error) => {
          console.error('[ChatPanel] 复制到剪贴板失败:', error);
          this._fallbackCopyToClipboard(text, successMessage);
        });
      } else {
        // 后备方案
        this._fallbackCopyToClipboard(text, successMessage);
      }
    } catch (error) {
      console.error('[ChatPanel] 复制操作失败:', error);
      if (window.Toast) {
        window.Toast.show('复制失败', 'error');
      } else {
        alert('复制失败');
      }
    }
  },

  /**
   * 后备的复制到剪贴板方法
   * @param {string} text - 要复制的文本
   * @param {string} successMessage - 成功消息
   * @private
   */
  _fallbackCopyToClipboard(text, successMessage) {
    try {
      // 创建临时文本区域
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      
      // 选择并复制
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      
      // 清理
      document.body.removeChild(textArea);
      
      if (successful) {
        if (window.Toast) {
          window.Toast.show(successMessage, 'success');
        } else {
          alert(successMessage);
        }
      } else {
        throw new Error('execCommand 复制失败');
      }
    } catch (error) {
      console.error('[ChatPanel] 后备复制方法失败:', error);
      // 最后的后备方案：显示文本让用户手动复制
      prompt('请手动复制以下链接:', text);
    }
  },

  /**
   * 显示工件信息
   * @param {string} artifactId - 工件ID字符串
   * @private
   */
  _showArtifactInfo(artifactId) {
    const info = [
      `工件ID: ${artifactId}`,
      `工件链接: ${window.location.origin}/artifacts/${encodeURIComponent(artifactId)}`
    ].join('\n');
    
    if (window.Toast && window.Toast.showInfo) {
      window.Toast.showInfo('工件信息', info);
    } else {
      alert(`工件信息:\n\n${info}`);
    }
  },

  /**
   * 附件状态变化回调
   * @param {object} state - 状态对象
   * @private
   */
  _onAttachmentStateChange(state) {
    // 更新发送按钮状态
    if (this.sendBtn) {
      if (state.hasUploading) {
        this.sendBtn.disabled = true;
        this.sendBtn.classList.add('uploading');
      } else {
        this.sendBtn.disabled = false;
        this.sendBtn.classList.remove('uploading');
      }
    }
  },

  /**
   * 设置当前智能体
   * @param {object} agent - 智能体对象
   */
  setAgent(agent) {
    this.currentAgent = agent;
    this.currentAgentId = agent ? agent.id : null;
    this.updateHeader();
  },

  /**
   * 更新头部信息
   */
  updateHeader() {
    if (this.headerTitle) {
      this.headerTitle.textContent = this.currentAgent ? this.getAgentShortName(this.currentAgent) : '选择一个智能体';
    }
    if (this.headerRole) {
      this.headerRole.textContent = this.currentAgent ? (this.currentAgent.roleName || '') : '';
      this.headerRole.style.display = this.currentAgent?.roleName ? 'inline-block' : 'none';
    }
    if (this.headerStatus) {
      if (this.currentAgent?.status === 'terminated') {
        this.headerStatus.textContent = '已终止';
        this.headerStatus.style.color = '#f44336';
      } else {
        this.headerStatus.textContent = '';
      }
    }
    
    // 更新或创建详情按钮
    this.updateDetailButton();
    
    this.updateInputPlaceholder();
  },

  /**
   * 更新详情按钮
   */
  updateDetailButton() {
    const chatTitle = document.querySelector('.chat-title');
    if (!chatTitle) return;
    
    let detailBtn = chatTitle.querySelector('.agent-detail-btn');
    
    if (this.currentAgent) {
      if (!detailBtn) {
        detailBtn = document.createElement('button');
        detailBtn.className = 'agent-detail-btn';
        detailBtn.title = '查看详情';
        detailBtn.textContent = 'ℹ️';
        chatTitle.appendChild(detailBtn);
      }
      detailBtn.onclick = () => {
        if (window.AgentDetailModal && this.currentAgentId) {
          window.AgentDetailModal.show(this.currentAgentId);
        }
      };
      detailBtn.style.display = 'inline-block';
    } else if (detailBtn) {
      detailBtn.style.display = 'none';
    }
  },

  /**
   * 获取智能体显示名称（岗位（ID）格式）
   * @param {string} agentId - 智能体 ID
   * @returns {string} 显示名称
   */
  getAgentDisplayName(agentId) {
    if (!agentId) return '未知';
    if (agentId === 'user' || agentId === 'root') {
      return agentId;
    }
    if (window.App && window.App.agentsById) {
      const agent = window.App.agentsById.get(agentId);
      if (agent) {
        // 优先使用自定义名称
        if (agent.customName) {
          return agent.customName;
        }
        if (agent.roleName) {
          return `${agent.roleName}（${agentId}）`;
        }
      }
    }
    return agentId;
  },

  /**
   * 获取智能体简短显示名称（用于头部）
   * @param {object} agent - 智能体对象
   * @returns {string} 显示名称
   */
  getAgentShortName(agent) {
    if (!agent) return '选择一个智能体';
    // 优先使用自定义名称
    if (agent.customName) {
      return agent.customName;
    }
    return agent.id;
  },

  /**
   * 更新输入框 placeholder
   */
  updateInputPlaceholder() {
    if (!this.chatInput || !this.currentAgentId) return;
    
    // 确定消息发送目标
    let targetId = this.currentAgentId;
    if (this.currentAgentId === 'user') {
      // user 界面时，目标是最后给 user 发消息的智能体，如果没有则是 root
      targetId = this.getLastSenderId() || 'root';
    }
    
    const displayName = this.getAgentDisplayName(targetId);
    this.chatInput.placeholder = `向 ${displayName} 发送消息...`;
  },

  /**
   * 设置消息列表
   * @param {Array} messages - 消息数组
   */
  setMessages(messages) {
    this.messages = messages || [];
    this.messagesById.clear();
    this.messages.forEach(msg => {
      this.messagesById.set(msg.id, msg);
    });
    this.render();
    this.scrollToBottom();
    this.updateInputPlaceholder();
    
    // 检查最后一条消息是否是错误消息，如果是则显示弹窗
    if (this.messages.length > 0) {
      const lastMsg = this.messages[this.messages.length - 1];
      // 只对真正的错误消息显示弹窗，中断消息（kind === 'abort'）不显示
      if (lastMsg.payload && lastMsg.payload.kind === 'error' && window.ErrorModal) {
        // 只显示最近5分钟内的错误
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const msgTime = new Date(lastMsg.createdAt).getTime();
        if (msgTime > fiveMinutesAgo) {
          window.ErrorModal.checkAndShowError(lastMsg);
        }
      }
    }
    
    // 异步加载思考过程
    this.loadThinkingContent();
  },

  /**
   * 加载思考过程内容
   */
  async loadThinkingContent() {
    if (!this.currentAgentId || this.currentAgentId === 'user') {
      this.thinkingMap = {};
      return;
    }

    try {
      const result = await API.getAgentConversation(this.currentAgentId);
      this.thinkingMap = result.thinkingMap || {};
      // 重新渲染以显示思考过程
      if (Object.keys(this.thinkingMap).length > 0) {
        this.render();
      }
    } catch (err) {
      console.warn('加载思考过程失败:', err);
      this.thinkingMap = {};
    }
  },

  /**
   * 追加新消息
   * @param {object} message - 消息对象
   */
  appendMessage(message) {
    // 避免重复添加
    if (this.messagesById.has(message.id)) {
      return;
    }
    this.messages.push(message);
    this.messagesById.set(message.id, message);
    
    // 检查是否是错误消息，如果是则显示错误弹窗（中断消息不显示）
    if (window.ErrorModal && message.payload && message.payload.kind === 'error') {
      window.ErrorModal.checkAndShowError(message);
    }
    
    this.render();
    this.scrollToBottom();
    this.updateInputPlaceholder();
  },

  /**
   * 判断消息是否为当前智能体发送
   * @param {object} message - 消息对象
   * @returns {boolean}
   */
  isSentMessage(message) {
    return message.from === this.currentAgentId;
  },

  /**
   * 格式化消息时间
   * @param {string} isoTime - ISO 格式时间
   * @returns {string} 格式化后的时间
   */
  formatMessageTime(isoTime) {
    if (!isoTime) return '';
    const date = new Date(isoTime);
    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  },

  /**
   * 渲染延迟消息的预计到达时间标记
   * @param {object} message - 消息对象
   * @returns {string} HTML 字符串，如果不是延迟消息则返回空字符串
   */
  renderScheduledDeliveryTime(message) {
    if (!message.scheduledDeliveryTime) {
      return '';
    }
    
    const scheduledTime = new Date(message.scheduledDeliveryTime);
    const formattedTime = scheduledTime.toLocaleString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    
    const fullTime = scheduledTime.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    
    return `<span class="scheduled-delivery-time" title="预计到达时间: ${fullTime}">⏰ ${formattedTime}</span>`;
  },

  /**
   * 获取消息内容文本
   * @param {object} message - 消息对象
   * @returns {string} 消息文本
   */
  getMessageText(message) {
    if (!message.payload) return '[空消息]';
    
    // 尝试获取消息内容
    if (typeof message.payload === 'string') {
      return message.payload;
    }
    
    // 按优先级尝试提取文本字段
    if (message.payload.text) {
      return typeof message.payload.text === 'object' 
        ? JSON.stringify(message.payload.text, null, 2)
        : message.payload.text;
    }
    if (message.payload.content) {
      return typeof message.payload.content === 'object'
        ? JSON.stringify(message.payload.content, null, 2)
        : message.payload.content;
    }
    if (message.payload.message) {
      return typeof message.payload.message === 'object'
        ? JSON.stringify(message.payload.message, null, 2)
        : message.payload.message;
    }
    
    // 如果是对象，格式化为 JSON 显示
    try {
      const json = JSON.stringify(message.payload, null, 2);
      return json;
    } catch (e) {
      return '[无法解析的消息]';
    }
  },

  /**
   * 获取发送者显示名称
   * @param {object} message - 消息对象
   * @returns {string} 发送者名称，格式为 "岗位（ID）"，user 和 root 保持原样
   */
  getSenderName(message) {
    return this.getAgentDisplayName(message.from);
  },

  /**
   * 获取接收者显示名称
   * @param {object} message - 消息对象
   * @returns {string} 接收者名称，格式为 "岗位（ID）"，user 和 root 保持原样
   */
  getReceiverName(message) {
    return this.getAgentDisplayName(message.to);
  },

  /**
   * 渲染消息列表
   */
  render() {
    if (!this.messageList) return;
    
    // 清空待渲染的 JSON 查看器列表
    this._pendingJsonViewers = [];

    if (!this.currentAgentId) {
      this.messageList.innerHTML = `
        <div class="empty-state">请从左侧选择一个智能体查看对话</div>
      `;
      return;
    }

    if (this.messages.length === 0) {
      this.messageList.innerHTML = `
        <div class="empty-state">暂无消息</div>
      `;
      return;
    }

    // 将连续的工具调用消息分组
    const groupedMessages = this.groupConsecutiveToolCalls(this.messages);

    const html = groupedMessages.map(item => {
      // 如果是工具调用组
      if (item.type === 'tool_call_group') {
        return this.renderToolCallGroup(item.messages);
      }
      
      const message = item;
      
      // 检查是否为单个工具调用消息（不应该出现，但作为后备）
      if (message.type === 'tool_call') {
        return this.renderToolCallGroup([message]);
      }
      
      // 检查是否为错误消息
      if (message.payload && message.payload.kind === 'error') {
        return this.renderErrorMessage(message);
      }
      
      // 检查是否为中断消息（用户中断，使用橙色警告样式）
      if (message.payload && message.payload.kind === 'abort') {
        return this.renderAbortMessage(message);
      }
      
      const isSent = this.isSentMessage(message);
      const messageClass = isSent ? 'sent' : 'received';
      const senderName = this.getSenderName(message);
      const receiverName = this.getReceiverName(message);
      const messageText = this.getMessageText(message);
      const time = this.formatMessageTime(message.createdAt);
      
      // 构建延迟消息标记
      const scheduledTimeHtml = this.renderScheduledDeliveryTime(message);

      // 构建发送者/接收者显示文本
      let headerText = '';
      if (isSent) {
        // 当前智能体发出的消息，显示"发给 xxx"
        headerText = `
          <span class="message-sender">${this.escapeHtml(senderName)}</span>
          <span class="message-receiver">→ <a href="#" onclick="ChatPanel.navigateToSender('${message.to}', '${message.id}'); return false;">${this.escapeHtml(receiverName)}</a></span>
        `;
      } else {
        // 收到的消息，显示发送者（可点击跳转）
        headerText = `
          <a class="message-sender" href="#" onclick="ChatPanel.navigateToSender('${message.from}', '${message.id}'); return false;">
            ${this.escapeHtml(senderName)}
          </a>
        `;
      }

      // 构建思考过程折叠标签
      const thinkingHtml = this.renderThinkingSection(message);
      
      // 构建附件显示
      const attachmentsHtml = this.renderMessageAttachments(message);
      
      // 构建快速回复按钮（仅对收到的消息显示）
      const quickRepliesHtml = !isSent ? this.renderQuickReplies(message) : '';

      return `
        <div class="message-item ${messageClass}" data-message-id="${message.id}">
          <div class="message-avatar">${senderName.charAt(0).toUpperCase()}</div>
          <div class="message-content">
            <div class="message-header">
              ${headerText}
              <span class="message-time">${time}</span>
              ${scheduledTimeHtml}
            </div>
            ${thinkingHtml}
            <div class="message-bubble">${this.escapeHtml(messageText)}</div>
            ${attachmentsHtml}
            ${quickRepliesHtml}
            <button class="message-detail-btn" onclick="MessageModal.show('${message.id}')">
              详情
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.messageList.innerHTML = html;
    
    // 渲染完成后初始化 JSON 查看器
    this._initPendingJsonViewers();
  },
  
  /**
   * 初始化待渲染的 JSON 查看器
   * @private
   */
  _initPendingJsonViewers() {
    if (!this._pendingJsonViewers || this._pendingJsonViewers.length === 0) return;
    
    this._pendingJsonViewers.forEach(item => {
      const argsContainer = document.getElementById(item.argsContainerId);
      const resultContainer = document.getElementById(item.resultContainerId);
      
      if (argsContainer && typeof JSONViewer !== 'undefined') {
        const argsViewer = new JSONViewer({ container: argsContainer });
        argsViewer.render(item.args);
      }
      
      if (resultContainer && typeof JSONViewer !== 'undefined') {
        const resultViewer = new JSONViewer({ container: resultContainer });
        if (item.result !== undefined && item.result !== null) {
          resultViewer.render(item.result);
        } else {
          resultContainer.innerHTML = '<span class="json-null">(无返回值)</span>';
        }
      }
    });
    
    // 清空待渲染列表
    this._pendingJsonViewers = [];
  },

  /**
   * 将连续的工具调用消息分组
   * @param {Array} messages - 消息数组
   * @returns {Array} 分组后的消息数组，工具调用组为 { type: 'tool_call_group', messages: [...] }
   */
  groupConsecutiveToolCalls(messages) {
    const result = [];
    let currentToolCallGroup = [];

    for (const message of messages) {
      if (message.type === 'tool_call') {
        currentToolCallGroup.push(message);
      } else {
        // 如果有累积的工具调用组，先添加到结果
        if (currentToolCallGroup.length > 0) {
          result.push({ type: 'tool_call_group', messages: currentToolCallGroup });
          currentToolCallGroup = [];
        }
        result.push(message);
      }
    }

    // 处理末尾的工具调用组
    if (currentToolCallGroup.length > 0) {
      result.push({ type: 'tool_call_group', messages: currentToolCallGroup });
    }

    return result;
  },

  /**
   * 渲染工具调用组（多个连续工具调用合并为一条消息）
   * @param {Array} toolCallMessages - 工具调用消息数组
   * @returns {string} HTML 字符串
   */
  renderToolCallGroup(toolCallMessages) {
    if (toolCallMessages.length === 0) return '';

    const firstMessage = toolCallMessages[0];
    const lastMessage = toolCallMessages[toolCallMessages.length - 1];
    const startTime = this.formatMessageTime(firstMessage.createdAt);
    const endTime = this.formatMessageTime(lastMessage.createdAt);
    const timeDisplay = toolCallMessages.length > 1 ? `${startTime} - ${endTime}` : startTime;
    
    // 生成组的唯一 ID
    const groupId = `tool-group-${firstMessage.id}`;
    const artifactsContainerId = `artifacts-${groupId}`;
    
    // 渲染每个工具调用的详情
    const toolCallsHtml = toolCallMessages.map((message, index) => {
      return this.renderToolCallItem(message, index, groupId);
    }).join('');

    // 工具名称列表（用于显示摘要）
    const toolNames = toolCallMessages.map(m => m.payload?.toolName || '未知工具');
    const toolNamesDisplay = toolNames.length <= 3 
      ? toolNames.join(', ') 
      : `${toolNames.slice(0, 3).join(', ')} 等 ${toolNames.length} 个工具`;

    // 异步加载工件（先渲染占位符）
    setTimeout(() => {
      this._loadToolCallGroupArtifacts(toolCallMessages, artifactsContainerId);
    }, 0);

    return `
      <div class="message-item tool-call tool-call-group" data-message-id="${firstMessage.id}">
        <div class="message-avatar">🔧</div>
        <div class="message-content">
          <div class="message-header">
            <span class="tool-call-label">工具调用</span>
            <span class="tool-call-count">${toolCallMessages.length} 次</span>
            <span class="message-time">${timeDisplay}</span>
          </div>
          <div class="tool-call-summary">
            ${this.escapeHtml(toolNamesDisplay)}
          </div>
          <div class="tool-call-group-wrapper">
            <div class="tool-call-group-toggle" onclick="ChatPanel.toggleToolCallGroup('${groupId}')">
              <span class="tool-call-toggle-arrow" id="${groupId}-arrow">▶</span>
              <span class="tool-call-toggle-label">展开全部工具调用</span>
            </div>
            <div class="tool-call-group-content hidden" id="${groupId}">
              ${toolCallsHtml}
            </div>
          </div>
          <div id="${artifactsContainerId}" class="artifacts-loading">加载工件中...</div>
        </div>
      </div>
    `;
  },

  /**
   * 异步加载工具调用组的工件并更新DOM
   * @param {Array} toolCallMessages - 工具调用消息数组
   * @param {string} containerId - 容器元素ID
   * @private
   */
  async _loadToolCallGroupArtifacts(toolCallMessages, containerId) {
    try {
      const html = await this.renderToolCallGroupArtifacts(toolCallMessages);
      const container = document.getElementById(containerId);
      if (container) {
        container.outerHTML = html;
      }
    } catch (error) {
      console.error('[ChatPanel] 加载工件失败:', error);
      const container = document.getElementById(containerId);
      if (container) {
        container.innerHTML = '<div class="artifacts-error">工件加载失败</div>';
        container.classList.remove('artifacts-loading');
        container.classList.add('artifacts-error');
      }
    }
  },

  /**
   * 渲染工具调用组中创建的所有工件
   * 按类型分组显示：图片（缩略图）、可打开文件（链接）、下载文件（下载链接）
   * @param {Array} toolCallMessages - 工具调用消息数组
   * @returns {Promise<string>} HTML 字符串
   */
  async renderToolCallGroupArtifacts(toolCallMessages) {
    // 收集所有工具调用中创建的工件ID
    const allArtifactIds = this._collectAllArtifacts(toolCallMessages);
    
    if (allArtifactIds.length === 0) return '';
    
    // 批量获取元数据
    const metadataMap = await this._getArtifactsMetadataMap(allArtifactIds);
    
    // 分组渲染
    return this._renderArtifactGroups(allArtifactIds, metadataMap);
  },

  /**
   * 从工具调用消息中收集所有工件ID
   * 统一处理 artifactIds 数组格式
   * @param {Array} toolCallMessages - 工具调用消息数组
   * @returns {Array<string>} 工件ID字符串数组
   * @private
   */
  _collectAllArtifacts(toolCallMessages) {
    const allArtifactIds = [];
    
    for (const message of toolCallMessages) {
      if (!message.payload || !message.payload.result) continue;
      
      // 统一处理 artifactIds 数组格式
      if (Array.isArray(message.payload.result.artifactIds)) {
        message.payload.result.artifactIds.forEach(artifactId => {
          if (artifactId && typeof artifactId === 'string') {
            allArtifactIds.push(artifactId);
          }
        });
      }
    }
    
    return allArtifactIds;
  },

  /**
   * 批量获取工件元数据
   * @param {string[]} artifactIds - 工件ID数组
   * @returns {Promise<Map<string, Object>>} 元数据Map
   * @private
   */
  async _getArtifactsMetadataMap(artifactIds) {
    try {
      const manager = ArtifactManager.getInstance();
      return await manager.getArtifactsMetadata(artifactIds);
    } catch (error) {
      console.error('[ChatPanel] 获取工件元数据失败:', error);
      return new Map();
    }
  },

  /**
   * 根据元数据将工件分组
   * @param {string[]} artifactIds - 工件ID数组
   * @param {Map<string, Object>} metadataMap - 元数据Map
   * @returns {Object} 分组结果 { images: [], openable: [], downloadOnly: [] }
   * @private
   */
  _groupArtifactsByType(artifactIds, metadataMap) {
    const groups = {
      images: [],      // 图片类型
      openable: [],    // 可打开类型
      downloadOnly: [] // 仅下载类型
    };
    
    artifactIds.forEach(id => {
      const metadata = metadataMap.get(id);
      
      if (!metadata) {
        // 元数据获取失败，归入下载组
        groups.downloadOnly.push({ id, name: id, type: null });
        return;
      }
      
      const mimeType = metadata.type;
      
      // 判断类型
      if (isImageType(mimeType)) {
        groups.images.push({ id, metadata });
      } else if (ArtifactManager.canOpenMimeType(mimeType)) {
        groups.openable.push({ id, metadata });
      } else {
        groups.downloadOnly.push({ id, metadata });
      }
    });
    
    return groups;
  },

  /**
   * 渲染分组后的工件
   * @param {string[]} artifactIds - 工件ID数组
   * @param {Map<string, Object>} metadataMap - 元数据Map
   * @returns {string} HTML字符串
   * @private
   */
  _renderArtifactGroups(artifactIds, metadataMap) {
    const groups = this._groupArtifactsByType(artifactIds, metadataMap);
    
    let html = '<div class="tool-call-group-artifacts">';
    html += '<div class="tool-call-group-artifacts-label">创建的工件:</div>';
    
    // 渲染图片组
    if (groups.images.length > 0) {
      html += '<div class="artifact-group artifact-group-images">';
      html += '<div class="artifact-group-label">图片:</div>';
      html += '<div class="artifact-thumbnails">';
      groups.images.forEach(({ id, metadata }) => {
        html += this._renderImageThumbnail(id, metadata);
      });
      html += '</div></div>';
    }
    
    // 渲染可打开组
    if (groups.openable.length > 0) {
      html += '<div class="artifact-group artifact-group-openable">';
      html += '<div class="artifact-group-label">可打开:</div>';
      html += '<div class="artifact-links">';
      groups.openable.forEach(({ id, metadata }) => {
        html += this._renderOpenableLink(id, metadata);
      });
      html += '</div></div>';
    }
    
    // 渲染下载组
    if (groups.downloadOnly.length > 0) {
      html += '<div class="artifact-group artifact-group-download">';
      html += '<div class="artifact-group-label">下载:</div>';
      html += '<div class="artifact-links">';
      groups.downloadOnly.forEach(({ id, metadata }) => {
        html += this._renderDownloadLink(id, metadata);
      });
      html += '</div></div>';
    }
    
    html += '</div>';
    return html;
  },

  /**
   * 渲染图片缩略图
   * @param {string} id - 工件ID
   * @param {Object} metadata - 元数据
   * @returns {string} HTML字符串
   * @private
   */
  _renderImageThumbnail(id, metadata) {
    const name = metadata.name || id;
    const imageUrl = `/artifacts/${this.escapeHtml(id)}`;
    
    return `
      <div class="artifact-thumbnail-item" title="${this.escapeHtml(name)}">
        <img 
          class="artifact-thumbnail-img" 
          src="${imageUrl}" 
          alt="${this.escapeHtml(name)}"
          data-artifact-id="${this.escapeHtml(id)}"
          onerror="this.parentElement.innerHTML='<span class=\\'thumbnail-error\\'>🖼️</span>'"
        />
        <div class="artifact-thumbnail-name">${this.escapeHtml(this._truncateName(name, 15))}</div>
      </div>
    `;
  },

  /**
   * 渲染可打开链接
   * @param {string} id - 工件ID
   * @param {Object} metadata - 元数据
   * @returns {string} HTML字符串
   * @private
   */
  _renderOpenableLink(id, metadata) {
    const name = metadata.name || id;
    const icon = getFileIconByMimeType(metadata.type);
    
    return `
      <a 
        class="artifact-link artifact-link-openable" 
        href="/artifacts/${this.escapeHtml(id)}" 
        title="${this.escapeHtml(name)}"
        data-artifact-id="${this.escapeHtml(id)}"
      >
        <span class="artifact-link-icon">${icon}</span>
        <span class="artifact-link-name">${this.escapeHtml(name)}</span>
      </a>
    `;
  },

  /**
   * 渲染下载链接
   * @param {string} id - 工件ID
   * @param {Object} metadata - 元数据
   * @returns {string} HTML字符串
   * @private
   */
  _renderDownloadLink(id, metadata) {
    const name = metadata ? metadata.name : id;
    const icon = metadata ? getFileIconByMimeType(metadata.type) : '📄';
    
    return `
      <a 
        class="artifact-link artifact-link-download" 
        href="/artifacts/${this.escapeHtml(id)}" 
        download
        title="下载: ${this.escapeHtml(name)}"
        data-artifact-id="${this.escapeHtml(id)}"
      >
        <span class="artifact-link-icon">${icon}</span>
        <span class="artifact-link-name">${this.escapeHtml(name)}</span>
        <span class="artifact-link-download-icon">⬇️</span>
      </a>
    `;
  },

  /**
   * 截断名称
   * @param {string} name - 名称
   * @param {number} maxLen - 最大长度
   * @returns {string} 截断后的名称
   * @private
   */
  _truncateName(name, maxLen) {
    if (name.length <= maxLen) return name;
    return name.slice(0, maxLen - 3) + '...';
  },

  /**
   * 渲染单个工具调用项（用于组内显示）
   * @param {object} message - 工具调用消息对象
   * @param {number} index - 在组内的索引
   * @param {string} groupId - 组的 ID
   * @returns {string} HTML 字符串
   */
  renderToolCallItem(message, index, groupId) {
    const time = this.formatMessageTime(message.createdAt);
    const toolName = message.payload?.toolName || '未知工具';
    const args = message.payload?.args || {};
    const result = message.payload?.result;

    // 构建思考过程折叠标签
    const thinkingHtml = this.renderThinkingSection(message);
    
    // 生成唯一 ID 用于折叠控制和 JSON 查看器容器
    const detailsId = `tool-details-${message.id}`;
    const argsContainerId = `tool-args-json-${message.id}`;
    const resultContainerId = `tool-result-json-${message.id}`;
    
    // 存储数据供后续渲染 JSON 查看器使用
    this._pendingJsonViewers = this._pendingJsonViewers || [];
    this._pendingJsonViewers.push({
      argsContainerId,
      resultContainerId,
      args,
      result
    });

    return `
      <div class="tool-call-item" data-message-id="${message.id}">
        <div class="tool-call-item-header">
          <span class="tool-call-item-index">#${index + 1}</span>
          <span class="tool-name">${this.escapeHtml(toolName)}</span>
          <span class="message-time">${time}</span>
          <button class="message-detail-btn tool-call-item-detail-btn" onclick="MessageModal.show('${message.id}')">
            详情
          </button>
        </div>
        ${thinkingHtml}
        <div class="tool-call-details-wrapper">
          <div class="tool-call-toggle" onclick="ChatPanel.toggleToolDetails('${detailsId}')">
            <span class="tool-call-toggle-arrow" id="${detailsId}-arrow">▶</span>
            <span class="tool-call-toggle-label">参数与结果</span>
          </div>
          <div class="tool-call-details hidden" id="${detailsId}">
            <div class="tool-call-section">
              <span class="tool-call-section-label">参数:</span>
              <div class="tool-call-json-viewer" id="${argsContainerId}"></div>
            </div>
            <div class="tool-call-section">
              <span class="tool-call-section-label">结果:</span>
              <div class="tool-call-json-viewer" id="${resultContainerId}"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 切换工具调用组的展开/折叠状态
   * @param {string} groupId - 组的 ID
   */
  toggleToolCallGroup(groupId) {
    const contentEl = document.getElementById(groupId);
    const arrowEl = document.getElementById(`${groupId}-arrow`);
    const toggleEl = arrowEl?.parentElement;
    
    if (contentEl && arrowEl) {
      const isHidden = contentEl.classList.toggle('hidden');
      arrowEl.textContent = isHidden ? '▶' : '▼';
      if (toggleEl) {
        const label = toggleEl.querySelector('.tool-call-toggle-label');
        if (label) {
          label.textContent = isHidden ? '展开全部工具调用' : '收起工具调用';
        }
      }
    }
  },

  /**
   * 渲染思考过程折叠标签
   * @param {object} message - 消息对象
   * @returns {string} HTML 字符串
   */
  renderThinkingSection(message) {
    // 从消息的原始数据中查找 reasoning_content
    // 需要从对话历史中获取
    const thinkingContent = this.getThinkingContent(message);
    
    if (!thinkingContent) {
      return '';
    }

    const uniqueId = `thinking-${message.id}`;
    return `
      <div class="thinking-section">
        <div class="thinking-toggle" onclick="ChatPanel.toggleThinking('${uniqueId}')">
          <span class="thinking-icon">💭</span>
          <span class="thinking-label">思考过程</span>
          <span class="thinking-arrow" id="${uniqueId}-arrow">▶</span>
        </div>
        <div class="thinking-content hidden" id="${uniqueId}">
          <pre class="thinking-text">${this.escapeHtml(thinkingContent)}</pre>
        </div>
      </div>
    `;
  },

  /**
   * 获取消息的思考内容
   * @param {object} message - 消息对象
   * @returns {string|null} 思考内容
   */
  getThinkingContent(message) {
    // 检查消息 payload 中是否有 reasoning_content
    if (message.payload && message.payload.reasoning_content) {
      return message.payload.reasoning_content;
    }
    // 检查消息本身是否有 reasoning_content（某些格式可能直接存储）
    if (message.reasoning_content) {
      return message.reasoning_content;
    }
    
    // 从 thinkingMap 中查找（基于 tool_call_id）
    if (message.type === 'tool_call' && message.id) {
      // 工具调用消息的 ID 格式为 "tool-{callId}"
      const callId = message.id.replace(/^tool-/, '');
      if (this.thinkingMap[callId]) {
        return this.thinkingMap[callId];
      }
    }
    
    // 尝试用消息内容匹配
    const messageText = this.getMessageText(message);
    if (messageText) {
      const contentKey = `content:${messageText.substring(0, 100)}`;
      if (this.thinkingMap[contentKey]) {
        return this.thinkingMap[contentKey];
      }
    }
    
    return null;
  },

  /**
   * 切换思考过程的展开/折叠状态
   * @param {string} id - 思考内容元素的 ID
   */
  toggleThinking(id) {
    const contentEl = document.getElementById(id);
    const arrowEl = document.getElementById(`${id}-arrow`);
    
    if (contentEl && arrowEl) {
      contentEl.classList.toggle('hidden');
      arrowEl.textContent = contentEl.classList.contains('hidden') ? '▶' : '▼';
    }
  },

  /**
   * 渲染工具调用消息
   * @param {object} message - 工具调用消息对象
   * @returns {string} HTML 字符串
   */
  renderToolCallMessage(message) {
    const time = this.formatMessageTime(message.createdAt);
    const toolName = message.payload?.toolName || '未知工具';
    const args = message.payload?.args || {};
    const result = message.payload?.result;

    // 构建思考过程折叠标签
    const thinkingHtml = this.renderThinkingSection(message);
    
    // 构建附件显示
    const attachmentsHtml = this.renderMessageAttachments(message);
    
    // 生成唯一 ID 用于折叠控制和 JSON 查看器容器
    const detailsId = `tool-details-${message.id}`;
    const argsContainerId = `tool-args-json-${message.id}`;
    const resultContainerId = `tool-result-json-${message.id}`;
    
    // 存储数据供后续渲染 JSON 查看器使用
    this._pendingJsonViewers = this._pendingJsonViewers || [];
    this._pendingJsonViewers.push({
      argsContainerId,
      resultContainerId,
      args,
      result
    });

    return `
      <div class="message-item tool-call" data-message-id="${message.id}">
        <div class="message-avatar">🔧</div>
        <div class="message-content">
          <div class="message-header">
            <span class="tool-call-label">工具调用</span>
            <span class="tool-name">${this.escapeHtml(toolName)}</span>
            <span class="message-time">${time}</span>
          </div>
          ${thinkingHtml}
          <div class="tool-call-details-wrapper">
            <div class="tool-call-toggle" onclick="ChatPanel.toggleToolDetails('${detailsId}')">
              <span class="tool-call-toggle-arrow" id="${detailsId}-arrow">▶</span>
              <span class="tool-call-toggle-label">参数与结果</span>
            </div>
            <div class="tool-call-details hidden" id="${detailsId}">
              <div class="tool-call-section">
                <span class="tool-call-section-label">参数:</span>
                <div class="tool-call-json-viewer" id="${argsContainerId}"></div>
              </div>
              <div class="tool-call-section">
                <span class="tool-call-section-label">结果:</span>
                <div class="tool-call-json-viewer" id="${resultContainerId}"></div>
              </div>
            </div>
          </div>
          ${attachmentsHtml}
          <button class="message-detail-btn" onclick="MessageModal.show('${message.id}')">
            详情
          </button>
        </div>
      </div>
    `;
  },

  /**
   * 切换工具调用详情的展开/折叠状态
   * @param {string} id - 详情内容元素的 ID
   */
  toggleToolDetails(id) {
    const contentEl = document.getElementById(id);
    const arrowEl = document.getElementById(`${id}-arrow`);
    
    if (contentEl && arrowEl) {
      contentEl.classList.toggle('hidden');
      arrowEl.textContent = contentEl.classList.contains('hidden') ? '▶' : '▼';
    }
  },

  /**
   * 渲染中断消息（用户中断，橙色警告样式）
   * @param {object} message - 中断消息对象
   * @returns {string} HTML 字符串
   */
  renderAbortMessage(message) {
    const time = this.formatMessageTime(message.createdAt);
    const senderName = this.getSenderName(message);
    const payload = message.payload || {};
    const abortMessage = payload.message || 'LLM 调用已中断';

    return `
      <div class="message-item abort-message" data-message-id="${message.id}">
        <div class="message-avatar">⏹️</div>
        <div class="message-content">
          <div class="message-header">
            <span class="message-sender">${this.escapeHtml(senderName)}</span>
            <span class="abort-message-indicator">已中断</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-bubble abort-bubble">
            <span class="abort-message-content">⚠️ ${this.escapeHtml(abortMessage)}</span>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 渲染错误消息
   * @param {object} message - 错误消息对象
   * @returns {string} HTML 字符串
   */
  renderErrorMessage(message) {
    const time = this.formatMessageTime(message.createdAt);
    const senderName = this.getSenderName(message);
    const payload = message.payload || {};
    const errorType = payload.errorType || 'unknown_error';
    const errorMessage = payload.message || '发生未知错误';
    
    // 获取错误类型的友好名称
    const errorTypeNames = {
      'llm_call_failed': 'LLM 调用失败',
      'llm_call_aborted': 'LLM 调用已中断',
      'context_limit_exceeded': '上下文超出限制',
      'max_tool_rounds_exceeded': '工具调用次数超限',
      'agent_message_processing_failed': '智能体处理异常',
      'network_error': '网络错误',
      'api_error': 'API 错误'
    };
    const errorTypeName = errorTypeNames[errorType] || errorType;
    
    // 构建详细信息（更完整的错误日志）
    const details = [];
    details.push(`错误类型: ${errorType}`);
    if (payload.agentId) details.push(`智能体: ${payload.agentId}`);
    if (payload.errorName) details.push(`错误名称: ${payload.errorName}`);
    if (payload.originalError) details.push(`原始错误: ${payload.originalError}`);
    if (payload.taskId) details.push(`任务ID: ${payload.taskId}`);
    if (payload.originalMessageId) details.push(`消息ID: ${payload.originalMessageId}`);
    if (payload.timestamp) details.push(`时间: ${new Date(payload.timestamp).toLocaleString('zh-CN')}`);
    const detailsText = details.join('\n');

    return `
      <div class="message-item error-message" data-message-id="${message.id}">
        <div class="message-avatar">❌</div>
        <div class="message-content">
          <div class="message-header">
            <a class="message-sender" href="#" onclick="ChatPanel.navigateToSender('${message.from}', '${message.id}'); return false;">
              ${this.escapeHtml(senderName)}
            </a>
            <span class="error-message-indicator">${this.escapeHtml(errorTypeName)}</span>
            <span class="message-time">${time}</span>
          </div>
          <div class="message-bubble error-bubble">
            <div class="error-message-content">⚠️ ${this.escapeHtml(errorMessage)}</div>
            <pre class="error-message-details">${this.escapeHtml(detailsText)}</pre>
          </div>
          <div class="error-message-actions">
            <button class="error-view-btn" onclick="ChatPanel.showErrorDetail('${message.id}')">
              查看详情
            </button>
            <button class="message-detail-btn" onclick="MessageModal.show('${message.id}')">
              原始数据
            </button>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 显示错误详情弹窗
   * @param {string} messageId - 消息 ID
   */
  showErrorDetail(messageId) {
    const message = this.messagesById.get(messageId);
    if (message && message.payload && window.ErrorModal) {
      window.ErrorModal.show({
        ...message.payload,
        timestamp: message.payload.timestamp || message.createdAt
      });
    }
  },

  /**
   * 导航到发送者的聊天界面并滚动到消息位置
   * @param {string} senderId - 发送者 ID
   * @param {string} messageId - 消息 ID
   */
  navigateToSender(senderId, messageId) {
    // 如果发送者就是当前智能体，只需滚动到消息
    if (senderId === this.currentAgentId) {
      this.scrollToMessage(messageId);
      return;
    }

    // 切换到发送者的聊天界面
    if (window.App && window.App.selectAgentAndScrollToMessage) {
      window.App.selectAgentAndScrollToMessage(senderId, messageId);
    } else if (window.AgentList) {
      // 备用方案：先选择智能体，然后滚动
      window.AgentList.selectAgent(senderId);
      // 延迟滚动，等待消息加载
      setTimeout(() => {
        this.scrollToMessage(messageId);
      }, 300);
    }
  },

  /**
   * 滚动到指定消息
   * @param {string} messageId - 消息 ID
   */
  scrollToMessage(messageId) {
    if (!this.messageList) return;
    
    const messageEl = this.messageList.querySelector(`[data-message-id="${messageId}"]`);
    if (messageEl) {
      messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // 高亮效果
      messageEl.style.backgroundColor = '#fff3cd';
      setTimeout(() => {
        messageEl.style.backgroundColor = '';
      }, 2000);
    }
  },

  /**
   * 滚动到底部
   */
  scrollToBottom() {
    if (this.messageList && this.autoScroll) {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    }
  },

  /**
   * 切换自动滚动状态
   */
  toggleAutoScroll() {
    this.autoScroll = !this.autoScroll;
    this.updateAutoScrollButton();
    if (this.autoScroll) {
      this.scrollToBottom();
    }
  },

  /**
   * 更新自动滚动按钮状态
   */
  updateAutoScrollButton() {
    const btn = document.getElementById('auto-scroll-btn');
    if (btn) {
      btn.classList.toggle('active', this.autoScroll);
      btn.title = this.autoScroll ? '自动滚动：开' : '自动滚动：关';
    }
  },

  /**
   * 初始化自动滚动按钮
   */
  initAutoScrollButton() {
    const messageListContainer = document.querySelector('.message-list');
    if (!messageListContainer) return;
    
    // 检查按钮是否已存在
    if (document.getElementById('auto-scroll-btn')) return;
    
    const btn = document.createElement('button');
    btn.id = 'auto-scroll-btn';
    btn.className = 'auto-scroll-btn active';
    btn.title = '自动滚动：开';
    btn.innerHTML = '⬇';
    btn.onclick = () => this.toggleAutoScroll();
    
    // 将按钮添加到消息列表容器的父元素
    messageListContainer.parentElement.style.position = 'relative';
    messageListContainer.parentElement.appendChild(btn);
  },

  /**
   * 获取最后给当前智能体发消息的发送者 ID
   * @returns {string|null} 发送者 ID，如果没有则返回 null
   */
  getLastSenderId() {
    // 从消息列表中找到最后一条接收的消息（from 不是当前智能体的消息）
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const msg = this.messages[i];
      if (msg.from && msg.from !== this.currentAgentId) {
        return msg.from;
      }
    }
    return null;
  },

  /**
   * 发送消息
   */
  async sendMessage() {
    if (!this.chatInput || !this.currentAgentId) return;

    const text = this.chatInput.value.trim();
    const hasAttachments = window.AttachmentManager && AttachmentManager.hasAttachments();
    
    // 必须有文本或附件
    if (!text && !hasAttachments) return;

    // 确定消息发送目标
    let targetAgentId = this.currentAgentId;
    
    // 如果当前是 user 界面，消息应该发送给最后给 user 发消息的智能体
    // 如果 user 从未收到过消息，则发送给 root
    if (this.currentAgentId === 'user') {
      const lastSenderId = this.getLastSenderId();
      targetAgentId = lastSenderId || 'root';
    }

    // 禁用发送按钮
    if (this.sendBtn) {
      this.sendBtn.disabled = true;
    }

    try {
      let attachments = [];
      
      // 如果有附件，先上传
      if (hasAttachments) {
        this.isUploading = true;
        if (this.sendBtn) {
          this.sendBtn.classList.add('uploading');
        }
        
        // 上传所有待上传的附件
        const pendingFiles = AttachmentManager.getFilesForUpload();
        if (pendingFiles.length > 0 && window.UploadService) {
          const results = await UploadService.uploadAll(
            pendingFiles.map(item => ({
              file: item.file,
              options: item.options
            })),
            (index, progress) => {
              // 更新单个附件的进度
              const item = pendingFiles[index];
              if (item) {
                AttachmentManager.setProgress(item.id, progress);
              }
            }
          );
          
          // 处理上传结果
          for (let i = 0; i < results.length; i++) {
            const result = results[i];
            const item = pendingFiles[i];
            if (result.ok) {
              AttachmentManager.setReady(item.id, result.artifactRef);
            } else {
              console.error('[ChatPanel] 附件上传失败:', {
                filename: item.options.filename,
                type: item.options.type,
                error: result.error,
                message: result.message
              });
              AttachmentManager.setError(item.id, result.message || '上传失败');
              Toast.show(`文件 ${item.options.filename} 上传失败: ${result.message}`, 'error');
            }
          }
        }
        
        // 获取所有已上传的附件引用
        attachments = AttachmentManager.getArtifactRefs();
        
        // 检查是否有上传失败的附件
        if (AttachmentManager.attachments.some(a => a.status === 'error')) {
          Toast.show('部分附件上传失败，请重试', 'warning');
          this.isUploading = false;
          if (this.sendBtn) {
            this.sendBtn.disabled = false;
            this.sendBtn.classList.remove('uploading');
          }
          return;
        }
      }
      
      // 发送消息
      if (window.API && window.API.sendMessageWithAttachments && attachments.length > 0) {
        await API.sendMessageWithAttachments(targetAgentId, text || '', attachments);
      } else {
        await API.sendMessage(targetAgentId, text);
      }
      
      // 清空输入框
      this.chatInput.value = '';
      
      // 清空附件
      if (hasAttachments) {
        AttachmentManager.clear();
      }
      
      // 禁用所有快速回复按钮（用户已发送自定义回复）
      this.disableAllQuickReplies();
      
      // 显示成功提示
      const targetName = this.currentAgentId === 'user' ? `给 ${targetAgentId} ` : '';
      Toast.show(`消息${targetName}已发送`, 'success');
    } catch (error) {
      console.error('发送消息失败:', error);
      Toast.show('发送失败: ' + error.message, 'error');
    } finally {
      // 恢复发送按钮
      this.isUploading = false;
      if (this.sendBtn) {
        this.sendBtn.disabled = false;
        this.sendBtn.classList.remove('uploading');
      }
    }
  },

  /**
   * HTML 转义
   * @param {string} text - 原始文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * 渲染快速回复按钮
   * @param {object} message - 消息对象
   * @returns {string} HTML 字符串
   */
  renderQuickReplies(message) {
    const quickReplies = message.payload?.quickReplies;
    if (!Array.isArray(quickReplies) || quickReplies.length === 0) {
      return '';
    }
    
    const messageId = message.id;
    const buttons = quickReplies.map((text, idx) => `
      <button 
        class="quick-reply-btn" 
        data-message-id="${messageId}"
        data-reply-index="${idx}"
        onclick="ChatPanel.handleQuickReply('${messageId}', ${idx})"
      >
        ${this.escapeHtml(text)}
      </button>
    `).join('');
    
    return `<div class="quick-replies" data-message-id="${messageId}">${buttons}</div>`;
  },

  /**
   * 处理快速回复点击
   * @param {string} messageId - 消息 ID
   * @param {number} replyIndex - 回复选项索引
   */
  async handleQuickReply(messageId, replyIndex) {
    const message = this.messagesById.get(messageId);
    if (!message || !message.payload?.quickReplies) return;
    
    const replyText = message.payload.quickReplies[replyIndex];
    if (!replyText) return;
    
    // 禁用该消息的所有快速回复按钮
    this.disableQuickReplies(messageId);
    
    // 确定消息发送目标
    let targetAgentId = message.from;
    
    // 如果发送者是当前智能体自己，则不发送
    if (targetAgentId === this.currentAgentId) {
      Toast.show('无法回复自己发送的消息', 'warning');
      return;
    }
    
    try {
      await API.sendMessage(targetAgentId, replyText);
      Toast.show('快速回复已发送', 'success');
    } catch (error) {
      console.error('快速回复发送失败:', error);
      Toast.show('发送失败: ' + error.message, 'error');
      // 恢复按钮可点击状态
      this.enableQuickReplies(messageId);
    }
  },

  /**
   * 禁用指定消息的快速回复按钮
   * @param {string} messageId - 消息 ID
   */
  disableQuickReplies(messageId) {
    const container = document.querySelector(`.quick-replies[data-message-id="${messageId}"]`);
    if (container) {
      container.classList.add('disabled');
      container.querySelectorAll('.quick-reply-btn').forEach(btn => {
        btn.disabled = true;
      });
    }
  },

  /**
   * 启用指定消息的快速回复按钮
   * @param {string} messageId - 消息 ID
   */
  enableQuickReplies(messageId) {
    const container = document.querySelector(`.quick-replies[data-message-id="${messageId}"]`);
    if (container) {
      container.classList.remove('disabled');
      container.querySelectorAll('.quick-reply-btn').forEach(btn => {
        btn.disabled = false;
      });
    }
  },

  /**
   * 禁用所有快速回复按钮（用户发送自定义回复后调用）
   */
  disableAllQuickReplies() {
    document.querySelectorAll('.quick-replies').forEach(container => {
      container.classList.add('disabled');
      container.querySelectorAll('.quick-reply-btn').forEach(btn => {
        btn.disabled = true;
      });
    });
  },

  /**
   * 渲染消息中的附件
   * @param {object} message - 消息对象
   * @returns {string} HTML 字符串
   */
  renderMessageAttachments(message) {
    const payload = message?.payload;
    if (!payload || typeof payload !== 'object') return '';
    
    const attachments = payload.attachments;
    if (!Array.isArray(attachments) || attachments.length === 0) return '';
    
    const html = attachments.map((att, idx) => {
      const isImage = att.type === 'image';
      const artifactId = att.artifactRef?.replace('artifact:', '') || '';
      
      if (isImage) {
        // 图片附件：显示缩略图，点击使用工件管理器打开
        return `
          <div class="message-attachment-item image" title="${this.escapeHtml(att.filename)}">
            <img 
              class="message-attachment-thumbnail" 
              src="/artifacts/${this.escapeHtml(artifactId)}" 
              alt="${this.escapeHtml(att.filename)}"
              data-artifact-id="${this.escapeHtml(artifactId)}"
              onerror="this.parentElement.innerHTML='<span class=\\'message-attachment-icon\\'>🖼️</span><span class=\\'message-attachment-name\\'>${this.escapeHtml(att.filename)}</span>'"
            />
          </div>
        `;
      } else {
        // 文件附件：显示图标和文件名，使用工件链接样式
        return `
          <a class="message-attachment-item file artifact-link" href="/artifacts/${this.escapeHtml(artifactId)}" title="${this.escapeHtml(att.filename)}" data-artifact-id="${this.escapeHtml(artifactId)}">
            <span class="message-attachment-icon">📄</span>
            <span class="message-attachment-name">${this.escapeHtml(att.filename)}</span>
          </a>
        `;
      }
    }).join('');
    
    return `<div class="message-attachments">${html}</div>`;
  },
};

// 导出供其他模块使用
window.ChatPanel = ChatPanel;
