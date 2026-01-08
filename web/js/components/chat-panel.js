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

  // DOM 元素引用
  headerTitle: null,
  headerRole: null,
  headerStatus: null,
  messageList: null,
  chatInput: null,
  sendBtn: null,

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
    
    // 异步加载思考过程
    this.loadThinkingContent();
  },

  /**
   * 加载思考过程内容
   */
  async loadThinkingContent() {
    if (!this.currentAgentId || this.currentAgentId === 'user' || this.currentAgentId === 'root') {
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
          <div class="tool-call-details">
            <div class="tool-call-section">
              <span class="tool-call-section-label">参数:</span>
              <pre class="tool-call-args">${this.escapeHtml(argsDisplay)}</pre>
            </div>
            <div class="tool-call-section">
              <span class="tool-call-section-label">结果:</span>
              <pre class="tool-call-result">${this.escapeHtml(resultDisplay)}</pre>
            </div>
          </div>
          ${imagesHtml}
          <button class="message-detail-btn" onclick="MessageModal.show('${message.id}')">
            详情
          </button>
        </div>
      </div>
    `;
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
    if (this.messageList) {
      this.messageList.scrollTop = this.messageList.scrollHeight;
    }
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
    if (!text) return;

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
      await API.sendMessage(targetAgentId, text);
      // 清空输入框
      this.chatInput.value = '';
      // 显示成功提示
      const targetName = this.currentAgentId === 'user' ? `给 ${targetAgentId} ` : '';
      Toast.show(`消息${targetName}已发送`, 'success');
    } catch (error) {
      console.error('发送消息失败:', error);
      Toast.show('发送失败: ' + error.message, 'error');
    } finally {
      // 恢复发送按钮
      if (this.sendBtn) {
        this.sendBtn.disabled = false;
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
    const imagesId = `images_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
};

// 导出供其他模块使用
window.ChatPanel = ChatPanel;
