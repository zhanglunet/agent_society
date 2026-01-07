/**
 * 岗位详情弹窗组件
 * 显示岗位的详细信息、职责描述、关联智能体列表
 */

const RoleDetailModal = {
  // DOM 元素引用
  overlay: null,
  content: null,
  body: null,
  
  // 当前显示的岗位
  currentRole: null,

  /**
   * 初始化组件
   */
  init() {
    this.overlay = document.getElementById('role-detail-modal');
    this.content = this.overlay?.querySelector('.modal-content');
    this.body = document.getElementById('role-detail-body');

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
   * 通过岗位ID显示详情
   * @param {string} roleId - 岗位 ID
   */
  async showByRoleId(roleId) {
    // 从 App 获取岗位信息
    const role = window.App?.roles?.find(r => r.id === roleId);
    if (!role) {
      Toast.show('岗位不存在', 'error');
      return;
    }
    await this.show(role);
  },

  /**
   * 通过岗位名称显示详情
   * @param {string} roleName - 岗位名称
   */
  async showByRoleName(roleName) {
    const role = window.App?.roles?.find(r => r.name === roleName);
    if (!role) {
      Toast.show('岗位不存在', 'error');
      return;
    }
    await this.show(role);
  },

  /**
   * 显示岗位详情
   * @param {object} role - 岗位对象
   */
  async show(role) {
    this.currentRole = role;
    
    // 获取该岗位下的所有智能体
    const agents = this.getAgentsByRole(role.id);
    
    this.renderContent(role, agents);
    
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
    this.currentRole = null;
  },

  /**
   * 获取指定岗位的所有智能体
   * @param {string} roleId - 岗位 ID
   * @returns {Array} 智能体列表
   */
  getAgentsByRole(roleId) {
    if (!window.App?.agents) return [];
    return window.App.agents.filter(a => a.roleId === roleId);
  },

  /**
   * 渲染弹窗内容
   * @param {object} role - 岗位对象
   * @param {Array} agents - 该岗位下的智能体列表
   */
  renderContent(role, agents) {
    if (!this.body) return;

    const activeAgents = agents.filter(a => a.status !== 'terminated');
    const terminatedAgents = agents.filter(a => a.status === 'terminated');

    const html = `
      <!-- 基本信息 -->
      <div class="detail-section">
        <h4 class="section-title">基本信息</h4>
        <div class="detail-item">
          <div class="detail-label">岗位名称</div>
          <div class="detail-value">${this.escapeHtml(role.name)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">岗位 ID</div>
          <div class="detail-value monospace">${this.escapeHtml(role.id)}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">创建者</div>
          <div class="detail-value">${this.escapeHtml(role.createdBy || '系统')}</div>
        </div>
        <div class="detail-item">
          <div class="detail-label">创建时间</div>
          <div class="detail-value">${this.formatTime(role.createdAt)}</div>
        </div>
      </div>

      <!-- 智能体统计 -->
      <div class="detail-section">
        <h4 class="section-title">智能体统计</h4>
        <div class="stats-grid">
          <div class="stat-item">
            <div class="stat-value">${agents.length}</div>
            <div class="stat-label">总数</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${activeAgents.length}</div>
            <div class="stat-label">运行中</div>
          </div>
          <div class="stat-item">
            <div class="stat-value">${terminatedAgents.length}</div>
            <div class="stat-label">已终止</div>
          </div>
        </div>
      </div>

      <!-- 岗位职责 -->
      <div class="detail-section">
        <h4 class="section-title">岗位职责 (Prompt)</h4>
        <div class="role-prompt-viewer">${this.escapeHtml(role.rolePrompt || '无')}</div>
      </div>

      <!-- 智能体列表 -->
      ${agents.length > 0 ? `
      <div class="detail-section">
        <h4 class="section-title">关联智能体</h4>
        <div class="agent-list-compact">
          ${agents.map(agent => this.renderAgentItem(agent)).join('')}
        </div>
      </div>
      ` : ''}
    `;

    this.body.innerHTML = html;
  },

  /**
   * 渲染智能体列表项
   * @param {object} agent - 智能体对象
   * @returns {string} HTML 字符串
   */
  renderAgentItem(agent) {
    const displayName = agent.customName || agent.id;
    const statusClass = agent.status === 'terminated' ? 'terminated' : 'active';
    const statusText = agent.status === 'terminated' ? '已终止' : '运行中';
    
    return `
      <div class="agent-list-item" onclick="RoleDetailModal.openAgentDetail('${agent.id}')">
        <div class="agent-list-item-info">
          <span class="agent-list-item-name">${this.escapeHtml(displayName)}</span>
          ${agent.customName ? `<span class="agent-list-item-id">${this.escapeHtml(agent.id)}</span>` : ''}
        </div>
        <span class="status-badge ${statusClass}">${statusText}</span>
      </div>
    `;
  },

  /**
   * 打开智能体详情
   * @param {string} agentId - 智能体 ID
   */
  openAgentDetail(agentId) {
    this.hide();
    if (window.AgentDetailModal) {
      window.AgentDetailModal.show(agentId);
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
window.RoleDetailModal = RoleDetailModal;
