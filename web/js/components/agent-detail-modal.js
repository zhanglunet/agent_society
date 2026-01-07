/**
 * 智能体详情弹窗组件
 * 显示智能体的详细属性、调试信息、统计数据，支持设置自定义名称
 */

const AgentDetailModal = {
  // DOM 元素引用
  overlay: null,
  content: null,
  body: null,
  
  // 当前显示的智能体
  currentAgent: null,

  /**
   * 初始化组件
   */
  init() {
    this.overlay = document.getElementById('agent-detail-modal');
    this.content = this.overlay?.querySelector('.modal-content');
    this.body = document.getElementById('agent-detail-body');

    // 点击遮罩层关闭
    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.hide();
        }
      });
    }

    // 关闭按钮
    const closeBtn = this.overlay?.querySelector('.modal-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }

    // ESC 键关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !this.overlay?.classList.contains('hidden')) {
        this.hide();
      }
    });
  },

  /**
   * 显示智能体详情
   * @param {string} agentId - 智能体 ID
   */
  async show(agentId) {
    // 从 App 获取智能体信息
    const agent = window.App?.agentsById?.get(agentId);
    if (!agent) {
      Toast.show('智能体不存在', 'error');
      return;
    }

    this.currentAgent = agent;
    
    // 获取智能体的统计数据
    const stats = await this.loadAgentStats(agentId);
    
    this.renderContent(agent, stats);
    
    if (this.overlay) {
      this.overlay.classList.remove('hidden');
    }
  },

  /**
   * 隐藏弹窗
   */
  hide() {
    if (this.overlay) {
      this.overlay.classList.add('hidden');
    }
    this.currentAgent = null;
  },

  /**
   * 加载智能体统计数据
   * @param {string} agentId - 智能体 ID
   * @returns {Promise<object>} 统计数据
   */
  async loadAgentStats(agentId) {
    try {
      const res = await API.getAgentMessages(agentId);
      const messages = res.messages || [];
      
      // 计算统计数据
      const sentCount = messages.filter(m => m.from === agentId).length;
      const receivedCount = messages.filter(m => m.to === agentId).length;
      
      // 计算活跃时间范围
      let firstMessageTime = null;
      let lastMessageTime = null;
      if (messages.length > 0) {
        firstMessageTime = messages[0].createdAt;
        lastMessageTime = messages[messages.length - 1].createdAt;
      }
      
      return {
        totalMessages: messages.length,
        sentCount,
        receivedCount,
        firstMessageTime,
        lastMessageTime
      };
    } catch (error) {
      console.error('加载智能体统计数据失败:', error);
      return {
        totalMessages: 0,
        sentCount: 0,
        receivedCount: 0,
        firstMessageTime: null,
        lastMessageTime: null
      };
    }
  },

  /**
   * 渲染弹窗内容
   * @param {object} agent - 智能体对象
   * @param {object} stats - 统计数据
   */
  renderContent(agent, stats) {
    if (!this.body) return;

    const customName = agent.customName || '';
    const displayName = customName || agent.id;

    const html = `
      <!-- 自定义名称设置 -->
      <div class="detail-section">
        <h4 class="section-title">自定义名称</h4>
        <div class="custom-name-form">
          <input type="text" 
                 id="custom-name-input" 
                 class="custom-name-input" 
                 value="${this.escapeHtml(customName)}" 
                 placeholder="输入自定义名称（仅影响显示）">
          <button class="save-name-btn" onclick="AgentDetailModal.saveCustomName()">保存</button>
        </div>
        <div class="hint-text">自定义名称仅用于网页端显示，不影响系统功能</div>
      </div>

      <!-- 基本信息 -->
      <div class="detail-section">
        <h4 class="section-title">基本信息</h4>
        <div class="detail-item">
          <div class="detail-label">智能体 ID</div>
          <div class="detail-value monospace">${this.escapeHtml(agent.id)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">显示名称</div>
          <div class="detail-value">${this.escapeHtml(displayName)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">岗位名称</div>
          <div class="detail-value">${this.escapeHtml(agent.roleName || '未知')}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">岗位 ID</div>
          <div class="detail-value monospace">${this.escapeHtml(agent.roleId || '未知')}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">状态</div>
          <div class="detail-value">
            <span class="status-badge ${agent.status === 'terminated' ? 'terminated' : 'active'}">
              ${agent.status === 'terminated' ? '已终止' : '运行中'}
            </span>
          </div>
        </div>
        <div class="detail-item">
          <div class="detail-label">父智能体</div>
          <div class="detail-value">${this.escapeHtml(agent.parentAgentId || '无')}</div>
        </div>
      </div>

      <!-- 时间信息 -->
      <div class="detail-section">
        <h4 class="section-title">时间信息</h4>
        <div class="detail-item">
          <div class="detail-label">创建时间</div>
          <div class="detail-value">${this.formatTime(agent.createdAt)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">最后活跃</div>
          <div class="detail-value">${this.formatTime(agent.lastActiveAt)}</div>
        </div>
        ${agent.terminatedAt ? `
        <div class="detail-item">
          <div class="detail-label">终止时间</div>
          <div class="detail-value">${this.formatTime(agent.terminatedAt)}</div>
        </div>
        ` : ''}
      </div>

      <!-- 消息统计 -->
      <div class="detail-section">
        <h4 class="section-title">消息统计</h4>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${stats.totalMessages}</div>
            <div class="stat-label">总消息数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.sentCount}</div>
            <div class="stat-label">发送</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${stats.receivedCount}</div>
            <div class="stat-label">接收</div>
          </div>
        </div>
        ${stats.firstMessageTime ? `
        <div class="detail-item">
          <div class="detail-label">首条消息</div>
          <div class="detail-value">${this.formatTime(stats.firstMessageTime)}</div>
        </div>
        ` : ''}
        ${stats.lastMessageTime ? `
        <div class="detail-item">
          <div class="detail-label">最后消息</div>
          <div class="detail-value">${this.formatTime(stats.lastMessageTime)}</div>
        </div>
        ` : ''}
      </div>
    `;

    this.body.innerHTML = html;
  },

  /**
   * 保存自定义名称
   */
  async saveCustomName() {
    if (!this.currentAgent) return;

    const input = document.getElementById('custom-name-input');
    const customName = input?.value?.trim() || '';

    try {
      await API.setAgentCustomName(this.currentAgent.id, customName);
      
      // 更新本地数据
      this.currentAgent.customName = customName;
      if (window.App?.agentsById) {
        const agent = window.App.agentsById.get(this.currentAgent.id);
        if (agent) {
          agent.customName = customName;
        }
      }
      
      // 刷新显示
      AgentList.render();
      ChatPanel.updateHeader();
      
      Toast.show(customName ? '自定义名称已保存' : '自定义名称已清除', 'success');
    } catch (error) {
      console.error('保存自定义名称失败:', error);
      Toast.show('保存失败: ' + error.message, 'error');
    }
  },

  /**
   * 格式化时间
   * @param {string} isoTime - ISO 格式时间
   * @returns {string} 格式化后的时间
   */
  formatTime(isoTime) {
    if (!isoTime) return '未知';
    const date = new Date(isoTime);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
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
};

// 导出供其他模块使用
window.AgentDetailModal = AgentDetailModal;
