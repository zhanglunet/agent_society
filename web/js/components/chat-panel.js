/**
 * 对话面板组件
 * 显示与选中智能体的对话消息，支持发送消息
 */

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
      // user 界面时，目标是最后给 user 发消息的智能体
      targetId = this.getLastSenderId();
    }
    
    if (targetId) {
      const displayName = this.getAgentDisplayName(targetId);
      this.chatInput.placeholder = `向 ${displayName} 发送消息...`;
    } else {
      this.chatInput.placeholder = '等待智能体发送消息...';
    }
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

    const html = this.messages.map(message => {
      // 检查是否为工具调用消息
      if (message.type === 'tool_call') {
        return this.renderToolCallMessage(message);
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
      
      // 构建图片缩略图
      const imagesHtml = this.renderMessageImages(message);
      
      // 构建附件显示
      const attachmentsHtml = this.renderMessageAttachments(message);

      return `
        <div class="message-item ${messageClass}" data-message-id="${message.id}">
          <div class="message-avatar">${senderName.charAt(0).toUpperCase()}</div>
          <div class="message-content">
            <div class="message-header">
              ${headerText}
              <span class="message-time">${time}</span>
            </div>
            ${thinkingHtml}
            <div class="message-bubble">${this.escapeHtml(messageText)}</div>
            ${imagesHtml}
            ${attachmentsHtml}
            <button class="message-detail-btn" onclick="MessageModal.show('${message.id}')">
              详情
            </button>
          </div>
        </div>
      `;
    }).join('');

    this.messageList.innerHTML = html;
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
    
    // 格式化参数显示
    let argsDisplay = '';
    try {
      argsDisplay = JSON.stringify(args, null, 2);
    } catch {
      argsDisplay = String(args);
    }
    
    // 格式化结果显示（简化版）
    let resultDisplay = '';
    try {
      if (result !== undefined && result !== null) {
        const resultStr = JSON.stringify(result, null, 2);
        // 如果结果太长，截断显示
        resultDisplay = resultStr.length > 200 ? resultStr.substring(0, 200) + '...' : resultStr;
      } else {
        resultDisplay = '(无返回值)';
      }
    } catch {
      resultDisplay = String(result);
    }

    // 构建思考过程折叠标签
    const thinkingHtml = this.renderThinkingSection(message);
    
    // 构建图片缩略图
    const imagesHtml = this.renderMessageImages(message);
    
    // 构建附件显示
    const attachmentsHtml = this.renderMessageAttachments(message);
    
    // 生成唯一 ID 用于折叠控制
    const detailsId = `tool-details-${message.id}`;

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
                <pre class="tool-call-args">${this.escapeHtml(argsDisplay)}</pre>
              </div>
              <div class="tool-call-section">
                <span class="tool-call-section-label">结果:</span>
                <pre class="tool-call-result">${this.escapeHtml(resultDisplay)}</pre>
              </div>
            </div>
          </div>
          ${imagesHtml}
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
    if (this.currentAgentId === 'user') {
      const lastSenderId = this.getLastSenderId();
      if (!lastSenderId) {
        Toast.show('没有可回复的智能体，请等待智能体先发送消息', 'warning');
        return;
      }
      targetAgentId = lastSenderId;
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
   * 渲染消息中的图片缩略图
   * @param {object} message - 消息对象
   * @returns {string} HTML 字符串
   */
  renderMessageImages(message) {
    // 从 payload 或 result 中获取 images 数组
    let images = [];
    
    if (message.payload) {
      if (Array.isArray(message.payload.images)) {
        images = message.payload.images;
      } else if (message.payload.result && Array.isArray(message.payload.result.images)) {
        images = message.payload.result.images;
      }
    }
    
    if (images.length === 0) return '';
    
    // 生成唯一 ID 用于存储图片数组
    const imagesId = `images_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    // 将图片数组存储到全局，供点击时使用
    window._chatPanelImages = window._chatPanelImages || {};
    window._chatPanelImages[imagesId] = images;
    
    return `
      <div class="message-images">
        ${images.map((img, idx) => `
          <img 
            class="message-thumbnail" 
            src="/artifacts/${this.escapeHtml(img)}" 
            alt="图片 ${idx + 1}"
            onclick="ImageViewer.show(window._chatPanelImages['${imagesId}'], ${idx})"
            onerror="this.classList.add('error'); this.alt='加载失败'"
          />
        `).join('')}
      </div>
    `;
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
        // 图片附件：显示缩略图
        const imagesId = `msg_att_${message.id}_${idx}`;
        window._chatPanelImages = window._chatPanelImages || {};
        window._chatPanelImages[imagesId] = [artifactId];
        
        return `
          <div class="message-attachment-item image" title="${this.escapeHtml(att.filename)}">
            <img 
              class="message-attachment-thumbnail" 
              src="/artifacts/${this.escapeHtml(artifactId)}" 
              alt="${this.escapeHtml(att.filename)}"
              onclick="ImageViewer.show(window._chatPanelImages['${imagesId}'], 0)"
              onerror="this.parentElement.innerHTML='<span class=\\'message-attachment-icon\\'>🖼️</span><span class=\\'message-attachment-name\\'>${this.escapeHtml(att.filename)}</span>'"
            />
          </div>
        `;
      } else {
        // 文件附件：显示图标和文件名
        return `
          <a class="message-attachment-item file" href="/artifacts/${this.escapeHtml(artifactId)}" target="_blank" title="${this.escapeHtml(att.filename)}">
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
